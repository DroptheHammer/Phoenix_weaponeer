import type { Mission } from '../types';

/**
 * Undo / redo for the mission. Pure functions over immutable snapshots: every
 * edit in `missionStore` already replaces the mission, so a snapshot is just
 * the old reference. The store owns the state; this owns the rules.
 */

export interface MissionHistory {
  /** Oldest first; the last entry is what Undo restores. */
  past: Mission[];
  /** Most recently undone last; the last entry is what Redo restores. */
  future: Mission[];
}

export const EMPTY_HISTORY: MissionHistory = { past: [], future: [] };

/** How many edits Undo can walk back. */
export const HISTORY_LIMIT = 50;

/** Edits to the same thing this close together are one Undo step (typing a name). */
export const COALESCE_MS = 800;

/**
 * Record that `current` is about to be replaced by an edit. `coalesce` says
 * this edit continues the previous one, so `current` is already covered by the
 * step Undo will take and nothing is pushed. Any new edit drops the redo trail.
 */
export function recordEdit(history: MissionHistory, current: Mission, coalesce: boolean): MissionHistory {
  if (coalesce && history.past.length > 0) return { past: history.past, future: [] };
  return { past: [...history.past, current].slice(-HISTORY_LIMIT), future: [] };
}

/** One step back, or `null` when there is nothing to undo. */
export function undoStep(
  history: MissionHistory,
  current: Mission,
): { history: MissionHistory; mission: Mission } | null {
  const previous = history.past[history.past.length - 1];
  if (!previous) return null;
  return {
    mission: previous,
    history: { past: history.past.slice(0, -1), future: [...history.future, current] },
  };
}

/** One step forward again, or `null` when there is nothing to redo. */
export function redoStep(
  history: MissionHistory,
  current: Mission,
): { history: MissionHistory; mission: Mission } | null {
  const next = history.future[history.future.length - 1];
  if (!next) return null;
  return {
    mission: next,
    history: { past: [...history.past, current].slice(-HISTORY_LIMIT), future: history.future.slice(0, -1) },
  };
}
