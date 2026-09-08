/**
 * Attack geometry: where the aircraft is at each point of a delivery, on the
 * map (lat/lon) and in the numbers the card prints.
 *
 * Every visual delivery is anchored on the route. The aircraft flies the
 * planned leg from the IP toward the target and, at the **action point** (a
 * round range from the target, 4.5 nm by default — the handbook's own choice),
 * takes a **check turn** of a round number of degrees left or right off the
 * direct line. It flies that offset leg until it reaches the point where it
 * joins the attack: the **roll-in** for a dive, the **pull-down point** for a
 * pop-up, the run-in start for a level pass. There it turns onto the target,
 * releases, and breaks away — after release, not over the target.
 *
 * Terms follow the F-16 handbook (docs/DELIVERY_PLANNING.md): action point,
 * approach heading, angle-off (approach vs attack heading), pull-down point,
 * track point / MAP, aim-off distance. "Roll-in" is the dive-bomb term.
 *
 * The side named by an `AngleOff` or a check turn is the *flank the run-in is
 * flown on*, as the pilot sees it from the IP: "ingress from the left" means
 * turn left off the direct line at the action point, come up the target's
 * left flank, and make the final turn right onto it. A `Turn` is a turn as
 * flown, with its own direction.
 */

import type { Coordinates } from '../types';
import { calculateBearing, calculateDistance, calculateDestination } from './coordinates';

// Kept as the canonical name used by this module and its consumers; the
// implementation lives in ./coordinates alongside the other geo math.
export const calculatePointAtDistance = calculateDestination;

export type { Coordinates };
export { calculateBearing, calculateDistance };

const FT_PER_NM = 6076.12;
const G_FT_S2 = 32.174;
const KT_TO_FT_S = 1.68781;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

// ─── Sides, turns, angle off ─────────────────────────────────────────────────

export type Side = 'left' | 'right';

/** +1 for a left-flank ingress (turns toward the target are right turns), −1 for a right-flank one. */
export const flankSign = (side: Side): 1 | -1 => (side === 'left' ? 1 : -1);

/**
 * How far the attack heading sits off the IP→target line, and which flank the
 * run-in is flown on. Ingress from the left flank puts the final turn to the
 * right, so the attack heading is rotated *right* of the direct bearing.
 */
export interface AngleOff {
  deg: number;
  /** The flank the run-in is on, seen from the IP looking at the target. */
  side: Side;
}

/** A turn the pilot actually flies: how far, and which way the nose goes. */
export interface Turn {
  deg: number;
  direction: Side;
}

/** The handbook's action range: take the offset here regardless of where the IP is. */
export const DEFAULT_ACTION_RANGE_NM = 4.5;

/** Default check turn at the action point for dive and level deliveries. Pop-ups derive theirs. */
export const DEFAULT_OFFSET_TURN_DEG = 20;

/** Kept for callers that still rotate a heading directly (legacy saves, tests). */
export const DEFAULT_ANGLE_OFF_DEG = 30;

/** An attack heading within this many degrees of the IP→target line is flagged as straight-in. */
export const STRAIGHT_IN_TOLERANCE_DEG = 5;

export function normalizeHeading(heading: number): number {
  return ((heading % 360) + 360) % 360;
}

/** Signed turn from one heading to another, in (-180, 180]. Negative is a left turn. */
export function signedHeadingDelta(from: number, to: number): number {
  let delta = normalizeHeading(to - from);
  if (delta > 180) delta -= 360;
  return delta;
}

export function opposite(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

/** The attack heading that sits `angleOff` off the direct IP→target bearing. */
export function applyAngleOff(directBearing: number, angleOff: AngleOff): number {
  // Run in on the left flank → final turn right → axis rotated right.
  return normalizeHeading(directBearing + flankSign(angleOff.side) * angleOff.deg);
}

/** Measure an attack heading against the IP→target line: how far off, and from which flank. */
export function angleOffOf(attackHeading: number, directBearing: number): AngleOff {
  const delta = signedHeadingDelta(directBearing, attackHeading);
  return { deg: Math.abs(delta), side: delta > 0 ? 'left' : 'right' };
}

/** The turn from one heading to the next, as the pilot flies it. */
export function turnBetween(fromHeading: number, toHeading: number): Turn {
  const delta = signedHeadingDelta(fromHeading, toHeading);
  return { deg: Math.abs(delta), direction: delta < 0 ? 'left' : 'right' };
}

/** True when the attack runs in along the IP→target line, give or take the tolerance. */
export function isStraightIn(
  attackHeading: number,
  directBearing: number,
  tolerance_deg = STRAIGHT_IN_TOLERANCE_DEG,
): boolean {
  return Math.abs(signedHeadingDelta(directBearing, attackHeading)) <= tolerance_deg;
}

/** Horizontal turn radius at a speed and G, in nm. */
export function turnRadius_nm(speed_ktas: number, g: number): number {
  const v = speed_ktas * KT_TO_FT_S;
  return (v * v) / (Math.max(g, 1) * G_FT_S2) / FT_PER_NM;
}

// ─── The action point and the offset leg ─────────────────────────────────────

/** Where the offset is taken and which way. */
export interface ActionPointInput {
  /** Bearing IP → target: the route leg the aircraft is flying. */
  directBearing_deg: number;
  /** Range from the target at which the check turn is made. */
  actionRange_nm: number;
  /** The check turn, degrees off the direct line. */
  offsetTurn_deg: number;
  /** Which flank the offset leg runs up. */
  side: Side;
}

export interface ActionPointLeg {
  actionPoint: Coordinates;
  /** Heading flown on the offset leg. */
  approachHeading: number;
  offsetTurn: Turn;
  /** Perpendicular distance from the target to the offset leg. */
  abeam_nm: number;
}

/** The action point on the route and the offset leg leaving it. */
export function actionPointLeg(targetPoint: Coordinates, input: ActionPointInput): ActionPointLeg {
  const s = flankSign(input.side);
  const direct = normalizeHeading(input.directBearing_deg);
  const actionPoint = calculatePointAtDistance(targetPoint, normalizeHeading(direct + 180), input.actionRange_nm);
  const approachHeading = normalizeHeading(direct - s * input.offsetTurn_deg);
  return {
    actionPoint,
    approachHeading,
    offsetTurn: { deg: input.offsetTurn_deg, direction: input.side },
    abeam_nm: input.actionRange_nm * Math.sin(rad(input.offsetTurn_deg)),
  };
}

/**
 * Where the offset leg first comes within `joinRange_nm` of the target — the
 * roll-in for a dive, the run-in start for a level pass — and the turn onto
 * the target there. Undefined when the leg never gets that close (the check
 * turn is too big for the range).
 */
export function joinPointOnLeg(
  targetPoint: Coordinates,
  input: ActionPointInput,
  joinRange_nm: number,
): { point: Coordinates; attackHeading: number; joinTurn: Turn; alongLeg_nm: number; leg: ActionPointLeg } | undefined {
  const leg = actionPointLeg(targetPoint, input);
  if (leg.abeam_nm > joinRange_nm) return undefined;
  const s = flankSign(input.side);
  const delta = rad(input.offsetTurn_deg);
  // Triangle TGT–A–P: TGT–A = actionRange, angle at A = check turn, TGT–P = joinRange.
  const alongLeg_nm =
    input.actionRange_nm * Math.cos(delta) - Math.sqrt(Math.max(joinRange_nm ** 2 - leg.abeam_nm ** 2, 0));
  // The join must come after the check turn; otherwise the action point is too close in.
  if (alongLeg_nm < 0) return undefined;
  const point = calculatePointAtDistance(leg.actionPoint, leg.approachHeading, alongLeg_nm);
  // The turn onto the target from the leg: sin(turn) = abeam / joinRange.
  const joinTurnDeg = deg(Math.asin(Math.min(leg.abeam_nm / joinRange_nm, 1)));
  const attackHeading = normalizeHeading(leg.approachHeading + s * joinTurnDeg);
  return {
    point,
    attackHeading,
    joinTurn: { deg: joinTurnDeg, direction: s > 0 ? 'right' : 'left' },
    alongLeg_nm,
    leg,
  };
}

/** The attack heading the action-point geometry produces, without positions. */
export function attackHeadingFromActionPoint(input: ActionPointInput, joinRange_nm: number): number | undefined {
  const abeam = input.actionRange_nm * Math.sin(rad(input.offsetTurn_deg));
  if (abeam > joinRange_nm) return undefined;
  if (input.actionRange_nm * Math.cos(rad(input.offsetTurn_deg)) < Math.sqrt(joinRange_nm ** 2 - abeam ** 2)) return undefined;
  const s = flankSign(input.side);
  const joinTurn = deg(Math.asin(abeam / joinRange_nm));
  return normalizeHeading(input.directBearing_deg - s * input.offsetTurn_deg + s * joinTurn);
}

// ─── Egress ──────────────────────────────────────────────────────────────────

export interface EgressPath {
  /** The break: an arc from the release point onto the egress heading. */
  arc: Coordinates[];
  /** Where the arc ends and the egress leg begins. */
  rollOut: Coordinates;
  /** End of the drawn egress leg. */
  end: Coordinates;
  egressHeading: number;
  turn: Turn;
}

/**
 * The break after release: a turn at the release speed and G from the attack
 * heading onto the egress heading, then a mile on that heading. Nothing here
 * crosses the target.
 */
export function egressPath(
  releasePoint: Coordinates,
  attackHeading: number,
  egressHeading: number,
  speed_ktas: number,
  g: number,
  legLength_nm = 1.0,
): EgressPath {
  const turn = turnBetween(attackHeading, egressHeading);
  const radius = turnRadius_nm(speed_ktas, g);
  const arc: Coordinates[] = [releasePoint];
  let rollOut = releasePoint;
  if (turn.deg >= 1) {
    const s = turn.direction === 'right' ? 1 : -1;
    const centre = calculatePointAtDistance(releasePoint, normalizeHeading(attackHeading + 90 * s), radius);
    const startBearing = normalizeHeading(attackHeading - 90 * s); // centre → release point
    const steps = Math.max(2, Math.ceil(turn.deg / 10));
    for (let i = 1; i <= steps; i++) {
      arc.push(calculatePointAtDistance(centre, normalizeHeading(startBearing + s * turn.deg * (i / steps)), radius));
    }
    rollOut = arc[arc.length - 1];
  }
  return {
    arc,
    rollOut,
    end: calculatePointAtDistance(rollOut, egressHeading, legLength_nm),
    egressHeading,
    turn,
  };
}

/**
 * Egress heading for a profile: the planner's explicit value when set, else a
 * 90° break off the attack heading in the chosen direction.
 *
 * The map overlay and the kneeboard card must agree on this. The card used to
 * print the raw profile field — which is usually unset — as "undefined°".
 */
export function resolveEgressHeading(
  egress: { egressDirection?: 'left' | 'right' | 'straight'; egressHeading_deg?: number },
  attackHeading: number,
): number {
  if (egress.egressHeading_deg != null && Number.isFinite(egress.egressHeading_deg)) {
    return egress.egressHeading_deg;
  }
  if (egress.egressDirection === 'left') return normalizeHeading(attackHeading - 90);
  if (egress.egressDirection === 'right') return normalizeHeading(attackHeading + 90);
  return attackHeading;
}

// ─── Pop-up geometry ──────────────────────────────────────────────────────────
//
// The offset pop-up of the F-16 handbook, placed on the ground:
//
//   IP ── route ──► AP ═ offset leg ═► PUP ═ climb ═► PDP ╮ pull-down arc
//                                                       ╰─► TRK ── track ──► REL ·· TGT ·· AOD
//                                                                             ╰ egress arc
//
// The check turn at the action point sets the offset leg; the pull-down is an
// arc of the plan's turn radius through the angle-off, ending wings level at
// the track point (the MAP) on the attack axis. The angle-off is whatever
// closes the geometry for the chosen action range and check turn — solved in
// popupPlanning.ts — so the pilot's numbers stay round and the picture lines up.

export interface PopupGeometryParams {
  mapDistance_ft: number;
  turnRadius_ft: number;
  popToPullDown_ft: number;
  bombRange_ft: number;
  aimOff_ft: number;
  /** The pull-down turn, approach heading → attack heading. */
  angleOff_deg: number;
  action: ActionPointInput;
  egressHeading_deg: number;
  egressSpeed_ktas: number;
  egressG: number;
}

export interface PopupGeometry {
  ipPoint: Coordinates;
  actionPoint: Coordinates;
  /** POP: pull up here. */
  pullUpPoint: Coordinates;
  /** PDP: roll toward the target and pull down onto the attack heading. */
  pullDownPoint: Coordinates;
  /** The pull-down arc, PDP → track point, for drawing. */
  pullDownArc: Coordinates[];
  /** TRK / MAP: wings level, tracking begins. */
  trackPoint: Coordinates;
  /** Where the bomb comes off. */
  releasePoint: Coordinates;
  targetPoint: Coordinates;
  /** AOD: where the nose points during tracking, beyond the target. */
  aimOffPoint: Coordinates;
  egress: EgressPath;

  /** IP → action point: the route leg. */
  routeHeading: number;
  approachHeading: number;
  attackHeading: number;
  offsetTurn: Turn;
  /** The pull-down turn, approach heading → attack heading. */
  pullDown: Turn;

  actionRange_nm: number;
  popRange_nm: number;
  pullDownRange_nm: number;
  mapDistance_nm: number;
  releaseRange_nm: number;
  climbDistance_nm: number;
  /** Wings-level distance from the action point to the pop. Negative means the pop is before the action point. */
  holdDown_nm: number;
}

export function calculatePopupGeometry(ipPoint: Coordinates, targetPoint: Coordinates, params: PopupGeometryParams): PopupGeometry {
  const leg = actionPointLeg(targetPoint, params.action);
  const s = flankSign(params.action.side);
  const theta = Math.max(params.angleOff_deg, 0);
  const attackHeading = normalizeHeading(leg.approachHeading + s * theta);
  const reciprocal = normalizeHeading(attackHeading + 180);
  const R_nm = params.turnRadius_ft / FT_PER_NM;

  const trackPoint = calculatePointAtDistance(targetPoint, reciprocal, params.mapDistance_ft / FT_PER_NM);
  const releasePoint = calculatePointAtDistance(targetPoint, reciprocal, params.bombRange_ft / FT_PER_NM);

  // The arc ends at the track point tangent to the axis; its centre is on the
  // turn side (right of the axis for a left-flank ingress). The pull-down
  // point sits `theta` back around the circle.
  const centre = calculatePointAtDistance(trackPoint, normalizeHeading(attackHeading + 90 * s), R_nm);
  const bearingCentreToTrack = normalizeHeading(attackHeading - 90 * s);
  const bearingCentreToPullDown = normalizeHeading(bearingCentreToTrack - s * theta);
  const pullDownPoint = theta > 0 ? calculatePointAtDistance(centre, bearingCentreToPullDown, R_nm) : trackPoint;
  const steps = Math.max(2, Math.ceil(theta / 10));
  const pullDownArc: Coordinates[] = [];
  for (let i = 0; i <= steps; i++) {
    pullDownArc.push(
      theta > 0 ? calculatePointAtDistance(centre, normalizeHeading(bearingCentreToPullDown + s * theta * (i / steps)), R_nm) : trackPoint,
    );
  }

  const climbDistance_nm = params.popToPullDown_ft / FT_PER_NM;
  const pullUpPoint = calculatePointAtDistance(pullDownPoint, normalizeHeading(leg.approachHeading + 180), climbDistance_nm);
  const holdDown_nm =
    calculateDistance(leg.actionPoint, pullUpPoint) *
    (Math.abs(signedHeadingDelta(leg.approachHeading, calculateBearing(leg.actionPoint, pullUpPoint))) < 90 ? 1 : -1);
  const aimOffPoint = calculatePointAtDistance(targetPoint, attackHeading, Math.max(params.aimOff_ft, 0) / FT_PER_NM);

  return {
    ipPoint,
    actionPoint: leg.actionPoint,
    pullUpPoint,
    pullDownPoint,
    pullDownArc,
    trackPoint,
    releasePoint,
    targetPoint,
    aimOffPoint,
    egress: egressPath(releasePoint, attackHeading, params.egressHeading_deg, params.egressSpeed_ktas, params.egressG),
    routeHeading: calculateBearing(ipPoint, leg.actionPoint),
    approachHeading: leg.approachHeading,
    attackHeading,
    offsetTurn: leg.offsetTurn,
    pullDown: { deg: theta, direction: s > 0 ? 'right' : 'left' },
    actionRange_nm: params.action.actionRange_nm,
    popRange_nm: calculateDistance(pullUpPoint, targetPoint),
    pullDownRange_nm: calculateDistance(pullDownPoint, targetPoint),
    mapDistance_nm: params.mapDistance_ft / FT_PER_NM,
    releaseRange_nm: params.bombRange_ft / FT_PER_NM,
    climbDistance_nm,
    holdDown_nm,
  };
}

// ─── Level and dive geometry ──────────────────────────────────────────────────
//
// Both deliver along one attack axis. With an action point the aircraft flies
// the route to it, takes the check turn, runs up the offset leg to the join
// point — the roll-in for a dive, the run-in start for a level pass — and
// turns onto the target there. Without one (a save that predates the model)
// the transit runs straight from the IP to the join point.

/**
 * Wings-level distance on the attack axis before a level release. CCRP and
 * AUTO need a settled solution; three miles is about 25 s at 450 kt.
 */
export const LEVEL_RUN_IN_NM = 3;

interface AxisParams {
  egressDirection?: 'left' | 'right' | 'straight';
  egressHeading_deg?: number;
  ipPoint?: Coordinates;
  /** Present → route to the action point, check turn, offset leg to the join point. */
  action?: ActionPointInput;
  egressG?: number;
}

export interface LevelGeometry {
  /** The IP when known, else a schematic point back along the axis. */
  ingressStart: Coordinates;
  actionPoint?: Coordinates;
  /** Where the aircraft joins the attack axis and settles wings level. */
  runInStart: Coordinates;
  releasePoint: Coordinates;
  targetPoint: Coordinates;
  egress: EgressPath;
  /** IP → action point (or → run-in start without one). */
  routeHeading: number;
  approachHeading: number;
  offsetTurn?: Turn;
  attackHeading: number;
  /** The turn onto the axis at the run-in start. */
  joinTurn: Turn;
  egressHeading: number;
  releaseRange_nm: number;
  runInStartRange_nm: number;
}

export interface DiveGeometry {
  ingressStart: Coordinates;
  actionPoint?: Coordinates;
  rollInPoint: Coordinates;
  releasePoint: Coordinates;
  targetPoint: Coordinates;
  egress: EgressPath;
  routeHeading: number;
  approachHeading: number;
  offsetTurn?: Turn;
  attackHeading: number;
  /** The turn onto the target at the roll-in. */
  rollInTurn: Turn;
  egressHeading: number;
  rollInRange_nm: number;
  releaseRange_nm: number;
}

/**
 * Ground range a store covers from a level release, ignoring drag — a
 * schematic number for the map and card, not a ballistic solution. The jet's
 * own computer does the real one.
 */
export function levelReleaseRange_nm(releaseAltitude_agl: number, speed_ktas: number): number {
  const v = speed_ktas * KT_TO_FT_S;
  const t = Math.sqrt((2 * Math.max(releaseAltitude_agl, 0)) / G_FT_S2);
  return (v * t) / FT_PER_NM;
}

/** Ground range from the target at which a given altitude sits on a dive of `diveAngle_deg`. */
export function diveGroundRange_nm(altitude_agl: number, diveAngle_deg: number): number {
  const angle = Math.max(diveAngle_deg, 1) * (Math.PI / 180);
  return altitude_agl / Math.tan(angle) / FT_PER_NM;
}

/** Shared: the join point on the offset leg, or the straight schematic when there is no action point. */
function joinGeometry(
  targetPoint: Coordinates,
  attackHeadingHint: number,
  joinRange_nm: number,
  params: AxisParams,
  ingressLength_nm: number,
) {
  const join = params.action ? joinPointOnLeg(targetPoint, params.action, joinRange_nm) : undefined;
  if (join) {
    return {
      attackHeading: join.attackHeading,
      joinPoint: join.point,
      actionPoint: join.leg.actionPoint,
      approachHeading: join.leg.approachHeading,
      offsetTurn: join.leg.offsetTurn,
      joinTurn: join.joinTurn,
      ingressStart: params.ipPoint ?? join.leg.actionPoint,
      routeHeading: params.ipPoint ? calculateBearing(params.ipPoint, join.leg.actionPoint) : params.action!.directBearing_deg,
    };
  }
  const attackHeading = normalizeHeading(attackHeadingHint);
  const reciprocal = normalizeHeading(attackHeading + 180);
  const joinPoint = calculatePointAtDistance(targetPoint, reciprocal, joinRange_nm);
  const ingressStart = params.ipPoint ?? calculatePointAtDistance(targetPoint, reciprocal, joinRange_nm + ingressLength_nm);
  const approachHeading = params.ipPoint ? calculateBearing(params.ipPoint, joinPoint) : attackHeading;
  return {
    attackHeading,
    joinPoint,
    actionPoint: undefined,
    approachHeading,
    offsetTurn: undefined,
    joinTurn: turnBetween(approachHeading, attackHeading),
    ingressStart,
    routeHeading: approachHeading,
  };
}

export function calculateLevelGeometry(
  targetPoint: Coordinates,
  attackHeading: number,
  params: AxisParams & { releaseAltitude_agl: number; releaseSpeed_ktas: number },
  ingressLength_nm = 8,
): LevelGeometry {
  const releaseRange_nm = levelReleaseRange_nm(params.releaseAltitude_agl, params.releaseSpeed_ktas);
  const runInStartRange_nm = releaseRange_nm + LEVEL_RUN_IN_NM;
  const j = joinGeometry(targetPoint, attackHeading, runInStartRange_nm, params, ingressLength_nm);
  const releasePoint = calculatePointAtDistance(targetPoint, normalizeHeading(j.attackHeading + 180), releaseRange_nm);
  const egressHeading = resolveEgressHeading(params, j.attackHeading);
  return {
    ingressStart: j.ingressStart,
    actionPoint: j.actionPoint,
    runInStart: j.joinPoint,
    releasePoint,
    targetPoint,
    egress: egressPath(releasePoint, j.attackHeading, egressHeading, params.releaseSpeed_ktas, params.egressG ?? 3),
    routeHeading: j.routeHeading,
    approachHeading: j.approachHeading,
    offsetTurn: j.offsetTurn,
    attackHeading: j.attackHeading,
    joinTurn: j.joinTurn,
    egressHeading,
    releaseRange_nm,
    runInStartRange_nm,
  };
}

export function calculateDiveGeometry(
  targetPoint: Coordinates,
  attackHeading: number,
  params: AxisParams & { rollInAltitude_ft: number; releaseAltitude_ft: number; diveAngle_deg: number; releaseSpeed_ktas?: number },
  ingressLength_nm = 8,
): DiveGeometry {
  const rollInRange_nm = diveGroundRange_nm(params.rollInAltitude_ft, params.diveAngle_deg);
  const releaseRange_nm = diveGroundRange_nm(params.releaseAltitude_ft, params.diveAngle_deg);
  const j = joinGeometry(targetPoint, attackHeading, rollInRange_nm, params, ingressLength_nm);
  const releasePoint = calculatePointAtDistance(targetPoint, normalizeHeading(j.attackHeading + 180), releaseRange_nm);
  const egressHeading = resolveEgressHeading(params, j.attackHeading);
  return {
    ingressStart: j.ingressStart,
    actionPoint: j.actionPoint,
    rollInPoint: j.joinPoint,
    releasePoint,
    targetPoint,
    egress: egressPath(releasePoint, j.attackHeading, egressHeading, params.releaseSpeed_ktas ?? 450, params.egressG ?? 4),
    routeHeading: j.routeHeading,
    approachHeading: j.approachHeading,
    offsetTurn: j.offsetTurn,
    attackHeading: j.attackHeading,
    rollInTurn: j.joinTurn,
    egressHeading,
    rollInRange_nm,
    releaseRange_nm,
  };
}
