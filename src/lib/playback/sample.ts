/**
 * The 60 fps path: a jet's or a bomb's state at strike time t. No allocation
 * when an `out` object is passed (no closures either).
 *
 * - plan: one binary search over the stored samples and a linear blend, no
 *   trigonometry. Before its IP push the jet is not visible and holds the IP;
 *   after `hideTau_s` it is not visible either.
 * - display: the plan with its corners rounded in time (display.ts), the
 *   lead-in before the IP, and the formation slot (formation.ts). Visible
 *   from 20 nm behind the IP (maxLeadIn_nm) to the hide time. Its roll and
 *   load factor are read from the jet's table (attitude.ts).
 */

import { calculateDistance } from '../coordinates';
import { loadAt, rollAt } from './attitude';
import { disp, displayAt, displayHeading, intervalOf, slotDir, slotDirection } from './display';
import { formationLateral_m } from './formation';
import { FT_TO_M, NM_TO_M, fromLocalInto } from './frame';
import { PHASES } from './phases';
import type { BombState, JetState, JetTrack, PlaybackLayer, SideCoords, StrikePlayback, StrikeTiming } from './types';

const MPS_PER_KT = NM_TO_M / 3600;
const DEG = 180 / Math.PI;

/** Where `x` falls in the stored times, clamped: interval index i, the next index j, and the fraction u. */
const at = { i: 0, j: 0, u: 0 };
function locate(times: Float64Array, n: number, x: number): void {
  at.i = 0;
  at.u = 0;
  if (n > 1 && x >= times[n - 1]) {
    at.i = n - 2;
    at.u = 1;
  } else if (n > 1 && x > times[0]) {
    at.i = intervalOf(times, n, x);
    at.u = (x - times[at.i]) / (times[at.i + 1] - times[at.i]);
  }
  at.j = n > 1 ? at.i + 1 : at.i;
}

const blend = (a: Float64Array) => a[at.i] + (a[at.j] - a[at.i]) * at.u;

export function newJetState(): JetState {
  return {
    visible: false, t_s: 0, tau_s: 0, phase: 'leadIn', lat: 0, lon: 0, e_m: 0, n_m: 0, up_m: 0, agl_ft: 0, msl_ft: 0,
    tas_kt: 0, gs_kt: 0, heading_deg: 0, pitch_deg: 0, bank_deg: 0, load_g: 1, ve_mps: 0, vn_mps: 0, vu_mps: 0, slot_m: 0, released: false,
  };
}

export function newBombState(): BombState {
  return { visible: false, stage: 'carried', tau_s: 0, lat: 0, lon: 0, e_m: 0, n_m: 0, up_m: 0, agl_ft: 0, msl_ft: 0, ve_mps: 0, vn_mps: 0, vu_mps: 0 };
}

/** The plan layer at jet time `tau`, into `out` (everything but t_s, tau_s and visible). */
function planInto(track: JetTrack, tau: number, out: JetState): void {
  const S = track.samples;
  locate(S.tau_s, S.n, tau);
  const i = at.i;
  out.phase = tau < 0 ? 'leadIn' : PHASES[S.phase[i]];
  out.lat = blend(S.lat);
  out.lon = blend(S.lon);
  out.e_m = blend(S.e_m);
  out.n_m = blend(S.n_m);
  out.up_m = blend(S.up_m);
  out.agl_ft = blend(S.agl_ft);
  out.msl_ft = blend(S.msl_ft);
  out.tas_kt = S.tas_kt[i];
  out.heading_deg = S.heading_deg[i];
  out.pitch_deg = S.pitch_deg[i];
  out.bank_deg = 0;
  out.load_g = 1;
  out.ve_mps = S.ve_mps[i];
  out.vn_mps = S.vn_mps[i];
  out.vu_mps = S.vu_mps[i];
  out.gs_kt = Math.hypot(out.ve_mps, out.vn_mps) / MPS_PER_KT;
  out.slot_m = 0;
  out.released = tau >= track.releaseTau_s;
}

/** The display layer at jet time `tau`, before the formation slot. Off the plan, lat/lon come from e/n through the frame. */
function displayInto(pb: StrikePlayback, track: JetTrack, tau: number, out: JetState): void {
  const S = track.samples;
  const L = track.display.leadIn;
  displayAt(track, tau);
  if (disp.kind === 'plan') {
    planInto(track, tau, out);
    out.bank_deg = rollAt(track.attitude, tau);
    out.load_g = loadAt(track.attitude, tau);
    return;
  }
  out.e_m = disp.e;
  out.n_m = disp.n;
  fromLocalInto(pb.frame, disp.e, disp.n, out);
  out.ve_mps = disp.ve;
  out.vn_mps = disp.vn;
  out.vu_mps = disp.vu;
  out.gs_kt = Math.hypot(disp.ve, disp.vn) / MPS_PER_KT;
  out.slot_m = 0;
  out.released = tau >= track.releaseTau_s;
  if (disp.kind === 'leadIn') {
    // Exactly level at the IP's altitude, on the first stretch's heading.
    out.phase = 'leadIn';
    out.up_m = L.up_m;
    out.agl_ft = L.agl_ft;
    out.msl_ft = L.msl_ft;
    out.tas_kt = L.tas_kt;
    out.heading_deg = L.heading_deg;
    out.pitch_deg = 0;
    out.bank_deg = rollAt(track.attitude, tau);
    out.load_g = loadAt(track.attitude, tau);
    return;
  }
  out.up_m = disp.up;
  out.msl_ft = pb.frame.originElevation_ft + disp.up / FT_TO_M;
  out.agl_ft = out.msl_ft - track.targetElevation_ft;
  out.heading_deg = displayHeading(track, tau, disp.ve, disp.vn);
  out.pitch_deg = Math.atan2(disp.vu, Math.hypot(disp.ve, disp.vn)) * DEG;
  out.bank_deg = rollAt(track.attitude, tau);
  out.load_g = loadAt(track.attitude, tau);
  if (tau < 0) {
    out.phase = 'leadIn';
    out.tas_kt = L.tas_kt;
  } else {
    locate(S.tau_s, S.n, tau);
    out.phase = PHASES[S.phase[at.i]];
    out.tas_kt = S.tas_kt[at.i];
  }
}

/**
 * The jet at strike time `t_s`, on the plan layer (the card's lines, the
 * tested truth) or the display layer (for the camera; see PlaybackLayer).
 */
export function sampleJet(pb: StrikePlayback, timing: StrikeTiming, jet: number, t_s: number, layer: PlaybackLayer = 'plan', out: JetState = newJetState()): JetState {
  const track = pb.jets[jet];
  const tau = t_s - timing.jets[jet].shift_s;
  out.t_s = t_s;
  out.tau_s = tau;
  if (layer !== 'display') {
    planInto(track, tau, out);
    out.visible = tau >= 0 && tau <= track.hideTau_s;
    return out;
  }
  displayInto(pb, track, tau, out);
  out.visible = tau >= -track.display.leadIn.capTau_s && tau <= track.hideTau_s;
  const slot = formationLateral_m(pb, timing, jet, t_s);
  if (slot !== 0) {
    // Right of the slot direction (the displayed heading, smoothed): (n, −e).
    slotDirection(track, tau);
    if (slotDir.e !== 0 || slotDir.n !== 0) {
      out.e_m += slot * slotDir.n;
      out.n_m += -slot * slotDir.e;
      fromLocalInto(pb.frame, out.e_m, out.n_m, out);
      out.slot_m = slot;
    }
  }
  return out;
}

/**
 * The jet's bomb at strike time `t_s`: held at release before it, on the
 * target after impact. On the plan layer (the default) the planner's bomb.
 * On the display layer the same bomb, but leaving from the DISPLAYED jet: a
 * jet flying a formation slot at its release drops it a slot to the side of
 * the plan's release point, and that offset eases to nothing over the fall
 * (smoothstep in fall time), so the bomb still lands exactly on the target.
 * The arguments are in `sampleJet`'s order: layer, then `out`.
 */
export function sampleBomb(pb: StrikePlayback, timing: StrikeTiming, jet: number, t_s: number, layer: PlaybackLayer = 'plan', out: BombState = newBombState()): BombState {
  const track = pb.jets[jet];
  const B = track.bomb;
  const tau = t_s - timing.jets[jet].shift_s - track.releaseTau_s;
  locate(B.tau_s, B.n, tau);
  const dt = at.j > at.i ? B.tau_s[at.j] - B.tau_s[at.i] : 1;
  out.tau_s = tau;
  out.stage = tau < 0 ? 'carried' : tau > B.fall_s ? 'impacted' : 'falling';
  out.visible = out.stage === 'falling';
  out.lat = blend(B.lat);
  out.lon = blend(B.lon);
  out.e_m = blend(B.e_m);
  out.n_m = blend(B.n_m);
  out.up_m = blend(B.up_m);
  out.agl_ft = blend(B.agl_ft);
  out.msl_ft = blend(B.msl_ft);
  out.ve_mps = (B.e_m[at.j] - B.e_m[at.i]) / dt;
  out.vn_mps = (B.n_m[at.j] - B.n_m[at.i]) / dt;
  out.vu_mps = (B.up_m[at.j] - B.up_m[at.i]) / dt;
  if (layer === 'display' && tau < B.fall_s && B.fall_s > 0) {
    // The displayed jet's slot at the release, exactly as sampleJet applies it there.
    const slot = formationLateral_m(pb, timing, jet, timing.jets[jet].release_s);
    if (slot !== 0) slotDirection(track, track.releaseTau_s);
    if (slot !== 0 && (slotDir.e !== 0 || slotDir.n !== 0)) {
      const x = Math.min(Math.max(tau / B.fall_s, 0), 1);
      const keep = 1 - x * x * (3 - 2 * x);
      const rate = tau > 0 ? -(6 * x * (1 - x)) / B.fall_s : 0;
      const oe = slot * slotDir.n, on = -slot * slotDir.e;
      out.e_m += oe * keep;
      out.n_m += on * keep;
      out.ve_mps += oe * rate;
      out.vn_mps += on * rate;
      fromLocalInto(pb.frame, out.e_m, out.n_m, out);
    }
  }
  return out;
}

/**
 * Where a sampled jet sits on the card's side view: the straight-line
 * (great-circle) range to its OWN target, and its AGL. For a plan-layer state
 * these are the side view's own coordinates; the 3D scene's side-on panel
 * should draw in them, because the card's x axis is range, not distance along
 * the attack axis.
 */
export function sideCoords(pb: StrikePlayback, jet: number, state: Pick<JetState, 'lat' | 'lon' | 'agl_ft'>, out: SideCoords = { range_nm: 0, agl_ft: 0 }): SideCoords {
  out.range_nm = calculateDistance(state, pb.jets[jet].target.coordinates);
  out.agl_ft = state.agl_ft;
  return out;
}
