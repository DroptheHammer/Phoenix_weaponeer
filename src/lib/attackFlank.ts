import type { AttackProfile, IpAnchorFields } from '../types/attack.types';
import type { Waypoint } from '../types/waypoint.types';
import type { Side } from './attackGeometry';
import { describeRunIn } from './runIn';
import { applyPopupPlan } from './popupPlanning';
import { applyLoftPlan } from './loftPlanning';
import { resolveIpAnchor } from './ipAnchor';
import { calculateBearing, calculateDistance } from './coordinates';

/**
 * The delivery profiles that fly a run-in from a flank. A loft runs straight
 * from the IP at the target (no action point, no check turn, no flank), and
 * standoff has none either, so `applyFlank` leaves both alone.
 */
type FlankedProfile = Extract<AttackProfile, { type: 'dive_ccip' | 'level_ccrp' | 'popup_ccip' }>;

function isFlanked(profile: AttackProfile): profile is FlankedProfile {
  return profile.type === 'dive_ccip' || profile.type === 'level_ccrp' || profile.type === 'popup_ccip';
}

/**
 * Change which flank the attack runs in from, keeping every other number.
 *
 * The Ingress toggle used to call `resetToProfile()`, throwing away a
 * hand-customized profile wholesale: type a dive angle, pick the other flank,
 * and the dive angle silently reverted to the library default. Choosing a side
 * is not a reason to discard the rest of the plan.
 *
 * The attack heading is not independent — it falls out of the action point,
 * the check turn and the join range — so flipping the flank re-derives it
 * through `describeRunIn`, the same solve the delivery forms use. If the
 * geometry cannot be described (an incomplete profile), the direction still
 * changes and the heading is left alone rather than set to nonsense.
 */
export function applyFlank(
  profile: AttackProfile,
  side: Side,
  directBearing_deg: number | undefined,
  targetElevation_ft = 0,
): AttackProfile {
  if (!isFlanked(profile)) return profile;
  const next: FlankedProfile = { ...profile, offsetDirection: side };
  if (directBearing_deg == null || !Number.isFinite(directBearing_deg)) return next;

  const heading = describeRunIn(next, directBearing_deg, targetElevation_ft)?.attackHeading;
  if (heading == null || !Number.isFinite(heading)) return next;

  return next.type === 'popup_ccip'
    ? { ...next, runInHeading_deg: heading }
    : { ...next, ingressHeading_deg: heading };
}

/**
 * Re-derive the headings after the IP moves, keeping every other number.
 *
 * The attack heading hangs off the IP→target bearing, but a customized profile
 * stores it. Moving the IP only rewrote the IP fields: the picture re-solves
 * the heading from the live IP and drew correctly, but the card's Attack HDG,
 * its egress heading and the straight-in check all read the stored one, which
 * still pointed from the old IP until some other field was touched. Pop-up
 * recomputes its whole plan, dive and level re-solve the heading the way a
 * flank change does. A loft's heading IS the new bearing, and its F-4E pull-up
 * timer counts from the IP, so it also needs `ipToTarget_nm` (without one the
 * timer is cleared rather than left counting from the old IP). Same fallback
 * as `applyFlank`: no usable bearing, no change.
 */
export function reanchorProfile(
  profile: AttackProfile,
  directBearing_deg: number | undefined,
  targetElevation_ft = 0,
  ipToTarget_nm?: number,
): AttackProfile {
  if (directBearing_deg == null || !Number.isFinite(directBearing_deg)) return profile;
  if (profile.type === 'loft_ccrp') return applyLoftPlan(profile, directBearing_deg, ipToTarget_nm);
  if (!isFlanked(profile)) return profile;
  if (profile.type === 'popup_ccip') return applyPopupPlan(profile, directBearing_deg);
  return applyFlank(profile, profile.offsetDirection ?? 'right', directBearing_deg, targetElevation_ft);
}

/**
 * Point a customized profile at a new IP — a waypoint, a custom point, or
 * neither (the prior waypoint) — and re-derive its headings from the new
 * IP→target bearing, the same bearing auto-build measures.
 */
export function moveIp(profile: AttackProfile, ip: IpAnchorFields, waypoints: Waypoint[], target: Waypoint): AttackProfile {
  const next = { ...profile, ipWaypointId: ip.ipWaypointId, customIp: ip.customIp } as AttackProfile;
  const anchor = resolveIpAnchor(waypoints, target, ip);
  const bearing = anchor ? calculateBearing(anchor.point, target.coordinates) : undefined;
  const distance = anchor ? calculateDistance(anchor.point, target.coordinates) : undefined;
  return reanchorProfile(next, bearing, target.elevation_ft ?? 0, distance);
}

/**
 * Change which way the attack leaves.
 *
 * `resolveEgressHeading` prefers an explicit `egressHeading_deg` over the
 * direction, so a profile carrying a typed egress heading would ignore this
 * toggle entirely — the button would light up and the map would not move. The
 * typed heading is therefore cleared: picking a side is a request to go back to
 * the 90° break off the attack heading, on that side (a loft's is the 120°
 * escape turn).
 */
export function applyEgress(profile: AttackProfile, direction: 'left' | 'right'): AttackProfile {
  if (profile.type === 'loft_ccrp') return { ...profile, egressDirection: direction, egressHeading_deg: undefined };
  if (!isFlanked(profile)) return profile;
  return { ...profile, egressDirection: direction, egressHeading_deg: undefined };
}
