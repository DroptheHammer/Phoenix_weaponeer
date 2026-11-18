/**
 * The notes under the 3D view: what playback assumed, and what it could not show, said in plain words so a
 * pilot reading the picture knows how far to trust it. A jet that is not flown, a target planned off the
 * ground drawn under it, the time bar's start, the card's push time against the 3D's, what the amber stripes
 * mean, the weapons the blast check had nothing to check, and the planner's own drawing checks for whoever
 * built the plan. Pure: no three.js, no DOM; the view shows the list, folded.
 *
 * Nothing here says anything about fire-control cones: they are a property of the attack axes, which no time
 * set in playback can change, so they belong to the strike editor's strip alone. The words that follow the strike's
 * frag rule (the hatching, a jet not flown) are chosen by the rule; the blast ones are the library's, the spacing
 * rule's are here.
 *
 * Threats the mission's author hid are not in playback's data, so no note counts or hints at them.
 *
 * Keys come from where a note came from (a member's id, a target's key, a line's position), never from its
 * words: two notes may read the same, and a key must not repeat.
 */

import { BURST_HATCH_NOTE, FT_TO_M, burstSkipNote, notFlownNote, seatList, type FragRule, type StrikePlayback, type StrikeTiming } from '../playback';
import { RUN_LEAD_S } from './actionPoints';
import type { TargetGap } from './targets';

export type NoteTone = 'warn' | 'info';

export interface Note {
  key: string;
  /** warn: something the pilot should know the picture leaves out or gets wrong; info: how to read it. */
  tone: NoteTone;
  text: string;
  /** The planner's drawing checks come last, under their own heading (DRAWING_CHECKS_HEAD). */
  group?: 'drawing';
}

/** What the notes are built from; `noteFactsFrom` makes it from a built playback. */
export interface NoteFacts {
  /** The rule the strike is warned by: it picks the words of the notes about the frag warnings. */
  rule: FragRule;
  /** The members the playback cannot fly. */
  skipped: readonly { id: string; label: string; callsign?: string; reason: string }[];
  /** The planner's own drawing checks, line by line, with the seat each belongs to. */
  trackWarnings: readonly { id: string; label: string; text: string }[];
  /** The targets planned off the ground drawn under them. */
  gaps: readonly TargetGap[];
  /** Some flown jet has a push time on the card, so the lanes carry two IP marks. */
  hasCardPush: boolean;
  /** The time bar or some lane has amber stripes to explain. */
  hatch: boolean;
  /** The blast check's gray lines: weapons with no radius on file. */
  blast: readonly string[];
  /** What the last Apply said, a sentence a line; empty until one has, and again once the times change. */
  applied: readonly string[];
}

/** The line over the planner's drawing checks. */
export const DRAWING_CHECKS_HEAD = 'Drawing checks, for whoever built the plan:';

/** Always shown: where the time bar starts and how to widen it. */
export const START_NOTE = `The time bar starts ${RUN_LEAD_S} s before the first jet's first action. Show › Whole run-in starts it before the IP.`;

/** Shown when a jet has a push time on the card. */
export const PUSH_NOTE =
  "Push IP is the card's time (the outlined IP mark on the lanes): fly that. The 3D flies the whole profile, so it crosses the IP a few seconds off (the filled IP mark).";

/** Always shown: what altitude "AGL" means in the labels and on the cards. */
export const AGL_NOTE = "Altitudes are the planner's: AGL is above each jet's own target, not the ground under it.";

/** What the amber stripes are, for a strike warned by spacing in time. (A strike warned by blast radius has the library's own.) */
export const HATCH_NOTE_TIME = "Hatched amber on the time bar and the lanes: times when a jet would be over the target inside another jet's frag (est.).";

/** The hatching's note in the words of the rule the strike is warned by. */
export const hatchNote = (rule: FragRule): string => (rule === 'burst' ? BURST_HATCH_NOTE : HATCH_NOTE_TIME);

/** A member that is not flown, for a strike warned by spacing in time: its time still counts there. */
export const skipNoteTime = (label: string, callsign: string | undefined, reason: string): string =>
  `${label}${callsign ? ` ${callsign}` : ''} isn't flown in 3D. ${reason} It still counts in the times and frag warnings.`;

/** A member that is not flown, in the words of the rule the strike is warned by. */
export const skipNote = (rule: FragRule, label: string, callsign: string | undefined, reason: string): string =>
  rule === 'burst' ? burstSkipNote(label, callsign, reason) : skipNoteTime(label, callsign, reason);

/**
 * A target planned off the ground drawn under it. Above: its bombs land at the planned height, on the red post over its
 * ring. Below: they land under the drawn ground. The height difference is read to the nearest 10 ft.
 */
export function gapNoteText(g: TargetGap): string {
  const above = g.gap_m > 0;
  const ft = (Math.round(Math.abs(g.gap_m) / FT_TO_M / 10) * 10).toLocaleString('en-US');
  const who = `The target of ${seatList(g.seatLabels)} (${g.name}) is planned ${ft} ft ${above ? 'above' : 'below'} the ground drawn there.`;
  return `${who} ${above ? 'Its bombs land at the planned height, on the red post over its ring.' : 'Its bombs land under the drawn ground.'}`;
}

/**
 * The notes, in the order they are shown: what Apply just did, then what the picture leaves out (a jet not flown, a target
 * off the ground, a weapon the blast check could not check), then how to read it (the stripes, the push time, the start of
 * the bar, the altitudes), and last the planner's drawing checks.
 */
export function buildNotes(f: NoteFacts): Note[] {
  const notes: Note[] = [];
  f.applied.forEach((text, i) => notes.push({ key: `apply-${i}`, tone: 'info', text }));
  for (const s of f.skipped) notes.push({ key: `skip-${s.id}`, tone: 'warn', text: skipNote(f.rule, s.label, s.callsign, s.reason) });
  for (const g of f.gaps) notes.push({ key: `gap-${g.key}`, tone: 'warn', text: gapNoteText(g) });
  f.blast.forEach((text, i) => notes.push({ key: `blast-${i}`, tone: 'info', text }));
  if (f.hatch) notes.push({ key: 'hatch', tone: 'info', text: hatchNote(f.rule) });
  if (f.hasCardPush) notes.push({ key: 'push', tone: 'info', text: PUSH_NOTE });
  notes.push({ key: 'start', tone: 'info', text: START_NOTE });
  notes.push({ key: 'agl', tone: 'info', text: AGL_NOTE });
  // The drawing checks are keyed by the jet's id and the line's place in its own list: two jets may give one line, and one jet two equal lines.
  const seen = new Map<string, number>();
  for (const w of f.trackWarnings) {
    const i = seen.get(w.id) ?? 0;
    seen.set(w.id, i + 1);
    notes.push({ key: `warn-${w.id}-${i}`, tone: 'info', text: `${w.label}: ${w.text}`, group: 'drawing' });
  }
  return notes;
}

/**
 * The facts for a built playback at the times as they stand. `gaps` is what the scene reports of the ground drawn under
 * the targets; `zones` is how many stripes the lanes have to show (the time bar's are the timing's conflicts); `applied`
 * is the last Apply's lines.
 *
 * Under the blast rule the library's gray lines include one for each member not flown; the note for that member already says
 * so (and why), so that line is left out here rather than say it twice.
 */
export function noteFactsFrom(
  pb: StrikePlayback,
  timing: StrikeTiming,
  extra: { gaps?: readonly TargetGap[]; zones?: number; applied?: readonly string[] } = {},
): NoteFacts {
  const notFlown = new Set(pb.skipped.map((s) => notFlownNote(s.label)));
  return {
    rule: pb.fragRule,
    skipped: pb.skipped.map((s) => ({ id: s.id, label: s.label, reason: s.reason })),
    trackWarnings: pb.jets.flatMap((j) => j.warnings.map((text) => ({ id: j.id, label: j.label, text }))),
    gaps: extra.gaps ?? [],
    hasCardPush: pb.members.some((m, seat) => m.jet !== undefined && timing.readout.pushes[seat]?.push_s !== undefined),
    hatch: timing.conflicts.length > 0 || (extra.zones ?? 0) > 0,
    blast: (timing.blast?.notes ?? []).filter((n) => !notFlown.has(n)),
    applied: extra.applied ?? [],
  };
}
