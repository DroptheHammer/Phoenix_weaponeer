import type { IpAnchorFields } from './attack.types';

/**
 * Two to four jets of the flight on one coordinated attack.
 *
 * The members are the attacks carrying this `strikeId`, ordered by the
 * attacker's flight position; the lowest is the lead. The strike owns what
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
}
