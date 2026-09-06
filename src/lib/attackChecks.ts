import type { AttackProfile } from '../types/attack.types';
import type { DbWeapon } from '../types/weapon.types';

/**
 * Sanity checks on an attack: does the profile the pilot is about to fly
 * respect the weapon's own limits, and does the weapon suit the delivery?
 *
 * Every number here already exists in the weapons table (min/max release
 * altitude and speed, frag min-safe altitude, guidance). Nothing used it: the
 * editor's old constraint block read camelCase fields that the DB never
 * returns, so it always showed a green tick — which is how a card came to
 * print a 3,500 ft release under a 4,500 ft min-safe.
 *
 * `error` means the attack as written should not be flown; `warn` means a
 * pilot should look twice. The kneeboard prints both as ⚠ lines.
 */

export type CheckLevel = 'error' | 'warn';

export interface AttackCheck {
  level: CheckLevel;
  text: string;
}

export interface AttackCheckInput {
  profileType: string;
  profile: Partial<AttackProfile>;
  weapon?: DbWeapon | null;
  /** Needed to compare a level (MSL) release against AGL weapon limits */
  targetElevation_ft?: number;
}

/** Profiles where the pilot releases visually on a computed impact point. */
const CCIP_PROFILES = new Set(['popup_ccip', 'dive_ccip', 'low_angle_low_drag', 'high_angle_strafe']);

interface ReleasePoint {
  alt_agl?: number;
  speed_ktas?: number;
  hardDeck_agl?: number;
  rollIn_agl?: number;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function ft(v: number): string {
  return `${Math.round(v).toLocaleString()} ft`;
}

/** The altitude and speed the pilot will actually release at, by profile type. */
function releasePoint(profile: Partial<AttackProfile>, targetElevation_ft?: number): ReleasePoint {
  const p = profile as Record<string, unknown>;
  switch (profile.type) {
    case 'popup_ccip':
      return {
        alt_agl: isNum(p.releaseAltitude_ft) ? p.releaseAltitude_ft : undefined,
        speed_ktas: isNum(p.releaseSpeed_ktas) ? p.releaseSpeed_ktas : undefined,
        hardDeck_agl: isNum(p.minAltitude_ft) ? p.minAltitude_ft : undefined,
        rollIn_agl: isNum(p.rollInAltitude_ft) ? p.rollInAltitude_ft : undefined,
      };
    case 'dive_ccip':
      return {
        alt_agl: isNum(p.releaseAltitude_ft) ? p.releaseAltitude_ft : undefined,
        speed_ktas: isNum(p.releaseSpeed_ktas) ? p.releaseSpeed_ktas : undefined,
        rollIn_agl: isNum(p.rollInAltitude_ft) ? p.rollInAltitude_ft : undefined,
      };
    case 'level_ccrp':
    case 'loft_ccrp':
    case 'standoff':
      // These store MSL; only comparable to AGL limits when we know the ground.
      return {
        alt_agl:
          isNum(p.releaseAltitude_ft) && isNum(targetElevation_ft)
            ? p.releaseAltitude_ft - targetElevation_ft
            : undefined,
        speed_ktas: isNum(p.releaseSpeed_ktas) ? p.releaseSpeed_ktas : undefined,
      };
    default:
      return {};
  }
}

export function runAttackChecks(input: AttackCheckInput): AttackCheck[] {
  const { profileType, profile, weapon, targetElevation_ft } = input;
  const checks: AttackCheck[] = [];
  const rp = releasePoint(profile, targetElevation_ft);

  // Geometry that cannot be flown, regardless of weapon.
  if (isNum(rp.rollIn_agl) && isNum(rp.alt_agl) && rp.rollIn_agl <= rp.alt_agl) {
    checks.push({
      level: 'error',
      text: `Roll-in ${ft(rp.rollIn_agl)} is not above release ${ft(rp.alt_agl)}`,
    });
  }
  if (isNum(rp.hardDeck_agl) && isNum(rp.alt_agl) && rp.hardDeck_agl > rp.alt_agl) {
    checks.push({
      level: 'warn',
      text: `Hard deck ${ft(rp.hardDeck_agl)} AGL is above the ${ft(rp.alt_agl)} release`,
    });
  }

  if (!weapon) return checks;

  // Does the weapon suit the delivery? A guided weapon on a visual pass is
  // legitimate (a JDAM off the top of a pop-up, CCRP at the roll-in), so this
  // is a reminder to confirm the release mode, not a refusal.
  if (CCIP_PROFILES.has(profileType) && weapon.guidance !== 'none') {
    checks.push({
      level: 'warn',
      text: `${weapon.name} is ${weapon.guidance.toUpperCase()}-guided — confirm release mode (CCRP/AUTO) for this pass`,
    });
  }

  // Does the release respect the weapon's own limits?
  if (isNum(rp.alt_agl)) {
    if (isNum(weapon.min_release_alt_ft) && rp.alt_agl < weapon.min_release_alt_ft) {
      checks.push({
        level: 'error',
        text: `Release ${ft(rp.alt_agl)} AGL is below ${weapon.name} minimum ${ft(weapon.min_release_alt_ft)}`,
      });
    }
    // Frag min-safe applies to every weapon: it is about where the aircraft
    // is at impact, not how the bomb got there. The calculator clamps the
    // default release to this, so seeing it means someone lowered it by hand.
    if (isNum(weapon.frag_min_safe_alt_ft) && rp.alt_agl < weapon.frag_min_safe_alt_ft) {
      checks.push({
        level: 'error',
        text: `Release ${ft(rp.alt_agl)} AGL is inside the frag envelope — min-safe ${ft(weapon.frag_min_safe_alt_ft)}`,
      });
    }
    if (isNum(weapon.max_release_alt_ft) && rp.alt_agl > weapon.max_release_alt_ft) {
      checks.push({
        level: 'warn',
        text: `Release ${ft(rp.alt_agl)} AGL is above ${weapon.name} maximum ${ft(weapon.max_release_alt_ft)}`,
      });
    }
  }

  if (isNum(rp.speed_ktas)) {
    if (isNum(weapon.min_release_speed_ktas) && rp.speed_ktas < weapon.min_release_speed_ktas) {
      checks.push({
        level: 'warn',
        text: `Release speed ${Math.round(rp.speed_ktas)} KTAS is below ${weapon.name} minimum ${weapon.min_release_speed_ktas}`,
      });
    }
    if (isNum(weapon.max_release_speed_ktas) && rp.speed_ktas > weapon.max_release_speed_ktas) {
      checks.push({
        level: 'warn',
        text: `Release speed ${Math.round(rp.speed_ktas)} KTAS is above ${weapon.name} maximum ${weapon.max_release_speed_ktas}`,
      });
    }
  }

  return checks;
}

export function hasErrors(checks: AttackCheck[]): boolean {
  return checks.some((c) => c.level === 'error');
}
