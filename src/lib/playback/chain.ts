/**
 * The flight polyline: the picture's lines the jet flies (route, leg, climb,
 * pullDown, attack, egress, egressLeg; never `bomb`), chained into one path
 * with an along-track ground distance `s` from the IP.
 *
 * Points between vertices are interpolated linearly in lat/lon. That is on
 * purpose: the card's projection is affine in lat/lon, so every interpolated
 * point lies exactly on the line the card draws.
 */

import type { Coordinates } from '../../types';
import type { AttackPicture, LineStyleKey } from '../../types/attackPicture.types';
import { calculateDistance } from '../coordinates';

const FLOWN: readonly LineStyleKey[] = ['route', 'leg', 'climb', 'pullDown', 'attack', 'egress', 'egressLeg'];

/** Shorter than this a pair of points is one point. */
const SAME_POINT_NM = 1e-9;

export interface ChainSeg {
  a: Coordinates;
  b: Coordinates;
  style: LineStyleKey;
  s0: number;
  len: number;
}

export interface ChainVertex {
  p: Coordinates;
  s: number;
  /** The style of the picture line this vertex belongs to. */
  style: LineStyleKey;
  /** First point of its picture line. */
  lineStart: boolean;
}

export interface Chain {
  segs: ChainSeg[];
  vertices: ChainVertex[];
  length_nm: number;
}

/**
 * Chain the flown lines in picture order. Where a line does not start on its
 * predecessor's last point a join segment carrying the next line's style is
 * inserted. The shipped pictures have one such gap: the pop-up pull-down arc's
 * last point is recomputed from the arc centre and sits 1.018 ft from the
 * track point where the attack line starts.
 */
export function buildChain(picture: AttackPicture): Chain {
  const segs: ChainSeg[] = [];
  const vertices: ChainVertex[] = [];
  let s = 0;
  let last: Coordinates | undefined;
  const push = (a: Coordinates, b: Coordinates, style: LineStyleKey) => {
    const len = calculateDistance(a, b);
    if (!(len > SAME_POINT_NM)) return false;
    segs.push({ a, b, style, s0: s, len });
    s += len;
    return true;
  };
  for (const line of picture.lines) {
    if (!FLOWN.includes(line.style) || line.points.length === 0) continue;
    const first = line.points[0];
    if (last) push(last, first, line.style); // the join segment, when there is a gap
    vertices.push({ p: first, s, style: line.style, lineStart: true });
    last = first;
    for (let i = 1; i < line.points.length; i++) {
      if (push(last, line.points[i], line.style)) last = line.points[i];
      vertices.push({ p: line.points[i], s, style: line.style, lineStart: false });
    }
  }
  return { segs, vertices, length_nm: s };
}

/** The segment holding `s` (the first one when `s` is on a vertex), clamped to the chain. */
export function segIndexAt(chain: Chain, s: number): number {
  const segs = chain.segs;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].s0 + segs[mid].len < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The point at along-track distance `s`; exactly the vertex at a vertex. */
export function pointAt(chain: Chain, s: number): Coordinates {
  const g = chain.segs[segIndexAt(chain, s)];
  const u = (s - g.s0) / g.len;
  if (u <= 0) return g.a;
  if (u >= 1) return g.b;
  return { lat: g.a.lat + (g.b.lat - g.a.lat) * u, lon: g.a.lon + (g.b.lon - g.a.lon) * u };
}

/**
 * The `s` of the first vertex at or after `fromS` lying within `tol_nm` of
 * `pos`. Markers reuse line points exactly, so the default tolerance is a
 * same-point test; that is also what keeps the pop-up TRK on the attack line's
 * first vertex rather than on the pull-down arc's end, 1 ft away.
 */
export function vertexS(chain: Chain, pos: Coordinates, fromS: number, tol_nm = 1e-6): number | undefined {
  for (const v of chain.vertices) {
    if (v.s >= fromS && calculateDistance(v.p, pos) < tol_nm) return v.s;
  }
  return undefined;
}

/** The `s` where the first vertex of the first line of this style sits. */
export function lineStartS(chain: Chain, style: LineStyleKey): number | undefined {
  return chain.vertices.find((v) => v.lineStart && v.style === style)?.s;
}

/**
 * The first `s` in [lo, hi] where the range to `target` comes down through
 * `range_nm`, by a scan and a bisection. Only for the two side points that
 * have no marker (the pop-up apex, a legacy dive's schematic action point):
 * range is not monotonic along every path (the level leg past cot θ), so
 * nothing else is joined by range.
 */
export function sAtRange(chain: Chain, target: Coordinates, lo: number, hi: number, range_nm: number): number | undefined {
  const f = (s: number) => calculateDistance(pointAt(chain, s), target) - range_nm;
  const steps = 400;
  let a = lo;
  let fa = f(lo);
  if (fa === 0) return lo;
  for (let k = 1; k <= steps; k++) {
    const b = lo + ((hi - lo) * k) / steps;
    const fb = f(b);
    if (fa > 0 && fb <= 0) {
      let x0 = a;
      let x1 = b;
      for (let i = 0; i < 60; i++) {
        const mid = (x0 + x1) / 2;
        if (f(mid) > 0) x0 = mid;
        else x1 = mid;
      }
      return (x0 + x1) / 2;
    }
    a = b;
    fa = fb;
  }
  return undefined;
}

/** True heading change between consecutive segments above this is a reversal (a backwards drawn leg). */
export const REVERSAL_DEG = 150;
