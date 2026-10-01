/**
 * The colours the kneeboard card is drawn in, and how it strokes its lines.
 *
 * One theme is one complete look: the furniture (paper, header, strips, text),
 * the attack picture's lines, markers and label boxes, the threat rings and the
 * other jets' tracks, and how the map tiles are treated. The renderer takes every
 * colour from here and holds none of its own, so a theme can restyle the card
 * without the renderer knowing which look it is. `DAY_THEME` is the card as it has
 * always been; `NIGHT_THEME` (red, for a dark-adapted eye) and `NVG_THEME` (green,
 * for night-vision goggles) are the other two looks, and `themeForLighting` picks
 * one by name.
 *
 * Every string in a theme except its `id` and `name` is a colour, so a theme can
 * be checked by walking it (`themeColours`).
 *
 * The planner's map does not read a theme. It draws with `LINE_STYLE`,
 * `MARKER_COLOR` and `LABEL_STYLE` in `attackPicture.ts`, and the Day theme
 * points at those same tables, so the Day card and the map stay one palette.
 */

import type { LineStyleKey, MarkerKind } from '../types/attackPicture.types';
import { LABEL_STYLE, LINE_STYLE, MARKER_COLOR, type LineStyle } from './attackPicture';

/** A label box: its fill, the words in it, and its outline. */
export interface LabelColors {
  bg: string;
  fg: string;
  border: string;
}

/**
 * How the map tiles under the plan view are treated. The tiles arrive grey. Each
 * is drawn, then optionally flipped to a negative and multiplied by a tint, all with
 * blend modes (`globalCompositeOperation`): `ctx.filter` is missing from older
 * WebKit, which is what a macOS or Linux desktop build runs on. A wash of
 * `washColor` is then laid over the whole map, so it stays behind the attack.
 */
export interface BasemapTreatment {
  /** Flip the tiles to a negative first: pale ground goes dark, and roads and outlines come up lighter. */
  invert: boolean;
  /** Multiplied over the tiles to darken and colour them. Null leaves them as they are. */
  tint: string | null;
  washColor: string;
  washAlpha: number;
}

export interface CardTheme {
  id: string;
  name: string;

  // ── The card ──
  /** The page. */
  bg: string;
  headerBg: string;
  headerText: string;
  /** The profile line under the title, and the date opposite it. */
  headerLabel: string;
  headerDate: string;
  headerRule: string;
  /** A manual delivery's sight setting on the header line (`caution` is for the light strips). */
  headerAmber: string;
  sectionBg: string;
  sectionLabel: string;
  textPrimary: string;
  textGray: string;
  divider: string;
  /** Danger: a minimum safe altitude, an in-range threat, a hard deck. */
  accent: string;
  accentBg: string;
  accentLight: string;
  threatClose: string;
  /** Amber for cautions (unverified data). Red on the day card means danger. */
  caution: string;
  cautionBg: string;
  /** The strip under the header for a member of a strike. */
  strike: string;
  strikeBg: string;
  footerText: string;
  footerNote: string;

  // ── The pictures ──
  diagramBg: string;
  /** The ground line in the side view, and the hatching under it. */
  ground: string;
  groundHatch: string;
  /** The line from a label box back to its point. */
  leader: string;
  /** "→ IP" where the route leaves the frame. */
  ipArrow: string;
  /** The map's credit line box. */
  attributionBg: string;
  threatRing: LineStyle;
  /** The rest of a strike, under this jet's attack: `dash` is for the route and egress legs, the rest are solid. */
  wingman: { color: string; width: number; dash: number[] };
  /** Colour, width and dash of each stage of the attack, on both pictures. */
  lines: Record<LineStyleKey, LineStyle>;
  marker: {
    colors: Record<MarkerKind, string>;
    /** The ring round each disc, and the letters on it. */
    ring: string;
    text: string;
  };
  labels: { tooltip: LabelColors; egress: LabelColors; ip: LabelColors };
  basemap: BasemapTreatment;
}

/**
 * The card as it has always been: paper and navy, the planner's colours on the
 * attack. `lines`, `marker.colors` and the label boxes are the map's own tables,
 * not copies.
 *
 * The map's wash is 0.2, chosen against Ramon AB: at 0.45 the runway was barely
 * there and a desert target showed nothing; at 0.20 runways and roads read and the
 * attack lines still dominate. A contrast boost on top made it too busy.
 */
export const DAY_THEME: CardTheme = {
  id: 'day',
  name: 'Day',

  bg: '#FFFDF5',
  headerBg: '#1C2B3A',
  headerText: '#FFFFFF',
  headerLabel: '#88AACC',
  headerDate: '#667788',
  headerRule: '#334455',
  headerAmber: '#FFC107',
  sectionBg: '#E8E8E0',
  sectionLabel: '#1C2B3A',
  textPrimary: '#0F0F0F',
  textGray: '#505050',
  divider: '#999999',
  accent: '#CC2200',
  accentBg: '#FFF0EE',
  accentLight: '#FFE0DC',
  threatClose: '#8B0000',
  caution: '#8A5A00',
  cautionBg: '#FFF1CC',
  strike: '#0B3C5D',
  strikeBg: '#DCEBF5',
  footerText: '#667788',
  footerNote: '#445566',

  diagramBg: '#F4F4EC',
  ground: '#888888',
  groundHatch: '#AAAAAA',
  leader: '#374151',
  ipArrow: '#2563eb',
  attributionBg: 'rgba(244, 244, 236, 0.85)',
  threatRing: { color: 'rgba(239, 68, 68, 0.55)', width: 1.5 },
  wingman: { color: 'rgba(80, 80, 80, 0.55)', width: 1.5, dash: [6, 6] },
  lines: LINE_STYLE,
  marker: { colors: MARKER_COLOR, ring: '#ffffff', text: '#ffffff' },
  labels: {
    tooltip: { bg: LABEL_STYLE.tooltipBg, fg: LABEL_STYLE.tooltipText, border: LABEL_STYLE.tooltipBorder },
    egress: { bg: LABEL_STYLE.egressBg, fg: '#ffffff', border: LABEL_STYLE.egressBorder },
    ip: { bg: LABEL_STYLE.ipBg, fg: '#ffffff', border: LABEL_STYLE.ipBorder },
  },
  basemap: { invert: false, tint: null, washColor: '#F4F4EC', washAlpha: 0.2 },
};

// ─── Night and NVG ────────────────────────────────────────────────────────────
// Two dim looks the squadron chose by vote from a longer list. Both keep the
// attack picture in today's colours, so they are the loudest thing on the card,
// and move everything else to the family: red for a dark-adapted eye, green for
// goggles. Neither has white anywhere. They are also held to WCAG 2.1 AA contrast
// (text 4.5:1, lines and markers 3:1) in normal vision and in simulated protanopia
// and deuteranopia, because some of the squadron are colour-blind. The rules and the
// contrast arithmetic live in `cardContrast.ts`, and geo-check holds both themes to them.

/**
 * How the attack's stages are stroked in Night and NVG. Each stage has its own width
 * and dash, so no two are told apart by colour alone: red attack and green egress are
 * the classic red-green confusion. Solid lines thicken toward the release (leg 2.6,
 * pull-down 3.6, attack 4.6); the climb is broken, the egress long-dashed, the egress
 * leg dash-dot, the route evenly dashed and the bomb line dotted. The colours are the
 * planner map's own (`LINE_STYLE`), so they follow it; only the strokes are these.
 */
const DARK_LINES: Record<LineStyleKey, LineStyle> = {
  route: { color: LINE_STYLE.route.color, width: 2, dash: [10, 10] },
  leg: { color: LINE_STYLE.leg.color, width: 2.6 },
  climb: { color: LINE_STYLE.climb.color, width: 3, dash: [12, 8] },
  pullDown: { color: LINE_STYLE.pullDown.color, width: 3.6 },
  attack: { color: LINE_STYLE.attack.color, width: 4.6 },
  bomb: { color: LINE_STYLE.bomb.color, width: 2, dash: [1, 8] },
  egress: { color: LINE_STYLE.egress.color, width: 3, dash: [22, 8] },
  egressLeg: { color: LINE_STYLE.egressLeg.color, width: 2, dash: [12, 6, 1, 6] },
};

/** The planner map's marker discs, except the two that could not stay: black letters on them fell short of 4.5:1. */
const DARK_MARKER_COLORS: Record<MarkerKind, string> = {
  ...MARKER_COLOR,
  // Black letters on the map's grey (#6B7280) are 4.34:1; the lightest step that clears 4.6 keeps its slate cast.
  TRK: '#707786',
  // Black letters on the map's red (#EF4444) are 3.99:1 for a protan; more green and blue (pinker) lifts it to 4.6.
  TGT: '#EF5656',
};

/**
 * Night, the squadron's pick "N5a": the dimmest red a red-blind pilot can still read,
 * on plain black, with today's attack colours. The family rule: every colour outside
 * the attack picture is a red hue (green and blue each at most 0.4 of red) or a dim
 * grey (no channel above 0x70, the three within 0x10 of each other). Text is the
 * pinkest red the rule allows, because a protan sees pure red as darker. Markers are
 * today's coloured discs with black letters. The egress and IP boxes keep today's
 * green and blue outlines, and their fills are darkened until the red text on them
 * clears 4.5:1. The margins are thin on purpose: this is the dimmest card that passes,
 * so a dimmer colour will fail geo-check.
 */
export const NIGHT_THEME: CardTheme = {
  id: 'night',
  name: 'Night',

  bg: '#000000',
  headerBg: '#000000',
  headerText: '#E45B5B',
  headerLabel: '#E45B5B',
  headerDate: '#E45B5B',
  headerRule: '#BD4B4B',
  headerAmber: '#FF6666',
  sectionBg: '#000000',
  sectionLabel: '#E85C5C',
  textPrimary: '#E45B5B',
  textGray: '#E85C5C',
  divider: '#BD4B4B',
  accent: '#FF6666',
  accentBg: '#000000',
  accentLight: '#000000',
  threatClose: '#FF6666',
  caution: '#E45B5B',
  cautionBg: '#000000',
  strike: '#E45B5B',
  strikeBg: '#000000',
  footerText: '#E45B5B',
  footerNote: '#E45B5B',

  diagramBg: '#000000',
  ground: '#BD4B4B',
  groundHatch: '#BD4B4B',
  leader: '#BD4B4B',
  ipArrow: '#E85C5C',
  attributionBg: '#000000',
  threatRing: { color: '#BD4B4B', width: 2, dash: [3, 5] },
  wingman: { color: '#646464', width: 1.5, dash: [6, 6] },
  lines: DARK_LINES,
  marker: { colors: DARK_MARKER_COLORS, ring: '#000000', text: '#000000' },
  labels: {
    tooltip: { bg: '#000000', fg: '#E45B5B', border: '#BD4B4B' },
    egress: { bg: '#041109', fg: '#F06060', border: LABEL_STYLE.egressBorder },
    ip: { bg: '#070D20', fg: '#F06060', border: LABEL_STYLE.ipBorder },
  },
  basemap: { invert: true, tint: '#240000', washColor: '#000000', washAlpha: 0 },
};

/**
 * NVG, the squadron's pick "G5a": the dimmest green that still reads for every pilot,
 * pure green on plain black, with today's attack colours. The family rule: every colour
 * outside the attack picture is green (green the largest channel, red at most 0.6 of
 * it) or a dim grey (no channel above 0x50, the three within 0x10 of each other), so
 * the goggles are not flooded. A deuteranope sees green a little darker, so the text is
 * set for them. Markers are today's coloured discs with black letters. The egress and
 * IP boxes keep today's green and blue outlines, and their fills are darkened until
 * the green text on them clears 4.5:1. The margins are thin on purpose: this is the
 * dimmest card that passes, so a dimmer colour will fail geo-check.
 */
export const NVG_THEME: CardTheme = {
  id: 'nvg',
  name: 'NVG',

  bg: '#000000',
  headerBg: '#000000',
  headerText: '#008E00',
  headerLabel: '#008E00',
  headerDate: '#008E00',
  headerRule: '#007600',
  headerAmber: '#009E00',
  sectionBg: '#000000',
  sectionLabel: '#009400',
  textPrimary: '#008E00',
  textGray: '#009400',
  divider: '#007600',
  accent: '#009E00',
  accentBg: '#000000',
  accentLight: '#000000',
  threatClose: '#009E00',
  caution: '#008E00',
  cautionBg: '#000000',
  strike: '#008E00',
  strikeBg: '#000000',
  footerText: '#008E00',
  footerNote: '#008E00',

  diagramBg: '#000000',
  ground: '#007600',
  groundHatch: '#007600',
  leader: '#007600',
  ipArrow: '#009400',
  attributionBg: '#000000',
  threatRing: { color: '#007800', width: 2, dash: [3, 5] },
  wingman: { color: '#007272', width: 1.5, dash: [6, 6] },
  lines: DARK_LINES,
  marker: { colors: DARK_MARKER_COLORS, ring: '#000000', text: '#000000' },
  labels: {
    tooltip: { bg: '#000000', fg: '#008E00', border: '#007600' },
    egress: { bg: '#071B0F', fg: '#009B00', border: LABEL_STYLE.egressBorder },
    ip: { bg: '#0C1635', fg: '#009B00', border: LABEL_STYLE.ipBorder },
  },
  basemap: { invert: true, tint: '#001800', washColor: '#000000', washAlpha: 0 },
};

/** The card's lighting: Day is the default, Night keeps a dark-adapted eye, NVG spares the goggles. */
export type CardLighting = 'day' | 'night' | 'nvg';

/** Every lighting, in the order a picker lists them. */
export const CARD_LIGHTINGS: readonly CardLighting[] = ['day', 'night', 'nvg'];

/** The theme for a lighting. A mission saved without one, or with a name this build does not know, gets Day. */
export function themeForLighting(lighting: CardLighting | string | null | undefined): CardTheme {
  return lighting === 'night' ? NIGHT_THEME : lighting === 'nvg' ? NVG_THEME : DAY_THEME;
}

/** Every colour in a theme by its path ("lines.attack.color"): all its strings but the id and name. */
export function themeColours(theme: CardTheme): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') found[path] = value;
    else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, inner] of Object.entries(value)) walk(inner, path ? `${path}.${key}` : key);
    }
  };
  for (const [key, value] of Object.entries(theme)) if (key !== 'id' && key !== 'name') walk(value, key);
  return found;
}

/** A theme's colour as red, green and blue (0-255) and opacity. Reads the hex and `rgb()`/`rgba()` forms themes use; undefined for anything else. */
export function parseColour(css: string): { r: number; g: number; b: number; a: number } | undefined {
  const text = css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
    return { r, g, b, a: 1 };
  }
  const fn = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(text);
  if (fn) return { r: +fn[1], g: +fn[2], b: +fn[3], a: fn[4] === undefined ? 1 : +fn[4] };
  return undefined;
}
