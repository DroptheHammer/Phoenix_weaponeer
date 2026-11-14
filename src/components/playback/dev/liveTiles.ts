/**
 * DEV ONLY (the playback harness, ?tiles=live). Real OpenStreetMap and
 * Terrarium elevation tiles fetched straight from the browser, so the real
 * terrain look can be seen in a plain browser before anyone opens the app.
 * The app itself never does this: it gets tiles through its Rust commands
 * (terrain/tauriTiles.ts), which cache them and need no CSP change.
 *
 * Heights are decoded through a 2D canvas here, with the browser's colour
 * conversion turned off; the app decodes them in Rust instead.
 */
import { TERRAIN_TILE_PX, type TileError, type TileSource } from '../../../lib/playbackScene';

const OSM = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const TERRARIUM = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

async function fetchPng(url: string): Promise<Blob> {
  let r: Response;
  try {
    r = await fetch(url);
  } catch {
    throw 'offline' satisfies TileError;
  }
  if (r.status === 403 || r.status === 404) throw 'missing' satisfies TileError;
  if (!r.ok) throw 'offline' satisfies TileError;
  return r.blob();
}

export const liveTiles: TileSource<CanvasImageSource> = {
  async mapTile(z, x, y) {
    return createImageBitmap(await fetchPng(OSM(z, x, y)));
  },

  async terrainTile(z, x, y) {
    const bitmap = await createImageBitmap(await fetchPng(TERRARIUM(z, x, y)), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const n = TERRAIN_TILE_PX;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bitmap, 0, 0);
    bitmap.close();
    const px = g.getImageData(0, 0, n, n).data;
    const out = new Float32Array(n * n);
    // Terrarium: metres = red × 256 + green + blue / 256 − 32768.
    for (let i = 0; i < n * n; i++) out[i] = px[4 * i] * 256 + px[4 * i + 1] + px[4 * i + 2] / 256 - 32768;
    return out;
  },
};
