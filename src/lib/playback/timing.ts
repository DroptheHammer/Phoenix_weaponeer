/**
 * The strike clock: one number per jet. Each jet's impact is exactly its TOT
 * (its raw delay; the lead need not be 0), and the IP crossing falls wherever
 * honest timing puts it: shift = TOT − flown IP→impact. The card's push
 * (TOT − ipToImpact_s) is carried beside it, because the card flies the bomb
 * line at jet speed and the playback cannot agree with both the card's push
 * and its timer, track time and time of fall. There is no "match the card"
 * mode on purpose.
 */

import { strikeReadout } from '../strike';
import { burstReadout } from './burst';
import { memberTot as tot, strikeJetsAt, timedConflicts } from './frag';
import type { JetTrack, StrikePlayback, StrikeTiming, StrikeWindow, TimingJet } from './types';

function timingJet(track: JetTrack, tot_s: number): TimingJet {
  const shift = tot_s - track.impactTau_s;
  const cardPush = track.cardIpToImpact_s != null ? tot_s - track.cardIpToImpact_s : undefined;
  return {
    id: track.id, tot_s, shift_s: shift, push_s: shift,
    cardPush_s: cardPush, pushDelta_s: cardPush != null ? shift - cardPush : undefined,
    release_s: track.releaseTau_s + shift, impact_s: tot_s, egressEnd_s: track.egressEndTau_s + shift,
    fragEnd_s: tot_s + (track.frag?.clear_s ?? 0), hide_s: track.hideTau_s + shift,
  };
}

/** From the earliest flown push minus leadIn_s to the last jet's hiding (its frag clear or egress end, plus tail_s). */
function windowOf(pb: StrikePlayback, jets: TimingJet[]): StrikeWindow {
  if (!jets.length) return { t0_s: 0, t1_s: 0 };
  return { t0_s: Math.min(...jets.map((j) => j.push_s)) - pb.options.leadIn_s, t1_s: Math.max(...jets.map((j) => j.hide_s)) };
}

/**
 * The timing at these delays (member id → TOT; any member left out, or given
 * a non-number, keeps its plan delay). Skipped members are held at theirs and
 * still count in the readout and the conflicts. Returns a new object; never
 * touches `pb`.
 *
 * The frag warning follows the playback's rule. Under 'time' it is the
 * spacing rule exactly as the editor's strip prints it. Under 'burst' the
 * blast lines come first, then the strip's cone warnings, and `blast` says
 * what could not be checked; there is no `blast` key under 'time'.
 */
export function retime(pb: StrikePlayback, delays_s?: Record<string, number>): StrikeTiming {
  const delays: Record<string, number> = Object.fromEntries(pb.members.map((m) => [m.id, tot(pb, delays_s, m.id)]));
  const jets = pb.jets.map((j) => timingJet(j, delays[j.id]));
  const planJets = pb.jets.map((j) => timingJet(j, pb.planDelays_s[j.id]));
  const rj = strikeJetsAt(pb, delays);
  const burst = pb.fragRule === 'burst' ? burstReadout(pb, delays) : undefined;
  const base = strikeReadout(rj, pb.fragRule);
  return {
    delays_s: delays,
    jets,
    window: windowOf(pb, jets),
    planWindow: windowOf(pb, planJets),
    readout: burst ? { ...base, warnings: [...burst.warnings, ...base.warnings] } : base,
    conflicts: burst ? burst.conflicts : timedConflicts(pb, rj),
    ...(burst ? { blast: { notes: burst.notes, unchecked: burst.unchecked } } : {}),
  };
}

/**
 * "Apply to plan": the delays re-based so the earliest is 0, exactly what
 * `setStrikeOffsets` (→ `rebaseTot`) leaves on the mission. Skipped members
 * count too (at the delay given, else their plan delay), since `rebaseTot`
 * re-bases over every member.
 */
export function delaysToOffsets(pb: StrikePlayback, delays_s: Record<string, number>): Record<string, number> {
  const all = pb.members.map((m) => ({ id: m.id, d: tot(pb, delays_s, m.id) }));
  if (!all.length) return {};
  const lead = Math.min(...all.map((x) => x.d));
  return Object.fromEntries(all.map((x) => [x.id, x.d - lead]));
}
