/**
 * Where a jet's attack starts, and the moments along it that carry the
 * planner's words. Pure: jet time throughout (seconds after the jet crosses
 * its IP), read straight off the track the playback library built, so it
 * never depends on the strike's timing; `playRange` is the one function here
 * that turns it into strike time.
 *
 * The playback opens a little before the first thing a pilot does after the
 * IP (the action point's check turn, the roll-in, the turn-in or the pull-up),
 * not at the IP itself: crossing the IP is no action. Before that there is
 * only a straight run-in to watch.
 */

import type { JetTrack, StrikePlayback, StrikeTiming, StrikeWindow } from '../playback';

/** The picture's marker kinds, through the library's own types (AP ROLL RUN POP PDP TRK REL TGT). */
export type SceneMarkerKind = JetTrack['picture']['markers'][number]['kind'];
/** Every marker kind but the target: the points along the run where the pilot acts. */
export type ActionKind = Exclude<SceneMarkerKind, 'TGT'>;

/** A jet's first action: the first of these it reaches after the IP. */
export const FIRST_ACTION_KINDS = ['AP', 'ROLL', 'RUN', 'POP'] as const;
/** When none is anchored: this long before release. */
export const FIRST_ACTION_FALLBACK_S = 20;
/** The default range starts this long before the earliest first action among the flown jets. */
export const RUN_LEAD_S = 10;

export interface FirstAction {
  /** Jet time. */
  tau_s: number;
  kind: (typeof FIRST_ACTION_KINDS)[number] | 'fallback';
}

/**
 * The earliest anchor of FIRST_ACTION_KINDS that sits on a picture marker;
 * else max(0, release − FIRST_ACTION_FALLBACK_S). Jet time.
 *
 * Only marker anchors count: an AP placed by range (a legacy dive's schematic
 * one) is no check turn, and the library's events skip it for the same
 * reason. Every built family has a roll-in, turn-in or pull-up marker, so the
 * fallback fires only when a marker failed to anchor (the library warns).
 */
export function firstActionTau(track: JetTrack): FirstAction {
  let best: FirstAction | undefined;
  for (const kind of FIRST_ACTION_KINDS) {
    const a = track.anchors[kind];
    if (!a || a.source !== 'marker') continue;
    if (!best || a.tau_s < best.tau_s) best = { tau_s: a.tau_s, kind };
  }
  return best ?? { tau_s: Math.max(0, track.releaseTau_s - FIRST_ACTION_FALLBACK_S), kind: 'fallback' };
}

export interface MarkerMoment {
  kind: ActionKind;
  /** The marker's own lines, the very array the map and the card print: never a copy. */
  lines: readonly string[];
  /** Jet time of the marker's anchor. */
  tau_s: number;
  /** This is the jet's first action (firstActionTau). */
  first: boolean;
}

/**
 * Every picture marker but TGT, in picture order, at the time of its anchor.
 * A marker with no anchor (it failed to land on the drawn path) is left out.
 * `first` is set on exactly the marker firstActionTau names, and on none when
 * that fell back to a time before release.
 */
export function markerMoments(track: JetTrack): MarkerMoment[] {
  const fa = firstActionTau(track);
  const out: MarkerMoment[] = [];
  let firstTaken = false;
  for (const m of track.picture.markers) {
    if (m.kind === 'TGT') continue;
    const a = track.anchors[m.kind];
    if (!a) continue;
    const first = !firstTaken && fa.kind !== 'fallback' && m.kind === fa.kind;
    if (first) firstTaken = true;
    out.push({ kind: m.kind, lines: m.lines, tau_s: a.tau_s, first });
  }
  return out;
}

export interface LabelMoment {
  kind: 'ip' | 'egress';
  text: string;
  /** Jet time. */
  tau_s: number;
}

/** The picture's IP label at the IP (jet time 0) and its egress label at the end of the drawn egress leg, in picture order. */
export function labelMoments(track: JetTrack): LabelMoment[] {
  const out: LabelMoment[] = [];
  for (const l of track.picture.labels) {
    const a = track.anchors[l.kind === 'ip' ? 'IP' : 'END'];
    if (a) out.push({ kind: l.kind, text: l.text, tau_s: a.tau_s });
  }
  return out;
}

/**
 * The stretch of the strike clock the playback plays, strike time.
 *
 * Whole run-in: the timing's window as it is (the same object), which starts
 * before the earliest IP crossing. Otherwise it starts RUN_LEAD_S before the
 * earliest first action among the flown jets, but never before the window,
 * and ends with the window. With no jet flown: the window.
 */
export function playRange(pb: StrikePlayback, timing: StrikeTiming, wholeRunIn: boolean): StrikeWindow {
  const w = timing.window;
  if (wholeRunIn || !pb.jets.length) return w;
  let first = Infinity;
  for (let k = 0; k < pb.jets.length; k++) first = Math.min(first, timing.jets[k].shift_s + firstActionTau(pb.jets[k]).tau_s);
  return { t0_s: Math.max(w.t0_s, first - RUN_LEAD_S), t1_s: w.t1_s };
}
