/**
 * The box the playback needs, in local metres: for sizing the terrain (B2)
 * and keying its cache. It takes no timing on purpose: the box must not move
 * while a delay slider is dragged. So each jet's lead-in is taken whole, as
 * far back as it can ever be shown (maxLeadIn_nm behind its IP), not only as
 * far as the plan delays' window reaches: at any delay, every visible point
 * is inside.
 */

import { NM_TO_M } from './frame';
import type { PlaybackBounds, StrikePlayback } from './types';

/** Slack for the floating-point difference between the display's averages and the samples they average, m. */
const PAD_M = 1;

export function playbackBounds(pb: StrikePlayback): PlaybackBounds {
  const b: PlaybackBounds = { min_e_m: Infinity, max_e_m: -Infinity, min_n_m: Infinity, max_n_m: -Infinity, min_up_m: Infinity, max_up_m: -Infinity };
  const add = (e: number, n: number, up: number) => {
    if (e < b.min_e_m) b.min_e_m = e;
    if (e > b.max_e_m) b.max_e_m = e;
    if (n < b.min_n_m) b.min_n_m = n;
    if (n > b.max_n_m) b.max_n_m = n;
    if (up < b.min_up_m) b.min_up_m = up;
    if (up > b.max_up_m) b.max_up_m = up;
  };
  if (!pb.jets.length) return { min_e_m: 0, max_e_m: 0, min_n_m: 0, max_n_m: 0, min_up_m: 0, max_up_m: 0 };
  pb.jets.forEach((j) => {
    const S = j.samples;
    for (let i = 0; i < S.n; i++) add(S.e_m[i], S.n_m[i], S.up_m[i]);
    const B = j.bomb;
    for (let i = 0; i < B.n; i++) add(B.e_m[i], B.n_m[i], B.up_m[i]);
    // The whole capped lead-in (straight, so its far end bounds it).
    const L = j.display.leadIn;
    add(S.e_m[0] - L.ve_mps * L.capTau_s, S.n_m[0] - L.vn_mps * L.capTau_s, L.up_m);
  });
  // The display layer stays inside: its corners are averages of the plan track, and
  // the formation slot (at most one slot per other jet) is added sideways.
  const side = pb.options.formationSpacing_nm * NM_TO_M * (pb.jets.length - 1) + PAD_M;
  b.min_e_m -= side;
  b.max_e_m += side;
  b.min_n_m -= side;
  b.max_n_m += side;
  b.min_up_m -= PAD_M;
  b.max_up_m += PAD_M;
  return b;
}
