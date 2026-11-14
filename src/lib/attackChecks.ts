import type { AttackProfile, LoftCCRPProfile } from '../types/attack.types';
import type { DbWeapon } from '../types/weapon.types';
import type { WeaponClass } from '../types/profile.types';
import { WEAPON_CLASS_LABEL, weaponClassOf } from './weaponClass';
import { isStraightIn, signedHeadingDelta, STRAIGHT_IN_TOLERANCE_DEG } from './attackGeometry';
import { jetRangeAtImpact_nm, loftPlanOf, resolveLoftEgressHeading, LOFT_FRAG_STANDOFF_NM } from './loftPlanning';
import { FT_PER_NM } from './popupPlanning';

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
 * A loft is checked differently (decided 2026-11-13, docs/DELIVERY_PLANNING.md,
 * "Loft and LABS"). The release-altitude floors (minimum release and frag
 * min-safe) are about where the jet is when the bomb goes off, and a lofting jet
 * is miles away by then, so they do not apply. Instead the jet's range from the
 * target at impact is checked against the 0.5 nm frag standoff: a warning, never
 * an error. The maximum release altitude and the speed limits still apply. A
 * loft runs straight from the IP by design, so it is never "predictable
 * straight-in", and it has no frag floor to be missing data for.
 *
 * `error` means the attack as written should not be flown; `warn` means a
 * pilot should look twice. The kneeboard prints both as ⚠ lines.
 */

export type CheckLevel = 'error' | 'warn';

export interface AttackCheck {
  level: CheckLevel;
  text: string;
  /**
   * Set on the "no data on file" note. It says something about the weapon's
   * reference row, not about this attack's numbers, so the card prints it as a
   * caution under the header instead of a weapon-section warning.
   */
  kind?: 'no-data';
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
  /** Distance IP → target, when the route has an IP. Enables the loft's IP-inside-the-pull-up check. */
  ipToTarget_nm?: number;
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

/**
 * What the tool cannot check for this weapon, when its reference row has no
 * figure for the floor the checks below compare against. A few rows have a
 * weight but no such floor (the GBU-16, AGM-65F, AGM-122, CBU-52B, Belouga and
 * SAMP bombs, and the Mk-81, Mk-81 Snakeye, Mk-83 AIR, BR-250, BR-500,
 * Durandal, CBU-103, CBU-105, BL-755, CBU-1/A, CBU-2/A and CBU-2B/A, and the
 * Rockeye and CBU-99, whose 1,380 ft fragment ceiling was rejected as a floor
 * because a floor blocks saving a normal 500 ft laydown; only the Mk-83 got a
 * sourced frag floor, on 2026-11-13, and no longer appears here): the floor is
 * then no floor at all, and
 * without a note the attack would plan and print as if it had been checked. A
 * weight, or an envelope extra such as the Durandal's minimum release, does not
 * clear the note: only the one floor it keys on does.
 *
 * A bomb needs a frag min-safe altitude (that is where the aircraft is at
 * impact). A missile needs a minimum release altitude: the seven missile and
 * standoff rows have no frag floor and are not expected to. Guns and rockets
 * are fired, not released, so they never have one.
 *
 * With the attack's `profileType`, a loft gets no note: the floors this is
 * about do not apply to it (see the top of this file).
 */
export function noDataNote(weapon: DbWeapon | null | undefined, profileType?: string): string | undefined {
  if (!weapon || profileType === 'loft_ccrp') return undefined;
  switch (weaponClassOf(weapon)) {
    case 'bomb_ld':
    case 'bomb_hd':
    case 'lgb':
    case 'jdam':
    case 'cluster':
      return isNum(weapon.frag_min_safe_alt_ft)
        ? undefined
        : `No frag data on file for ${weapon.name}: no minimum safe altitude is enforced`;
    case 'agm':
      return isNum(weapon.min_release_alt_ft)
        ? undefined
        : `No release data on file for ${weapon.name}: no minimum release altitude is enforced`;
    default:
      return undefined;
  }
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
    case 'loft_ccrp':
      // A loft stores AGL (the plan is worked over the target), so no ground is needed.
      return {
        alt_agl: isNum(p.releaseAltitude_ft) ? p.releaseAltitude_ft : undefined,
        speed_ktas: isNum(p.releaseSpeed_ktas) ? p.releaseSpeed_ktas : undefined,
      };
    case 'level_ccrp':
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

/**
 * The loft's own checks, both warnings:
 * - the jet is inside the 0.5 nm frag standoff when the bomb lands, flying the
 *   drawn escape (`jetRangeAtImpact_nm`: an estimate, on the short side);
 * - the IP is closer to the target than the pull-up point.
 */
function loftChecks(profile: Partial<AttackProfile>, ipToTarget_nm: number | undefined): AttackCheck[] {
  const p = profile as Record<string, unknown>;
  // An incomplete profile (a field being typed over) has no plan to check.
  if (!isNum(p.ingressAltitude_ft) || !isNum(p.ingressSpeed_ktas) || !isNum(p.pullUpAngle_deg) || !isNum(p.ingressHeading_deg)) return [];
  if (p.pullG != null && !isNum(p.pullG)) return [];
  const loft = profile as Pick<LoftCCRPProfile, 'ingressAltitude_ft' | 'ingressSpeed_ktas' | 'pullUpAngle_deg' | 'pullG' | 'ingressHeading_deg' | 'egressDirection' | 'egressHeading_deg'>;
  const plan = loftPlanOf(loft);
  const checks: AttackCheck[] = [];

  const turn = Math.abs(signedHeadingDelta(loft.ingressHeading_deg, resolveLoftEgressHeading(loft, loft.ingressHeading_deg)));
  const range = jetRangeAtImpact_nm(plan, turn);
  if (range < LOFT_FRAG_STANDOFF_NM) {
    checks.push({
      level: 'warn',
      text: `Inside the ${LOFT_FRAG_STANDOFF_NM} nm frag standoff when the bomb lands: the jet is about ${range.toFixed(1)} nm from the target at impact on a ${Math.round(turn)}° escape turn (estimate). Turn further away from the attack heading`,
    });
  }

  const pullUp_nm = plan.pullUpRange_ft / FT_PER_NM;
  if (isNum(ipToTarget_nm) && ipToTarget_nm < pullUp_nm) {
    checks.push({
      level: 'warn',
      text: `The IP is ${ipToTarget_nm.toFixed(1)} nm from the target, inside the ${pullUp_nm.toFixed(1)} nm pull-up range: the jet would have to pull up before it reaches the IP — pick an IP further out`,
    });
  }
  return checks;
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

  const isLoft = profile.type === 'loft_ccrp';

  // Running in along the IP→target line tells the defence where the jet will
  // be. Auto-build never does this; a planner typing a heading can. A loft is
  // the exception: it runs straight from the IP by design.
  const heading = attackHeadingOf(profile);
  if (!isLoft && isNum(heading) && isNum(input.directBearing_deg) && isStraightIn(heading, input.directBearing_deg)) {
    checks.push({
      level: 'warn',
      text: `Predictable straight-in attack: ${profile.type === 'popup_ccip' ? 'approach' : 'heading'} ${hdg(heading)} is within ${STRAIGHT_IN_TOLERANCE_DEG}° of the IP→target line (${hdg(input.directBearing_deg)}). Advise against — make the angle off greater`,
    });
  }

  if (profile.type === 'loft_ccrp') checks.push(...loftChecks(profile, input.ipToTarget_nm));

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

  // A weapon row with no floor to compare against: say so, since the limit
  // checks below skip a missing number. A warning, never an error — the pilot
  // may know the weapon better than the table does, and Save is never blocked.
  const noData = noDataNote(weapon, profile.type);
  if (noData) checks.push({ level: 'warn', text: noData, kind: 'no-data' });

  // Does the release respect the weapon's own limits? A loft skips the two
  // floors: they are about where the jet is at impact, and a lofting jet is
  // far away by then (`loftChecks` looks at that instead).
  if (isNum(rp.alt_agl)) {
    if (!isLoft && isNum(weapon.min_release_alt_ft) && rp.alt_agl < weapon.min_release_alt_ft) {
      checks.push({
        level: 'error',
        text: `Release ${ft(rp.alt_agl)} AGL is below ${weapon.name} minimum ${ft(weapon.min_release_alt_ft)}`,
      });
    }
    // Frag min-safe applies to every weapon released in a dive, level or
    // pop-up: it is about where the aircraft is at impact, not how the bomb
    // got there. The calculator clamps the default release to this, so seeing
    // it means someone lowered it by hand. (Not a loft: see above.)
    if (!isLoft && isNum(weapon.frag_min_safe_alt_ft) && rp.alt_agl < weapon.frag_min_safe_alt_ft) {
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
