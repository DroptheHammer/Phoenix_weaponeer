/**
 * The terrain loader's rules, as plain code: no three.js, no DOM, so
 * geo-check runs them under node with a made-up tile source. The DOM half
 * (src/components/playback/terrain) adds only the drape canvas and the
 * desktop's tile commands.
 *
 * What is pinned here:
 * - the bytes the desktop hands back become heights safely, whatever
 *   container they arrive in;
 * - no more than a few tiles are asked for at once (politeness to the tile
 *   servers, and the desktop's thread pool), nearest the target first;
 * - heights are all or nothing, within a time limit: one missing tile means
 *   flat ground, never a hole with false cliffs round it;
 * - the drape's texture is re-sent to the graphics card at most once a
 *   second (each send of a 4096² texture stalls a frame);
 * - the plain skirt round the terrain sits just under its lowest edge, and
 *   the haze follows the camera so the box's edge melts away at any zoom.
 */

import type { LocalFrame } from '../playback';
import type { TileKey } from '../kneeboardBasemap';
import {
  heightMosaic, tileErrorOf, tilesNearestFirst, TERRAIN_TILE_PX,
  type GroundMode, type HeightMosaic, type TerrainMesh, type TileRange, type TileSource,
} from './terrain';

// ─── Limits ───────────────────────────────────────────────────────────────────

/** Map tiles in flight at once: OpenStreetMap's tile policy asks for few parallel requests. */
export const MAP_IN_FLIGHT = 2;
/** Elevation tiles in flight at once (a different host, and only 9-25 of them). */
export const TERRAIN_IN_FLIGHT = 4;
/** Heights that have not all arrived by then are given up: the ground stays flat. */
export const HEIGHTS_DEADLINE_MS = 10_000;
/** The map keeps whatever tiles arrived by then; the rest stay plain land colour. */
export const DRAPE_DEADLINE_MS = 15_000;
/** The drape texture is re-sent to the graphics card no more often than this. */
export const DRAPE_UPLOAD_GAP_MS = 1000;

// ─── The bytes from the desktop ───────────────────────────────────────────────

/**
 * The raw bytes of a tile reply, whatever container it came in: the desktop
 * normally hands back an ArrayBuffer, but a typed array (any view onto a
 * buffer) or a plain array of numbers (what Tauri's fallback channel sends)
 * work too. Undefined for anything else.
 */
export function bytesOf(raw: unknown): Uint8Array | undefined {
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  if (Array.isArray(raw) && raw.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) return Uint8Array.from(raw as number[]);
  return undefined;
}

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/**
 * `count` little-endian float32 values from a tile reply (the desktop's
 * terrain tile is 65536 heights in metres). A view straight onto the bytes
 * when they are aligned on 4 bytes and the machine is little-endian (every
 * machine the app runs on); otherwise each value is read out one by one,
 * because a Float32Array on a misaligned offset throws. Undefined when the
 * reply is not exactly that many bytes.
 */
export function float32Of(raw: unknown, count: number): Float32Array | undefined {
  const b = bytesOf(raw);
  if (!b || b.byteLength !== count * 4) return undefined;
  if (LITTLE_ENDIAN && b.byteOffset % 4 === 0) return new Float32Array(b.buffer, b.byteOffset, count);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

// ─── A small pool ─────────────────────────────────────────────────────────────

/**
 * Runs `work` on each item, in the order given, with at most `limit` running
 * at once. Once `signal` is aborted no new item starts. Resolves when every
 * started item has settled (a rejection counts as settled: `work` deals with
 * its own failures).
 */
export function runPool<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let next = 0, running = 0;
    const pump = () => {
      while (running < limit && next < items.length && !signal.aborted) {
        const item = items[next++];
        running++;
        work(item).catch(() => undefined).then(() => {
          running--;
          pump();
        });
      }
      if (running === 0 && (next >= items.length || signal.aborted)) resolve();
    };
    pump();
  });
}

/** Why the heights did not arrive: the two words of the tile source, or the time limit, a broken tile, or the view closing. */
export type HeightsFailure = 'missing' | 'offline' | 'timeout' | 'broken' | 'aborted';

export type HeightsOutcome = { ok: true; mosaic: HeightMosaic } | { ok: false; reason: HeightsFailure };

/** Where a tile goes in the mosaic (row by row from the north-west), whatever order it was fetched in. */
export function mosaicSlot(r: TileRange, t: TileKey): number {
  return (t.y - r.y0) * r.nx + (t.x - r.x0);
}

/**
 * Every elevation tile of the block, nearest the target first, a few at a
 * time, stitched into one mosaic. All or nothing: the first tile that fails
 * stops the rest and names the reason ('missing' if the server has no such
 * tile, else 'offline'); a tile of the wrong size or with impossible heights
 * is 'broken'; past the time limit it is 'timeout'. Tiles still in flight
 * then are simply ignored (the desktop has cached them for next time).
 */
export function loadHeights(
  source: Pick<TileSource<unknown>, 'terrainTile'>,
  range: TileRange,
  frame: LocalFrame,
  signal: AbortSignal,
  opts: { inFlight?: number; deadline_ms?: number } = {},
): Promise<HeightsOutcome> {
  const inFlight = opts.inFlight ?? TERRAIN_IN_FLIGHT, deadline = opts.deadline_ms ?? HEIGHTS_DEADLINE_MS;
  const stop = new AbortController();
  const tiles: (Float32Array | undefined)[] = new Array(range.nx * range.ny).fill(undefined);
  let failure: HeightsFailure | undefined;
  // The view closing settles the answer at once ('aborted') and clears the time limit, rather than
  // waiting for the tiles still in flight (up to 15 s each) or the timer; the tiles fetched so far
  // (up to 16 MB) are let go then too, not held until the last call in flight returns.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed: (how: 'aborted') => void = () => undefined;
  const aborted = new Promise<'aborted'>((resolve) => { closed = resolve; });
  const onOuterAbort = () => {
    clearTimeout(timer);
    stop.abort();
    tiles.fill(undefined);
    closed('aborted');
  };
  if (signal.aborted) onOuterAbort();
  else signal.addEventListener('abort', onOuterAbort);

  const pool = runPool(tilesNearestFirst(range, frame), inFlight, async (t) => {
    try {
      const data = await source.terrainTile(t.z, t.x, t.y);
      if (stop.signal.aborted) return;
      if (!(data instanceof Float32Array) || data.length !== TERRAIN_TILE_PX * TERRAIN_TILE_PX) {
        failure = 'broken';
        stop.abort();
        return;
      }
      tiles[mosaicSlot(range, t)] = data;
    } catch (e) {
      if (stop.signal.aborted) return;
      failure = tileErrorOf(e);
      stop.abort();
    }
  }, stop.signal);

  const timeout = new Promise<'timeout'>((resolve) => {
    if (!signal.aborted) timer = setTimeout(() => resolve('timeout'), deadline);
  });

  return Promise.race([pool.then(() => 'done' as const), timeout, aborted]).then((how): HeightsOutcome => {
    clearTimeout(timer);
    signal.removeEventListener('abort', onOuterAbort);
    stop.abort();
    const reason: HeightsFailure | undefined =
      how === 'aborted' || signal.aborted ? 'aborted' : how === 'timeout' ? 'timeout' : failure;
    const mosaic = reason ? undefined : heightMosaic(range, tiles); // the mosaic is a copy
    tiles.fill(undefined); // calls still in flight hold this closure: they must not hold the tiles too
    if (reason) return { ok: false, reason };
    return mosaic ? { ok: true, mosaic } : { ok: false, reason: 'broken' };
  });
}

// ─── The drape's upload pace ──────────────────────────────────────────────────

/**
 * Decides when the drape texture is re-sent: at once for the first tile
 * after a quiet second, otherwise held back and sent when the second is up
 * (so the last tiles of a burst are not left unseen), and once more at the
 * end. The caller passes the time, so this runs under node.
 */
export class UploadPace {
  private last = -Infinity;
  private pending = false;

  constructor(private readonly gap_ms = DRAPE_UPLOAD_GAP_MS) {}

  /** A tile was drawn at `now`. True: send now. False: held; ask `waitMs` when to come back. */
  tile(now: number): boolean {
    if (now - this.last >= this.gap_ms) {
      this.last = now;
      this.pending = false;
      return true;
    }
    this.pending = true;
    return false;
  }

  /** Milliseconds until a held upload is due, or undefined when nothing is held. */
  waitMs(now: number): number | undefined {
    return this.pending ? Math.max(0, this.last + this.gap_ms - now) : undefined;
  }

  /** The held upload's moment has come (or loading ended): true when one was held, and it is now sent. */
  flush(now: number): boolean {
    if (!this.pending) return false;
    this.pending = false;
    this.last = now;
    return true;
  }
}

// ─── The skirt and the haze ───────────────────────────────────────────────────

/** The skirt sits this far below the lowest point on the terrain's edge. */
export const SKIRT_BELOW_M = 2;

/**
 * The height of the plain skirt round the terrain: just under the lowest
 * ground drawn along the box's edge, so the skirt never shows above the
 * terrain at the seam. Not the target's height: where the ground falls away
 * below it (a coastal target), a skirt at 0 would stand up out of the land.
 * On flat ground (or before heights arrive) the edge is at 0.
 */
export function skirtHeight(mesh: Pick<TerrainMesh, 'grid' | 'up'>, ground: GroundMode): number {
  if (ground === 'flat' || !mesh.up) return -SKIRT_BELOW_M;
  const { segX, segY } = mesh.grid, row = segX + 1, up = mesh.up;
  let lo = Infinity;
  for (let i = 0; i <= segX; i++) lo = Math.min(lo, up[i], up[segY * row + i]);
  for (let j = 0; j <= segY; j++) lo = Math.min(lo, up[j * row], up[j * row + segX]);
  return lo - SKIRT_BELOW_M;
}

/** The haze starts this far past the box's middle, in box half-diagonals… */
export const FOG_NEAR_K = 0.4;
/** …and is complete this far past it: the box's corners are mostly hidden, the skirt beyond them wholly. */
export const FOG_FAR_K = 1.2;

/**
 * The haze's start and end distances for a camera `dist_m` from the middle
 * of the terrain box, whose half-diagonal is `halfDiag_m`. It follows the
 * camera: a fixed haze would bury the whole box when the camera stands back
 * 50 km to see the strike, and do nothing when it is close in.
 *
 * Written into `out` and returned: the scene calls this on every drawn
 * frame, and its frames allocate nothing (pass an object it keeps).
 */
export function fogRange(
  dist_m: number,
  halfDiag_m: number,
  out: { near_m: number; far_m: number } = { near_m: 0, far_m: 0 },
): { near_m: number; far_m: number } {
  const d = Math.max(0, dist_m);
  out.near_m = d + FOG_NEAR_K * halfDiag_m;
  out.far_m = d + FOG_FAR_K * halfDiag_m;
  return out;
}
