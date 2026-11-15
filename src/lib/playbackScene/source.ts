/**
 * The one file that knows the playback library's sampling names
 * (src/lib/playback: sampleJet, sampleBomb, retime, playbackBounds). The
 * scene draws through this adapter only, so a rename there is fixed here
 * once. Pure: no three.js, no DOM.
 *
 * What it hands the scene:
 * - every frame: a jet's or a bomb's pose at strike time t, already in
 *   three.js axes (x = east, y = up, z = −north), written into an object
 *   the caller keeps, so nothing is allocated at 60 fps;
 * - once per open: each jet's planned path as a flat Float32Array of xyz,
 *   each jet's target point, the strike window, the box the terrain is
 *   built from, the lead's attack axis (for the home camera), the frame
 *   (what Home frames is homeBox in homeView.ts, from the poses);
 * - each jet's moments on the strike clock: in the picture from, first
 *   action, release, impact, hidden after.
 *
 * Always the DISPLAY layer: corners rounded in time, the lead-in before the
 * IP, the formation slot. That is the layer for cameras; the plan layer (the
 * card's lines) is for tests and printed numbers.
 *
 * Heights: y is the library's up_m, metres above the LEAD target's planned
 * elevation (not above sea level). The terrain uses the same datum, so the
 * ground at the lead's target is y = 0 and the bomb lands on it.
 */

import {
  newBombState, newJetState, playbackBounds, sampleBomb, sampleJet, toLocal, upOf,
  type LocalFrame, type PlaybackBounds, type PlaybackPhase, type StrikePlayback, type StrikeTiming,
} from '../playback';
import { firstActionTau } from './actionPoints';

export type ScenePhase = PlaybackPhase;

/** A jet as the scene draws it, three.js axes, metres and m/s. */
export interface SceneJetPose {
  visible: boolean;
  x: number;
  y: number;
  z: number;
  /** Velocity of the displayed jet: the arrow points along it (meridians converge, so never along the heading number). */
  vx: number;
  vy: number;
  vz: number;
  heading_deg: number;
  pitch_deg: number;
  /** Display estimate, right wing down positive. */
  bank_deg: number;
  phase: ScenePhase;
}

export interface SceneBombPose {
  /** Only while falling. */
  visible: boolean;
  stage: 'carried' | 'falling' | 'impacted';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface ScenePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SceneSource {
  readonly jetCount: number;
  /** The strike window on the strike clock, s: the clock's range. */
  readonly window: { readonly t0_s: number; readonly t1_s: number };
  /** The playback's local frame (origin = the lead's target): the terrain is laid out through it. */
  readonly frame: LocalFrame;
  /** The box in local ENU metres every jet and bomb stays inside at any delay: the terrain box is built from it. */
  readonly bounds: PlaybackBounds;
  /** The lead's attack axis, a horizontal unit vector (east, north) along the run-in toward its target: the home camera stands behind it. */
  readonly attackAxis: [e: number, n: number];
  /** Jet k's planned path (display layer, sampled across the window while it is visible), xyz in three.js axes. */
  plannedPath(jet: number): Float32Array;
  /** Jet k's target point on the ground, three.js axes. Its bomb's last position. */
  targetOf(jet: number): ScenePoint;
  /** The jet's seat label, '#1'… */
  labelOf(jet: number): string;
  /** Jet k at strike time t, written into `out` (returned). Allocates nothing. */
  jetAt(jet: number, t_s: number, out: SceneJetPose): SceneJetPose;
  /** Jet k's bomb at strike time t, written into `out` (returned). Allocates nothing. */
  bombAt(jet: number, t_s: number, out: SceneBombPose): SceneBombPose;
  /** Strike time jet k's bombs land: its TOT. */
  impactOf(jet: number): number;
  /** Strike time of jet k's first action after the IP (firstActionTau in actionPoints.ts). */
  firstActionOf(jet: number): number;
  /** Strike time jet k comes into the picture, at the start of its drawn lead-in. */
  visibleFromOf(jet: number): number;
  /** Strike time after which jet k is hidden. */
  hideOf(jet: number): number;
  /** Strike time jet k releases. */
  releaseOf(jet: number): number;
}

export function newSceneJetPose(): SceneJetPose {
  return { visible: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading_deg: 0, pitch_deg: 0, bank_deg: 0, phase: 'leadIn' };
}

export function newSceneBombPose(): SceneBombPose {
  return { visible: false, stage: 'carried', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
}

/** The planned path's sampling step, s of strike time. Fine enough that the drawn line hugs the rounded corners the arrow flies. */
export const PATH_STEP_S = 0.25;

/**
 * The scene's view of one built playback at one timing. Build it once per
 * open (and again if the timing changes): the planned paths are sampled here.
 */
export function sceneSourceFrom(pb: StrikePlayback, timing: StrikeTiming, pathStep_s = PATH_STEP_S): SceneSource {
  // One scratch state per source: every call overwrites it, so nothing is allocated per frame.
  const js = newJetState();
  const bs = newBombState();
  const { t0_s, t1_s } = timing.window;

  const jetAt = (jet: number, t_s: number, out: SceneJetPose): SceneJetPose => {
    sampleJet(pb, timing, jet, t_s, 'display', js);
    out.visible = js.visible;
    out.x = js.e_m;
    out.y = js.up_m;
    out.z = -js.n_m;
    out.vx = js.ve_mps;
    out.vy = js.vu_mps;
    out.vz = -js.vn_mps;
    out.heading_deg = js.heading_deg;
    out.pitch_deg = js.pitch_deg;
    out.bank_deg = js.bank_deg;
    out.phase = js.phase;
    return out;
  };

  const bombAt = (jet: number, t_s: number, out: SceneBombPose): SceneBombPose => {
    sampleBomb(pb, timing, jet, t_s, 'display', bs);
    out.visible = bs.visible;
    out.stage = bs.stage;
    out.x = bs.e_m;
    out.y = bs.up_m;
    out.z = -bs.n_m;
    out.vx = bs.ve_mps;
    out.vy = bs.vu_mps;
    out.vz = -bs.vn_mps;
    return out;
  };

  // The planned paths, once: the visible stretch of the display track across the window.
  const step = pathStep_s > 0 ? pathStep_s : PATH_STEP_S;
  const steps = Math.max(1, Math.ceil((t1_s - t0_s) / step));
  const pose = newSceneJetPose();
  const paths = pb.jets.map((_, k) => {
    const xyz: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i === steps ? t1_s : t0_s + i * step;
      jetAt(k, t, pose);
      if (pose.visible) xyz.push(pose.x, pose.y, pose.z);
    }
    return Float32Array.from(xyz);
  });

  const targets: ScenePoint[] = pb.jets.map((j) => {
    const p = toLocal(pb.frame, j.target.coordinates);
    return { x: p.e_m, y: upOf(pb.frame, j.targetElevation_ft), z: -p.n_m };
  });

  // Each jet's moments on the strike clock, once: the frame code and Home ask for them, never per frame.
  const firstAction_s = pb.jets.map((j, k) => timing.jets[k].shift_s + firstActionTau(j).tau_s);
  const visibleFrom_s = pb.jets.map((j, k) => timing.jets[k].shift_s - j.display.leadIn.capTau_s);

  const lead = pb.jets[0];
  const h = ((lead?.attackHeading_deg ?? 0) * Math.PI) / 180;

  return {
    jetCount: pb.jets.length,
    window: { t0_s, t1_s },
    frame: pb.frame,
    bounds: playbackBounds(pb),
    attackAxis: [Math.sin(h), Math.cos(h)],
    plannedPath: (jet) => paths[jet],
    targetOf: (jet) => targets[jet],
    labelOf: (jet) => pb.jets[jet].label,
    jetAt,
    bombAt,
    impactOf: (jet) => timing.jets[jet].impact_s,
    firstActionOf: (jet) => firstAction_s[jet],
    visibleFromOf: (jet) => visibleFrom_s[jet],
    hideOf: (jet) => timing.jets[jet].hide_s,
    releaseOf: (jet) => timing.jets[jet].release_s,
  };
}
