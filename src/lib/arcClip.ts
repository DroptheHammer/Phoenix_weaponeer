import type { Rect } from './labelLayout';

/**
 * Which parts of a circle actually fall inside a rectangle, as angular spans.
 *
 * The kneeboard's plan view used to draw each threat ring as one whole circle
 * and lean on `ctx.clip()` to trim it to the diagram box. That does not hold:
 * on a real card an SA-11 ring came out with a 1,009 px radius centred 454 px
 * *below* the box, and the canvas stroked the whole circle anyway — a red arc
 * across the threat table and the header, well outside the clip. Rather than
 * work out which canvas implementations honour a clip for a path far larger
 * than the surface, we never hand them the path: only the spans that are
 * genuinely visible are stroked.
 *
 * Angles are screen-space `atan2(dy, dx)`, the same convention `ctx.arc` uses
 * (y grows downward), so a returned `[a0, a1]` can be passed straight to
 * `ctx.arc(cx, cy, r, a0, a1)` with the default clockwise sweep.
 *
 * Returns an empty array when no part of the circle is inside — including the
 * case that matters most on a small card: the box sitting entirely *within* a
 * huge engagement ring. Nothing draws, because the ring's edge is nowhere in
 * frame; that you are inside it is what the THREATS IN AREA table is for.
 */
export function visibleArcSpans(cx: number, cy: number, r: number, box: Rect): Array<[number, number]> {
  if (!(r > 0) || !Number.isFinite(r) || !Number.isFinite(cx) || !Number.isFinite(cy)) return [];

  const left = box.x;
  const right = box.x + box.w;
  const top = box.y;
  const bottom = box.y + box.h;

  // A hair of tolerance so a circle grazing an edge does not produce a
  // zero-width span that strokes as a stray dot.
  const eps = 1e-6;
  const inside = (x: number, y: number) =>
    x >= left - eps && x <= right + eps && y >= top - eps && y <= bottom + eps;

  const angles: number[] = [];
  const push = (x: number, y: number) => angles.push(Math.atan2(y - cy, x - cx));

  // Crossings of the two vertical edges: solve (x-cx)^2 + (y-cy)^2 = r^2 for y.
  for (const x of [left, right]) {
    const dx = x - cx;
    const under = r * r - dx * dx;
    if (under <= 0) continue;
    const dy = Math.sqrt(under);
    for (const y of [cy - dy, cy + dy]) {
      if (y >= top - eps && y <= bottom + eps) push(x, y);
    }
  }
  // Crossings of the two horizontal edges.
  for (const y of [top, bottom]) {
    const dy = y - cy;
    const under = r * r - dy * dy;
    if (under <= 0) continue;
    const dx = Math.sqrt(under);
    for (const x of [cx - dx, cx + dx]) {
      if (x >= left - eps && x <= right + eps) push(x, y);
    }
  }

  const TWO_PI = Math.PI * 2;
  const norm = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

  if (angles.length === 0) {
    // No crossings: the circle is wholly inside the box, wholly outside it, or
    // wholly around it. One sample point settles which.
    return inside(cx + r, cy) ? [[0, TWO_PI]] : [];
  }

  const sorted = [...new Set(angles.map(norm))].sort((a, b) => a - b);
  const spans: Array<[number, number]> = [];
  for (let i = 0; i < sorted.length; i++) {
    const a0 = sorted[i];
    const a1 = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TWO_PI;
    if (a1 - a0 < 1e-9) continue;
    const mid = (a0 + a1) / 2;
    if (inside(cx + r * Math.cos(mid), cy + r * Math.sin(mid))) spans.push([a0, a1]);
  }
  return spans;
}
