/**
 * Turning the chain, the altitude model and the clock into stored samples:
 * the plan layer's structure of arrays, with local metres precomputed so the
 * 60 fps path does no trigonometry.
 */

import type { Coordinates } from '../../types';
import { calculateBearing, calculateDestination, calculateDistance } from '../coordinates';
import { type Chain, pointAt, segIndexAt } from './chain';
import { toLocal, upOf } from './frame';
import { phaseIndex } from './phases';
import type { LocalFrame, PlaybackPhase, TrackSamples } from './types';

/** Two grid points closer than this are one. */
const SAME_S_NM = 1e-9;
/** Spacing of the stored extension past the drawn egress leg (straight, so coarse is exact enough). */
const EXTENSION_DS_NM = 0.1;

/**
 * The s grid: every `exact` value verbatim (anchors and vertices, so a sample
 * sits exactly on each), every `soft` value unless an exact one is within
 * 1e-9 nm, then filled so no gap exceeds `ds`.
 */
export function sGrid(exact: number[], soft: number[], end: number, ds: number): number[] {
  const all = [...exact.map((s) => ({ s, exact: true })), ...soft.map((s) => ({ s, exact: false }))]
    .filter((p) => p.s >= 0 && p.s <= end && Number.isFinite(p.s))
    .sort((a, b) => a.s - b.s);
  const kept: { s: number; exact: boolean }[] = [];
  for (const p of all) {
    const last = kept[kept.length - 1];
    if (last && p.s - last.s < SAME_S_NM) {
      if (p.exact && !last.exact) kept[kept.length - 1] = p;
      continue;
    }
    kept.push(p);
  }
  const grid: number[] = [];
  for (let i = 0; i < kept.length; i++) {
    if (i > 0) {
      const a = kept[i - 1].s, b = kept[i].s;
      const k = Math.ceil((b - a) / ds);
      for (let j = 1; j < k; j++) grid.push(a + ((b - a) * j) / k);
    }
    grid.push(kept[i].s);
  }
  return grid;
}

/** The index of a value that was put in the grid verbatim. */
export function gridIndex(grid: number[], s: number): number {
  let lo = 0;
  let hi = grid.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (grid[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Columns being filled, before they become typed arrays. Interval columns (phase) describe i → i + 1. */
export interface Columns {
  s: number[];
  tau: number[];
  lat: number[];
  lon: number[];
  agl: number[];
  tas: number[];
  phase: PlaybackPhase[];
}

export function chainColumns(chain: Chain, s: number[], h: number[], tau: number[], tas: number[]): Columns {
  const cols: Columns = { s: [...s], tau: [...tau], lat: [], lon: [], agl: [...h], tas: [...tas], phase: [] };
  for (let i = 0; i < s.length; i++) {
    const p = pointAt(chain, s[i]);
    cols.lat.push(p.lat);
    cols.lon.push(p.lon);
    const mid = i < s.length - 1 ? (s[i] + s[i + 1]) / 2 : s[i];
    // The chain never holds a `bomb` line, so its styles are all phases.
    cols.phase.push(chain.segs[segIndexAt(chain, mid)].style as PlaybackPhase);
  }
  return cols;
}

/**
 * Past the drawn egress leg the jet flies on along the same great circle, at
 * the egress speed and the held egress altitude, until `untilTau`. This is
 * exactly what `egressPath` would have drawn with a longer leg.
 */
export function appendExtension(cols: Columns, rollOut: Coordinates, end: Coordinates, speed_kt: number, untilTau: number): void {
  const n = cols.s.length;
  const tau0 = cols.tau[n - 1];
  const extra_nm = ((untilTau - tau0) * speed_kt) / 3600;
  if (!(extra_nm > 0)) return;
  const bearing = calculateBearing(rollOut, end);
  const leg = calculateDistance(rollOut, end);
  const steps = Math.max(1, Math.ceil(extra_nm / EXTENSION_DS_NM));
  cols.phase[n - 1] = 'extension';
  for (let j = 1; j <= steps; j++) {
    const d = (extra_nm * j) / steps;
    const p = calculateDestination(rollOut, bearing, leg + d);
    cols.s.push(cols.s[n - 1] + d);
    cols.tau.push(j === steps ? untilTau : tau0 + (d / speed_kt) * 3600);
    cols.lat.push(p.lat);
    cols.lon.push(p.lon);
    cols.agl.push(cols.agl[n - 1]);
    cols.tas.push(speed_kt);
    cols.phase.push('extension');
  }
}

/** Typed arrays, local metres, MSL over the jet's own target, and per-interval kinematics. */
export function finishSamples(cols: Columns, frame: LocalFrame, targetElevation_ft: number): TrackSamples {
  const n = cols.s.length;
  const f = () => new Float64Array(n);
  const S: TrackSamples = {
    n, tau_s: Float64Array.from(cols.tau), s_nm: Float64Array.from(cols.s), lat: Float64Array.from(cols.lat), lon: Float64Array.from(cols.lon),
    e_m: f(), n_m: f(), up_m: f(), agl_ft: Float64Array.from(cols.agl), msl_ft: f(), tas_kt: Float64Array.from(cols.tas),
    phase: Uint8Array.from(cols.phase.map(phaseIndex)), heading_deg: f(), pitch_deg: f(), ve_mps: f(), vn_mps: f(), vu_mps: f(),
  };
  for (let i = 0; i < n; i++) {
    const local = toLocal(frame, { lat: S.lat[i], lon: S.lon[i] });
    S.e_m[i] = local.e_m;
    S.n_m[i] = local.n_m;
    S.msl_ft[i] = targetElevation_ft + S.agl_ft[i];
    S.up_m[i] = upOf(frame, S.msl_ft[i]);
  }
  for (let i = 0; i < n - 1; i++) {
    const dt = S.tau_s[i + 1] - S.tau_s[i];
    const de = S.e_m[i + 1] - S.e_m[i], dn = S.n_m[i + 1] - S.n_m[i], du = S.up_m[i + 1] - S.up_m[i];
    S.ve_mps[i] = de / dt;
    S.vn_mps[i] = dn / dt;
    S.vu_mps[i] = du / dt;
    S.heading_deg[i] = calculateBearing({ lat: S.lat[i], lon: S.lon[i] }, { lat: S.lat[i + 1], lon: S.lon[i + 1] });
    S.pitch_deg[i] = (Math.atan2(du, Math.hypot(de, dn)) * 180) / Math.PI;
  }
  if (n > 1) {
    for (const col of [S.ve_mps, S.vn_mps, S.vu_mps, S.heading_deg, S.pitch_deg]) col[n - 1] = col[n - 2];
    S.phase[n - 1] = S.phase[n - 2];
  }
  return S;
}
