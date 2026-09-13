import type { Coordinates } from '../types/waypoint.types';

/**
 * The planner's map, under the kneeboard card's north-up picture.
 *
 * Two halves. The tile arithmetic at the top is pure and pinned by geo-check.
 * The loader at the bottom touches the DOM and is only ever called from the
 * browser; nothing at module level does, so node can import this file.
 *
 * The card draws on a flat projection centred on the target, and OSM tiles are
 * Web Mercator. Over the ten-odd miles a card shows the two agree to well under
 * a pixel, provided each tile is placed by running its own corners through the
 * card's projection rather than by laying a grid down at one scale — see
 * `tileRectPx`.
 */

/** One URL for both maps, so the planner and the card can never drift apart. */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = 'Map © OpenStreetMap contributors · real-world, may differ from DCS';

export const TILE_SIZE = 256;
export const MIN_BASEMAP_ZOOM = 3;
export const MAX_BASEMAP_ZOOM = 17;
/** A normal card needs about 35. More means a frame zoomed far out; step the zoom down instead. */
export const MAX_BASEMAP_TILES = 48;

/** Web Mercator's equator, 2πR with R = 6 378 137 m. */
const EARTH_CIRCUMFERENCE_M = 40075016.686;
const METRES_PER_NM = 1852;

export interface TileKey {
  x: number;
  y: number;
  z: number;
}

export const tileKey = (tile: TileKey): string => `${tile.z}/${tile.x}/${tile.y}`;

/** Fractional tile coordinates of a point: the integer part is the tile, the rest is where in it. */
export function lonLatToTile(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

/** The north-west corner of tile (x, y). Pass x + 1, y + 1 for its south-east corner. */
export function tileNwCorner(x: number, y: number, z: number): Coordinates {
  const n = 2 ** z;
  return {
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
    lon: (x / n) * 360 - 180,
  };
}

/** Ground metres covered by one tile pixel at this latitude and zoom. */
export function metresPerTilePixel(lat: number, z: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * 2 ** z);
}

/**
 * The lowest zoom whose tiles are at least as detailed as the card, so tiles
 * are drawn slightly shrunk (sharp) and never stretched (blurry).
 */
export function chooseZoom(pxPerNm: number, lat: number): number {
  const cardMetresPerPx = METRES_PER_NM / pxPerNm;
  const exact = Math.log2((EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * cardMetresPerPx));
  if (!Number.isFinite(exact)) return MIN_BASEMAP_ZOOM;
  return Math.min(MAX_BASEMAP_ZOOM, Math.max(MIN_BASEMAP_ZOOM, Math.ceil(exact)));
}

/** Every tile at zoom z touching the box between two opposite corners. */
export function tilesCovering(nw: Coordinates, se: Coordinates, z: number): TileKey[] {
  const n = 2 ** z;
  const a = lonLatToTile(nw.lat, nw.lon, z);
  const b = lonLatToTile(se.lat, se.lon, z);
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return [];
  const clamp = (v: number) => Math.min(n - 1, Math.max(0, Math.floor(v)));
  const x0 = clamp(Math.min(a.x, b.x)), x1 = clamp(Math.max(a.x, b.x));
  const y0 = clamp(Math.min(a.y, b.y)), y1 = clamp(Math.max(a.y, b.y));
  const tiles: TileKey[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push({ x, y, z });
  return tiles;
}

/** The zoom and tiles for a card frame, stepping the zoom down until the count is sane. */
export function planBasemap(nw: Coordinates, se: Coordinates, pxPerNm: number, lat: number): TileKey[] {
  for (let z = chooseZoom(pxPerNm, lat); z >= MIN_BASEMAP_ZOOM; z--) {
    const tiles = tilesCovering(nw, se, z);
    if (tiles.length > 0 && tiles.length <= MAX_BASEMAP_TILES) return tiles;
  }
  return [];
}

/**
 * Where a tile lands on the card. Both corners go through the card's own
 * projection and are rounded, so neighbours share an edge exactly (no hairline
 * seams) and nothing is more than half a pixel from where the projection puts it.
 */
export function tileRectPx(
  tile: TileKey,
  toPx: (c: Coordinates) => [number, number],
): { x: number; y: number; w: number; h: number } {
  const [x0, y0] = toPx(tileNwCorner(tile.x, tile.y, tile.z)).map(Math.round);
  const [x1, y1] = toPx(tileNwCorner(tile.x + 1, tile.y + 1, tile.z)).map(Math.round);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ─── Loader (browser only) ────────────────────────────────────────────────────

/** A drawable tile, `null` when it could not be had, `undefined` when not fetched yet. */
export type BasemapTiles = (tile: TileKey) => CanvasImageSource | null | undefined;

export interface BasemapReport {
  tiles: TileKey[];
  drawn: number;
  failed: number;
  pending: number;
}

const settled = new Map<string, HTMLCanvasElement | null>();
const inFlight = new Map<string, Promise<void>>();
const failedAt = new Map<string, number>();
/** A tile that failed (offline, say) is tried again once this long has passed. */
const RETRY_AFTER_MS = 30_000;

/** Tiles as the card draws them: whatever has already arrived. */
export const cachedBasemapTiles: BasemapTiles = (tile) => {
  const key = tileKey(tile);
  if (!settled.has(key)) return undefined;
  const failed = failedAt.get(key);
  if (failed !== undefined && Date.now() - failed > RETRY_AFTER_MS) return undefined;
  return settled.get(key);
};

/**
 * Greyscale, baked once per tile. Done by hand rather than with `ctx.filter`,
 * which older macOS WKWebView and Linux WebKitGTK do not implement.
 *
 * A tile whose pixels cannot be read would taint the card canvas and make
 * every export throw, so that counts as a failed tile, never a drawn one.
 */
function greyTile(img: HTMLImageElement): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || TILE_SIZE;
  canvas.height = img.naturalHeight || TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = lum;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function fetchTile(tile: TileKey): Promise<void> {
  const key = tileKey(tile);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = new Promise<void>((resolve) => {
    const img = new Image();
    // Without this the tile is opaque to the canvas and the export throws.
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const grey = greyTile(img);
      settled.set(key, grey);
      if (grey) failedAt.delete(key);
      else failedAt.set(key, Date.now());
      resolve();
    };
    img.onerror = () => {
      settled.set(key, null);
      failedAt.set(key, Date.now());
      resolve();
    };
    img.src = OSM_TILE_URL.replace('{z}', String(tile.z)).replace('{x}', String(tile.x)).replace('{y}', String(tile.y));
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

/**
 * Fetch whatever of `tiles` is not already cached, giving up after `timeoutMs`.
 * Tiles that arrive after the deadline still land in the cache for next time.
 */
export async function loadBasemapTiles(tiles: TileKey[], timeoutMs = 8000): Promise<void> {
  const wanted = tiles.filter((t) => cachedBasemapTiles(t) === undefined);
  if (!wanted.length) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([Promise.allSettled(wanted.map(fetchTile)), deadline]);
  clearTimeout(timer);
}
