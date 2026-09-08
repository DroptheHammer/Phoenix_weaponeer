/**
 * One description of how an attack gets from the route onto the target, read
 * off a saved profile. The editor's hint, the card's steps and auto-build's
 * result all use it, so they cannot disagree.
 */

import type { AttackProfile } from '../types/attack.types';
import {
  attackHeadingFromActionPoint,
  diveGroundRange_nm,
  levelReleaseRange_nm,
  LEVEL_RUN_IN_NM,
  flankSign,
  normalizeHeading,
  solveOffsetLeg,
  type Side,
  type Turn,
} from './attackGeometry';
import { popupActionOf } from './popupPlanning';

export interface RunInSummary {
  /** Bearing IP → target: the route leg. */
  directBearing: number;
  /** Range from the target where the check turn is made. */
  actionRange_nm: number;
  /** The check turn at the action point. */
  offsetTurn: Turn;
  /** Heading flown on the offset leg. */
  approachHeading: number;
  attackHeading: number;
  /** Range from the target where the aircraft turns onto the attack: roll-in, pull-down, run-in start. */
  joinRange_nm: number;
  /** That turn, as flown. */
  joinTurn: Turn;
  /** What the join point is called for this delivery. */
  joinLabel: 'roll in' | 'pull down' | 'run in';
  /** False when the check turn is too wide for the range and the picture does not close. */
  closes: boolean;
  /** Level CCRP only: the offset leg length in nm. */
  legLength_nm?: number;
  /** Level CCRP only: time on the leg in seconds. */
  legTime_s?: number;
  /** Level CCRP only: axis displacement in degrees. */
  axisOffset_deg?: number;
  /** Level CCRP only: angle-off in degrees. */
  angleOff_deg?: number;
  /** Level CCRP only: 2-ship azimuth split in degrees. */
  split_deg?: number;
}

/**
 * Describe a saved profile's run-in. Undefined for saves that predate the
 * action-point model (they carry no action range) — those draw the old
 * straight transit.
 */
export function describeRunIn(profile: AttackProfile, directBearing_deg: number, targetElevation_ft = 0): RunInSummary | undefined {
  const direct = normalizeHeading(directBearing_deg);

  if (profile.type === 'popup_ccip') {
    const { action, pullDown_deg } = popupActionOf(profile, direct);
    const s = flankSign(action.side);
    const approachHeading = normalizeHeading(direct - s * action.offsetTurn_deg);
    const attackHeading = normalizeHeading(approachHeading + s * pullDown_deg);
    return {
      directBearing: direct,
      actionRange_nm: action.actionRange_nm,
      offsetTurn: { deg: action.offsetTurn_deg, direction: action.side },
      approachHeading,
      attackHeading,
      joinRange_nm: profile.turnInRange_nm ?? 0,
      joinTurn: { deg: pullDown_deg, direction: s > 0 ? 'right' : 'left' },
      joinLabel: 'pull down',
      closes: profile.geometryCloses ?? true,
    };
  }

  if (profile.type === 'dive_ccip' || profile.type === 'level_ccrp') {
    if (profile.actionRange_nm == null || profile.offsetAngle_deg == null || !profile.offsetDirection) return undefined;
    const side: Side = profile.offsetDirection;
    const s = flankSign(side);
    const joinRange_nm =
      profile.type === 'dive_ccip'
        ? diveGroundRange_nm(profile.rollInAltitude_ft, profile.diveAngle_deg)
        : levelReleaseRange_nm(Math.max(profile.releaseAltitude_ft - targetElevation_ft, 0), profile.releaseSpeed_ktas) + LEVEL_RUN_IN_NM;

    // Level CCRP with offsetLegRatio: derive action range from the live join range.
    let actionRange_nm = profile.actionRange_nm;
    let legLength_nm: number | undefined;
    let legTime_s: number | undefined;
    let axisOffset_deg: number | undefined;
    let angleOff_deg: number | undefined;
    let split_deg: number | undefined;

    if (profile.type === 'level_ccrp' && profile.offsetLegRatio != null) {
      const solution = solveOffsetLeg(joinRange_nm, profile.offsetAngle_deg, profile.offsetLegRatio);
      if (solution) {
        actionRange_nm = solution.actionRange_nm;
        legLength_nm = solution.legLength_nm;
        legTime_s = (legLength_nm / profile.releaseSpeed_ktas) * 3600;
        axisOffset_deg = solution.axisOffset_deg;
        angleOff_deg = solution.angleOff_deg;
        split_deg = solution.split_deg;
      }
    }

    const legLengthForHeading = legLength_nm;
    const action = { directBearing_deg: direct, actionRange_nm, offsetTurn_deg: profile.offsetAngle_deg, side, legLength_nm: legLengthForHeading };
    const computed = attackHeadingFromActionPoint(action, joinRange_nm);
    const approachHeading = normalizeHeading(direct - s * profile.offsetAngle_deg);
    const attackHeading = computed ?? profile.ingressHeading_deg;
    const joinDeg = Math.abs(((attackHeading - approachHeading + 540) % 360) - 180);
    return {
      directBearing: direct,
      actionRange_nm,
      offsetTurn: { deg: profile.offsetAngle_deg, direction: side },
      approachHeading,
      attackHeading,
      joinRange_nm,
      joinTurn: { deg: joinDeg, direction: s > 0 ? 'right' : 'left' },
      joinLabel: profile.type === 'dive_ccip' ? 'roll in' : 'run in',
      closes: computed != null,
      legLength_nm,
      legTime_s,
      axisOffset_deg,
      angleOff_deg,
      split_deg,
    };
  }

  return undefined;
}

/** The attack heading the action-point geometry gives a dive or level profile, or undefined when it cannot close. */
export function actionPointHeading(
  profile: { actionRange_nm?: number; offsetAngle_deg?: number; offsetDirection?: Side; offsetLegRatio?: number },
  directBearing_deg: number | undefined,
  joinRange_nm: number,
): number | undefined {
  if (directBearing_deg == null || profile.actionRange_nm == null || profile.offsetAngle_deg == null || !profile.offsetDirection) return undefined;

  // Level with offsetLegRatio: compute legLength_nm from the ratio.
  const legLength_nm = profile.offsetLegRatio != null ? profile.offsetLegRatio * joinRange_nm : undefined;

  return attackHeadingFromActionPoint(
    { directBearing_deg, actionRange_nm: profile.actionRange_nm, offsetTurn_deg: profile.offsetAngle_deg, side: profile.offsetDirection, legLength_nm },
    joinRange_nm,
  );
}
