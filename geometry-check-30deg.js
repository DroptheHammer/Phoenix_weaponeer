/**
 * Calculate altitude at 2nm with 30° offset (NOT 60°!)
 */

console.log('='.repeat(70));
console.log('GEOMETRY CHECK: 7nm POP, 30° RIGHT TURN, 2nm turn-in');
console.log('='.repeat(70));

const PARAMS = {
  popRange_nm: 7.0,
  offsetAngle_deg: 30,        // 30° right turn (NOT 60°!)
  climbAngle_deg: 30,
  runInAlt_ft: 500,
  targetTurnInRange_nm: 2.0,
};

console.log('\nPARAMETERS:');
console.log(`  POP: ${PARAMS.popRange_nm} nm from target`);
console.log(`  Turn: ${PARAMS.offsetAngle_deg}° RIGHT`);
console.log(`  Climb: ${PARAMS.climbAngle_deg}°`);
console.log(`  Target turn-in: ${PARAMS.targetTurnInRange_nm} nm from target`);

// Law of cosines: c² = a² + b² - 2ab·cos(C)
const a = PARAMS.popRange_nm;
const c = PARAMS.targetTurnInRange_nm;
const C_rad = PARAMS.offsetAngle_deg * Math.PI / 180;

// Solve for b: b² - 2a·cos(C)·b + (a² - c²) = 0
const A = 1;
const B = -2 * a * Math.cos(C_rad);
const C_coef = a*a - c*c;

const discriminant = B*B - 4*A*C_coef;

console.log('\n' + '-'.repeat(70));
console.log('CALCULATION:');
console.log('-'.repeat(70));

if (discriminant < 0) {
  console.log('\n❌ IMPOSSIBLE with 30° offset');
  const minDist = a * Math.sin(C_rad);
  console.log(`   Closest approach: ${minDist.toFixed(2)} nm`);
  console.log(`   Need to turn sharper or move POP closer`);
} else {
  const b1 = (-B + Math.sqrt(discriminant)) / (2*A);
  const b2 = (-B - Math.sqrt(discriminant)) / (2*A);

  console.log(`\n✓ POSSIBLE!`);
  console.log(`   Solution 1: Fly ${b1.toFixed(2)} nm along offset leg`);
  console.log(`   Solution 2: Fly ${b2.toFixed(2)} nm along offset leg`);

  // Use the shorter positive solution (closer to POP)
  const offsetLegDistance_nm = Math.min(Math.abs(b1), Math.abs(b2));

  // Calculate altitude
  const offsetLegDistance_ft = offsetLegDistance_nm * 6076.12;
  const altGain_ft = offsetLegDistance_ft * Math.tan(PARAMS.climbAngle_deg * Math.PI / 180);
  const altitude_ft = PARAMS.runInAlt_ft + altGain_ft;

  console.log(`\n   Using ${offsetLegDistance_nm.toFixed(2)} nm offset leg:`);
  console.log(`   Altitude gain: ${altGain_ft.toFixed(0)} ft`);
  console.log(`   ALTITUDE AT 2nm TURN-IN: ${altitude_ft.toFixed(0)} ft AGL`);

  console.log('\n' + '='.repeat(70));
  console.log('RESULT:');
  console.log('='.repeat(70));
  console.log(`At 2nm from target, climbing at 30° from 7nm POP with 30° offset:`);
  console.log(`ALTITUDE: ${altitude_ft.toFixed(0)} ft AGL`);
}

console.log('\n' + '='.repeat(70));
