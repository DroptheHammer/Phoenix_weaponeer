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
 * − real height at the lead's target, with every decoded pixel first clamped
 * at sea level (0 m). So the ground at the target is at 0, where the bomb
 * lands, and the sea is flat instead of a trench.
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

/** A block of tiles at one zoom: x0…x0+nx−1 by y0…y0+ny−1. */
export interface TileRange {
  z: number;
  x0: number;
  y0: number;
  nx: number;
  ny: number;
}

/** Points per box edge run through the projection when finding the tiles. */
export const PERIMETER_POINTS = 33;
/** Pixels of padding round the box, so bilinear sampling at the edge always has neighbours. */
export const TILE_PAD_PX = 2;

/**
 * The tiles under the box at zoom z. The box's edges are sampled along their
 * length, not only at the corners: a straight edge in local metres bulges
 * poleward in latitude at its middle (1.35 km at ±45 nm near 68 N, a whole
 * row of tiles), and the corners alone would miss it. Padded by two pixels,
 * floored to whole tiles. Interior points land inside the perimeter's span,
 * because the projection is continuous.
 */
export function tileSpan(box: TerrainBox, frame: LocalFrame, z: number): TileRange {
  const ll = { lat: 0, lon: 0 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const add = (e: number, n: number) => {
    fromLocalInto(frame, e, n, ll);
    const f = lonLatToTile(ll.lat, ll.lon, z);
    if (f.x < minX) minX = f.x;
    if (f.x > maxX) maxX = f.x;
    if (f.y < minY) minY = f.y;
    if (f.y > maxY) maxY = f.y;
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

/**
 * The elevation zoom: the lowest whose pixels are no larger than the mesh
 * spacing at the target's latitude (the kneeboard's own `chooseZoom` rule,
 * with cos(lat) in it, so Kola does not fetch four times the tiles), kept to
 * zoom 8-12 and stepped down if the block would be absurdly large.
 */
export function planElevation(grid: TerrainGrid, frame: LocalFrame): TileRange {
  let z = Math.min(MAX_ELEVATION_ZOOM, Math.max(MIN_ELEVATION_ZOOM, chooseZoom(NM_TO_M / grid.dx_m, frame.origin.lat)));
  let s = tileSpan(grid.box, frame, z);
  while (s.nx * s.ny > MAX_ELEVATION_TILES && z > MIN_ELEVATION_ZOOM) s = tileSpan(grid.box, frame, --z);
  return s;
}

export interface TerrainPlan {
  frame: LocalFrame;
  grid: TerrainGrid;
  elevation: TileRange;
  /** Undefined when no drape fits (then the ground is plain land colour). */
  drape: TileRange | undefined;
}

/** Everything about the terrain that follows from the playback's bounds alone: box, grid, and both tile blocks. */
export function planTerrain(bounds: EnuBox, frame: LocalFrame, maxTextureSize = MAX_DRAPE_PX): TerrainPlan {
  const grid = terrainGridOf(terrainBoxOf(bounds));
  return { frame, grid, elevation: planElevation(grid, frame), drape: planDrape(grid.box, frame, maxTextureSize) };
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

/** Terrarium carries sea-bed depths, not "no data": clamp at sea level so a coast runs down to the water and stops. */
export function seaClamp(h: number): number {
  return h < 0 ? 0 : h;
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

/** One height grid over a whole tile block, sea-clamped: w × h pixels, row by row from the north-west. */
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
 * `tiles` in `tilesOf` order; a missing one as undefined.
 */
export function heightMosaic(range: TileRange, tiles: readonly (Float32Array | undefined)[]): HeightMosaic | undefined {
  if (tiles.length !== range.nx * range.ny) return undefined;
  const P = TERRAIN_TILE_PX, w = range.nx * P, h = range.ny * P;
  const data = new Float32Array(w * h);
  for (let ty = 0; ty < range.ny; ty++) {
    for (let tx = 0; tx < range.nx; tx++) {
      const t = tiles[ty * range.nx + tx];
      if (!t || !terrainTileValid(t)) return undefined;
      for (let j = 0; j < P; j++) {
        const row = (ty * P + j) * w + tx * P;
        for (let i = 0; i < P; i++) data[row + i] = seaClamp(t[j * P + i]);
      }
    }
  }
  return { range, w, h, data };
}

/**
 * Bilinear sampling with pixel (i, j) holding the height at its CENTRE,
 * (i + 0.5, j + 0.5). Getting that wrong shifts the terrain half a pixel
 * (60 m at zoom 10). Clamped at the edges: never NaN.
 */
export function sampleBilinear(grid: ArrayLike<number>, w: number, h: number, px: number, py: number): number {
  const u = Math.min(w - 1, Math.max(0, px - 0.5));
  const v = Math.min(h - 1, Math.max(0, py - 0.5));
  const i = Math.min(w - 2, Math.floor(u)), j = Math.min(h - 2, Math.floor(v));
  const fx = u - i, fy = v - j;
  const a = grid[j * w + i], b = grid[j * w + i + 1];
  const c = grid[(j + 1) * w + i], d = grid[(j + 1) * w + i + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** The mosaic's height at a lat/lon (sea-clamped, real metres, not yet shifted). */
export function mosaicHeightAt(m: HeightMosaic, lat: number, lon: number): number {
  const f = lonLatToTile(lat, lon, m.range.z);
  return sampleBilinear(m.data, m.w, m.h, (f.x - m.range.x0) * TERRAIN_TILE_PX, (f.y - m.range.y0) * TERRAIN_TILE_PX);
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
 * The shown height at every vertex, m, on the playback's datum: the
 * mosaic's (sea-clamped) height there minus its height at the lead's target,
 * so the target is at 0. `shift_m` is that constant (minus the real height
 * at the target). Float64, for `heightAt`; the GPU gets float32 copies.
 */
export function vertexHeights(latlon: Float64Array, frame: LocalFrame, mosaic: HeightMosaic): { up: Float64Array; shift_m: number } {
  const shift_m = -mosaicHeightAt(mosaic, frame.origin.lat, frame.origin.lon);
  const nv = latlon.length / 2;
  const up = new Float64Array(nv);
  for (let v = 0; v < nv; v++) up[v] = mosaicHeightAt(mosaic, latlon[2 * v], latlon[2 * v + 1]) + shift_m;
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
  /** Minus the real height at the target, m (0 without heights). */
  shift_m: number;
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
  const heights = mosaic ? vertexHeights(latlon, plan.frame, mosaic) : undefined;
  return {
    grid,
    index: gridIndices(grid.segX, grid.segY),
    positionsFlat: gridPositions(grid),
    colorsFlat: new Float32Array(nv * 3).fill(1),
    positionsReal: heights ? gridPositions(grid, heights.up) : undefined,
    colorsReal: heights ? shadeColors(hillshade(heights.up, grid)) : undefined,
    up: heights?.up,
    shift_m: heights?.shift_m ?? 0,
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
