/**
 * Pop-up attack planning — the F-16 handbook's rules of thumb.
 *
 * Source: Korean AF Basic Employment Manual Vol 5 (1 Oct 2005) §5.14 and
 * §5.17, a derivative of USAF MCH 11-F16 Vol 5 "F-16 Combat Aircraft
 * Fundamentals". Transcribed and checked against the manual's own worked
 * example in docs/DELIVERY_PLANNING.md. All altitudes are ft AGL, speeds KTAS.
 *
 * The pilot states the dive angle and the release altitude (a floor). With
 * speed, tracking time and G from the profile, the vertical picture follows:
 * climb angle, apex, pull-down altitude, pop-to-pull-down distance, the MAP
 * (where wings-level tracking starts) and the aim-off distance.
 *
 * The ground track is anchored on the route: fly to the **action point** (a
 * round range from the target), make a round **check turn** left or right,
 * run up the offset leg, pop, and pull down onto the target. The pull-down
 * turn — the handbook's angle-off — is whatever closes that geometry, solved
 * here, so the numbers the pilot briefs stay simple. The handbook's guide of
 * angle-off ≈ 2 × climb angle picks the default check turn.
 *
 * Bomb range comes from ballistics tables the tool does not have; a vacuum
 * trajectory lands within ~1.5% of the table for low-drag bombs and is what
 * the ESTIMATED picture uses.
 */

import type { PopupCCIPProfile } from '../types/attack.types';
import { normalizeHeading, flankSign, DEFAULT_ACTION_RANGE_NM, type Side } from './attackGeometry';

export const FT_PER_NM = 6076.12;
const KT_TO_FT_S = 1.69; // the manual's constant
const G_FT_S2 = 32.2; // ditto

export const DEFAULT_TRACKING_TIME_S = 5;
export const DEFAULT_PULL_G = 3.5;

export interface PopupPlanInput {
  diveAngle_deg: number;
  /** AGL. A floor: the pilot releases by this altitude, never below it. */
  releaseAltitude_ft: number;
  /** TAS through the profile; the manual uses the release speed for the whole chain. */
  speed_ktas: number;
  trackingTime_s?: number;
  pullG?: number;
}

/** The vertical picture and the distances that follow from the inputs alone. */
export interface PopupPlan {
  diveAngle_deg: number;
  releaseAltitude_ft: number;
  speed_ktas: number;
  trackingTime_s: number;
  pullG: number;

  groundSpeed_kt: number;
  horizontalTracking_ft: number;
  verticalTracking_ft: number;
  /** Roll-out altitude: release altitude plus what the tracking time costs. */
  trackAltitude_ft: number;

  climbAngle_deg: number;
  /** 2 × climb angle — the manual's general guide for the pull-down turn. */
  doctrinalAngleOff_deg: number;
  apexAltitude_ft: number;
  pullDownAltitude_ft: number;
  /** Ground distance from the pop point to the pull-down point. */
  popToPullDown_ft: number;

  bombRange_ft: number;
  /** MAP: range at which roll-out and tracking begin — bomb range + horizontal tracking. */
  mapDistance_ft: number;
  /** Aim-off distance beyond the target the nose points at while tracking. */
  aimOff_ft: number;
  turnRadius_ft: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Manual: dive angle + 5° for dives of 15° or less, + 10° for steeper. */
export function climbAngleFor(diveAngle_deg: number): number {
  return diveAngle_deg + (diveAngle_deg <= 15 ? 5 : 10);
}

/** Vacuum trajectory from release to the ground. */
export function bombRangeVacuum_ft(releaseAltitude_ft: number, speed_ktas: number, diveAngle_deg: number): number {
  const v = speed_ktas * KT_TO_FT_S;
  const dive = rad(diveAngle_deg);
  const v0y = v * Math.sin(dive);
  const t = (-v0y + Math.sqrt(v0y * v0y + 2 * G_FT_S2 * Math.max(releaseAltitude_ft, 0))) / G_FT_S2;
  return v * Math.cos(dive) * t;
}

export function planPopup(input: PopupPlanInput): PopupPlan {
  const dive = input.diveAngle_deg;
  const release = Math.max(input.releaseAltitude_ft, 0);
  const tas = input.speed_ktas;
  const trackingTime_s = input.trackingTime_s ?? DEFAULT_TRACKING_TIME_S;
  const pullG = input.pullG ?? DEFAULT_PULL_G;

  const groundSpeed_kt = tas * Math.cos(rad(dive));
  const horizontalTracking_ft = groundSpeed_kt * KT_TO_FT_S * trackingTime_s;
  const verticalTracking_ft = tas * KT_TO_FT_S * trackingTime_s * Math.sin(rad(dive));
  const trackAltitude_ft = release + verticalTracking_ft;

  const climbAngle_deg = climbAngleFor(dive);
  // Manual: ×50 for a 3–3.5 G pull-down, ×37.5 for 4.5–5 G.
  const k = pullG < 4 ? 50 : 37.5;
  const apexAltitude_ft = trackAltitude_ft + dive * k;
  const pullDownAltitude_ft = apexAltitude_ft - climbAngle_deg * k;
  const popToPullDown_ft = (apexAltitude_ft * 60) / climbAngle_deg;

  const bombRange_ft = bombRangeVacuum_ft(release, tas, dive);
  const mapDistance_ft = bombRange_ft + horizontalTracking_ft;
  const aimOff_ft = release / Math.tan(rad(Math.max(dive, 1))) - bombRange_ft;
  const v = tas * KT_TO_FT_S;
  const turnRadius_ft = (v * v) / (pullG * G_FT_S2);

  return {
    diveAngle_deg: dive,
    releaseAltitude_ft: release,
    speed_ktas: tas,
    trackingTime_s,
    pullG,
    groundSpeed_kt,
    horizontalTracking_ft,
    verticalTracking_ft,
    trackAltitude_ft,
    climbAngle_deg,
    doctrinalAngleOff_deg: 2 * climbAngle_deg,
    apexAltitude_ft,
    pullDownAltitude_ft,
    popToPullDown_ft,
    bombRange_ft,
    mapDistance_ft,
    aimOff_ft,
    turnRadius_ft,
  };
}

/**
 * Perpendicular distance from the target to the approach leg that a pull-down
 * through `angleOff_deg` needs: the arc of the turn radius ends wings level
 * at the MAP.
 */
export function approachAbeamFor(plan: PopupPlan, angleOff_deg: number): number {
  const th = rad(angleOff_deg);
  return plan.mapDistance_ft * Math.sin(th) + plan.turnRadius_ft * (1 - Math.cos(th));
}

/**
 * The pull-down turn that closes the geometry for a check turn at the action
 * point: the offset leg passes the target at actionRange × sin(checkTurn),
 * and the pull-down arc must start on that leg. Monotonic up to 90°, so a
 * bisection does. Undefined when even a 90° pull-down cannot reach the leg
 * (the check turn is too big for the range).
 */
export function solvePullDownTurn(plan: PopupPlan, actionRange_nm: number, checkTurn_deg: number): number | undefined {
  const abeam_ft = actionRange_nm * FT_PER_NM * Math.sin(rad(checkTurn_deg));
  if (abeam_ft <= 0) return 0;
  if (approachAbeamFor(plan, 90) < abeam_ft) return undefined;
  let lo = 0;
  let hi = 90;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (approachAbeamFor(plan, mid) < abeam_ft) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The check turn the handbook's guide implies (pull-down = 2 × climb angle)
 * for a given action range, rounded to the nearest 5° so the card reads like
 * a briefing: "at 4.5 nm turn right 25°".
 */
export function doctrinalCheckTurn(plan: PopupPlan, actionRange_nm: number): number {
  const abeam_ft = approachAbeamFor(plan, plan.doctrinalAngleOff_deg);
  const exact = deg(Math.asin(Math.min(abeam_ft / (actionRange_nm * FT_PER_NM), 1)));
  return Math.max(5, Math.round(exact / 5) * 5);
}

/**
 * The plan behind a saved pop-up attack, from its inputs. Saves that predate
 * the model still carry every input the chain needs.
 */
export function popupPlanOf(profile: PopupCCIPProfile): PopupPlan {
  return planPopup({
    diveAngle_deg: profile.diveAngle_deg,
    releaseAltitude_ft: profile.releaseAltitude_ft,
    speed_ktas: profile.runInSpeed_ktas,
    trackingTime_s: profile.trackingTime_s,
    pullG: profile.pullG,
  });
}

/** The ground-track inputs of a saved pop-up, with defaults for anything missing. */
export function popupActionOf(profile: PopupCCIPProfile, directBearing_deg: number) {
  const plan = popupPlanOf(profile);
  const actionRange_nm = profile.actionRange_nm ?? DEFAULT_ACTION_RANGE_NM;
  const side: Side = profile.offsetDirection ?? 'right';
  const checkTurn_deg = profile.offsetAngle_deg ?? doctrinalCheckTurn(plan, actionRange_nm);
  const pullDown_deg = profile.pullDownTurn_deg ?? solvePullDownTurn(plan, actionRange_nm, checkTurn_deg) ?? 90;
  return { plan, action: { directBearing_deg, actionRange_nm, offsetTurn_deg: checkTurn_deg, side }, pullDown_deg };
}

const round100 = (v: number) => Math.round(v / 100) * 100;
const round10 = (v: number) => Math.round(v / 10) * 10;
const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Recompute every derived field of a pop-up profile from its inputs, so the
 * card, the map and the diagram all read the same numbers. Call this after
 * any input changes. With the IP→target bearing it also writes the approach
 * and attack headings; without one they are left as they were.
 */
export function applyPopupPlan(profile: PopupCCIPProfile, directBearing_deg?: number): PopupCCIPProfile {
  const plan = popupPlanOf(profile);
  const actionRange_nm = profile.actionRange_nm ?? DEFAULT_ACTION_RANGE_NM;
  const side: Side = profile.offsetDirection ?? 'right';
  const checkTurn_deg = profile.offsetAngle_deg ?? doctrinalCheckTurn(plan, actionRange_nm);
  const pullDown = solvePullDownTurn(plan, actionRange_nm, checkTurn_deg);
  const pullDown_deg = pullDown ?? 90;
  const s = flankSign(side);

  const th = rad(pullDown_deg);
  const pdX = plan.mapDistance_ft + plan.turnRadius_ft * Math.sin(th);
  const pdY = plan.turnRadius_ft * (1 - Math.cos(th));
  const pupX = pdX + plan.popToPullDown_ft * Math.cos(th);
  const pupY = pdY + plan.popToPullDown_ft * Math.sin(th);

  const headings =
    directBearing_deg != null && Number.isFinite(directBearing_deg)
      ? {
          approachHeading_deg: normalizeHeading(directBearing_deg - s * checkTurn_deg),
          runInHeading_deg: normalizeHeading(directBearing_deg - s * checkTurn_deg + s * pullDown_deg),
        }
      : {};

  return {
    ...profile,
    ...headings,
    releaseSpeed_ktas: profile.runInSpeed_ktas,
    trackingTime_s: plan.trackingTime_s,
    pullG: plan.pullG,
    actionRange_nm,
    offsetAngle_deg: checkTurn_deg,
    offsetDirection: side,
    pullDownTurn_deg: Math.round(pullDown_deg * 10) / 10,
    geometryCloses: pullDown != null,
    climbAngle_deg: plan.climbAngle_deg,
    apexAltitude_ft: round100(plan.apexAltitude_ft),
    rollInAltitude_ft: round100(plan.pullDownAltitude_ft),
    trackAltitude_ft: round100(plan.trackAltitude_ft),
    popDistance_nm: round1(Math.hypot(pupX, pupY) / FT_PER_NM),
    turnInRange_nm: round2(Math.hypot(pdX, pdY) / FT_PER_NM),
    mapDistance_nm: round2(plan.mapDistance_ft / FT_PER_NM),
    aimOffDistance_ft: round10(plan.aimOff_ft),
    bombRange_ft: round10(plan.bombRange_ft),
    popToPullDown_nm: round2(plan.popToPullDown_ft / FT_PER_NM),
    turnRadius_nm: round2(plan.turnRadius_ft / FT_PER_NM),
  };
}
