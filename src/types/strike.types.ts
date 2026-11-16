import type { IpAnchorFields } from './attack.types';

/**
 * Which test warns that a jet is exposed to another jet's bomb. 'burst': the
 * jet is inside the bomb's blast radius at the moment it goes off (distance
 * only, as DCS's blast works). 'time': the real-world spacing habit, a jet
 * over the target within the earlier jet's frag clear time.
 */
export type FragRule = 'burst' | 'time';

/**
 * Two to four jets of the flight on one coordinated attack.
 *
 * The members are the attacks carrying this `strikeId`, ordered by time over
 * the target (`strikeMembers`); the lead is the jet first on target, at
 * offset 0, not the lowest flight position (ties fall back to flight
 * position, then sequence). The strike owns what
 * the jets share — the IP and the default spacing over the target — and
 * writes the IP onto every member's profile (`applyStrikeIp`), so the map,
 * the card and auto-build read each attack exactly as they read a single one.
 */
export interface Strike {
  id: string;
  /** "Viper 1 strike" — the planner may rename it. */
  name: string;
  /** The shared IP. `{}` is Auto: each jet runs in from the waypoint before its own target. */
  ip: IpAnchorFields;
  /** Default seconds between consecutive jets over the target. */
  spacing_s: number;
  /**
   * How this strike's frag warning is worked out. It travels with the mission
   * so the whole squadron sees the same warnings. Left out, or a value this
   * build does not know, reads as `strikeFragRule`'s default.
   */
  fragRule?: FragRule;
}
