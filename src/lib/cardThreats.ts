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
  const aReaches = a.maxRange_nm > 0 && a.distance_nm <= a.maxRange_nm;
  const bReaches = b.maxRange_nm > 0 && b.distance_nm <= b.maxRange_nm;
  if (aReaches !== bReaches) return aReaches ? -1 : 1;
  return a.distance_nm - b.distance_nm;
}
