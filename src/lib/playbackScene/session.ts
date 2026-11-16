/**
 * What the open playback remembers while it is open: which jet is watched,
 * the camera in use, what the Show menu has chosen, and the time over target
 * of every member of the strike (the times the sliders will move, and what
 * Reset and Apply start from). A pure reducer: nothing here is saved, and it
 * dies with the playback.
 *
 * Seats are indexes into the strike's members, skipped ones included, so a
 * seat number is the same member as on the card; a jet is an index into the
 * flown jets. This file speaks only seats.
 */

import type { StrikePlayback } from '../playback';
import { toMs } from './apply';
import type { CameraMode } from './cameraMath';
import { initShow, showReducer, type ShowAction, type ShowState } from './show';

/** A camera, or the card's side view over the picture. */
export type ViewMode = CameraMode | 'side';

/** What the playback says after an Apply, until the next change of times. */
export interface ApplyStatus {
  to: 'editor' | 'mission';
  /** Members whose card number changes, each worded for the screen ("#3 Viper 1-3 as #2"). */
  renumbered: readonly string[];
}

export interface Session {
  /** Every member's id, in seat order. */
  readonly memberIds: readonly string[];
  /** The seats that fly (not skipped). */
  readonly flownSeats: readonly number[];
  /** Seat #1's id: it has no handle, the others are timed against it. */
  readonly locked: string | undefined;
  /** What Reset goes back to: the times playback opened with, or the last applied. */
  readonly plan_s: Readonly<Record<string, number>>;
  /** Every member's time over target on the strike clock, now. */
  readonly delays_s: Readonly<Record<string, number>>;
  readonly mode: ViewMode;
  /** A flown seat: the jet the cameras follow and the colour code is on. */
  readonly watched: number;
  readonly show: ShowState;
  /** A time is being dragged: the time bar and the lanes keep their scale until it is let go. */
  readonly dragging: boolean;
  readonly status?: ApplyStatus;
}

export type SessionAction =
  | { type: 'delay'; id: string; value_s: number }
  | { type: 'drag'; on: boolean }
  | { type: 'reset' }
  | { type: 'applied'; to: 'editor' | 'mission'; shift_s: number; renumbered: readonly string[] }
  | { type: 'mode'; mode: ViewMode }
  | { type: 'watch'; seat: number }
  | { type: 'show'; a: ShowAction };

/**
 * The session at open. `watchId` is the member to watch (the editor's selected
 * jet): its seat when it flies, else the first flown seat, else seat 0. The
 * camera opens in Chase unless the caller says otherwise (it asks `openingMode`
 * first: a watched jet not yet in the picture opens at Home).
 */
export function initSession(pb: StrikePlayback, watchId?: string, opts: { show?: ShowState; mode?: ViewMode } = {}): Session {
  const memberIds = pb.members.map((m) => m.id);
  const flownSeats = pb.members.flatMap((m, seat) => (m.jet !== undefined ? [seat] : []));
  const chosen = watchId === undefined ? -1 : pb.members.findIndex((m) => m.id === watchId && m.jet !== undefined);
  // Every member has a time, so the maps are complete: a skipped one's counts too.
  const times = () => Object.fromEntries(memberIds.map((id) => [id, pb.planDelays_s[id] ?? 0]));
  return {
    memberIds, flownSeats, locked: memberIds[0],
    plan_s: times(), delays_s: times(),
    mode: opts.mode ?? 'chase',
    watched: chosen >= 0 ? chosen : (flownSeats[0] ?? 0),
    show: opts.show ?? initShow(),
    dragging: false,
  };
}

/**
 * Are the times other than the ones Reset goes back to? By value, so a time dragged away and back is clean, and to
 * the thousandth of a second Apply writes: a difference smaller than that would write the plan's own times again,
 * so it offers no Apply (and no Undo step for nothing).
 */
export function isDirty(s: Session): boolean {
  return s.memberIds.some((id) => toMs(s.delays_s[id]) !== toMs(s.plan_s[id]));
}

/** Any time other than the plan's at all, however little: what Reset puts back. */
const anyMoved = (s: Session) => s.memberIds.some((id) => s.delays_s[id] !== s.plan_s[id]);

/**
 * The next session. Returns the same object when nothing changes: a time for
 * seat #1 or an unknown member, a time that is not a number or the one it
 * already is, a seat that does not fly, a choice already made.
 */
export function sessionReducer(s: Session, a: SessionAction): Session {
  switch (a.type) {
    case 'delay':
      // A skipped member's time is accepted: it still counts in the times, and in the spacing rule's frag warnings
      // (the blast rule cannot check a jet that is not flown, and says so).
      if (a.id === s.locked || !s.memberIds.includes(a.id) || !Number.isFinite(a.value_s) || a.value_s === s.delays_s[a.id]) return s;
      return { ...s, delays_s: { ...s.delays_s, [a.id]: a.value_s }, status: undefined };
    case 'drag':
      return a.on === s.dragging ? s : { ...s, dragging: a.on };
    case 'reset':
      return anyMoved(s) ? { ...s, delays_s: { ...s.plan_s }, status: undefined } : s;
    case 'applied': {
      // The strike's clock is re-based on whoever is first: every time moves by the same amount (a shift that is not a number moves none).
      const shift = Number.isFinite(a.shift_s) ? a.shift_s : 0;
      const moved = (m: Readonly<Record<string, number>>) => Object.fromEntries(s.memberIds.map((id) => [id, m[id] - shift]));
      return { ...s, plan_s: moved(s.delays_s), delays_s: moved(s.delays_s), status: { to: a.to, renumbered: a.renumbered } };
    }
    case 'mode':
      return a.mode === s.mode ? s : { ...s, mode: a.mode };
    case 'watch':
      return !s.flownSeats.includes(a.seat) || a.seat === s.watched ? s : { ...s, watched: a.seat };
    case 'show': {
      const show = showReducer(s.show, a.a);
      return show === s.show ? s : { ...s, show };
    }
    default:
      return s;
  }
}
