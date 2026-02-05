/**
 * FINAL TEST DATA - Popup CCIP Profile
 * Option 2: 2nm distance, 30° climb, 7500ft apex
 *
 * This is our canonical test case for the popup CCIP calculator
 */

const TEST_PROFILE = {
  // Basic parameters
  runInAltitude_agl: 500,           // ft AGL - low run-in
  runInSpeed_ktas: 450,             // KTAS - typical F-16 low-level speed

  // Phase 1: Climb (POP to ATK)
  popDistance_nm: 2.0,              // nm - distance to start popup
  climbAngle_deg: 30,               // degrees - easy to fly, aggressive
  atkAltitude_agl: 7500,            // ft AGL - ATK point IS the apex (highest point)

  // Phase 2: Dive (ATK to Release)
  diveAngle_deg: 20,                // degrees - typical dive angle
  releaseAltitude_agl: 3000,        // ft AGL - weapon release altitude

  // Tactical geometry
  offsetAngle_deg: 60,              // degrees - optimum angle off
  offsetDirection: 'right',         // 'left' or 'right'

  // Ranges (for offset geometry calculation)
  offsetRange_nm: 4.0,              // nm - range from target to start offset turn (POP)
  turnInRange_nm: 2.2,              // nm - range from target at ATK point

  // Target
  targetElevation_msl: 3000,        // ft MSL - typical NTTR target
};

// Verification calculations
console.log('='.repeat(70));
console.log('FINAL TEST DATA - POPUP CCIP PROFILE');
console.log('='.repeat(70));

console.log('\nBASIC PARAMETERS:');
console.log(`  Run-in: ${TEST_PROFILE.runInAltitude_agl} ft AGL @ ${TEST_PROFILE.runInSpeed_ktas} KTAS`);
console.log(`  Target elevation: ${TEST_PROFILE.targetElevation_msl} ft MSL`);

console.log('\n' + '-'.repeat(70));
console.log('PHASE 1: CLIMB (POP to ATK/APEX)');
console.log('-'.repeat(70));

const phase1_distance_ft = TEST_PROFILE.popDistance_nm * 6076.12;
const phase1_altGain = phase1_distance_ft * Math.tan(TEST_PROFILE.climbAngle_deg * Math.PI / 180);
const phase1_calculatedATK = TEST_PROFILE.runInAltitude_agl + phase1_altGain;

console.log(`Distance: ${TEST_PROFILE.popDistance_nm} nm (${phase1_distance_ft.toFixed(0)} ft)`);
console.log(`Climb angle: ${TEST_PROFILE.climbAngle_deg}°`);
console.log(`Starting altitude: ${TEST_PROFILE.runInAltitude_agl} ft AGL`);
console.log(`\nCalculated altitude gain: ${phase1_altGain.toFixed(0)} ft`);
console.log(`Calculated ATK altitude: ${phase1_calculatedATK.toFixed(0)} ft AGL`);
console.log(`Target ATK altitude: ${TEST_PROFILE.atkAltitude_agl} ft AGL`);
console.log(`Error: ${Math.abs(phase1_calculatedATK - TEST_PROFILE.atkAltitude_agl).toFixed(0)} ft (${(Math.abs(phase1_calculatedATK - TEST_PROFILE.atkAltitude_agl) / TEST_PROFILE.atkAltitude_agl * 100).toFixed(2)}%)`);

if (Math.abs(phase1_calculatedATK - TEST_PROFILE.atkAltitude_agl) / TEST_PROFILE.atkAltitude_agl < 0.05) {
  console.log('✓ PASS: Within 5% tolerance');
} else {
  console.log('✗ FAIL: Exceeds 5% tolerance');
}

console.log('\n' + '-'.repeat(70));
console.log('PHASE 2: DIVE (ATK to Release)');
console.log('-'.repeat(70));

const phase2_altLoss = TEST_PROFILE.atkAltitude_agl - TEST_PROFILE.releaseAltitude_agl;
const phase2_distance_ft = phase2_altLoss / Math.tan(TEST_PROFILE.diveAngle_deg * Math.PI / 180);
const phase2_distance_nm = phase2_distance_ft / 6076.12;

console.log(`Altitude loss: ${phase2_altLoss} ft`);
console.log(`Dive angle: ${TEST_PROFILE.diveAngle_deg}°`);
console.log(`Calculated distance: ${phase2_distance_nm.toFixed(2)} nm (${phase2_distance_ft.toFixed(0)} ft)`);
console.log(`From ${TEST_PROFILE.atkAltitude_agl} ft (ATK/apex) to ${TEST_PROFILE.releaseAltitude_agl} ft (release)`);

console.log('\n' + '-'.repeat(70));
console.log('TACTICAL GEOMETRY');
console.log('-'.repeat(70));
console.log(`Offset angle: ${TEST_PROFILE.offsetAngle_deg}° ${TEST_PROFILE.offsetDirection}`);
console.log(`Offset range (POP): ${TEST_PROFILE.offsetRange_nm} nm from target`);
console.log(`Turn-in range (ATK): ${TEST_PROFILE.turnInRange_nm} nm from target`);

console.log('\n' + '='.repeat(70));
console.log('ALTITUDE PROFILE SUMMARY (2-PHASE MODEL)');
console.log('='.repeat(70));
console.log(`IP/RUN IN:    ${TEST_PROFILE.runInAltitude_agl.toFixed(0).padStart(5)} ft AGL @ ${TEST_PROFILE.runInSpeed_ktas} KTAS`);
console.log(`POP:          ${TEST_PROFILE.runInAltitude_agl.toFixed(0).padStart(5)} ft AGL (start climb)`);
console.log(`ATK (APEX):   ${TEST_PROFILE.atkAltitude_agl.toFixed(0).padStart(5)} ft AGL (roll in / highest point)`);
console.log(`RELEASE:      ${TEST_PROFILE.releaseAltitude_agl.toFixed(0).padStart(5)} ft AGL (weapon release)`);

console.log('\n' + '='.repeat(70));
console.log('✓ TEST DATA VALIDATED - Ready to use in calculator');
console.log('='.repeat(70) + '\n');

// Export for use in code
console.log('JavaScript export:');
console.log('export const TEST_POPUP_CCIP_PROFILE = ' + JSON.stringify(TEST_PROFILE, null, 2) + ';');
