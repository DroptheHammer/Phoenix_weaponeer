/**
 * Independent geometry sanity check - 3-Phase Popup CCIP
 * Based on R64 W. Circle 20° Pop Attack diagram
 */

console.log('='.repeat(70));
console.log('POPUP CCIP 3-PHASE GEOMETRY VERIFICATION');
console.log('Source: R64 W. Circle 20° Pop Attack Diagram');
console.log('='.repeat(70));

// Values directly from the diagram
const diagram = {
  targetElevation_msl: 3014,      // ft MSL
  runInAltitude_agl: 500,         // <1,000 ft, using 500 for test
  apexAltitude_msl: 8814,         // ft MSL
  trackPointAltitude_msl: 7314,   // ft MSL
  releaseAltitude_msl: 6014,      // ft MSL
  climbAngle_deg: 30,             // degrees
  diveAngle_deg: 20,              // degrees
  offsetAngle_deg: 60,            // degrees
  pupToApexDistance_ft: 12321,    // ft (from diagram)
};

// Convert to AGL for easier calculation
const altitudes_agl = {
  runIn: diagram.runInAltitude_agl,
  apex: diagram.apexAltitude_msl - diagram.targetElevation_msl,
  trackPoint: diagram.trackPointAltitude_msl - diagram.targetElevation_msl,
  release: diagram.releaseAltitude_msl - diagram.targetElevation_msl,
};

console.log('\nAltitudes from diagram (AGL):');
console.log(`  Run-in (POP):    ${altitudes_agl.runIn} ft`);
console.log(`  Apex:            ${altitudes_agl.apex} ft`);
console.log(`  Track Point:     ${altitudes_agl.trackPoint} ft`);
console.log(`  Release:         ${altitudes_agl.release} ft`);

console.log('\n' + '-'.repeat(70));
console.log('PHASE 1: CLIMB (POP to APEX)');
console.log('-'.repeat(70));

const phase1_altitudeGain = altitudes_agl.apex - altitudes_agl.runIn;
const phase1_requiredDistance_ft = phase1_altitudeGain / Math.tan(diagram.climbAngle_deg * Math.PI / 180);
const phase1_requiredDistance_nm = phase1_requiredDistance_ft / 6076.12;

console.log(`\nRequired altitude gain: ${phase1_altitudeGain} ft`);
console.log(`Climb angle: ${diagram.climbAngle_deg}°`);
console.log(`\nCalculated distance needed:`);
console.log(`  ${phase1_requiredDistance_ft.toFixed(0)} ft (${phase1_requiredDistance_nm.toFixed(2)} nm)`);
console.log(`\nDiagram shows:`);
console.log(`  ${diagram.pupToApexDistance_ft} ft (${(diagram.pupToApexDistance_ft / 6076.12).toFixed(2)} nm)`);

const phase1_difference_ft = diagram.pupToApexDistance_ft - phase1_requiredDistance_ft;
const phase1_difference_pct = (phase1_difference_ft / phase1_requiredDistance_ft * 100).toFixed(1);

console.log(`\nDifference: ${phase1_difference_ft.toFixed(0)} ft (${phase1_difference_pct}%)`);

// If we climb at 30° for the diagram distance, what altitude do we reach?
const phase1_actualAltitudeGain = diagram.pupToApexDistance_ft * Math.tan(diagram.climbAngle_deg * Math.PI / 180);
const phase1_actualAltitude = altitudes_agl.runIn + phase1_actualAltitudeGain;

console.log(`\nVerification: If we climb at ${diagram.climbAngle_deg}° for ${diagram.pupToApexDistance_ft} ft:`);
console.log(`  Altitude gain: ${phase1_actualAltitudeGain.toFixed(0)} ft`);
console.log(`  Final altitude: ${altitudes_agl.runIn} + ${phase1_actualAltitudeGain.toFixed(0)} = ${phase1_actualAltitude.toFixed(0)} ft`);
console.log(`  Target apex: ${altitudes_agl.apex} ft`);
console.log(`  Difference: ${(phase1_actualAltitude - altitudes_agl.apex).toFixed(0)} ft`);

console.log('\n' + '-'.repeat(70));
console.log('PHASE 2: PULL DOWN (APEX to Track Point)');
console.log('-'.repeat(70));

const phase2_altitudeLoss = altitudes_agl.apex - altitudes_agl.trackPoint;
console.log(`\nAltitude loss: ${phase2_altitudeLoss} ft`);
console.log(`From ${altitudes_agl.apex} ft (apex) to ${altitudes_agl.trackPoint} ft (track point)`);

// Diagram formula: "Track Point Altitude [TP] (7314') = Release Altitude (6014') + Altitude Lost in Tracking (1300')"
// This seems backwards - let me check
const diagramCheck1 = diagram.releaseAltitude_msl + 1300;
console.log(`\nDiagram formula check: ${diagram.releaseAltitude_msl} + 1300 = ${diagramCheck1} (should be ${diagram.trackPointAltitude_msl})`);

// Another formula: "Apex Altitude (8,814') = Track Point Altitude [TP] (7314') + (Dive Angle (30) x 50)"
const diagramCheck2 = diagram.trackPointAltitude_msl + (30 * 50);
console.log(`Diagram formula check: ${diagram.trackPointAltitude_msl} + (30 × 50) = ${diagramCheck2} (should be ${diagram.apexAltitude_msl})`);

console.log('\n' + '-'.repeat(70));
console.log('PHASE 3: DIVE (Track Point to Release)');
console.log('-'.repeat(70));

const phase3_altitudeLoss = altitudes_agl.trackPoint - altitudes_agl.release;
const phase3_distance_ft = phase3_altitudeLoss / Math.tan(diagram.diveAngle_deg * Math.PI / 180);
const phase3_distance_nm = phase3_distance_ft / 6076.12;

console.log(`\nAltitude loss: ${phase3_altitudeLoss} ft`);
console.log(`Dive angle: ${diagram.diveAngle_deg}°`);
console.log(`\nCalculated dive distance:`);
console.log(`  ${phase3_distance_ft.toFixed(0)} ft (${phase3_distance_nm.toFixed(2)} nm)`);

console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));

if (Math.abs(phase1_difference_ft) < 1000) {
  console.log('✓ Phase 1 (Climb): PASS - calculations match diagram within 1000 ft');
} else {
  console.log(`✗ Phase 1 (Climb): FAIL - ${Math.abs(phase1_difference_ft).toFixed(0)} ft discrepancy`);
  console.log('  Possible reasons:');
  console.log('  - Diagram distance is slant distance, not ground distance');
  console.log('  - Diagram includes offset geometry effects');
  console.log('  - Starting altitude assumption incorrect');
}

console.log('\nNOTE: The diagram distance (12,321 ft) may include the offset geometry');
console.log('      (60° turn creates a dogleg path longer than straight-line distance)');
console.log('='.repeat(70) + '\n');
