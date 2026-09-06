import type { Mission } from '../types/mission.types';
import type { Attack, DiveCCIPProfile, LevelCCRPProfile, PopupCCIPProfile } from '../types/attack.types';
import type { DbWeapon } from '../types/weapon.types';
import type { Waypoint } from '../types/waypoint.types';
import type { DeliveryProfile, WeaponClass } from '../types/profile.types';
import { SUPPORTED_GEOMETRIES, diveParams, levelParams, popupParams } from '../types/profile.types';
import { weaponClassOf, WEAPON_CLASS_LABEL } from './weaponClass';
import { calculateBearing, calculateDistance } from './coordinates';
import { runAttackChecks, type AttackCheck } from './attackChecks';

/**
 * Auto-build: from a target, an attacker and a weapon, produce a complete,
 * alert-free attack using the aircraft's delivery profile library.
 *
 * The pilot's decisions are the big ones — which profile, which heading,
 * which way to egress. Everything else is filled from the profile and then
 * pushed up to whatever the weapon demands (minimum release altitude, frag
 * min-safe), with each adjustment reported. Customize exposes the numbers
 * afterwards; this function never asks for them.
 *
 * Pure: takes the profile library and weapons as arguments so it can be run
 * anywhere (and tested) without touching the stores.
 */

export interface AutoBuildOverrides {
  weaponId?: string;
  profileId?: string;
  /** Attack heading; undefined = from the IP */
  runInHeading_deg?: number;
  egressDirection?: 'left' | 'right';
}

export interface AutoBuildInput {
  mission: Mission;
  targetWaypointId: string;
  attackerId: string;
  weapons: DbWeapon[];
  profiles: DeliveryProfile[];
  threatSystems: Array<{ id: string; max_range_nm: number }>;
  overrides?: AutoBuildOverrides;
}

export interface AutoBuildResult {
  /** The attack to save, or null when something essential is missing (see `problems`) */
  attack: Omit<Attack, 'id'> | null;
  profile?: DeliveryProfile;
  weapon?: DbWeapon;
  weaponClass?: WeaponClass;
  /** Every profile this aircraft has for this weapon class — the chips */
  candidates: DeliveryProfile[];
  ipWaypoint?: Waypoint;
  attackHeading?: number;
  /** Things auto-build changed from the profile to keep the attack legal */
  adjustments: string[];
  /** Things auto-build could not decide for the pilot */
  problems: string[];
  /** Sanity checks on the result — expected empty */
  checks: AttackCheck[];
}

const FT_PER_NM = 6076.12;

/** The lowest release altitude the weapon allows: its own minimum, and frag min-safe. */
export function weaponFloor_ft(weapon: DbWeapon | undefined): number {
  if (!weapon) return 0;
  return Math.max(weapon.min_release_alt_ft ?? 0, weapon.frag_min_safe_alt_ft ?? 0);
}

/**
 * Mirrors `calculate_release_altitude` in src-tauri/src/calculators/mod.rs —
 * a dive-angle bracket with a speed adjustment, floored at the weapon. Kept
 * in TS so auto-build stays synchronous and pure; the Rust command remains
 * for the popup Customize form. If one changes, change the other.
 */
export function popupReleaseAltitude_ft(diveAngle_deg: number, speed_ktas: number, weapon: DbWeapon | undefined): number {
  const angle = Math.trunc(diveAngle_deg);
  const base = angle <= 15 ? 1500 : angle <= 30 ? 3500 : angle <= 45 ? 4500 : 6000;
  const adjusted = base / (speed_ktas / 450);
  return Math.max(adjusted, weaponFloor_ft(weapon));
}

/** Weapons the attacker is actually carrying, in loadout order, when a loadout exists. */
export function loadoutWeapons(attacker: Mission['flightMembers'][number] | undefined, weapons: DbWeapon[]): DbWeapon[] {
  if (!attacker?.loadout?.length) return [];
  return attacker.loadout
    .map((item) => weapons.find((w) => w.name === item.weaponType))
    .filter((w): w is DbWeapon => !!w);
}

/**
 * The IP for this target: the closest `ip` waypoint that precedes it in the
 * route, else whatever waypoint comes just before it.
 */
export function inferIp(mission: Mission, target: Waypoint): Waypoint | undefined {
  const before = mission.waypoints
    .filter((wp) => wp.id !== target.id && wp.steerpoint < target.steerpoint)
    .sort((a, b) => b.steerpoint - a.steerpoint);
  return before.find((wp) => wp.type === 'ip') ?? before[0];
}

/**
 * Egress away from the nearest threat to the attack axis. A threat to the
 * right of the run-in means break left, and vice versa.
 */
export function egressAwayFromThreats(
  mission: Mission,
  target: Waypoint,
  attackHeading: number,
  threatSystems: Array<{ id: string; max_range_nm: number }>,
): 'left' | 'right' {
  let nearest: { distance: number; side: 'left' | 'right' } | undefined;
  for (const threat of mission.threats) {
    if (threat.status === 'destroyed') continue;
    const distance = calculateDistance(target.coordinates, threat.position);
    const system = threatSystems.find((s) => s.id === threat.systemId);
    // Only threats that could reach the target area matter.
    if (distance > Math.max(system?.max_range_nm ?? 0, 5) + 5) continue;
    const bearing = calculateBearing(target.coordinates, threat.position);
    const relative = (bearing - attackHeading + 360) % 360;
    const side: 'left' | 'right' = relative > 0 && relative < 180 ? 'right' : 'left';
    if (!nearest || distance < nearest.distance) nearest = { distance, side };
  }
  if (!nearest) return 'right';
  return nearest.side === 'right' ? 'left' : 'right';
}

export function autoBuildAttack(input: AutoBuildInput): AutoBuildResult {
  const { mission, weapons, profiles, threatSystems } = input;
  const overrides = input.overrides ?? {};
  const adjustments: string[] = [];
  const problems: string[] = [];

  const target = mission.waypoints.find((wp) => wp.id === input.targetWaypointId);
  const attacker = mission.flightMembers.find((fm) => fm.id === input.attackerId);
  if (!target) problems.push('Pick a target');
  if (!attacker) problems.push('Pick an attacker');

  // Weapon: the override, else the first store the attacker is carrying.
  const carried = loadoutWeapons(attacker, weapons);
  const weapon = overrides.weaponId ? weapons.find((w) => w.id === overrides.weaponId) : carried[0];
  if (attacker && !weapon) {
    problems.push(
      carried.length
        ? 'Pick a weapon'
        : `${attacker.callsign} has no loadout — pick a weapon, or set the loadout in Flight`,
    );
  }
  const weaponClass = weapon ? weaponClassOf(weapon) : undefined;
  if (weapon && !weaponClass) problems.push(`${weapon.name} is not an air-to-ground store`);

  // Profile: the override, else the aircraft's default for this weapon class.
  const candidates =
    attacker && weaponClass
      ? profiles.filter(
          (p) =>
            p.aircraftId === attacker.aircraftId &&
            SUPPORTED_GEOMETRIES.includes(p.geometry) &&
            p.weaponClasses.includes(weaponClass),
        )
      : [];
  const profile =
    (overrides.profileId ? candidates.find((p) => p.id === overrides.profileId) : undefined) ??
    (weaponClass ? candidates.find((p) => p.defaultFor?.includes(weaponClass)) : undefined) ??
    candidates[0];
  if (attacker && weaponClass && !profile) {
    problems.push(
      `No ${attacker.aircraftId.toUpperCase()} profile for ${WEAPON_CLASS_LABEL[weaponClass].toLowerCase()} yet — add one to the library`,
    );
  }

  if (!target || !attacker || !weapon || !weaponClass || !profile) {
    return { attack: null, profile, weapon, weaponClass, candidates, adjustments, problems, checks: [] };
  }

  // Heading: the override, else IP → target.
  const ipWaypoint = inferIp(mission, target);
  let attackHeading = overrides.runInHeading_deg;
  if (attackHeading == null || !Number.isFinite(attackHeading)) {
    if (ipWaypoint) {
      attackHeading = calculateBearing(ipWaypoint.coordinates, target.coordinates);
    } else {
      attackHeading = 360;
      adjustments.push('No IP in the route — attack heading defaulted to north; set one');
    }
  }
  const egressDirection = overrides.egressDirection ?? egressAwayFromThreats(mission, target, attackHeading, threatSystems);

  // Floors from the weapon. Profiles are written for a class; the specific
  // store may demand more altitude than the profile assumes.
  const floor = weaponFloor_ft(weapon);
  const speedClamp = (speed: number): number => {
    const min = weapon.min_release_speed_ktas ?? -Infinity;
    const max = weapon.max_release_speed_ktas ?? Infinity;
    const clamped = Math.min(Math.max(speed, min), max);
    if (clamped !== speed) {
      adjustments.push(`Release speed ${speed} → ${clamped} kt: ${weapon.name} limit`);
    }
    return clamped;
  };

  let attackProfile: Attack['profile'];
  let profileType: Attack['profileType'];

  const dive = diveParams(profile);
  const level = levelParams(profile);
  const popup = popupParams(profile);

  if (dive) {
    let release = dive.releaseAltitude_ft;
    if (release < floor) {
      adjustments.push(`Release raised ${release.toLocaleString()} → ${floor.toLocaleString()} ft: ${weapon.name} minimum / frag min-safe`);
      release = floor;
    }
    let rollIn = dive.rollInAltitude_ft;
    if (rollIn <= release) {
      const raised = release + 2000;
      adjustments.push(`Roll-in raised ${rollIn.toLocaleString()} → ${raised.toLocaleString()} ft to stay above the release`);
      rollIn = raised;
    }
    const p: DiveCCIPProfile = {
      type: 'dive_ccip',
      ipWaypointId: ipWaypoint?.id,
      ingressHeading_deg: attackHeading,
      ingressAltitude_ft: Math.max(dive.ingressAltitude_ft ?? rollIn, rollIn),
      rollInAltitude_ft: rollIn,
      diveAngle_deg: dive.diveAngle_deg,
      releaseAltitude_ft: release,
      releaseSpeed_ktas: speedClamp(dive.releaseSpeed_ktas),
      pulloutG: dive.pulloutG ?? 4,
      egressDirection,
    };
    attackProfile = p;
    profileType = 'dive_ccip';
  } else if (level) {
    let releaseAgl = level.releaseAltitude_ft;
    if (releaseAgl < floor) {
      adjustments.push(`Release raised ${releaseAgl.toLocaleString()} → ${floor.toLocaleString()} ft AGL: ${weapon.name} minimum / frag min-safe`);
      releaseAgl = floor;
    }
    const p: LevelCCRPProfile = {
      type: 'level_ccrp',
      ipWaypointId: ipWaypoint?.id,
      ingressHeading_deg: attackHeading,
      // Profiles are AGL; the level profile stores MSL for the jet's altimeter.
      releaseAltitude_ft: Math.round(releaseAgl + (target.elevation_ft ?? 0)),
      releaseSpeed_ktas: speedClamp(level.releaseSpeed_ktas),
    };
    attackProfile = p;
    profileType = 'level_ccrp';
  } else if (popup) {
    if (!ipWaypoint) problems.push('A pop-up needs an IP in the route');
    const release = popupReleaseAltitude_ft(popup.diveAngle_deg, popup.runInSpeed_ktas, weapon);
    const climbAngle = (Math.atan((popup.apexAltitude_ft - popup.runInAltitude_ft) / (popup.popDistance_nm * FT_PER_NM)) * 180) / Math.PI;
    const p: PopupCCIPProfile = {
      type: 'popup_ccip',
      ipWaypointId: ipWaypoint?.id ?? '',
      runInHeading_deg: overrides.runInHeading_deg,
      runInAltitude_ft: popup.runInAltitude_ft,
      runInSpeed_ktas: popup.runInSpeed_ktas,
      popDistance_nm: popup.popDistance_nm,
      climbAngle_deg: climbAngle,
      apexAltitude_ft: popup.apexAltitude_ft,
      offsetDirection: popup.offsetDirection ?? egressDirection,
      offsetAngle_deg: popup.offsetAngle_deg ?? 20,
      rollInAltitude_ft: popup.apexAltitude_ft * 0.85,
      diveAngle_deg: popup.diveAngle_deg,
      releaseAltitude_ft: release,
      releaseSpeed_ktas: speedClamp(popup.runInSpeed_ktas + 30),
      minAltitude_ft: popup.minAltitude_ft,
      egressDirection,
    };
    attackProfile = p;
    profileType = 'popup_ccip';
  } else {
    problems.push(`${profile.name} uses a ${profile.geometry} geometry the tool cannot draw yet`);
    return { attack: null, profile, weapon, weaponClass, candidates, ipWaypoint, attackHeading, adjustments, problems, checks: [] };
  }

  const attack: Omit<Attack, 'id'> = {
    targetWaypointId: target.id,
    attackerId: attacker.id,
    profileType,
    profile: attackProfile,
    weaponId: weapon.id,
    releaseQuantity: 1,
    releaseMode: 'single',
    sequenceNumber: mission.attacks.length + 1,
    sourceProfileId: profile.id,
    sourceProfileName: profile.name,
    deliveryMode: profile.deliveryMode,
    estimated: !profile.verified,
    sightDepression_mils: profile.sight?.depression_mils,
    procedure: profile.procedure?.length ? [...profile.procedure] : undefined,
  };

  const checks = runAttackChecks({
    profileType,
    profile: attackProfile,
    weapon,
    targetElevation_ft: target.elevation_ft,
    weaponClass,
    allowedClasses: profile.weaponClasses,
  });

  return {
    attack: problems.length ? null : attack,
    profile,
    weapon,
    weaponClass,
    candidates,
    ipWaypoint,
    attackHeading,
    adjustments,
    problems,
    checks,
  };
}
