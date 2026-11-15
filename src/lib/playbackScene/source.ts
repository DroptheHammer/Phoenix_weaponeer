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
 * - once per open: each jet's planned path as a flat Float32Array of xyz
 *   with the planner's phase of each stretch (for the colour code), its
 *   bomb's whole fall, the sizes their buffers need at any delay,
 *   each jet's target point and seat, the distinct targets (one mark per
 *   target, however many jets share it), the strike window, the box the terrain is
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
  PHASES, newBombState, newJetState, playbackBounds, sampleBomb, sampleJet, toLocal, upOf,
  type LocalFrame, type PlaybackBounds, type PlaybackPhase, type StrikePlayback, type StrikeTiming,
} from '../playback';
import { firstActionTau } from './actionPoints';
import { groupTargets, type SceneTarget } from './targets';

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
  /**
   * Jet k's planned path, xyz in three.js axes: the display track from its IP crossing to the end of
   * the drawn egress leg, sampled every path step plus a vertex on every anchor (so the colour
   * changes sit exactly on the planner's points). The run-in before the IP and the flight past the
   * drawn leg are shown by the trail only, as the planner draws neither.
   */
  plannedPath(jet: number): Float32Array;
  /** Per vertex of plannedPath: the PHASES index of the stretch from it to the next (the last repeats the one before). */
  plannedPhase(jet: number): Uint8Array;
  /** Jet k's bomb's whole fall on the display layer, release to impact, xyz in three.js axes (the last point is the target). */
  plannedBomb(jet: number): Float32Array;
  /** The most vertices plannedPath can have for jet k at any delay (path step at least PATH_STEP_S): its buffers are made this size once. */
  pathCapacity(jet: number): number;
  /** The most points plannedBomb can have for jet k at any delay. */
  bombCapacity(jet: number): number;
  /** Jet k's target point on the ground, three.js axes. Its bomb's last position. */
  targetOf(jet: number): ScenePoint;
  /** The jet's seat label, '#1'… */
  labelOf(jet: number): string;
  /**
   * Jet k's seat: its place among every member of the strike, flown or not (a skipped #2 leaves the
   * jet flying as #3 at seat 2). Colours, labels and lanes follow the seat, never the jet index.
   */
  seatOf(jet: number): number;
  /** Every member's seat label ('#1'…), in seat order, skipped members included. */
  readonly seatLabels: readonly string[];
  /** The distinct targets, the lead's first: one mark each, however many jets share it. */
  readonly targets: readonly SceneTarget[];
  /** Index into `targets` of jet k's target. */
  targetIndexOf(jet: number): number;
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
/** The most anchors a track can have (one per AnchorKind): each adds a vertex to the planned path. */
export const ANCHOR_VERTICES = 11;
/** A sampled path time this close to an anchor's is left out: the anchor's own vertex stands there. */
const ON_ANCHOR_S = 1e-6;

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

  // The planned paths, once: IP crossing to the end of the drawn egress leg (the stretch the planner
  // draws), never the whole window, so a delay of hours costs nothing. Each anchor gets a vertex of
  // its own, its phase read straight from the plan sample on it: a strike-time round trip
  // ((tau + shift) − shift) can land a hair before the anchor and read the stretch behind it.
  const step = pathStep_s > 0 ? pathStep_s : PATH_STEP_S;
  const pose = newSceneJetPose();
  const paths: Float32Array[] = [], phases: Uint8Array[] = [];
  pb.jets.forEach((j, k) => {
    const tj = timing.jets[k];
    const from = tj.push_s, to = tj.egressEnd_s;
    const anchors = Object.values(j.anchors)
      .map((a) => ({ t: a!.tau_s + tj.shift_s, phase: j.samples.phase[a!.index] }))
      .sort((a, b) => a.t - b.t);
    const xyz: number[] = [], ph: number[] = [];
    let ai = 0;
    const atAnchor = (a: { t: number; phase: number }) => {
      jetAt(k, a.t, pose);
      xyz.push(pose.x, pose.y, pose.z);
      ph.push(a.phase);
    };
    const steps = Math.max(1, Math.ceil((to - from) / step));
    for (let i = 0; i <= steps; i++) {
      const t = i === steps ? to : from + i * step;
      while (ai < anchors.length && anchors[ai].t < t - ON_ANCHOR_S) atAnchor(anchors[ai++]);
      if (ai < anchors.length && Math.abs(anchors[ai].t - t) <= ON_ANCHOR_S) continue;
      jetAt(k, t, pose);
      xyz.push(pose.x, pose.y, pose.z);
      ph.push(PHASES.indexOf(pose.phase));
    }
    while (ai < anchors.length) atAnchor(anchors[ai++]);
    // The last vertex starts no stretch: the plan sample at the end of the leg already says
    // 'extension', so it repeats the stretch before it.
    if (ph.length > 1) ph[ph.length - 1] = ph[ph.length - 2];
    paths.push(Float32Array.from(xyz));
    phases.push(Uint8Array.from(ph));
  });

  // Each bomb's whole fall, once (the slot it leaves from eases out with the timing, so it is rebuilt with the source).
  const bpose = newSceneBombPose();
  const bombs = pb.jets.map((_, k) => {
    const { release_s, impact_s } = timing.jets[k];
    const xyz: number[] = [];
    for (let i = 0; ; i++) {
      const t = release_s + i * PATH_STEP_S;
      if (t >= impact_s - ON_ANCHOR_S) break;
      bombAt(k, t, bpose);
      xyz.push(bpose.x, bpose.y, bpose.z);
    }
    bombAt(k, impact_s, bpose);
    xyz.push(bpose.x, bpose.y, bpose.z);
    return Float32Array.from(xyz);
  });

  const targets: ScenePoint[] = pb.jets.map((j) => {
    const p = toLocal(pb.frame, j.target.coordinates);
    return { x: p.e_m, y: upOf(pb.frame, j.targetElevation_ft), z: -p.n_m };
  });
  // Seats and targets, once: a member's place in the strike is fixed for the open.
  const seats = pb.jets.map((_, k) => pb.members.findIndex((m) => m.jet === k));
  const seatLabels = pb.members.map((m) => m.label);
  const grouped = groupTargets(targets.map((t, k) => ({ ...t, name: pb.jets[k].target.name })), seats);

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
    plannedPhase: (jet) => phases[jet],
    plannedBomb: (jet) => bombs[jet],
    pathCapacity: (jet) => Math.ceil(pb.jets[jet].egressEndTau_s / PATH_STEP_S) + 3 + ANCHOR_VERTICES,
    bombCapacity: (jet) => Math.ceil(pb.jets[jet].bomb.fall_s / PATH_STEP_S) + 3,
    targetOf: (jet) => targets[jet],
    labelOf: (jet) => pb.jets[jet].label,
    seatOf: (jet) => seats[jet],
    seatLabels,
    targets: grouped.targets,
    targetIndexOf: (jet) => grouped.targetOfJet[jet],
    jetAt,
    bombAt,
    impactOf: (jet) => timing.jets[jet].impact_s,
    firstActionOf: (jet) => firstAction_s[jet],
    visibleFromOf: (jet) => visibleFrom_s[jet],
    hideOf: (jet) => timing.jets[jet].hide_s,
    releaseOf: (jet) => timing.jets[jet].release_s,
  };
}
