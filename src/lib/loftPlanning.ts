/**
 * Loft (toss) attack planning: a low run-in, a wings-level pull to the loft
 * angle, release in the climb, and an escape turn away from the bomb.
 *
 * Sources and the check against them are in docs/DELIVERY_PLANNING.md,
 * "Loft and LABS". In short:
 *
 * - The pull follows USAF T.O. 1F-4C-34-1-1 (F-4C/D/E weapons delivery,
 *   1970/73): "4 G obtained in 2 seconds", military power, and release when
 *   the climb reaches the release (loft) angle. The jet keeps its thrust
 *   equal to its drag, so the climb trades speed for height.
 * - The bomb flies with one drag constant, fitted to that manual's loft
 *   bombing table (Fig 5-9, p.5-28). With it the model reproduces every row
 *   of the table: pull-up-to-impact range within 0.6%, release altitude
 *   within 1.2%, time of fall within 0.3 s, and the range peak near 42°. A
 *   vacuum bomb lands 10–24% long and never peaks, so unlike the pop-up the
 *   loft cannot use one.
 * - The escape is the manual's "wingover escape maneuver to achieve a 120°
 *   turn" (p.2-89) at the F-16 handbook's 4 G (RoKAF BEM §8.13.4.2.2).
 *
 * The pilot states the run-in altitude and speed, the loft angle and the G.
 * Everything else is derived: where to pull, where the bomb comes off, how
 * high and fast, how long it falls. All altitudes are ft AGL over the target,
 * speeds KTAS. The plan is ESTIMATED: one drag constant for every bomb, sea
 * level air, no wind.
 */

import type { LoftCCRPProfile } from '../types/attack.types';
import { FT_PER_NM } from './popupPlanning';

const G_FT_S2 = 32.174;
const KT_TO_FT_S = 1.68781;
const rad = (d: number) => (d * Math.PI) / 180;

/** The pull-up the F-4 loft tables are built on (T.O. 1F-4C-34-1-1 p.5-10). */
export const DEFAULT_LOFT_G = 4;
/** "4 G obtained in 2 seconds" (same page): the G builds up linearly over this time. */
export const LOFT_G_ONSET_S = 2;
/**
 * Quadratic drag on the bomb, as deceleration = k·v² (k per foot). Fitted to
 * T.O. 1F-4C-34-1-1 Fig 5-9 (M117, 300 ft, 500 KTAS, 4 G, release 20–44°).
 * The same k puts Heatblur's DCS F-4E bombing-computer Mk-82 example within
 * 1%. Used for every lofted bomb: the tool has no per-weapon drag.
 */
export const LOFT_DRAG_PER_FT = 7.2e-6;
/** "A wingover escape maneuver to achieve a 120° turn" (T.O. 1F-4C-34-1-1 p.2-89). */
export const LOFT_ESCAPE_TURN_DEG = 120;
/** "Roll to 135° bank, pull down with 4 G" (RoKAF BEM §8.13.4.2.2). */
export const LOFT_ESCAPE_G = 4;
/** "Know minimum stand-off range (typically 0.5 NM for Frag Avoidance)" (RoKAF BEM p.5-33). */
export const LOFT_FRAG_STANDOFF_NM = 0.5;

export interface LoftPlanInput {
  /** AGL, wings level before the pull. */
  ingressAltitude_ft: number;
  /** TAS on the run-in, at the pull-up. */
  speed_ktas: number;
  /** Climb (flight-path) angle at release. */
  loftAngle_deg: number;
  pullG?: number;
}

/** A point of the side view: ground distance from the pull-up point toward the target, and altitude AGL. */
export interface LoftPoint {
  x_ft: number;
  alt_ft: number;
  /**
   * When the jet or bomb is here: on `pullPath` seconds since the pull-up
   * (the last point is at exactly `pullTime_s`); on `bombPath` seconds since
   * release (the last point is at exactly `timeOfFlight_s`). Written by the
   * simulation loop itself, for the 3D playback; the side view and the card
   * never read it. Optional so a hand-made point still type-checks.
   *
   * `pullPath` repeats its last point (same place, same time) when the pull
   * takes a whole multiple of 100 steps: a reader must allow a zero-length
   * final interval.
   */
  t_s?: number;
}

export interface LoftPlan {
  ingressAltitude_ft: number;
  speed_ktas: number;
  loftAngle_deg: number;
  pullG: number;

  /** Pull-up to release. */
  pullTime_s: number;
  pullDistance_ft: number;
  releaseAltitude_ft: number;
  /** Lower than the run-in: the climb costs speed. */
  releaseSpeed_ktas: number;

  /** Release to impact, along the ground. */
  bombRange_ft: number;
  /** Pull-up to impact: where to pull, measured back from the target. */
  pullUpRange_ft: number;
  timeOfFlight_s: number;
  bombApex_ft: number;

  /** The jet from the pull-up point to release, for the side view. */
  pullPath: LoftPoint[];
  /** The bomb from release to impact, for the side view. */
  bombPath: LoftPoint[];
}

/** The bomb from a release state to the ground. Exported for the geo-check worked examples. */
export function bombFlight(speed_ktas: number, angle_deg: number, releaseAltitude_ft: number, drag = LOFT_DRAG_PER_FT) {
  const dt = 0.005;
  const v0 = Math.max(speed_ktas, 0) * KT_TO_FT_S;
  let vx = v0 * Math.cos(rad(angle_deg));
  let vy = v0 * Math.sin(rad(angle_deg));
  let x = 0;
  let y = Math.max(releaseAltitude_ft, 0);
  let t = 0;
  let apex = y;
  const path: LoftPoint[] = [{ x_ft: 0, alt_ft: y, t_s: 0 }];
  // 400 s is far past any loft; it only stops a nonsense input from spinning.
  for (let i = 0; y > 0 && t < 400; i++) {
    const v = Math.hypot(vx, vy);
    const px = x;
    const py = y;
    vx += -drag * v * vx * dt;
    vy += (-G_FT_S2 - drag * v * vy) * dt;
    x += vx * dt;
    y += vy * dt;
    t += dt;
    if (y <= 0) {
      // Land exactly on the ground: interpolate the last step.
      const f = py / (py - y);
      x = px + (x - px) * f;
      t = t - dt + dt * f;
      y = 0;
    }
    apex = Math.max(apex, y);
    if (i % 100 === 0 || y === 0) path.push({ x_ft: x, alt_ft: y, t_s: t });
  }
  return { range_ft: x, timeOfFlight_s: t, apex_ft: apex, path };
}

export function planLoft(input: LoftPlanInput): LoftPlan {
  const ingress = Math.max(input.ingressAltitude_ft, 0);
  const tas = Math.max(input.speed_ktas, 1);
  const angle = Math.min(Math.max(input.loftAngle_deg, 0), 80);
  const pullG = Math.max(input.pullG ?? DEFAULT_LOFT_G, 1.5);

  // The pull: G builds over the onset time, the flight path bends at
  // g(n − cos γ)/V, and the climb trades speed for height.
  const dt = 0.002;
  const target = rad(angle);
  let v = tas * KT_TO_FT_S;
  let gamma = 0;
  let x = 0;
  let h = ingress;
  let t = 0;
  const pullPath: LoftPoint[] = [{ x_ft: 0, alt_ft: h, t_s: 0 }];
  for (let i = 1; gamma < target && t < 60; i++) {
    const n = t < LOFT_G_ONSET_S ? 1 + ((pullG - 1) * t) / LOFT_G_ONSET_S : pullG;
    gamma += ((G_FT_S2 * (n - Math.cos(gamma))) / v) * dt;
    v -= G_FT_S2 * Math.sin(gamma) * dt;
    x += v * Math.cos(gamma) * dt;
    h += v * Math.sin(gamma) * dt;
    t += dt;
    if (i % 100 === 0) pullPath.push({ x_ft: x, alt_ft: h, t_s: t });
  }
  pullPath.push({ x_ft: x, alt_ft: h, t_s: t });

  const releaseSpeed_ktas = v / KT_TO_FT_S;
  const bomb = bombFlight(releaseSpeed_ktas, angle, h);

  return {
    ingressAltitude_ft: ingress,
    speed_ktas: tas,
    loftAngle_deg: angle,
    pullG,
    pullTime_s: t,
    pullDistance_ft: x,
    releaseAltitude_ft: h,
    releaseSpeed_ktas,
    bombRange_ft: bomb.range_ft,
    pullUpRange_ft: x + bomb.range_ft,
    timeOfFlight_s: bomb.timeOfFlight_s,
    bombApex_ft: bomb.apex_ft,
    pullPath,
    bombPath: bomb.path.map((p) => ({ ...p, x_ft: p.x_ft + x })),
  };
}

/**
 * The F-4E's pull-up timer: started by the bomb button over the IP, it runs
 * out at the pull-up point. IP-to-pull-up distance over the run-in speed, no
 * wind (T.O. 1F-4C-34-1-1 sample problem p.5-23; Heatblur's bombing computer
 * does the same). Undefined when the IP is inside the pull-up range.
 */
export function pullUpTimer_s(ipToTarget_ft: number, pullUpRange_ft: number, speed_ktas: number): number | undefined {
  const run = ipToTarget_ft - pullUpRange_ft;
  if (!(run > 0) || !(speed_ktas > 0)) return undefined;
  return run / (speed_ktas * KT_TO_FT_S);
}

/**
 * How far the jet is from the target when its bomb lands, flying the drawn
 * escape: from the release point a turn of `turn_deg` at the release speed
 * and the escape G (the same radius the map's egress arc uses), then
 * straight. Constant speed: ESTIMATED, and on the short side, since the real
 * escape dives and accelerates.
 */
export function jetRangeAtImpact_nm(plan: LoftPlan, turn_deg: number, escapeG = LOFT_ESCAPE_G): number {
  const v = plan.releaseSpeed_ktas * KT_TO_FT_S;
  const radius = (v * v) / (Math.max(escapeG, 1) * G_FT_S2);
  const turn = rad(Math.min(Math.abs(turn_deg), 180));
  const travel = v * plan.timeOfFlight_s;
  // Target at the origin, attack axis along +x, release point short of it.
  // The turn's side does not matter: the target is on the axis.
  const x0 = -plan.bombRange_ft;
  let x: number;
  let y: number;
  const arc = radius * turn;
  if (turn === 0) {
    x = x0 + travel;
    y = 0;
  } else if (travel <= arc) {
    const phi = travel / radius;
    x = x0 + radius * Math.sin(phi);
    y = radius * (1 - Math.cos(phi));
  } else {
    const rest = travel - arc;
    x = x0 + radius * Math.sin(turn) + rest * Math.cos(turn);
    y = radius * (1 - Math.cos(turn)) + rest * Math.sin(turn);
  }
  return Math.hypot(x, y) / FT_PER_NM;
}

/** The egress heading: the planner's explicit value, else the 120° escape turn in the chosen direction. */
export function resolveLoftEgressHeading(
  profile: Pick<LoftCCRPProfile, 'egressDirection' | 'egressHeading_deg'>,
  attackHeading: number,
): number {
  if (profile.egressHeading_deg != null && Number.isFinite(profile.egressHeading_deg)) return profile.egressHeading_deg;
  const s = profile.egressDirection === 'left' ? -1 : 1;
  return (((attackHeading + s * LOFT_ESCAPE_TURN_DEG) % 360) + 360) % 360;
}

/** The plan behind a saved loft attack, from its inputs. */
export function loftPlanOf(profile: Pick<LoftCCRPProfile, 'ingressAltitude_ft' | 'ingressSpeed_ktas' | 'pullUpAngle_deg' | 'pullG'>): LoftPlan {
  return planLoft({
    ingressAltitude_ft: profile.ingressAltitude_ft,
    speed_ktas: profile.ingressSpeed_ktas,
    loftAngle_deg: profile.pullUpAngle_deg,
    pullG: profile.pullG,
  });
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round1 = (v: number) => Math.round(v * 10) / 10;
const round10 = (v: number) => Math.round(v / 10) * 10;

/**
 * Recompute every derived field of a loft profile from its inputs, so the
 * card, the map and the side view print the same numbers. With the IP→target
 * bearing it also writes the attack heading (a loft runs straight from the
 * IP); with the IP→target distance, the pull-up timer.
 */
export function applyLoftPlan(profile: LoftCCRPProfile, directBearing_deg?: number, ipToTarget_nm?: number): LoftCCRPProfile {
  const plan = loftPlanOf(profile);
  const timer =
    ipToTarget_nm != null && Number.isFinite(ipToTarget_nm)
      ? pullUpTimer_s(ipToTarget_nm * FT_PER_NM, plan.pullUpRange_ft, plan.speed_ktas)
      : undefined;
  return {
    ...profile,
    ...(directBearing_deg != null && Number.isFinite(directBearing_deg) ? { ingressHeading_deg: directBearing_deg } : {}),
    pullG: plan.pullG,
    pullUpDistance_nm: round2(plan.pullUpRange_ft / FT_PER_NM),
    releaseAltitude_ft: round10(plan.releaseAltitude_ft),
    releaseSpeed_ktas: Math.round(plan.releaseSpeed_ktas),
    releaseRange_nm: round2(plan.bombRange_ft / FT_PER_NM),
    bombTimeOfFlight_s: round1(plan.timeOfFlight_s),
    pullUpTimer_s: timer != null ? round1(timer) : undefined,
  };
}

/**
 * The F-4E pull-up timer for a loft flown from an IP this far from the
 * target, rounded as the card prints it. Undefined without a distance, or
 * when the IP is inside the pull-up range (no run-in to time).
 */
export function loftPullUpTimer_s(profile: LoftCCRPProfile, ipToTarget_nm: number | undefined): number | undefined {
  return applyLoftPlan(profile, undefined, ipToTarget_nm).pullUpTimer_s;
}
