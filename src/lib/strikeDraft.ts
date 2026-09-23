/**
 * A strike while it is being edited: one `AttackDraft` per jet plus what the
 * jets share. Every Group-tab control in the editor is one of the functions
 * below, so geo-check can build and adjust a whole strike without React.
 */

import type { Attack, IpAnchorFields, Mission, Strike } from '../types';
import {
  chooseIngress,
  chooseProfile,
  draftFromAttack,
  editProfile,
  resolveDraft,
  setIp,
  setTarget,
  type AttackDraft,
  type DraftContext,
} from './attackDraft';
import { applyGroupEdit, defaultTotOffset, DEFAULT_SPACING_S, strikeFlank, strikeMembers } from './strike';
import { flightGroupOf } from './callsign';
import type { Side } from './attackGeometry';
import type { AttackProfile } from '../types';

export interface Jet {
  draft: AttackDraft;
  /** The saved attack this jet edits; undefined for a jet added in this session. */
  attackId?: string;
  totOffset_s: number;
}

/** The draft IP fields that match a strike's shared IP. */
function ipModeOf(ip: IpAnchorFields): Pick<AttackDraft, 'ipMode' | 'ipWaypointId' | 'customIp'> {
  if (ip.customIp) return { ipMode: 'custom', ipWaypointId: undefined, customIp: ip.customIp };
  if (ip.ipWaypointId) return { ipMode: 'waypoint', ipWaypointId: ip.ipWaypointId, customIp: undefined };
  return { ipMode: 'auto', ipWaypointId: undefined, customIp: undefined };
}

/** What a draft's IP choice means as a strike's shared IP. */
export function strikeIpOf(draft: AttackDraft): IpAnchorFields {
  if (draft.ipMode === 'custom' && draft.customIp) return { customIp: draft.customIp };
  if (draft.ipMode === 'waypoint' && draft.ipWaypointId) return { ipWaypointId: draft.ipWaypointId };
  return {};
}

/**
 * Keep a jet on the strike's IP. A reset (new weapon, new profile, "reset to
 * profile") puts a draft back on Auto, so every jet change goes through here.
 */
export function syncJetIp(draft: AttackDraft, ip: IpAnchorFields, mission: Mission): AttackDraft {
  const want = ipModeOf(ip);
  const same =
    draft.ipMode === want.ipMode &&
    draft.ipWaypointId === want.ipWaypointId &&
    (draft.customIp === want.customIp ||
      (!!draft.customIp && !!want.customIp && draft.customIp.lat === want.customIp.lat && draft.customIp.lon === want.customIp.lon));
  return same ? draft : setIp(draft, want.ipMode, mission, want.ipWaypointId, want.customIp);
}

export function setStrikeIp(jets: Jet[], ip: IpAnchorFields, mission: Mission): Jet[] {
  return jets.map((j) => ({ ...j, draft: syncJetIp(j.draft, ip, mission) }));
}

/** Lead first: by flight position. */
export function sortJets(jets: Jet[], mission: Mission): Jet[] {
  const position = (j: Jet) => mission.flightMembers.find((m) => m.id === j.draft.attackerId)?.position ?? 9;
  return [...jets].sort((a, b) => position(a) - position(b));
}

export function newStrike(mission: Mission, leadAttackerId: string | undefined, id: string): Strike {
  const lead = mission.flightMembers.find((m) => m.id === leadAttackerId) ?? mission.flightMembers[0];
  return { id, name: lead ? `${flightGroupOf(lead.callsign)} strike` : 'Strike', ip: {}, spacing_s: DEFAULT_SPACING_S };
}

/** A new jet for this flight member, on the strike's target and IP. */
export function newJet(mission: Mission, attackerId: string, targetWaypointId: string, ip: IpAnchorFields): Jet {
  const draft = { ...draftFromAttack(undefined, mission), attackerId, targetWaypointId };
  return { draft: syncJetIp(draft, ip, mission), totOffset_s: 0 };
}

/** A saved strike, re-opened. */
export function jetsOfStrike(mission: Mission, strike: Strike): Jet[] {
  return strikeMembers(mission, strike.id).map((a: Attack) => ({
    draft: draftFromAttack(a, mission),
    attackId: a.id,
    totOffset_s: a.totOffset_s ?? 0,
  }));
}

/**
 * Put every jet on its side of the split: the lead on `leadSide` — or, when
 * not given, the side auto-build picks for it (away from the nearest threat) —
 * then mirrored pairs.
 */
export function assignFlanks(jets: Jet[], ctx: DraftContext, leadSide?: Side): Jet[] {
  if (!jets.length) return jets;
  const side =
    leadSide ?? resolveDraft({ ...jets[0].draft, angleOffSide: undefined }, ctx).runIn?.offsetTurn.direction ?? 'right';
  return jets.map((j, i) => ({ ...j, draft: chooseIngress(j.draft, strikeFlank(i, side), resolveDraft(j.draft, ctx)) }));
}

/** The lead's side as it will be flown. */
export function leadSideOf(jets: Jet[], ctx: DraftContext): Side | undefined {
  return jets[0] ? resolveDraft(jets[0].draft, ctx).runIn?.offsetTurn.direction : undefined;
}

/** Evenly spaced over the target, lead at 0. */
export function respace(jets: Jet[], spacing_s: number): Jet[] {
  return jets.map((j, i) => ({ ...j, totOffset_s: defaultTotOffset(i, spacing_s) }));
}

/**
 * The strike's target. Jets still on the old strike target (or on none) move
 * with it; a jet the planner sent to its own target stays there.
 */
export function setStrikeTarget(jets: Jet[], oldTarget: string, newTarget: string): Jet[] {
  return jets.map((j) =>
    !j.draft.targetWaypointId || j.draft.targetWaypointId === oldTarget ? { ...j, draft: setTarget(j.draft, newTarget) } : j,
  );
}

/** A profile chip on the Group tab: every jet that has that profile on offer switches to it. */
export function chooseStrikeProfile(jets: Jet[], profileId: string, ctx: DraftContext): Jet[] {
  return jets.map((j) =>
    resolveDraft(j.draft, ctx).build.candidates.some((p) => p.id === profileId) ? { ...j, draft: chooseProfile(j.draft, profileId) } : j,
  );
}

/**
 * A number changed on the Group tab. The lead takes it as typed; every other
 * jet flying the same kind of delivery takes what changed, re-derived on its
 * own flank from its own IP.
 */
export function groupEdit(jets: Jet[], nextLead: AttackProfile, ctx: DraftContext): Jet[] {
  if (!jets.length) return jets;
  const prevLead = resolveDraft(jets[0].draft, ctx).profile;
  if (!prevLead) return jets;
  return jets.map((j, i) => {
    if (i === 0) return { ...j, draft: editProfile(j.draft, nextLead) };
    const r = resolveDraft(j.draft, ctx);
    if (!r.profile || r.profile.type !== nextLead.type) return j;
    return {
      ...j,
      draft: editProfile(j.draft, applyGroupEdit(prevLead, nextLead, r.profile, r.build.directBearing, r.target?.elevation_ft ?? 0)),
    };
  });
}
