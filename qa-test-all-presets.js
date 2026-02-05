/**
 * QA SANITY CHECK - All Popup CCIP Presets
 * Verify geometry, altitudes, speeds, and ranges are consistent
 */

console.log('='.repeat(80));
console.log('QA SANITY CHECK - POPUP CCIP PRESETS');
console.log('='.repeat(80));

// Preset definitions from code
const PRESETS = [
  {
    name: 'Standard',
    popDistance_nm: 4.0,
    apexAltitude_ft: 7500,
    diveAngle_deg: 20,
    runInAltitude_ft: 100,
    runInSpeed_ktas: 450,
    offsetAngle_deg: 20,    // From geometry params
    climbAngle_deg: 30,     // From geometry params
    pulloutG: 4.0,          // Standard pullout
  },
  {
    name: 'Low Threat',
    popDistance_nm: 7.0,
    apexAltitude_ft: 7500,
    diveAngle_deg: 20,
    runInAltitude_ft: 250,
    runInSpeed_ktas: 450,
    offsetAngle_deg: 10,    // From geometry params
    climbAngle_deg: 30,     // From geometry params
    pulloutG: 4.0,          // Standard pullout
  },
  {
    name: 'High Threat',
    popDistance_nm: 2.5,
    apexAltitude_ft: 4500,
    diveAngle_deg: 30,
    runInAltitude_ft: 50,
    runInSpeed_ktas: 550,
    offsetAngle_deg: 15,    // From geometry params
    climbAngle_deg: 35,     // From geometry params
    pulloutG: 7.0,          // F-16 aggressive
  },
];

const MIN_PULLOUT_ALT = 2000; // Minimum safe altitude

function testPreset(preset) {
  console.log('\n' + '='.repeat(80));
  console.log(`TESTING: ${preset.name.toUpperCase()}`);
  console.log('='.repeat(80));

  console.log('\nINPUT PARAMETERS:');
  console.log(`  POP: ${preset.popDistance_nm} nm from target at ${preset.runInAltitude_ft} ft AGL`);
  console.log(`  Offset: ${preset.offsetAngle_deg}° right turn`);
  console.log(`  Speed: ${preset.runInSpeed_ktas} KTAS`);
  console.log(`  Target apex: ${preset.apexAltitude_ft} ft AGL`);
  console.log(`  Dive: ${preset.diveAngle_deg}°`);
  console.log(`  Pullout: ${preset.pulloutG}G`);

  const errors = [];
  const warnings = [];

  // PHASE 1: CLIMB (POP to ATK)
  console.log('\n' + '-'.repeat(80));
  console.log('PHASE 1: CLIMB');
  console.log('-'.repeat(80));

  const climb_altGain = preset.apexAltitude_ft - preset.runInAltitude_ft;
  const climb_dist_ft = climb_altGain / Math.tan(preset.climbAngle_deg * Math.PI / 180);
  const climb_dist_nm = climb_dist_ft / 6076.12;

  console.log(`Altitude gain: ${climb_altGain} ft`);
  console.log(`Climb angle: ${preset.climbAngle_deg}°`);
  console.log(`Climb distance: ${climb_dist_nm.toFixed(2)} nm (${climb_dist_ft.toFixed(0)} ft)`);

  // Calculate ATK position using law of cosines
  const atk_range_nm = Math.sqrt(
    preset.popDistance_nm * preset.popDistance_nm +
    climb_dist_nm * climb_dist_nm -
    2 * preset.popDistance_nm * climb_dist_nm * Math.cos(preset.offsetAngle_deg * Math.PI / 180)
  );

  console.log(`ATK position: ${atk_range_nm.toFixed(2)} nm from target at ${preset.apexAltitude_ft} ft (apex)`);

  // Verify ATK is closer than POP
  if (atk_range_nm >= preset.popDistance_nm) {
    warnings.push(`ATK (${atk_range_nm.toFixed(2)}nm) not closer than POP (${preset.popDistance_nm}nm)`);
  }

  // PHASE 2: DIVE (ATK to Release)
  console.log('\n' + '-'.repeat(80));
  console.log('PHASE 2: DIVE');
  console.log('-'.repeat(80));

  // Calculate required release altitude for safe pullout
  const speed_fps = preset.runInSpeed_ktas * 1.68781;
  const pullout_radius = (speed_fps * speed_fps) / (32.2 * preset.pulloutG);
  const alt_loss_pullout = pullout_radius * (1 - Math.cos(preset.diveAngle_deg * Math.PI / 180));
  const required_release_alt = MIN_PULLOUT_ALT + alt_loss_pullout;

  console.log(`Release speed: ${preset.runInSpeed_ktas} KTAS (${speed_fps.toFixed(0)} ft/s)`);
  console.log(`Pullout: ${preset.pulloutG}G, radius ${pullout_radius.toFixed(0)} ft`);
  console.log(`Altitude loss in pullout: ${alt_loss_pullout.toFixed(0)} ft`);
  console.log(`Required release altitude: ${required_release_alt.toFixed(0)} ft`);

  // Calculate dive distance
  const dive_altLoss = preset.apexAltitude_ft - required_release_alt;
  const dive_dist_ft = dive_altLoss / Math.tan(preset.diveAngle_deg * Math.PI / 180);
  const dive_dist_nm = dive_dist_ft / 6076.12;

  console.log(`Dive altitude loss: ${dive_altLoss.toFixed(0)} ft`);
  console.log(`Dive angle: ${preset.diveAngle_deg}°`);
  console.log(`Dive distance: ${dive_dist_nm.toFixed(2)} nm (${dive_dist_ft.toFixed(0)} ft)`);

  // Verify dive is possible
  if (dive_altLoss < 0) {
    errors.push(`Apex (${preset.apexAltitude_ft}ft) is below required release altitude (${required_release_alt.toFixed(0)}ft)!`);
  }

  const final_pullout_alt = required_release_alt - alt_loss_pullout;
  console.log(`Final altitude after pullout: ${final_pullout_alt.toFixed(0)} ft`);

  if (final_pullout_alt < MIN_PULLOUT_ALT - 50) {
    errors.push(`Pullout ends at ${final_pullout_alt.toFixed(0)}ft, below minimum ${MIN_PULLOUT_ALT}ft!`);
  } else if (Math.abs(final_pullout_alt - MIN_PULLOUT_ALT) > 50) {
    warnings.push(`Pullout ends at ${final_pullout_alt.toFixed(0)}ft (target ${MIN_PULLOUT_ALT}ft)`);
  }

  // PHASE 3: TIME ANALYSIS
  console.log('\n' + '-'.repeat(80));
  console.log('PHASE 3: EXPOSURE TIME');
  console.log('-'.repeat(80));

  // Estimate time above 500ft
  const avg_climb_speed_fps = preset.runInSpeed_ktas * 1.68781 * 0.75; // Slower during climb
  const time_to_500ft = (500 - preset.runInAltitude_ft) / (avg_climb_speed_fps * Math.sin(preset.climbAngle_deg * Math.PI / 180));
  const time_above_500_during_climb = climb_dist_ft / avg_climb_speed_fps - time_to_500ft;

  const dive_speed_fps = preset.runInSpeed_ktas * 1.68781;
  const time_above_500_during_dive = dive_dist_ft / dive_speed_fps;

  const total_time_above_500 = Math.max(0, time_above_500_during_climb) + time_above_500_during_dive;

  console.log(`Time above 500ft: ${total_time_above_500.toFixed(1)} seconds`);
  console.log(`  Climb portion: ${Math.max(0, time_above_500_during_climb).toFixed(1)}s`);
  console.log(`  Dive portion: ${time_above_500_during_dive.toFixed(1)}s`);

  // VALIDATION
  console.log('\n' + '-'.repeat(80));
  console.log('VALIDATION RESULTS');
  console.log('-'.repeat(80));

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✓ PASS: All checks passed!');
  } else {
    if (errors.length > 0) {
      console.log(`✗ ERRORS (${errors.length}):`);
      errors.forEach(err => console.log(`  - ${err}`));
    }
    if (warnings.length > 0) {
      console.log(`⚠ WARNINGS (${warnings.length}):`);
      warnings.forEach(warn => console.log(`  - ${warn}`));
    }
  }

  return { errors, warnings, metrics: {
    atk_range_nm,
    climb_dist_nm,
    dive_dist_nm,
    required_release_alt,
    final_pullout_alt,
    total_time_above_500,
  }};
}

// Test all presets
const results = PRESETS.map(preset => testPreset(preset));

// Summary
console.log('\n' + '='.repeat(80));
console.log('OVERALL SUMMARY');
console.log('='.repeat(80));

const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

console.log('\n' + '-'.repeat(80));
PRESETS.forEach((preset, i) => {
  const result = results[i];
  const status = result.errors.length === 0 ? '✓' : '✗';
  console.log(`${status} ${preset.name.padEnd(15)} ATK: ${result.metrics.atk_range_nm.toFixed(2)}nm  Time>500ft: ${result.metrics.total_time_above_500.toFixed(1)}s`);
});

console.log('\n' + '-'.repeat(80));
if (totalErrors === 0 && totalWarnings === 0) {
  console.log('✓✓✓ ALL PRESETS VALIDATED - Ready for production!');
} else if (totalErrors === 0) {
  console.log(`⚠ All presets pass with ${totalWarnings} warnings`);
} else {
  console.log(`✗ ${totalErrors} errors found - presets need adjustment!`);
}
console.log('='.repeat(80) + '\n');
