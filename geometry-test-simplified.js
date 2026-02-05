/**
 * Simplified 3-Phase Popup CCIP - Internally Consistent Test Data
 * Inspired by R64 diagram but adjusted for our simplified model
 */

console.log('='.repeat(70));
console.log('SIMPLIFIED POPUP CCIP GEOMETRY - INTERNALLY CONSISTENT TEST');
console.log('='.repeat(70));

// Option 1: Adjust climb angle to match diagram distances
const option1 = {
  name: 'OPTION 1: Adjust climb angle to match 2nm distance',
  runInAltitude_agl: 500,
  apexAltitude_agl: 5800,
  trackPointAltitude_agl: 4300,
  releaseAltitude_agl: 3000,
  pupToApexDistance_nm: 2.0,  // Close to diagram's 2.03 nm
  diveAngle_deg: 20,
  offsetAngle_deg: 60,
};

// Calculate required climb angle for Option 1
const o1_altGain = option1.apexAltitude_agl - option1.runInAltitude_agl;
const o1_distance_ft = option1.pupToApexDistance_nm * 6076.12;
option1.climbAngle_deg = Math.atan(o1_altGain / o1_distance_ft) * 180 / Math.PI;

console.log('\n' + '-'.repeat(70));
console.log(option1.name);
console.log('-'.repeat(70));
console.log(`Run-in altitude: ${option1.runInAltitude_agl} ft AGL`);
console.log(`Apex altitude: ${option1.apexAltitude_agl} ft AGL`);
console.log(`Distance POP to APEX: ${option1.pupToApexDistance_nm} nm (${o1_distance_ft.toFixed(0)} ft)`);
console.log(`\nCalculated climb angle: ${option1.climbAngle_deg.toFixed(1)}°`);
console.log(`\nVerification:`);
const o1_verify_gain = o1_distance_ft * Math.tan(option1.climbAngle_deg * Math.PI / 180);
const o1_verify_alt = option1.runInAltitude_agl + o1_verify_gain;
console.log(`  Altitude gain: ${o1_verify_gain.toFixed(0)} ft`);
console.log(`  Final altitude: ${o1_verify_alt.toFixed(0)} ft`);
console.log(`  Target: ${option1.apexAltitude_agl} ft`);
console.log(`  Error: ${Math.abs(o1_verify_alt - option1.apexAltitude_agl).toFixed(0)} ft (${(Math.abs(o1_verify_alt - option1.apexAltitude_agl) / option1.apexAltitude_agl * 100).toFixed(2)}%)`);

// Option 2: Keep 30° climb, adjust apex altitude
const option2 = {
  name: 'OPTION 2: Keep 30° climb, calculate actual apex reached',
  runInAltitude_agl: 500,
  climbAngle_deg: 30,
  trackPointAltitude_agl: 4300,
  releaseAltitude_agl: 3000,
  pupToApexDistance_nm: 2.0,
  diveAngle_deg: 20,
  offsetAngle_deg: 60,
};

const o2_distance_ft = option2.pupToApexDistance_nm * 6076.12;
const o2_altGain = o2_distance_ft * Math.tan(option2.climbAngle_deg * Math.PI / 180);
option2.apexAltitude_agl = option2.runInAltitude_agl + o2_altGain;

console.log('\n' + '-'.repeat(70));
console.log(option2.name);
console.log('-'.repeat(70));
console.log(`Run-in altitude: ${option2.runInAltitude_agl} ft AGL`);
console.log(`Climb angle: ${option2.climbAngle_deg}°`);
console.log(`Distance POP to APEX: ${option2.pupToApexDistance_nm} nm (${o2_distance_ft.toFixed(0)} ft)`);
console.log(`\nCalculated apex altitude: ${option2.apexAltitude_agl.toFixed(0)} ft AGL`);
console.log(`\nThis would require adjusting track point and release altitudes accordingly.`);

// Option 3: Keep 30° climb, adjust distance
const option3 = {
  name: 'OPTION 3: Keep 30° climb and 5800ft apex, adjust distance',
  runInAltitude_agl: 500,
  apexAltitude_agl: 5800,
  trackPointAltitude_agl: 4300,
  releaseAltitude_agl: 3000,
  climbAngle_deg: 30,
  diveAngle_deg: 20,
  offsetAngle_deg: 60,
};

const o3_altGain = option3.apexAltitude_agl - option3.runInAltitude_agl;
const o3_distance_ft = o3_altGain / Math.tan(option3.climbAngle_deg * Math.PI / 180);
option3.pupToApexDistance_nm = o3_distance_ft / 6076.12;

console.log('\n' + '-'.repeat(70));
console.log(option3.name);
console.log('-'.repeat(70));
console.log(`Run-in altitude: ${option3.runInAltitude_agl} ft AGL`);
console.log(`Apex altitude: ${option3.apexAltitude_agl} ft AGL`);
console.log(`Climb angle: ${option3.climbAngle_deg}°`);
console.log(`\nCalculated distance POP to APEX: ${option3.pupToApexDistance_nm.toFixed(2)} nm (${o3_distance_ft.toFixed(0)} ft)`);
console.log(`\nVerification:`);
const o3_verify_gain = o3_distance_ft * Math.tan(option3.climbAngle_deg * Math.PI / 180);
const o3_verify_alt = option3.runInAltitude_agl + o3_verify_gain;
console.log(`  Altitude gain: ${o3_verify_gain.toFixed(0)} ft`);
console.log(`  Final altitude: ${o3_verify_alt.toFixed(0)} ft`);
console.log(`  Target: ${option3.apexAltitude_agl} ft`);
console.log(`  Error: ${Math.abs(o3_verify_alt - option3.apexAltitude_agl).toFixed(0)} ft (${(Math.abs(o3_verify_alt - option3.apexAltitude_agl) / option3.apexAltitude_agl * 100).toFixed(2)}%)`);

console.log('\n' + '='.repeat(70));
console.log('RECOMMENDATION');
console.log('='.repeat(70));
console.log('\nFor our simplified model, I recommend OPTION 1:');
console.log(`  - Climb angle: ${option1.climbAngle_deg.toFixed(1)}°`);
console.log(`  - Distance: 2.0 nm (close to diagram's 2.03 nm)`);
console.log(`  - Reaches 5,800 ft apex as intended`);
console.log(`  - Within <0.1% error (well under 5% requirement)`);
console.log('\nThis gives us realistic, self-consistent parameters for testing.');
console.log('='.repeat(70) + '\n');
