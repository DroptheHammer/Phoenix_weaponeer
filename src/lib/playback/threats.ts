/**
 * Threat domes: each threat's outer envelope as a half-ellipsoid in the
 * playback's local frame, max range across and max altitude up. One function
 * gives the dome's height at a distance (`domeHeightAt_m`); the mesh the 3D
 * scene draws and the "inside" test both use it, so a highlight never
 * disagrees with what is drawn. Both work in the local frame, the plane the
 * mesh is drawn in. Min range and min altitude are ignored (an outer envelope).
 *
 * Author-hidden threats are filtered HERE, with the planner's own rule
 * (`isThreatVisible`, either DCS flag hides, an Admin reveal shows), whatever
 * list the caller passes: a dome would give a hidden position away.
 */

import type { ThreatInstance } from '../../types';
import { type HiddenReveal, isThreatVisible } from '../threatVisibility';
import { FT_TO_M, NM_TO_M, toLocal, upOf } from './frame';
import type { DomeSystem, LocalFrame, ThreatDome } from './types';

/**
 * The domes of the threats this planner may see. `baseOf` gives a dome's base
 * in MSL ft (with real terrain: the ground under the threat); without it, or
 * when it returns undefined, the base is the frame origin's elevation (the
 * lead target's), the planner's flat-ground datum. Threats whose system is
 * unknown or has no range or altitude get no dome. Status and source are
 * carried through for styling, not filtered.
 */
export function threatDomes(
  threats: ThreatInstance[],
  systems: DomeSystem[],
  reveal: HiddenReveal,
  frame: LocalFrame,
  baseOf?: (threat: ThreatInstance) => number | undefined,
): ThreatDome[] {
  const domes: ThreatDome[] = [];
  for (const t of threats) {
    if (!isThreatVisible(t, reveal)) continue;
    const sys = systems.find((s) => s.id === t.systemId);
    if (!sys || !(sys.max_range_nm > 0) || !(sys.max_altitude_ft > 0)) continue;
    const local = toLocal(frame, t.position);
    const base_ft = baseOf?.(t) ?? frame.originElevation_ft;
    domes.push({
      threatId: t.id, systemId: sys.id, status: t.status, source: t.source, centre: t.position,
      e_m: local.e_m, n_m: local.n_m, base_ft, base_up_m: upOf(frame, base_ft),
      radius_nm: sys.max_range_nm, radius_m: sys.max_range_nm * NM_TO_M,
      height_ft: sys.max_altitude_ft, height_m: sys.max_altitude_ft * FT_TO_M,
    });
  }
  return domes;
}

/** The dome's height above its base at horizontal distance `r_m` from its centre, metres; 0 at and beyond the rim. */
export function domeHeightAt_m(dome: Pick<ThreatDome, 'radius_m' | 'height_m'>, r_m: number): number {
  if (!(r_m < dome.radius_m)) return 0;
  const x = r_m / dome.radius_m;
  return dome.height_m * Math.sqrt(1 - x * x);
}

/** Whether a point in the local frame (e, n, up in metres) is inside the dome: over its footprint, between its base and its surface. */
export function insideDome(dome: ThreatDome, e_m: number, n_m: number, up_m: number): boolean {
  const r = Math.hypot(e_m - dome.e_m, n_m - dome.n_m);
  const z = up_m - dome.base_up_m;
  return r <= dome.radius_m && z >= 0 && z <= domeHeightAt_m(dome, r);
}
