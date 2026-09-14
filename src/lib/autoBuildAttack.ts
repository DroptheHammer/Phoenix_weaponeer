import type { Mission } from '../types/mission.types';
import type { Attack, DiveCCIPProfile, LevelCCRPProfile, PopupCCIPProfile } from '../types/attack.types';
import type { DbWeapon } from '../types/weapon.types';
import type { Coordinates, Waypoint } from '../types/waypoint.types';
import type { DeliveryProfile, WeaponClass } from '../types/profile.types';
import { SUPPORTED_GEOMETRIES, diveParams, levelParams, popupParams } from '../types/profile.types';
import { weaponClassOf, WEAPON_CLASS_LABEL } from './weaponClass';
import { calculateBearing, calculateDistance } from './coordinates';
import { runAttackChecks, type AttackCheck } from './attackChecks';
import { resolveIpAnchor, inferIpFrom, initialIpOverrideFrom, type IpAnchor } from './ipAnchor';
import {
  opposite,
  flankSign,
  normalizeHeading,
  attackHeadingFromActionPoint,
  diveGroundRange_nm,
  levelReleaseRange_nm,
  LEVEL_RUN_IN_NM,
  DEFAULT_ACTION_RANGE_NM,
  DEFAULT_OFFSET_TURN_DEG,
  DEFAULT_LEVEL_CHECK_TURN_DEG,
  DEFAULT_OFFSET_LEG_RATIO,
  solveOffsetLeg,
  offsetLegRatioFor,
  maxOffsetLegRatio,
  type Side,
} from './attackGeometry';
import { planPopup, doctrinalCheckTurn, solvePullDownTurn, applyPopupPlan, type PopupPlan } from './popupPlanning';
import { describeRunIn, type RunInSummary } from './runIn';

/**
 * Auto-build: from a target, an attacker and a weapon, produce a complete,
 * alert-free attack using the aircraft's delivery profile library.
 *
 * The pilot's decisions are the big ones — which profile, which flank to
 * come from, which way to egress. Everything else is filled from the profile
 * and then pushed up to whatever the weapon demands (minimum release
 * altitude, frag min-safe), with each adjustment reported. Customize exposes
 * the numbers afterwards; this function never asks for them.
 *
 * The run-in is anchored on the route. The aircraft flies the IP→target leg
 * to the **action point** (4.5 nm by default, the handbook's choice), makes a
 * round **check turn** left or right, runs up the offset leg, and turns onto
 * the target at the roll-in (dive), pull-down (pop-up) or run-in start
 * (level). The flank defaults to the side *away* from the nearest threat, and
 * so does the egress, so the two toggles usually read the same way. The
 * attack heading is whatever that geometry produces; nothing about it is a
 * straight line at the target.
 *
 * Pure: takes the profile library and weapons as arguments so it can be run
 * anywhere (and tested) without touching the stores.
 */

export interface AutoBuildOverrides {
  weaponId?: string;
  profileId?: string;
  /** A hand-typed attack heading. Wins over the action-point geometry. */
  runInHeading_deg?: number;
  /** Range from the target for the check turn; undefined = the profile's, else DEFAULT_ACTION_RANGE_NM */
  actionRange_nm?: number;
  /** The check turn at the action point; undefined = the profile's, else 20° (dive) or 30° (level) or the handbook's (pop-up) */
  offsetTurn_deg?: number;
  /** Level only: the offset leg as a multiple of the run-in range; undefined = the profile's, else 1.5 */
  offsetLegRatio?: number;
  /** Which flank to run in on; undefined = away from the nearest threat */
  angleOffSide?: Side;
  /**
   * The waypoint to run in from. Undefined = the prior numeric waypoint
   * (`inferIp`). Any waypoint may be chosen; see `resolveIp`.
   */
  ipWaypointId?: string;
  /** A point the planner placed as the IP. Wins over `ipWaypointId`. */
  customIp?: Coordinates;
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
  ipAnchor?: IpAnchor;
  attackHeading?: number;
  /** Bearing IP → target: the route leg */
  directBearing?: number;
  /** How the run-in was built: action point, check turn, join turn */
  runIn?: RunInSummary;
  /** Pop-up only: the handbook chain behind the numbers */
  popupPlan?: PopupPlan;
  /** Things auto-build changed from the profile to keep the attack legal */
  adjustments: string[];
  /** Things auto-build could not decide for the pilot */
  problems: string[];
  /** Sanity checks on the result — expected empty */
  checks: AttackCheck[];
}

/** The lowest release altitude the weapon allows: its own minimum, and frag min-safe. */
export function weaponFloor_ft(weapon: DbWeapon | undefined): number {
  if (!weapon) return 0;
  return Math.max(weapon.min_release_alt_ft ?? 0, weapon.frag_min_safe_alt_ft ?? 0);
}

/** Weapons the attacker is actually carrying, in loadout order, when a loadout exists. */
export function loadoutWeapons(attacker: Mission['flightMembers'][number] | undefined, weapons: DbWeapon[]): DbWeapon[] {
  if (!attacker?.loadout?.length) return [];
  return attacker.loadout
    .map((item) => weapons.find((w) => w.name === item.weaponType))
    .filter((w): w is DbWeapon => !!w);
}

/**
 * The waypoint the aircraft is flying from when it attacks this target: the
 * one immediately before it in the route. That is the IP when the route puts
 * one there, and the *previous target* when attacks are chained — a second
 * bomb on STPT 9 flows in from STPT 8, not from the IP two legs back. (It
 * used to prefer the nearest IP-typed waypoint, which planned every attack
 * off the same steerpoint.)
 */
export function inferIp(mission: Mission, target: Waypoint): Waypoint | undefined {
  return inferIpFrom(mission.waypoints, target);
}

/**
 * The waypoint this attack actually runs in from: the planner's pick when they
 * have made one, otherwise `inferIp`'s prior numeric waypoint.
 *
 * The pick is honoured for *any* waypoint, not only one earlier in the route —
 * the planner can see the map and the tool should not overrule them. An id that
 * no longer resolves (the waypoint was deleted, or it is the target itself)
 * falls back to the inferred one rather than leaving the attack with no run-in.
 */
export function resolveIp(
  mission: Mission,
  target: Waypoint,
  ipWaypointId?: string,
): Waypoint | undefined {
  return resolveIpAnchor(mission.waypoints, target, { ipWaypointId })?.waypoint;
}

/**
 * The IP override an editor should open with, given what a saved attack stored.
 *
 * The inverse of `resolveIp`. `autoBuildAttack` writes the resolved IP onto
 * *every* profile it builds, so a stored id is not evidence that the planner
 * chose anything — on reopening, an attack that simply took the default would
 * otherwise look hard-pinned and stop tracking the route. A stored id that
 * matches the inferred waypoint is therefore reported as no override at all, so
 * the control opens on "Auto" and still names the waypoint in use.
 */
export function initialIpOverride(
  mission: Mission,
  target: Waypoint | undefined,
  storedIpWaypointId: string | undefined,
): string | undefined {
  return initialIpOverrideFrom(mission.waypoints, target, storedIpWaypointId);
}

/**
 * Which side of a heading through the target the nearest live threat sits
 * on, or undefined when nothing that can reach the target area is placed.
 */
export function nearestThreatSide(
  mission: Mission,
  target: Waypoint,
  heading: number,
  threatSystems: Array<{ id: string; max_range_nm: number }>,
): Side | undefined {
  let nearest: { distance: number; side: Side } | undefined;
  for (const threat of mission.threats) {
    if (threat.status === 'destroyed') continue;
    const distance = calculateDistance(target.coordinates, threat.position);
    const system = threatSystems.find((s) => s.id === threat.systemId);
    // Only threats that could reach the target area matter.
    if (distance > Math.max(system?.max_range_nm ?? 0, 5) + 5) continue;
    const bearing = calculateBearing(target.coordinates, threat.position);
    const relative = (bearing - heading + 360) % 360;
    const side: Side = relative > 0 && relative < 180 ? 'right' : 'left';
    if (!nearest || distance < nearest.distance) nearest = { distance, side };
  }
  return nearest?.side;
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
  const threatSide = nearestThreatSide(mission, target, attackHeading, threatSystems);
  if (!threatSide) return 'right';
  return threatSide === 'right' ? 'left' : 'right';
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

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

  const dive = diveParams(profile);
  const level = levelParams(profile);
  const popup = popupParams(profile);
  if (!dive && !level && !popup) {
    problems.push(`${profile.name} uses a ${profile.geometry} geometry the tool cannot draw yet`);
    return { attack: null, profile, weapon, weaponClass, candidates, adjustments, problems, checks: [] };
  }

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
  const raiseToFloor = (value: number, what: string, unit = 'ft'): number => {
    if (value >= floor) return value;
    adjustments.push(`${what} raised ${value.toLocaleString()} → ${floor.toLocaleString()} ${unit}: ${weapon.name} minimum / frag min-safe`);
    return floor;
  };

  // The numbers, per profile type, floored to the weapon.
  let diveNumbers: { rollIn: number; release: number; speed: number; ingress: number; g: number } | undefined;
  let levelNumbers: { releaseAgl: number; releaseMsl: number; speed: number } | undefined;
  let popupNumbers: { release: number; speed: number; plan: PopupPlan } | undefined;
  let joinRange_nm = 0;

  if (dive) {
    const release = raiseToFloor(dive.releaseAltitude_ft, 'Release');
    let rollIn = dive.rollInAltitude_ft;
    if (rollIn <= release) {
      const raised = release + 2000;
      adjustments.push(`Roll-in raised ${rollIn.toLocaleString()} → ${raised.toLocaleString()} ft to stay above the release`);
      rollIn = raised;
    }
    diveNumbers = {
      rollIn,
      release,
      speed: speedClamp(dive.releaseSpeed_ktas),
      ingress: Math.max(dive.ingressAltitude_ft ?? rollIn, rollIn),
      g: dive.pulloutG ?? 4,
    };
    joinRange_nm = diveGroundRange_nm(rollIn, dive.diveAngle_deg);
  } else if (level) {
    const releaseAgl = raiseToFloor(level.releaseAltitude_ft, 'Release', 'ft AGL');
    const speed = speedClamp(level.releaseSpeed_ktas);
    // Profiles are AGL; the level profile stores MSL for the jet's altimeter.
    levelNumbers = { releaseAgl, releaseMsl: Math.round(releaseAgl + (target.elevation_ft ?? 0)), speed };
    joinRange_nm = levelReleaseRange_nm(releaseAgl, speed) + LEVEL_RUN_IN_NM;
  } else if (popup) {
    const release = raiseToFloor(popup.releaseAltitude_ft, 'Release');
    const speed = speedClamp(popup.runInSpeed_ktas);
    const plan = planPopup({
      diveAngle_deg: popup.diveAngle_deg,
      releaseAltitude_ft: release,
      speed_ktas: speed,
      trackingTime_s: popup.trackingTime_s,
      pullG: popup.pullG,
    });
    popupNumbers = { release, speed, plan };
  }

  // The run-in: route to the action point, check turn, offset leg, join.
  const ipAnchor = resolveIpAnchor(mission.waypoints, target, { ipWaypointId: overrides.ipWaypointId, customIp: overrides.customIp });
  const ipWaypoint = ipAnchor?.waypoint;
  const directBearing = ipAnchor ? calculateBearing(ipAnchor.point, target.coordinates) : undefined;
  const threatSide = directBearing != null ? nearestThreatSide(mission, target, directBearing, threatSystems) : undefined;
  const side: Side = overrides.angleOffSide ?? (threatSide ? opposite(threatSide) : 'right');
  const s = flankSign(side);
  const typedHeading =
    overrides.runInHeading_deg != null && Number.isFinite(overrides.runInHeading_deg) ? overrides.runInHeading_deg : undefined;

  let actionRange = overrides.actionRange_nm ?? dive?.actionRange_nm ?? level?.actionRange_nm ?? popup?.actionRange_nm ?? DEFAULT_ACTION_RANGE_NM;
  let checkTurn: number;
  let pullDown: number | undefined;

  // Chained attacks: the previous steerpoint may be closer than the action
  // range. The check turn cannot come before the leg starts, so pull it in.
  const legLength_nm = ipAnchor ? calculateDistance(ipAnchor.point, target.coordinates) : undefined;
  if (legLength_nm != null && actionRange > legLength_nm - 0.5) {
    const pulledIn = Math.max(1, Math.floor((legLength_nm - 0.5) * 2) / 2);
    adjustments.push(`Action point pulled in ${actionRange} → ${pulledIn} nm: ${ipAnchor!.shortLabel} is only ${legLength_nm.toFixed(1)} nm from the target`);
    actionRange = pulledIn;
  }

  let offsetLegRatio: number | undefined;

  if (popupNumbers) {
    checkTurn = overrides.offsetTurn_deg ?? popup?.offsetAngle_deg ?? doctrinalCheckTurn(popupNumbers.plan, actionRange);
    pullDown = solvePullDownTurn(popupNumbers.plan, actionRange, checkTurn);
    if (pullDown == null) {
      adjustments.push(`Check turn ${checkTurn}° at ${actionRange} nm is too wide for this pop-up — the pull-down cannot reach the target; reduce it or move the action point out`);
    }
  } else if (level) {
    // Level: the planner specifies the offset leg as a multiple of the run-in
    // range and the action point falls out of it, so a long time-of-fall moves
    // the check turn out instead of eating the leg.
    checkTurn = overrides.offsetTurn_deg ?? level.offsetAngle_deg ?? DEFAULT_LEVEL_CHECK_TURN_DEG;
    const asked = overrides.offsetLegRatio ?? level.offsetLegRatio ?? DEFAULT_OFFSET_LEG_RATIO;

    // The leg goes tangent to the run-in ring at cot(check turn), where the
    // angle-off is exactly 90°. Past that it flies inside the ring and turns
    // back outward. cot θ < 1/sin θ, so this also covers "never closes".
    const tangentRatio = maxOffsetLegRatio(checkTurn);
    let ratio = asked;
    if (tangentRatio != null && asked > tangentRatio) {
      adjustments.push(
        `Offset leg shortened ${round2(asked)} → ${round2(tangentRatio)} × the run-in: at a ${checkTurn}° check turn a longer leg swings the angle-off past 90°, which flies the leg inside the run-in ring`,
      );
      ratio = tangentRatio;
    }

    let solution = solveOffsetLeg(joinRange_nm, checkTurn, ratio);

    // The action point has to fit on the route leg with room to roll out.
    if (solution && legLength_nm != null && solution.actionRange_nm > legLength_nm - 0.5) {
      const fitted = round1(Math.floor((legLength_nm - 0.5) * 2) / 2);
      const achieved = offsetLegRatioFor(joinRange_nm, checkTurn, fitted);
      const shortened = achieved != null ? solveOffsetLeg(joinRange_nm, checkTurn, achieved) : undefined;
      if (shortened) {
        adjustments.push(
          `Offset leg shortened to ${round2(achieved!)} × the run-in — ${ipAnchor!.shortLabel} is only ${legLength_nm.toFixed(1)} nm from the target, so the action point sits at ${fitted} nm and the azimuth split drops ${Math.round(solution.split_deg)}° → ${Math.round(shortened.split_deg)}°`,
        );
        ratio = achieved!;
        solution = shortened;
      } else {
        problems.push(
          `${profile.name} needs its run-in start ${joinRange_nm.toFixed(1)} nm out, but ${ipAnchor!.shortLabel} is only ${legLength_nm.toFixed(1)} nm from the target — add a waypoint before it or pick a tighter profile`,
        );
      }
    }

    if (solution) {
      offsetLegRatio = ratio;
      actionRange = round1(solution.actionRange_nm);
    }
  } else {
    // Dive CCIP: original logic, 20° check turn.
    checkTurn = overrides.offsetTurn_deg ?? dive?.offsetAngle_deg ?? DEFAULT_OFFSET_TURN_DEG;
    // The join point must be inside the action range, with room to settle.
    if (actionRange < joinRange_nm + 1) {
      const moved = round1(Math.ceil((joinRange_nm + 1.5) * 2) / 2);
      if (legLength_nm != null && moved > legLength_nm - 0.5) {
        problems.push(
          `${profile.name} needs its roll-in ${joinRange_nm.toFixed(1)} nm out, but ${ipAnchor!.shortLabel} is only ${legLength_nm.toFixed(1)} nm from the target — add a waypoint before it or pick a tighter profile`,
        );
      }
      actionRange = moved;
    }
    // A check turn too wide never brings the leg within the join range.
    const maxTurn = (Math.asin(Math.min(joinRange_nm / actionRange, 1)) * 180) / Math.PI;
    if (checkTurn >= maxTurn) {
      const reduced = Math.max(5, Math.floor((maxTurn - 5) / 5) * 5);
      adjustments.push(`Check turn reduced ${checkTurn}° → ${reduced}°: a wider turn at ${actionRange} nm never comes within ${joinRange_nm.toFixed(1)} nm of the target`);
      checkTurn = reduced;
    }
  }

  const noIp = () => {
    adjustments.push('No IP in the route — attack heading defaulted to north; set one');
    return 360;
  };
  let attackHeading: number;
  if (typedHeading != null) {
    attackHeading = typedHeading;
  } else if (directBearing == null) {
    attackHeading = noIp();
  } else if (popupNumbers) {
    attackHeading = normalizeHeading(directBearing - s * checkTurn + s * (pullDown ?? 90));
  } else {
    // Level uses the leg length; dive uses action range.
    const legLengthForHeading = level && offsetLegRatio != null ? offsetLegRatio * joinRange_nm : undefined;
    attackHeading =
      attackHeadingFromActionPoint(
        { directBearing_deg: directBearing, actionRange_nm: actionRange, offsetTurn_deg: checkTurn, side, legLength_nm: legLengthForHeading },
        joinRange_nm,
      ) ?? noIp();
  }
  const egressDirection = overrides.egressDirection ?? egressAwayFromThreats(mission, target, attackHeading, threatSystems);

  let attackProfile: Attack['profile'];
  let profileType: Attack['profileType'];

  if (dive && diveNumbers) {
    const p: DiveCCIPProfile = {
      type: 'dive_ccip',
      ...(ipAnchor?.source === 'custom' ? { customIp: ipAnchor.point, ipWaypointId: undefined } : { ipWaypointId: ipAnchor?.waypoint?.id }),
      ingressHeading_deg: attackHeading,
      ingressAltitude_ft: diveNumbers.ingress,
      rollInAltitude_ft: diveNumbers.rollIn,
      diveAngle_deg: dive.diveAngle_deg,
      releaseAltitude_ft: diveNumbers.release,
      releaseSpeed_ktas: diveNumbers.speed,
      pulloutG: diveNumbers.g,
      egressDirection,
      actionRange_nm: actionRange,
      offsetAngle_deg: checkTurn,
      offsetDirection: side,
    };
    attackProfile = p;
    profileType = 'dive_ccip';
  } else if (level && levelNumbers) {
    const p: LevelCCRPProfile = {
      type: 'level_ccrp',
      ...(ipAnchor?.source === 'custom' ? { customIp: ipAnchor.point, ipWaypointId: undefined } : { ipWaypointId: ipAnchor?.waypoint?.id }),
      ingressHeading_deg: attackHeading,
      releaseAltitude_ft: levelNumbers.releaseMsl,
      releaseSpeed_ktas: levelNumbers.speed,
      egressDirection,
      actionRange_nm: actionRange,
      offsetAngle_deg: checkTurn,
      offsetDirection: side,
      offsetLegRatio,
    };
    attackProfile = p;
    profileType = 'level_ccrp';
  } else if (popup && popupNumbers) {
    if (!ipAnchor) problems.push('A pop-up needs an IP — pick a waypoint or place a custom point');
    const built = applyPopupPlan(
      {
        type: 'popup_ccip',
        ...(ipAnchor?.source === 'custom' ? { customIp: ipAnchor.point, ipWaypointId: undefined } : { ipWaypointId: ipAnchor?.waypoint?.id }),
        runInHeading_deg: attackHeading,
        runInAltitude_ft: popup.runInAltitude_ft,
        runInSpeed_ktas: popupNumbers.speed,
        diveAngle_deg: popup.diveAngle_deg,
        releaseAltitude_ft: popupNumbers.release,
        releaseSpeed_ktas: popupNumbers.speed,
        trackingTime_s: popupNumbers.plan.trackingTime_s,
        pullG: popupNumbers.plan.pullG,
        minAltitude_ft: popup.minAltitude_ft,
        actionRange_nm: actionRange,
        offsetAngle_deg: checkTurn,
        offsetDirection: side,
        climbAngle_deg: popupNumbers.plan.climbAngle_deg,
        apexAltitude_ft: popupNumbers.plan.apexAltitude_ft,
        rollInAltitude_ft: popupNumbers.plan.pullDownAltitude_ft,
        popDistance_nm: 0,
        egressDirection,
      },
      // A typed heading wins: derive the approach from it rather than the route.
      typedHeading != null ? undefined : directBearing,
    );
    const p: PopupCCIPProfile =
      typedHeading != null
        ? { ...built, runInHeading_deg: typedHeading, approachHeading_deg: normalizeHeading(typedHeading - s * (pullDown ?? 90)) }
        : built;
    attackProfile = p;
    profileType = 'popup_ccip';
  } else {
    return { attack: null, profile, weapon, weaponClass, candidates, ipWaypoint, ipAnchor, attackHeading, directBearing, adjustments, problems, checks: [] };
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
    directBearing_deg: directBearing,
  });

  return {
    attack: problems.length ? null : attack,
    profile,
    weapon,
    weaponClass,
    candidates,
    ipWaypoint,
    ipAnchor,
    attackHeading,
    directBearing,
    runIn: directBearing != null ? describeRunIn(attackProfile, directBearing, target.elevation_ft ?? 0) : undefined,
    popupPlan: popupNumbers?.plan,
    adjustments,
    problems,
    checks,
  };
}
