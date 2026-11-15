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
  /** What the title plate over the 3D view says: the strike's name, or the lone jet's callsign. Left out: the input's name. */
  title?: string;
  /** The jet the editor had selected, so playback opens watching it. */
  jetId?: string;
  /** Plain sentences shown beside the 3D view (the theater's projection is unverified, and so on). */
  notes: string[];
  /** Where Apply writes the times. Left out: there is nowhere to write them, and playback shows no Apply. */
  apply?: PlaybackApply;
  /**
   * What breaks a tie in time over target on the cards, for every member in seat order: its flight position,
   * then the number its attack has (or will get when saved). With it playback can say which jets the cards
   * will number differently after an Apply.
   */
  tie?: (readonly [number, number])[];
}

/** Where Apply to strike writes the times: the editor's sliders, one time for each jet in the editor's order. */
export type PlaybackApply = { to: 'editor'; write(offsets: number[]): void };

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
