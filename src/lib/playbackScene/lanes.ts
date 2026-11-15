/**
 * What the timeline under the 3D view draws, as numbers: each jet's lane is a
 * band cut into the planner's phase colours (route, climb, pull-down, attack,
 * egress) with a lettered chip at every point where the pilot acts, the same
 * letters the planner puts on the map and the card. Pure and in strike time;
 * the colours and dashes themselves are the component's, because the planner's
 * palette lives outside this folder (the band says which phase it is, by key).
 *
 * The lane's time axis is the clock's range. A mark that falls before the
 * axis starts (the IP crossing, with the default range) has no place on it: it
 * is "pinned" at the left edge in one small group instead of being lost.
 *
 * A jet's time over target is moved on its lane (a diamond to drag, keys, a
 * box to type in). While one is being dragged the axis keeps the scale it had
 * when the drag began, so the lane does not move under the pointer; the stripes
 * of a jet's danger zones show where its time would put it inside another
 * jet's frag.
 */

import {
  PHASES, PHASE_STYLE, type DangerZone, type PhaseStyle, type PlaybackPhase, type StrikePlayback, type StrikeTiming, type TimedConflict,
} from '../playback';
import type { ActionKind, MarkerMoment } from './actionPoints';
import { CHIP_GAP_PX, chipWidth } from './laneStyle';

/** A stretch of the strike clock: the same shape as the library's window. */
export interface Axis {
  t0_s: number;
  t1_s: number;
}

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);

/** Where strike time t sits along the axis, 0 at its start and 1 at its end, never outside. */
export function axisFraction(axis: Axis, t_s: number): number {
  const span = axis.t1_s - axis.t0_s;
  return span > 0 ? clamp01((t_s - axis.t0_s) / span) : 0;
}

/** The strike time at fraction f along the axis (f held to 0…1), rounded to a multiple of step_s. */
export function axisTime(axis: Axis, f: number, step_s = 1): number {
  const t = axis.t0_s + clamp01(f) * (axis.t1_s - axis.t0_s);
  return step_s > 0 ? Math.round(t / step_s) * step_s : t;
}

/**
 * The axis the lanes and the time bar draw on. While a time over target is being dragged it is the axis the
 * drag began on (the very object, so nothing downstream sees it change); otherwise the live one, which follows
 * the earliest first action. With nothing frozen yet it is the live one whatever is asked.
 */
export function laneAxis(frozen: Axis | undefined, live: Axis, dragging: boolean): Axis {
  return dragging && frozen ? frozen : live;
}

/**
 * What a key does to a time over target, in seconds, or undefined for a key the handle does not take. ←
 * and ↓ take a second off, → and ↑ add one, with Shift five; Page Down and Page Up take and add five.
 * Home and End are left alone.
 */
export function handleKeyStep(key: string, shift: boolean): number | undefined {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return shift ? -5 : -1;
    case 'ArrowRight':
    case 'ArrowUp':
      return shift ? 5 : 1;
    case 'PageDown':
      return -5;
    case 'PageUp':
      return 5;
    default:
      return undefined;
  }
}

// ─── Marks ────────────────────────────────────────────────────────────────────

/** The two IP marks, the planner's action points, and the impact. */
export type LaneMarkKind = 'push' | 'cardPush' | ActionKind | 'impact';

export interface LaneMark {
  /** `${memberId}:${kind}`: each kind appears at most once on a jet. */
  key: string;
  /** Index into the playback's members: the seat. */
  seat: number;
  kind: LaneMarkKind;
  t_s: number;
  /** What the chip says: 'IP' for both IP marks, the marker's kind ('POP'), nothing for the impact. */
  letters: string;
  /** The planner's own words for the mark (a marker's lines, joined), or ours for the IP marks and the impact. */
  words: string;
  /** Its time or place is an estimate. */
  estimated: boolean;
  /** Before the axis starts, or after it ends: it sits in the lane's pinned group. */
  pinned: 'start' | 'end' | undefined;
}

export interface SeatMarks {
  /** On the axis, by time. */
  marks: LaneMark[];
  /** Before the axis starts, by time. */
  pinnedStart: LaneMark[];
  /** After the axis ends, by time. */
  pinnedEnd: LaneMark[];
}

/**
 * Every flown seat's marks, indexed by seat (a skipped seat has none). Each is
 * the jet's IP crossing as the 3D flies it, the IP push the card prints, one
 * mark per planner marker at the time the jet reaches it, and the impact.
 * `moments(k)` is jet k's marker moments (the lane takes them from the same
 * place the callouts do, so the words cannot differ).
 */
export function laneMarks(pb: StrikePlayback, timing: StrikeTiming, axis: Axis, moments: (jet: number) => readonly MarkerMoment[]): SeatMarks[] {
  return pb.members.map((m, seat) => {
    const out: SeatMarks = { marks: [], pinnedStart: [], pinnedEnd: [] };
    if (m.jet === undefined) return out;
    const k = m.jet;
    const tj = timing.jets[k];
    const all: LaneMark[] = [];
    const add = (kind: LaneMarkKind, t_s: number, letters: string, words: string, estimated: boolean) => {
      const pinned = t_s < axis.t0_s ? 'start' : t_s > axis.t1_s ? 'end' : undefined;
      all.push({ key: `${m.id}:${kind}`, seat, kind, t_s, letters, words, estimated, pinned });
    };
    add('push', tj.push_s, 'IP', 'IP crossing in 3D', true);
    const card = timing.readout.pushes[seat]?.push_s;
    if (card !== undefined) add('cardPush', card, 'IP', 'Push IP on the card', true);
    for (const mm of moments(k)) add(mm.kind, mm.tau_s + tj.shift_s, mm.kind, mm.lines.join(' · '), false);
    add('impact', tj.impact_s, '', 'impact, time over target', pb.jets[k].events.find((e) => e.kind === 'impact')?.estimated ?? false);
    all.sort((a, b) => a.t_s - b.t_s);
    for (const mk of all) (mk.pinned === 'start' ? out.pinnedStart : mk.pinned === 'end' ? out.pinnedEnd : out.marks).push(mk);
    return out;
  });
}

// ─── Bands ────────────────────────────────────────────────────────────────────

/** The planner's line-style key a phase is drawn in (route, leg, climb, pullDown, attack, egress, egressLeg). */
export type PhaseKey = PhaseStyle[PlaybackPhase];

export interface LaneBand {
  /** `${memberId}:${first sample of the run}`, or `${memberId}:lead` for the run-in before the IP. */
  key: string;
  phase: PlaybackPhase;
  style: PhaseKey;
  t0_s: number;
  t1_s: number;
  /** The same two times as fractions along the axis. */
  f0: number;
  f1: number;
}

/**
 * Each flown seat's stretches of one phase, in strike time, clipped to the
 * axis (a stretch wholly outside it is left out), from the jet's first visible
 * moment to its last: the run-in before the IP (the display's lead-in), then
 * the plan's own phase, sample by sample. Indexed by seat; a skipped seat has none.
 */
export function laneBands(pb: StrikePlayback, timing: StrikeTiming, axis: Axis): LaneBand[][] {
  return pb.members.map((m) => {
    const out: LaneBand[] = [];
    if (m.jet === undefined) return out;
    const track = pb.jets[m.jet];
    const shift = timing.jets[m.jet].shift_s;
    const S = track.samples;
    const add = (key: string, phase: PlaybackPhase, from_s: number, to_s: number) => {
      const t0_s = Math.max(from_s, axis.t0_s);
      const t1_s = Math.min(to_s, axis.t1_s);
      if (!(t1_s > t0_s)) return;
      out.push({ key: `${m.id}:${key}`, phase, style: PHASE_STYLE[phase], t0_s, t1_s, f0: axisFraction(axis, t0_s), f1: axisFraction(axis, t1_s) });
    };
    add('lead', 'leadIn', shift - track.display.leadIn.capTau_s, shift);
    // A sample's phase is the stretch from it to the next, so a run of equal phases ends at the sample where the next one starts.
    for (let i = 0; i < S.n - 1; ) {
      let j = i + 1;
      while (j < S.n - 1 && S.phase[j] === S.phase[i]) j++;
      add(String(i), PHASES[S.phase[i]], S.tau_s[i] + shift, S.tau_s[j] + shift);
      i = j;
    }
    return out;
  });
}

// ─── Frag conflicts ───────────────────────────────────────────────────────────

/** A stretch of the strike clock to hatch on the time bar. */
export interface Band {
  /** `${first member id}-${second member id}`: a pair of members is one conflict at most. */
  key: string;
  t0_s: number;
  t1_s: number;
  /** What the stretch means, in words (the bar's stripes take no pointer, so nothing shows it as a tooltip). */
  title: string;
}

/**
 * One band per frag conflict the readout warns of: from the moment the second
 * jet's bombs land to the moment the first jet's frag has cleared, exactly the
 * library's own t0 and t1. A jet that is skipped still has its band, as it
 * still has its warning.
 */
export function conflictBands(conflicts: readonly TimedConflict[]): Band[] {
  return conflicts.map((c) => ({
    key: `${c.firstId}-${c.secondId}`,
    t0_s: c.t0_s,
    t1_s: c.t1_s,
    title: `⚠ ${c.second} over the target inside ${c.first}'s frag (est.)`,
  }));
}

/**
 * One stripe on a jet's own lane for each other member it would be in a frag conflict with: the times over
 * target (strike time) at which it would warn against that member, from the library's own danger zone.
 * `meLabel` is this jet's seat label, `seatLabels` every member's, by seat. The lane's stripes take no
 * pointer, so the words are for a screen reader and for a seat's warning mark.
 */
export function zoneBands(zones: readonly DangerZone[], meLabel: string, seatLabels: readonly string[]): Band[] {
  return zones.map((z) => ({
    key: z.againstId,
    t0_s: z.from_s,
    t1_s: z.to_s,
    title: `Frag conflict with ${seatLabels[z.againstMember]} if ${meLabel} is over the target here (est.)`,
  }));
}

/** Is this seat (a member's place, as the readout counts them) the first or the second of any frag conflict? Flown or not. */
export function seatInConflict(conflicts: readonly TimedConflict[], seat: number): boolean {
  return conflicts.some((c) => c.firstIndex === seat || c.secondIndex === seat);
}

/** The time bar's own sentence for each conflict the seat is in, joined, for the warning mark beside its time; undefined when it is in none. */
export function seatConflictTitle(conflicts: readonly TimedConflict[], seat: number): string | undefined {
  const mine = conflicts.filter((c) => c.firstIndex === seat || c.secondIndex === seat);
  return mine.length ? conflictBands(mine).map((b) => b.title).join(' · ') : undefined;
}

// ─── Chips ────────────────────────────────────────────────────────────────────

/**
 * Which row each chip goes on, so no two touch: 0 above the band, 1 below it,
 * -1 when neither has room (the caller draws a small dot). Greedy in time order,
 * the upper row first, so the same input always gives the same answer. The
 * upper row keeps its first `reservedLeft_px` free for the group of marks
 * pinned at the left edge. `x_px` is each chip's centre; `gap_px` the least
 * clear space between two chips in a row.
 */
export function placeChips(x_px: readonly number[], width_px: readonly number[], gap_px: number, reservedLeft_px: number): Int8Array {
  const out = new Int8Array(x_px.length).fill(-1);
  const order = x_px.map((_, i) => i).sort((a, b) => x_px[a] - x_px[b] || a - b);
  let right0 = -Infinity;
  let right1 = -Infinity;
  for (const i of order) {
    const left = x_px[i] - width_px[i] / 2;
    const right = x_px[i] + width_px[i] / 2;
    if (left >= reservedLeft_px && left - right0 >= gap_px) {
      out[i] = 0;
      right0 = right;
    } else if (left - right1 >= gap_px) {
      out[i] = 1;
      right1 = right;
    }
  }
  return out;
}

/** The "‹" that opens a lane's pinned group is this wide; the group's one chip follows it. */
export const PIN_MARK_PX = 6;

/** The small group at a lane's left edge for the marks that fall before the axis starts. */
export interface PinnedGroup {
  /** "IP" when every pinned mark is one of the two IP marks, else how many marks are pinned. */
  letters: string;
  /** The chip says IP (and is not just a count). */
  ip: boolean;
  /** The 3D's own IP crossing is among them: the IP chip is filled; else it is outlined (the card's push alone). */
  filled: boolean;
  /** How much of the upper chip row the group takes from the left edge, gap included: chips keep clear of it. */
  reservedLeft_px: number;
}

/** The lane's pinned group, or undefined when nothing is pinned (the whole upper row is then free). */
export function pinnedGroup(sm: SeatMarks): PinnedGroup | undefined {
  const p = sm.pinnedStart;
  if (!p.length) return undefined;
  const ip = p.every((m) => m.kind === 'push' || m.kind === 'cardPush');
  const letters = ip ? 'IP' : String(p.length);
  return { letters, ip, filled: p.some((m) => m.kind === 'push'), reservedLeft_px: PIN_MARK_PX + chipWidth(letters) + CHIP_GAP_PX };
}

export interface PlacedChip {
  mark: LaneMark;
  width_px: number;
  /** The chip's centre, px from the axis box's left edge. */
  x_px: number;
  /** 0 above the band, 1 below it, -1 no room (a dot). */
  row: number;
}

/**
 * Every chip of a lane for an axis box `width_px` wide: each mark but the
 * impact (that is a diamond on the band), centred on its time but held wholly
 * inside the box, on the row `placeChips` gives it.
 */
export function laneChips(sm: SeatMarks, axis: Axis, width_px: number): PlacedChip[] {
  const chips = sm.marks.filter((m) => m.kind !== 'impact');
  const w = chips.map((m) => chipWidth(m.letters));
  const x = chips.map((m, i) => Math.min(Math.max(axisFraction(axis, m.t_s) * width_px, w[i] / 2), Math.max(width_px - w[i] / 2, w[i] / 2)));
  const rows = placeChips(x, w, CHIP_GAP_PX, pinnedGroup(sm)?.reservedLeft_px ?? 0);
  return chips.map((mark, i) => ({ mark, width_px: w[i], x_px: x[i], row: rows[i] }));
}
