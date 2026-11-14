/**
 * Jet time along the resampled path. The anchor tiers, strongest first:
 * 1. TOT: the impact is pinned to it later, by one shift per jet (timing.ts).
 * 2. Times the planner states: the pop-up's "track N s" (`trackingTime_s`,
 *    not the 5.0065 s its length at TAS gives, because popupPlanning uses
 *    1.69 ft/s per kt); the loft pull's own sample times; the loft run-in
 *    IP → pull-up as the exact `pullUpTimer_s`; the bomb fall times.
 * 3. Everything else: the planned TAS along the 3D path, the planner's own
 *    "TAS through the profile" assumption (no wind, so TAS·cos γ over ground).
 */

import { FT_PER_NM } from '../popupPlanning';
import { type AltitudeModel, lookup, pullX } from './altitude';
import type { AnchorKind, SpanRule, SpanTiming } from './types';

const FT_S_PER_KT = FT_PER_NM / 3600;

/** A stretch between two anchors whose total time the planner states. */
export interface StatedSpan {
  from: AnchorKind;
  to: AnchorKind;
  i0: number;
  i1: number;
  total_s: number;
  rule: SpanRule;
}

export interface ClockInput {
  s: number[];
  h: number[];
  sRel: number;
  ingress_kt: number;
  egress_kt: number;
  pull?: AltitudeModel['pull'];
  stated: StatedSpan[];
}

/**
 * Time per interval: flown at the planned TAS along its 3D length, or taken
 * from the loft pull's sample times; then each stated span is scaled so its
 * total is exactly the stated number (its intervals keep their proportions).
 * Returns jet time (0 at the IP) and the TAS per interval.
 */
export function integrateTau(c: ClockInput): { tau: number[]; tas: number[] } {
  const n = c.s.length;
  const dt: number[] = new Array(Math.max(n - 1, 0));
  const tas: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    const ds_ft = (c.s[i + 1] - c.s[i]) * FT_PER_NM;
    const len_ft = Math.hypot(ds_ft, c.h[i + 1] - c.h[i]);
    const mid = (c.s[i] + c.s[i + 1]) / 2;
    if (c.pull && mid > c.pull.s0 && mid < c.pull.s1) {
      const t = c.pull.table.t, x = c.pull.table.x;
      dt[i] = lookup(x, t, pullX(c.pull, c.s[i + 1])) - lookup(x, t, pullX(c.pull, c.s[i]));
      tas[i] = len_ft / dt[i] / FT_S_PER_KT;
    } else {
      tas[i] = mid < c.sRel ? c.ingress_kt : c.egress_kt;
      dt[i] = len_ft / (tas[i] * FT_S_PER_KT);
    }
  }
  for (const span of c.stated) {
    if (span.rule === 'stated:pullPath') continue; // already the pull's own times
    let flown = 0;
    for (let i = span.i0; i < span.i1; i++) flown += dt[i];
    if (!(flown > 0)) continue;
    const k = span.total_s / flown;
    for (let i = span.i0; i < span.i1; i++) dt[i] *= k;
  }
  const tau: number[] = new Array(n);
  tau[0] = 0;
  for (let i = 1; i < n; i++) tau[i] = tau[i - 1] + dt[i - 1];
  tas[n - 1] = n > 1 ? tas[n - 2] : c.ingress_kt;
  return { tau, tas };
}

/** The time between consecutive anchors, and which rule set it: for tests and tooltips. */
export function spanTimings(order: { kind: AnchorKind; index: number }[], tau: number[], stated: StatedSpan[]): SpanTiming[] {
  const out: SpanTiming[] = [];
  for (let k = 1; k < order.length; k++) {
    const a = order[k - 1], b = order[k];
    const rule = stated.find((x) => x.i0 <= a.index && b.index <= x.i1)?.rule ?? 'flown';
    out.push({ from: a.kind, to: b.kind, rule, dt_s: tau[b.index] - tau[a.index] });
  }
  return out;
}
