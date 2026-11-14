/**
 * The playback's one local frame: azimuthal equidistant about the lead's
 * target, built on the planner's own sphere (`calculateDistance`,
 * `calculateBearing`, `calculateDestination`), so the range and bearing of any
 * point from the origin are exactly the planner's. A flat (equirectangular)
 * frame would be 0.036 nm off at 40 nm; the side view keys everything by range
 * to the target, so the range must be exact.
 *
 * Terrain (B2) must go through the same `toLocal` / `fromLocal`, with heights
 * shifted so the DEM at the origin is the origin's planned elevation.
 */

import type { Coordinates } from '../../types';
import { calculateBearing, calculateDestination, calculateDistance } from '../coordinates';
import type { LocalFrame } from './types';

export const FT_TO_M = 0.3048;
export const NM_TO_M = 1852;

export function makeLocalFrame(origin: Coordinates, originElevation_ft: number): LocalFrame {
  return { origin: { lat: origin.lat, lon: origin.lon }, originElevation_ft };
}

/** East and north of the origin, in metres. */
export function toLocal(frame: LocalFrame, p: Coordinates): { e_m: number; n_m: number } {
  const d = calculateDistance(frame.origin, p) * NM_TO_M;
  if (d === 0) return { e_m: 0, n_m: 0 };
  const b = (calculateBearing(frame.origin, p) * Math.PI) / 180;
  return { e_m: d * Math.sin(b), n_m: d * Math.cos(b) };
}

export function fromLocal(frame: LocalFrame, e_m: number, n_m: number): Coordinates {
  const d = Math.hypot(e_m, n_m);
  if (d === 0) return { lat: frame.origin.lat, lon: frame.origin.lon };
  return calculateDestination(frame.origin, (Math.atan2(e_m, n_m) * 180) / Math.PI, d / NM_TO_M);
}

/**
 * `fromLocal` without allocating, for the 60 fps path: the same arithmetic
 * as `calculateDestination` (the planner's 3440.065 nm sphere), step for
 * step, so it gives exactly what `fromLocal` gives.
 */
export function fromLocalInto(frame: LocalFrame, e_m: number, n_m: number, out: { lat: number; lon: number }): void {
  const d = Math.hypot(e_m, n_m);
  if (d === 0) {
    out.lat = frame.origin.lat;
    out.lon = frame.origin.lon;
    return;
  }
  const R = 3440.065;
  const bearingDeg = (Math.atan2(e_m, n_m) * 180) / Math.PI;
  const lat1Rad = (frame.origin.lat * Math.PI) / 180;
  const lon1Rad = (frame.origin.lon * Math.PI) / 180;
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const angularDistance = d / NM_TO_M / R;
  const lat2Rad = Math.asin(Math.sin(lat1Rad) * Math.cos(angularDistance) + Math.cos(lat1Rad) * Math.sin(angularDistance) * Math.cos(bearingRad));
  const lon2Rad = lon1Rad + Math.atan2(Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1Rad), Math.cos(angularDistance) - Math.sin(lat1Rad) * Math.sin(lat2Rad));
  out.lat = (lat2Rad * 180) / Math.PI;
  out.lon = (lon2Rad * 180) / Math.PI;
}

/**
 * Height in the frame for an MSL altitude. Each jet's MSL is its OWN target's
 * elevation plus its AGL, so a member on a higher target flies higher here.
 */
export function upOf(frame: LocalFrame, msl_ft: number): number {
  return (msl_ft - frame.originElevation_ft) * FT_TO_M;
}

/** three.js axes: y up, north = −z, right-handed. */
export function toThree(e_m: number, n_m: number, up_m: number): [x: number, y: number, z: number] {
  return [e_m, up_m, -n_m];
}
