/**
 * What the Home view frames, and which camera the playback opens in. Pure.
 *
 * Home frames the attack as it is played: every flown jet and every falling
 * bomb from the start of the clock's range to a few seconds after the last
 * bomb lands, and every target. Not the whole run-in from the IP (unless the
 * range itself starts there): framed on that, the attack is a small mark at
 * one end of a long line.
 */

import type { StrikeWindow } from '../playback';
import type { EnuBox } from './cameraMath';
import { newSceneBombPose, newSceneJetPose, type SceneSource } from './source';

/** Home frames up to this long after the last impact, s. */
export const HOME_AFTER_S = 5;
/** Sampling step of the box, s of strike time. */
export const HOME_STEP_S = 0.25;

/**
 * The box, ENU metres, round every flown jet's display pose and falling bomb
 * (visible ones only) every HOME_STEP_S from range.t0_s to
 * min(range.t1_s, last impact + HOME_AFTER_S), both ends sampled, plus every
 * target. Written into `out` when given. Built once per range, never per
 * frame.
 *
 * Each jet is also sampled at the moment it comes into the picture, the
 * moment it hides, its release and its impact, when they fall inside that
 * span: a jet that appears or hides between two grid samples would otherwise
 * be cut short. At those moments its pose is taken whether or not it reads as
 * visible, because the strike-time round trip can put the jet's own time a
 * hair outside its visible span.
 *
 * With nothing to hold (no jet flown) the box is the terrain's bounds, so the
 * camera still has something to frame.
 */
export function homeBox(src: SceneSource, range: StrikeWindow, out?: EnuBox): EnuBox {
  const box: EnuBox = out ?? { min_e_m: 0, max_e_m: 0, min_n_m: 0, max_n_m: 0, min_up_m: 0, max_up_m: 0 };
  box.min_e_m = box.min_n_m = box.min_up_m = Infinity;
  box.max_e_m = box.max_n_m = box.max_up_m = -Infinity;
  // Three.js axes in, ENU out: north = −z.
  const hold = (x: number, y: number, z: number) => {
    if (x < box.min_e_m) box.min_e_m = x;
    if (x > box.max_e_m) box.max_e_m = x;
    if (-z < box.min_n_m) box.min_n_m = -z;
    if (-z > box.max_n_m) box.max_n_m = -z;
    if (y < box.min_up_m) box.min_up_m = y;
    if (y > box.max_up_m) box.max_up_m = y;
  };

  const t0 = range.t0_s;
  let lastImpact = -Infinity;
  for (let k = 0; k < src.jetCount; k++) lastImpact = Math.max(lastImpact, src.impactOf(k));
  const t1 = Math.max(t0, Math.min(range.t1_s, lastImpact + HOME_AFTER_S));

  const pose = newSceneJetPose();
  const bomb = newSceneBombPose();
  const steps = Math.ceil((t1 - t0) / HOME_STEP_S);
  for (let i = 0; i <= steps; i++) {
    const t = i === steps ? t1 : t0 + i * HOME_STEP_S;
    for (let k = 0; k < src.jetCount; k++) {
      if (src.jetAt(k, t, pose).visible) hold(pose.x, pose.y, pose.z);
      if (src.bombAt(k, t, bomb).visible) hold(bomb.x, bomb.y, bomb.z);
    }
  }
  for (let k = 0; k < src.jetCount; k++) {
    for (const t of [src.visibleFromOf(k), src.hideOf(k), src.releaseOf(k), src.impactOf(k)]) {
      if (!(t >= t0 && t <= t1)) continue;
      src.jetAt(k, t, pose);
      hold(pose.x, pose.y, pose.z);
      if (src.bombAt(k, t, bomb).visible) hold(bomb.x, bomb.y, bomb.z);
    }
    const tg = src.targetOf(k);
    hold(tg.x, tg.y, tg.z);
  }

  if (!Number.isFinite(box.min_e_m)) Object.assign(box, src.bounds);
  return box;
}

/**
 * The camera the playback opens in: following `jet` when it is in the
 * picture at the start of the range, else the orbit camera at Home. A jet
 * whose first action comes much later than the earliest one is still out of
 * sight then, and following it would open on empty sky.
 */
export function openingMode(src: SceneSource, range: StrikeWindow, jet: number): 'chase' | 'orbit' {
  return src.jetAt(jet, range.t0_s, newSceneJetPose()).visible ? 'chase' : 'orbit';
}
