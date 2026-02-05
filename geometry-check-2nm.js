/**
 * Check if we can reach 2nm from target with locked parameters
 */

console.log('='.repeat(70));
console.log('GEOMETRY CHECK: Can we reach 2nm turn-in from 7nm POP?');
console.log('='.repeat(70));

const LOCKED = {
  popRange_nm: 7.0,           // POP at 7nm from target
  offsetAngle_deg: 60,        // Turn 60° right
  climbAngle_deg: 30,         // Climb at 30°
  runInAlt_ft: 500,
  targetTurnInRange_nm: 2.0,  // User wants turn-in at 2nm
};

console.log('\nLOCKED PARAMETERS:');
console.log(`  POP range: ${LOCKED.popRange_nm} nm from target`);
console.log(`  Offset angle: ${LOCKED.offsetAngle_deg}° right`);
console.log(`  Climb angle: ${LOCKED.climbAngle_deg}°`);
console.log(`  Desired turn-in range: ${LOCKED.targetTurnInRange_nm} nm from target`);

// Calculate if it's geometrically possible to reach 2nm from target
// Using law of cosines: c² = a² + b² - 2ab·cos(C)
// Where:
//   a = POP to target = 7nm
//   c = turn-in to target = 2nm
//   C = offset angle = 60°
//   b = distance along offset leg (unknown)

// Rearrange: b² - 2a·cos(C)·b + (a² - c²) = 0
const a = LOCKED.popRange_nm;
const c = LOCKED.targetTurnInRange_nm;
const C_rad = LOCKED.offsetAngle_deg * Math.PI / 180;

const A = 1;
const B = -2 * a * Math.cos(C_rad);
const C = a*a - c*c;

const discriminant = B*B - 4*A*C;

console.log('\n' + '-'.repeat(70));
console.log('GEOMETRIC ANALYSIS:');
console.log('-'.repeat(70));

if (discriminant < 0) {
  console.log('\n❌ IMPOSSIBLE: Cannot reach 2nm from target with these parameters!');
  console.log(`   Discriminant: ${discriminant.toFixed(2)} (negative = no solution)`);

  // Calculate minimum possible distance from target
  const minDistance_nm = a * Math.sin(C_rad);
  console.log(`\n   Closest approach with ${LOCKED.offsetAngle_deg}° offset from ${LOCKED.popRange_nm}nm:`);
  console.log(`   ${minDistance_nm.toFixed(2)} nm from target`);

  console.log('\n   REASON: With a 60° offset from 7nm, you\'re flying away from target');
  console.log('           and can\'t turn sharply enough to reach 2nm.');

} else {
  const b1 = (-B + Math.sqrt(discriminant)) / (2*A);
  const b2 = (-B - Math.sqrt(discriminant)) / (2*A);

  console.log('\n✓ POSSIBLE: Can reach 2nm by flying along offset leg');
  console.log(`   Distance options: ${b1.toFixed(2)} nm or ${b2.toFixed(2)} nm`);

  const validDistance = b1 > 0 ? b1 : b2;

  // Calculate altitude at that point
  const altGain_ft = validDistance * 6076.12 * Math.tan(LOCKED.climbAngle_deg * Math.PI / 180);
  const altitude_ft = LOCKED.runInAlt_ft + altGain_ft;

  console.log(`\n   Flying ${validDistance.toFixed(2)} nm at ${LOCKED.climbAngle_deg}° climb:`);
  console.log(`   Altitude gain: ${altGain_ft.toFixed(0)} ft`);
  console.log(`   Altitude at turn-in: ${altitude_ft.toFixed(0)} ft AGL`);
}

console.log('\n' + '='.repeat(70));
console.log('RECOMMENDATIONS:');
console.log('='.repeat(70));

console.log('\nTo reach 2nm turn-in from 7nm POP, you need to either:');
console.log('  1. Reduce offset angle (turn less than 60°)');
console.log('  2. Accept a farther turn-in range (our current 6.25nm works)');
console.log('  3. Move POP closer to target');

console.log('\nCURRENT WORKING SOLUTION:');
console.log('  POP: 7nm, offset 60°, climb 2nm → ATK at 6.25nm @ 7500ft ✓');
console.log('='.repeat(70) + '\n');
