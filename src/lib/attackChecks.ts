import type { AttackProfile } from '../types/attack.types';
import type { DbWeapon } from '../types/weapon.types';
import type { WeaponClass } from '../types/profile.types';
import { WEAPON_CLASS_LABEL } from './weaponClass';
import { isStraightIn, STRAIGHT_IN_TOLERANCE_DEG } from './attackGeometry';

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
 * Geometry is checked too: an attack heading within a few degrees of the
 * IP→target line is the predictable straight-in run the defence is waiting
 * for. That is a warning, not a stop — the planner may have a reason.
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
  /** When built from a library profile: the weapon's class and what the profile was written for */
  weaponClass?: WeaponClass;
  allowedClasses?: WeaponClass[];
  /** The profile's own delivery mode; without it (hand-built attack) CCIP is assumed for visual profiles */
  sourceProfileName?: string;
  /** Bearing IP → target, when the route has an IP. Enables the straight-in check. */
  directBearing_deg?: number;
}

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

function hdg(v: number): string {
  return `${Math.round(v).toString().padStart(3, '0')}°`;
}

/** The heading the attack axis is flown on, by profile type. */
function attackHeadingOf(profile: Partial<AttackProfile>): number | undefined {
  const p = profile as Record<string, unknown>;
  switch (profile.type) {
    case 'popup_ccip':
      // For a pop-up the predictable line is the approach, not the attack axis.
      return isNum(p.approachHeading_deg) ? p.approachHeading_deg : isNum(p.runInHeading_deg) ? p.runInHeading_deg : undefined;
    case 'dive_ccip':
    case 'level_ccrp':
    case 'loft_ccrp':
      return isNum(p.ingressHeading_deg) ? p.ingressHeading_deg : undefined;
    case 'standoff':
      return isNum(p.releaseHeading_deg) ? p.releaseHeading_deg : undefined;
    default:
      return undefined;
  }
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
  const { profile, weapon, targetElevation_ft, weaponClass, allowedClasses } = input;
  const checks: AttackCheck[] = [];
  const rp = releasePoint(profile, targetElevation_ft);

  // A cleared Customize field parses to NaN, and every check below skips a
  // non-finite number as "nothing to compare" — so it used to sail through to
  // Save and the card. A number that is not a number is an error.
  for (const [key, value] of Object.entries(profile)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      checks.push({ level: 'error', text: `A Customize field is blank or not a number (${key})` });
    }
  }

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

  // A pop-up whose check turn is too wide for its action range never gets its
  // pull-down onto the target.
  if (profile.type === 'popup_ccip' && (profile as { geometryCloses?: boolean }).geometryCloses === false) {
    checks.push({
      level: 'warn',
      text: 'Pop-up geometry does not close: the check turn is too wide for the action range — reduce it or move the action point out',
    });
  }

  // Running in along the IP→target line tells the defence where the jet will
  // be. Auto-build never does this; a planner typing a heading can.
  const heading = attackHeadingOf(profile);
  if (isNum(heading) && isNum(input.directBearing_deg) && isStraightIn(heading, input.directBearing_deg)) {
    checks.push({
      level: 'warn',
      text: `Predictable straight-in attack: ${profile.type === 'popup_ccip' ? 'approach' : 'heading'} ${hdg(heading)} is within ${STRAIGHT_IN_TOLERANCE_DEG}° of the IP→target line (${hdg(input.directBearing_deg)}). Advise against — make the angle off greater`,
    });
  }

  if (!weapon) return checks;

  // Does the weapon suit the delivery? The profile says which weapon classes
  // it was written for — that is the honest gate. A smart weapon on a visual
  // pass is fine when the profile lists it (a JDAM off a pop-up, an LGB in a
  // DTOS over a ridge); what is not fine is a low-drag bomb on a laydown.
  if (weaponClass && allowedClasses && !allowedClasses.includes(weaponClass)) {
    checks.push({
      level: 'warn',
      text: `${input.sourceProfileName ?? 'This profile'} is not written for ${WEAPON_CLASS_LABEL[weaponClass].toLowerCase()} (${weapon.name})`,
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
