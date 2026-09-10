import type { AttackProfile } from '../types/attack.types';
import type { Side } from './attackGeometry';
import { describeRunIn } from './runIn';

/** The delivery profiles that fly a run-in from a flank. Loft and standoff do not. */
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
 * Change which way the attack leaves.
 *
 * `resolveEgressHeading` prefers an explicit `egressHeading_deg` over the
 * direction, so a profile carrying a typed egress heading would ignore this
 * toggle entirely — the button would light up and the map would not move. The
 * typed heading is therefore cleared: picking a side is a request to go back to
 * the 90° break off the attack heading, on that side.
 */
export function applyEgress(profile: AttackProfile, direction: 'left' | 'right'): AttackProfile {
  if (!isFlanked(profile)) return profile;
  return { ...profile, egressDirection: direction, egressHeading_deg: undefined };
}
