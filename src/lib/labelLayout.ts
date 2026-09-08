/**
 * Greedy label placement in pixel space, shared by the kneeboard canvas and
 * the live map overlay so both keep attack-picture labels legible instead of
 * stacking them on a fixed offset. Pure pixel geometry — the caller supplies
 * a `CanvasRenderingContext2D` (even an offscreen one) purely to measure text.
 */

import type { LabelSide } from '../types/attackPicture.types';

export type Rect = { x: number; y: number; w: number; h: number };

export interface LabelRequest {
  lines: string[];
  anchor: [number, number];
  side: LabelSide;
  style?: { bg?: string; fg?: string; border?: string };
  size?: number;
  /** Radius of the circle this label points at, so a leader stops on the marker's edge rather than striking through its letters. Points on a line have no circle: leave it 0/undefined. */
  anchorRadius?: number;
}

export interface PlacedLabel extends LabelRequest {
  rect: Rect;
  /** True when the box sits away from its point and needs a leader line. */
  leader: boolean;
}

const SANS = "'Arial Narrow', Arial, sans-serif";

const SIDE_ORDER: Record<LabelSide, LabelSide[]> = {
  top: ['top', 'right', 'left', 'bottom'],
  bottom: ['bottom', 'right', 'left', 'top'],
  left: ['left', 'top', 'bottom', 'right'],
  right: ['right', 'top', 'bottom', 'left'],
};

function labelSize(ctx: CanvasRenderingContext2D, req: LabelRequest): { w: number; h: number; lineH: number } {
  const size = req.size ?? 11;
  ctx.font = `bold ${size}px ${SANS}`;
  const lineH = size + 4;
  const textW = Math.max(...req.lines.map((l) => ctx.measureText(l).width));
  return { w: textW + 12, h: req.lines.length * lineH + 6, lineH };
}

function candidateRect(anchor: [number, number], side: LabelSide, gap: number, shift: number, w: number, h: number): Rect {
  const [ax, ay] = anchor;
  switch (side) {
    case 'top':
      return { x: ax - w / 2 + shift, y: ay - gap - h, w, h };
    case 'bottom':
      return { x: ax - w / 2 + shift, y: ay + gap, w, h };
    case 'left':
      return { x: ax - gap - w, y: ay - h / 2 + shift, w, h };
    default:
      return { x: ax + gap, y: ay - h / 2 + shift, w, h };
  }
}

/**
 * Greedy placement: each label tries its own side close in, then further out,
 * then shifted sideways, then the other sides. Anything already placed and
 * every marker is an obstacle. If nothing is clear it takes the least-bad spot.
 */
export function layoutLabels(ctx: CanvasRenderingContext2D, requests: LabelRequest[], obstacles: Rect[], bounds: Rect): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const blocked = [...obstacles];
  const inside = (r: Rect) => r.x >= bounds.x + 2 && r.y >= bounds.y + 2 && r.x + r.w <= bounds.x + bounds.w - 2 && r.y + r.h <= bounds.y + bounds.h - 2;
  const overlapArea = (r: Rect) =>
    blocked.reduce((sum, b) => {
      const w = Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x);
      const h = Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y);
      return sum + (w > 0 && h > 0 ? w * h : 0);
    }, 0);

  for (const req of requests) {
    const { w, h } = labelSize(ctx, req);
    let best: { rect: Rect; leader: boolean; score: number } | undefined;
    // A clear spot always beats an overlapping one, however far out it sits —
    // scoring the two against each other would trade legibility for closeness.
    let clear = false;
    outer: for (const side of SIDE_ORDER[req.side]) {
      for (const gap of [18, 30, 46, 66, 90, 120, 155, 195]) {
        for (const shift of [0, -w * 0.35, w * 0.35, -w * 0.7, w * 0.7, -w * 1.05, w * 1.05, -w * 1.4, w * 1.4]) {
          const rect = candidateRect(req.anchor, side, gap, shift, w, h);
          if (!inside(rect)) continue;
          const area = overlapArea(rect);
          const leader = gap > 24 || Math.abs(shift) > 1;
          if (area === 0) {
            best = { rect, leader, score: 0 };
            clear = true;
            break outer;
          }
          const score = area + gap * 2 + Math.abs(shift);
          if (!best || score < best.score) best = { rect, leader, score };
        }
      }
    }
    // Full-frame sweep when clustered attacks block the whole near field.
    // A leader line makes even a distant box legible, better than an overlap.
    if (!clear) {
      const [ax, ay] = req.anchor;
      const step = 28;
      let sweepBest: { rect: Rect; distSq: number } | undefined;
      for (let y = bounds.y + 2; y + h <= bounds.y + bounds.h - 2; y += step) {
        for (let x = bounds.x + 2; x + w <= bounds.x + bounds.w - 2; x += step) {
          const rect: Rect = { x, y, w, h };
          if (overlapArea(rect) === 0) {
            const cx = x + w / 2, cy = y + h / 2;
            const distSq = (cx - ax) * (cx - ax) + (cy - ay) * (cy - ay);
            if (!sweepBest || distSq < sweepBest.distSq) sweepBest = { rect, distSq };
          }
        }
      }
      if (sweepBest) best = { rect: sweepBest.rect, leader: true, score: 0 };
    }
    if (!best) {
      const rect = candidateRect(req.anchor, req.side, 18, 0, w, h);
      rect.x = Math.min(Math.max(rect.x, bounds.x + 2), bounds.x + bounds.w - w - 2);
      rect.y = Math.min(Math.max(rect.y, bounds.y + 2), bounds.y + bounds.h - h - 2);
      best = { rect, leader: true, score: 0 };
    }
    placed.push({ ...req, rect: best.rect, leader: best.leader });
    blocked.push(best.rect);
  }
  return placed;
}

/**
 * How far apart, in screen pixels, a set of projected points is spread —
 * the diagonal of their bounding box.
 */
export function pixelSpan(points: [number, number][]): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return 0;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const w = maxX - minX;
  const h = maxY - minY;
  return Math.sqrt(w * w + h * h);
}

/**
 * Below this many pixels of span, an attack's markers are a clump and its
 * step-by-step callouts cannot point at anything distinguishable.
 */
export const LEGIBLE_SPAN_PX = 150;

/**
 * Is this attack drawn large enough on screen for its callouts to be worth
 * placing? Below the threshold the map shows one tag naming the attack instead.
 */
export function labelsAreLegible(points: [number, number][]): boolean {
  return pixelSpan(points) >= LEGIBLE_SPAN_PX;
}

/**
 * Where a leader line runs: from the nearest edge of the label box to the edge
 * of the marker it points at, never to its centre — a line drawn to the centre
 * strikes through the letters printed on the marker.
 *
 * Returns undefined when the box is already touching the marker, so there is
 * nothing left to draw.
 */
export function leaderLine(label: PlacedLabel): { from: [number, number]; to: [number, number] } | undefined {
  const [ax, ay] = label.anchor;
  const { x, y, w, h } = label.rect;
  const radius = label.anchorRadius ?? 0;

  // Nearest point on the label box to the anchor
  const nx = Math.min(Math.max(ax, x), x + w);
  const ny = Math.min(Math.max(ay, y), y + h);

  // Vector from nearest edge to anchor
  const dx = ax - nx;
  const dy = ay - ny;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Box already touching or inside the marker circle — nothing to draw
  if (dist <= radius || dist < 0.01) return undefined;

  // Pull the anchor back toward the box edge by the marker radius
  const scale = (dist - radius) / dist;
  const tx = nx + dx * scale;
  const ty = ny + dy * scale;

  return { from: [nx, ny], to: [tx, ty] };
}

/**
 * Where an off-frame point enters the picture: the crossing of the segment
 * from an off-screen point to an on-screen one with the frame edge.
 *
 * The IP is usually a dozen miles outside a frame drawn around the attack, but
 * it is where the pilot starts flying the plan, so its tag is pinned to the
 * edge the run-in comes in through instead of vanishing.
 *
 * Returns undefined when the outboard point is already inside, or when the
 * inboard point is off-frame too and there is nothing sensible to point at.
 */
export function edgeCrossing(outboard: [number, number], inboard: [number, number], bounds: Rect, inset = 8): [number, number] | undefined {
  const [ox, oy] = outboard;
  const [ix, iy] = inboard;
  const { x, y, w, h } = bounds;

  const isInside = (px: number, py: number) => px >= x && px <= x + w && py >= y && py <= y + h;

  // Outboard already inside — nothing to pin
  if (isInside(ox, oy)) return undefined;

  // Inboard also outside — no sensible crossing
  if (!isInside(ix, iy)) return undefined;

  // Liang–Barsky: clip the parametric segment outboard + t·(inboard − outboard)
  // to the frame. Each edge contributes one (p, q) pair; t0 ends up at the
  // point where the segment enters.
  let t0 = 0, t1 = 1;
  const dx = ix - ox, dy = iy - oy;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0; // parallel to this edge: only fails if outside it
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (!clip(-dx, ox - x)) return undefined;
  if (!clip(dx, x + w - ox)) return undefined;
  if (!clip(-dy, oy - y)) return undefined;
  if (!clip(dy, y + h - oy)) return undefined;

  // The entry point is at t0 (outboard end of the clipped segment)
  const cx = ox + t0 * dx;
  const cy = oy + t0 * dy;

  // Pull inset pixels inside the bounds
  const nx = Math.max(x + inset, Math.min(cx, x + w - inset));
  const ny = Math.max(y + inset, Math.min(cy, y + h - inset));

  return [nx, ny];
}
