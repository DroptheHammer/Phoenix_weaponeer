/**
 * One jet's attack while it is being edited, as plain data, plus the pure
 * functions that move it and read it.
 *
 * This is what `AttackEditor` used to hold as a dozen `useState`s. Pulled out
 * so the strike editor can hold one draft per jet, and so geo-check can drive
 * the editor's logic without React: every button in the editor is one of the
 * transitions below, and everything the editor shows comes from `resolveDraft`.
 */

import type { Attack, AttackProfile, Coordinates, DbWeapon, IpAnchorFields, Mission, Waypoint } from '../types';
import type { DeliveryProfile } from '../types/profile.types';
import { autoBuildAttack, inferIp, resolveIp } from './autoBuildAttack';
import { attackIpAnchor, initialIpChoice, ipFieldsFor, ipPointFromFields, seedCustomIp, type IpAnchor, type IpChoiceMode } from './ipAnchor';
import { runAttackChecks, hasErrors, type AttackCheck } from './attackChecks';
import { describeRunIn, type RunInSummary } from './runIn';
import { applyEgress, applyFlank, moveIp } from './attackFlank';
import { weaponClassOf } from './weaponClass';
import type { Side } from './attackGeometry';

export interface AttackDraft {
  // The pilot's picks
  targetWaypointId: string;
  attackerId: string;
  /** '' until picked; `resolveDraft` fills in auto-build's choice. */
  weaponId: string;
  profileId?: string;
  angleOffSide?: Side;
  egressOverride?: 'left' | 'right';

  // Weapon details
  fuzeId: string;
  releaseQuantity: number;
  releaseMode: Attack['releaseMode'];

  // Where the run-in starts
  ipMode: IpChoiceMode;
  ipWaypointId?: string;
  customIp?: Coordinates;

  /** Once the planner changes a number, auto-build stops overwriting the profile. */
  customized: boolean;
  customProfile?: AttackProfile;

  /**
   * A saved, uncustomized attack re-opens with the run-in it was built with —
   * action point, check turn, leg — so auto-build reproduces its heading.
   * Fixed for the life of the draft.
   */
  seed: { actionRange_nm?: number; offsetTurn_deg?: number; offsetLegRatio?: number };
}

export interface DraftContext {
  /** The planner's view of the mission (author-hidden threats already removed). */
  mission: Mission;
  weapons: DbWeapon[];
  profiles: DeliveryProfile[];
  threatSystems: { id: string; max_range_nm: number }[];
}

/** A fresh draft for a new attack, or the draft a saved attack re-opens as. */
export function draftFromAttack(attack: Attack | undefined, mission: Mission | null): AttackDraft {
  const savedRunIn =
    attack && !attack.customized
      ? (attack.profile as { actionRange_nm?: number; offsetAngle_deg?: number; offsetDirection?: Side; offsetLegRatio?: number })
      : undefined;
  const ip = mission
    ? initialIpChoice(
        mission.waypoints,
        mission.waypoints.find((wp) => wp.id === attack?.targetWaypointId),
        (attack?.profile as IpAnchorFields | undefined) ?? {},
      )
    : { mode: 'auto' as const };
  const customized = Boolean(attack && (attack.customized || !attack.sourceProfileId));
  return {
    targetWaypointId: attack?.targetWaypointId ?? '',
    attackerId: attack?.attackerId ?? '',
    weaponId: attack?.weaponId ?? '',
    profileId: attack?.sourceProfileId,
    angleOffSide: savedRunIn?.offsetDirection,
    egressOverride: undefined,
    fuzeId: attack?.fuzeId ?? '',
    releaseQuantity: attack?.releaseQuantity ?? 1,
    releaseMode: attack?.releaseMode ?? 'single',
    ipMode: ip.mode,
    ipWaypointId: ip.ipWaypointId,
    customIp: ip.customIp,
    customized,
    customProfile: attack?.profile,
    seed: {
      actionRange_nm: savedRunIn?.actionRange_nm,
      offsetTurn_deg: savedRunIn?.offsetAngle_deg,
      offsetLegRatio: savedRunIn?.offsetLegRatio,
    },
  };
}

export interface ResolvedDraft {
  build: ReturnType<typeof autoBuildAttack>;
  target: Waypoint | undefined;
  /** The picked weapon, or the one auto-build chose. */
  weaponId: string;
  weapon: DbWeapon | undefined;
  /** The profile chip that is lit. */
  profileId: string | undefined;
  /** What will be saved: auto-built unless customized. */
  profile: AttackProfile | undefined;
  profileType: Attack['profileType'] | undefined;
  checks: AttackCheck[];
  problems: string[];
  canSave: boolean;
  runIn: RunInSummary | undefined;
  /** What "Auto" resolves to for this target. */
  autoIpWaypoint: Waypoint | undefined;
}

// Resolving runs auto-build, so cache it per draft object: the strike editor
// resolves every jet on every render, and only the one being dragged changes.
const resolveCache = new WeakMap<AttackDraft, { ctx: DraftContext; resolved: ResolvedDraft }>();

export function resolveDraft(draft: AttackDraft, ctx: DraftContext): ResolvedDraft {
  const hit = resolveCache.get(draft);
  if (hit && hit.ctx === ctx) return hit.resolved;

  const { mission } = ctx;
  const build = autoBuildAttack({
    mission,
    targetWaypointId: draft.targetWaypointId,
    attackerId: draft.attackerId,
    weapons: ctx.weapons,
    profiles: ctx.profiles,
    threatSystems: ctx.threatSystems,
    overrides: {
      weaponId: draft.weaponId || undefined,
      profileId: draft.profileId,
      actionRange_nm: draft.seed.actionRange_nm,
      offsetLegRatio: draft.seed.offsetLegRatio,
      offsetTurn_deg: draft.seed.offsetTurn_deg,
      angleOffSide: draft.angleOffSide,
      ipWaypointId: draft.ipMode === 'waypoint' ? draft.ipWaypointId : undefined,
      customIp: draft.ipMode === 'custom' ? draft.customIp : undefined,
      egressDirection: draft.egressOverride,
    },
  });

  const target = mission.waypoints.find((wp) => wp.id === draft.targetWaypointId);
  const weaponId = draft.weaponId || build.weapon?.id || '';
  const weapon = ctx.weapons.find((w) => w.id === weaponId);
  // A chip that is no longer on offer (new weapon, new attacker) gives way to
  // auto-build's pick — autoBuildAttack already falls back when the override
  // is not among the candidates.
  const profileId = build.profile?.id;

  const profile = draft.customized ? draft.customProfile : build.attack?.profile;
  const profileType = profile?.type ?? build.attack?.profileType;
  const checks = profile
    ? runAttackChecks({
        profileType: profileType ?? 'popup_ccip',
        profile,
        weapon: weapon ?? null,
        targetElevation_ft: target?.elevation_ft,
        weaponClass: weapon ? weaponClassOf(weapon) : undefined,
        allowedClasses: build.profile?.weaponClasses,
        sourceProfileName: build.profile?.name,
        directBearing_deg: build.directBearing,
      })
    : [];
  const problems = build.problems ?? [];
  // The run-in as it will be flown, read off whatever profile will be saved.
  const runIn =
    profile && build.directBearing != null ? describeRunIn(profile, build.directBearing, target?.elevation_ft ?? 0) : build.runIn;

  const resolved: ResolvedDraft = {
    build,
    target,
    weaponId,
    weapon,
    profileId,
    profile,
    profileType,
    checks,
    problems,
    canSave: Boolean(profile && profileType && problems.length === 0 && !hasErrors(checks)),
    runIn,
    autoIpWaypoint: target ? inferIp(mission, target) : undefined,
  };
  resolveCache.set(draft, { ctx, resolved });
  return resolved;
}

/**
 * The attack exactly as Save writes it. The preview map and the side view
 * draw this, so what is on screen is what gets saved.
 */
export function draftAttackData(
  draft: AttackDraft,
  resolved: ResolvedDraft,
  original: Attack | undefined,
  sequenceNumber: number,
): Omit<Attack, 'id'> | undefined {
  if (!resolved.profile || !resolved.profileType) return undefined;
  const base = resolved.build.attack;
  return {
    targetWaypointId: draft.targetWaypointId,
    attackerId: draft.attackerId,
    profileType: resolved.profileType,
    profile: resolved.profile,
    weaponId: resolved.weaponId,
    fuzeId: draft.fuzeId || undefined,
    releaseQuantity: draft.releaseQuantity,
    releaseMode: draft.releaseMode,
    sequenceNumber: original?.sequenceNumber ?? sequenceNumber,
    notes: original?.notes,
    sourceProfileId: base?.sourceProfileId ?? original?.sourceProfileId,
    sourceProfileName: base?.sourceProfileName ?? original?.sourceProfileName,
    deliveryMode: base?.deliveryMode ?? original?.deliveryMode,
    estimated: base?.estimated ?? original?.estimated,
    sightDepression_mils: base?.sightDepression_mils ?? original?.sightDepression_mils,
    procedure: base?.procedure ?? original?.procedure,
    customized: draft.customized || undefined,
  };
}

/** Where the IP resolves for a saved-shape attack (map, IP marker). */
export function draftIpAnchor(attack: Attack | undefined, mission: Mission): IpAnchor | undefined {
  return attack ? attackIpAnchor(mission.waypoints, attack) : undefined;
}

// ─── Transitions: one per control in the editor ───────────────────────────────

/** Back to the library profile: numbers, and the IP, return to auto-build's. */
export function resetToProfile(draft: AttackDraft): AttackDraft {
  return { ...draft, customized: false, customProfile: undefined, ipMode: 'auto', ipWaypointId: undefined, customIp: undefined };
}

export function setTarget(draft: AttackDraft, targetWaypointId: string): AttackDraft {
  return { ...draft, targetWaypointId };
}

export function setAttacker(draft: AttackDraft, attackerId: string): AttackDraft {
  return resetToProfile({ ...draft, attackerId, weaponId: '', profileId: undefined });
}

export function setWeapon(draft: AttackDraft, weaponId: string): AttackDraft {
  return resetToProfile({ ...draft, weaponId, fuzeId: '', profileId: undefined });
}

export function chooseProfile(draft: AttackDraft, profileId: string): AttackDraft {
  return resetToProfile({ ...draft, profileId });
}

/** A form's change: the planner's first (or next) hand edit. From here on the profile is theirs. */
export function editProfile(draft: AttackDraft, profile: AttackProfile): AttackDraft {
  return { ...draft, customized: true, customProfile: profile };
}

/**
 * Picking a flank is not a reason to throw away hand-typed numbers. When the
 * profile has been customized, apply the change to it; otherwise auto-build
 * picks it up from the override.
 */
export function chooseIngress(draft: AttackDraft, side: Side, resolved: ResolvedDraft): AttackDraft {
  const next = { ...draft, angleOffSide: side };
  if (draft.customized && draft.customProfile) {
    next.customProfile = applyFlank(draft.customProfile, side, resolved.build.directBearing, resolved.target?.elevation_ft ?? 0);
  }
  return next;
}

export function chooseEgress(draft: AttackDraft, side: 'left' | 'right'): AttackDraft {
  const next = { ...draft, egressOverride: side };
  if (draft.customized && draft.customProfile) next.customProfile = applyEgress(draft.customProfile, side);
  return next;
}

/**
 * Point the draft at a new IP. When the profile has been customized the new IP
 * must be written into it, headings and all (`moveIp`), or Save would write
 * the new IP with the old heading and the card would print a heading its own
 * picture disagrees with.
 *
 * Picking "Auto" while customized still writes a concrete waypoint id —
 * today's resolved one — rather than leaving it undefined: customizing means
 * freezing the numbers, the same way a hand-picked flank or egress side
 * survives further route edits instead of continuing to auto-track.
 */
export function setIp(draft: AttackDraft, mode: IpChoiceMode, mission: Mission, waypointId?: string, point?: Coordinates): AttackDraft {
  const next: AttackDraft = {
    ...draft,
    ipMode: mode,
    ipWaypointId: mode === 'waypoint' ? waypointId || undefined : undefined,
    customIp: mode === 'custom' ? point : undefined,
  };
  const target = mission.waypoints.find((wp) => wp.id === draft.targetWaypointId);
  if (!draft.customized || !draft.customProfile || !target) return next;
  const resolvedWaypointId = mode === 'custom' ? undefined : mode === 'waypoint' ? next.ipWaypointId : resolveIp(mission, target, undefined)?.id;
  return { ...next, customProfile: moveIp(draft.customProfile, { ipWaypointId: resolvedWaypointId, customIp: next.customIp }, mission.waypoints, target) };
}

/** "Custom point": seeds the marker where the run-in starts now, else 10 nm north of the target. */
export function chooseIpCustom(draft: AttackDraft, resolved: ResolvedDraft, mission: Mission): AttackDraft {
  const seeded = draft.customIp ?? (resolved.target ? seedCustomIp(resolved.target, resolved.build.ipAnchor) : undefined);
  return setIp(draft, 'custom', mission, undefined, seeded);
}

/** The custom IP as radial / distance off the target, for the sliders. */
export function ipFieldsOf(draft: AttackDraft, resolved: ResolvedDraft) {
  return draft.customIp && resolved.target ? ipFieldsFor(resolved.target.coordinates, draft.customIp) : undefined;
}

export function setIpRadialDistance(
  draft: AttackDraft,
  resolved: ResolvedDraft,
  mission: Mission,
  change: { radial?: number; distance?: number },
): AttackDraft {
  const fields = ipFieldsOf(draft, resolved);
  if (!fields || !resolved.target) return draft;
  const point = ipPointFromFields(
    resolved.target.coordinates,
    change.radial != null ? String(change.radial) : fields.radial,
    change.distance != null ? String(change.distance) : fields.distance,
  );
  return point ? setIp(draft, 'custom', mission, undefined, point) : draft;
}
