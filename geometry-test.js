/**
 * Independent geometry sanity check
 * Tests if the popup CCIP geometry makes physical sense
 */

// Test parameters (from R64 W. Circle 20° Pop Attack diagram)
// This is a realistic F-16 popup CCIP profile
const params = {
  offsetRange_nm: 4.0,        // POP is ~4nm from target (estimated from diagram geometry)
  turnInRange_nm: 2.2,        // ATK (Track Point) is ~2.2nm from target (from MAP calculation)
  offsetAngle_deg: 60,        // Optimum angle off (from diagram)
  climbAngle_deg: 30,         // Climb at 30° nose up (from diagram)
  diveAngle_deg: 20,          // Dive at 20° (from diagram)
  apexAltitude_ft: 5800,      // Target apex altitude AGL (8814 MSL - 3014 target elev)
  runInAltitude_ft: 500,      // Starting altitude at POP (<1000 ft from diagram)
  trackPointAltitude_ft: 4300, // Track point (ATK) altitude AGL (7314 MSL - 3014)
  releaseAltitude_ft: 3000,   // Release altitude AGL (6014 MSL - 3014)
};

// Mock coordinates for testing (NTTR area)
const target = { lat: 36.5, lon: -115.5 };
const ip = { lat: 36.6, lon: -115.6 };

// Calculate bearing between two points
function calculateBearing(start, end) {
  const lat1 = (start.lat * Math.PI) / 180;
  const lat2 = (end.lat * Math.PI) / 180;
  const dLon = ((end.lon - start.lon) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const bearing = Math.atan2(y, x);
  return ((bearing * 180) / Math.PI + 360) % 360;
}

// Calculate point at distance and bearing
function calculatePointAtDistance(start, bearing, distanceNm) {
  const R = 3440.065; // Earth radius in nautical miles
  const d = distanceNm;
  const brng = (bearing * Math.PI) / 180;
  const lat1 = (start.lat * Math.PI) / 180;
  const lon1 = (start.lon * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d / R) +
    Math.cos(lat1) * Math.sin(d / R) * Math.cos(brng)
  );

  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(d / R) * Math.cos(lat1),
    Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (lon2 * 180) / Math.PI,
  };
}

// Calculate distance between two points
function calculateDistance(point1, point2) {
  const R = 3440.065; // Earth radius in nautical miles
  const lat1 = point1.lat * Math.PI / 180;
  const lat2 = point2.lat * Math.PI / 180;
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLon = (point2.lon - point1.lon) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Find turn-in point (simplified - finds first intersection)
function findTurnInPoint(offsetTurnPoint, offsetLegHeading, targetPoint, turnInRange_nm) {
  let minDist = 0;
  let maxDist = 15;
  let bestPoint = offsetTurnPoint;
  let bestError = 999;

  // Coarse search
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

// Run the test
console.log('='.repeat(60));
console.log('POPUP CCIP GEOMETRY SANITY CHECK');
console.log('='.repeat(60));
console.log('\nTest Parameters:');
console.log(`  POP range from target: ${params.offsetRange_nm} nm`);
console.log(`  ATK range from target: ${params.turnInRange_nm} nm`);
console.log(`  Offset angle: ${params.offsetAngle_deg}°`);
console.log(`  Climb angle: ${params.climbAngle_deg}°`);
console.log(`  Starting altitude: ${params.runInAltitude_ft} ft AGL`);
console.log(`  Target apex: ${params.apexAltitude_ft} ft AGL`);

// Calculate geometry
const attackHeading = calculateBearing(ip, target);
const reverseHeading = (attackHeading + 180) % 360;
const popPoint = calculatePointAtDistance(target, reverseHeading, params.offsetRange_nm);
const offsetLegHeading = (attackHeading + params.offsetAngle_deg) % 360;
const atkPoint = findTurnInPoint(popPoint, offsetLegHeading, target, params.turnInRange_nm);

// Calculate POP to ATK distance
const popToAtkDistance = calculateDistance(popPoint, atkPoint);

// Calculate altitude gain if climbing at climbAngle for this distance
const climbAngleRad = params.climbAngle_deg * Math.PI / 180;
const altitudeGain = popToAtkDistance * Math.tan(climbAngleRad) * 6076.12; // nm to feet
const calculatedAltitude = params.runInAltitude_ft + altitudeGain;

console.log('\n' + '-'.repeat(60));
console.log('RESULTS:');
console.log('-'.repeat(60));
console.log(`\nDistance POP to ATK (Track Point): ${popToAtkDistance.toFixed(2)} nm`);
console.log(`                                    ${(popToAtkDistance * 6076.12).toFixed(0)} ft`);

console.log(`\nClimbing at ${params.climbAngle_deg}° for ${popToAtkDistance.toFixed(2)} nm:`);
console.log(`  Altitude gain: ${altitudeGain.toFixed(0)} ft`);
console.log(`  Final altitude: ${params.runInAltitude_ft} + ${altitudeGain.toFixed(0)} = ${calculatedAltitude.toFixed(0)} ft AGL`);

console.log(`\nExpected altitude at ATK (Track Point): ${params.trackPointAltitude_ft} ft AGL`);
console.log(`Calculated altitude at ATK:              ${calculatedAltitude.toFixed(0)} ft AGL`);
console.log(`Difference at ATK: ${(calculatedAltitude - params.trackPointAltitude_ft).toFixed(0)} ft`);

const percentDiffATK = ((calculatedAltitude - params.trackPointAltitude_ft) / params.trackPointAltitude_ft * 100).toFixed(1);
console.log(`                   (${percentDiffATK}%)`);

console.log(`\nTarget apex altitude: ${params.apexAltitude_ft} ft AGL`);
console.log(`Difference from apex: ${(calculatedAltitude - params.apexAltitude_ft).toFixed(0)} ft`);

const percentDiffApex = ((calculatedAltitude - params.apexAltitude_ft) / params.apexAltitude_ft * 100).toFixed(1);
console.log(`                      (${percentDiffApex}%)`);

console.log('\n' + '='.repeat(60));
console.log('VALIDATION:');
console.log('='.repeat(60));

// Check against ATK altitude (more relevant than apex)
if (Math.abs(calculatedAltitude - params.trackPointAltitude_ft) < 500) {
  console.log('✓ PASS: ATK altitude matches calculated (within 500 ft)');
} else if (Math.abs(calculatedAltitude - params.trackPointAltitude_ft) < 1000) {
  console.log('⚠ WARNING: ATK altitude has moderate error (500-1000 ft)');
} else {
  console.log('✗ FAIL: ATK altitude error is too large (>1000 ft)');
}

// Note about apex
if (calculatedAltitude < params.apexAltitude_ft) {
  console.log(`\nNOTE: Calculated altitude (${calculatedAltitude.toFixed(0)} ft) is below apex (${params.apexAltitude_ft} ft)`);
  console.log('      This means apex occurs somewhere between POP and ATK.');
} else {
  console.log(`\nNOTE: Calculated altitude (${calculatedAltitude.toFixed(0)} ft) exceeds apex (${params.apexAltitude_ft} ft)`);
  console.log('      This means apex should occur before reaching ATK.');
}

console.log('='.repeat(60) + '\n');
