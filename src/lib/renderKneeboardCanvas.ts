import type { KneeboardCard, KneeboardThreatItem } from '../types/kneeboard.types';
import type { AttackPicture, LabelSide, SideProfile } from '../types/attackPicture.types';
import { pictureFitPoints } from './attackPicture';
import { DAY_THEME, type BasemapTreatment, type CardTheme } from './cardTheme';
import { layoutLabels, leaderLine, edgeCrossing, type LabelRequest, type PlacedLabel, type Rect } from './labelLayout';
import { visibleArcSpans } from './arcClip';
import { CARD_THREAT_ROWS } from './cardThreats';
import type { Coordinates } from '../types/waypoint.types';
import {
  OSM_ATTRIBUTION,
  cachedBasemapTiles,
  loadBasemapTiles,
  planCardBasemap,
  tileRectPx,
  type BasemapReport,
  type BasemapTiles,
} from './kneeboardBasemap';

/** The size the card is laid out in. Every coordinate, font size and line width below is in these units. */
export const KNEEBOARD_WIDTH = 768;
export const KNEEBOARD_HEIGHT = 1024;

/**
 * How many pixels a card is drawn with for each layout unit. DCS stretches the card
 * image to the kneeboard window, which is far bigger than 768 pixels on a 1440p or 4K
 * screen and in VR, so a card with more pixels has sharper text there. The layout does
 * not change: the canvas is scaled before anything is drawn, so a unit is 3 pixels.
 */
export const KNEEBOARD_SCALE = 3;
/** The PNG's size in pixels at the default scale: 2304 x 3072, the same 3:4 shape. */
export const KNEEBOARD_PIXEL_WIDTH = KNEEBOARD_WIDTH * KNEEBOARD_SCALE;
export const KNEEBOARD_PIXEL_HEIGHT = KNEEBOARD_HEIGHT * KNEEBOARD_SCALE;

/**
 * Give a canvas's pixels back once its picture has been encoded. A card canvas is about
 * 28 MB, and a phone caps the total memory of all its canvases (iOS Safari does), which
 * canvases left for the garbage collector to find would use up.
 */
export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

// Every colour on the card comes from a `CardTheme` (cardTheme.ts), passed down to
// each drawing function as `theme`. This file holds none of its own: a literal
// colour here would draw the same under every theme.

// The type is two pixels larger than the card's first design, because the squadron
// asked for text they can read at a glance in the cockpit. Every band, row and
// marker below grew with it so nothing is cramped. labelLayout sizes a label's box
// from the size it is handed (line height = size + 4, width = text + 12), so every
// label request here passes its size explicitly.

const MONO = "'Courier New', Courier, monospace";
const SANS = "'Arial Narrow', Arial, sans-serif";

// ─── Drawing primitives ───────────────────────────────────────────────────────

function fillRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function hLine(ctx: CanvasRenderingContext2D, y: number, color: string, thickness = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(0, y, KNEEBOARD_WIDTH, thickness);
}

function txt(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  opts: { color: string; size?: number; bold?: boolean; family?: string; align?: CanvasTextAlign; maxW?: number },
) {
  const { color, size = 15, bold = false, family = MONO, align = 'left', maxW } = opts;
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

/** Height of a section strip, and of the strike, caution and warning strips that match it. */
const STRIP_H = 22;

function sectionStrip(ctx: CanvasRenderingContext2D, theme: CardTheme, label: string, y: number, rightText?: string): number {
  fillRect(ctx, 0, y, KNEEBOARD_WIDTH, STRIP_H, theme.sectionBg);
  txt(ctx, label, 8, y + 16, { bold: true, size: 13, family: SANS, color: theme.sectionLabel });
  if (rightText) txt(ctx, rightText, KNEEBOARD_WIDTH - 8, y + 16, { size: 12, family: SANS, color: theme.textGray, align: 'right' });
  return y + STRIP_H;
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

const HEADER_H = 64;

function drawHeader(ctx: CanvasRenderingContext2D, theme: CardTheme, card: KneeboardCard): number {
  fillRect(ctx, 0, 0, KNEEBOARD_WIDTH, HEADER_H, theme.headerBg);
  // "Viper 1-1 — 30° Dive CCIP, Mk-84 attack on STPT 8 (TGT1)"
  txt(ctx, card.header.title ?? card.header.callsign, 10, 33, { color: theme.headerText, size: 21, bold: true, family: SANS, maxW: KNEEBOARD_WIDTH - 20 });
  const label = card.attackSection.profileType;
  const date = card.header.missionDate;
  txt(ctx, label, 10, 55, { color: theme.headerLabel, size: 14, bold: true, family: MONO });
  txt(ctx, date, KNEEBOARD_WIDTH - 10, 55, { color: theme.headerDate, size: 13, family: MONO, align: 'right' });
  // A manual delivery's sight setting rides on this line, after the profile label
  // (where a CCIP note would sit): the pilot sets it at or before the IP, not at
  // the roll-in, where their head is outside. It is placed by measuring each text
  // in its own font, and held short of the date on the right.
  const sight = card.header.sightDepression_mils;
  if (sight != null) {
    ctx.font = `13px ${MONO}`;
    const dateLeft = KNEEBOARD_WIDTH - 10 - ctx.measureText(date).width;
    ctx.font = `bold 14px ${MONO}`;
    const x = 10 + ctx.measureText(label).width + 8;
    txt(ctx, `·  SIGHT ${Math.round(sight)} mils · set before IP`, x, 55, { color: theme.headerAmber, size: 14, bold: true, family: MONO, maxW: dateLeft - 12 - x });
  }
  hLine(ctx, HEADER_H, theme.headerRule, 2);
  return HEADER_H + 2;
}

/** Blue strip under the header for a strike member: seat, side, TOT, push. */
function drawStrikeStrip(ctx: CanvasRenderingContext2D, theme: CardTheme, line: string, y: number): number {
  fillRect(ctx, 0, y, KNEEBOARD_WIDTH, STRIP_H, theme.strikeBg);
  txt(ctx, line, 10, y + 16, { size: 14, bold: true, family: SANS, color: theme.strike, maxW: KNEEBOARD_WIDTH - 20 });
  return y + STRIP_H;
}

/** Amber strip directly under the header, e.g. "coordinates unverified". */
function drawCautionStrip(ctx: CanvasRenderingContext2D, theme: CardTheme, caution: string, y: number): number {
  fillRect(ctx, 0, y, KNEEBOARD_WIDTH, STRIP_H, theme.cautionBg);
  txt(ctx, `⚠ ${caution}`, 10, y + 16, { size: 14, bold: true, family: SANS, color: theme.caution, maxW: KNEEBOARD_WIDTH - 20 });
  return y + STRIP_H;
}

// ─── Target + weapon (one compact line each) ─────────────────────────────────

const LINE_H = 25;

function drawTargetSection(ctx: CanvasRenderingContext2D, theme: CardTheme, card: KneeboardCard, y: number): number {
  y = sectionStrip(ctx, theme, 'TARGET', y);
  const stpt = card.header.targetSteerpoint != null ? `STPT ${card.header.targetSteerpoint}  ` : '';
  // Each text in this row has a width limit, so a long name cannot run into the
  // coordinates at x = 250, nor the coordinates into the elevation.
  txt(ctx, `${stpt}${card.targetSection.name}`, 10, y + 19, { size: 17, bold: true, family: SANS, color: theme.textPrimary, maxW: 230 });
  txt(ctx, card.targetSection.coordinates, 250, y + 19, { size: 15, family: MONO, color: theme.textPrimary, maxW: 310 });
  txt(ctx, `Elev ${card.targetSection.elevation_ft.toLocaleString()}ft MSL`, KNEEBOARD_WIDTH - 10, y + 19, { size: 14, family: MONO, color: theme.textGray, align: 'right', maxW: 200 });
  y += LINE_H;
  hLine(ctx, y, theme.divider);
  return y + 1;
}

function drawWeaponSection(ctx: CanvasRenderingContext2D, theme: CardTheme, card: KneeboardCard, y: number): number {
  y = sectionStrip(ctx, theme, 'WEAPON', y);
  const w = card.weaponSection;
  const line = w.fired ? w.weaponName : `${w.quantity}× ${w.weaponName}   ${w.releaseMode}   ${w.fuze}`;
  txt(ctx, line, 10, y + 19, { size: 15, bold: true, family: MONO, maxW: 480, color: theme.textPrimary });
  if (w.minSafeAlt_ft != null) {
    txt(ctx, `⚠ MIN SAFE ${w.minSafeAlt_ft.toLocaleString()}ft AGL`, KNEEBOARD_WIDTH - 10, y + 19, { size: 14, bold: true, family: SANS, color: theme.accent, align: 'right' });
  }
  y += LINE_H;
  // Sanity-check failures: the numbers on this card contradict the weapon.
  for (const warning of w.warnings ?? []) {
    fillRect(ctx, 0, y, KNEEBOARD_WIDTH, STRIP_H, theme.accentLight);
    txt(ctx, `⚠ ${warning}`, 10, y + 16, { size: 14, bold: true, family: SANS, color: theme.accent, maxW: KNEEBOARD_WIDTH - 20 });
    y += STRIP_H;
  }
  hLine(ctx, y, theme.divider);
  return y + 1;
}

// ─── Threats section (compact rows) ──────────────────────────────────────────

const THREAT_ROW_H = 20;

function drawThreatsSection(ctx: CanvasRenderingContext2D, theme: CardTheme, card: KneeboardCard, y: number): number {
  const threats = card.threatSection.threats.slice(0, CARD_THREAT_ROWS);
  y = sectionStrip(ctx, theme, 'THREATS IN AREA', y, 'BRG / DIST FROM TGT / MAX RNG');
  if (threats.length === 0) {
    txt(ctx, 'No threats within 60nm', 10, y + 16, { size: 14, family: MONO, color: theme.textGray });
    y += THREAT_ROW_H;
  } else {
    for (const threat of threats) {
      const isInRange = threat.distance_nm <= threat.maxRange_nm;
      fillRect(ctx, 0, y, KNEEBOARD_WIDTH, THREAT_ROW_H, isInRange ? theme.accentBg : theme.bg);
      txt(ctx, threat.name, 8, y + 15, { size: 14, bold: isInRange, family: MONO, color: isInRange ? theme.threatClose : theme.textPrimary, maxW: 340 });
      txt(ctx, `${String(threat.bearing_deg).padStart(3, '0')}°`, 430, y + 15, { size: 14, bold: true, family: MONO, color: isInRange ? theme.accent : theme.textPrimary, align: 'right' });
      txt(ctx, `${threat.distance_nm.toFixed(1)}nm`, 550, y + 15, { size: 14, family: MONO, color: isInRange ? theme.accent : theme.textPrimary, align: 'right' });
      txt(ctx, `max ${threat.maxRange_nm.toFixed(0)}nm`, 720, y + 15, { size: 13, family: MONO, color: theme.textGray, align: 'right' });
      y += THREAT_ROW_H;
    }
  }
  hLine(ctx, y, theme.divider);
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

/** Marker disc radius in the north-up picture, in card pixels. */
export const PLAN_MARKER_R = 18;
/**
 * Marker disc radius in the side view, smaller than the plan's because the picture is
 * shorter. Not 14: "ROLL" in Arial Narrow bold at 11 px is 24.6 px wide, and a 14 px
 * disc holds only 24 (2r - 4), so its letters spilled past the ring. 15 holds 26.
 */
export const SIDE_MARKER_R = 15;
/** Marker letters are bold 12 px, or 11 px for a four-letter marker ("ROLL"), so they fit the disc. */
export const MARKER_LABEL_SIZE = 12;
export const MARKER_LONG_LABEL_SIZE = 11;

/** The font size a marker's letters are drawn at. */
export function markerLabelSize(label: string): number {
  return label.length > 3 ? MARKER_LONG_LABEL_SIZE : MARKER_LABEL_SIZE;
}

/** A map marker as the planner draws it: coloured disc, ring, bold label. */
function drawMarker(ctx: CanvasRenderingContext2D, theme: CardTheme, x: number, y: number, label: string, color: string, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.marker.ring;
  ctx.stroke();
  ctx.fillStyle = theme.marker.text;
  ctx.font = `bold ${markerLabelSize(label)}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Arial Narrow is not on every machine, and Arial is wider: the letters are held to
  // the disc (less the ring) by condensing them, rather than left to spill over it.
  ctx.fillText(label, x, y + 0.5, 2 * r - 4);
  ctx.restore();
}

/**
 * A short note on the north-up picture, set on a small plate of the diagram's own
 * background. A route or ring line crossing bare text leaves it unreadable (the
 * "→ STPT 2" note measured 1.35:1 against the route line), so the note gets its own
 * ground, 3 px wider than the text all round. `x` is the text's anchor: its left
 * edge or its centre, as `align` says. `plate` is known before the note is drawn, so
 * the labels can be laid out around it.
 */
interface PlatedNote {
  str: string;
  x: number;
  y: number;
  color: string;
  size: number;
  align: 'left' | 'center';
  plate: Rect;
}

function platedNote(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, opts: { color: string; size: number; align: 'left' | 'center' }): PlatedNote {
  const { color, size, align } = opts;
  ctx.font = `bold ${size}px ${SANS}`;
  const textW = ctx.measureText(str).width;
  const left = align === 'center' ? x - textW / 2 : x;
  // Capitals and digits stand about 0.72 em above the baseline; the notes have no descenders.
  const inkH = Math.round(size * 0.72);
  return { str, x, y, color, size, align, plate: { x: left - 3, y: y - inkH - 3, w: textW + 6, h: inkH + 6 } };
}

function drawPlatedNote(ctx: CanvasRenderingContext2D, theme: CardTheme, note: PlatedNote) {
  const { plate } = note;
  ctx.fillStyle = theme.diagramBg;
  roundRect(ctx, plate.x, plate.y, plate.w, plate.h, 3);
  ctx.fill();
  txt(ctx, note.str, note.x, note.y, { color: note.color, size: note.size, bold: true, family: SANS, align: note.align });
}

// ─── Labels: the planner's tooltips, laid out so they do not collide ──────────
// Layout itself (Rect/LabelRequest/PlacedLabel/layoutLabels) lives in
// `labelLayout.ts`, shared with the live map overlay — only the canvas
// drawing below is specific to the card.

function drawPlacedLabel(ctx: CanvasRenderingContext2D, theme: CardTheme, label: PlacedLabel) {
  const { rect, anchor, lines } = label;
  const size = label.size ?? 13;
  const lineH = size + 4;
  const bg = label.style?.bg ?? theme.labels.tooltip.bg;
  const fg = label.style?.fg ?? theme.labels.tooltip.fg;
  const border = label.style?.border ?? theme.labels.tooltip.border;
  ctx.save();

  // Leader from the nearest box edge to the marker's edge, when the box had to move.
  // A box sitting right beside its point gets the pointer nub below instead.
  const line = label.leader ? leaderLine(label) : undefined;
  if (line) {
    ctx.strokeStyle = theme.leader;
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

export interface PlanViewTransform {
  target: Coordinates;
  /** Card pixels per nautical mile. */
  scale: number;
  toPx: (c: Coordinates) => [number, number];
  fromPx: (x: number, y: number) => Coordinates;
  /** East/north nautical miles off the target, to card pixels. */
  nmToPx: (east_nm: number, north_nm: number) => [number, number];
}

/**
 * The north-up picture's projection: flat, centred on the target, zoomed to
 * the attack. Pulled out of `drawPlanView` so the basemap alignment can be
 * checked in node against exactly what the card draws.
 */
export function planViewTransform(picture: AttackPicture, box: Rect): PlanViewTransform | undefined {
  const target = picture.markers.find((m) => m.kind === 'TGT')?.position ?? picture.lines[0]?.points[0];
  if (!target) return undefined;
  const cosLat = Math.cos((target.lat * Math.PI) / 180);
  const toNm = (c: { lat: number; lon: number }) => ({ x: (c.lon - target.lon) * 60 * cosLat, y: (c.lat - target.lat) * 60 });

  // Fit the attack, not the transit: the IP can be twelve miles out and would
  // squeeze the part that matters into a corner. Route lines run off the edge.
  const fitPts = pictureFitPoints(picture).map(toNm);
  const minX = Math.min(...fitPts.map((p) => p.x)), maxX = Math.max(...fitPts.map((p) => p.x));
  const minY = Math.min(...fitPts.map((p) => p.y)), maxY = Math.max(...fitPts.map((p) => p.y));
  // As much zoom as keeps AP and TGT (and the break) in frame: the card is
  // small on a DCS kneeboard, so the picture, not the margin, gets the pixels.
  const padPx = 48;
  const scale = Math.min((box.w - 2 * padPx) / Math.max(maxX - minX, 0.5), (box.h - 2 * padPx) / Math.max(maxY - minY, 0.5));
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const nmToPx = (east: number, north: number): [number, number] => [cx + (east - mx) * scale, cy - (north - my) * scale];
  return {
    target,
    scale,
    toPx: (c) => {
      const n = toNm(c);
      return nmToPx(n.x, n.y);
    },
    fromPx: (x, y) => ({
      lat: target.lat + (my - (y - cy) / scale) / 60,
      lon: target.lon + (mx + (x - cx) / scale) / (60 * cosLat),
    }),
    nmToPx,
  };
}

/**
 * Turn a tile just drawn into the theme's darker, tinted version: flip it to a
 * negative (`difference` against white), then multiply by the tint. Blend modes,
 * not `ctx.filter`, which older WebKit (macOS's WKWebView, Linux's WebKitGTK) lacks.
 * Day sets neither, so this draws nothing and Day's tiles are exactly as fetched.
 *
 * An engine that does not know a blend mode leaves `globalCompositeOperation` as
 * it was, and the tile would stay pale on a card meant to be dark. That is the
 * worse failure, so the tile is covered with the wash colour instead.
 */
function tintTile(ctx: CanvasRenderingContext2D, basemap: BasemapTreatment, tile: Rect) {
  if (!basemap.invert && basemap.tint === null) return;
  ctx.save();
  const blend = (mode: GlobalCompositeOperation, color: string): boolean => {
    ctx.globalCompositeOperation = mode;
    if (ctx.globalCompositeOperation !== mode) return false;
    fillRect(ctx, tile.x, tile.y, tile.w, tile.h, color);
    return true;
  };
  // White is what makes `difference` a negative. It is never seen as a colour.
  const done = (!basemap.invert || blend('difference', '#ffffff')) && (basemap.tint === null || blend('multiply', basemap.tint));
  if (!done) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.92;
    fillRect(ctx, tile.x, tile.y, tile.w, tile.h, basemap.washColor);
  }
  ctx.restore();
}

/**
 * Grey OSM tiles under the picture, treated as the theme says (tinted, flipped),
 * then washed back so the attack stays loudest. Tiles not yet fetched are reported, not waited for.
 */
function drawBasemap(ctx: CanvasRenderingContext2D, theme: CardTheme, basemap: BasemapTiles, view: PlanViewTransform, box: Rect, outputScale: number): BasemapReport {
  const nw = view.fromPx(box.x, box.y);
  const se = view.fromPx(box.x + box.w, box.y + box.h);
  const tiles = planCardBasemap(nw, se, view.scale, view.target.lat, outputScale);
  const report: BasemapReport = { tiles, drawn: 0, failed: 0, pending: 0 };
  for (const tile of tiles) {
    const image = basemap(tile);
    if (image === undefined) report.pending++;
    else if (image === null) report.failed++;
    else {
      const rect = tileRectPx(tile, view.toPx);
      ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
      tintTile(ctx, theme.basemap, rect);
      report.drawn++;
    }
  }
  if (report.drawn > 0) {
    ctx.save();
    ctx.globalAlpha = theme.basemap.washAlpha;
    fillRect(ctx, box.x, box.y, box.w, box.h, theme.basemap.washColor);
    ctx.restore();
  }
  return report;
}

function drawPlanView(
  ctx: CanvasRenderingContext2D,
  theme: CardTheme,
  picture: AttackPicture,
  threats: KneeboardThreatItem[],
  box: Rect,
  basemap?: BasemapTiles,
  wingmen: { label: string; picture: AttackPicture }[] = [],
  outputScale = 1,
): BasemapReport | undefined {
  fillRect(ctx, box.x, box.y, box.w, box.h, theme.diagramBg);
  const view = planViewTransform(picture, box);
  if (!view) return undefined;
  const { scale, toPx, nmToPx } = view;
  const insideBox = (p: [number, number]) => p[0] >= box.x && p[0] <= box.x + box.w && p[1] >= box.y && p[1] <= box.y + box.h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();

  const report = basemap ? drawBasemap(ctx, theme, basemap, view, box, outputScale) : undefined;

  // Threat rings, as on the map: centre from bearing and distance off the target.
  for (const t of threats) {
    if (!t.maxRange_nm) continue;
    const b = (t.bearing_deg * Math.PI) / 180;
    const [px, py] = nmToPx(Math.sin(b) * t.distance_nm, Math.cos(b) * t.distance_nm);
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
    ctx.strokeStyle = theme.threatRing.color;
    ctx.lineWidth = theme.threatRing.width;
    ctx.setLineDash(theme.threatRing.dash ?? []);
    for (const [a0, a1] of spans) {
      ctx.beginPath();
      ctx.arc(px, py, r, a0, a1);
      ctx.stroke();
    }
  }
  // A dashed ring must not hand its dash on to the marker rings and label borders drawn next.
  if (theme.threatRing.dash) ctx.setLineDash([]);

  // Everything the labels must keep clear of: the plated notes, the markers and the furniture.
  const obstacles: Rect[] = [];
  // The notes are measured as they come up but drawn after the labels, so that the leader
  // of a label pointing at one (the IP label's leader ends on the edge note) stops at its
  // plate instead of running across the text. The price: a plate beside a marker can cover
  // a few pixels of its rim.
  const notes: PlatedNote[] = [];

  // The rest of the strike, thin and grey under this jet: where the others
  // come from and leave by, without competing with the numbers this pilot
  // flies. The frame stays fitted to this jet's attack.
  for (const w of wingmen) {
    for (const line of w.picture.lines) {
      if (line.style === 'bomb') continue;
      const dashed = line.style === 'route' || line.style === 'egressLeg';
      strokePath(ctx, line.points.map(toPx), { color: theme.wingman.color, width: theme.wingman.width, dash: dashed ? theme.wingman.dash : undefined });
    }
    // Name the track where that jet turns in on the target.
    const joinPoint = w.picture.lines.find((l) => l.style === 'pullDown' || l.style === 'attack')?.points[0];
    if (joinPoint) {
      const [x, y] = toPx(joinPoint);
      if (insideBox([x, y])) notes.push(platedNote(ctx, w.label, x + 6, y - 6, { color: theme.textGray, size: 13, align: 'left' }));
    }
  }

  for (const line of picture.lines) strokePath(ctx, line.points.map(toPx), theme.lines[line.style], 1.1);

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
        const text = `→ ${picture.ipShortLabel ?? 'IP'}`;
        // Centred on the edge crossing, but held far enough in that the whole plate stays on
        // the card; a fixed margin let the end of a long note like "→ STPT 2" run off the edge.
        ctx.font = `bold 12px ${SANS}`;
        const noteW = ctx.measureText(text).width;
        const tx = Math.min(Math.max(edge[0], box.x + noteW / 2 + 4), box.x + box.w - noteW / 2 - 4);
        const ty = Math.min(Math.max(edge[1], box.y + 16), box.y + box.h - 8);
        notes.push(platedNote(ctx, text, tx, ty, { color: theme.ipArrow, size: 12, align: 'center' }));
      }
    }
  }
  for (const note of notes) obstacles.push(note.plate);

  const markerR = PLAN_MARKER_R;
  for (const marker of picture.markers) {
    const [x, y] = toPx(marker.position);
    drawMarker(ctx, theme, x, y, marker.kind, theme.marker.colors[marker.kind], markerR);
    obstacles.push({ x: x - markerR - 1, y: y - markerR - 1, w: 2 * markerR + 2, h: 2 * markerR + 2 });
  }
  // North arrow and scale bar are obstacles too.
  obstacles.push({ x: box.x + box.w - 44, y: box.y + 6, w: 40, h: 68 }, { x: box.x + 6, y: box.y + box.h - 34, w: scale + 24, h: 30 });
  // The map's credit line, bottom right, only when there is a map to credit.
  ctx.font = `11px ${SANS}`;
  const attributionW = report && report.drawn > 0 ? ctx.measureText(OSM_ATTRIBUTION).width + 8 : 0;
  if (attributionW) obstacles.push({ x: box.x + box.w - attributionW - 2, y: box.y + box.h - 19, w: attributionW + 2, h: 19 });

  const requests: LabelRequest[] = [
    // Markers first, then the boxes, so the numbers a pilot flies win the space.
    ...picture.markers
      .filter((m) => m.permanent)
      .map((m) => ({ lines: m.lines, anchor: toPx(m.position), side: m.side, size: 14, anchorRadius: markerR })),
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
          size: 13,
          style: l.kind === 'egress' ? theme.labels.egress : theme.labels.ip,
        };
      })
      .filter((req) => req !== null) as LabelRequest[],
  ];
  for (const label of layoutLabels(ctx, requests, obstacles, box)) drawPlacedLabel(ctx, theme, label);
  for (const note of notes) drawPlatedNote(ctx, theme, note);

  // North arrow and a one-mile bar.
  const nx = box.x + box.w - 24, ny = box.y + 30;
  ctx.strokeStyle = theme.sectionLabel;
  ctx.fillStyle = theme.sectionLabel;
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
  txt(ctx, 'N', nx, ny + 35, { size: 13, bold: true, family: SANS, color: theme.sectionLabel, align: 'center' });
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
  txt(ctx, '1 nm', bx + scale / 2, by - 7, { size: 12, family: SANS, color: theme.sectionLabel, align: 'center' });
  if (attributionW) {
    fillRect(ctx, box.x + box.w - attributionW, box.y + box.h - 16, attributionW, 16, theme.attributionBg);
    txt(ctx, OSM_ATTRIBUTION, box.x + box.w - 4, box.y + box.h - 4, { size: 11, family: SANS, color: theme.textGray, align: 'right' });
  }
  ctx.restore();
  return report;
}

// ─── Side view ────────────────────────────────────────────────────────────────

/**
 * The card's side view. Exported for the attack editor, which draws the same
 * picture live as the numbers change, in Day colours.
 */
export function drawSideProfile(ctx: CanvasRenderingContext2D, side: SideProfile, box: Rect, theme: CardTheme = DAY_THEME) {
  fillRect(ctx, box.x, box.y, box.w, box.h, theme.diagramBg);
  const padL = 28, padR = 28, padTop = 48, padBottom = 48;
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
  ctx.strokeStyle = theme.ground;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(box.x + 4, groundY);
  ctx.lineTo(X(0) + 6, groundY);
  ctx.stroke();
  ctx.strokeStyle = theme.groundHatch;
  ctx.lineWidth = 0.8;
  for (let x = box.x + 10; x < X(0) + 6; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x - 8, groundY + 10);
    ctx.stroke();
  }

  // Where each marker sits, worked out first: the hard-deck note and the labels keep clear of them.
  const markerR = SIDE_MARKER_R;
  const obstacles: Rect[] = [];
  side.points.forEach((p, i) => {
    const [x, y] = P(i);
    if (p.kind === 'APEX') obstacles.push({ x: x - 10, y: y - 10, w: 20, h: 20 });
    else if (p.kind !== 'EGRESS') obstacles.push({ x: x - markerR - 1, y: y - markerR - 1, w: 2 * markerR + 2, h: 2 * markerR + 2 });
  });

  // Hard deck.
  if (side.hardDeck_ft != null && side.hardDeck_ft > 0) {
    const deckY = Y(side.hardDeck_ft);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(box.x + 4, deckY);
    ctx.lineTo(X(0) + 6, deckY);
    ctx.stroke();
    ctx.setLineDash([]);
    // The note sits in the first stretch of the line that no marker and no track crosses.
    // At the left edge, a low ingress puts its first markers right on top of it.
    const deckText = `HARD DECK ${side.hardDeck_ft.toLocaleString()}ft AGL`;
    const deckSize = 11;
    ctx.font = `${deckSize}px ${MONO}`;
    const deckW = ctx.measureText(deckText).width;
    const deckBase = deckY - 3;
    const trackPts: Array<[number, number]> = [];
    for (const s of side.segments) {
      const [x1, y1] = P(s.from);
      const [x2, y2] = P(s.to);
      const via: [number, number] | undefined = s.via != null ? [P(s.via)[0], P(s.via)[1] - 10] : s.curve === 'up' ? [x1 + (x2 - x1) * 0.55, y1] : undefined;
      const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        trackPts.push(via
          ? [(1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * via[0] + t * t * x2, (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * via[1] + t * t * y2]
          : [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
      }
    }
    const hits = (r: Rect) =>
      obstacles.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y) ||
      trackPts.some(([px, py]) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
    const slot = (x: number): Rect => ({ x: x - 3, y: deckBase - deckSize - 3, w: deckW + 6, h: deckSize + 8 });
    let deckX = box.x + 8;
    for (let x = box.x + 8; x + deckW < X(0) - 10; x += 4) {
      if (!hits(slot(x))) { deckX = x; break; }
    }
    txt(ctx, deckText, deckX, deckBase, { size: deckSize, family: MONO, color: theme.accent });
    obstacles.push(slot(deckX));
  }

  // Segments, in the picture's colours.
  for (const s of side.segments) {
    const style = theme.lines[s.style];
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
  side.points.forEach((p, i) => {
    const [x, y] = P(i);
    if (p.kind === 'APEX') {
      ctx.fillStyle = theme.lines.pullDown.color;
      ctx.font = `bold 18px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', x, y);
    } else if (p.kind !== 'EGRESS') {
      drawMarker(ctx, theme, x, y, p.kind, theme.marker.colors[p.kind], markerR);
    }
  });
  const requests: LabelRequest[] = side.points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.label)
    .map(({ p, i }) => ({ lines: [p.label!], anchor: P(i), side: p.side ?? 'top', size: 13, anchorRadius: p.kind !== 'APEX' && p.kind !== 'EGRESS' ? markerR : 0 }));
  for (const label of layoutLabels(ctx, requests, obstacles, box)) drawPlacedLabel(ctx, theme, label);

  ctx.restore();
}

// ─── Main render function ─────────────────────────────────────────────────────

const FOOTER_HEIGHT = 28;

/**
 * Draw the card. With `basemap`, the north-up picture sits on whatever map
 * tiles are already in hand; the report lists the tiles it wanted, so a caller
 * can fetch the rest and draw again. Without it the card is drawn plain.
 * `theme` is the card's look; left out, it is Day.
 * `scale` is the pixels per layout unit (a whole number); left out, it is KNEEBOARD_SCALE.
 * The card is laid out in 768 x 1024 whatever the scale, so only its sharpness changes.
 */
export function renderKneeboardCard(
  canvas: HTMLCanvasElement,
  card: KneeboardCard,
  basemap?: BasemapTiles,
  theme: CardTheme = DAY_THEME,
  scale = KNEEBOARD_SCALE,
): BasemapReport | undefined {
  // Sizing the canvas also clears its transform, so the scale is set after it, every time.
  canvas.width = KNEEBOARD_WIDTH * scale;
  canvas.height = KNEEBOARD_HEIGHT * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  let report: BasemapReport | undefined;

  fillRect(ctx, 0, 0, KNEEBOARD_WIDTH, KNEEBOARD_HEIGHT, theme.bg);

  let y = drawHeader(ctx, theme, card);
  if (card.header.strikeLine) y = drawStrikeStrip(ctx, theme, card.header.strikeLine, y);
  for (const caution of card.header.cautions ?? []) y = drawCautionStrip(ctx, theme, caution, y);
  y = drawTargetSection(ctx, theme, card, y);
  y = drawWeaponSection(ctx, theme, card, y);
  y = drawThreatsSection(ctx, theme, card, y);

  // The two pictures share what is left above the footer: the plan view gets
  // the larger share, the side view the rest.
  const footerTop = KNEEBOARD_HEIGHT - FOOTER_HEIGHT;
  const diagram = card.attackSection.diagram;
  if (diagram?.picture || diagram?.side) {
    const strips = (diagram.picture ? STRIP_H : 0) + (diagram.side ? STRIP_H : 0);
    const remaining = footerTop - y - strips - 2;
    const planH = diagram.picture && diagram.side ? Math.round(remaining * 0.66) : remaining;
    const sideH = remaining - (diagram.picture ? planH : 0);
    const headingText = `ATTACK HDG ${fmtHdg(diagram.attackHeading_deg)}   ·   EGRESS ${diagram.egressDirection.toUpperCase()} ${fmtHdg(diagram.egressHeading_deg)}`;
    if (diagram.picture) {
      y = sectionStrip(ctx, theme, 'ATTACK — NORTH UP', y, headingText);
      report = drawPlanView(ctx, theme, diagram.picture, card.threatSection.threats.slice(0, CARD_THREAT_ROWS), { x: 0, y, w: KNEEBOARD_WIDTH, h: planH }, basemap, diagram.wingmen, scale);
      y += planH;
      hLine(ctx, y, theme.divider);
      y += 1;
    }
    if (diagram.side) {
      const right = 'altitudes AGL · release by = no lower';
      y = sectionStrip(ctx, theme, 'PROFILE — SIDE VIEW', y, diagram.picture ? right : `${headingText}   ·   ${right}`);
      drawSideProfile(ctx, diagram.side, { x: 0, y, w: KNEEBOARD_WIDTH, h: sideH }, theme);
      y += sideH;
    }
  }

  fillRect(ctx, 0, KNEEBOARD_HEIGHT - FOOTER_HEIGHT, KNEEBOARD_WIDTH, FOOTER_HEIGHT, theme.headerBg);
  txt(ctx, 'PHOENIX WEAPONEER', 10, KNEEBOARD_HEIGHT - 10, { size: 12, bold: true, family: MONO, color: theme.footerText });
  txt(ctx, 'UNCLASSIFIED // TRAINING USE ONLY', KNEEBOARD_WIDTH / 2, KNEEBOARD_HEIGHT - 10, { size: 11, family: MONO, color: theme.footerNote, align: 'center' });
  return report;
}

/**
 * How the map came out on a card. `none`: the card has no north-up picture.
 * `partial` / `unavailable`: some or all tiles never arrived (offline, blocked).
 */
export type MapStatus = 'ok' | 'partial' | 'unavailable' | 'off' | 'none';

export function mapStatusOf(report: BasemapReport | undefined, enabled: boolean): MapStatus {
  if (!enabled) return 'off';
  if (!report || report.tiles.length === 0) return 'none';
  if (report.drawn === report.tiles.length) return 'ok';
  return report.drawn > 0 ? 'partial' : 'unavailable';
}

/**
 * Draw the card with its map, for export: draw once with what is cached, fetch
 * what was missing (bounded by `timeoutMs`), draw again. A card whose tiles do
 * not come is still drawn and still exported — just without the map.
 *
 * Give each export its own canvas: the preview redraws the shared one whenever
 * its own tiles land, and could do so between this draw and the PNG encode.
 */
export async function renderKneeboardCardWithMap(
  canvas: HTMLCanvasElement,
  card: KneeboardCard,
  opts: { map: boolean; timeoutMs?: number; theme?: CardTheme; scale?: number },
): Promise<MapStatus> {
  if (!opts.map) {
    renderKneeboardCard(canvas, card, undefined, opts.theme, opts.scale);
    return 'off';
  }
  let report = renderKneeboardCard(canvas, card, cachedBasemapTiles, opts.theme, opts.scale);
  if (report && report.pending > 0) {
    await loadBasemapTiles(report.tiles, opts.timeoutMs);
    report = renderKneeboardCard(canvas, card, cachedBasemapTiles, opts.theme, opts.scale);
  }
  return mapStatusOf(report, true);
}

/** Export canvas to base64 PNG string (strip the data URL prefix) */
export function canvasToBase64Png(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}
