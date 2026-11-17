import type { Coordinates } from '../../types/waypoint.types';

/**
 * Where the Flight overview's map looks: a box centred on the chosen waypoint,
 * just big enough to hold every site it is handed (the block's rows and the
 * other systems that can reach the waypoint) and, where they fit, their whole
 * range rings. Pure: the map component hands the box to Leaflet's fitBounds and
 * nothing else decides the view.
 *
 * Distances are worked on a flat sheet round the waypoint (1 nm = 1 minute of
 * latitude, longitude shrunk by the cosine), good to about 1% at 60 nm.
 */

/** The closest the map comes: 5 nm each side of the waypoint (a 10 nm picture, as the recent-card thumbnails). */
export const FRAME_MIN_HALF_NM = 5;
/**
 * The farthest: 60 nm each side, the block's own "near" radius (nearThreats.ts NEAR_RADIUS_NM; a check keeps
 * the two equal), so every listed site within 60 nm is on the map. Only a system that covers the waypoint from
 * beyond 60 nm (an SA-5) can be off it, and its row says so. A ring that would need more is not made to fit:
 * its site is in view and its tint covers the waypoint.
 */
export const FRAME_MAX_HALF_NM = 60;
/** Leaflet zoom cap, as the planner map's own threat fly-to (MapView.tsx ThreatFocusController). */
export const FRAME_MAX_ZOOM = 12;

export interface FrameRow {
  systemId: string;
  position: Coordinates;
  maxRange_nm: number;
}

export interface OverviewFrame {
  center: Coordinates;
  halfWidth_nm: number;
  halfHeight_nm: number;
  /** [[south, west], [north, east]], what fitBounds takes. */
  bounds: [[number, number], [number, number]];
  /** Sites whose whole ring is inside the box. */
  ringsWhole: string[];
  /** Sites outside the box (farther than FRAME_MAX_HALF_NM): a row says so. */
  sitesOff: string[];
}

const ok = (p: Coordinates | null | undefined): p is Coordinates => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

export function frameAround(center: Coordinates | null, sites: FrameRow[]): OverviewFrame | null {
  if (!ok(center)) return null;
  const cosLat = Math.max(0.01, Math.cos((center.lat * Math.PI) / 180));
  let hx = 0;
  let hy = 0;
  const ringsWhole: string[] = [];
  const sitesOff: string[] = [];
  for (const site of sites) {
    if (!ok(site.position)) continue;
    const dx = Math.abs((site.position.lon - center.lon) * 60 * cosLat);
    const dy = Math.abs((site.position.lat - center.lat) * 60);
    const d = Math.hypot(dx, dy);
    const r = Number.isFinite(site.maxRange_nm) && site.maxRange_nm > 0 ? site.maxRange_nm : 0;
    if (d + r <= FRAME_MAX_HALF_NM) {
      // The whole ring fits: the box holds the ring's own square round the site.
      hx = Math.max(hx, dx + r);
      hy = Math.max(hy, dy + r);
      ringsWhole.push(site.systemId);
    } else if (d <= FRAME_MAX_HALF_NM) {
      hx = Math.max(hx, dx);
      hy = Math.max(hy, dy);
    } else {
      sitesOff.push(site.systemId);
    }
  }
  // Nothing above can pass the cap (a ring is framed only when d + r fits, a site only when d does), so only the floor is set here.
  const halfWidth_nm = Math.max(hx, FRAME_MIN_HALF_NM);
  const halfHeight_nm = Math.max(hy, FRAME_MIN_HALF_NM);
  const dLat = halfHeight_nm / 60;
  const dLon = halfWidth_nm / (60 * cosLat);
  return {
    center,
    halfWidth_nm,
    halfHeight_nm,
    bounds: [
      [center.lat - dLat, center.lon - dLon],
      [center.lat + dLat, center.lon + dLon],
    ],
    ringsWhole,
    sitesOff,
  };
}
