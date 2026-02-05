// Recalculate High Threat to ensure 2000ft pullout minimum

const MIN_PULLOUT_ALT = 2000;
const PULLOUT_G = 4.0;
const RELEASE_SPEED_KTAS = 550;
const DIVE_ANGLE_DEG = 30;

// Calculate required release altitude
const speed_fps = RELEASE_SPEED_KTAS * 1.68781;
const pullout_radius = (speed_fps * speed_fps) / (32.2 * PULLOUT_G);
const alt_loss = pullout_radius * (1 - Math.cos(DIVE_ANGLE_DEG * Math.PI / 180));
const required_release_alt = MIN_PULLOUT_ALT + alt_loss;

console.log('='.repeat(70));
console.log('HIGH THREAT ADJUSTMENT FOR 2000ft MINIMUM PULLOUT');
console.log('='.repeat(70));
console.log(`\nRelease speed: ${RELEASE_SPEED_KTAS} KTAS`);
console.log(`Dive angle: ${DIVE_ANGLE_DEG}°`);
console.log(`Pullout: ${PULLOUT_G}G`);
console.log(`\nAltitude loss in pullout: ${alt_loss.toFixed(0)} ft`);
console.log(`Required release altitude: ${required_release_alt.toFixed(0)} ft`);
console.log(`Pulls out at: ${MIN_PULLOUT_ALT} ft ✓`);

// Calculate apex needed for this release altitude
const APEX = 5000; // Try 5000ft apex
const dive_alt = APEX - required_release_alt;

console.log(`\n` + '-'.repeat(70));
console.log('UPDATED HIGH THREAT PARAMETERS:');
console.log('-'.repeat(70));
console.log(`Apex: ${APEX} ft AGL`);
console.log(`Dive: ${dive_alt.toFixed(0)} ft at ${DIVE_ANGLE_DEG}°`);
console.log(`Release: ${required_release_alt.toFixed(0)} ft @ ${RELEASE_SPEED_KTAS} KTAS`);
console.log(`Pullout: ${PULLOUT_G}G to ${MIN_PULLOUT_ALT} ft AGL`);
console.log('='.repeat(70) + '\n');
