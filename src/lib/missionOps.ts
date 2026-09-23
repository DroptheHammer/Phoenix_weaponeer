/**
 * Mission-wide edits that touch more than one field, as pure functions of a
 * mission, so geo-check can hold them to their cascades. The store calls these
 * and only adds the bookkeeping (updatedAt, isDirty).
 */

import type { Attack, Coordinates, Mission } from '../types';
import { moveIp } from './attackFlank';
import { applyStrikeIp, strikeOf, tidyStrikes } from './strike';

/** Sequence numbers 1..n in their current order, so a delete never leaves two #2s behind. */
export function renumberAttacks(attacks: Attack[]): Attack[] {
  return [...attacks]
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    .map((a, i) => (a.sequenceNumber === i + 1 ? a : { ...a, sequenceNumber: i + 1 }));
}

/** Delete an attack. A strike left with one jet is ungrouped; one that lost its lead re-bases on the next. */
export function removeAttackFrom(mission: Mission, attackId: string): Mission {
  return tidyStrikes({ ...mission, attacks: renumberAttacks(mission.attacks.filter((a) => a.id !== attackId)) });
}

/**
 * A saved attack's custom IP, dragged on the main map. Goes through `moveIp`
 * so the stored headings follow the IP — writing the point alone left the
 * card printing a heading from where the IP used to be. A strike member's IP
 * is the strike's: moving it moves every jet.
 */
export function moveAttackCustomIp(mission: Mission, attackId: string, point: Coordinates): Mission {
  const attack = mission.attacks.find((a) => a.id === attackId);
  if (attack && strikeOf(mission, attack.strikeId)) return applyStrikeIp(mission, attack.strikeId!, { customIp: point });
  const target = attack && mission.waypoints.find((wp) => wp.id === attack.targetWaypointId);
  if (!attack || !target) return mission;
  const profile = moveIp(attack.profile, { customIp: point }, mission.waypoints, target);
  return { ...mission, attacks: mission.attacks.map((a) => (a.id === attackId ? { ...a, profile } : a)) };
}
