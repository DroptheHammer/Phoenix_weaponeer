/**
 * Calculate ATK range and apex altitude
 * POP at 4nm, 20° right turn, 30° climb from 100ft
 */

console.log('='.repeat(70));
console.log('CALCULATE: 4nm POP, 20° turn, 30° climb from 100ft');
console.log('='.repeat(70));

const PARAMS = {
  popRange_nm: 4.0,
  offsetAngle_deg: 20,
  climbAngle_deg: 30,
  runInAlt_ft: 100,
  targetApex_ft: 7500,  // Try for same apex
};

console.log('\nINPUT PARAMETERS:');
console.log(`  POP range: ${PARAMS.popRange_nm} nm from target`);
console.log(`  Starting altitude: ${PARAMS.runInAlt_ft} ft AGL`);
console.log(`  Offset angle: ${PARAMS.offsetAngle_deg}° right`);
console.log(`  Climb angle: ${PARAMS.climbAngle_deg}°`);

// Calculate climb distance to reach target apex
const altGain = PARAMS.targetApex_ft - PARAMS.runInAlt_ft;
const climbDist_ft = altGain / Math.tan(PARAMS.climbAngle_deg * Math.PI / 180);
const climbDist_nm = climbDist_ft / 6076.12;

console.log('\n' + '-'.repeat(70));
console.log('CLIMB CALCULATION:');
console.log('-'.repeat(70));
console.log(`Target apex: ${PARAMS.targetApex_ft} ft AGL`);
console.log(`Altitude gain needed: ${altGain} ft`);
console.log(`Climb distance at ${PARAMS.climbAngle_deg}°: ${climbDist_nm.toFixed(2)} nm`);

// Calculate ATK range using law of cosines
const a = PARAMS.popRange_nm;
const b = climbDist_nm;
const C_rad = PARAMS.offsetAngle_deg * Math.PI / 180;

const atkRange_nm = Math.sqrt(a*a + b*b - 2*a*b*Math.cos(C_rad));

console.log('\n' + '-'.repeat(70));
console.log('ATK POSITION:');
console.log('-'.repeat(70));
console.log(`POP to target: ${PARAMS.popRange_nm} nm`);
console.log(`Offset leg distance: ${climbDist_nm.toFixed(2)} nm`);
console.log(`Offset angle: ${PARAMS.offsetAngle_deg}°`);
console.log(`\nATK RANGE from target: ${atkRange_nm.toFixed(2)} nm`);
console.log(`ATK ALTITUDE (apex): ${PARAMS.targetApex_ft} ft AGL`);

console.log('\n' + '='.repeat(70));
console.log('SUMMARY:');
console.log('='.repeat(70));
console.log(`POP:     ${PARAMS.popRange_nm} nm from target at ${PARAMS.runInAlt_ft} ft AGL`);
console.log(`         Turn ${PARAMS.offsetAngle_deg}° right`);
console.log(`ATK:     ${atkRange_nm.toFixed(2)} nm from target at ${PARAMS.targetApex_ft} ft AGL (apex)`);
console.log(`         Climbed ${climbDist_nm.toFixed(2)} nm at ${PARAMS.climbAngle_deg}°`);

console.log('\n' + '='.repeat(70));
console.log('RECOMMENDED PARAMETERS:');
console.log('='.repeat(70));

const RECOMMENDED = {
  offsetRange_nm: PARAMS.popRange_nm,
  offsetAngle_deg: PARAMS.offsetAngle_deg,
  offsetDirection: 'right',
  climbAngle_deg: PARAMS.climbAngle_deg,
  turnInRange_nm: parseFloat(atkRange_nm.toFixed(2)),
  apexAltitude_ft: PARAMS.targetApex_ft,
  minReleaseAltitude_ft: 3000,
  runInAltitude_ft: PARAMS.runInAlt_ft,
  runInSpeed_ktas: 450,
};

console.log(JSON.stringify(RECOMMENDED, null, 2));
console.log('='.repeat(70) + '\n');
