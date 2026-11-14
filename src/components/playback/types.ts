/**
 * The shapes passed between the planner and the 3D playback. Types only, so
 * both builds can import this file without pulling in any playback code.
 */
import type { PlaybackInput } from '../../lib/playback';

/**
 * Everything playback needs, taken from the planner at the moment the Play
 * button is pressed. Playback never follows the store while it is open: Undo
 * is blocked while any dialog is up, so the snapshot cannot go stale.
 */
export interface PlaybackLaunch {
  input: PlaybackInput;
  /** The jet the editor had selected, so playback opens on it. */
  jetId?: string;
  /**
   * The seat whose colour the jet is drawn in (0 = #1), the editor's own
   * index into JET_COLORS: the 3D view flies the selected jet alone, so its
   * place in the playback is always 0, but it must keep the colour the
   * editor's map and jet strip give it. Left out: the playback order.
   */
  colorIndex?: number;
  /** Plain sentences shown beside the 3D view (the theater's projection is unverified, and so on). */
  notes: string[];
}

export interface PlayStrikeButtonProps {
  disabled?: boolean;
  /** Tooltip. A sensible one is used when left out. */
  title?: string;
  /**
   * Called once, when the button is pressed. Undefined means nothing could be
   * built from the plan: playback still opens and says so.
   */
  build: () => PlaybackLaunch | undefined;
}

/** What the lazily loaded view is given. */
export interface PlaybackViewProps {
  launch: PlaybackLaunch | undefined;
  onClose: () => void;
  /**
   * The view hands over its play/pause toggle when it mounts, and null when
   * it unmounts. The overlay calls it when Space is pressed.
   */
  bindTogglePlay: (toggle: (() => void) | null) => void;
}
