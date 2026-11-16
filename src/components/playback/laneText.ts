/**
 * The words on the timeline: what a tooltip says for a mark, a coloured
 * stretch of a band and a group of pinned marks, and the one sentence a screen
 * reader gets for a whole lane. Plain TypeScript with no React, so geo-check
 * runs it. Times are the card's own T+0:30 style.
 */
import type { LaneBand, LaneMark, SeatMarks } from '../../lib/playbackScene';
import { BURST_HATCH_KEY_TITLE, BURST_STRIPES_HANDLE_WORDS, FOOTER_OK_BURST_TITLE, footerOkBurst, type FragRule, type PlaybackPhase } from '../../lib/playback';
import { fmtStrikeTime } from '../../lib/strike';

/** What each stretch of a jet's flight is called on a band's tooltip. */
export const PHASE_WORDS: Record<PlaybackPhase, string> = {
  leadIn: 'Run-in before the IP',
  route: 'Route from the IP',
  leg: 'Leg after the action point',
  climb: 'Climb',
  pullDown: 'Pull-down',
  attack: 'Attack run',
  egress: 'Egress turn',
  egressLeg: 'Egress leg',
  extension: 'Egress, past the drawn leg',
};

/**
 * What a lane's times cell says when you rest on it, in a strike of more than one jet: the editor's own
 * line over the same figures, so the two places read alike. A lone jet's times are the plan's own and
 * need no such explaining.
 */
export const READOUT_TITLE = "times est., relative to the lead's TOT";

/** The diamond that moves a jet's time over target, by name (for a screen reader) and as a tooltip, and the box that types it. */
export const handleLabel = (seatLabel: string) => `${seatLabel} time over target`;
/** What the stripes on a lane are, said on its diamond: they show only while that jet's time is being set, so the diamond is where they can be asked about at rest. */
export const STRIPES_HANDLE_WORDS = "Stripes: times that would put it inside another jet's frag.";
/** The diamond's tooltip; with `zones` (the lane has stripes to show) it ends with what they are (`stripes`: the words of the rule the strike is warned by). */
export const handleTitle = (seatLabel: string, zones = false, stripes = STRIPES_HANDLE_WORDS) =>
  `Drag to change ${seatLabel}'s time over target (←/→ 1 s, Shift+←/→ 5 s)${zones ? ` ${stripes}` : ''}`;
/** The swatch that keys the footer's warning to the stripes on the time bar. */
export const HATCH_KEY_TITLE = "Striped: a jet is over the target inside another jet's frag (est.)";
/** The footer's line when the spacing rule finds nothing to warn of. */
export const FOOTER_OK_TIME = '✓ No frag or cone warnings at these times.';

/**
 * The words of the frag chrome that change with the rule the strike is warned by: the footer's all-clear and
 * its tooltip, the swatch's tooltip, and the sentence on a diamond that says what the lane's stripes are.
 * Written once for each rule (the blast rule's in the library with the rest of its sentences, the spacing
 * rule's here), so the view only asks. `unchecked` is the names of the weapons the blast rule had no radius
 * for: the all-clear says so rather than claim every distance was checked.
 */
export interface FragChromeWords {
  ok: string;
  /** The all-clear's tooltip; none when the line is the spacing rule's or says some weapon was not checked. */
  okTitle: string | undefined;
  keyTitle: string;
  stripesHandle: string;
}

export function fragChromeWords(rule: FragRule, unchecked: readonly string[] = []): FragChromeWords {
  return rule === 'burst'
    ? {
      ok: footerOkBurst(unchecked), okTitle: unchecked.length ? undefined : FOOTER_OK_BURST_TITLE,
      keyTitle: BURST_HATCH_KEY_TITLE, stripesHandle: BURST_STRIPES_HANDLE_WORDS,
    }
    : { ok: FOOTER_OK_TIME, okTitle: undefined, keyTitle: HATCH_KEY_TITLE, stripesHandle: STRIPES_HANDLE_WORDS };
}
export const boxLabel = (seatLabel: string) => `${seatLabel} time over target, seconds after T`;
/** Said beside seat #1's time in a strike of more than one jet: it has no handle and no box. */
export const heldTitle = (seatLabel: string) => `${seatLabel} is held still: move the other jets`;

/** A mark's tooltip: the planner's words for a marker, ours for the IP marks and the impact; "(est.)" where the time is an estimate. */
export function markTitle(m: LaneMark): string {
  const t = fmtStrikeTime(m.t_s);
  switch (m.kind) {
    case 'push':
    case 'cardPush':
      return `${m.words} ${t} (est.)`;
    case 'impact':
      return `TGT ${t}: ${m.words}${m.estimated ? ' (est.)' : ''}`;
    default:
      return `${m.kind} ${t}: ${m.words}`;
  }
}

/** A coloured stretch's tooltip: "Climb T-0:37 to T-0:22". */
export function bandTitle(b: LaneBand): string {
  return `${PHASE_WORDS[b.phase]} ${fmtStrikeTime(b.t0_s)} to ${fmtStrikeTime(b.t1_s)}`;
}

/** The tooltip of a group of marks that fall outside the time bar: which side, then each mark's own tooltip. */
export function pinnedTitle(marks: readonly LaneMark[]): string {
  if (!marks.length) return '';
  return `${marks[0].pinned === 'end' ? 'After the time bar ends: ' : 'Before the time bar starts: '}${marks.map(markTitle).join('; ')}`;
}

/** What a mark is called in a list: its letters, or "TGT" for the impact. */
const shortName = (m: LaneMark) => m.letters || 'TGT';

/**
 * The whole lane in one sentence: whose it is, the marks before the time bar
 * (named once each), each mark on it with its time, and the time over target.
 * "#1 Viper 1-1: before the time bar: IP; AP T-0:40, POP T-0:37, …, TGT T+0:00".
 */
export function laneSummary(seatLabel: string, callsign: string | undefined, sm: SeatMarks): string {
  const who = `${seatLabel}${callsign ? ` ${callsign}` : ''}: `;
  const before = [...new Set(sm.pinnedStart.map(shortName))];
  const impact = [...sm.pinnedStart, ...sm.marks, ...sm.pinnedEnd].find((m) => m.kind === 'impact');
  const parts = [
    ...sm.marks.filter((m) => m.kind !== 'impact').map((m) => `${shortName(m)} ${fmtStrikeTime(m.t_s)}`),
    ...(impact ? [`TGT ${fmtStrikeTime(impact.t_s)}`] : []),
  ];
  return `${who}${before.length ? `before the time bar: ${before.join(', ')}; ` : ''}${parts.join(', ')}`;
}
