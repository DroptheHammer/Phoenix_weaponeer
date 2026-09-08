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
    const action = { directBearing_deg: direct, actionRange_nm: profile.actionRange_nm, offsetTurn_deg: profile.offsetAngle_deg, side };
    const computed = attackHeadingFromActionPoint(action, joinRange_nm);
    const approachHeading = normalizeHeading(direct - s * profile.offsetAngle_deg);
    const attackHeading = computed ?? profile.ingressHeading_deg;
    const joinDeg = Math.abs(((attackHeading - approachHeading + 540) % 360) - 180);
    return {
      directBearing: direct,
      actionRange_nm: profile.actionRange_nm,
      offsetTurn: { deg: profile.offsetAngle_deg, direction: side },
      approachHeading,
      attackHeading,
      joinRange_nm,
      joinTurn: { deg: joinDeg, direction: s > 0 ? 'right' : 'left' },
      joinLabel: profile.type === 'dive_ccip' ? 'roll in' : 'run in',
      closes: computed != null,
    };
  }

  return undefined;
}

/** The attack heading the action-point geometry gives a dive or level profile, or undefined when it cannot close. */
export function actionPointHeading(
  profile: { actionRange_nm?: number; offsetAngle_deg?: number; offsetDirection?: Side },
  directBearing_deg: number | undefined,
  joinRange_nm: number,
): number | undefined {
  if (directBearing_deg == null || profile.actionRange_nm == null || profile.offsetAngle_deg == null || !profile.offsetDirection) return undefined;
  return attackHeadingFromActionPoint(
    { directBearing_deg, actionRange_nm: profile.actionRange_nm, offsetTurn_deg: profile.offsetAngle_deg, side: profile.offsetDirection },
    joinRange_nm,
  );
}
