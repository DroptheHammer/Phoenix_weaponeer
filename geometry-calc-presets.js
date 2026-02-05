/**
 * Calculate preset profiles for different threat environments
 */

console.log('='.repeat(75));
console.log('PRESET PROFILES CALCULATION');
console.log('='.repeat(75));

// STANDARD - Our validated profile
const STANDARD = {
  name: 'Standard',
  popRange_nm: 4.0,
  offsetAngle_deg: 20,
  climbAngle_deg: 30,
  runInAlt_ft: 100,
  targetApex_ft: 7500,
  diveAngle_deg: 20,
  releaseAlt_ft: 3000,
  releaseSpeed_ktas: 450,
};

console.log('\n1. STANDARD (Balanced)');
console.log('-'.repeat(75));
console.log(`   POP: ${STANDARD.popRange_nm}nm, Turn: ${STANDARD.offsetAngle_deg}°, Climb: ${STANDARD.climbAngle_deg}°`);
console.log(`   Apex: ${STANDARD.targetApex_ft}ft, Release: ${STANDARD.releaseAlt_ft}ft @ ${STANDARD.releaseSpeed_ktas}kts`);

// LOW THREAT - 7nm POP, 10° turn
const LOW_THREAT = {
  name: 'Low Threat',
  popRange_nm: 7.0,
  offsetAngle_deg: 10,
  climbAngle_deg: 30,
  runInAlt_ft: 100,
  targetApex_ft: 7500,
  diveAngle_deg: 20,
  releaseAlt_ft: 3000,
  releaseSpeed_ktas: 450,
};

// Calculate low threat geometry
const lt_altGain = LOW_THREAT.targetApex_ft - LOW_THREAT.runInAlt_ft;
const lt_climbDist_nm = (lt_altGain / Math.tan(LOW_THREAT.climbAngle_deg * Math.PI / 180)) / 6076.12;
const lt_atkRange_nm = Math.sqrt(
  LOW_THREAT.popRange_nm * LOW_THREAT.popRange_nm +
  lt_climbDist_nm * lt_climbDist_nm -
  2 * LOW_THREAT.popRange_nm * lt_climbDist_nm * Math.cos(LOW_THREAT.offsetAngle_deg * Math.PI / 180)
);

console.log('\n2. LOW THREAT (Permissive - max standoff)');
console.log('-'.repeat(75));
console.log(`   POP: ${LOW_THREAT.popRange_nm}nm, Turn: ${LOW_THREAT.offsetAngle_deg}°, Climb: ${LOW_THREAT.climbAngle_deg}°`);
console.log(`   Climb distance: ${lt_climbDist_nm.toFixed(2)}nm`);
console.log(`   ATK: ${lt_atkRange_nm.toFixed(2)}nm from target at ${LOW_THREAT.targetApex_ft}ft`);
console.log(`   Release: ${LOW_THREAT.releaseAlt_ft}ft @ ${LOW_THREAT.releaseSpeed_ktas}kts`);

// HIGH THREAT - Minimize exposure, fast & low
// Requirements:
// - Minimize time above 500ft
// - Safe pullout at 2000ft after release at 550 KTAS
// - Release at 2500ft minimum for safe pullout

// Strategy: Close POP, steep climb, low apex, steep dive, fast
const HIGH_THREAT = {
  name: 'High Threat',
  popRange_nm: 2.5,           // Close in
  offsetAngle_deg: 15,        // Moderate offset
  climbAngle_deg: 35,         // Steep climb (minimize time)
  runInAlt_ft: 100,
  targetApex_ft: 4500,        // Lower apex (less exposure)
  diveAngle_deg: 30,          // Steep dive
  releaseAlt_ft: 2500,        // Higher release for safe pullout
  releaseSpeed_ktas: 550,     // Faster
  pulloutAlt_ft: 2000,        // Target pullout altitude
  pulloutG: 4.0,              // 4G pullout
};

// Calculate high threat geometry
const ht_altGain = HIGH_THREAT.targetApex_ft - HIGH_THREAT.runInAlt_ft;
const ht_climbDist_nm = (ht_altGain / Math.tan(HIGH_THREAT.climbAngle_deg * Math.PI / 180)) / 6076.12;
const ht_atkRange_nm = Math.sqrt(
  HIGH_THREAT.popRange_nm * HIGH_THREAT.popRange_nm +
  ht_climbDist_nm * ht_climbDist_nm -
  2 * HIGH_THREAT.popRange_nm * ht_climbDist_nm * Math.cos(HIGH_THREAT.offsetAngle_deg * Math.PI / 180)
);

// Calculate pullout dynamics
const ht_speed_fps = HIGH_THREAT.releaseSpeed_ktas * 1.68781; // Convert to ft/s
const ht_pullout_radius_ft = (ht_speed_fps * ht_speed_fps) / (32.2 * HIGH_THREAT.pulloutG);
const ht_pullout_alt_loss_ft = ht_pullout_radius_ft * (1 - Math.cos(HIGH_THREAT.diveAngle_deg * Math.PI / 180));
const ht_final_alt_ft = HIGH_THREAT.releaseAlt_ft - ht_pullout_alt_loss_ft;

// Calculate time above 500ft
const ht_climbTime_sec = (ht_climbDist_nm * 6076.12) / (HIGH_THREAT.releaseSpeed_ktas * 1.68781 * 0.8); // Slower during climb
const ht_diveAlt = HIGH_THREAT.targetApex_ft - HIGH_THREAT.releaseAlt_ft;
const ht_diveDist_ft = ht_diveAlt / Math.tan(HIGH_THREAT.diveAngle_deg * Math.PI / 180);
const ht_diveTime_sec = ht_diveDist_ft / (HIGH_THREAT.releaseSpeed_ktas * 1.68781);
const ht_totalTimeAbove500_sec = ht_climbTime_sec + ht_diveTime_sec;

console.log('\n3. HIGH THREAT (Denied - min exposure)');
console.log('-'.repeat(75));
console.log(`   POP: ${HIGH_THREAT.popRange_nm}nm, Turn: ${HIGH_THREAT.offsetAngle_deg}°, Climb: ${HIGH_THREAT.climbAngle_deg}°`);
console.log(`   Climb distance: ${ht_climbDist_nm.toFixed(2)}nm`);
console.log(`   ATK: ${ht_atkRange_nm.toFixed(2)}nm from target at ${HIGH_THREAT.targetApex_ft}ft`);
console.log(`   Release: ${HIGH_THREAT.releaseAlt_ft}ft @ ${HIGH_THREAT.releaseSpeed_ktas}kts`);
console.log(`   Pullout: ${HIGH_THREAT.pulloutG}G → level at ${ht_final_alt_ft.toFixed(0)}ft`);
console.log(`   Time above 500ft: ${ht_totalTimeAbove500_sec.toFixed(1)}s (minimized)`);

console.log('\n' + '='.repeat(75));
console.log('PRESET SUMMARY FOR CODE:');
console.log('='.repeat(75));

const PRESETS = [
  {
    name: 'Standard',
    popDistance_nm: STANDARD.popRange_nm,
    apexAltitude_ft: STANDARD.targetApex_ft,
    diveAngle_deg: STANDARD.diveAngle_deg,
    runInAltitude_ft: STANDARD.runInAlt_ft,
    runInSpeed_ktas: STANDARD.releaseSpeed_ktas,
  },
  {
    name: 'Low Threat',
    popDistance_nm: LOW_THREAT.popRange_nm,
    apexAltitude_ft: LOW_THREAT.targetApex_ft,
    diveAngle_deg: LOW_THREAT.diveAngle_deg,
    runInAltitude_ft: LOW_THREAT.runInAlt_ft,
    runInSpeed_ktas: LOW_THREAT.releaseSpeed_ktas,
  },
  {
    name: 'High Threat',
    popDistance_nm: HIGH_THREAT.popRange_nm,
    apexAltitude_ft: HIGH_THREAT.targetApex_ft,
    diveAngle_deg: HIGH_THREAT.diveAngle_deg,
    runInAltitude_ft: HIGH_THREAT.runInAlt_ft,
    runInSpeed_ktas: HIGH_THREAT.releaseSpeed_ktas,
  },
];

console.log('\n' + JSON.stringify(PRESETS, null, 2));
console.log('\n' + '='.repeat(75) + '\n');
