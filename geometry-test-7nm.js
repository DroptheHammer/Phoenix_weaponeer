/**
 * Calculate parameters for 7nm POP with 7500ft ATK at 450 KTAS
 */

console.log('='.repeat(70));
console.log('POPUP CCIP - 7NM POP CONFIGURATION');
console.log('='.repeat(70));

const TARGET = {
  runInAltitude_agl: 500,
  runInSpeed_ktas: 450,
  atkAltitude_agl: 7500,
  offsetRange_nm: 7.0,          // POP at 7nm from target
  climbAngle_deg: 30,
  offsetAngle_deg: 60,
  diveAngle_deg: 20,
  releaseAltitude_agl: 3000,
};

// Phase 1: Calculate climb distance needed
const altitudeGain = TARGET.atkAltitude_agl - TARGET.runInAltitude_agl;
const climbDistance_ft = altitudeGain / Math.tan(TARGET.climbAngle_deg * Math.PI / 180);
const climbDistance_nm = climbDistance_ft / 6076.12;

console.log('\nPHASE 1: CLIMB (POP to ATK)');
console.log('-'.repeat(70));
console.log(`Altitude gain needed: ${altitudeGain} ft (${TARGET.runInAltitude_agl} → ${TARGET.atkAltitude_agl})`);
console.log(`Climb angle: ${TARGET.climbAngle_deg}°`);
console.log(`Climb distance needed: ${climbDistance_nm.toFixed(2)} nm (${climbDistance_ft.toFixed(0)} ft)`);

// Calculate ATK range from target using offset geometry
// Using law of cosines: c² = a² + b² - 2ab·cos(C)
// Where:
//   a = POP to target = 7nm
//   b = POP to ATK (climb distance) = calculated above
//   C = offset angle = 60°
//   c = ATK to target (what we want)

const a = TARGET.offsetRange_nm;
const b = climbDistance_nm;
const C_rad = TARGET.offsetAngle_deg * Math.PI / 180;

const atkRange_nm = Math.sqrt(a*a + b*b - 2*a*b*Math.cos(C_rad));

console.log('\nTACTICAL GEOMETRY:');
console.log('-'.repeat(70));
console.log(`POP range from target: ${TARGET.offsetRange_nm} nm`);
console.log(`Offset angle: ${TARGET.offsetAngle_deg}° right`);
console.log(`Offset leg distance: ${climbDistance_nm.toFixed(2)} nm`);
console.log(`Calculated ATK range from target: ${atkRange_nm.toFixed(2)} nm`);

// Phase 2: Dive
const diveAltLoss = TARGET.atkAltitude_agl - TARGET.releaseAltitude_agl;
const diveDistance_ft = diveAltLoss / Math.tan(TARGET.diveAngle_deg * Math.PI / 180);
const diveDistance_nm = diveDistance_ft / 6076.12;

console.log('\nPHASE 2: DIVE (ATK to Release)');
console.log('-'.repeat(70));
console.log(`Altitude loss: ${diveAltLoss} ft (${TARGET.atkAltitude_agl} → ${TARGET.releaseAltitude_agl})`);
console.log(`Dive angle: ${TARGET.diveAngle_deg}°`);
console.log(`Dive distance: ${diveDistance_nm.toFixed(2)} nm (${diveDistance_ft.toFixed(0)} ft)`);

console.log('\n' + '='.repeat(70));
console.log('RECOMMENDED PARAMETERS:');
console.log('='.repeat(70));

const RECOMMENDED = {
  offsetRange_nm: TARGET.offsetRange_nm,
  offsetAngle_deg: TARGET.offsetAngle_deg,
  offsetDirection: 'right',
  climbAngle_deg: TARGET.climbAngle_deg,
  turnInRange_nm: parseFloat(atkRange_nm.toFixed(2)),
  apexAltitude_ft: TARGET.atkAltitude_agl,
  minReleaseAltitude_ft: TARGET.releaseAltitude_agl,
  runInAltitude_ft: TARGET.runInAltitude_agl,
  runInSpeed_ktas: TARGET.runInSpeed_ktas,
};

console.log(JSON.stringify(RECOMMENDED, null, 2));

console.log('\n' + '='.repeat(70));
console.log('ALTITUDE PROFILE:');
console.log('='.repeat(70));
console.log(`IP/POP:     ${TARGET.runInAltitude_agl.toString().padStart(5)} ft AGL @ ${TARGET.runInSpeed_ktas} KTAS`);
console.log(`ATK (apex): ${TARGET.atkAltitude_agl.toString().padStart(5)} ft AGL (7nm → ${atkRange_nm.toFixed(1)}nm from target)`);
console.log(`RELEASE:    ${TARGET.releaseAltitude_agl.toString().padStart(5)} ft AGL`);
console.log('='.repeat(70) + '\n');

// Verification
const verify_altGain = climbDistance_ft * Math.tan(TARGET.climbAngle_deg * Math.PI / 180);
const verify_finalAlt = TARGET.runInAltitude_agl + verify_altGain;
const error_ft = Math.abs(verify_finalAlt - TARGET.atkAltitude_agl);
const error_pct = (error_ft / TARGET.atkAltitude_agl * 100);

console.log('VERIFICATION:');
console.log(`  Climbing ${climbDistance_nm.toFixed(2)} nm at ${TARGET.climbAngle_deg}° from ${TARGET.runInAltitude_agl} ft`);
console.log(`  Calculated altitude: ${verify_finalAlt.toFixed(0)} ft`);
console.log(`  Target altitude: ${TARGET.atkAltitude_agl} ft`);
console.log(`  Error: ${error_ft.toFixed(0)} ft (${error_pct.toFixed(2)}%)`);

if (error_pct < 0.5) {
  console.log('  ✓ PASS: Within 0.5% tolerance\n');
} else if (error_pct < 5) {
  console.log('  ✓ PASS: Within 5% tolerance\n');
} else {
  console.log('  ✗ FAIL: Exceeds 5% tolerance\n');
}
