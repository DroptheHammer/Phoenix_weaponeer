/**
 * Calculate required POP distance to reach 2nm turn-in
 * with 30° offset and 30° climb to 7500ft
 */

console.log('='.repeat(70));
console.log('CALCULATE POP DISTANCE for 2nm turn-in');
console.log('='.repeat(70));

const TARGET = {
  offsetAngle_deg: 30,
  climbAngle_deg: 30,
  runInAlt_ft: 500,
  atkAlt_ft: 7500,
  turnInRange_nm: 2.0,
};

console.log('\nTARGET PARAMETERS:');
console.log(`  Turn-in range: ${TARGET.turnInRange_nm} nm from target`);
console.log(`  Offset angle: ${TARGET.offsetAngle_deg}° right`);
console.log(`  Climb angle: ${TARGET.climbAngle_deg}°`);
console.log(`  ATK altitude: ${TARGET.atkAlt_ft} ft AGL`);

// Calculate required climb distance for 7500ft
const altGain = TARGET.atkAlt_ft - TARGET.runInAlt_ft;
const climbDist_ft = altGain / Math.tan(TARGET.climbAngle_deg * Math.PI / 180);
const climbDist_nm = climbDist_ft / 6076.12;

console.log('\n' + '-'.repeat(70));
console.log('STEP 1: Calculate required climb distance');
console.log('-'.repeat(70));
console.log(`Altitude gain needed: ${altGain} ft`);
console.log(`Climb angle: ${TARGET.climbAngle_deg}°`);
console.log(`Required climb distance: ${climbDist_nm.toFixed(2)} nm`);

// Now use law of cosines to find POP distance
// c² = a² + b² - 2ab·cos(C)
// Where:
//   a = POP to target (unknown)
//   b = climb distance = 2.0 nm
//   c = turn-in to target = 2.0 nm
//   C = offset angle = 30°
//
// Rearrange: a² - 2b·cos(C)·a + (b² - c²) = 0

const b = climbDist_nm;
const c = TARGET.turnInRange_nm;
const C_rad = TARGET.offsetAngle_deg * Math.PI / 180;

const A = 1;
const B = -2 * b * Math.cos(C_rad);
const C_coef = b*b - c*c;

const discriminant = B*B - 4*A*C_coef;

console.log('\n' + '-'.repeat(70));
console.log('STEP 2: Calculate required POP distance');
console.log('-'.repeat(70));

if (discriminant < 0) {
  console.log('\n❌ No solution - geometry impossible');
} else {
  const a1 = (-B + Math.sqrt(discriminant)) / (2*A);
  const a2 = (-B - Math.sqrt(discriminant)) / (2*A);

  // Use the positive solution
  const popDistance_nm = a1 > 0 ? a1 : a2;

  console.log(`\nRequired POP distance: ${popDistance_nm.toFixed(2)} nm from target`);

  // Verify
  console.log('\n' + '-'.repeat(70));
  console.log('VERIFICATION:');
  console.log('-'.repeat(70));

  const verify_c_squared = popDistance_nm*popDistance_nm + b*b - 2*popDistance_nm*b*Math.cos(C_rad);
  const verify_turnInRange = Math.sqrt(verify_c_squared);

  console.log(`Starting at POP (${popDistance_nm.toFixed(2)} nm from target):`);
  console.log(`  Turn ${TARGET.offsetAngle_deg}° right`);
  console.log(`  Climb ${climbDist_nm.toFixed(2)} nm at ${TARGET.climbAngle_deg}°`);
  console.log(`  Reach altitude: ${TARGET.atkAlt_ft} ft AGL`);
  console.log(`  Arrive at: ${verify_turnInRange.toFixed(2)} nm from target ✓`);

  console.log('\n' + '='.repeat(70));
  console.log('FINAL PARAMETERS:');
  console.log('='.repeat(70));

  const FINAL = {
    offsetRange_nm: parseFloat(popDistance_nm.toFixed(2)),
    offsetAngle_deg: TARGET.offsetAngle_deg,
    offsetDirection: 'right',
    climbAngle_deg: TARGET.climbAngle_deg,
    turnInRange_nm: TARGET.turnInRange_nm,
    apexAltitude_ft: TARGET.atkAlt_ft,
    minReleaseAltitude_ft: 3000,
    runInAltitude_ft: TARGET.runInAlt_ft,
    runInSpeed_ktas: 450,
  };

  console.log(JSON.stringify(FINAL, null, 2));
  console.log('\n' + '='.repeat(70));
}
