/**
 * Loose formation, display only. Jets that push together fly side by side
 * instead of on top of each other: the mirrored #1 and #2 of a pop-up strike
 * with equal delays cross the IP 0.003 s apart on the very same IP → action
 * point line, and would be drawn as one jet.
 *
 * Each jet's lateral slot is a sum over the other jets of
 *   weight(push difference) × weight(distance apart now) × weight(direction) × share
 * - push weight: 1 within 2 s, easing to 0 at 6 s (smoothstep), so dragging a
 *   delay never makes a jet jump sideways;
 * - distance weight: 1 while the two unslotted displayed tracks are within one
 *   slot of each other, easing to 0 at two slots, so the slot fades as the
 *   drawn lines diverge (after the action point for mirrored jets) and stays
 *   as long as they coincide;
 * - direction weight: the slot is sideways to the jet's own heading, so once
 *   the other jet's track is apart, the slot can point TOWARD it (egress turns
 *   toward each other) and would pull the pair closer than the plan puts
 *   them. `directionWeight` gives that jet's share none when the slot points
 *   toward it (cosine −0.3 or less), all when square to it or away (0 or
 *   more), blended in by distance: no effect while the tracks coincide (where
 *   the direction means nothing and the slot must stay), full from one slot
 *   apart. A slot owed to one jet can still move a jet toward a third: two
 *   jets on one line must split, and one of them may have to slide toward a
 *   third jet to do it;
 * - share: jets on opposite flanks each move half a slot out, toward the side
 *   they will turn to; of two on the same flank, the one listed later moves a
 *   whole slot further out. Jets with no flank (lofts) alternate left, right.
 * So two jets with tied pushes are always at least one slot apart while their
 * plan lines coincide. Everything is continuous in time and in the delays, and
 * smooth (C1) in time: the distances are the displayed tracks' (C1), and the
 * slot direction turns smoothly (`slotDirection`).
 */

import { disp, displayAt, slotDir, slotDirection } from './display';
import { NM_TO_M } from './frame';
import type { JetTrack, StrikePlayback, StrikeTiming } from './types';

/** Pushes this close fly full formation; by FADE_TO_S apart, none. */
export const FORMATION_TOL_S = 2;
export const FORMATION_FADE_TO_S = 6;

const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** 1 within FORMATION_TOL_S, easing to 0 at FORMATION_FADE_TO_S. */
export function pushWeight(dPush_s: number): number {
  return 1 - smoothstep((Math.abs(dPush_s) - FORMATION_TOL_S) / (FORMATION_FADE_TO_S - FORMATION_TOL_S));
}

/**
 * The direction weight: `cosAway` is the cosine between the slot's direction
 * and the direction away from the other jet, `apart` the unslotted distance
 * in slots. 1 while the tracks coincide; from one slot apart, 1 when the slot
 * points away or square to the other jet (cos ≥ 0: a sideways move only adds
 * distance, so jets in trail keep their full slot), 0 when it points toward
 * it (cos ≤ −0.3).
 */
export function directionWeight(cosAway: number, apart: number): number {
  return 1 - smoothstep(apart) * (1 - smoothstep(cosAway + 1));
}

/** −1 left, +1 right: the jet's flank, or alternating by strike order when it has none. */
export function slotSide(track: JetTrack, index: number): number {
  if (track.flank) return track.flank === 'left' ? -1 : 1;
  return index % 2 === 0 ? -1 : 1;
}

/**
 * Jet `jet`'s lateral slot at strike time `t_s`, metres, + right of its
 * `slotDirection` (the displayed heading on straight stretches and steady
 * turns, smoothed through the changes). 0 for a jet alone.
 */
export function formationLateral_m(pb: StrikePlayback, timing: StrikeTiming, jet: number, t_s: number): number {
  const n = pb.jets.length;
  const S = pb.options.formationSpacing_nm * NM_TO_M;
  if (n < 2 || !(S > 0)) return 0;
  const me = pb.jets[jet];
  const myPush = timing.jets[jet].push_s;
  const myTau = t_s - timing.jets[jet].shift_s;
  const side = slotSide(me, jet);
  // The slot's unit direction: `side` times right of slotDirection, (n, −e).
  slotDirection(me, myTau);
  const ue = side * slotDir.n, un = -side * slotDir.e;
  displayAt(me, myTau);
  const e = disp.e, nn = disp.n;
  let share = 0;
  for (let j = 0; j < n; j++) {
    if (j === jet) continue;
    const wp = pushWeight(timing.jets[j].push_s - myPush);
    if (wp === 0) continue;
    const c = slotSide(pb.jets[j], j) !== side ? 0.5 : j < jet ? 1 : 0;
    if (c === 0) continue;
    displayAt(pb.jets[j], t_s - timing.jets[j].shift_s);
    const dx = disp.e - e, dy = disp.n - nn, dist = Math.hypot(dx, dy);
    const wd = 1 - smoothstep((dist - S) / S);
    if (wd === 0) continue;
    const wa = dist > 0 && (ue !== 0 || un !== 0) ? directionWeight(-(ue * dx + un * dy) / dist, dist / S) : 1;
    share += wp * wd * wa * c;
  }
  return side * S * share;
}
