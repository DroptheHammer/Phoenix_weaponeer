/**
 * Altitude along the flight polyline, h(s) in ft AGL over the jet's own target.
 *
 * The side profile (`buildSideProfile`, what the card's side view draws) gives
 * the altitudes; the marker anchors give where they apply. Between them:
 * - by default the side view's straight chord: linear in range to the target
 *   where range is monotonic across the piece, else linear in along-track
 *   distance (linearPieces);
 * - pop-up PDP → APEX → TRK: a monotone C1 cubic through the three planner
 *   points, flat at the apex (a straight-line tent would show a kink there);
 * - loft POP → REL: the planner's own simulated pull (`LoftPlan.pullPath`);
 * - after REL: the side view's egress tip altitude as a ramp, then held.
 */

import type { Coordinates } from '../../types';
import type { SideProfile } from '../../types/attackPicture.types';
import { calculateDistance } from '../coordinates';
import type { LoftPlan } from '../loftPlanning';
import { type Chain, pointAt, sAtRange } from './chain';
import type { AnchorKind, PlaybackFamily } from './types';

export interface Knot {
  s: number;
  h: number;
  kind: AnchorKind;
  source: 'ip' | 'marker' | 'range';
}

/** The loft pull as a table over x (ft from the pull-up point), zero-length intervals removed. */
export interface PullTable {
  x: number[];
  alt: number[];
  t: number[];
}

export interface AltitudeModel {
  at(s: number): number;
  knots: Knot[];
  /** Every s where the shape changes: knots, pull samples, the end of the egress ramp. */
  breakpoints: number[];
  /** Loft only: the pull from POP to REL. */
  pull?: { s0: number; s1: number; table: PullTable };
  warnings: string[];
}

const MARKER_KINDS: readonly AnchorKind[] = ['AP', 'ROLL', 'RUN', 'POP', 'PDP', 'TRK', 'REL'];

/**
 * The knots, walking the side view's segments in flight order (never by kind
 * alone: the loft reuses EGRESS for three different things). The IP takes the
 * first segment's start altitude, which is the IP label's number.
 */
function sideKnots(family: PlaybackFamily, side: SideProfile, anchors: Partial<Record<AnchorKind, number>>, chain: Chain, target: Coordinates) {
  const warnings: string[] = [];
  const knots: Knot[] = [{ s: 0, h: side.points[side.segments[0].from].alt_ft, kind: 'IP', source: 'ip' }];
  const seen = new Set<number>();
  for (const seg of side.segments) {
    if (seg.style === 'bomb' || seg.style === 'egress') continue;
    for (const idx of [seg.from, seg.via, seg.to]) {
      if (idx == null || seen.has(idx)) continue;
      seen.add(idx);
      const pt = side.points[idx];
      const kind = pt.kind as AnchorKind;
      const anchored = MARKER_KINDS.includes(kind) ? anchors[kind] : undefined;
      if (anchored != null) {
        knots.push({ s: anchored, h: pt.alt_ft, kind, source: 'marker' });
      } else if (kind === 'APEX' && family === 'popup' && anchors.PDP != null && anchors.TRK != null) {
        // The planner gives the apex no ground position; the side view's range
        // puts it at half the arc's length, which is the handbook's "halfway".
        let s = sAtRange(chain, target, anchors.PDP, anchors.TRK, pt.dist_nm);
        if (s == null) {
          s = (anchors.PDP + anchors.TRK) / 2;
          warnings.push('The apex range is not on the pull-down arc: the apex is put at the arc\'s middle.');
        }
        knots.push({ s, h: pt.alt_ft, kind: 'APEX', source: 'range' });
      } else if (kind === 'AP' && family === 'dive' && anchors.ROLL != null) {
        // A legacy dive with no action point: the side view holds the ingress
        // altitude until its schematic AP (roll-in + 3 nm), then descends.
        let s = sAtRange(chain, target, 0, anchors.ROLL, pt.dist_nm);
        if (s == null) {
          s = 0;
          warnings.push('The side view\'s action point is behind the IP: the descent to the roll-in starts at the IP.');
        }
        knots.push({ s, h: pt.alt_ft, kind: 'AP', source: 'range' });
      }
      // Anything else has no knot: the loft's run-in start (the IP knot carries
      // its altitude) and a level's schematic action point (one altitude anyway).
    }
  }
  knots.sort((a, b) => a.s - b.s);
  return { knots, warnings };
}

/** Cubic Hermite on [s0, s1]; slopes m0, m1 in ft per nm of s. */
function hermite(s0: number, h0: number, m0: number, s1: number, h1: number, m1: number) {
  const L = s1 - s0;
  return (s: number) => {
    const u = (s - s0) / L;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * h0 + (u3 - 2 * u2 + u) * L * m0 + (-2 * u3 + 3 * u2) * h1 + (u3 - u2) * L * m1;
  };
}

/**
 * A slope that keeps a Hermite piece monotone when the other end's slope is 0
 * (Fritsch–Carlson: 0 ≤ m/secant ≤ 3), so the curve never rises above the apex
 * or dips below either end.
 */
function monotoneSlope(m: number, secant: number): number {
  if (secant === 0) return 0;
  const r = m / secant;
  if (!(r > 0)) return 0;
  return r > 3 ? 3 * secant : m;
}

const knotOf = (knots: Knot[], kind: AnchorKind) => knots.find((k) => k.kind === kind);

/** One-sided slope step, nm: far below a sample spacing, far above rounding. */
const SLOPE_DS_NM = 1e-5;

/**
 * PDP → APEX → TRK, C1, zero slope at the apex, matching the slopes of the
 * pieces on either side (the climb arriving at PDP, the dive leaving TRK)
 * where it can.
 */
function popupPullDown(knots: Knot[], linear: (s: number) => number) {
  const pop = knotOf(knots, 'POP'), pdp = knotOf(knots, 'PDP'), apex = knotOf(knots, 'APEX'), trk = knotOf(knots, 'TRK'), rel = knotOf(knots, 'REL');
  if (!pop || !pdp || !apex || !trk || !rel || !(pdp.s < apex.s && apex.s < trk.s)) return undefined;
  const dsIn = Math.min(SLOPE_DS_NM, (pdp.s - pop.s) / 2), dsOut = Math.min(SLOPE_DS_NM, (rel.s - trk.s) / 2);
  const climb = dsIn > 0 ? (pdp.h - linear(pdp.s - dsIn)) / dsIn : 0;
  const dive = dsOut > 0 ? (linear(trk.s + dsOut) - trk.h) / dsOut : 0;
  const up = hermite(pdp.s, pdp.h, monotoneSlope(climb, (apex.h - pdp.h) / (apex.s - pdp.s)), apex.s, apex.h, 0);
  const down = hermite(apex.s, apex.h, 0, trk.s, trk.h, monotoneSlope(dive, (trk.h - apex.h) / (trk.s - apex.s)));
  return { s0: pdp.s, s1: trk.s, at: (s: number) => (s <= apex.s ? up(s) : down(s)) };
}

/**
 * The pull as a table. `planLoft` repeats its final point when the pull takes
 * a whole multiple of 100 integration steps (about 1% of inputs): a
 * zero-length interval that would divide by zero, so any point that does not
 * move forward is dropped.
 */
export function pullTable(plan: LoftPlan): PullTable {
  const table: PullTable = { x: [], alt: [], t: [] };
  for (const p of plan.pullPath) {
    const n = table.x.length;
    if (n > 0 && !(p.x_ft > table.x[n - 1])) continue;
    table.x.push(p.x_ft);
    table.alt.push(p.alt_ft);
    table.t.push(p.t_s ?? NaN);
  }
  return table;
}

/** Linear lookup in a table over x; clamped at the ends. */
export function lookup(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / (xs[hi] - xs[lo]);
}

/** Map s on the climb line to x along the pull, by fraction, so both ends match exactly. */
export function pullX(pull: NonNullable<AltitudeModel['pull']>, s: number): number {
  const xs = pull.table.x;
  return ((s - pull.s0) / (pull.s1 - pull.s0)) * xs[xs.length - 1];
}

/** Samples per piece for the monotonic-range test (plus every chain vertex inside the piece). */
const RANGE_PROBES = 64;

/**
 * Each linear piece between knots as the side view draws it. The side view
 * plots altitude against RANGE to the target and joins its points with
 * straight chords, so where range changes monotonically across a piece (the
 * pop-up climb, a dive's offset descent: lines that are not radial) the
 * altitude is linear in range, and in the side-on view (`sideCoords`) the
 * climb is the card's straight chord, not a bow off it (linear in s bowed up
 * to 122 ft off on the pop-up climb). Where range is not monotonic (a level
 * leg past cot θ) or the piece is level, it is linear in s. Both forms meet
 * the knots exactly.
 */
function linearPieces(knots: Knot[], chain: Chain, target: Coordinates) {
  const rangeAt = (s: number) => calculateDistance(pointAt(chain, s), target);
  const pieces = knots.slice(1).map((b, i) => {
    const a = knots[i];
    if (!(b.s > a.s) || a.h === b.h || !chain.segs.length) return { a, b, ra: 0, rb: 0, byRange: false };
    const ss = [a.s, ...chain.vertices.map((v) => v.s).filter((s) => s > a.s && s < b.s)];
    for (let k = 1; k < RANGE_PROBES; k++) ss.push(a.s + ((b.s - a.s) * k) / RANGE_PROBES);
    ss.push(b.s);
    ss.sort((x, y) => x - y);
    const rs = ss.map(rangeAt);
    const ra = rs[0], rb = rs[rs.length - 1];
    const dir = Math.sign(rb - ra);
    const byRange = dir !== 0 && rs.every((r, k) => k === 0 || Math.sign(r - rs[k - 1]) === dir);
    return { a, b, ra, rb, byRange };
  });
  return (s: number): number => {
    if (s <= knots[0].s) return knots[0].h;
    for (const p of pieces) {
      if (s > p.b.s) continue;
      if (!(p.b.s > p.a.s)) return p.b.h;
      if (p.byRange) {
        const u = (rangeAt(s) - p.ra) / (p.rb - p.ra);
        return p.a.h + (p.b.h - p.a.h) * Math.min(1, Math.max(0, u));
      }
      return p.a.h + ((p.b.h - p.a.h) * (s - p.a.s)) / (p.b.s - p.a.s);
    }
    return knots[knots.length - 1].h;
  };
}

/**
 * The egress: only the side view's altitude change is reused, over the same
 * along-track distance, never its range (the side view points the tip back
 * toward the target, which the plan egress never does).
 */
function egressRamp(side: SideProfile, sRel: number) {
  const seg = side.segments.find((x) => x.style === 'egress');
  if (!seg) return undefined;
  const from = side.points[seg.from], to = side.points[seg.to];
  const len = Math.abs(from.dist_nm - to.dist_nm);
  return {
    end: sRel + len,
    at: (s: number) => (len > 0 ? from.alt_ft + (to.alt_ft - from.alt_ft) * Math.min((s - sRel) / len, 1) : to.alt_ft),
  };
}

export function buildAltitude(
  family: PlaybackFamily,
  side: SideProfile,
  anchors: Partial<Record<AnchorKind, number>>,
  chain: Chain,
  target: Coordinates,
  loftPlan: LoftPlan | undefined,
): AltitudeModel {
  const { knots, warnings } = sideKnots(family, side, anchors, chain, target);
  const sRel = anchors.REL!;
  const relKnot = knotOf(knots, 'REL');
  const ramp = egressRamp(side, sRel);
  const linear = linearPieces(knots, chain, target);
  const pullDown = family === 'popup' ? popupPullDown(knots, linear) : undefined;
  const pull =
    family === 'loft' && loftPlan && anchors.POP != null && anchors.POP < sRel
      ? { s0: anchors.POP, s1: sRel, table: pullTable(loftPlan) }
      : undefined;

  const at = (s: number): number => {
    if (s >= sRel) return ramp ? ramp.at(s) : (relKnot?.h ?? linear(sRel));
    if (pull && s >= pull.s0) return lookup(pull.table.x, pull.table.alt, pullX(pull, s));
    if (pullDown && s >= pullDown.s0 && s <= pullDown.s1) return pullDown.at(s);
    return linear(s);
  };

  const breakpoints = knots.map((k) => k.s);
  if (pull) for (const x of pull.table.x) breakpoints.push(pull.s0 + (x / pull.table.x[pull.table.x.length - 1]) * (pull.s1 - pull.s0));
  if (ramp && ramp.end < chain.length_nm) breakpoints.push(ramp.end);
  return { at, knots, breakpoints, pull, warnings };
}
