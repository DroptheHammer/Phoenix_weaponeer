/**
 * Attack geometry calculator for popup CCIP profiles
 *
 * Calculates the tactical geometry for offset popup attacks based on
 * Chuck's Guides recommendations and user modifications.
 */

import type { Coordinates } from '../types';
import { calculateBearing, calculateDistance, calculateDestination } from './coordinates';

// Kept as the canonical name used by this module and its consumers; the
// implementation lives in ./coordinates alongside the other geo math.
export const calculatePointAtDistance = calculateDestination;

export type { Coordinates };
export { calculateBearing, calculateDistance };

export interface PopupGeometry {
  // Key points along the route
  ipPoint: Coordinates;
  offsetTurnPoint: Coordinates;
  turnInPoint: Coordinates;
  targetPoint: Coordinates;

  // Headings
  ipToOffsetHeading: number;      // IP → offset turn point
  offsetLegHeading: number;       // Offset leg heading (attack heading ± offset angle)
  attackHeading: number;          // Final heading to target

  // Ranges and parameters
  offsetRange_nm: number;         // Distance from target to begin offset
  offsetAngle_deg: number;        // Degrees off attack axis
  turnInRange_nm: number;         // Distance from target to turn in
  climbAngle_deg: number;         // Nose up during offset leg
}

/**
 * Find the turn-in point by searching along the offset leg
 * for the point that is turnInRange_nm from the target
 */
function findTurnInPoint(
  offsetTurnPoint: Coordinates,
  offsetLegHeading: number,
  targetPoint: Coordinates,
  turnInRange_nm: number
): Coordinates {
  // Binary search along the offset leg to find where we're turnInRange_nm from target
  let minDist = 0;
  let maxDist = 15; // Should never need to fly more than 15nm on offset leg
  let bestPoint = offsetTurnPoint;
  let bestError = 999;

  // First do a coarse search
  for (let dist = 0.1; dist <= maxDist; dist += 0.5) {
    const testPoint = calculatePointAtDistance(offsetTurnPoint, offsetLegHeading, dist);
    const distToTarget = calculateDistance(testPoint, targetPoint);
    const error = Math.abs(distToTarget - turnInRange_nm);

    if (error < bestError) {
      bestError = error;
      bestPoint = testPoint;
      minDist = dist - 0.5;
      maxDist = dist + 0.5;
    }
  }

  // Refine with binary search
  for (let iteration = 0; iteration < 20; iteration++) {
    const midDist = (minDist + maxDist) / 2;
    const testPoint = calculatePointAtDistance(offsetTurnPoint, offsetLegHeading, midDist);
    const distToTarget = calculateDistance(testPoint, targetPoint);

    if (Math.abs(distToTarget - turnInRange_nm) < 0.01) {
      return testPoint;
    }

    if (distToTarget > turnInRange_nm) {
      minDist = midDist;
    } else {
      maxDist = midDist;
    }
  }

  return bestPoint;
}

/**
 * Chuck's Guides recommended parameters for F-16 Mk-82 Popup CCIP
 * Source: Test example (to be replaced with database lookup)
 */
export interface ChucksGuideParams {
  offsetRange_nm: number;        // Range from target to begin offset turn
  offsetAngle_deg: number;       // Degrees off attack axis
  offsetDirection: 'left' | 'right';
  climbAngle_deg: number;        // Nose up during offset leg
  turnInRange_nm: number;        // Range from target to turn into attack
  apexAltitude_ft: number;       // Top of popup
  minReleaseAltitude_ft: number; // Min safe release
  runInAltitude_ft: number;      // Altitude during offset leg
  runInSpeed_ktas: number;       // Airspeed during offset leg
  source: string;                // e.g., "Chuck's Guide F-16C", "Test Example"
}

/**
 * Get recommended parameters for a weapon/profile combination
 * TODO: Replace with database lookup
 */
export function getRecommendedParams(
  _weaponId: string,
  _profileType: string
): ChucksGuideParams {
  // Test data - Validated 2-phase popup CCIP profile
  // POP at 4nm from 100ft, turn 20° right, climb 2.11nm @ 30° to ATK at 7500ft
  // Then dive to release at 3000ft
  return {
    offsetRange_nm: 4.0,          // POP is 4nm from target
    offsetAngle_deg: 20,          // 20° right turn
    offsetDirection: 'right',     // Turn right at POP
    climbAngle_deg: 30,           // 30° climb (easy to fly)
    turnInRange_nm: 2.14,         // ATK is 2.14nm from target (ATK = apex)
    apexAltitude_ft: 7500,        // ATK/apex at 7500ft AGL
    minReleaseAltitude_ft: 3000,  // Release at 3000ft AGL
    runInAltitude_ft: 100,        // Low run-in at 100ft AGL
    runInSpeed_ktas: 450,         // 450 KTAS
    source: 'Validated Test (4nm POP/100ft, 20° turn, 2.14nm ATK @ 7500ft)',
  };
}

/**
 * Calculate popup CCIP attack geometry
 *
 * This calculates the full tactical geometry including offset turns
 * based on Chuck's Guides recommendations or user overrides.
 */
export function calculatePopupGeometry(
  ipPoint: Coordinates,
  targetPoint: Coordinates,
  params: ChucksGuideParams,
  userAttackHeading?: number  // If specified, forces recalculation of offsets
): PopupGeometry {
  // Calculate natural attack heading (IP → Target bearing)
  const naturalAttackHeading = calculateBearing(ipPoint, targetPoint);

  // Use user-specified attack heading or natural heading
  const attackHeading = (userAttackHeading != null && Number.isFinite(userAttackHeading))
    ? userAttackHeading
    : naturalAttackHeading;

  // Calculate key points along the attack route

  // 1. Offset turn point: Where pilot turns off attack axis
  //    Located ON the IP→Target line, offsetRange_nm from target
  const reverseAttackHeading = (attackHeading + 180) % 360;
  const offsetTurnPoint = calculatePointAtDistance(
    targetPoint,
    reverseAttackHeading,
    params.offsetRange_nm
  );

  // 2. Calculate offset leg heading
  //    Attack heading + offset angle (right) or - offset angle (left)
  const offsetLegHeading = params.offsetDirection === 'right'
    ? (attackHeading + params.offsetAngle_deg) % 360
    : (attackHeading - params.offsetAngle_deg + 360) % 360;

  // 3. Turn-in point: Where the offset leg intersects the turn-in range circle
  //    This is the point on the offset leg that is turnInRange_nm from target
  const turnInPoint = findTurnInPoint(
    offsetTurnPoint,
    offsetLegHeading,
    targetPoint,
    params.turnInRange_nm
  );

  // 4. Calculate heading from IP to offset turn point
  const ipToOffsetHeading = calculateBearing(ipPoint, offsetTurnPoint);

  return {
    ipPoint,
    offsetTurnPoint,
    turnInPoint,
    targetPoint,
    ipToOffsetHeading,
    offsetLegHeading,
    attackHeading,
    offsetRange_nm: params.offsetRange_nm,
    offsetAngle_deg: params.offsetAngle_deg,
    turnInRange_nm: params.turnInRange_nm,
    climbAngle_deg: params.climbAngle_deg,
  };
}

// ─── Level and dive geometry ──────────────────────────────────────────────────
//
// Both are straight-line deliveries along one attack heading: the aircraft
// runs in from the IP (or from `ingressLength_nm` back when there is no IP),
// reaches its roll-in / release point at a range set by altitude and dive
// angle, and breaks off over the target. Pure trigonometry — cheap enough to
// run on every mouse move once the map gets drag handles.

const FT_PER_NM = 6076.12;
const G_FT_S2 = 32.174;
const KT_TO_FT_S = 1.68781;

export interface LevelGeometry {
  ingressStart: Coordinates;
  releasePoint: Coordinates;
  targetPoint: Coordinates;
  egressPoint: Coordinates;
  attackHeading: number;
  egressHeading: number;
  releaseRange_nm: number;
}

export interface DiveGeometry {
  ingressStart: Coordinates;
  rollInPoint: Coordinates;
  releasePoint: Coordinates;
  targetPoint: Coordinates;
  egressPoint: Coordinates;
  attackHeading: number;
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

export function calculateLevelGeometry(
  targetPoint: Coordinates,
  attackHeading: number,
  params: {
    releaseAltitude_agl: number;
    releaseSpeed_ktas: number;
    egressDirection?: 'left' | 'right' | 'straight';
    egressHeading_deg?: number;
    ipPoint?: Coordinates;
  },
  ingressLength_nm = 8,
): LevelGeometry {
  const reciprocal = (attackHeading + 180) % 360;
  const releaseRange_nm = levelReleaseRange_nm(params.releaseAltitude_agl, params.releaseSpeed_ktas);
  const releasePoint = calculatePointAtDistance(targetPoint, reciprocal, releaseRange_nm);
  const ingressStart =
    params.ipPoint ?? calculatePointAtDistance(targetPoint, reciprocal, releaseRange_nm + ingressLength_nm);
  const egressHeading = resolveEgressHeading(params, attackHeading);
  return {
    ingressStart,
    releasePoint,
    targetPoint,
    egressPoint: calculatePointAtDistance(targetPoint, egressHeading, 1.5),
    attackHeading,
    egressHeading,
    releaseRange_nm,
  };
}

export function calculateDiveGeometry(
  targetPoint: Coordinates,
  attackHeading: number,
  params: {
    rollInAltitude_ft: number;
    releaseAltitude_ft: number;
    diveAngle_deg: number;
    egressDirection?: 'left' | 'right' | 'straight';
    egressHeading_deg?: number;
    ipPoint?: Coordinates;
  },
  ingressLength_nm = 8,
): DiveGeometry {
  const reciprocal = (attackHeading + 180) % 360;
  const rollInRange_nm = diveGroundRange_nm(params.rollInAltitude_ft, params.diveAngle_deg);
  const releaseRange_nm = diveGroundRange_nm(params.releaseAltitude_ft, params.diveAngle_deg);
  const rollInPoint = calculatePointAtDistance(targetPoint, reciprocal, rollInRange_nm);
  const releasePoint = calculatePointAtDistance(targetPoint, reciprocal, releaseRange_nm);
  const ingressStart =
    params.ipPoint ?? calculatePointAtDistance(targetPoint, reciprocal, rollInRange_nm + ingressLength_nm);
  const egressHeading = resolveEgressHeading(params, attackHeading);
  return {
    ingressStart,
    rollInPoint,
    releasePoint,
    targetPoint,
    egressPoint: calculatePointAtDistance(targetPoint, egressHeading, 1.5),
    attackHeading,
    egressHeading,
    rollInRange_nm,
    releaseRange_nm,
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
  if (egress.egressDirection === 'left') return (attackHeading - 90 + 360) % 360;
  if (egress.egressDirection === 'right') return (attackHeading + 90) % 360;
  return attackHeading;
}

/**
 * Generate tactical script for kneeboard
 * Example: "From waypoint 7, attack waypoint 8 via POPUP CCIP, MK82 LD, single.
 *           7nm turn 35 degrees right and 20 degrees nose up,
 *           at range 2.5 miles roll nose on to target,
 *           release before min altitude 2500ft,
 *           defend right and exit 180."
 */
export function generateTacticalScript(
  ipWaypointNumber: number,
  targetWaypointNumber: number,
  weaponName: string,
  releaseMode: string,
  geometry: PopupGeometry,
  params: ChucksGuideParams,
  egressHeading: number
): string {
  const offsetDir = params.offsetDirection === 'right' ? 'right' : 'left';
  const defendDir = params.offsetDirection === 'right' ? 'right' : 'left'; // Usually defend opposite of offset

  return `From waypoint ${ipWaypointNumber}, attack waypoint ${targetWaypointNumber} via POPUP CCIP, ${weaponName}, ${releaseMode}.
${params.offsetRange_nm}nm turn ${params.offsetAngle_deg} degrees ${offsetDir} and ${params.climbAngle_deg} degrees nose up,
at range ${params.turnInRange_nm} miles roll nose on to target (${String(Math.round(geometry.attackHeading)).padStart(3, '0')}°),
release before min altitude ${params.minReleaseAltitude_ft}ft,
defend ${defendDir} and exit ${String(Math.round(egressHeading)).padStart(3, '0')}°.
END ATTACK`;
}
