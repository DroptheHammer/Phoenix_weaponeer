/**
 * TIME BREAKDOWN - Each leg of attack for all presets
 */

console.log('='.repeat(80));
console.log('TIME BREAKDOWN - POPUP CCIP ATTACK LEGS');
console.log('='.repeat(80));

const PRESETS = [
  {
    name: 'Standard',
    popDistance_nm: 4.0,
    apexAltitude_ft: 7500,
    diveAngle_deg: 20,
    runInAltitude_ft: 100,
    runInSpeed_ktas: 450,
    offsetAngle_deg: 20,
    climbAngle_deg: 30,
    pulloutG: 4.0,
  },
  {
    name: 'Low Threat',
    popDistance_nm: 7.0,
    apexAltitude_ft: 7500,
    diveAngle_deg: 20,
    runInAltitude_ft: 250,
    runInSpeed_ktas: 450,
    offsetAngle_deg: 10,
    climbAngle_deg: 30,
    pulloutG: 4.0,
  },
  {
    name: 'High Threat',
    popDistance_nm: 2.5,
    apexAltitude_ft: 4500,
    diveAngle_deg: 30,
    runInAltitude_ft: 50,
    runInSpeed_ktas: 550,
    offsetAngle_deg: 15,
    climbAngle_deg: 35,
    pulloutG: 7.0,
  },
];

const MIN_PULLOUT_ALT = 2000;

function analyzeTimeBreakdown(preset) {
  console.log('\n' + '='.repeat(80));
  console.log(`${preset.name.toUpperCase()}`);
  console.log('='.repeat(80));

  // Calculate geometry
  const climb_altGain = preset.apexAltitude_ft - preset.runInAltitude_ft;
  const climb_dist_ft = climb_altGain / Math.tan(preset.climbAngle_deg * Math.PI / 180);
  const climb_dist_nm = climb_dist_ft / 6076.12;

  const speed_fps = preset.runInSpeed_ktas * 1.68781;
  const pullout_radius = (speed_fps * speed_fps) / (32.2 * preset.pulloutG);
  const alt_loss_pullout = pullout_radius * (1 - Math.cos(preset.diveAngle_deg * Math.PI / 180));
  const required_release_alt = MIN_PULLOUT_ALT + alt_loss_pullout;

  const dive_altLoss = preset.apexAltitude_ft - required_release_alt;
  const dive_dist_ft = dive_altLoss / Math.tan(preset.diveAngle_deg * Math.PI / 180);
  const dive_dist_nm = dive_dist_ft / 6076.12;

  // Calculate pullout arc length
  const pullout_arc_angle = preset.diveAngle_deg * Math.PI / 180; // Radians
  const pullout_arc_length = pullout_radius * pullout_arc_angle;

  // Calculate ATK range from target
  const atk_range_nm = Math.sqrt(
    preset.popDistance_nm * preset.popDistance_nm +
    climb_dist_nm * climb_dist_nm -
    2 * preset.popDistance_nm * climb_dist_nm * Math.cos(preset.offsetAngle_deg * Math.PI / 180)
  );

  console.log('\nGEOMETRIC POSITION:');
  console.log(`  POP:         ${preset.popDistance_nm} nm from target`);
  console.log(`  ATK (apex):  ${atk_range_nm.toFixed(2)} nm from target`);

  console.log('\nDISTANCES FLOWN:');
  console.log(`  Climb leg (POP to ATK):    ${climb_dist_nm.toFixed(2)} nm (${climb_dist_ft.toFixed(0)} ft)`);
  console.log(`  Dive leg (ATK to Release): ${dive_dist_nm.toFixed(2)} nm (${dive_dist_ft.toFixed(0)} ft)`);
  console.log(`  Pullout arc:               ${(pullout_arc_length/6076.12).toFixed(2)} nm (${pullout_arc_length.toFixed(0)} ft)`);
  console.log(`  Total distance flown:      ${(climb_dist_nm + dive_dist_nm + pullout_arc_length/6076.12).toFixed(2)} nm`);

  // LEG 1: CLIMB (POP to ATK)
  // Speed reduced during climb due to vertical component
  const avg_climb_speed_ktas = preset.runInSpeed_ktas * 0.75; // Assume 75% of cruise speed
  const avg_climb_speed_fps = avg_climb_speed_ktas * 1.68781;
  const time_climb = climb_dist_ft / avg_climb_speed_fps;

  // LEG 2: DIVE (ATK to Release)
  // Speed maintained or increased during dive
  const avg_dive_speed_ktas = preset.runInSpeed_ktas; // At release speed
  const avg_dive_speed_fps = avg_dive_speed_ktas * 1.68781;
  const time_dive = dive_dist_ft / avg_dive_speed_fps;

  // LEG 3: PULLOUT (Release to Level)
  // Speed decreases during pullout due to G-loading
  // Use average of entry and exit speed (conservatively assume 80% due to G)
  const avg_pullout_speed_fps = speed_fps * 0.9; // Slight deceleration
  const time_pullout = pullout_arc_length / avg_pullout_speed_fps;

  const total_time = time_climb + time_dive + time_pullout;

  console.log('\n' + '-'.repeat(80));
  console.log('TIME BREAKDOWN:');
  console.log('-'.repeat(80));

  console.log('\nLEG 1: CLIMB (POP → ATK)');
  console.log(`  Distance: ${climb_dist_nm.toFixed(2)} nm`);
  console.log(`  Speed: ${avg_climb_speed_ktas.toFixed(0)} KTAS (avg, reduced during climb)`);
  console.log(`  Time: ${time_climb.toFixed(1)} seconds`);
  console.log(`  Altitude: ${preset.runInAltitude_ft}ft → ${preset.apexAltitude_ft}ft (+${climb_altGain}ft)`);

  console.log('\nLEG 2: DIVE (ATK → Release)');
  console.log(`  Distance: ${dive_dist_nm.toFixed(2)} nm`);
  console.log(`  Speed: ${avg_dive_speed_ktas.toFixed(0)} KTAS (at release speed)`);
  console.log(`  Time: ${time_dive.toFixed(1)} seconds`);
  console.log(`  Altitude: ${preset.apexAltitude_ft}ft → ${required_release_alt.toFixed(0)}ft (-${dive_altLoss.toFixed(0)}ft)`);

  console.log('\nLEG 3: PULLOUT (Release → Level)');
  console.log(`  Arc length: ${(pullout_arc_length/6076.12).toFixed(2)} nm`);
  console.log(`  Speed: ${(avg_pullout_speed_fps/1.68781).toFixed(0)} KTAS (avg during pullout)`);
  console.log(`  G-load: ${preset.pulloutG}G`);
  console.log(`  Time: ${time_pullout.toFixed(1)} seconds`);
  console.log(`  Altitude: ${required_release_alt.toFixed(0)}ft → ${MIN_PULLOUT_ALT}ft (-${alt_loss_pullout.toFixed(0)}ft)`);

  console.log('\n' + '-'.repeat(80));
  console.log('TOTALS:');
  console.log('-'.repeat(80));
  console.log(`  Total attack time: ${total_time.toFixed(1)} seconds (${(total_time/60).toFixed(2)} minutes)`);
  console.log(`  Total distance flown: ${(climb_dist_nm + dive_dist_nm + pullout_arc_length/6076.12).toFixed(2)} nm`);
  console.log(`  ATK range from target: ${atk_range_nm.toFixed(2)} nm`);

  // Calculate time in each altitude band
  const time_below_500 = 0; // Assume we start at POP above this in our model
  const time_500_to_3000 = (500 - preset.runInAltitude_ft) / (avg_climb_speed_fps * Math.sin(preset.climbAngle_deg * Math.PI / 180)) +
                           time_dive + time_pullout;
  const time_above_3000 = time_climb - (500 - preset.runInAltitude_ft) / (avg_climb_speed_fps * Math.sin(preset.climbAngle_deg * Math.PI / 180));

  console.log('\n' + '-'.repeat(80));
  console.log('EXPOSURE BY ALTITUDE:');
  console.log('-'.repeat(80));
  console.log(`  Below 500ft: ${Math.max(0, time_below_500).toFixed(1)}s (terrain masking)`);
  console.log(`  500-3000ft:  ${Math.max(0, time_500_to_3000).toFixed(1)}s (medium exposure)`);
  console.log(`  Above 3000ft: ${Math.max(0, time_above_3000).toFixed(1)}s (high exposure)`);

  // Calculate percentage breakdown
  console.log('\n' + '-'.repeat(80));
  console.log('TIME ALLOCATION:');
  console.log('-'.repeat(80));
  console.log(`  Climb:   ${time_climb.toFixed(1)}s (${(time_climb/total_time*100).toFixed(1)}%)`);
  console.log(`  Dive:    ${time_dive.toFixed(1)}s (${(time_dive/total_time*100).toFixed(1)}%)`);
  console.log(`  Pullout: ${time_pullout.toFixed(1)}s (${(time_pullout/total_time*100).toFixed(1)}%)`);

  return {
    time_climb,
    time_dive,
    time_pullout,
    total_time,
  };
}

// Analyze all presets
const results = PRESETS.map(preset => ({
  name: preset.name,
  ...analyzeTimeBreakdown(preset),
}));

// Comparison table
console.log('\n' + '='.repeat(80));
console.log('COMPARISON TABLE');
console.log('='.repeat(80));
console.log('\n' + '-'.repeat(80));
console.log('Preset          Climb    Dive   Pullout   Total');
console.log('-'.repeat(80));
results.forEach(r => {
  console.log(`${r.name.padEnd(15)} ${r.time_climb.toFixed(1).padStart(5)}s  ${r.time_dive.toFixed(1).padStart(5)}s  ${r.time_pullout.toFixed(1).padStart(5)}s   ${r.total_time.toFixed(1).padStart(5)}s`);
});
console.log('-'.repeat(80));

console.log('\nKEY INSIGHTS:');
console.log(`  • High Threat is ${(results[0].total_time / results[2].total_time).toFixed(1)}x faster than Standard`);
console.log(`  • Low Threat has ${((results[1].time_climb / results[1].total_time) * 100).toFixed(0)}% of time in climb`);
console.log(`  • High Threat minimizes exposure with aggressive 7G pullout`);

console.log('\n' + '='.repeat(80) + '\n');
