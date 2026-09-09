import type { KneeboardCard, KneeboardThreatItem } from '../types/kneeboard.types';
import type { AttackPicture, LabelSide, SideProfile } from '../types/attackPicture.types';
import { LINE_STYLE, MARKER_COLOR, LABEL_STYLE, pictureFitPoints } from './attackPicture';
import { layoutLabels, leaderLine, edgeCrossing, type LabelRequest, type PlacedLabel, type Rect } from './labelLayout';
import { visibleArcSpans } from './arcClip';
import { CARD_THREAT_ROWS } from './cardThreats';

export const KNEEBOARD_WIDTH = 768;
export const KNEEBOARD_HEIGHT = 1024;

// ─── Colour palette (card furniture; the attack itself uses attackPicture's) ──
const C = {
  bg: '#FFFDF5',
  headerBg: '#1C2B3A',
  headerText: '#FFFFFF',
  sectionBg: '#E8E8E0',
  sectionLabel: '#1C2B3A',
  textPrimary: '#0F0F0F',
  textGray: '#505050',
  divider: '#999999',
  accent: '#CC2200',
  accentBg: '#FFF0EE',
  accentLight: '#FFE0DC',
  // Amber for cautions (unverified data). Red on this card means danger.
  caution: '#8A5A00',
  cautionBg: '#FFF1CC',
  threatClose: '#8B0000',
  diagramBg: '#F4F4EC',
  ground: '#888888',
  threatRing: 'rgba(239, 68, 68, 0.55)',
  leader: '#374151',
};

const MONO = "'Courier New', Courier, monospace";
const SANS = "'Arial Narrow', Arial, sans-serif";

// ─── Drawing primitives ───────────────────────────────────────────────────────

function fillRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function hLine(ctx: CanvasRenderingContext2D, y: number, color = C.divider, thickness = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(0, y, KNEEBOARD_WIDTH, thickness);
}

function txt(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  opts: { color?: string; size?: number; bold?: boolean; family?: string; align?: CanvasTextAlign; maxW?: number } = {},
) {
  const { color = C.textPrimary, size = 13, bold = false, family = MONO, align = 'left', maxW } = opts;
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (maxW !== undefined) ctx.fillText(str, x, y, maxW);
  else ctx.fillText(str, x, y);
}

/** "042°" for a heading, "---" when there is none (no IP, cleared field). */
function fmtHdg(h: number | undefined): string {
  return h != null && Number.isFinite(h) ? `${Math.round(h).toString().padStart(3, '0')}°` : '---';
}

function sectionStrip(ctx: CanvasRenderingContext2D, label: string, y: number, rightText?: string): number {
  fillRect(ctx, 0, y, KNEEBOARD_WIDTH, 20, C.sectionBg);
  txt(ctx, label, 8, y + 14, { bold: true, size: 11, family: SANS, color: C.sectionLabel });
  if (rightText) txt(ctx, rightText, KNEEBOARD_WIDTH - 8, y + 14, { size: 10, family: SANS, color: C.textGray, align: 'right' });
  return y + 20;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Header ───────────────────────────────────────────────────────────────────

function drawHeader(ctx: CanvasRenderingContext2D, card: KneeboardCard): number {
  fillRect(ctx, 0, 0, KNEEBOARD_WIDTH, 58, C.headerBg);
  // "Viper 1-1 — 30° Dive CCIP, Mk-84 attack on STPT 8 (TGT1)"
  txt(ctx, card.header.title ?? card.header.callsign, 10, 30, { color: C.headerText, size: 19, bold: true, family: SANS, maxW: KNEEBOARD_WIDTH - 20 });
  txt(ctx, card.attackSection.profileType, 10, 50, { color: '#88AACC', size: 12, bold: true, family: MONO });
  txt(ctx, card.header.missionDate, KNEEBOARD_WIDTH - 10, 50, { color: '#667788', size: 11, family: MONO, align: 'right' });
  hLine(ctx, 58, '#334455', 2);
  return 60;
}

/** Amber strip directly under the header, e.g. "coordinates unverified". */
function drawCautionStrip(ctx: CanvasRenderingContext2D, caution: string, y: number): number {
  fillRect(ctx, 0, y, KNEEBOARD_WIDTH, 20, C.cautionBg);
  txt(ctx, `⚠ ${caution}`, 10, y + 14, { size: 12, bold: true, family: SANS, color: C.caution, maxW: KNEEBOARD_WIDTH - 20 });
  return y + 20;
}

// ─── Target + weapon (one compact line each) ─────────────────────────────────

function drawTargetSection(ctx: CanvasRenderingContext2D, card: KneeboardCard, y: number): number {
  y = sectionStrip(ctx, 'TARGET', y);
  const stpt = card.header.targetSteerpoint != null ? `STPT ${card.header.targetSteerpoint}  ` : '';
  txt(ctx, `${stpt}${card.targetSection.name}`, 10, y + 17, { size: 15, bold: true, family: SANS });
  txt(ctx, card.targetSection.coordinates, 250, y + 17, { size: 13, family: MONO });
  txt(ctx, `Elev ${card.targetSection.elevation_ft.toLocaleString()}ft MSL`, KNEEBOARD_WIDTH - 10, y + 17, { size: 12, family: MONO, color: C.textGray, align: 'right' });
  y += 22;
  hLine(ctx, y, C.divider);
  return y + 1;
}

function drawWeaponSection(ctx: CanvasRenderingContext2D, card: KneeboardCard, y: number): number {
  y = sectionStrip(ctx, 'WEAPON', y);
  const w = card.weaponSection;
  txt(ctx, `${w.quantity}× ${w.weaponName}   ${w.releaseMode}   ${w.fuze}`, 10, y + 17, { size: 13, bold: true, family: MONO, maxW: 480 });
  if (w.minSafeAlt_ft != null) {
    txt(ctx, `⚠ MIN SAFE ${w.minSafeAlt_ft.toLocaleString()}ft AGL`, KNEEBOARD_WIDTH - 10, y + 17, { size: 12, bold: true, family: SANS, color: C.accent, align: 'right' });
  }
  y += 22;
  // Sanity-check failures: the numbers on this card contradict the weapon.
  for (const warning of w.warnings ?? []) {
    fillRect(ctx, 0, y, KNEEBOARD_WIDTH, 20, C.accentLight);
    txt(ctx, `⚠ ${warning}`, 10, y + 14, { size: 12, bold: true, family: SANS, color: C.accent, maxW: KNEEBOARD_WIDTH - 20 });
    y += 20;
  }
  hLine(ctx, y, C.divider);
  return y + 1;
}

// ─── Threats section (compact rows) ──────────────────────────────────────────

function drawThreatsSection(ctx: CanvasRenderingContext2D, card: KneeboardCard, y: number): number {
  const threats = card.threatSection.threats.slice(0, CARD_THREAT_ROWS);
  y = sectionStrip(ctx, 'THREATS IN AREA', y, 'BRG / DIST FROM TGT / MAX RNG');
  if (threats.length === 0) {
    txt(ctx, 'No threats within 60nm', 10, y + 14, { size: 12, family: MONO, color: C.textGray });
    y += 18;
  } else {
    for (const threat of threats) {
      const isInRange = threat.distance_nm <= threat.maxRange_nm;
      fillRect(ctx, 0, y, KNEEBOARD_WIDTH, 18, isInRange ? C.accentBg : C.bg);
      txt(ctx, threat.name, 8, y + 13, { size: 12, bold: isInRange, family: MONO, color: isInRange ? C.threatClose : C.textPrimary, maxW: 340 });
      txt(ctx, `${String(threat.bearing_deg).padStart(3, '0')}°`, 430, y + 13, { size: 12, bold: true, family: MONO, color: isInRange ? C.accent : C.textPrimary, align: 'right' });
      txt(ctx, `${threat.distance_nm.toFixed(1)}nm`, 550, y + 13, { size: 12, family: MONO, color: isInRange ? C.accent : C.textPrimary, align: 'right' });
      txt(ctx, `max ${threat.maxRange_nm.toFixed(0)}nm`, 720, y + 13, { size: 11, family: MONO, color: C.textGray, align: 'right' });
      y += 18;
    }
  }
  hLine(ctx, y, C.divider);
  return y + 1;
}

// ─── Shared picture furniture ─────────────────────────────────────────────────

function strokePath(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>, style: { color: string; width: number; dash?: number[] }, scale = 1) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = Math.max(1, style.width * scale);
  ctx.setLineDash(style.dash ?? []);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.restore();
}

/** A map marker as the planner draws it: coloured disc, white ring, bold label. */
function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, color: string, r = 13) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${label.length > 3 ? 9 : 10}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 0.5);
  ctx.restore();
}

// ─── Labels: the planner's white tooltips, laid out so they do not collide ────
// Layout itself (Rect/LabelRequest/PlacedLabel/layoutLabels) lives in
// `labelLayout.ts`, shared with the live map overlay — only the canvas
// drawing below is specific to the card.

function drawPlacedLabel(ctx: CanvasRenderingContext2D, label: PlacedLabel) {
  const { rect, anchor, lines } = label;
  const size = label.size ?? 11;
  const lineH = size + 4;
  const bg = label.style?.bg ?? LABEL_STYLE.tooltipBg;
  const fg = label.style?.fg ?? LABEL_STYLE.tooltipText;
  const border = label.style?.border ?? LABEL_STYLE.tooltipBorder;
  ctx.save();

  // Leader from the nearest box edge to the marker's edge, when the box had to move.
  // A box sitting right beside its point gets the pointer nub below instead.
  const line = label.leader ? leaderLine(label) : undefined;
  if (line) {
    ctx.strokeStyle = C.leader;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(line.from[0], line.from[1]);
    ctx.lineTo(line.to[0], line.to[1]);
    ctx.stroke();
  }
  // Anchor coordinates, used for the small pointer nub below.
  const [ax, ay] = anchor;

  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 3);
  ctx.fill();
  ctx.stroke();

  // A small pointer toward the point when the box sits right beside it.
  if (!label.leader) {
    ctx.beginPath();
    if (ay < rect.y) {
      ctx.moveTo(ax - 4, rect.y);
      ctx.lineTo(ax + 4, rect.y);
      ctx.lineTo(ax, rect.y - 5);
    } else if (ay > rect.y + rect.h) {
      ctx.moveTo(ax - 4, rect.y + rect.h);
      ctx.lineTo(ax + 4, rect.y + rect.h);
      ctx.lineTo(ax, rect.y + rect.h + 5);
    } else if (ax < rect.x) {
      ctx.moveTo(rect.x, ay - 4);
      ctx.lineTo(rect.x, ay + 4);
      ctx.lineTo(rect.x - 5, ay);
    } else {
      ctx.moveTo(rect.x + rect.w, ay - 4);
      ctx.lineTo(rect.x + rect.w, ay + 4);
      ctx.lineTo(rect.x + rect.w + 5, ay);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = fg;
  ctx.font = `bold ${size}px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, rect.x + 6, rect.y + 3 + i * lineH));
  ctx.restore();
}

// ─── Plan view, north up ──────────────────────────────────────────────────────

function drawPlanView(ctx: CanvasRenderingContext2D, picture: AttackPicture, threats: KneeboardThreatItem[], box: Rect) {
  fillRect(ctx, box.x, box.y, box.w, box.h, C.diagramBg);
  const target = picture.markers.find((m) => m.kind === 'TGT')?.position ?? picture.lines[0]?.points[0];
  if (!target) return;
  const cosLat = Math.cos((target.lat * Math.PI) / 180);
  const toNm = (c: { lat: number; lon: number }) => ({ x: (c.lon - target.lon) * 60 * cosLat, y: (c.lat - target.lat) * 60 });

  // Fit the attack, not the transit: the IP can be twelve miles out and would
  // squeeze the part that matters into a corner. Route lines run off the edge.
  const fitPts = pictureFitPoints(picture).map(toNm);
  const minX = Math.min(...fitPts.map((p) => p.x)), maxX = Math.max(...fitPts.map((p) => p.x));
  const minY = Math.min(...fitPts.map((p) => p.y)), maxY = Math.max(...fitPts.map((p) => p.y));
  // As much zoom as keeps AP and TGT (and the break) in frame: the card is
  // small on a DCS kneeboard, so the picture, not the margin, gets the pixels.
  const padPx = 44;
  const scale = Math.min((box.w - 2 * padPx) / Math.max(maxX - minX, 0.5), (box.h - 2 * padPx) / Math.max(maxY - minY, 0.5));
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const toPx = (c: { lat: number; lon: number }): [number, number] => {
    const n = toNm(c);
    return [cx + (n.x - mx) * scale, cy - (n.y - my) * scale];
  };
  const insideBox = (p: [number, number]) => p[0] >= box.x && p[0] <= box.x + box.w && p[1] >= box.y && p[1] <= box.y + box.h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();

  // Threat rings, as on the map: centre from bearing and distance off the target.
  for (const t of threats) {
    if (!t.maxRange_nm) continue;
    const b = (t.bearing_deg * Math.PI) / 180;
    const c = { x: Math.sin(b) * t.distance_nm, y: Math.cos(b) * t.distance_nm };
    const px = cx + (c.x - mx) * scale, py = cy - (c.y - my) * scale;
    const r = t.maxRange_nm * scale;
    // Outline only, no fill. A target sitting inside four engagement envelopes
    // used to wash the whole picture pink and hide the attack under it. The
    // edge is the part a pilot can fly to -- it says where the run-in crosses
    // into the ring -- and a ring large enough to swallow the frame draws
    // nothing at all rather than tinting everything. That you are inside it is
    // already said, in bold red, by the THREATS IN AREA table above.
    //
    // Only the spans genuinely inside the box are stroked. Handing the canvas
    // a whole circle and trusting ctx.clip() did not hold: a ring centred far
    // below the diagram was stroked in full, across the threat table and the
    // header. See visibleArcSpans.
    const spans = visibleArcSpans(px, py, r, box);
    if (!spans.length) continue;
    ctx.strokeStyle = C.threatRing;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    for (const [a0, a1] of spans) {
      ctx.beginPath();
      ctx.arc(px, py, r, a0, a1);
      ctx.stroke();
    }
  }

  for (const line of picture.lines) strokePath(ctx, line.points.map(toPx), LINE_STYLE[line.style], 1.1);

  // Where the route leaves the frame toward the IP, say so.
  const route = picture.lines.find((l) => l.style === 'route');
  if (route && route.points.length >= 2) {
    const far = toPx(route.points[0]);
    const near = toPx(route.points[route.points.length - 1]);
    if (!insideBox(far)) {
      // Walk back from the in-frame end toward the far end until the edge.
      let t = 0;
      let edge: [number, number] = near;
      for (let k = 1; k <= 200; k++) {
        const p: [number, number] = [near[0] + (far[0] - near[0]) * (k / 200), near[1] + (far[1] - near[1]) * (k / 200)];
        if (!insideBox(p)) break;
        edge = p;
        t = k;
      }
      if (t > 0) {
        const tx = Math.min(Math.max(edge[0], box.x + 14), box.x + box.w - 14);
        const ty = Math.min(Math.max(edge[1], box.y + 14), box.y + box.h - 8);
        txt(ctx, '→ IP', tx, ty, { size: 10, bold: true, family: SANS, color: '#2563eb', align: 'center' });
      }
    }
  }

  const markerR = 16;
  const obstacles: Rect[] = [];
  for (const marker of picture.markers) {
    const [x, y] = toPx(marker.position);
    drawMarker(ctx, x, y, marker.kind, MARKER_COLOR[marker.kind], markerR);
    obstacles.push({ x: x - markerR - 1, y: y - markerR - 1, w: 2 * markerR + 2, h: 2 * markerR + 2 });
  }
  // North arrow and scale bar are obstacles too.
  obstacles.push({ x: box.x + box.w - 40, y: box.y + 6, w: 36, h: 62 }, { x: box.x + 6, y: box.y + box.h - 30, w: scale + 20, h: 26 });

  const requests: LabelRequest[] = [
    // Markers first, then the boxes, so the numbers a pilot flies win the space.
    ...picture.markers
      .filter((m) => m.permanent)
      .map((m) => ({ lines: m.lines, anchor: toPx(m.position), side: m.side, size: 12, anchorRadius: markerR })),
    ...picture.labels
      .map((l) => {
        let anchor = toPx(l.position);
        // Pin off-frame IP labels to the edge where the run-in enters
        if (l.kind === 'ip' && !insideBox(anchor)) {
          const routeLine = picture.lines.find((ln) => ln.style === 'route');
          if (routeLine && routeLine.points.length >= 2) {
            const actionPoint = routeLine.points[routeLine.points.length - 1];
            const actionPx = toPx(actionPoint);
            const crossing = edgeCrossing(anchor, actionPx, box);
            if (crossing) anchor = crossing;
            else return null;
          } else return null;
        } else if (l.kind !== 'egress' && !insideBox(anchor)) {
          return null;
        }
        return {
          lines: [l.text],
          anchor,
          side: (l.kind === 'egress' ? 'top' : 'bottom') as LabelSide,
          size: 11,
          style:
            l.kind === 'egress'
              ? { bg: LABEL_STYLE.egressBg, fg: '#ffffff', border: LABEL_STYLE.egressBorder }
              : { bg: LABEL_STYLE.ipBg, fg: '#ffffff', border: LABEL_STYLE.ipBorder },
        };
      })
      .filter((req) => req !== null) as LabelRequest[],
  ];
  for (const label of layoutLabels(ctx, requests, obstacles, box)) drawPlacedLabel(ctx, label);

  // North arrow and a one-mile bar.
  const nx = box.x + box.w - 22, ny = box.y + 30;
  ctx.strokeStyle = C.sectionLabel;
  ctx.fillStyle = C.sectionLabel;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(nx, ny + 18);
  ctx.lineTo(nx, ny - 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(nx, ny - 14);
  ctx.lineTo(nx - 5, ny - 4);
  ctx.lineTo(nx + 5, ny - 4);
  ctx.closePath();
  ctx.fill();
  txt(ctx, 'N', nx, ny + 32, { size: 11, bold: true, family: SANS, color: C.sectionLabel, align: 'center' });
  const bx = box.x + 14, by = box.y + box.h - 14;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + scale, by);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx, by - 4);
  ctx.lineTo(bx, by + 4);
  ctx.moveTo(bx + scale, by - 4);
  ctx.lineTo(bx + scale, by + 4);
  ctx.stroke();
  txt(ctx, '1 nm', bx + scale / 2, by - 6, { size: 10, family: SANS, color: C.sectionLabel, align: 'center' });
  ctx.restore();
}

// ─── Side view ────────────────────────────────────────────────────────────────

function drawSideProfile(ctx: CanvasRenderingContext2D, side: SideProfile, box: Rect) {
  fillRect(ctx, box.x, box.y, box.w, box.h, C.diagramBg);
  const padL = 28, padR = 28, padTop = 44, padBottom = 44;
  const dists = side.points.map((p) => p.dist_nm);
  const maxD = Math.max(...dists) + 0.4;
  const minD = Math.min(...dists) - 0.3;
  const xScale = (box.w - padL - padR) / (maxD - minD);
  const yScale = (box.h - padTop - padBottom) / Math.max(side.maxAlt_ft * 1.15, 1000);
  const groundY = box.y + box.h - padBottom;
  const X = (d: number) => box.x + padL + (maxD - d) * xScale;
  const Y = (a: number) => groundY - a * yScale;
  const P = (i: number): [number, number] => [X(side.points[i].dist_nm), Y(side.points[i].alt_ft)];

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();

  // Ground with hatching, out to the target.
  ctx.strokeStyle = C.ground;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(box.x + 4, groundY);
  ctx.lineTo(X(0) + 6, groundY);
  ctx.stroke();
  ctx.strokeStyle = '#AAAAAA';
  ctx.lineWidth = 0.8;
  for (let x = box.x + 10; x < X(0) + 6; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x - 8, groundY + 10);
    ctx.stroke();
  }

  // Hard deck.
  if (side.hardDeck_ft != null && side.hardDeck_ft > 0) {
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(box.x + 4, Y(side.hardDeck_ft));
    ctx.lineTo(X(0) + 6, Y(side.hardDeck_ft));
    ctx.stroke();
    ctx.setLineDash([]);
    txt(ctx, `HARD DECK ${side.hardDeck_ft.toLocaleString()}ft AGL`, box.x + 8, Y(side.hardDeck_ft) - 3, { size: 9, family: MONO, color: C.accent });
  }

  // Segments, in the picture's colours.
  for (const s of side.segments) {
    const style = LINE_STYLE[s.style];
    const [x1, y1] = P(s.from);
    const [x2, y2] = P(s.to);
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = Math.max(1, style.width * 0.85);
    ctx.setLineDash(style.dash ?? []);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    if (s.via != null) {
      const [vx, vy] = P(s.via);
      ctx.quadraticCurveTo(vx, vy - 10, x2, y2);
    } else if (s.curve === 'up') {
      ctx.quadraticCurveTo(x1 + (x2 - x1) * 0.55, y1, x2, y2);
    } else {
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    if (s.style === 'egress') {
      const ang = Math.atan2(y2 - (y1 + (y2 - y1) * 0.6), x2 - (x1 + (x2 - x1) * 0.9));
      ctx.setLineDash([]);
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 10 * Math.cos(ang - 0.45), y2 - 10 * Math.sin(ang - 0.45));
      ctx.lineTo(x2 - 10 * Math.cos(ang + 0.45), y2 - 10 * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Markers, then their labels laid out around them.
  const obstacles: Rect[] = [];
  side.points.forEach((p, i) => {
    const [x, y] = P(i);
    if (p.kind === 'APEX') {
      ctx.fillStyle = LINE_STYLE.pullDown.color;
      ctx.font = `bold 16px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', x, y);
      obstacles.push({ x: x - 9, y: y - 9, w: 18, h: 18 });
    } else if (p.kind !== 'EGRESS') {
      drawMarker(ctx, x, y, p.kind, MARKER_COLOR[p.kind], 12);
      obstacles.push({ x: x - 13, y: y - 13, w: 26, h: 26 });
    }
  });
  const requests: LabelRequest[] = side.points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.label)
    .map(({ p, i }) => ({ lines: [p.label!], anchor: P(i), side: p.side ?? 'top', size: 11, anchorRadius: p.kind !== 'APEX' && p.kind !== 'EGRESS' ? 12 : 0 }));
  for (const label of layoutLabels(ctx, requests, obstacles, box)) drawPlacedLabel(ctx, label);

  ctx.restore();
}

// ─── Main render function ─────────────────────────────────────────────────────

const FOOTER_HEIGHT = 26;

export function renderKneeboardCard(canvas: HTMLCanvasElement, card: KneeboardCard): void {
  canvas.width = KNEEBOARD_WIDTH;
  canvas.height = KNEEBOARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  fillRect(ctx, 0, 0, KNEEBOARD_WIDTH, KNEEBOARD_HEIGHT, C.bg);

  let y = drawHeader(ctx, card);
  for (const caution of card.header.cautions ?? []) y = drawCautionStrip(ctx, caution, y);
  y = drawTargetSection(ctx, card, y);
  y = drawWeaponSection(ctx, card, y);
  y = drawThreatsSection(ctx, card, y);

  // The two pictures share what is left above the footer: the plan view gets
  // the larger share, the side view the rest.
  const footerTop = KNEEBOARD_HEIGHT - FOOTER_HEIGHT;
  const diagram = card.attackSection.diagram;
  if (diagram?.picture || diagram?.side) {
    const strips = (diagram.picture ? 20 : 0) + (diagram.side ? 20 : 0);
    const remaining = footerTop - y - strips - 2;
    const planH = diagram.picture && diagram.side ? Math.round(remaining * 0.66) : remaining;
    const sideH = remaining - (diagram.picture ? planH : 0);
    const headingText = `ATTACK HDG ${fmtHdg(diagram.attackHeading_deg)}   ·   EGRESS ${diagram.egressDirection.toUpperCase()} ${fmtHdg(diagram.egressHeading_deg)}`;
    if (diagram.picture) {
      y = sectionStrip(ctx, 'ATTACK — NORTH UP', y, headingText);
      drawPlanView(ctx, diagram.picture, card.threatSection.threats.slice(0, CARD_THREAT_ROWS), { x: 0, y, w: KNEEBOARD_WIDTH, h: planH });
      y += planH;
      hLine(ctx, y, C.divider);
      y += 1;
    }
    if (diagram.side) {
      const right = diagram.sightDepression_mils != null ? `SIGHT ${Math.round(diagram.sightDepression_mils)} mils   ·   altitudes AGL · release by = no lower` : 'altitudes AGL · release by = no lower';
      y = sectionStrip(ctx, 'PROFILE — SIDE VIEW', y, diagram.picture ? right : `${headingText}   ·   ${right}`);
      drawSideProfile(ctx, diagram.side, { x: 0, y, w: KNEEBOARD_WIDTH, h: sideH });
      y += sideH;
    }
  }

  fillRect(ctx, 0, KNEEBOARD_HEIGHT - FOOTER_HEIGHT, KNEEBOARD_WIDTH, FOOTER_HEIGHT, C.headerBg);
  txt(ctx, 'PHOENIX WEAPONEER', 10, KNEEBOARD_HEIGHT - 10, { size: 10, bold: true, family: MONO, color: '#667788' });
  txt(ctx, 'UNCLASSIFIED // TRAINING USE ONLY', KNEEBOARD_WIDTH / 2, KNEEBOARD_HEIGHT - 10, { size: 9, family: MONO, color: '#445566', align: 'center' });
}

/** Export canvas to base64 PNG string (strip the data URL prefix) */
export function canvasToBase64Png(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}
