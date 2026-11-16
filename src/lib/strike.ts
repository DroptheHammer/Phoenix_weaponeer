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
import type { AttackPicture, LineStyleKey } from '../types/attackPicture.types';
import type { FragRule } from '../types/strike.types';
import { moveIp, applyFlank } from './attackFlank';
import { applyPopupPlan } from './popupPlanning';
import { applyLoftPlan } from './loftPlanning';
import { calculateDistance } from './coordinates';
import { buildAttackPicture } from './attackPicture';
import { attackIpAnchor } from './ipAnchor';
import { opposite, signedHeadingDelta, type Side } from './attackGeometry';
import { isFired } from './weaponClass';

/** A new strike's spacing before the weapons are known. */
export const DEFAULT_SPACING_S = 30;

/** A fire-control radar's cone, roughly: two jets closer than this in azimuth are one target to it. */
export const FIRE_CONTROL_CONE_DEG = 40;

/** The spacing rule's "same axis": its frag warning says so when the two jets' attack axes are this close. */
export const SAME_AXIS_DEG = 15;

// ─── Membership ────────────────────────────────────────────────────────────────

export function strikeOf(mission: Mission, strikeId: string | undefined): Strike | undefined {
  return strikeId ? mission.strikes?.find((s) => s.id === strikeId) : undefined;
}

/**
 * The strike's attacks, lead first. The lead is the jet first on target, not
 * the lowest flight number: swapping the pilot on the lead's jet must not hand
 * the lead (and the T+0 every offset counts from) to another jet. Ties go by
 * flight position, then sequence.
 */
export function strikeMembers(mission: Mission, strikeId: string): Attack[] {
  const position = (a: Attack) => mission.flightMembers.find((m) => m.id === a.attackerId)?.position ?? 9;
  return mission.attacks
    .filter((a) => a.strikeId === strikeId)
    .sort(
      (a, b) =>
        (a.totOffset_s ?? 0) - (b.totOffset_s ?? 0) || position(a) - position(b) || a.sequenceNumber - b.sequenceNumber,
    );
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
      return target ? { ...a, profile: moveIp(a.profile, shared, mission.waypoints, target, isFired(a.weaponClass)) } : a;
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
 * Write new TOT offsets onto a strike's members (attack id → seconds), then
 * re-base so whoever is first on target leads at 0 — a jet moved ahead of the
 * lead becomes the lead. Pure: each written attack is a new object around the
 * same profile; members not listed, attacks outside the strike, and members
 * whose given offset is not a finite number are left as they are. An unknown
 * strike, or offsets that each equal the one already there, return the
 * mission unchanged (the same object), so the store records no Undo step and
 * marks nothing unsaved. Never `respace`, which would wipe each jet's own
 * delay. For the playback's Apply; the store wraps it in one undo step.
 */
export function setStrikeOffsets(mission: Mission, strikeId: string, offsets: Record<string, number>): Mission {
  if (!strikeOf(mission, strikeId) || mission.attacks.every((a) => a.strikeId !== strikeId || !Number.isFinite(offsets[a.id]) || (a.totOffset_s ?? 0) === offsets[a.id])) return mission;
  const written: Mission = {
    ...mission,
    attacks: mission.attacks.map((a) =>
      a.strikeId === strikeId && Number.isFinite(offsets[a.id]) ? { ...a, totOffset_s: offsets[a.id] } : a,
    ),
  };
  return rebaseTot(written, strikeId);
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
  // A loft's timer counts from each jet's own IP distance.
  'pullUpTimer_s',
]);

/**
 * A number changed on the Group tab: copy what changed on the lead to this
 * member, if it flies the same kind of delivery, then re-derive the member's
 * own headings on its own flank. A member flying something else is left alone.
 *
 * A loft has no flank: it takes the lead's inputs (run-in altitude and speed,
 * loft angle, G), never its egress or IP, and re-derives everything else from
 * its own IP bearing and distance (`memberIpToTarget_nm`, for the timer).
 * `memberFired` is whether the member's weapon is a gun or rockets: its dive
 * heading is solved on the sight line, as its picture draws it.
 */
export function applyGroupEdit(
  prevLead: AttackProfile,
  nextLead: AttackProfile,
  member: AttackProfile,
  memberBearing: number | undefined,
  memberTargetElevation_ft: number,
  memberFired: boolean,
  memberIpToTarget_nm?: number,
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
  if (merged.type === 'loft_ccrp') return applyLoftPlan(merged, memberBearing, memberIpToTarget_nm);
  if (merged.type === 'dive_ccip' || merged.type === 'level_ccrp') {
    return applyFlank(merged, merged.offsetDirection ?? 'right', memberBearing, memberTargetElevation_ft, memberFired);
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
  // A loft spends its run from the IP at the run-in speed; the (lower) release speed is only the end of the climb.
  if (profile.type === 'loft_ccrp') return profile.ingressSpeed_ktas;
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

/** Two jets over the target inside the first one's frag: what `strikeReadout`'s frag warning says, as numbers. */
export interface FragConflict {
  /** Label of the jet over the target first (on a tie, the one listed first). */
  first: string;
  /** Label of the jet that follows it into the frag. */
  second: string;
  /** Places of `first` and `second` in the list given to `fragConflicts`. */
  firstIndex: number;
  secondIndex: number;
  /** Seconds between their TOTs, unrounded (the warning prints it rounded). Never negative. */
  gap_s: number;
  /** The first jet's frag clear time (`fragClearTime_s` of its weapon); always more than `gap_s`. */
  frag_s: number;
  /** Both pictures exist and their attack axes are within `SAME_AXIS_DEG`. */
  sameAxis: boolean;
}

/**
 * Every pair of jets whose second is over the target inside the first's frag:
 * the rule behind `strikeReadout`'s frag warnings, one row per warning, in the
 * same order. Every pair, not only neighbours (#1 and #3 share a side in a
 * 4-ship), taken (0,1), (0,2) … (1,2) …. "First" is by TOT; on a tie the jet
 * listed first is first, so its weapon's frag decides. The boundary is strict:
 * a gap equal to the frag time is clear.
 */
export function fragConflicts(jets: StrikeJet[]): FragConflict[] {
  const conflicts: FragConflict[] = [];
  for (let i = 0; i < jets.length; i++) {
    for (let j = i + 1; j < jets.length; j++) {
      const iFirst = jets[i].totOffset_s <= jets[j].totOffset_s;
      const first = iFirst ? jets[i] : jets[j];
      const second = iFirst ? jets[j] : jets[i];
      const gap = second.totOffset_s - first.totOffset_s;
      const frag = fragClearTime_s(first.weapon);
      if (frag > 0 && gap < frag) {
        const sameAxis =
          !!first.picture && !!second.picture && Math.abs(signedHeadingDelta(first.picture.attackHeading, second.picture.attackHeading)) < SAME_AXIS_DEG;
        conflicts.push({
          first: first.label,
          second: second.label,
          firstIndex: iFirst ? i : j,
          secondIndex: iFirst ? j : i,
          gap_s: gap,
          frag_s: frag,
          sameAxis,
        });
      }
    }
  }
  return conflicts;
}

/**
 * A strike's frag rule. Blast distance when a bomb goes off is how DCS works,
 * so it is the default: only a strike that says 'time' keeps the real-world
 * spacing rule, and a strike saved before the choice existed is checked by
 * distance. Never rendered, so an odd value needs no checking.
 */
export function strikeFragRule(strike: { fragRule?: string } | undefined): FragRule {
  return strike?.fragRule === 'time' ? 'time' : 'burst';
}

/**
 * The strike strip's splits, pushes and warnings. Under 'time' the frag
 * warnings are the spacing rule's, as they always were; under 'burst' they are
 * left out, because the blast distance needs the jets' flight paths and comes
 * from the playback library, which adds its own lines.
 */
export function strikeReadout(jets: StrikeJet[], rule: FragRule = 'time'): StrikeReadout {
  const splits: StrikeReadout['splits'] = [];
  const warnings: string[] = [];
  for (let i = 1; i < jets.length; i++) {
    const a = jets[i - 1], b = jets[i];
    if (!a.picture || !b.picture) continue;
    const deg = Math.abs(signedHeadingDelta(a.picture.attackHeading, b.picture.attackHeading));
    splits.push({ a: a.label, b: b.label, deg, grade: coneGrade(deg) });
  }
  if (rule === 'time') for (const c of fragConflicts(jets)) {
    warnings.push(
      `${c.second} is over the target ${Math.round(c.gap_s)} s after ${c.first}, inside ${c.first}'s ~${c.frag_s} s of frag (est.)` +
        (c.sameAxis ? ' — and on the same axis' : ''),
    );
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
  // A loft runs straight from the IP: it has no flank to name.
  const sideOf = (a: Attack) => (a.profile.type === 'loft_ccrp' ? '' : (a.profile as { offsetDirection?: Side }).offsetDirection === 'left' ? 'L' : 'R');

  const mine = pictureOf(mission, attack);
  const tot = attack.totOffset_s ?? 0;
  const speed = attackSpeedOf(attack.profile);
  const flight = mine && speed ? ipToImpact_s(mine, speed) : undefined;
  const others = members
    .filter((a) => a.id !== attack.id)
    .map((a) => [`#${members.indexOf(a) + 1}`, callsign(a), sideOf(a), fmtStrikeTime(a.totOffset_s ?? 0)].filter(Boolean).join(' '));

  const strikeLine = [
    strike.name,
    `#${seat + 1} of ${members.length}`,
    ...(sideOf(attack) ? [`${sideOf(attack)} flank`] : []),
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
