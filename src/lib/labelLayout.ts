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
    outer: for (const side of SIDE_ORDER[req.side]) {
      for (const gap of [18, 30, 46, 66, 90, 120]) {
        for (const shift of [0, -w * 0.35, w * 0.35, -w * 0.7, w * 0.7]) {
          const rect = candidateRect(req.anchor, side, gap, shift, w, h);
          if (!inside(rect)) continue;
          const area = overlapArea(rect);
          const score = area + gap * 2 + Math.abs(shift);
          if (!best || score < best.score) best = { rect, leader: gap > 24 || Math.abs(shift) > 1, score };
          if (area === 0) break outer;
        }
      }
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
