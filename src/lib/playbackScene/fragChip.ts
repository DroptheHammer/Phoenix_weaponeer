/**
 * The warning chip over the 3D picture, as numbers: which of the strike's
 * frag warnings the playhead is on, what the chip says and its tooltip, and
 * the stretch of strike time the playhead swept since the screen last looked.
 *
 * A warning's stretch of the clock is its band on the time bar, [t0, t1). By
 * blast radius that is the second a bomb went off with another jet inside its
 * radius (the rule itself is the instant; the second gives the chip and the
 * stripe something to show); on a strike warned by spacing in time it is the
 * stretch the second jet is over the target inside the first's frag.
 *
 * The screen looks at the clock about 12 times a second. At 16× that is about
 * 1.3 s of strike time a look, longer than a blast warning's one second, so a
 * warning can fall wholly between two looks. The chip therefore shows what the
 * playhead is on now and also every warning it swept since the last look while
 * playing, and the view keeps a chip it has shown for CHIP_HOLD_MS of wall time
 * so it can be read at any speed. A seek is not a sweep: jumping over warnings
 * does not flash them.
 *
 * Finding the warnings allocates nothing (the indices go into an array the
 * caller keeps); the words are made only when the screen looks.
 */

import { burstChipText, isBurstRow, type ConflictRow } from '../playback';
import { spacingConflictTitle } from './lanes';
import type { ClockSnapshot } from './playClock';

/** How long, in wall time, a chip once shown stays up: long enough to read one that the playhead passed in a moment. */
export const CHIP_HOLD_MS = 1200;

/** An Int8Array holds indices up to 127: a strike with more warnings than that shows the first 128 only. */
const MAX_INDEX = 127;

const holds = (c: ConflictRow, t_s: number) => c.t0_s <= t_s && t_s < c.t1_s;
/** The band [t0, t1) and the swept stretch (from, to] have a moment in common. An empty band never does. */
const meets = (c: ConflictRow, from_s: number, to_s: number) => c.t0_s < c.t1_s && c.t0_s <= to_s && c.t1_s > from_s;

/** The warnings whose band holds strike time t (t0 ≤ t < t1), their indices into `out` in order; returns how many. */
export function activeConflicts(conflicts: readonly ConflictRow[], t_s: number, out: Int8Array): number {
  let n = 0;
  for (let i = 0; i < conflicts.length && i <= MAX_INDEX && n < out.length; i++) if (holds(conflicts[i], t_s)) out[n++] = i;
  return n;
}

/** The warnings whose band [t0, t1) meets the swept stretch (from_s, to_s], their indices into `out` in order; returns how many. */
export function conflictsCrossed(conflicts: readonly ConflictRow[], from_s: number, to_s: number, out: Int8Array): number {
  let n = 0;
  for (let i = 0; i < conflicts.length && i <= MAX_INDEX && n < out.length; i++) if (meets(conflicts[i], from_s, to_s)) out[n++] = i;
  return n;
}

/** What the chip names now: every warning the playhead is on or swept over (`span`, if any), each once, in order; returns how many. */
export function chipConflicts(conflicts: readonly ConflictRow[], t_s: number, span: { from_s: number; to_s: number } | undefined, out: Int8Array): number {
  let n = 0;
  for (let i = 0; i < conflicts.length && i <= MAX_INDEX && n < out.length; i++) {
    const c = conflicts[i];
    if (holds(c, t_s) || (span !== undefined && meets(c, span.from_s, span.to_s))) out[n++] = i;
  }
  return n;
}

/**
 * The strike time the playhead swept since the last snapshot, or undefined. Only while it was playing, and only
 * through a tick (the same version: ticks do not bump it) or through the one change that stops it, a pause or the
 * end (the version up by one, no longer playing). A seek, or a change of speed or range, bumps the version while
 * playing and sweeps nothing; so do two changes that reach the screen together (a pause and a seek). Backwards,
 * or standing still, sweeps nothing.
 */
export function chipSpan(prev: ClockSnapshot | undefined, snap: ClockSnapshot): { from_s: number; to_s: number } | undefined {
  if (!prev || !prev.playing || !(snap.t > prev.t)) return undefined;
  const ticked = snap.version === prev.version;
  const stopped = !snap.playing && snap.version === prev.version + 1;
  return ticked || stopped ? { from_s: prev.t, to_s: snap.t } : undefined;
}

/** What the chip says: the first warning named ("⚠ #2 inside #1's blast radius (est.)", or the spacing rule's words), then " (+1 more)" when there are more. */
export function chipText(conflicts: readonly ConflictRow[], idx: Int8Array, n: number): string | undefined {
  if (n < 1) return undefined;
  const c = conflicts[idx[0]];
  const words = isBurstRow(c) ? burstChipText(c) : spacingConflictTitle(c);
  return n > 1 ? `${words} (+${n - 1} more)` : words;
}

/**
 * The chip's tooltip: the readout's warning for each warning it names, joined. The readout writes one warning per
 * conflict first, in the conflicts' order (cone warnings after them), so conflict i is warning i.
 */
export function chipTitle(warnings: readonly string[], idx: Int8Array, n: number): string | undefined {
  if (n < 1) return undefined;
  let s = '';
  for (let k = 0; k < n; k++) {
    const w = warnings[idx[k]];
    if (w !== undefined) s += (s ? ' · ' : '') + w;
  }
  return s || undefined;
}
