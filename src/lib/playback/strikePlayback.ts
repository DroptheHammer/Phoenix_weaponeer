/**
 * The strike: every jet's track, built once, in the input's order, in one
 * frame centred on the lead's target. Timing is a separate object (timing.ts),
 * so dragging a delay never rebuilds geometry.
 *
 * Every member is kept in `members`, flown or skipped, in the readout's order:
 * `strikeReadout` needs only a skipped jet's weapon and TOT to warn about it,
 * and the editor's strip does, so the playback's chips and zones must too.
 */

import { attackSpeedOf } from '../strike';
import { buildJetTrack } from './jetTrack';
import { makeLocalFrame } from './frame';
import type { JetTrack, PlaybackInput, PlaybackMember, PlaybackOptions, SkippedJet, StrikePlayback } from './types';

export const DEFAULT_OPTIONS: Required<PlaybackOptions> = { leadIn_s: 30, tail_s: 10, sampleDs_nm: 0.02, maxLeadIn_nm: 20, smooth_s: 2, formationSpacing_nm: 0.5 };

const memberOf = (s: SkippedJet): PlaybackMember => ({ id: s.id, label: s.label, jet: undefined, weapon: s.weapon, picture: s.picture, speed_ktas: s.speed_ktas });

export function buildStrikePlayback(input: PlaybackInput, options: PlaybackOptions = {}): StrikePlayback {
  const opts: Required<PlaybackOptions> = { ...DEFAULT_OPTIONS, ...options };
  const lead = input.jets[0];
  const frame = makeLocalFrame(lead?.target.coordinates ?? { lat: 0, lon: 0 }, lead?.target.elevation_ft ?? 0);
  const pre = input.skipped ?? [];
  const total = input.jets.length + pre.length;

  // The members' places: each pre-skipped jet at its `order` (when it is a free
  // place), the input's jets in order in the places left, any pre-skipped jet
  // without a usable `order` after them.
  const slots: ({ member: PlaybackMember; skipped?: SkippedJet } | undefined)[] = new Array(total).fill(undefined);
  const late: SkippedJet[] = [];
  for (const s of pre) {
    const k = s.order;
    if (k != null && Number.isInteger(k) && k >= 0 && k < total && !slots[k]) slots[k] = { member: memberOf(s), skipped: s };
    else late.push(s);
  }
  let free = 0;
  const nextFree = () => {
    while (slots[free]) free++;
    return free;
  };

  const jets: JetTrack[] = [];
  const planDelays_s: Record<string, number> = {};
  for (const jet of input.jets) {
    const built = buildJetTrack(jet, frame, opts);
    const place = nextFree();
    if ('skipped' in built) {
      const s: SkippedJet = {
        id: jet.id, label: jet.label, reason: built.skipped, totOffset_s: jet.totOffset_s,
        weapon: jet.weapon, picture: built.picture, speed_ktas: attackSpeedOf(jet.attack.profile),
      };
      slots[place] = { member: memberOf(s), skipped: s };
      continue;
    }
    slots[place] = {
      member: { id: built.id, label: built.label, jet: jets.length, weapon: built.weapon, picture: built.picture, speed_ktas: built.cardSpeed_kt },
    };
    jets.push(built);
  }
  for (const s of late) slots[nextFree()] = { member: memberOf(s), skipped: s };

  const members: PlaybackMember[] = [];
  const skipped: SkippedJet[] = [];
  slots.forEach((slot, k) => {
    if (!slot) return;
    members.push(slot.member);
    if (slot.skipped) skipped.push({ ...slot.skipped, order: k });
  });
  for (const jet of input.jets) planDelays_s[jet.id] = jet.totOffset_s;
  for (const s of pre) planDelays_s[s.id] = s.totOffset_s;

  const warnings: string[] = [];
  if (!lead) warnings.push('Nothing to play: no jets.');
  else if (!jets.length) warnings.push('No jet in this strike can be played.');
  return { name: input.name, strikeId: input.strikeId, frame, jets, members, planDelays_s, skipped, options: opts, warnings };
}
