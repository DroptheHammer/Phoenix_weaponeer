/**
 * The blast rule: when a bomb goes off, is another jet inside that bomb's
 * blast radius, in 3D, at that instant? That is how DCS's blast works (damage
 * by distance at the burst, nothing that lingers), so nothing after the
 * instant counts, there are no fragments and no cloud. The radius is the
 * weapon row's sourced `blast_radius_ft` and nothing else; a row without one
 * is not tested and the user is told. Distance only: the app has no DCS
 * terrain, so a hill between the burst and the jet earns no credit, and the
 * rule can warn where DCS would not, never the reverse.
 *
 * The burst is the last sample of the jet's bomb path (its target waypoint at
 * ground level) at its time over target. The jets tested are every other
 * flown jet on the plan layer (the card's lines, straight between samples),
 * from its IP crossing to the end of its track. On each straight piece
 * "closer than R" is a quadratic, so the stretches of a track inside a radius
 * come out exactly (`spansInside`), and both the warnings and the slider's
 * danger zones are read off those same stretches: they cannot disagree.
 *
 * Pure: no React, DOM or three.js. Run once per re-time, never per frame.
 */

import type { DbWeapon } from '../../types';
import type { BlastMeaning, BlastSource } from '../../types/weapon.types';
import { weaponClassOf } from '../weaponClass';
import { FT_TO_M } from './frame';
import { burstNoun, burstSentence, noRadiusNote, notFlownNote } from './fragWords';
import type { DangerZone, JetTrack, StrikePlayback, TimedBurst, TrackSamples } from './types';

/** How many seconds of strike time the time bar's stripe and the chip's band cover for one burst: display only, the rule is the instant. */
export const BURST_MARK_S = 1;
/** The narrowest stripe drawn for a blast conflict or zone, px: the lane's own narrowest mark, so an instant is never lost on a long axis. */
export const BAND_MIN_PX = 6;
export const BLAST_SOURCES: readonly BlastSource[] = ['game_data', 'developer', 'scripting_doc', 'community_measurement', 'owner_test', 'estimate'];
export const BLAST_MEANINGS: readonly BlastMeaning[] = ['any_damage', 'destroyed'];

/** A weapon's blast radius, what it means and where it comes from. */
export interface BurstSpec {
  radius_ft: number;
  meaning: BlastMeaning;
  source: BlastSource;
}

type Track = Pick<TrackSamples, 'n' | 'tau_s' | 'e_m' | 'n_m' | 'up_m'>;

/** A stretch of a jet's own time during which it is inside a radius, open at both ends. */
export interface Span {
  from_s: number;
  to_s: number;
}

/**
 * A row's blast radius, or undefined: the figure, what it means and where it
 * comes from must all be there, so a number nobody can source is never
 * tested, even by mistake. The old seed radii (`frag_*_radius_ft`) are not read.
 */
export function burstSpecOf(w: Pick<DbWeapon, 'blast_radius_ft' | 'blast_radius_meaning' | 'blast_radius_source'> | undefined): BurstSpec | undefined {
  const r = w?.blast_radius_ft;
  if (typeof r !== 'number' || !Number.isFinite(r) || !(r > 0)) return undefined;
  const meaning = BLAST_MEANINGS.find((m) => m === w?.blast_radius_meaning);
  const source = BLAST_SOURCES.find((s) => s === w?.blast_radius_source);
  return meaning && source ? { radius_ft: r, meaning, source } : undefined;
}

/** Where the track is strictly closer than `radius_m` to the point: open spans of jet time, exact on its straight pieces. */
export function spansInside(S: Track, e: number, n: number, up: number, radius_m: number): Span[] {
  const out: Span[] = [];
  for (let i = 0; i + 1 < S.n; i++) {
    const ax = S.e_m[i] - e, ay = S.n_m[i] - n, az = S.up_m[i] - up;
    const dx = S.e_m[i + 1] - S.e_m[i], dy = S.n_m[i + 1] - S.n_m[i], dz = S.up_m[i + 1] - S.up_m[i];
    const A = dx * dx + dy * dy + dz * dz;
    const B = 2 * (ax * dx + ay * dy + az * dz);
    const C = ax * ax + ay * ay + az * az - radius_m * radius_m;
    let u1 = 0, u2 = 1;
    if (A === 0) {
      if (!(C < 0)) continue;
    } else {
      const disc = B * B - 4 * A * C;
      if (!(disc > 0)) continue;
      const q = Math.sqrt(disc);
      u1 = Math.max((-B - q) / (2 * A), 0);
      u2 = Math.min((-B + q) / (2 * A), 1);
      if (!(u2 > u1)) continue;
    }
    const t0 = S.tau_s[i], dt = S.tau_s[i + 1] - t0;
    const last = out[out.length - 1];
    // A stretch that runs on across a sample joins the one before it.
    if (last && u1 === 0 && Math.abs(last.to_s - t0) < 1e-9) last.to_s = t0 + u2 * dt;
    else out.push({ from_s: t0 + u1 * dt, to_s: t0 + u2 * dt });
  }
  return out;
}

/** Is the jet inside at its own time `tau_s`? Open ends: entering or leaving at that very instant is clear. */
export function insideAt(spans: readonly Span[], tau_s: number): boolean {
  return spans.some((s) => s.from_s < tau_s && tau_s < s.to_s);
}

/** The track's distance from the point at its own time `tau_s`, m; Infinity before its first sample or after its last. */
export function distanceAt(S: Track, tau_s: number, e: number, n: number, up: number): number {
  if (!(tau_s >= S.tau_s[0]) || !(tau_s <= S.tau_s[S.n - 1])) return Infinity;
  let lo = 0, hi = S.n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (S.tau_s[mid] <= tau_s) lo = mid; else hi = mid;
  }
  const dt = S.tau_s[hi] - S.tau_s[lo];
  const f = dt > 0 ? (tau_s - S.tau_s[lo]) / dt : 0;
  const at = (a: Float64Array) => a[lo] + (a[hi] - a[lo]) * f;
  return Math.hypot(at(S.e_m) - e, at(S.n_m) - n, at(S.up_m) - up);
}

/** A jet's burst point and radius, or undefined when its weapon has no sourced radius. */
function bombOf(jet: JetTrack): { e: number; n: number; up: number; radius_m: number; spec: BurstSpec } | undefined {
  const spec = burstSpecOf(jet.weapon);
  if (!spec) return undefined;
  const B = jet.bomb;
  const last = B.n - 1;
  return { e: B.e_m[last], n: B.n_m[last], up: B.up_m[last], radius_m: spec.radius_ft * FT_TO_M, spec };
}

/** A member's TOT: the delay given when it is a number, else its plan delay (as `retime` reads them). */
const totOf = (pb: StrikePlayback, delays_s: Record<string, number>, id: string): number =>
  Number.isFinite(delays_s[id]) ? delays_s[id] : pb.planDelays_s[id];

/** The member index of flown jet `k`. */
const memberOfJet = (pb: StrikePlayback, k: number) => pb.members.findIndex((m) => m.jet === k);

/**
 * Every (bomb, jet) pair where the jet is inside the bomb's blast radius when
 * it goes off, at these delays (member id → TOT): bomb by bomb in jet order,
 * then jet by jet. Both directions are rows of their own; there is no "first"
 * by time and no tie rule. Only flown jets: a jet the playback cannot fly has
 * neither a path nor a burst point.
 */
export function burstConflicts(pb: StrikePlayback, delays_s: Record<string, number>): TimedBurst[] {
  const rows: TimedBurst[] = [];
  for (let i = 0; i < pb.jets.length; i++) {
    const bomber = pb.jets[i];
    const b = bombOf(bomber);
    if (!b) continue;
    const Ti = totOf(pb, delays_s, bomber.id);
    for (let j = 0; j < pb.jets.length; j++) {
      if (j === i) continue;
      const jet = pb.jets[j];
      // The jet's own time at the burst: its time over target is its impact, and its track runs on jet time.
      const tauBurst = Ti - (totOf(pb, delays_s, jet.id) - jet.impactTau_s);
      if (!insideAt(spansInside(jet.samples, b.e, b.n, b.up, b.radius_m), tauBurst)) continue;
      const fi = memberOfJet(pb, i), si = memberOfJet(pb, j);
      rows.push({
        rule: 'burst',
        first: bomber.label, second: jet.label,
        firstIndex: fi, secondIndex: si,
        firstId: bomber.id, secondId: jet.id,
        firstJet: i, secondJet: j,
        t0_s: Ti, t1_s: Ti + BURST_MARK_S,
        dist_ft: distanceAt(jet.samples, tauBurst, b.e, b.n, b.up) / FT_TO_M,
        radius_ft: b.spec.radius_ft, meaning: b.spec.meaning, source: b.spec.source,
        weapon: bomber.weapon?.name ?? '',
      });
    }
  }
  return rows;
}

/**
 * The delays of flown jet `me` that would warn against each other flown jet
 * held at its delay, in closed form from the same stretches the warnings use:
 * as the one inside another's radius ('victim') and as the bomb with another
 * jet inside ('bomb'). Open intervals, one per stretch and role, none for a
 * weapon without a radius. Not symmetric, and not one per pair.
 */
export function burstZones(pb: StrikePlayback, delays_s: Record<string, number>, me: number): DangerZone[] {
  const zones: DangerZone[] = [];
  const mine = pb.jets[me];
  if (!mine) return zones;
  const ours = bombOf(mine);
  pb.jets.forEach((other, i) => {
    if (i === me) return;
    const T = totOf(pb, delays_s, other.id);
    const against = pb.members.findIndex((m) => m.id === other.id);
    const push = (role: 'victim' | 'bomb', from_s: number, to_s: number) => zones.push({
      against: i, againstMember: against, againstId: other.id, role, from_s, to_s,
      includesFrom: false, includesTo: false, T_s: T, fragThis_s: 0, fragOther_s: 0, tieWarns: false,
    });
    // As the one inside: my own time at their burst must fall inside one of my stretches.
    const theirs = bombOf(other);
    if (theirs) for (const s of spansInside(mine.samples, theirs.e, theirs.n, theirs.up, theirs.radius_m)) push('victim', T + mine.impactTau_s - s.to_s, T + mine.impactTau_s - s.from_s);
    // As the bomb: their own time at my burst must fall inside one of their stretches.
    if (ours) for (const s of spansInside(other.samples, ours.e, ours.n, ours.up, ours.radius_m)) push('bomb', T - other.impactTau_s + s.from_s, T - other.impactTau_s + s.to_s);
  });
  return zones;
}

/**
 * The gray lines: one per weapon a flown jet carries that has no blast
 * radius (seats in order; the classes `noDataNote` speaks for, never guns or
 * rockets), then one per member that is not flown. `unchecked` is the first
 * group's weapon names, for the footer.
 */
function burstNotes(pb: StrikePlayback): { notes: string[]; unchecked: string[] } {
  const groups = new Map<string, { noun: 'bomb' | 'missile'; seats: string[] }>();
  for (const jet of pb.jets) {
    const w = jet.weapon;
    if (!w || burstSpecOf(w)) continue;
    const cls = weaponClassOf(w);
    if (cls !== 'bomb_ld' && cls !== 'bomb_hd' && cls !== 'lgb' && cls !== 'jdam' && cls !== 'cluster' && cls !== 'agm') continue;
    const g = groups.get(w.name) ?? { noun: burstNoun(w), seats: [] };
    g.seats.push(jet.label);
    groups.set(w.name, g);
  }
  const notes = [...groups].map(([name, g]) => noRadiusNote(name, g.seats, g.noun));
  for (const s of pb.skipped) notes.push(notFlownNote(s.label));
  return { notes, unchecked: [...groups.keys()] };
}

export interface BurstReadout {
  conflicts: TimedBurst[];
  /** One sentence per conflict, in the same order. */
  warnings: string[];
  notes: string[];
  unchecked: string[];
}

/** The blast rule's whole answer at these delays (member id → TOT; left out: the plan delays). */
export function burstReadout(pb: StrikePlayback, delays_s: Record<string, number> = pb.planDelays_s): BurstReadout {
  const conflicts = burstConflicts(pb, delays_s);
  const warnings = conflicts.map((c) => burstSentence(c, burstNoun(pb.jets[c.firstJet].weapon)));
  return { conflicts, warnings, ...burstNotes(pb) };
}
