/**
 * The desktop's tile source for the 3D playback: map and elevation tiles
 * come through the app's own Rust commands (get_map_tile, get_terrain_tile),
 * which fetch, check and cache them on disk. The webview never fetches a
 * tile itself, so the strict content security policy needs no new host, and
 * the cache carries over between runs and between dev and release builds.
 *
 * Lazy chunk only: the playback view imports this; nothing in the planner's
 * start-up code may.
 */
import { invoke } from '@tauri-apps/api/core';
import { bytesOf, float32Of, TERRAIN_TILE_PX, type TileError, type TileSource } from '../../../lib/playbackScene';

/**
 * The commands reject with a plain string: exactly 'missing' (the server has
 * no such tile) or 'offline' (no network and nothing cached), or else an
 * English sentence about some other failure. The tile source speaks only the
 * two words, so a sentence counts as 'offline'; in development it is logged,
 * because it usually means a real fault worth seeing.
 */
function tileError(e: unknown, what: string): TileError {
  if (e === 'missing' || e === 'offline') return e;
  if (import.meta.env.DEV) console.warn(`playback: ${what} failed:`, e);
  return 'offline';
}

async function call(command: 'get_map_tile' | 'get_terrain_tile', z: number, x: number, y: number): Promise<unknown> {
  try {
    return await invoke<unknown>(command, { z, x, y });
  } catch (e) {
    throw tileError(e, `${command} ${z}/${x}/${y}`);
  }
}

export const tauriTiles: TileSource<ImageBitmap> = {
  async mapTile(z, x, y) {
    const bytes = bytesOf(await call('get_map_tile', z, x, y));
    if (!bytes) throw tileError('the reply was not bytes', `map tile ${z}/${x}/${y}`);
    // Decoded off the page's main work by the browser; drawn into the drape canvas, then closed.
    return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  },

  async terrainTile(z, x, y) {
    const heights = float32Of(await call('get_terrain_tile', z, x, y), TERRAIN_TILE_PX * TERRAIN_TILE_PX);
    if (!heights) throw tileError('the reply was not 65536 heights', `terrain tile ${z}/${x}/${y}`);
    return heights;
  },
};
