/**
 * Real ground under the 3D playback, as plain data: the box, the tiles to
 * fetch, the height mosaic, and a mesh (positions, texture coordinates,
 * hillshade colours, triangle indices) in the playback's local frame, plus
 * `heightAt` over the very triangles drawn. Pure: no three.js, no DOM, so
 * geo-check tests every rule here under node. Fetching, caching and PNG
 * decoding happen in the desktop app (Rust); the scene wraps the arrays in a
 * BufferGeometry and the drape canvas in a texture.
 *
 * The frame is the playback library's own (azimuthal equidistant about the
 * lead's target, on the planner's sphere): every vertex goes through the same
 * `fromLocal` the jets do, so a hill sits under the jet exactly where the
 * planner puts it.
 *
 * Heights use the library's datum, not sea level: shown height = real height
 * − real height at the lead's target, with every decoded pixel first levelled
 * at sea level (0 m). Where one of the strike's targets stands in one of the
 * few known stretches of dry land below sea level (`DRY_DEPRESSIONS`), that
 * stretch, and low ground joined to it, is levelled lower instead. So the
 * ground at the target is at 0, where the bomb lands, the sea is flat instead
 * of a trench, and a target in such a depression keeps the ridges round it at
 * their real height above it.
 *
 * Map tiles: the planner's own OpenStreetMap tiles, in colour. Elevation:
 * Terrarium tiles (Terrain Tiles on AWS Open Data). Both are Web Mercator,
 * used only as a lookup from lat/lon into a tile image; each mesh vertex
 * gets its own texture coordinate and height from its own lat/lon, so the
 * map is never laid flat at one scale (which would drift by hundreds of
 * metres at the box edge at high latitude).
 */

import { chooseZoom, lonLatToTile, TILE_SIZE, type TileKey } from '../kneeboardBasemap';
import { fromLocalInto, NM_TO_M, type LocalFrame } from '../playback';
import type { EnuBox } from './cameraMath';

// ─── The box ──────────────────────────────────────────────────────────────────

/** Ground beyond the farthest point the jets reach, so they never fly off the edge. */
export const BOX_MARGIN_M = 5 * NM_TO_M;
/** The box always reaches at least this far round the target. */
export const BOX_MIN_HALF_M = 12 * NM_TO_M;
/** And never farther (past it the jets fly over the plain skirt round the terrain). */
export const BOX_MAX_HALF_M = 60 * NM_TO_M;
/** Edges are rounded outwards to a multiple of this, so a small change to the plan reuses the same tiles. */
export const BOX_STEP_M = 2.5 * NM_TO_M;

/** The terrain's extent in local metres east (e) and north (n) of the lead's target. */
export interface TerrainBox {
  west_m: number;
  east_m: number;
  south_m: number;
  north_m: number;
}

const finiteOr0 = (v: number) => (Number.isFinite(v) ? v : 0);
const floorTo = (v: number, step: number) => Math.floor(v / step) * step;
const ceilTo = (v: number, step: number) => Math.ceil(v / step) * step;

/**
 * The terrain box from the playback's bounds (which already hold every jet's
 * whole 20 nm lead-in, its bomb and the formation slots, at any delay, so the
 * box never moves while a delay is dragged): the target included, plus the
 * margin, at least the minimum, rounded outwards to the step, capped. The
 * minimum is applied before the rounding, so every edge is a whole number of
 * steps (the target and every edge then fall on mesh vertices).
 */
export function terrainBoxOf(bounds: EnuBox): TerrainBox {
  const minE = Math.min(0, finiteOr0(bounds.min_e_m)), maxE = Math.max(0, finiteOr0(bounds.max_e_m));
  const minN = Math.min(0, finiteOr0(bounds.min_n_m)), maxN = Math.max(0, finiteOr0(bounds.max_n_m));
  return {
    west_m: Math.max(-BOX_MAX_HALF_M, floorTo(Math.min(-BOX_MIN_HALF_M, minE - BOX_MARGIN_M), BOX_STEP_M)),
    east_m: Math.min(BOX_MAX_HALF_M, ceilTo(Math.max(BOX_MIN_HALF_M, maxE + BOX_MARGIN_M), BOX_STEP_M)),
    south_m: Math.max(-BOX_MAX_HALF_M, floorTo(Math.min(-BOX_MIN_HALF_M, minN - BOX_MARGIN_M), BOX_STEP_M)),
    north_m: Math.min(BOX_MAX_HALF_M, ceilTo(Math.max(BOX_MIN_HALF_M, maxN + BOX_MARGIN_M), BOX_STEP_M)),
  };
}

// ─── The mesh grid ────────────────────────────────────────────────────────────

/** At most this many cells: about 263k vertices, one draw call, trivial for any desktop GPU of the last ten years. */
export const MAX_SEGMENTS = 512 * 512;
/** No finer than the elevation data fetched. */
export const MIN_SPACING_M = 75;

/** A regular grid over the box. Vertex (i, j) is at e = west + i·dx, n = north − j·dy: row 0 is the north edge, i runs east. */
export interface TerrainGrid {
  box: TerrainBox;
  segX: number;
  segY: number;
  dx_m: number;
  dy_m: number;
}

/**
 * The grid for a box. The spacing is the finer of the area cap and 75 m,
 * then widened to the nearest whole fraction of the 2.5 nm step, so the
 * vertices fall on every step line: the target (0, 0) is a vertex, and the
 * ground drawn there is exactly the height sampled there. Widening (never
 * narrowing) keeps the cell count under the cap.
 */
export function terrainGridOf(box: TerrainBox): TerrainGrid {
  const W = box.east_m - box.west_m, H = box.north_m - box.south_m;
  const s0 = Math.max(MIN_SPACING_M, Math.sqrt((W * H) / MAX_SEGMENTS));
  const k = Math.max(1, Math.floor(BOX_STEP_M / s0));
  const d = BOX_STEP_M / k;
  return { box, segX: Math.max(1, Math.round(W / d)), segY: Math.max(1, Math.round(H / d)), dx_m: d, dy_m: d };
}

// ─── Tiles ────────────────────────────────────────────────────────────────────

/**
 * A block of tiles at one zoom: x0…x0+nx−1 by y0…y0+ny−1. A block with no
 * tiles in it (nx or ny of 0) is how a plan says "none": nothing to ask for.
 */
export interface TileRange {
  z: number;
  x0: number;
  y0: number;
  nx: number;
  ny: number;
}

/** Whether a block holds any tiles at all. */
export const hasTiles = (r: TileRange): boolean => r.nx > 0 && r.ny > 0;

/** Points per box edge run through the projection when finding the tiles. */
export const PERIMETER_POINTS = 33;
/** Pixels of padding round the box, so bilinear sampling at the edge always has neighbours. */
export const TILE_PAD_PX = 2;

/**
 * Calls `visit` with the latitude and longitude of points along the box's four
 * edges. The edges are sampled along their length, not only at the corners: a
 * straight edge in local metres bulges poleward in latitude at its middle
 * (1.35 km at ±45 nm near 68 N, a whole row of tiles), and the corners alone
 * would miss it. Interior points land inside the perimeter's span, because the
 * projection is continuous.
 */
function forEachPerimeterPoint(box: TerrainBox, frame: LocalFrame, visit: (lat: number, lon: number) => void): void {
  const ll = { lat: 0, lon: 0 };
  const add = (e: number, n: number) => {
    fromLocalInto(frame, e, n, ll);
    visit(ll.lat, ll.lon);
  };
  const last = PERIMETER_POINTS - 1;
  for (let k = 0; k <= last; k++) {
    const u = k / last;
    const e = box.west_m + (box.east_m - box.west_m) * u;
    const n = box.south_m + (box.north_m - box.south_m) * u;
    add(e, box.north_m);
    add(e, box.south_m);
    add(box.west_m, n);
    add(box.east_m, n);
  }
}

/** Web Mercator tiles end here: the top and bottom rows stop at this latitude, and the poles are not on the map. */
export const MAX_TILE_LAT = 85.0511287798;

/** Whether any point of the box's edges lies poleward of the tiles (or has no latitude at all, which a broken plan can give). */
export function boxBeyondTiles(box: TerrainBox, frame: LocalFrame): boolean {
  let beyond = false;
  forEachPerimeterPoint(box, frame, (lat) => { if (!(Math.abs(lat) <= MAX_TILE_LAT)) beyond = true; });
  return beyond;
}

/**
 * The tiles under the box at zoom z, its edges sampled by `forEachPerimeterPoint`.
 * Padded by two pixels, floored to whole tiles.
 */
export function tileSpan(box: TerrainBox, frame: LocalFrame, z: number): TileRange {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  forEachPerimeterPoint(box, frame, (lat, lon) => {
    const f = lonLatToTile(lat, lon, z);
    if (f.x < minX) minX = f.x;
    if (f.x > maxX) maxX = f.x;
    if (f.y < minY) minY = f.y;
    if (f.y > maxY) maxY = f.y;
  });
  const pad = TILE_PAD_PX / TILE_SIZE;
  const maxIndex = 2 ** z - 1;
  const clampT = (v: number) => Math.min(maxIndex, Math.max(0, v));
  const x0 = clampT(Math.floor(minX - pad)), x1 = clampT(Math.floor(maxX + pad));
  const y0 = clampT(Math.floor(minY - pad)), y1 = clampT(Math.floor(maxY + pad));
  return { z, x0, y0, nx: x1 - x0 + 1, ny: y1 - y0 + 1 };
}

/** The finest drape zoom: past it the extra detail is wasted at these camera distances. */
export const MAX_DRAPE_ZOOM = 13;
export const MIN_DRAPE_ZOOM = 3;
/** Stays under the OpenStreetMap tile policy's 250-tile figure for one area. */
export const MAX_DRAPE_TILES = 200;
/** The drape is one canvas, at most this many pixels a side (64 MB of RGBA at 4096²). */
export const MAX_DRAPE_PX = 4096;

/**
 * The drape's zoom and tiles: the finest zoom whose mosaic fits one texture
 * (at most 16 tiles a side, fewer if the GPU's texture limit is smaller) and
 * 200 tiles in all. Undefined when even the coarsest zoom does not fit.
 */
export function planDrape(box: TerrainBox, frame: LocalFrame, maxTextureSize = MAX_DRAPE_PX): TileRange | undefined {
  const maxSide = Math.min(MAX_DRAPE_PX / TILE_SIZE, Math.floor(Math.min(maxTextureSize, MAX_DRAPE_PX) / TILE_SIZE));
  for (let z = MAX_DRAPE_ZOOM; z >= MIN_DRAPE_ZOOM; z--) {
    const s = tileSpan(box, frame, z);
    if (s.nx <= maxSide && s.ny <= maxSide && s.nx * s.ny <= MAX_DRAPE_TILES) return s;
  }
  return undefined;
}

export const MIN_ELEVATION_ZOOM = 8;
export const MAX_ELEVATION_ZOOM = 12;
/** A sanity cap on the height mosaic (16 MB per 64 tiles); normal boxes need 9-25. */
export const MAX_ELEVATION_TILES = 64;

/** What a plan asks for when no elevation can be had: a block with no tiles in it. */
const NO_ELEVATION: TileRange = { z: MIN_ELEVATION_ZOOM, x0: 0, y0: 0, nx: 0, ny: 0 };

/**
 * The elevation zoom: the lowest whose pixels are no larger than the mesh
 * spacing at the target's latitude (the kneeboard's own `chooseZoom` rule,
 * with cos(lat) in it, so Kola does not fetch four times the tiles), kept to
 * zoom 8-12 and stepped down if the block would be absurdly large.
 *
 * Where the count cannot be brought under the cap even at zoom 8, or the box
 * reaches poleward of the tiles' own latitude, the answer is no tiles at all
 * (`hasTiles` is false) and the scene stays flat: past the cap the mosaic
 * would cost tens of megabytes of memory, and past the tiles' edge the rows
 * clamp to the map's top or bottom row, so the heights fetched would belong to
 * other ground. No DCS map goes near either; a damaged shared file can.
 */
export function planElevation(grid: TerrainGrid, frame: LocalFrame): TileRange {
  if (boxBeyondTiles(grid.box, frame)) return NO_ELEVATION;
  let z = Math.min(MAX_ELEVATION_ZOOM, Math.max(MIN_ELEVATION_ZOOM, chooseZoom(NM_TO_M / grid.dx_m, frame.origin.lat)));
  let s = tileSpan(grid.box, frame, z);
  while (s.nx * s.ny > MAX_ELEVATION_TILES && z > MIN_ELEVATION_ZOOM) s = tileSpan(grid.box, frame, --z);
  return s.nx * s.ny > MAX_ELEVATION_TILES ? NO_ELEVATION : s;
}

/** A point on the ground in the playback's local metres: east (e) and north (n) of the lead's target. */
export interface GroundPoint {
  e_m: number;
  n_m: number;
}

export interface TerrainPlan {
  frame: LocalFrame;
  grid: TerrainGrid;
  /** A block with no tiles (`hasTiles` false) when no elevation can be had: the ground then stays flat. */
  elevation: TileRange;
  /** Undefined when no drape fits (then the ground is plain land colour). */
  drape: TileRange | undefined;
  /**
   * The strike's targets. The frame's origin (the lead's target) is always counted, so one standing on
   * it changes nothing. Where the heights are levelled, the ground at each of them is read (see
   * `groundFloor`). Left out, the lead's target alone sets the level.
   */
  targets?: readonly GroundPoint[];
}

/** Everything about the terrain that follows from the playback's bounds alone: box, grid, and both tile blocks. */
export function planTerrain(bounds: EnuBox, frame: LocalFrame, maxTextureSize = MAX_DRAPE_PX, targets: readonly GroundPoint[] = []): TerrainPlan {
  const grid = terrainGridOf(terrainBoxOf(bounds));
  return { frame, grid, elevation: planElevation(grid, frame), drape: planDrape(grid.box, frame, maxTextureSize), targets };
}

/** What the scene's plan is made from: the playback's bounds and frame, and its distinct targets (the lead's first) in three.js axes. */
export interface TerrainSourceLike {
  readonly bounds: EnuBox;
  readonly frame: LocalFrame;
  readonly targets: readonly { readonly x: number; readonly z: number }[];
}

/**
 * The plan for a scene source. Every target goes in as a ground point, so a wingman's target in a
 * depression lowers the level just as the lead's would: left out, a strike whose second target stands in
 * the Jordan valley would draw that valley flat at sea level. The first is not skipped: the frame's origin
 * is the first planned jet's target, but a jet the playback cannot fly (a stand-off shot, say) has no
 * target in the scene, so the first scene target may be another jet's, away from the origin. One that does
 * stand on the origin costs a second read of the same point. The targets come in three.js axes (x east,
 * z = −north), the plan wants east and north.
 */
export function planSceneTerrain(source: TerrainSourceLike, maxTextureSize = MAX_DRAPE_PX): TerrainPlan {
  const points: GroundPoint[] = [];
  for (let i = 0; i < source.targets.length; i++) points.push({ e_m: source.targets[i].x, n_m: -source.targets[i].z });
  return planTerrain(source.bounds, source.frame, maxTextureSize, points);
}

/** A block's tiles in mosaic order (row by row from the north-west): the order `heightMosaic` expects them in. */
export function tilesOf(r: TileRange): TileKey[] {
  const out: TileKey[] = [];
  for (let y = 0; y < r.ny; y++) for (let x = 0; x < r.nx; x++) out.push({ x: r.x0 + x, y: r.y0 + y, z: r.z });
  return out;
}

/** The same tiles, nearest the target first, so the area being looked at fills in first. */
export function tilesNearestFirst(r: TileRange, frame: LocalFrame): TileKey[] {
  const o = lonLatToTile(frame.origin.lat, frame.origin.lon, r.z);
  const d = (t: TileKey) => (t.x + 0.5 - o.x) ** 2 + (t.y + 0.5 - o.y) ** 2;
  return tilesOf(r).sort((a, b) => d(a) - d(b));
}

// ─── Where tiles come from ────────────────────────────────────────────────────

/** Terrain tiles are 256×256 heights, metres, row by row from the north-west corner, as decoded (not clamped). */
export const TERRAIN_TILE_PX = TILE_SIZE;

/**
 * Why a tile did not arrive, in the two words the desktop's tile commands
 * use: 'missing' (the server has no such tile: 403 or 404) and 'offline'
 * (no network, a timeout, or no cached copy to fall back on).
 */
export type TileError = 'missing' | 'offline';

/**
 * Where the scene gets its tiles. The desktop passes one built on its tile
 * commands, the dev harness a synthetic one (a known hill, a two-colour
 * map). `Img` is whatever the drape draws (an ImageBitmap in the app), so
 * this file stays free of DOM types. Either call rejects with a TileError
 * word (anything else is read as 'offline': see `tileErrorOf`).
 */
export interface TileSource<Img> {
  mapTile(z: number, x: number, y: number): Promise<Img>;
  /** TERRAIN_TILE_PX² metres. */
  terrainTile(z: number, x: number, y: number): Promise<Float32Array>;
}

/** A rejection from a TileSource as one of the two words: 'missing' only when it says so. */
export function tileErrorOf(e: unknown): TileError {
  const word = typeof e === 'string' ? e : e instanceof Error ? e.message : '';
  return word === 'missing' ? 'missing' : 'offline';
}

// ─── Heights ──────────────────────────────────────────────────────────────────

/**
 * Heights below `floor_m` are drawn at it. Terrarium carries sea-bed depths,
 * not "no data", so the floor is sea level (0 by default): a coast runs down
 * to the water and the water is flat. The floor goes lower only on a known
 * stretch of dry land below sea level where a target stands, and on low
 * ground joined to it (`groundFloor`, `lowGround`), because there is no way to
 * tell a depression on land from the sea bed per pixel: the tiles carry no
 * land mask, only heights, and both are simply negative numbers. A mask from
 * another source would be one more download, one more credit and one more
 * thing that can disagree with the heights, for ground that matters only
 * round a target.
 */
export function seaClamp(h: number, floor_m = 0): number {
  return h < floor_m ? floor_m : h;
}

/** Decoded heights outside this range mean a broken tile: treat it as missing. */
export const HEIGHT_VALID_MIN_M = -11000;
export const HEIGHT_VALID_MAX_M = 9000;

export function terrainTileValid(t: Float32Array): boolean {
  if (t.length !== TERRAIN_TILE_PX * TERRAIN_TILE_PX) return false;
  for (let i = 0; i < t.length; i++) {
    const h = t[i];
    if (!(h >= HEIGHT_VALID_MIN_M && h <= HEIGHT_VALID_MAX_M)) return false; // NaN fails too
  }
  return true;
}

/**
 * One height grid over a whole tile block, as decoded (not levelled: the level
 * depends on the strike's targets, which the loader does not know): w × h
 * pixels, row by row from the north-west.
 */
export interface HeightMosaic {
  range: TileRange;
  w: number;
  h: number;
  data: Float32Array;
}

/**
 * The block's tiles stitched into one grid before anything is sampled, so a
 * sample near a tile edge reads straight across into the neighbour: there
 * is no seam to stitch. All or nothing: a missing or broken tile gives
 * undefined (the scene stays flat), because patching one hole would draw
 * false cliffs round it, and a false cliff is worse than flat ground.
 * `tiles` in `tilesOf` order; a missing one as undefined. A block with no
 * tiles in it (`hasTiles` false) gives undefined too: there is nothing to draw.
 */
export function heightMosaic(range: TileRange, tiles: readonly (Float32Array | undefined)[]): HeightMosaic | undefined {
  if (!hasTiles(range) || tiles.length !== range.nx * range.ny) return undefined;
  const P = TERRAIN_TILE_PX, w = range.nx * P, h = range.ny * P;
  const data = new Float32Array(w * h);
  for (let ty = 0; ty < range.ny; ty++) {
    for (let tx = 0; tx < range.nx; tx++) {
      const t = tiles[ty * range.nx + tx];
      if (!t || !terrainTileValid(t)) return undefined;
      for (let j = 0; j < P; j++) {
        const row = (ty * P + j) * w + tx * P;
        for (let i = 0; i < P; i++) data[row + i] = t[j * P + i];
      }
    }
  }
  return { range, w, h, data };
}

/**
 * Bilinear sampling with pixel (i, j) holding the height at its CENTRE,
 * (i + 0.5, j + 0.5). Getting that wrong shifts the terrain half a pixel
 * (60 m at zoom 10). Clamped at the edges: never NaN. Each of the four pixels
 * is first levelled at `floor_m` (none by default), before the blend, so a
 * coast does not blend land into a trench.
 */
export function sampleBilinear(grid: ArrayLike<number>, w: number, h: number, px: number, py: number, floor_m = -Infinity): number {
  const u = Math.min(w - 1, Math.max(0, px - 0.5));
  const v = Math.min(h - 1, Math.max(0, py - 0.5));
  const i = Math.min(w - 2, Math.floor(u)), j = Math.min(h - 2, Math.floor(v));
  const fx = u - i, fy = v - j;
  const a = seaClamp(grid[j * w + i], floor_m), b = seaClamp(grid[j * w + i + 1], floor_m);
  const c = seaClamp(grid[(j + 1) * w + i], floor_m), d = seaClamp(grid[(j + 1) * w + i + 1], floor_m);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** The mosaic's height at a lat/lon: real metres, nothing below `floor_m` (pass -Infinity for the height as decoded), not yet shifted. */
export function mosaicHeightAt(m: HeightMosaic, lat: number, lon: number, floor_m: number): number {
  const f = lonLatToTile(lat, lon, m.range.z);
  return sampleBilinear(m.data, m.w, m.h, (f.x - m.range.x0) * TERRAIN_TILE_PX, (f.y - m.range.y0) * TERRAIN_TILE_PX, floor_m);
}

/** A block of latitude and longitude, degrees. */
export interface GeoBox {
  south_deg: number;
  north_deg: number;
  west_deg: number;
  east_deg: number;
}

/**
 * Stretches of DRY land below sea level that a DCS map holds. Each box has no
 * sea and no coast inside it: the Mediterranean shore by the rift is west of
 * 35.1°E, and the Gulf of Aqaba is south of 29.6°N. The tiles cannot say land
 * from sea bed (see `seaClamp`), so a target is taken to stand in a
 * depression only if it is inside one of these, and ground is drawn below sea
 * level only inside one or joined to one by low ground (`lowGround`). Without
 * that, a ship over a deep sea bed, or a target on a steep shore whose read
 * height blends in sea-bed pixels, would lower the level to the sea's depth
 * and draw the land beside it a whole depth too high, and a sea in the same
 * picture as a valley target would be drawn as its bed. A depression missing
 * from this list costs only its relief (the ground is drawn flat at sea
 * level, as before): it can never draw a wrong picture. The boxes need not
 * hold the whole depression: its floor is followed out past a box's edge.
 */
export const DRY_DEPRESSIONS: readonly (GeoBox & { name: string })[] = [
  // The Sea of Galilee (about 210 m below sea level), the Jordan valley, the Dead Sea (about 430 m) and the Arabah south of it.
  { name: 'Jordan rift and the Dead Sea', south_deg: 30.5, north_deg: 32.9, west_deg: 35.15, east_deg: 36.0 },
  // Badwater, the Furnace Creek basin and the salt flats south of it (the lowest point is about 86 m below sea level).
  { name: 'Death Valley', south_deg: 35.5, north_deg: 37.0, west_deg: -117.3, east_deg: -116.3 },
];

/** Whether a point lies in one of the known stretches of dry land below sea level. */
export function inDryDepression(lat: number, lon: number): boolean {
  for (const d of DRY_DEPRESSIONS) {
    if (lat >= d.south_deg && lat <= d.north_deg && lon >= d.west_deg && lon <= d.east_deg) return true;
  }
  return false;
}

/**
 * The lowest level any ground is drawn at, real metres: 0 (sea level), or
 * lower where the lead's target (at the frame's origin) or any of the others
 * stands in a known stretch of dry land below sea level (`DRY_DEPRESSIONS`):
 * then the lowest height as decoded at such a target. That target sits at its
 * real height with the ridges round it at theirs, and valley floor deeper
 * than it is still drawn flat. The lower level holds only on the depression's
 * own ground (`lowGround`); a sea elsewhere in the picture stays at 0. Every
 * other target, whatever its height reads (a ship over a deep sea bed, a
 * shore), leaves the level at 0, as before. A target whose height cannot be
 * read is not counted.
 */
export function groundFloor(mosaic: HeightMosaic, frame: LocalFrame, targets: readonly GroundPoint[] = []): number {
  const asDecoded = -Infinity;
  let floor = 0;
  const count = (lat: number, lon: number) => {
    if (!inDryDepression(lat, lon)) return;
    const h = mosaicHeightAt(mosaic, lat, lon, asDecoded);
    if (h < floor) floor = h; // a NaN is never lower
  };
  count(frame.origin.lat, frame.origin.lon);
  const ll = { lat: 0, lon: 0 };
  for (const t of targets) {
    fromLocalInto(frame, t.e_m, t.n_m, ll);
    count(ll.lat, ll.lon);
  }
  return floor;
}

// ─── The mesh ─────────────────────────────────────────────────────────────────

const vertexCount = (g: TerrainGrid) => (g.segX + 1) * (g.segY + 1);

/** Every vertex's lat/lon (interleaved), through the playback's own frame. Computed once per plan. */
export function gridLatLon(grid: TerrainGrid, frame: LocalFrame): Float64Array {
  const out = new Float64Array(vertexCount(grid) * 2);
  const ll = { lat: 0, lon: 0 };
  let v = 0;
  for (let j = 0; j <= grid.segY; j++) {
    const n = grid.box.north_m - j * grid.dy_m;
    for (let i = 0; i <= grid.segX; i++) {
      fromLocalInto(frame, grid.box.west_m + i * grid.dx_m, n, ll);
      out[v++] = ll.lat;
      out[v++] = ll.lon;
    }
  }
  return out;
}

/**
 * Two triangles per cell, [a, c, b] and [b, c, d] with a = (i, j), b = (i+1, j),
 * c = (i, j+1), d = (i+1, j+1): in three.js axes both face up (+y), the order
 * PlaneGeometry gives after rotateX(−π/2). The diagonal is b–c.
 */
export function gridIndices(segX: number, segY: number): Uint32Array {
  const out = new Uint32Array(segX * segY * 6);
  const row = segX + 1;
  let k = 0;
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      out[k++] = a; out[k++] = c; out[k++] = b;
      out[k++] = b; out[k++] = c; out[k++] = d;
    }
  }
  return out;
}

/** Vertex positions in three.js axes (x = east, y = up, z = −north); flat at y = 0 (the target's planned elevation) without heights. */
export function gridPositions(grid: TerrainGrid, up?: ArrayLike<number>): Float32Array {
  const out = new Float32Array(vertexCount(grid) * 3);
  let v = 0, p = 0;
  for (let j = 0; j <= grid.segY; j++) {
    const n = grid.box.north_m - j * grid.dy_m;
    for (let i = 0; i <= grid.segX; i++) {
      out[p++] = grid.box.west_m + i * grid.dx_m;
      out[p++] = up ? up[v] : 0;
      out[p++] = -n;
      v++;
    }
  }
  return out;
}

/**
 * Texture coordinates into the drape canvas (the block's tiles drawn at
 * native size, (X − x0)·256, (Y − y0)·256), one per vertex from its own
 * lat/lon. For a texture with flipY = true, three.js's default for a canvas.
 */
export function drapeUvs(latlon: Float64Array, drape: TileRange): Float32Array {
  const nv = latlon.length / 2;
  const out = new Float32Array(nv * 2);
  for (let v = 0; v < nv; v++) {
    const f = lonLatToTile(latlon[2 * v], latlon[2 * v + 1], drape.z);
    out[2 * v] = (f.x - drape.x0) / drape.nx;
    out[2 * v + 1] = 1 - (f.y - drape.y0) / drape.ny;
  }
  return out;
}

/**
 * Which vertices may be drawn below sea level once a target in a depression
 * has lowered the level (1 for those): every vertex inside a `DRY_DEPRESSIONS`
 * box, and every vertex joined to ground below sea level inside one, stepping
 * from a vertex only to the four beside it and only where the height as
 * decoded is below 0. The tiles cannot say land from sea bed, so this is what
 * keeps a sea flat beside a valley target: no land below sea level joins the
 * sea to the depression, so the stepping never reaches it. Stepping out past a
 * box's edge follows a valley floor that runs on beyond the box, so no false
 * wall stands along the edge. Worked once, when the heights are built.
 */
export function lowGround(grid: TerrainGrid, latlon: Float64Array, mosaic: HeightMosaic): Uint8Array {
  const { segX, segY } = grid, row = segX + 1, nv = vertexCount(grid);
  const low = new Uint8Array(nv);
  const open = new Uint8Array(nv); // outside every box, below sea level as decoded, not yet reached
  const queue = new Int32Array(nv);
  let head = 0, tail = 0;
  for (let v = 0; v < nv; v++) {
    const lat = latlon[2 * v], lon = latlon[2 * v + 1];
    const under = mosaicHeightAt(mosaic, lat, lon, -Infinity) < 0; // a NaN is never under
    if (inDryDepression(lat, lon)) {
      low[v] = 1;
      if (under) queue[tail++] = v;
    } else if (under) open[v] = 1;
  }
  const reach = (u: number) => {
    if (!open[u]) return;
    open[u] = 0;
    low[u] = 1;
    queue[tail++] = u;
  };
  while (head < tail) {
    const v = queue[head++], i = v % row;
    if (i > 0) reach(v - 1);
    if (i < segX) reach(v + 1);
    if (v >= row) reach(v - row);
    if (v < segY * row) reach(v + row);
  }
  return low;
}

/**
 * The shown height at every vertex, m, on the playback's datum: the
 * mosaic's height there, levelled, minus the levelled height at the lead's
 * target, so the target is at 0. `shift_m` is that constant (minus the
 * levelled real height at the target). Float64, for `heightAt`; the GPU gets
 * float32 copies.
 *
 * At a level of 0 (or with no grid given) every vertex is levelled at
 * `floor_m`, exactly as it always was. Below 0 (a target in a depression, see
 * `groundFloor`) only the depression's own ground (`lowGround`) is levelled at
 * `floor_m` and every other vertex at 0, so a sea in the same picture stays
 * flat instead of showing its bed. The lead's target is levelled like the
 * ground it stands on: at `floor_m` if it is inside a box or its vertex is
 * low ground, else at 0 (a lead's target at sea, a wingman's in the valley).
 * A vertex beside low ground that is not low itself (a rim, a shore) is
 * levelled at 0 pixel by pixel like any coast, so where the pixels its height
 * is blended from take in some below sea level it stands above its decoded
 * height, one vertex wide, as at any shore.
 */
export function vertexHeights(latlon: Float64Array, frame: LocalFrame, mosaic: HeightMosaic, floor_m: number, grid?: TerrainGrid): { up: Float64Array; shift_m: number } {
  if (!(floor_m < 0) || !grid) {
    const shift_m = -mosaicHeightAt(mosaic, frame.origin.lat, frame.origin.lon, floor_m);
    const nv = latlon.length / 2;
    const up = new Float64Array(nv);
    for (let v = 0; v < nv; v++) up[v] = mosaicHeightAt(mosaic, latlon[2 * v], latlon[2 * v + 1], floor_m) + shift_m;
    return { up, shift_m };
  }
  const low = lowGround(grid, latlon, mosaic);
  // The box's edges are whole steps from the origin and a step is a whole number of cells, so the origin
  // is a vertex: levelling the target as that vertex is levelled puts the mesh there at exactly 0.
  const i0 = Math.min(grid.segX, Math.max(0, Math.round(-grid.box.west_m / grid.dx_m)));
  const j0 = Math.min(grid.segY, Math.max(0, Math.round(grid.box.north_m / grid.dy_m)));
  const targetLow = inDryDepression(frame.origin.lat, frame.origin.lon) || low[j0 * (grid.segX + 1) + i0] === 1;
  const shift_m = -mosaicHeightAt(mosaic, frame.origin.lat, frame.origin.lon, targetLow ? floor_m : 0);
  const nv = latlon.length / 2;
  const up = new Float64Array(nv);
  for (let v = 0; v < nv; v++) up[v] = mosaicHeightAt(mosaic, latlon[2 * v], latlon[2 * v + 1], low[v] ? floor_m : 0) + shift_m;
  return { up, shift_m };
}

/** The sun for the hillshade, ENU unit vector: north-west (azimuth 315°), 45° up, the map-makers' convention, so hills look raised and not sunken. */
export const SUN_ENU: readonly [number, number, number] = [-0.5, 0.5, Math.SQRT1_2];
/** Slopes are steepened this much for the shade only (positions stay at true scale). */
export const SHADE_EXAGGERATION = 1.5;
export const SHADE_GAIN = 0.9;
export const SHADE_MIN = 0.65;
export const SHADE_MAX = 1.12;

/**
 * The shade for a slope (∂h/∂east, ∂h/∂north): exactly 1 on flat ground, so
 * flat map is the tile's own colour; brighter facing the sun, darker away.
 * A multiplier on the map colour (vertex colours), never a light.
 * With the 1.5 exaggeration, a 20° slope is 1.23 facing the sun and 0.62
 * away, so both clamp (1.12, 0.65): every slope steeper than about 8° toward
 * the sun, or about 18° away, comes out the same. Tune at the look-and-feel
 * gate if the hills read flat.
 */
export function shadeFromSlope(dhde: number, dhdn: number, clamp = true): number {
  const k = SHADE_EXAGGERATION;
  const nx = -k * dhde, ny = -k * dhdn, len = Math.hypot(nx, ny, 1);
  const dot = (nx * SUN_ENU[0] + ny * SUN_ENU[1] + SUN_ENU[2]) / len;
  const s = 1 + SHADE_GAIN * (dot - SUN_ENU[2]);
  return clamp ? Math.min(SHADE_MAX, Math.max(SHADE_MIN, s)) : s;
}

/** The shade at every vertex, from central differences of the shown heights (one-sided at the edges). Row j runs SOUTH. */
export function hillshade(up: ArrayLike<number>, grid: TerrainGrid): Float32Array {
  const { segX, segY, dx_m, dy_m } = grid, row = segX + 1;
  const out = new Float32Array(vertexCount(grid));
  for (let j = 0; j <= segY; j++) {
    for (let i = 0; i <= segX; i++) {
      const iW = i > 0 ? i - 1 : i, iE = i < segX ? i + 1 : i;
      const jN = j > 0 ? j - 1 : j, jS = j < segY ? j + 1 : j;
      const dhde = (up[j * row + iE] - up[j * row + iW]) / ((iE - iW) * dx_m);
      const dhdn = (up[jN * row + i] - up[jS * row + i]) / ((jS - jN) * dy_m);
      out[j * row + i] = shadeFromSlope(dhde, dhdn);
    }
  }
  return out;
}

/** Shade factors as RGB vertex colours (grey, a linear multiplier on the map). */
export function shadeColors(shade: ArrayLike<number>): Float32Array {
  const out = new Float32Array(shade.length * 3);
  for (let v = 0; v < shade.length; v++) out[3 * v] = out[3 * v + 1] = out[3 * v + 2] = shade[v];
  return out;
}

export interface TerrainMesh {
  grid: TerrainGrid;
  index: Uint32Array;
  /** y = 0 everywhere: the Flat ground, and the first thing drawn while heights load. */
  positionsFlat: Float32Array;
  /** Plain white (shade 1): flat map, the tile's own colours. */
  colorsFlat: Float32Array;
  /** Undefined without heights (offline, a missing tile): then the ground stays flat. */
  positionsReal: Float32Array | undefined;
  colorsReal: Float32Array | undefined;
  /** The shown height per vertex (float64, what `heightAt` reads). */
  up: Float64Array | undefined;
  /** Minus the levelled real height at the lead's target, m (0 without heights). */
  shift_m: number;
  /**
   * The lowest real height any ground is drawn at, m: 0, or lower for a strike with a target in a depression, and then
   * only on that depression's own ground (0 without heights).
   */
  floor_m: number;
  /** Undefined without a drape plan. */
  uvs: Float32Array | undefined;
}

/**
 * The whole mesh for a plan. Without a mosaic it is the flat mesh only; the
 * same grid and index serve both, so the scene swaps the position and colour
 * buffers in place when heights arrive or the user flips Real / Flat.
 */
export function buildTerrainMesh(plan: TerrainPlan, mosaic: HeightMosaic | undefined, latlon = gridLatLon(plan.grid, plan.frame)): TerrainMesh {
  const { grid } = plan;
  const nv = vertexCount(grid);
  const floor_m = mosaic ? groundFloor(mosaic, plan.frame, plan.targets) : 0;
  const heights = mosaic ? vertexHeights(latlon, plan.frame, mosaic, floor_m, grid) : undefined;
  return {
    grid,
    index: gridIndices(grid.segX, grid.segY),
    positionsFlat: gridPositions(grid),
    colorsFlat: new Float32Array(nv * 3).fill(1),
    positionsReal: heights ? gridPositions(grid, heights.up) : undefined,
    colorsReal: heights ? shadeColors(hillshade(heights.up, grid)) : undefined,
    up: heights?.up,
    shift_m: heights?.shift_m ?? 0,
    floor_m,
    uvs: plan.drape ? drapeUvs(latlon, plan.drape) : undefined,
  };
}

/**
 * A per-vertex value at (e, n), interpolated over the two triangles the GPU
 * draws in that cell (diagonal b–c), not bilinearly: what is tested is what
 * is on screen. Outside the box, the nearest edge.
 */
export function onTriangles(grid: TerrainGrid, values: ArrayLike<number>, e_m: number, n_m: number, stride = 1, offset = 0): number {
  const { segX, segY } = grid, row = segX + 1;
  const u = Math.min(segX, Math.max(0, (e_m - grid.box.west_m) / grid.dx_m));
  const w = Math.min(segY, Math.max(0, (grid.box.north_m - n_m) / grid.dy_m));
  const i = Math.min(segX - 1, Math.floor(u)), j = Math.min(segY - 1, Math.floor(w));
  const fx = u - i, fy = w - j;
  const at = (ii: number, jj: number) => values[(jj * row + ii) * stride + offset];
  const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
  return fx + fy <= 1 ? a + (b - a) * fx + (c - a) * fy : d + (c - d) * (1 - fx) + (b - d) * (1 - fy);
}

export type GroundMode = 'real' | 'flat';

/**
 * The drawn ground's height at (e, n), on the playback's datum: over the
 * drawn triangles with real terrain, 0 on flat ground (and whenever heights
 * never arrived). For the camera's ground clamp and, later, seating domes.
 */
export function heightAt(mesh: TerrainMesh, e_m: number, n_m: number, ground: GroundMode): number {
  if (ground === 'flat' || !mesh.up) return 0;
  return onTriangles(mesh.grid, mesh.up, e_m, n_m);
}

// ─── Credits ──────────────────────────────────────────────────────────────────

export const MAP_CREDIT = 'Map © OpenStreetMap contributors';
export const ELEVATION_CREDIT = 'Elevation: Terrain Tiles by Mapzen (AWS Open Data), from the sources listed under "Elevation sources"';
/**
 * The elevation data's required attribution, word for word as the Terrain
 * Tiles project lists it for its hosted tiles (tilezen/joerd,
 * docs/attribution.md; the lines it wraps are joined here). Several of these
 * sources (EU-DEM, Kartverket, ArcticDEM, Canada's) require their text
 * wherever their heights are shown, and which ones a plan's ground came from
 * is not known, so the whole list goes under the credit line whenever real
 * heights are drawn.
 */
export const ELEVATION_SOURCES: readonly string[] = [
  'Mapzen',
  'ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736;',
  'Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017;',
  'Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich;',
  'Canada terrain data contains information licensed under the Open Government Licence – Canada;',
  'Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers;',
  'Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration',
  'Mexico terrain data source: INEGI, Continental relief, 2016;',
  'New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved);',
  'Norway terrain data © Kartverket;',
  'United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved;',
  'United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey.',
];
export const THREE_CREDIT = '3D: three.js (MIT)';
/** Shown as plain text: a link inside the app's window would navigate the app itself away. */
export const TERRAIN_CREDITS = [MAP_CREDIT, ELEVATION_CREDIT, THREE_CREDIT].join(' · ');

/** The credit line for what is drawn: the map's when the drape is on, the elevation's when real heights are, always three.js. */
export function creditsFor(shown: { map: boolean; elevation: boolean }): string {
  return [shown.map ? MAP_CREDIT : '', shown.elevation ? ELEVATION_CREDIT : '', THREE_CREDIT].filter(Boolean).join(' · ');
}
