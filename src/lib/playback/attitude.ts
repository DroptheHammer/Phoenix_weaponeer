/**
 * The jet's roll and load factor: what a pilot would hold to fly the
 * displayed track. The roll is the angle of the lift vector about the
 * velocity, from the 3D acceleration of the displayed track, so a pull in the
 * vertical (over the top of a pop-up, a dive's roll-in, a loft's escape)
 * rolls the jet past 90° just as a level turn rolls it to atan(v·ω/g).
 *
 * Built once per jet, into a table over jet time; a pose reads it with an
 * index and a blend. So the roll is a pure function of the plan and the time:
 * a scrub, a seek, any speed, a re-time and a rebuilt scene all read the same
 * numbers, and nothing is carried from frame to frame.
 *
 * How the table is made, per node every STEP_S:
 * - The acceleration is the displayed velocity's change over ±ACCEL_HALF_S,
 *   so a turn's load (and its roll) builds over half a second instead of one
 *   frame. The release is a gate: nothing before it sees what comes after.
 * - For the blend after the release the display overshoots its own end
 *   value in the vertical (it must leave with the bomb's velocity and still
 *   land on the egress line on time). Taken literally that would swing the
 *   roll through the horizon for half a second after every release, so the
 *   vertical speed the acceleration is read from is held between its values
 *   at the two ends of the blend. Only the roll reads it: the path is not
 *   touched.
 * - The specific force (acceleration less gravity) square to the velocity
 *   gives the load and the roll. Where it has no usable direction (too slow,
 *   too steep, too little load) the jet is wings level.
 * - The roll is unwrapped the short way round, faded out as the load falls
 *   toward zero, and never allowed to change faster than ROLL_RATE_DPS (a
 *   filter that treats left and right alike). It is drawn LEAD_S early, so
 *   the jet rolls and then pulls. At the release the jet is exactly as it was
 *   (wings level for every family) and rolls away from there at the bound.
 *
 * Every number here is a display constant, like the display's smooth_s: none
 * is a claim about an aircraft.
 */

import { disp, displayAt, releaseBlend_s } from './display';
import type { AttitudeTrack, JetTrack } from './types';

export interface AttitudeConfig {
  /** Table step, s. */
  STEP_S: number;
  /** The acceleration is the velocity's change over ±this, s: the time a load takes to build. */
  ACCEL_HALF_S: number;
  /** The roll is drawn this much early, s, so it ends as the nose starts to swing. */
  LEAD_S: number;
  /** The drawn roll never changes faster than this, °/s. */
  ROLL_RATE_DPS: number;
  /** Below this load, g, the lift's direction is noise: wings level. */
  LOAD_FLOOR_G: number;
  /** From the floor to this load, g, the roll fades in. */
  LOAD_FULL_G: number;
  /** Below this speed, m/s, the velocity's direction is itself unreliable. */
  SPEED_FLOOR_MPS: number;
  /** Above this pitch, °, "up square to the velocity" is undefined. */
  PITCH_MAX_DEG: number;
  /** How much of the vertical acceleration counts: 1 is the full 3D roll. */
  VERTICAL_WEIGHT: number;
  /** Hold the vertical speed inside the release blend between its end values (see above). */
  CLIP_RELEASE_OVERSHOOT: boolean;
  /** The table runs this far before the IP and after the hide time, s. */
  PAD_S: number;
}

export const ATTITUDE: AttitudeConfig = {
  STEP_S: 0.05, ACCEL_HALF_S: 0.25, LEAD_S: 0.25, ROLL_RATE_DPS: 240, LOAD_FLOOR_G: 0.35, LOAD_FULL_G: 0.85,
  SPEED_FLOOR_MPS: 60, PITCH_MAX_DEG: 80, VERTICAL_WEIGHT: 1, CLIP_RELEASE_OVERSHOOT: true, PAD_S: 8,
};

const G_MPS2 = 9.80665;
const DEG = 180 / Math.PI;

const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export interface LiftOut {
  roll_deg: number;
  load_g: number;
}

function liftWith(cfg: AttitudeConfig, ve: number, vn: number, vu: number, ae: number, an: number, au: number, out: LiftOut): void {
  // The speed test comes first: a direction is never formed from a velocity too short to have one.
  const sp = Math.hypot(ve, vn, vu);
  if (!(sp >= cfg.SPEED_FLOOR_MPS)) { out.roll_deg = NaN; out.load_g = 1; return; }
  const vx = ve / sp, vy = vn / sp, vz = vu / sp;
  // Specific force = acceleration − gravity, and gravity points down: so + g on the vertical.
  const fx = ae, fy = an, fz = au + G_MPS2;
  const along = fx * vx + fy * vy + fz * vz;
  const px = fx - along * vx, py = fy - along * vy, pz = fz - along * vz;
  const load = Math.hypot(px, py, pz) / G_MPS2;
  if (!Number.isFinite(load)) { out.roll_deg = NaN; out.load_g = 1; return; }
  out.load_g = load;
  // Up square to the velocity, and right = velocity × up.
  let ux = -vz * vx, uy = -vz * vy, uz = 1 - vz * vz;
  const ul = Math.hypot(ux, uy, uz);
  const pitch = Math.asin(Math.max(-1, Math.min(1, vz))) * DEG;
  if (load < cfg.LOAD_FLOOR_G || Math.abs(pitch) > cfg.PITCH_MAX_DEG || !(ul >= 1e-6)) { out.roll_deg = NaN; return; }
  ux /= ul; uy /= ul; uz /= ul;
  const rx = vy * uz - vz * uy, ry = vz * ux - vx * uz, rz = vx * uy - vy * ux;
  const lat = px * rx + py * ry + pz * rz;
  const up = px * ux + py * uy + pz * uz;
  out.roll_deg = Math.atan2(lat, up) * DEG;
}

/**
 * One node: the lift roll (deg, 0 = lift straight up, + right wing down,
 * ±180 inverted) and the load factor (g) for a velocity and an acceleration,
 * local east/north/up. `au` is already weighted. Roll NaN when there is no
 * usable direction; load 1 when there is no usable velocity.
 */
export function liftOf(ve: number, vn: number, vu: number, ae: number, an: number, au: number, out: LiftOut): void {
  liftWith(ATTITUDE, ve, vn, vu, ae, an, au, out);
}

function weightWith(cfg: AttitudeConfig, load_g: number): number {
  const x = (load_g - cfg.LOAD_FLOOR_G) / (cfg.LOAD_FULL_G - cfg.LOAD_FLOOR_G);
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

/** 0 at or below LOAD_FLOOR_G, 1 at or above LOAD_FULL_G, smoothstep between. */
export function rollWeight(load_g: number): number {
  return weightWith(ATTITUDE, load_g);
}

function wantedWith(cfg: AttitudeConfig, principal_deg: Float64Array, load_g: ArrayLike<number>, out: Float64Array): void {
  let u = 0;
  for (let i = 0; i < principal_deg.length; i++) {
    const p = principal_deg[i];
    if (Number.isNaN(p)) {
      u = 0;
      out[i] = 0;
      continue;
    }
    u = u + wrap180(p - wrap180(u));
    out[i] = u * weightWith(cfg, load_g[i]);
  }
}

/**
 * Principal lift rolls (deg; NaN = none) and loads → one continuous wanted
 * roll: unwrapped the short way round (a roll through 180° does not jump),
 * wings level where there is no direction, faded out as the load falls.
 */
export function wantedRoll(principal_deg: Float64Array, load_g: Float64Array, out: Float64Array): void {
  wantedWith(ATTITUDE, principal_deg, load_g, out);
}

/**
 * The rate bound, on w[a..b] into out[a..b]: the mean of the smallest curve
 * above w and the largest below it whose slopes are at most rc per node. The
 * mean of two such curves keeps the bound, and a left and a right roll of the
 * same size come out as mirror images (a filter that only limits one side
 * would not).
 */
export function coneMean(w: Float64Array, a: number, b: number, rc: number, out: Float64Array): void {
  const m = b - a + 1;
  if (m <= 0) return;
  const up = new Float64Array(m), lo = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const v = w[a + i];
    up[i] = i > 0 ? Math.max(v, up[i - 1] - rc) : v;
    lo[i] = i > 0 ? Math.min(v, lo[i - 1] + rc) : v;
  }
  for (let i = m - 2; i >= 0; i--) {
    up[i] = Math.max(up[i], up[i + 1] - rc);
    lo[i] = Math.min(lo[i], lo[i + 1] + rc);
  }
  for (let i = 0; i < m; i++) out[a + i] = 0.5 * (up[i] + lo[i]);
}

/** f at fractional index x, linear between nodes, x clamped to [i0, i1]. */
function readAt(f: Float64Array, x: number, i0: number, i1: number): number {
  const c = Math.min(Math.max(x, i0), i1);
  const i = Math.min(Math.floor(c), i1 - 1);
  if (i < i0) return f[i0];
  const u = c - i;
  return f[i] + (f[i + 1] - f[i]) * u;
}

/**
 * The roll and load table of one jet, once, after its track exists (it reads
 * the displayed track). `config` is for the checks only, which build other
 * variants; the scene never passes it.
 */
export function buildAttitude(track: JetTrack, config?: Partial<AttitudeConfig>): AttitudeTrack {
  const cfg: AttitudeConfig = config ? { ...ATTITUDE, ...config } : ATTITUDE;
  const step = cfg.STEP_S;
  const tauR = track.releaseTau_s;

  // The release blend's vertical limits: the arriving vertical speed and the one the blend ends on.
  const W = releaseBlend_s(track);
  const clip = cfg.CLIP_RELEASE_OVERSHOOT && W > 0 && track.anchors.REL != null;
  let vuLo = 0, vuHi = 0;
  if (clip) {
    displayAt(track, tauR);
    const vuA = disp.vu;
    displayAt(track, tauR + W);
    const vuB = disp.vu;
    vuLo = Math.min(vuA, vuB);
    vuHi = Math.max(vuA, vuB);
  }
  // The displayed velocity at x, its vertical part held inside the blend: for the acceleration only.
  const vel = { ve: 0, vn: 0, vu: 0 };
  const velAt = (x: number) => {
    displayAt(track, x);
    vel.ve = disp.ve;
    vel.vn = disp.vn;
    vel.vu = clip && x >= tauR && x <= tauR + W ? Math.min(vuHi, Math.max(vuLo, disp.vu)) : disp.vu;
  };

  // The grid: the release is exactly a node.
  const k0 = Math.ceil((tauR + cfg.PAD_S) / step);
  const tau0 = tauR - k0 * step;
  const iR = k0;
  const n = Math.ceil((track.hideTau_s + cfg.PAD_S - tau0) / step) + 1;
  const principal = new Float64Array(n);
  const loads = new Float64Array(n);
  const lift: LiftOut = { roll_deg: 0, load_g: 1 };
  const d = cfg.ACCEL_HALF_S;
  for (let i = 0; i < n; i++) {
    const tau = tauR + (i - k0) * step;
    // The release is a gate: before it the window stops at the release, after it starts there.
    const hi = tau < tauR ? Math.min(tau + d, tauR) : tau + d;
    const lo = tau >= tauR ? Math.max(tau - d, tauR) : tau - d;
    velAt(hi);
    const he = vel.ve, hn = vel.vn, hu = vel.vu;
    velAt(lo);
    const ae = (he - vel.ve) / (hi - lo), an = (hn - vel.vn) / (hi - lo), au = (hu - vel.vu) / (hi - lo);
    // The arrow points along the node's own displayed velocity, not the held one.
    displayAt(track, tau);
    liftWith(cfg, disp.ve, disp.vn, disp.vu, ae, an, au * cfg.VERTICAL_WEIGHT, lift);
    principal[i] = lift.roll_deg;
    loads[i] = lift.load_g;
  }

  const want = new Float64Array(n);
  wantedWith(cfg, principal, loads, want);

  // The rate bound on each side of the release, and the lead.
  const rc = cfg.ROLL_RATE_DPS * step;
  const lead = cfg.LEAD_S / step;
  const roll = new Float64Array(n);
  const wantA = want.slice(0, iR + 1);
  // The release node belongs to what follows: before it the jet holds what it had.
  wantA[iR] = wantA[iR - 1];
  const fa = new Float64Array(iR + 1);
  coneMean(wantA, 0, iR, rc, fa);
  for (let i = 0; i <= iR; i++) roll[i] = readAt(fa, i + lead, 0, iR);
  const phi0 = roll[iR];
  const fb = new Float64Array(n);
  coneMean(want, iR, n - 1, rc, fb);
  for (let i = iR + 1; i < n; i++) {
    const k = (i - iR) * rc;
    roll[i] = Math.min(phi0 + k, Math.max(phi0 - k, readAt(fb, i + lead, iR, n - 1)));
  }

  return { tau0_s: tau0, step_s: step, n, releaseIndex: iR, roll_deg: roll, load_g: Float32Array.from(loads) };
}

/** The table's fractional index of jet time `tau`, clamped to the table (outside it the jet is straight and level). */
function blendAt(a: AttitudeTrack, f: ArrayLike<number>, tau_s: number): number {
  const x = Math.min(Math.max((tau_s - a.tau0_s) / a.step_s, 0), a.n - 1);
  const i = Math.min(Math.floor(x), a.n - 2);
  if (i < 0) return f[0];
  return f[i] + (f[i + 1] - f[i]) * (x - i);
}

/** The roll at jet time `tau_s`, degrees, right wing down positive, not wrapped. No allocation. */
export function rollAt(a: AttitudeTrack, tau_s: number): number {
  if (!Number.isFinite(tau_s)) return 0;
  return blendAt(a, a.roll_deg, tau_s);
}

/** The load factor at jet time `tau_s`, g. No allocation. */
export function loadAt(a: AttitudeTrack, tau_s: number): number {
  if (!Number.isFinite(tau_s)) return 1;
  return blendAt(a, a.load_g, tau_s);
}
