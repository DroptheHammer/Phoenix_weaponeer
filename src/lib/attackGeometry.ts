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
