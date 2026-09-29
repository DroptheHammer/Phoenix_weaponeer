/**
 * The colours the kneeboard card is drawn in, and how it strokes its lines.
 *
 * One theme is one complete look: the furniture (paper, header, strips, text),
 * the attack picture's lines, markers and label boxes, the threat rings and the
 * other jets' tracks, and how the map tiles are treated. The renderer takes every
 * colour from here and holds none of its own, so a theme can restyle the card
 * without the renderer knowing which look it is. `DAY_THEME` is the card as it has
 * always been; a night or goggles look is another object of this shape.
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
