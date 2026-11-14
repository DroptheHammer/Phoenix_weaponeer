/**
 * DEV ONLY (the playback harness). A made-up tile source, fully offline and
 * the same on every run, so the screenshot checks can predict pixels:
 * - the map is flat colours: east of the north-south line through the
 *   target one colour, and west of it two, split at the target's latitude
 *   (a third colour north of it). The second split is what shows which way
 *   up the drape lies: drawn upside down (a texture that ignored flipY), the
 *   south-west and north-west samples, mirror images about the target's
 *   latitude, cannot both read their own colour;
 * - the ground is flat at the target's elevation except for one 600 m
 *   Gaussian hill about 4 km south-east of the run-in (the jet at 500 ft
 *   passes its north-west shoulder with room to spare), on the east colour.
 *
 * The scene's datum puts the target's ground at height 0, so the hill's top
 * is drawn at 600 m and everything else at 0.
 */
import { TERRAIN_TILE_PX, type TileSource } from '../../../lib/playbackScene';
import { toLocal, type LocalFrame } from '../../../lib/playback';
import { TARGET, TARGET_ELEVATION_FT } from './fixture';

export const DRAPE_WEST = '#c8b48c';
export const DRAPE_EAST = '#86a873';
/** West of the target and north of its latitude. */
export const DRAPE_NORTH = '#b4a0c8';

/** The hill, in the playback's local metres (east, north of the target). */
export const HILL = { e_m: 21500, n_m: 4400, sigma_m: 2000, peak_m: 600 } as const;

/**
 * Points for the colour check: plain ground in each colour, clear of every
 * line drawn. `west` and `north` are mirror images about the target's
 * latitude (see the header).
 */
export const COLOUR_SAMPLES = { west: [-12000, -5000], north: [-12000, 5000], east: [12000, -5000] } as const;

const BASE_M = TARGET_ELEVATION_FT * 0.3048;

/** The hill's height above the target's ground at a local point, m. */
export function hillHeight(e_m: number, n_m: number): number {
  const d2 = (e_m - HILL.e_m) ** 2 + (n_m - HILL.n_m) ** 2;
  return HILL.peak_m * Math.exp(-d2 / (2 * HILL.sigma_m ** 2));
}

const tileLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tileLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

export function syntheticTiles(frame: LocalFrame): TileSource<CanvasImageSource> {
  return {
    async mapTile(z, x, y) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      // Web Mercator's x is linear in longitude, so the east-west split is one pixel column; its y
      // is not linear in latitude, but along a tile the target's latitude is still one pixel row
      // (row 0 is the tile's north edge).
      const split = Math.round(((TARGET.lon + 180) / 360) * 2 ** z * 256 - x * 256);
      const w = Math.max(0, Math.min(256, split));
      const phi = (TARGET.lat * Math.PI) / 180;
      const mercY = (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2;
      const h = Math.max(0, Math.min(256, Math.round(mercY * 2 ** z * 256 - y * 256)));
      g.fillStyle = DRAPE_NORTH;
      g.fillRect(0, 0, w, h);
      g.fillStyle = DRAPE_WEST;
      g.fillRect(0, h, w, 256 - h);
      g.fillStyle = DRAPE_EAST;
      g.fillRect(w, 0, 256 - w, 256);
      return c;
    },

    async terrainTile(z, x, y) {
      const n = TERRAIN_TILE_PX;
      const out = new Float32Array(n * n).fill(BASE_M);
      // A rough flat-earth distance first (good to a few tens of metres here), so the exact
      // projection runs only near the hill: a whole box of tiles stays well under a second.
      const mPerDegLat = 111_195, mPerDegLon = mPerDegLat * Math.cos((frame.origin.lat * Math.PI) / 180);
      const far2 = (6 * HILL.sigma_m) ** 2;
      for (let row = 0; row < n; row++) {
        const lat = tileLat(y + (row + 0.5) / n, z);
        const roughN = (lat - frame.origin.lat) * mPerDegLat - HILL.n_m;
        for (let col = 0; col < n; col++) {
          const lon = tileLon(x + (col + 0.5) / n, z);
          const roughE = (lon - frame.origin.lon) * mPerDegLon - HILL.e_m;
          if (roughE * roughE + roughN * roughN > far2) continue;
          const p = toLocal(frame, { lat, lon });
          out[row * n + col] = BASE_M + hillHeight(p.e_m, p.n_m);
        }
      }
      return out;
    },
  };
}
