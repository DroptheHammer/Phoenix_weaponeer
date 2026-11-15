/**
 * What the 3D view draws about a falling bomb and where it lands, as plain numbers: no three.js, no DOM.
 *
 * Like the callouts, what shows is a pure function of the clock's time and its speed setting (playing or
 * paused alike), never of what was drawn on the frame before: a seek away and back, a re-timed strike and
 * a rebuilt scene all give the same picture.
 */

import { BOMB_RING_OTHER_R_PX, BOMB_RING_R_PX, OTHER_MARKER_ALPHA } from './sceneStyle';

/** The ring round a bomb starts this many times too wide at the release and settles over this long, real seconds. */
export const RELEASE_PULSE_WALL_S = 0.5;
/** How much wider than its size the ring starts, as a share of that size: 1 is twice as wide. */
export const RELEASE_PULSE_EXTRA = 1;

/** The ring round a falling bomb at rest: its radius in CSS pixels and how solid it is (0…1). */
export interface BombRingLook {
  r: number;
  alpha: number;
}

/**
 * The ring for a bomb of a jet that wears the planner's colour code (`coded`: the watched jet, or every
 * jet with Show › Attack colours › All jets) or of another jet, whose ring is smaller and fainter as its
 * discs are. Writes into `out` and hands it back, so a frame allocates nothing.
 */
export function bombRingLook(coded: boolean, out: BombRingLook): BombRingLook {
  out.r = coded ? BOMB_RING_R_PX : BOMB_RING_OTHER_R_PX;
  out.alpha = coded ? 1 : OTHER_MARKER_ALPHA;
  return out;
}

/**
 * How many times its resting size the ring is `age_s` after the release (strike seconds): 2 at the
 * release, settling to 1 over RELEASE_PULSE_WALL_S real seconds (the stretch of strike time grows with
 * the clock's speed setting, so the pulse is as quick to the eye at 16× as at 1×), and 1 before the
 * release and afterwards. A speed of 0, below 0 or not a number is taken as 1. Never NaN. Stateless.
 */
export function releasePulse(age_s: number, speed: number): number {
  const s = speed > 0 && speed < Infinity ? speed : 1;
  const u = age_s / s;
  if (!(u >= 0) || u >= RELEASE_PULSE_WALL_S) return 1;
  const k = 1 - u / RELEASE_PULSE_WALL_S;
  return 1 + RELEASE_PULSE_EXTRA * k * k;
}
