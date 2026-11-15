/**
 * The shapes passed between the planner and the 3D playback. Types only, so
 * both builds can import this file without pulling in any playback code.
 */
import type { PlaybackInput, PlaybackSubject } from '../../lib/playback';
import type { DbWeapon, Mission } from '../../types';

/**
 * Everything playback needs, taken from the planner at the moment the Play
 * button is pressed. Playback never follows the store while it is open: Undo
 * is blocked while any dialog is up, so the snapshot cannot go stale.
 *
 * It carries the plan one of two ways. The attack editor hands over the
 * playback input it built from its drafts (`input`). The attack list hands over
 * the plan as saved and which strike or attack to fly (`fromMission`), and the
 * lazily loaded view builds the input from that.
 */
export interface PlaybackLaunch {
  /** From the attack editor: the jets built from its drafts as they stand. */
  input?: PlaybackInput;
  /**
   * From the attack list: the saved plan (without its threats: nothing in playback draws them yet, and a
   * threat the mission's author hid must not cross into the view) and the strike or attack to play.
   */
  fromMission?: { mission: Mission; subject: PlaybackSubject; weapons: DbWeapon[] };
  /** What the title plate over the 3D view says: the strike's name, or the lone jet's callsign. Left out: the input's own name. */
  title?: string;
  /** The jet to open watching: the one the editor had selected, or the attack of the list row pressed. */
  jetId?: string;
  /** Plain sentences shown beside the 3D view (the theater's projection is unverified, and so on). */
  notes: string[];
  /** Where Apply writes the times. Left out: there is nowhere to write them, and playback shows no Apply. */
  apply?: PlaybackApply;
  /**
   * What breaks a tie in time over target on the cards, for every member in seat order: its flight position,
   * then the number its attack has (or will get when saved). With it playback can say which jets the cards
   * will number differently after an Apply. Left out for the attack list's: the view works it out from the plan.
   */
  tie?: (readonly [number, number])[];
}

/** A launch from the attack editor: it always carries its jets. */
export type EditorLaunch = PlaybackLaunch & { input: PlaybackInput };

/**
 * Where Apply writes the times. Apply to strike: the editor's sliders, one time for each jet in the editor's
 * order. Apply to plan: the saved strike's attacks, each attack's time by its id; the plan changes at once.
 */
export type PlaybackApply =
  | { to: 'editor'; write(offsets: number[]): void }
  | { to: 'mission'; write(offsets: Record<string, number>): void };

export interface PlayStrikeButtonProps {
  disabled?: boolean;
  /** Tooltip. A sensible one is used when left out. */
  title?: string;
  /** How it looks: the editor's bordered button, or a small text button like a list row's Edit. */
  variant?: 'button' | 'text';
  /**
   * The editor's way: called once, when the button is pressed. Undefined means nothing could be built from
   * the plan: playback still opens and says so.
   */
  build?: () => PlaybackLaunch | undefined;
  /** The attack list's way: the strike or attack of the saved plan to play, and the weapon table. */
  fromMission?: { subject: PlaybackSubject; weapons: DbWeapon[] };
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
