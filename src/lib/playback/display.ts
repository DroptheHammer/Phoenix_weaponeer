/**
 * The display layer: what the camera flies. The plan layer keeps the card's
 * sharp corners; here each corner is rounded by averaging the plan track over
 * a window of ±h in time (a box kernel):
 *
 *   D(τ) = (1 / 2h) ∫ P(s) ds over [τ − h, τ + h]
 *
 * - On a straight, steady stretch the average of a straight line IS its
 *   middle point, so D = P exactly whenever no corner lies inside the
 *   window: the display equals the plan outside the windows, and each window
 *   starts and ends on the plan at the plan's own time (time-preserving).
 * - Around one corner between straight legs, D is exactly the quadratic
 *   Bézier with its control point on the corner, entered and left at the
 *   plan's times; close corners simply share a window.
 * - Horizontal and vertical corners are rounded alike (the kernel is 3D).
 * - The velocity is (P(τ + h) − P(τ − h)) / 2h: continuous, cheap, and blind
 *   to the pop-up's 1 ft join segment, whose own heading means nothing.
 * - h is the `smooth_s` camera constant (no turn radius from a borrowed G),
 *   shrunk smoothly to 0 as the release approaches, so no window reaches
 *   back across it: up to the release the display is the plan's, arriving on
 *   the plan's release point with the attack line's velocity.
 * - The release itself is a corner in the plan (attack line → egress arc and
 *   ramp: 5° of heading, up to 62° of pitch for the LABS). For 2h after it the
 *   display is a cubic Hermite in time from the release (the plan's position,
 *   the incoming velocity, which is what the bomb leaves with) to the
 *   smoothed track 2h later (its position and velocity). So position and
 *   velocity, hence heading and pitch, are continuous through the release,
 *   and nothing before the release moves.
 *
 * Before the IP the display flies the lead-in: straight back from the IP in
 * the local frame, level at the IP altitude, at the ingress speed, along the
 * first stretch's heading. Beyond the last sample it carries straight on (the
 * extension is straight). Everything here is precomputed at build or
 * allocation-free. Positions are local metres; the caller turns them into
 * lat/lon through the frame, so the two always agree.
 *
 * Only position and velocity live here. The jet's roll and load factor are
 * worked out from this track's acceleration once per jet, in attitude.ts.
 */

import { NM_TO_M } from './frame';
import type { DisplayTrack, JetTrack, PlaybackOptions, TrackSamples } from './types';

const MPS_PER_KT = NM_TO_M / 3600;
const DEG = 180 / Math.PI;
/** A direction change above this, or a speed change above CORNER_SPEED (relative), is a corner. */
const CORNER_DEG = 0.01;
const CORNER_SPEED = 1e-4;

const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Angle in degrees between two 3D vectors, and whether their lengths differ by more than CORNER_SPEED. */
function isCorner(ae: number, an: number, au: number, be: number, bn: number, bu: number): boolean {
  const dot = ae * be + an * bn + au * bu;
  const cross = Math.hypot(an * bu - au * bn, au * be - ae * bu, ae * bn - an * be);
  const ma = Math.hypot(ae, an, au), mb = Math.hypot(be, bn, bu);
  return Math.atan2(cross, dot) * DEG > CORNER_DEG || Math.abs(mb - ma) > CORNER_SPEED * Math.max(ma, mb);
}

export function buildDisplay(S: TrackSamples, ingress_kt: number, options: Required<PlaybackOptions>): DisplayTrack {
  const n = S.n;
  const f = () => new Float64Array(n);
  const D: DisplayTrack = {
    smooth_s: options.smooth_s,
    corners_tau: new Float64Array(0),
    cum_e: f(), cum_n: f(), cum_up: f(), conv_deg: f(),
    leadIn: { ve_mps: 0, vn_mps: 0, up_m: S.up_m[0], agl_ft: S.agl_ft[0], msl_ft: S.msl_ft[0], tas_kt: ingress_kt, heading_deg: S.heading_deg[0], capTau_s: 0 },
  };

  // The lead-in, from the first interval's horizontal direction.
  const v = ingress_kt * MPS_PER_KT;
  const hs0 = Math.hypot(S.ve_mps[0], S.vn_mps[0]);
  if (n > 1 && hs0 > 0) {
    const k = v / hs0;
    D.leadIn.ve_mps = S.ve_mps[0] * k;
    D.leadIn.vn_mps = S.vn_mps[0] * k;
  }
  D.leadIn.capTau_s = ingress_kt > 0 ? (options.maxLeadIn_nm / ingress_kt) * 3600 : 0;

  // Running integrals (exact for the linear blend between samples), and the grid → true heading correction.
  const cols: [Float64Array, Float64Array][] = [[S.e_m, D.cum_e], [S.n_m, D.cum_n], [S.up_m, D.cum_up]];
  for (let i = 1; i < n; i++) {
    const dt = S.tau_s[i] - S.tau_s[i - 1];
    for (const [col, cum] of cols) cum[i] = cum[i - 1] + 0.5 * dt * (col[i - 1] + col[i]);
  }
  for (let i = 0; i < n; i++) D.conv_deg[i] = wrap180(S.heading_deg[i] - Math.atan2(S.ve_mps[i], S.vn_mps[i]) * DEG);

  // Corners: the IP (lead-in → first interval), then every sample where the velocity changes.
  const corners: number[] = [];
  if (n > 1 && isCorner(D.leadIn.ve_mps, D.leadIn.vn_mps, 0, S.ve_mps[0], S.vn_mps[0], S.vu_mps[0])) corners.push(S.tau_s[0]);
  for (let i = 1; i < n - 1; i++) {
    if (isCorner(S.ve_mps[i - 1], S.vn_mps[i - 1], S.vu_mps[i - 1], S.ve_mps[i], S.vn_mps[i], S.vu_mps[i])) corners.push(S.tau_s[i]);
  }
  D.corners_tau = Float64Array.from(corners);
  return D;
}

// ─── Evaluation (allocation-free: module scratch) ─────────────────────────────

/** Columns: e, n, up. */
const NC = 3;
/** Position, its rate and its running integral at one time. */
const P = new Float64Array(NC);
const V = new Float64Array(NC);
const I = new Float64Array(NC);

/** The i with a[i] ≤ x < a[i + 1], for a[0] ≤ x < a[n − 1]. */
export function intervalOf(a: Float64Array, n: number, x: number): number {
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (a[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The plan track extended both ways, at jet time `tau`, into P, V and I:
 * the lead-in before 0, the samples, straight on past the last one.
 */
function evalAt(track: JetTrack, tau: number): void {
  const S = track.samples;
  const D = track.display;
  const n = S.n;
  let b: number;
  if (tau < 0 || n < 2) {
    b = 0;
    V[0] = D.leadIn.ve_mps; V[1] = D.leadIn.vn_mps; V[2] = 0;
  } else {
    const i = tau >= S.tau_s[n - 1] ? n - 2 : intervalOf(S.tau_s, n, tau);
    b = tau >= S.tau_s[n - 1] ? n - 1 : i;
    V[0] = S.ve_mps[i]; V[1] = S.vn_mps[i]; V[2] = S.vu_mps[i];
  }
  const x = tau - S.tau_s[b];
  P[0] = S.e_m[b] + V[0] * x; P[1] = S.n_m[b] + V[1] * x; P[2] = S.up_m[b] + V[2] * x;
  I[0] = D.cum_e[b] + (S.e_m[b] + 0.5 * V[0] * x) * x;
  I[1] = D.cum_n[b] + (S.n_m[b] + 0.5 * V[1] * x) * x;
  I[2] = D.cum_up[b] + (S.up_m[b] + 0.5 * V[2] * x) * x;
}

/** Whether a corner lies strictly inside (a, b). */
function cornerWithin(c: Float64Array, a: number, b: number): boolean {
  let lo = 0;
  let hi = c.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c[mid] <= a) lo = mid + 1;
    else hi = mid;
  }
  return lo < c.length && c[lo] < b;
}

/** The smoothed state, valid after `smoothAt` returned true. Velocities per second. */
export const smooth = { e: 0, n: 0, up: 0, ve: 0, vn: 0, vu: 0, h: 0 };
const Pp = new Float64Array(NC), Pm = new Float64Array(NC), Ip = new Float64Array(NC), Im = new Float64Array(NC);
const out = new Float64Array(NC), rate = new Float64Array(NC);

/**
 * The kernel's half-width at jet time `tau`: smooth_s, shrinking smoothly
 * (C1) to 0 at the release so the window never reaches across it:
 * h = d − d²/4H within 2H of the release (d = |τ − τ_REL|), which is never
 * more than d. Returns h; `hRate` gets dh/dτ. (After the release the Hermite
 * of `displayAt` takes over for 2H, so only the side before it is used.)
 */
let hRate = 0;
function halfWidth(track: JetTrack, tau: number): number {
  const H = track.display.smooth_s;
  if (!(H > 0)) {
    hRate = 0;
    return 0;
  }
  const d = Math.abs(tau - track.releaseTau_s);
  if (d >= 2 * H) {
    hRate = 0;
    return H;
  }
  hRate = (1 - d / (2 * H)) * Math.sign(tau - track.releaseTau_s);
  return d - (d * d) / (4 * H);
}

/** The box kernel of half-width h (changing at hp per second) at `tau`, into `smooth`; false when no corner is inside. */
function kernelAt(track: JetTrack, tau: number, h: number, hp: number): boolean {
  if (!(h > 1e-6) || !cornerWithin(track.display.corners_tau, tau - h, tau + h)) return false;
  evalAt(track, tau + h);
  Pp.set(P); Ip.set(I);
  evalAt(track, tau - h);
  Pm.set(P); Im.set(I);
  for (let c = 0; c < NC; c++) {
    out[c] = (Ip[c] - Im[c]) / (2 * h);
    // d/dτ of (I(τ + h) − I(τ − h)) / 2h with h = h(τ).
    rate[c] = (Pp[c] * (1 + hp) - Pm[c] * (1 - hp)) / (2 * h) - (out[c] * hp) / h;
  }
  smooth.e = out[0]; smooth.n = out[1]; smooth.up = out[2];
  smooth.ve = rate[0]; smooth.vn = rate[1]; smooth.vu = rate[2];
  smooth.h = h;
  return true;
}

/**
 * The display track at jet time `tau` through the box kernel, into `smooth`.
 * Returns false, leaving `smooth` untouched, when no corner lies inside the
 * window: there the display is exactly the plan (or the lead-in).
 */
export function smoothAt(track: JetTrack, tau: number): boolean {
  const h = halfWidth(track, tau);
  return kernelAt(track, tau, h, hRate);
}

/**
 * How long after the release the display rounds the release corner: 2·smooth_s
 * (0 with smoothing off, which keeps the plan's corner).
 */
export function releaseBlend_s(track: JetTrack): number {
  const H = track.display.smooth_s;
  return H > 0 ? 2 * H : 0;
}

/** The velocity the plan arrives at the release with (the interval before it): what the bomb leaves with. */
export const arrival = { ve: 0, vn: 0, vu: 0 };
export function releaseArrival(track: JetTrack): void {
  const S = track.samples;
  const i = Math.max((track.anchors.REL?.index ?? 1) - 1, 0);
  arrival.ve = S.ve_mps[i];
  arrival.vn = S.vn_mps[i];
  arrival.vu = S.vu_mps[i];
}

const H0 = new Float64Array(NC), H1 = new Float64Array(NC), D0 = new Float64Array(NC), D1 = new Float64Array(NC);

/**
 * The display state at jet time `tau` before the formation slot, into `disp`
 * (local metres and m/s): `kind` 'plan' when the display is exactly the plan
 * there (the caller copies the plan sample), 'leadIn' before the IP outside
 * any window, 'smooth' inside a kernel window, 'release' in the Hermite after
 * the release.
 */
export const disp = { kind: 'plan' as 'plan' | 'leadIn' | 'smooth' | 'release', e: 0, n: 0, up: 0, ve: 0, vn: 0, vu: 0 };
export function displayAt(track: JetTrack, tau: number): void {
  const W = releaseBlend_s(track);
  const t0 = track.releaseTau_s;
  const iRel = track.anchors.REL?.index;
  if (W > 0 && iRel != null && tau >= t0 && tau < t0 + W) {
    const S = track.samples;
    releaseArrival(track);
    H0[0] = S.e_m[iRel]; H0[1] = S.n_m[iRel]; H0[2] = S.up_m[iRel];
    D0[0] = arrival.ve; D0[1] = arrival.vn; D0[2] = arrival.vu;
    // The far end: the smoothed track 2H after the release (full width there), else the plan.
    if (kernelAt(track, t0 + W, track.display.smooth_s, 0)) {
      H1[0] = smooth.e; H1[1] = smooth.n; H1[2] = smooth.up;
      D1[0] = smooth.ve; D1[1] = smooth.vn; D1[2] = smooth.vu;
    } else {
      evalAt(track, t0 + W);
      H1.set(P);
      D1.set(V);
    }
    const u = (tau - t0) / W, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const d00 = 6 * u2 - 6 * u, d10 = 3 * u2 - 4 * u + 1, d01 = -6 * u2 + 6 * u, d11 = 3 * u2 - 2 * u;
    disp.e = h00 * H0[0] + h10 * W * D0[0] + h01 * H1[0] + h11 * W * D1[0];
    disp.n = h00 * H0[1] + h10 * W * D0[1] + h01 * H1[1] + h11 * W * D1[1];
    disp.up = h00 * H0[2] + h10 * W * D0[2] + h01 * H1[2] + h11 * W * D1[2];
    disp.ve = (d00 * H0[0] + d01 * H1[0]) / W + d10 * D0[0] + d11 * D1[0];
    disp.vn = (d00 * H0[1] + d01 * H1[1]) / W + d10 * D0[1] + d11 * D1[1];
    disp.vu = (d00 * H0[2] + d01 * H1[2]) / W + d10 * D0[2] + d11 * D1[2];
    disp.kind = 'release';
    return;
  }
  if (smoothAt(track, tau)) {
    disp.e = smooth.e; disp.n = smooth.n; disp.up = smooth.up;
    disp.ve = smooth.ve; disp.vn = smooth.vn; disp.vu = smooth.vu;
    disp.kind = 'smooth';
    return;
  }
  evalAt(track, tau);
  disp.e = P[0]; disp.n = P[1]; disp.up = P[2];
  disp.ve = V[0]; disp.vn = V[1]; disp.vu = V[2];
  disp.kind = tau < 0 ? 'leadIn' : 'plan';
}

/**
 * The direction a formation slot is measured square to, at jet time `tau`,
 * into `slotDir` (a horizontal unit vector, local frame): the chord of the
 * displayed track from τ − smooth_s to τ + smooth_s. The displayed velocity
 * itself is only continuous (its turn rate steps where a window starts and at
 * the release), and a slot square to it would move sideways at slot × turn
 * rate, a velocity step of up to ~160 m/s for a 926 m slot; the chord of a
 * C1 track turns smoothly, so the slot does too. On a straight stretch, and
 * in a steady turn, the chord IS the heading.
 */
export const slotDir = { e: 0, n: 0 };
export function slotDirection(track: JetTrack, tau: number): void {
  const H = track.display.smooth_s;
  let de = 0, dn = 0;
  if (H > 0) {
    displayAt(track, tau + H);
    de = disp.e;
    dn = disp.n;
    displayAt(track, tau - H);
    de -= disp.e;
    dn -= disp.n;
  }
  let len = Math.hypot(de, dn);
  if (!(len > 1e-9)) {
    displayAt(track, tau);
    de = disp.ve;
    dn = disp.vn;
    len = Math.hypot(de, dn);
  }
  slotDir.e = len > 0 ? de / len : 0;
  slotDir.n = len > 0 ? dn / len : 0;
}

/** True heading of a local-frame velocity at jet time `tau`: grid heading plus the interval's grid → true correction. */
export function displayHeading(track: JetTrack, tau: number, ve: number, vn: number): number {
  const S = track.samples;
  const D = track.display;
  const i = tau < 0 || S.n < 2 ? 0 : tau >= S.tau_s[S.n - 1] ? Math.max(S.n - 2, 0) : intervalOf(S.tau_s, S.n, tau);
  const hdg = Math.atan2(ve, vn) * DEG + D.conv_deg[i];
  return ((hdg % 360) + 360) % 360;
}
