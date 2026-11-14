/**
 * Loads the ground under the 3D playback: the elevation tiles (all or
 * nothing, then the heights rise in place) and the map tiles (drawn into one
 * canvas, nearest the target first, partial if some never come). The rules
 * (pool sizes, time limits, all-or-nothing, the upload pace) are in
 * src/lib/playbackScene/tileLoading.ts, where geo-check tests them; this file
 * adds only the canvas.
 *
 * It takes the tile source as a parameter: the desktop passes its Rust-backed
 * one (tauriTiles.ts), the dev harness a synthetic one, so the screenshot
 * checks run offline and give known pixels.
 *
 * Nothing here fires after the signal is aborted (the view closed): tiles
 * still in flight are dropped when they land.
 */
import { TILE_SIZE as TILE_SIZE_PX } from '../../../lib/kneeboardBasemap';
import {
  DRAPE_DEADLINE_MS, MAP_IN_FLIGHT, UploadPace, loadHeights, runPool, tilesNearestFirst,
  type HeightsOutcome, type TerrainPlan, type TileSource,
} from '../../../lib/playbackScene';

/** OpenStreetMap's land tone: the ground's colour before (or without) map tiles. */
export const LAND_COLOR = '#f2efe9';
/** A map tile that never came is filled a shade darker, so the hole looks deliberate rather than broken. */
export const MISSING_TILE_COLOR = '#e4e0d8';

export interface MapProgress {
  /** Map tiles in the block (0 when no drape fits: the ground is plain land colour). */
  total: number;
  loaded: number;
  failed: number;
  /** Every tile has arrived or failed, or the time limit passed. */
  done: boolean;
}

export interface TerrainLoadCallbacks {
  /** Once: the stitched heights, or why there are none (the ground then stays flat). */
  onHeights(outcome: HeightsOutcome): void;
  /** The drape canvas changed: re-send the texture. Already paced to at most once a second, plus once at the end. */
  onDrapeUpdate(): void;
  /** After every map tile, and once when the map is done. */
  onMapProgress(p: MapProgress): void;
}

export interface TerrainLoad {
  /** The drape, at the block's native size, filled with the land colour until tiles land. Undefined without a drape plan. */
  readonly drapeCanvas: HTMLCanvasElement | undefined;
  /** Frees the canvas's memory (up to 64 MB) at once. Call after the texture made from it is disposed. */
  release(): void;
}

const closeImage = (img: CanvasImageSource) => {
  if ('close' in img && typeof img.close === 'function') img.close();
};

/** Starts both loads and returns the drape canvas at once (the scene wraps it in a texture straight away). */
export function loadTerrain(
  plan: TerrainPlan,
  source: TileSource<CanvasImageSource>,
  callbacks: TerrainLoadCallbacks,
  signal: AbortSignal,
): TerrainLoad {
  const live = () => !signal.aborted;

  // ── Heights: all or nothing, on their own pool and time limit.
  loadHeights(source, plan.elevation, plan.frame, signal).then(
    (outcome) => { if (live()) callbacks.onHeights(outcome); },
    (err) => { if (live()) { console.warn('playback: heights failed:', err); callbacks.onHeights({ ok: false, reason: 'offline' }); } },
  ).catch((err) => {
    // A throw inside onHeights itself (the scene's own callback catches its mesh build; this is the
    // last net, so nothing ends as an unhandled rejection).
    console.warn('playback: handling the heights failed:', err);
  });

  // ── The drape.
  const drape = plan.drape;
  if (!drape) {
    queueMicrotask(() => { if (live()) callbacks.onMapProgress({ total: 0, loaded: 0, failed: 0, done: true }); });
    return { drapeCanvas: undefined, release: () => undefined };
  }

  const canvas = document.createElement('canvas');
  canvas.width = drape.nx * TILE_SIZE_PX;
  canvas.height = drape.ny * TILE_SIZE_PX;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = LAND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const progress: MapProgress = { total: drape.nx * drape.ny, loaded: 0, failed: 0, done: false };
  const tell = () => { if (live()) callbacks.onMapProgress({ ...progress }); };
  const pace = new UploadPace();
  const stop = new AbortController();
  let paceTimer: ReturnType<typeof setTimeout> | undefined;

  const upload = () => { if (live()) callbacks.onDrapeUpdate(); };
  const drawn = () => {
    const now = performance.now();
    if (pace.tile(now)) upload();
    else if (paceTimer === undefined) {
      // Held back: send it when the second is up, so the last tiles of a burst are seen.
      paceTimer = setTimeout(() => {
        paceTimer = undefined;
        if (pace.flush(performance.now())) upload();
      }, pace.waitMs(now) ?? 0);
    }
    tell();
  };

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    clearTimeout(paceTimer);
    paceTimer = undefined;
    stop.abort();
    if (pace.flush(performance.now())) upload();
    progress.done = true;
    tell();
  };

  const deadline = setTimeout(finish, DRAPE_DEADLINE_MS);
  const onAbort = () => {
    finished = true;
    clearTimeout(deadline);
    clearTimeout(paceTimer);
    stop.abort();
  };
  signal.addEventListener('abort', onAbort, { once: true });

  runPool(tilesNearestFirst(drape, plan.frame), MAP_IN_FLIGHT, async (t) => {
    const px = (t.x - drape.x0) * TILE_SIZE_PX, py = (t.y - drape.y0) * TILE_SIZE_PX;
    try {
      const img = await source.mapTile(t.z, t.x, t.y);
      if (finished) { closeImage(img); return; } // late: the desktop has cached it for next time
      ctx?.drawImage(img, px, py); // native size: nothing is scaled, so the map's labels stay crisp
      closeImage(img);
      progress.loaded++;
    } catch {
      if (finished) return;
      if (ctx) {
        ctx.fillStyle = MISSING_TILE_COLOR;
        ctx.fillRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);
      }
      progress.failed++;
    }
    drawn();
  }, stop.signal).then(() => { if (live()) finish(); });

  return {
    drapeCanvas: canvas,
    release: () => {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
