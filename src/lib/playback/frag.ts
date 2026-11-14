/**
 * Frag: the weapon's numbers, the readout's rule as conflicts on the strike
 * clock, the same rule as delay intervals for shading a slider, and the cloud
 * to draw. The playback's warning IS `strikeReadout`'s rule (`fragConflicts`,
 * the same code the editor strip runs): every pair, the earlier jet's weapon,
 * a strict `gap < frag`, ties to the jet listed first. There is deliberately
 * no 3D "flew through the cloud" test: it disagrees with the readout and
 * almost never fires.
 */

import type { DbWeapon } from '../../types';
import { fragClearTime_s, fragConflicts, type StrikeJet } from '../strike';
import type { DangerZone, FragCloudState, FragSpec, JetTrack, StrikePlayback, StrikeTiming, TimedConflict } from './types';

/** strike.ts's gravity, the one fragClearTime_s is derived with (ft/s²). */
const G_FT_S2 = 32.174;

export function fragSpecOf(weapon: DbWeapon | undefined): FragSpec | undefined {
  const clear_s = fragClearTime_s(weapon);
  if (!weapon || !(clear_s > 0)) return undefined;
  const H_ft = weapon.frag_min_safe_alt_ft ?? 0;
  const lethalRadius_ft = weapon.frag_lethal_radius_ft ?? null;
  const effectiveRadius_ft = weapon.frag_effective_radius_ft ?? null;
  return {
    weaponId: weapon.id,
    H_ft,
    clear_s,
    raw_s: 2 * Math.sqrt((2 * H_ft) / G_FT_S2),
    lethalRadius_ft,
    effectiveRadius_ft,
    ringRadius_ft: effectiveRadius_ft ?? lethalRadius_ft,
  };
}

/** Flown jets only, at the given TOTs, in the playback's order. For the readout's own list, flown and skipped, use `strikeJetsAt`. */
export function readoutJets(jets: JetTrack[], tots: number[]): StrikeJet[] {
  return jets.map((j, k) => ({ label: j.label, picture: j.picture, speed_ktas: j.cardSpeed_kt, totOffset_s: tots[k], weapon: j.weapon }));
}

/** A member's TOT: the delay given, else its plan delay. */
export const memberTot = (pb: StrikePlayback, delays_s: Record<string, number> | undefined, id: string): number =>
  delays_s && Number.isFinite(delays_s[id]) ? delays_s[id] : pb.planDelays_s[id];

/**
 * Every member, flown or skipped, as `strikeReadout` sees it, in its order, at
 * these delays (member id → TOT; anyone left out keeps the plan delay): the
 * very list the editor's strip hands the readout.
 */
export function strikeJetsAt(pb: StrikePlayback, delays_s?: Record<string, number>): StrikeJet[] {
  return pb.members.map((m) => ({ label: m.label, picture: m.picture, speed_ktas: m.speed_ktas, totOffset_s: memberTot(pb, delays_s, m.id), weapon: m.weapon }));
}

/**
 * `fragConflicts` of the readout's list (`strikeJetsAt`), each with its band on
 * the timeline: from the second jet's impact to the end of the first jet's
 * frag window. Indices are the readout's (members); `firstJet` / `secondJet`
 * are the flown jets', undefined for a skipped member.
 */
export function timedConflicts(pb: StrikePlayback, readout: StrikeJet[]): TimedConflict[] {
  return fragConflicts(readout).map((c) => ({
    ...c,
    firstId: pb.members[c.firstIndex].id,
    secondId: pb.members[c.secondIndex].id,
    firstJet: pb.members[c.firstIndex].jet,
    secondJet: pb.members[c.secondIndex].jet,
    t0_s: readout[c.secondIndex].totOffset_s,
    t1_s: readout[c.firstIndex].totOffset_s + c.frag_s,
  }));
}

/**
 * The delays of flown jet `jet` that would put it in a frag conflict with any
 * other member (flown or skipped) held at its delay in `timing`, one zone per
 * other member (zones may overlap), in closed form. For jet j against member
 * i at T_i, with F the frag clear times:
 * - after i (x > T_i): i is first, so x warns iff x − T_i < F_i;
 * - before i (x < T_i): j is first, so x warns iff T_i − x < F_j;
 * - tied (x = T_i): the member listed first is first, so the tie warns iff
 *   its F > 0.
 * The frag-time ends are never included (the readout's `gap < frag`).
 * Conflicts among the other members do not depend on this jet's delay, so
 * they are not zones. A skipped member gets no zones of its own (it has no
 * slider) but is held still in everyone else's, as the readout counts it.
 */
export function dangerZones(pb: StrikePlayback, timing: StrikeTiming, jet: number): DangerZone[] {
  const me = pb.jets[jet];
  const mj = me ? pb.members.findIndex((m) => m.jet === jet) : -1;
  if (mj < 0) return [];
  const Fj = fragClearTime_s(me.weapon);
  const zones: DangerZone[] = [];
  pb.members.forEach((other, i) => {
    if (i === mj) return;
    const Ti = memberTot(pb, timing.delays_s, other.id);
    const Fi = fragClearTime_s(other.weapon);
    if (!(Fi > 0) && !(Fj > 0)) return;
    const tieWarns = (i < mj ? Fi : Fj) > 0;
    // Each side is open at its frag-time end; the side that exists reaches the tie.
    const from_s = Fj > 0 ? Ti - Fj : Ti;
    const to_s = Fi > 0 ? Ti + Fi : Ti;
    zones.push({
      against: other.jet,
      againstMember: i,
      againstId: other.id,
      from_s,
      to_s,
      includesFrom: !(Fj > 0) && tieWarns,
      includesTo: !(Fi > 0) && tieWarns,
      T_s: Ti,
      fragThis_s: Fj,
      fragOther_s: Fi,
      tieWarns,
    });
  });
  return zones;
}

/**
 * True when delay `x` would warn against one of the zones' members: the
 * readout's own expressions (`gap = second − first`, `gap < frag`), not a
 * comparison with `from_s` / `to_s`, so a fractional TOT cannot split them by
 * an ulp at a frag-time end.
 */
export function inDangerZone(zones: DangerZone[], x: number): boolean {
  return zones.some((z) => (x > z.T_s ? x - z.T_s < z.fragOther_s : x < z.T_s ? z.T_s - x < z.fragThis_s : z.tieWarns));
}

export function newFragCloudState(): FragCloudState {
  return {
    visible: false, age_s: 0, lat: 0, lon: 0, e_m: 0, n_m: 0, up_m: 0, H_ft: 0, top_ft: 0, sphereRadius_ft: 0, centreDrop_ft: 0,
    ringRadius_ft: null, opacity: 0, estimated: true,
  };
}

/**
 * Jet `jet`'s frag cloud at strike time `t_s`: centred on its impact point
 * (the target waypoint, at ground level), from its TOT until its frag window
 * closes. Not visible without frag data, which is exactly when the readout
 * can never warn about this jet's weapon. No allocation with `out`.
 */
export function fragCloudAt(pb: StrikePlayback, timing: StrikeTiming, jet: number, t_s: number, out: FragCloudState = newFragCloudState()): FragCloudState {
  const track = pb.jets[jet];
  const frag = track.frag;
  const B = track.bomb;
  const age = t_s - timing.jets[jet].tot_s;
  const last = B.n - 1;
  out.age_s = age;
  out.lat = B.lat[last];
  out.lon = B.lon[last];
  out.e_m = B.e_m[last];
  out.n_m = B.n_m[last];
  out.up_m = B.up_m[last];
  out.H_ft = frag?.H_ft ?? 0;
  out.ringRadius_ft = frag?.ringRadius_ft ?? null;
  out.visible = !!frag && age >= 0 && age < frag.clear_s;
  if (!frag || !out.visible) {
    out.top_ft = 0;
    out.sphereRadius_ft = 0;
    out.centreDrop_ft = 0;
    out.opacity = 0;
    return out;
  }
  const v0 = Math.sqrt(2 * G_FT_S2 * frag.H_ft);
  out.sphereRadius_ft = v0 * age;
  out.centreDrop_ft = 0.5 * G_FT_S2 * age * age;
  out.top_ft = Math.max(0, out.sphereRadius_ft - out.centreDrop_ft);
  out.opacity = age <= frag.raw_s ? 1 : frag.clear_s > frag.raw_s ? (frag.clear_s - age) / (frag.clear_s - frag.raw_s) : 0;
  return out;
}
