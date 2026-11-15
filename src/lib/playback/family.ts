/**
 * What each delivery family contributes beyond its picture: the planned
 * speeds, the times the planner states (which win over flown times), the bomb
 * fall, and the words on its events. Every number comes from the planner's own
 * functions with the arguments the picture builders use.
 */

import type { DiveCCIPProfile, LevelCCRPProfile, LoftCCRPProfile, PopupCCIPProfile } from '../../types/attack.types';
import type { Coordinates, Waypoint } from '../../types';
import { levelFallVacuum } from '../attackGeometry';
import { calculateBearing, calculateDistance } from '../coordinates';
import { type LoftPlan, loftPlanOf, pullUpTimer_s } from '../loftPlanning';
import { bombFallVacuum, FT_PER_NM, popupActionOf } from '../popupPlanning';
import { isFired } from '../weaponClass';
import type { BombModel, EstimateCode, PlaybackAttack, PlaybackFamily } from './types';

/** A vacuum fall: height below release vy0·t + g·t²/2; ground covered vx·t. */
export interface VacuumModel {
  kind: 'vacuum';
  model: BombModel;
  time_s: number;
  h0_ft: number;
  vx_fps: number;
  vy0_fps: number;
  g_fps2: number;
  range_ft: number;
}

export interface FamilyFacts {
  family: PlaybackFamily;
  /** Planned TAS from the IP to release, and after release (the speeds the picture drew its arcs with). */
  ingress_kt: number;
  egress_kt: number;
  flank?: 'left' | 'right';
  /** Pop-up: the stated "track N s". */
  trackingTime_s?: number;
  /** Loft: the plan behind the picture, and the exact IP→pull-up time when the IP is outside the pull-up range. */
  loftPlan?: LoftPlan;
  pullUpTimer_s?: number;
  /** The bomb: a vacuum fall, or the loft's simulated drag path. */
  fall: VacuumModel | { kind: 'loft'; model: BombModel; time_s: number };
  estimates: EstimateCode[];
  pushLabel: string;
  commitLabel: string;
  releaseLabel: string;
}

export function familyOf(profileType: PlaybackAttack['profileType']): PlaybackFamily | undefined {
  switch (profileType) {
    case 'dive_ccip': return 'dive';
    case 'level_ccrp': return 'level';
    case 'popup_ccip': return 'popup';
    case 'loft_ccrp': return 'loft';
    default: return undefined;
  }
}

const vacuum = (model: BombModel, f: { time_s: number; h0_ft: number; vx_fps: number; g_fps2: number; range_ft: number }, vy0_fps = 0): VacuumModel => ({
  kind: 'vacuum', model, time_s: f.time_s, h0_ft: f.h0_ft, vx_fps: f.vx_fps, vy0_fps, g_fps2: f.g_fps2, range_ft: f.range_ft,
});

/**
 * The release event's word: exactly the word the picture's REL marker starts
 * with (attackPicture.ts), so the playback says what the map and card say.
 * - dive: 'Fire' for a fired weapon, else by delivery mode: DTOS 'System
 *   release', MAN 'Pickle', anything else 'Release';
 * - level: by delivery mode (CCRP when unset): CCRP or AUTO 'Auto-release',
 *   VIS 'Fire', anything else 'Pickle';
 * - pop-up: 'Release'; loft: 'Auto-release'.
 */
export function releaseLabelOf(attack: Pick<PlaybackAttack, 'deliveryMode' | 'weaponClass'>, family: PlaybackFamily): string {
  if (family === 'dive') {
    if (isFired(attack.weaponClass)) return 'Fire';
    return attack.deliveryMode === 'DTOS' ? 'System release' : attack.deliveryMode === 'MAN' ? 'Pickle' : 'Release';
  }
  if (family === 'level') {
    const mode = attack.deliveryMode ?? 'CCRP';
    return mode === 'CCRP' || mode === 'AUTO' ? 'Auto-release' : mode === 'VIS' ? 'Fire' : 'Pickle';
  }
  return family === 'popup' ? 'Release' : 'Auto-release';
}

/**
 * `ipPoint` is where the flight path starts (the IP, or the schematic start);
 * `relAgl_ft` is the side view's release altitude, the number the picture
 * placed the release point with.
 */
export function familyFacts(attack: PlaybackAttack, family: PlaybackFamily, target: Waypoint, ipPoint: Coordinates, relAgl_ft: number): FamilyFacts {
  const common = { pushLabel: 'IP push', estimates: [] as EstimateCode[] };
  if (family === 'dive') {
    const p = attack.profile as DiveCCIPProfile;
    // A bomb dive's release is the ballistic one (diveAim.ts), so the vacuum
    // fall lands on the target, as the pop-up's does. A gun or rocket pass is
    // drawn on the sight line through the target, as it always was: rounds and
    // rockets fly nearly straight.
    const fired = isFired(attack.weaponClass);
    const f = bombFallVacuum(p.releaseAltitude_ft, p.releaseSpeed_ktas, p.diveAngle_deg);
    return {
      ...common, family, ingress_kt: p.releaseSpeed_ktas, egress_kt: p.releaseSpeed_ktas, flank: p.offsetDirection,
      fall: vacuum(fired ? 'vacuumOnSightLine' : 'vacuum', f, f.vy0_fps), estimates: [fired ? 'sightLineBomb' : 'vacuumBomb'],
      commitLabel: 'Roll in', releaseLabel: releaseLabelOf(attack, family),
    };
  }
  if (family === 'level') {
    const p = attack.profile as LevelCCRPProfile;
    return {
      ...common, family, ingress_kt: p.releaseSpeed_ktas, egress_kt: p.releaseSpeed_ktas, flank: p.offsetDirection,
      fall: vacuum('vacuum', levelFallVacuum(relAgl_ft, p.releaseSpeed_ktas)), estimates: ['vacuumBomb'],
      commitLabel: 'Turn in · wings level', releaseLabel: releaseLabelOf(attack, family),
    };
  }
  if (family === 'popup') {
    const p = attack.profile as PopupCCIPProfile;
    const { plan, action } = popupActionOf(p, calculateBearing(ipPoint, target.coordinates));
    const f = bombFallVacuum(plan.releaseAltitude_ft, plan.speed_ktas, plan.diveAngle_deg);
    return {
      ...common, family, ingress_kt: p.runInSpeed_ktas, egress_kt: p.releaseSpeed_ktas ?? p.runInSpeed_ktas, flank: action.side,
      trackingTime_s: plan.trackingTime_s, fall: vacuum('vacuum', f, f.vy0_fps),
      estimates: ['vacuumBomb', 'popClimbChord', 'apexPlacement', 'pullDownShape'],
      commitLabel: 'Pull up', releaseLabel: releaseLabelOf(attack, family),
    };
  }
  const p = attack.profile as LoftCCRPProfile;
  const plan = loftPlanOf(p);
  const labs = attack.deliveryMode === 'LABS';
  return {
    ...common, family, ingress_kt: plan.speed_ktas, egress_kt: plan.releaseSpeed_ktas,
    loftPlan: plan,
    // The exact timer, not the card's 0.1 s rounding (the card prints it for LABS only).
    pullUpTimer_s: pullUpTimer_s(calculateDistance(ipPoint, target.coordinates) * FT_PER_NM, plan.pullUpRange_ft, plan.speed_ktas),
    fall: { kind: 'loft', model: 'loftDrag', time_s: plan.timeOfFlight_s }, estimates: ['loftDragModel'],
    pushLabel: labs ? 'IP push · start timer' : 'IP push',
    commitLabel: labs ? 'Pull up · timer out' : 'Pull up', releaseLabel: releaseLabelOf(attack, family),
  };
}
