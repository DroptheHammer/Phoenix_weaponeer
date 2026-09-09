import type { KneeboardThreatItem } from '../types/kneeboard.types';

/**
 * How many threat rows the kneeboard card prints, and — since this change —
 * how many threat rings its plan view draws. The two were different: the card
 * built six threats, the table printed the first four, and the plan view drew
 * rings for all six. A pilot could see a ring on the picture belonging to
 * nothing in the table. One number now feeds both.
 */
export const CARD_THREAT_ROWS = 4;

/** How many threats the card carries before the table and picture trim to `CARD_THREAT_ROWS`. */
export const CARD_THREAT_POOL = 6;

/**
 * Card ordering: things that can reach the target first, nearest first within
 * each group.
 *
 * Sorting on distance alone is fine while every threat in the database is a
 * SAM, and stops being fine the moment a 1.3 nm ZU-23 truck or a co-located
 * detection radar is in the mission — either sits closer to the target than a
 * live SA-11 and pushes it off a card that only prints four rows. What a pilot
 * needs at the top is what can actually shoot at the target.
 */
export function compareThreatsForCard(a: KneeboardThreatItem, b: KneeboardThreatItem): number {
  const aShoots = canShoot(a);
  const bShoots = canShoot(b);
  if (aShoots !== bShoots) return aShoots ? -1 : 1;
  return a.distance_nm - b.distance_nm;
}

/**
 * A search radar is not a shooter, however far it can see. A P-19 sits on the
 * SAM site it serves and its 86 nm figure is DETECTION range, so treating it
 * like an engagement envelope would put it top of every card and cost one of
 * the four rows a pilot actually gets.
 */
function canShoot(t: KneeboardThreatItem): boolean {
  if (t.threatType === 'EWR') return false;
  return t.maxRange_nm > 0 && t.distance_nm <= t.maxRange_nm;
}
