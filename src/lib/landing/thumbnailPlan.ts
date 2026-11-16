import type { Coordinates } from '../../types/waypoint.types';
import {
  lonLatToTile,
  planBasemap,
  tileKey,
  tileNwCorner,
  tileRectPx,
  type TileKey,
} from '../kneeboardBasemap';

/**
 * Where everything goes in a recent mission's little route picture, worked out
 * without drawing anything: pixel positions for the route and the threats, and
 * the map tiles under them.
 *
 * A thumbnail can span the whole theater, so the card's flat projection (good
 * for about ten miles around a target) will not do. This uses Web Mercator, the
 * projection of the map tiles themselves, with one unrounded conversion from
 * position to pixel that places every dot and every tile corner. A tile corner
 * and a waypoint standing on it therefore land on the same pixel.
 *
 * Only what the input holds is framed: it carries no hidden threat and no
 * bullseye, so neither can pull the frame, or a tile request, towards itself.
 *
 * What the picture is made from is defined here, not in the recent cards that
 * fill it in, so this file needs nothing of the app (no stores, no platform).
 */

/** The most points a thumbnail is drawn from: a route is short, and a file can be hostile. */
export const MAX_THUMB_WAYPOINTS = 100;
export const MAX_THUMB_THREATS = 300;

/** Everything the picture needs, and nothing it must not show. No bullseye, no hidden threat. */
export interface ThumbnailInput {
  /** The route, in the mission's own order. */
  waypoints: Array<{ lat: number; lon: number; steerpoint: number }>;
  /** Visible threats only: the strict filter has already been applied. */
  threats: Array<{ lat: number; lon: number; systemId: string }>;
  /** Where to look when the mission has nothing to frame. */
  fallbackCenter: Coordinates | null;
  /** A "strike near me" mission sits on a real place: it gets no map tiles. */
  realWorld: boolean;
}

export interface ThumbnailOptions {
  /** Plan map tiles under the picture. Default true. */
  basemap?: boolean;
  /** The most tiles one picture may ask for. Default 9. */
  maxTiles?: number;
  /** Space kept clear round the points, in pixels. Default 12. */
  paddingPx?: number;
  /** The smallest stretch of ground the picture may show, in nautical miles. Default 10. */
  minSpanNm?: number;
}

export interface ThumbnailPlan {
  /** Nothing to frame: no waypoints and no threats. */
  empty: boolean;
  width: number;
  height: number;
  /** Zoom of the frame as a map would call it (256-pixel tiles), never above 11. */
  scaleZoom: number;
  pxPerNm: number;
  /** The route's pixels, in the order the waypoints were given. */
  route: Array<[number, number]>;
  waypoints: Array<{ x: number; y: number; steerpoint: number }>;
  threats: Array<{ x: number; y: number; systemId: string }>;
  tiles: Array<{ tile: TileKey; key: string; rect: { x: number; y: number; w: number; h: number } }>;
  /** Why there are no tiles, when there are none and there could have been. */
  tilesOmitted: 'real-world' | 'basemap-off' | 'too-many' | null;
}

/** Web Mercator's equator, as in the basemap code. */
const EARTH_CIRCUMFERENCE_M = 40075016.686;
const METRES_PER_NM = 1852;
const TILE_PX = 256;
/** The planner's own map never zooms in past this to fit a route. */
const MAX_SCALE_ZOOM = 11;
/** Web Mercator has no map beyond this latitude. */
const MAX_LAT = 85.0511;

const clampLat = (lat: number): number => Math.min(MAX_LAT, Math.max(-MAX_LAT, lat));
const isPosition = (p: { lat: number; lon: number }): boolean => Number.isFinite(p.lat) && Number.isFinite(p.lon);
/** A position on the world as one unit wide, y growing southward. */
const worldOf = (lat: number, lon: number) => lonLatToTile(clampLat(lat), lon, 0);

export function planThumbnail(
  input: ThumbnailInput,
  size: { width: number; height: number },
  opts: ThumbnailOptions = {},
): ThumbnailPlan {
  const { width, height } = size;
  const withBasemap = opts.basemap !== false;
  const maxTiles = opts.maxTiles ?? 9;
  const padding = opts.paddingPx ?? 12;
  const minSpanNm = opts.minSpanNm ?? 10;

  // A mission file can hold any number of points; only the first few are drawn.
  const waypoints = input.waypoints.slice(0, MAX_THUMB_WAYPOINTS).filter(isPosition);
  const threats = input.threats.slice(0, MAX_THUMB_THREATS).filter(isPosition);
  const waypointWorld = waypoints.map((p) => worldOf(p.lat, p.lon));
  const threatWorld = threats.map((p) => worldOf(p.lat, p.lon));
  const framed = [...waypointWorld, ...threatWorld];

  const noTiles = input.realWorld ? 'real-world' : withBasemap ? null : 'basemap-off';
  const nothing: ThumbnailPlan = {
    empty: true, width, height, scaleZoom: 0, pxPerNm: 0, route: [], waypoints: [], threats: [], tiles: [], tilesOmitted: noTiles,
  };

  // The box to show: round the points, or round the fallback when there are none.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of framed) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (framed.length === 0) {
    const fallback = input.fallbackCenter && isPosition(input.fallbackCenter) ? worldOf(input.fallbackCenter.lat, input.fallbackCenter.lon) : null;
    if (!fallback) return nothing;
    minX = maxX = fallback.x;
    minY = maxY = fallback.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const latC = tileNwCorner(cx, cy, 0).lat;

  // One world unit is this many nautical miles across at the frame's latitude
  // (Mercator stretches both directions alike), so a short route still gets a
  // picture that shows some ground around it.
  const nmPerUnit = (EARTH_CIRCUMFERENCE_M * Math.cos((latC * Math.PI) / 180)) / METRES_PER_NM;
  const minSpan = minSpanNm / nmPerUnit;
  const spanX = Math.max(maxX - minX, minSpan);
  const spanY = Math.max(maxY - minY, minSpan);

  const availW = Math.max(1, width - 2 * padding);
  const availH = Math.max(1, height - 2 * padding);
  const s = Math.min(Math.min(availW / spanX, availH / spanY), TILE_PX * 2 ** MAX_SCALE_ZOOM);
  const pxPerNm = s / nmPerUnit;

  // The one conversion from a point on the world to a pixel; the dots work from
  // the world points already found, the tile corners from a position.
  const pxOf = (w: { x: number; y: number }): [number, number] => [width / 2 + (w.x - cx) * s, height / 2 + (w.y - cy) * s];
  const toPx = (c: Coordinates): [number, number] => pxOf(worldOf(c.lat, c.lon));

  let tiles: ThumbnailPlan['tiles'] = [];
  let tilesOmitted: ThumbnailPlan['tilesOmitted'] = noTiles;
  if (!input.realWorld && withBasemap) {
    // Tiles for the whole picture, edge to edge, not just the padded part.
    const nw = tileNwCorner(cx - width / 2 / s, cy - height / 2 / s, 0);
    const se = tileNwCorner(cx + width / 2 / s, cy + height / 2 / s, 0);
    tiles = planBasemap(nw, se, pxPerNm, latC, maxTiles).map((tile) => ({ tile, key: tileKey(tile), rect: tileRectPx(tile, toPx) }));
    tilesOmitted = tiles.length === 0 ? 'too-many' : null;
  }

  const waypointPx = waypointWorld.map(pxOf);
  return {
    empty: framed.length === 0,
    width,
    height,
    scaleZoom: Math.log2(s / TILE_PX),
    pxPerNm,
    route: waypointPx,
    waypoints: waypoints.map((p, i) => ({ x: waypointPx[i][0], y: waypointPx[i][1], steerpoint: p.steerpoint })),
    threats: threats.map((p, i) => {
      const [x, y] = pxOf(threatWorld[i]);
      return { x, y, systemId: p.systemId };
    }),
    tiles,
    tilesOmitted,
  };
}
