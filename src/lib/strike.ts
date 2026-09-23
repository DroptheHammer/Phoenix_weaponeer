/**
 * Coordinated strikes: two to four jets of the flight on one attack.
 *
 * Everything here is pure — mission in, mission out, or numbers out — so
 * geo-check can hold the cascades and the split to account. The strike editor
 * and the store call these; the map and the card never need to know a strike
 * exists beyond `strikeMembers`, because the shared IP is written onto every
 * member's own profile.
 *
 * The tactic, and why the defaults are what they are: see
 * docs/DELIVERY_PLANNING.md ("Coordinated strikes").
 */

import type { Attack, AttackProfile, DbWeapon, IpAnchorFields, Mission, Strike } from '../types';
import type { AttackPicture, LineStyleKey } from '../types/attackPicture.types';import { moveIp, applyFlank } from './attackFlank';
import { applyPopupPlan } from './popupPlanning';
import { calculateDistance } from './coordinates';
import { buildAttackPicture } from './attackPicture';
import { attackIpAnchor } from './ipAnchor';
import { opposite, signedHeadingDelta, type Side } from './attackGeometry';

/** A new strike's spacing before the weapons are known. */
export const DEFAULT_SPACING_S = 30;

/** A fire-control radar's cone, roughly: two jets closer than this in azimuth are one target to it. */
export const FIRE_CONTROL_CONE_DEG = 40;

/** Two jets this close to the same attack axis fly through each other's frag unless spaced in time. */
export const SAME_AXIS_DEG = 15;

// ─── Membership ────────────────────────────────────────────────────────────────

export function strikeOf(mission: Mission, strikeId: string | undefined): Strike | undefined {
  return strikeId ? mission.strikes?.find((s) => s.id === strikeId) : undefined;
}

/** The strike's attacks, lead first: by the attacker's flight position, then by sequence. */
export function strikeMembers(mission: Mission, strikeId: string): Attack[] {
  const position = (a: Attack) => mission.flightMembers.find((m) => m.id === a.attackerId)?.position ?? 9;
  return mission.attacks
    .filter((a) => a.strikeId === strikeId)
    .sort((a, b) => position(a) - position(b) || a.sequenceNumber - b.sequenceNumber);
}

/**
 * Which flank each jet runs in on: the lead's side, then mirrored pairs.
 * #1 lead's side, #2 the other, #3 the lead's again, #4 the other — so a
 * 4-ship is two 2-ships each split across the direct line.
 */
export function strikeFlank(index: number, leadSide: Side): Side {
  return index % 2 === 0 ? leadSide : opposite(leadSide);
}

/** #1 at 0, #2 at +spacing, #3 at +2×spacing… */
export function defaultTotOffset(index: number, spacing_s: number): number {
  return index * spacing_s;
}

// ─── The shared IP ───────────────────────────────────────────────────────────

/**
 * Set a strike's IP and write it through to every member, headings and all.
 * `{}` is Auto — each jet falls back to the waypoint before its own target,
 * which is also what clearing or deleting a shared IP does.
 */
export function applyStrikeIp(mission: Mission, strikeId: string, ip: IpAnchorFields): Mission {
  const strike = strikeOf(mission, strikeId);
  if (!strike) return mission;
  const shared: IpAnchorFields = ip.customIp ? { customIp: ip.customIp } : ip.ipWaypointId ? { ipWaypointId: ip.ipWaypointId } : {};
  return {
    ...mission,
    strikes: mission.strikes!.map((s) => (s.id === strikeId ? { ...s, ip: shared } : s)),
    attacks: mission.attacks.map((a) => {
      if (a.strikeId !== strikeId) return a;
      const target = mission.waypoints.find((wp) => wp.id === a.targetWaypointId);
      return target ? { ...a, profile: moveIp(a.profile, shared, mission.waypoints, target) } : a;
    }),
  };
}

// ─── Adding, saving, removing ─────────────────────────────────────────────────

/**
 * Write a strike and its members in one step. Members with an id replace
 * those attacks; members without one are added. Attacks that were in the
 * strike and are not in `members` leave it, and stay as plain attacks.
 */
export function saveStrikeTo(
  mission: Mission,
  strike: Strike,
  members: { id?: string; data: Omit<Attack, 'id' | 'strikeId' | 'totOffset_s'>; totOffset_s: number }[],
  newId: () => string,
): { mission: Mission; attackIds: string[] } {
  const attackIds: string[] = [];
  const kept = new Set(members.map((m) => m.id).filter(Boolean));
  let attacks = mission.attacks.map((a) =>
    a.strikeId === strike.id && !kept.has(a.id) ? { ...a, strikeId: undefined, totOffset_s: undefined } : a,
  );
  let next = attacks.length ? Math.max(...attacks.map((a) => a.sequenceNumber)) + 1 : 1;
  for (const m of members) {
    const attack: Attack = { ...m.data, id: m.id ?? newId(), strikeId: strike.id, totOffset_s: m.totOffset_s };
    attackIds.push(attack.id);
    if (m.id && attacks.some((a) => a.id === m.id)) {
      attacks = attacks.map((a) => (a.id === m.id ? { ...attack, sequenceNumber: a.sequenceNumber } : a));
    } else {
      attacks = [...attacks, { ...attack, sequenceNumber: next++ }];
    }
  }
  const strikes = mission.strikes?.some((s) => s.id === strike.id)
    ? mission.strikes.map((s) => (s.id === strike.id ? strike : s))
    : [...(mission.strikes ?? []), strike];
  return { mission: rebaseTot({ ...mission, attacks, strikes }, strike.id), attackIds };
}

/** Ungroup: the members stay as plain attacks with their numbers; only the link and the offsets go. */
export function removeStrikeFrom(mission: Mission, strikeId: string): Mission {
  return {
    ...mission,
    strikes: (mission.strikes ?? []).filter((s) => s.id !== strikeId),
    attacks: mission.attacks.map((a) => (a.strikeId === strikeId ? { ...a, strikeId: undefined, totOffset_s: undefined } : a)),
  };
}

/** Offsets count from the lead, so whoever leads now sits at 0. */
export function rebaseTot(mission: Mission, strikeId: string): Mission {
  const members = strikeMembers(mission, strikeId);
  const leadOffset = members[0]?.totOffset_s ?? 0;
  if (!members.length || leadOffset === 0) return mission;
  return {
    ...mission,
    attacks: mission.attacks.map((a) => (a.strikeId === strikeId ? { ...a, totOffset_s: (a.totOffset_s ?? 0) - leadOffset } : a)),
  };
}

/**
 * After an attack leaves (deleted, or its pilot removed): a strike left with
 * one jet is no longer a strike, and one that lost its lead re-bases on the
 * next jet.
 */
export function tidyStrikes(mission: Mission): Mission {
  let next = mission;
  for (const strike of mission.strikes ?? []) {
    const members = strikeMembers(next, strike.id);
    next = members.length < 2 ? removeStrikeFrom(next, strike.id) : rebaseTot(next, strike.id);
  }
  return next;
}

// ─── Group edits ───────────────────────────────────────────────────────────────

/**
 * The fields a Group edit never copies from the lead: each jet's side, its
 * headings (which follow from its own side and IP), its IP, and which way it
 * breaks off.
 */
const PER_JET_FIELDS = new Set([
  'type',
  'offsetDirection',
  'ingressHeading_deg',
  'runInHeading_deg',
  'approachHeading_deg',
  'pullDownTurn_deg',
  'ipWaypointId',
  'customIp',
  'egressDirection',
  'egressHeading_deg',
]);

/**
 * A number changed on the Group tab: copy what changed on the lead to this
 * member, if it flies the same kind of delivery, then re-derive the member's
 * own headings on its own flank. A member flying something else is left alone.
 */
export function applyGroupEdit(
  prevLead: AttackProfile,
  nextLead: AttackProfile,
  member: AttackProfile,
  memberBearing: number | undefined,
  memberTargetElevation_ft = 0,
): AttackProfile {
  if (member.type !== nextLead.type) return member;
  const patch: Record<string, unknown> = {};
  const prev = prevLead as unknown as Record<string, unknown>;
  const next = nextLead as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (PER_JET_FIELDS.has(key)) continue;
    if (!Object.is(prev[key], next[key])) patch[key] = next[key];
  }
  if (Object.keys(patch).length === 0) return member;
  const merged = { ...member, ...patch } as AttackProfile;
  if (merged.type === 'popup_ccip') return applyPopupPlan(merged, memberBearing);
  if (merged.type === 'dive_ccip' || merged.type === 'level_ccrp') {
    return applyFlank(merged, merged.offsetDirection ?? 'right', memberBearing, memberTargetElevation_ft);
  }
  return merged;
}

// ─── Timing and the picture a SAM sees ─────────────────────────────────────────

const G_FT_S2 = 32.174;

/**
 * How long a jet's bombs keep the air over the target dangerous: fragments
 * thrown up to the weapon's frag min-safe height and falling back, in vacuum
 * — 2·√(2h/g) — rounded up to 5 s. 1,500 ft gives 20 s. ESTIMATED: a
 * planning floor for spacing, not a DCS-measured number.
 */
export function fragClearTime_s(weapon: Pick<DbWeapon, 'frag_min_safe_alt_ft'> | undefined): number {
  const h = weapon?.frag_min_safe_alt_ft ?? 0;
  if (!(h > 0)) return 0;
  return Math.ceil((2 * Math.sqrt((2 * h) / G_FT_S2)) / 5) * 5;
}

/** The lines the jet flies from the IP to release, plus the bomb's fall. */
const PATH_STYLES: LineStyleKey[] = ['route', 'leg', 'climb', 'pullDown', 'attack', 'bomb'];

function pathLength_nm(picture: AttackPicture): number {
  let nm = 0;
  for (const line of picture.lines) {
    if (!PATH_STYLES.includes(line.style)) continue;
    for (let i = 1; i < line.points.length; i++) nm += calculateDistance(line.points[i - 1], line.points[i]);
  }
  return nm;
}

/** Seconds from leaving the IP to bombs on the target, at the attack speed. ESTIMATED: no turn or acceleration time. */
export function ipToImpact_s(picture: AttackPicture, speed_ktas: number): number | undefined {
  if (!(speed_ktas > 0)) return undefined;
  return (pathLength_nm(picture) / speed_ktas) * 3600;
}

export function attackSpeedOf(profile: AttackProfile): number | undefined {
  if (profile.type === 'popup_ccip') return profile.runInSpeed_ktas;
  return (profile as { releaseSpeed_ktas?: number }).releaseSpeed_ktas;
}

export interface StrikeJet {
  label: string;
  picture: AttackPicture | undefined;
  speed_ktas: number | undefined;
  totOffset_s: number;
  weapon: DbWeapon | undefined;
}

export type ConeGrade = 'good' | 'marginal' | 'inside';

export interface StrikeReadout {
  /** Azimuth between consecutive jets' attack axes, as the defender at the target sees it. */
  splits: { a: string; b: string; deg: number; grade: ConeGrade }[];
  /** When each jet leaves the IP, relative to the lead's time over target (negative = before). */
  pushes: { label: string; push_s: number | undefined; tot_s: number }[];
  warnings: string[];
}

export function coneGrade(deg: number): ConeGrade {
  return deg >= 55 ? 'good' : deg >= FIRE_CONTROL_CONE_DEG ? 'marginal' : 'inside';
}

export function strikeReadout(jets: StrikeJet[]): StrikeReadout {
  const splits: StrikeReadout['splits'] = [];
  const warnings: string[] = [];
  for (let i = 1; i < jets.length; i++) {
    const a = jets[i - 1], b = jets[i];
    if (!a.picture || !b.picture) continue;
    const deg = Math.abs(signedHeadingDelta(a.picture.attackHeading, b.picture.attackHeading));
    splits.push({ a: a.label, b: b.label, deg, grade: coneGrade(deg) });
  }
  // Every pair, not only neighbours: #1 and #3 share a side in a 4-ship.
  for (let i = 0; i < jets.length; i++) {
    for (let j = i + 1; j < jets.length; j++) {
      const first = jets[i].totOffset_s <= jets[j].totOffset_s ? jets[i] : jets[j];
      const second = first === jets[i] ? jets[j] : jets[i];
      const gap = second.totOffset_s - first.totOffset_s;
      const frag = fragClearTime_s(first.weapon);
      if (frag > 0 && gap < frag) {
        const sameAxis =
          first.picture && second.picture && Math.abs(signedHeadingDelta(first.picture.attackHeading, second.picture.attackHeading)) < SAME_AXIS_DEG;
        warnings.push(
          `${second.label} is over the target ${Math.round(gap)} s after ${first.label}, inside ${first.label}'s ~${frag} s of frag (est.)` +
            (sameAxis ? ' — and on the same axis' : ''),
        );
      }
    }
  }
  for (const s of splits) {
    if (s.grade === 'inside') warnings.push(`${s.a} and ${s.b} are only ${Math.round(s.deg)}° apart — inside one ${FIRE_CONTROL_CONE_DEG}° fire-control cone`);
  }
  const pushes = jets.map((j) => {
    const flight = j.picture && j.speed_ktas ? ipToImpact_s(j.picture, j.speed_ktas) : undefined;
    return { label: j.label, tot_s: j.totOffset_s, push_s: flight != null ? j.totOffset_s - flight : undefined };
  });
  return { splits, pushes, warnings };
}

// ─── The card ──────────────────────────────────────────────────────────────────

function pictureOf(mission: Mission, attack: Attack): AttackPicture | undefined {
  const target = mission.waypoints.find((wp) => wp.id === attack.targetWaypointId);
  return target ? buildAttackPicture(attack, attackIpAnchor(mission.waypoints, attack), target) : undefined;
}

/**
 * What a strike member's card says about the strike: one line — who, which
 * seat, which side, when over the target, when to leave the IP — and the other
 * jets' pictures to draw faint under this one. Undefined for a plain attack.
 */
export function strikeCardInfo(
  mission: Mission,
  attack: Attack,
): { strikeLine: string; wingmen: { label: string; picture: AttackPicture }[] } | undefined {
  const strike = strikeOf(mission, attack.strikeId);
  if (!strike) return undefined;
  const members = strikeMembers(mission, strike.id);
  const seat = members.findIndex((a) => a.id === attack.id);
  if (seat < 0 || members.length < 2) return undefined;
  const callsign = (a: Attack) => mission.flightMembers.find((m) => m.id === a.attackerId)?.callsign ?? `#${members.indexOf(a) + 1}`;
  const sideOf = (a: Attack) => ((a.profile as { offsetDirection?: Side }).offsetDirection === 'left' ? 'L' : 'R');

  const mine = pictureOf(mission, attack);
  const tot = attack.totOffset_s ?? 0;
  const speed = attackSpeedOf(attack.profile);
  const flight = mine && speed ? ipToImpact_s(mine, speed) : undefined;
  const others = members
    .filter((a) => a.id !== attack.id)
    .map((a) => `#${members.indexOf(a) + 1} ${callsign(a)} ${sideOf(a)} ${fmtStrikeTime(a.totOffset_s ?? 0)}`);

  const strikeLine = [
    strike.name,
    `#${seat + 1} of ${members.length}`,
    `${sideOf(attack)} flank`,
    `TOT ${fmtStrikeTime(tot)}`,
    ...(flight != null ? [`push IP ${fmtStrikeTime(tot - flight)} (est)`] : []),
    `with ${others.join(', ')}`,
  ].join(' · ');

  const wingmen = members
    .filter((a) => a.id !== attack.id)
    .flatMap((a) => {
      const picture = pictureOf(mission, a);
      return picture ? [{ label: `#${members.indexOf(a) + 1}`, picture }] : [];
    });
  return { strikeLine, wingmen };
}

/** "T-2:05" / "T+0:30" for a time relative to the lead's time over target. */
export function fmtStrikeTime(s: number): string {
  const sign = s < 0 ? '-' : '+';
  const a = Math.round(Math.abs(s));
  return `T${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}
