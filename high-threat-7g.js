/**
 * HIGH THREAT profile with F-16 aggressive 7G pullout
 */

console.log('='.repeat(75));
console.log('HIGH THREAT - F-16 with 7G PULLOUT');
console.log('='.repeat(75));

const HIGH_THREAT = {
  popRange_nm: 2.5,
  offsetAngle_deg: 15,
  climbAngle_deg: 35,
  runInAlt_ft: 100,
  releaseSpeed_ktas: 550,
  diveAngle_deg: 30,
  pulloutG: 7.0,              // F-16 can handle 7G
  minPulloutAlt_ft: 2000,
};

// Calculate required release altitude for 2000ft pullout with 7G
const speed_fps = HIGH_THREAT.releaseSpeed_ktas * 1.68781;
const pullout_radius = (speed_fps * speed_fps) / (32.2 * HIGH_THREAT.pulloutG);
const alt_loss_pullout = pullout_radius * (1 - Math.cos(HIGH_THREAT.diveAngle_deg * Math.PI / 180));
const required_release_alt = HIGH_THREAT.minPulloutAlt_ft + alt_loss_pullout;

console.log('\nPULLOUT CALCULATION:');
console.log('-'.repeat(75));
console.log(`Release speed: ${HIGH_THREAT.releaseSpeed_ktas} KTAS (${speed_fps.toFixed(0)} ft/s)`);
console.log(`Pullout G-loading: ${HIGH_THREAT.pulloutG}G (F-16 aggressive)`);
console.log(`Pullout radius: ${pullout_radius.toFixed(0)} ft`);
console.log(`Altitude loss: ${alt_loss_pullout.toFixed(0)} ft`);
console.log(`Required release: ${required_release_alt.toFixed(0)} ft`);
console.log(`Pulls out at: ${HIGH_THREAT.minPulloutAlt_ft} ft AGL ✓`);

// Use lower apex to minimize exposure
HIGH_THREAT.targetApex_ft = 4500;
HIGH_THREAT.releaseAlt_ft = Math.round(required_release_alt);

// Calculate climb to apex
const climb_altGain = HIGH_THREAT.targetApex_ft - HIGH_THREAT.runInAlt_ft;
const climb_dist_nm = (climb_altGain / Math.tan(HIGH_THREAT.climbAngle_deg * Math.PI / 180)) / 6076.12;

// Calculate ATK position
const atk_range_nm = Math.sqrt(
  HIGH_THREAT.popRange_nm * HIGH_THREAT.popRange_nm +
  climb_dist_nm * climb_dist_nm -
  2 * HIGH_THREAT.popRange_nm * climb_dist_nm * Math.cos(HIGH_THREAT.offsetAngle_deg * Math.PI / 180)
);

// Calculate dive distance
const dive_altLoss = HIGH_THREAT.targetApex_ft - HIGH_THREAT.releaseAlt_ft;
const dive_dist_ft = dive_altLoss / Math.tan(HIGH_THREAT.diveAngle_deg * Math.PI / 180);

// Estimate time above 500ft (rough approximation)
const avg_climb_speed_fps = HIGH_THREAT.releaseSpeed_ktas * 1.68781 * 0.75; // Slower during climb
const climb_time = (climb_dist_nm * 6076.12) / avg_climb_speed_fps;
const dive_time = dive_dist_ft / (HIGH_THREAT.releaseSpeed_ktas * 1.68781);
const total_time_above_500 = climb_time + dive_time;

console.log('\n' + '-'.repeat(75));
console.log('PROFILE GEOMETRY:');
console.log('-'.repeat(75));
console.log(`POP: ${HIGH_THREAT.popRange_nm}nm from target at ${HIGH_THREAT.runInAlt_ft}ft`);
console.log(`Turn: ${HIGH_THREAT.offsetAngle_deg}° right`);
console.log(`Climb: ${climb_dist_nm.toFixed(2)}nm at ${HIGH_THREAT.climbAngle_deg}°`);
console.log(`ATK: ${atk_range_nm.toFixed(2)}nm from target at ${HIGH_THREAT.targetApex_ft}ft (apex)`);
console.log(`Dive: ${(dive_dist_ft/6076.12).toFixed(2)}nm at ${HIGH_THREAT.diveAngle_deg}°`);
console.log(`Release: ${HIGH_THREAT.releaseAlt_ft}ft @ ${HIGH_THREAT.releaseSpeed_ktas} KTAS`);
console.log(`Pullout: ${HIGH_THREAT.pulloutG}G to ${HIGH_THREAT.minPulloutAlt_ft}ft`);

console.log('\n' + '-'.repeat(75));
console.log('THREAT MITIGATION:');
console.log('-'.repeat(75));
console.log(`Time above 500ft: ${total_time_above_500.toFixed(1)} seconds (minimized)`);
console.log(`Peak altitude: ${HIGH_THREAT.targetApex_ft}ft (low profile)`);
console.log(`Standoff: ${HIGH_THREAT.popRange_nm}nm POP (close, fast attack)`);
console.log(`Speed: ${HIGH_THREAT.releaseSpeed_ktas} KTAS (high speed reduces exposure)`);

console.log('\n' + '='.repeat(75));
console.log('FOR CODE:');
console.log('='.repeat(75));

const preset = {
  name: 'High Threat',
  popDistance_nm: HIGH_THREAT.popRange_nm,
  apexAltitude_ft: HIGH_THREAT.targetApex_ft,
  diveAngle_deg: HIGH_THREAT.diveAngle_deg,
  runInAltitude_ft: HIGH_THREAT.runInAlt_ft,
  runInSpeed_ktas: HIGH_THREAT.releaseSpeed_ktas,
};

console.log(JSON.stringify(preset, null, 2));
console.log('='.repeat(75) + '\n');
