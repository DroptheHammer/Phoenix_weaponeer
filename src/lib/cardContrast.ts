/**
 * What the Night and NVG card themes are held to: the colour-family rules, and WCAG 2.1
 * AA contrast for every pair of colours the card draws, in normal vision and in simulated
 * protanopia and deuteranopia. Pure arithmetic with no DOM, so geo-check (node) can run it.
 * It is the test of `NIGHT_THEME` and `NVG_THEME`, kept beside them so a change to one
 * can't go without the other.
 *
 * The family rules:
 *   Night (keep a dark-adapted eye):   a red hue  (G <= 0.4 R and B <= 0.4 R),
 *                                      or a neutral grey/black with no channel above 0x70.
 *   NVG (do not flood the goggles):    a green to blue-green hue (G is the largest
 *                                      channel, R <= 0.6 G), or a dim neutral with
 *                                      no channel above 0x50.
 * Neither allows white. "Neutral" means the three channels within 0x10 of each other: a
 * grey, not a tinted colour that happens to be dark.
 *
 * Contrast:
 *   WCAG 2.1 relative luminance from linearised sRGB, ratio (L1 + 0.05) / (L2 + 0.05).
 *   Protanopia and deuteranopia: Machado, Oliveira & Fernandes (2009), severity 1.0,
 *   applied to linear RGB and clamped to [0, 1] before the luminance is taken.
 *   Semi-transparent colours are composited over their real background first, in
 *   gamma-encoded sRGB, which is what a 2D canvas does.
 */

import type { LineStyleKey, MarkerKind } from '../types/attackPicture.types';
import { DAY_THEME, parseColour, type CardTheme } from './cardTheme';

// ─── The colour families ──────────────────────────────────────────────────────

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export type Family = 'night' | 'nvg';

export const NIGHT_NEUTRAL_MAX = 0x70;
export const NVG_NEUTRAL_MAX = 0x50;
/** How far apart a grey's channels may be. */
export const NEUTRAL_SPREAD = 0x10;

const maxOf = ({ r, g, b }: Rgb) => Math.max(r, g, b);
const spreadOf = ({ r, g, b }: Rgb) => Math.max(r, g, b) - Math.min(r, g, b);
const hex = (n: number) => '0x' + Math.round(n).toString(16).toUpperCase().padStart(2, '0');

export interface Verdict {
  ok: boolean;
  /** Which branch of the rule it met, or why it met neither. */
  why: string;
}

export function nightRule(c: Rgb): Verdict {
  if (c.g <= 0.4 * c.r && c.b <= 0.4 * c.r) return { ok: true, why: 'red hue' };
  if (maxOf(c) <= NIGHT_NEUTRAL_MAX && spreadOf(c) <= NEUTRAL_SPREAD) return { ok: true, why: 'dim neutral' };
  return {
    ok: false,
    why: `not a red hue (G ${hex(c.g)}, B ${hex(c.b)} against 0.4 R = ${hex(0.4 * c.r)}) and not a dim neutral (max ${hex(maxOf(c))}, spread ${hex(spreadOf(c))})`,
  };
}

export function nvgRule(c: Rgb): Verdict {
  if (c.g >= c.r && c.g >= c.b && c.r <= 0.6 * c.g && c.g > 0) return { ok: true, why: 'green hue' };
  if (maxOf(c) <= NVG_NEUTRAL_MAX && spreadOf(c) <= NEUTRAL_SPREAD) return { ok: true, why: 'dim neutral' };
  return {
    ok: false,
    why: `not green (R ${hex(c.r)}, G ${hex(c.g)}, B ${hex(c.b)}: needs G largest and R <= 0.6 G) and not a dim neutral (max ${hex(maxOf(c))}, spread ${hex(spreadOf(c))})`,
  };
}

export const ruleFor = (family: Family) => (family === 'night' ? nightRule : nvgRule);

/**
 * The colour paths (as `themeColours` names them) that Night and NVG take from the planner
 * map rather than from their family, so the family rule is not applied to them: the eight
 * line colours, the eight marker discs, and the outlines and fills of the egress and IP
 * boxes (today's green and blue, the fills darkened). The contrast of each against what it
 * sits on is still held, by `contrastPairs`.
 */
export const KEPT_FROM_DAY: readonly string[] = [
  ...Object.keys(DAY_THEME.lines).map((k) => `lines.${k}.color`),
  ...Object.keys(DAY_THEME.marker.colors).map((k) => `marker.colors.${k}`),
  'labels.egress.bg', 'labels.egress.border', 'labels.ip.bg', 'labels.ip.border',
];

// ─── Contrast and colour-blind simulation ─────────────────────────────────────

export type Vision = 'normal' | 'protan' | 'deutan';
export const VISIONS: readonly Vision[] = ['normal', 'protan', 'deutan'];

export interface Rgba extends Rgb {
  a?: number;
}

const MACHADO: Record<Exclude<Vision, 'normal'>, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

/** An sRGB channel (0-255, may be fractional after compositing) as linear light. */
export function linear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance from three linear channels, as seen with `vision`. */
export function luminanceOfLinear(r: number, g: number, b: number, vision: Vision): number {
  if (vision !== 'normal') {
    const m = MACHADO[vision];
    const clamp = (x: number) => Math.min(1, Math.max(0, x));
    const [rr, gg, bb] = m.map((row) => clamp(row[0] * r + row[1] * g + row[2] * b));
    return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function luminance(c: Rgb, vision: Vision = 'normal'): number {
  return luminanceOfLinear(linear(c.r), linear(c.g), linear(c.b), vision);
}

export function ratioOfLuminances(a: number, b: number): number {
  return a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05);
}

/** `fg` laid over an opaque `bg`, in gamma-encoded sRGB as the canvas blends. */
export function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a ?? 1;
  if (a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

/** The contrast ratio of `fg` on an opaque `bg`, as seen with `vision`. */
export function ratio(fg: Rgba, bg: Rgba, vision: Vision = 'normal'): number {
  return ratioOfLuminances(luminance(over(fg, bg), vision), luminance(bg, vision));
}

// ─── Every pair the card draws ────────────────────────────────────────────────

/** Text is held to 4.5:1 (the bold title too, though WCAG would let large text off with 3:1). A graphic is held to 3:1. */
export type PairKind = 'text' | 'graphic';
export const CONTRAST_FLOOR: Record<PairKind, number> = { text: 4.5, graphic: 3 };

export interface ContrastPair {
  id: string;
  kind: PairKind;
  fg: string;
  bg: string;
  ratio: Record<Vision, number>;
}

const rgbaOf = (css: string): Rgba => {
  const c = parseColour(css);
  if (!c) throw new Error(`cannot read colour ${css}`);
  return c;
};

const eachVision = (f: (v: Vision) => number): Record<Vision, number> => ({ normal: f('normal'), protan: f('protan'), deutan: f('deutan') });

function pairOf(id: string, kind: PairKind, fg: string, bg: string): ContrastPair {
  const f = rgbaOf(fg);
  const b = rgbaOf(bg);
  if ((b.a ?? 1) < 1) throw new Error(`${id}: background ${bg} is not opaque`);
  return { id, kind, fg, bg, ratio: eachVision((v) => ratio(f, b, v)) };
}

/**
 * A marker is a disc with a ring round it. It stands out if its ring does against what is
 * around it, or, when the ring is dark like the ground, if the disc does against the ring
 * and the ground: the better of the two is its ratio.
 */
function markerPair(t: CardTheme, kind: MarkerKind): ContrastPair {
  const disc = rgbaOf(t.marker.colors[kind]);
  const ring = rgbaOf(t.marker.ring);
  const ground = rgbaOf(t.diagramBg);
  return {
    id: `${kind} marker`,
    kind: 'graphic',
    fg: `${t.marker.colors[kind]} ring ${t.marker.ring}`,
    bg: t.diagramBg,
    ratio: eachVision((v) => Math.max(ratio(ring, ground, v), Math.min(ratio(disc, ring, v), ratio(disc, ground, v)))),
  };
}

/**
 * Every pair of colours on the card that WCAG 2.1 AA cares about, taken from what the
 * renderer draws on what (`renderKneeboardCanvas.ts`). Every pair is listed whether or not
 * a given card draws it: all eight line styles, all eight markers, the wingman track, the
 * warnings, the sight setting, the egress and IP boxes, the hard deck. So a theme that
 * passes is legible on any card.
 *
 * Held: all text, and every line, ring, marker and symbol a pilot reads (the stages of the
 * attack, the discs and their letters, the threat rings, the other jet's track, the side
 * view's profile, ground line and hatching, the hard deck, the north arrow and scale bar,
 * the leader lines, the rules and dividers). Not held: the fills behind text (strips,
 * bands, label boxes), which carry nothing a pilot needs; their text is what is held.
 */
export function contrastPairs(t: CardTheme): ContrastPair[] {
  const p: ContrastPair[] = [];
  const text = (id: string, fg: string, bg: string) => { p.push(pairOf(id, 'text', fg, bg)); };
  const graphic = (id: string, fg: string, bg: string) => { p.push(pairOf(id, 'graphic', fg, bg)); };
  const credit = over(rgbaOf(t.attributionBg), rgbaOf(t.diagramBg));
  const creditCss = `rgb(${Math.round(credit.r)}, ${Math.round(credit.g)}, ${Math.round(credit.b)})`;

  // The card's furniture.
  text('title on the header', t.headerText, t.headerBg);
  text('profile label on the header', t.headerLabel, t.headerBg);
  text('date on the header', t.headerDate, t.headerBg);
  text('sight setting on the header', t.headerAmber, t.headerBg);
  text('strike strip', t.strike, t.strikeBg);
  text('caution strip', t.caution, t.cautionBg);
  text('section label', t.sectionLabel, t.sectionBg);
  text('section strip note', t.textGray, t.sectionBg);
  text('text on the page', t.textPrimary, t.bg);
  text('quiet text on the page', t.textGray, t.bg);
  text('MIN SAFE on the page', t.accent, t.bg);
  text('weapon warning strip', t.accent, t.accentLight);
  text('in-range threat name', t.threatClose, t.accentBg);
  text('in-range bearing and distance', t.accent, t.accentBg);
  text('in-range max range', t.textGray, t.accentBg);
  text('footer', t.footerText, t.headerBg);
  text('footer note', t.footerNote, t.headerBg);
  graphic('rule under the header', t.headerRule, t.headerBg);
  graphic('divider on the page', t.divider, t.bg);

  // The north-up picture, on its ground.
  text("other jet's name", t.textGray, t.diagramBg);
  text('→ IP', t.ipArrow, t.diagramBg);
  text('N and 1 nm', t.sectionLabel, t.diagramBg);
  text('map credit on its box', t.textGray, creditCss);
  graphic('north arrow and scale bar', t.sectionLabel, t.diagramBg);
  graphic('threat ring', t.threatRing.color, t.diagramBg);
  graphic("other jet's track", t.wingman.color, t.diagramBg);
  graphic('leader line', t.leader, t.diagramBg);
  text('label box', t.labels.tooltip.fg, t.labels.tooltip.bg);
  text('egress box', t.labels.egress.fg, t.labels.egress.bg);
  text('IP box', t.labels.ip.fg, t.labels.ip.bg);

  // Both pictures: the attack itself.
  for (const k of Object.keys(t.lines) as LineStyleKey[]) graphic(`${k} line`, t.lines[k].color, t.diagramBg);
  for (const k of Object.keys(t.marker.colors) as MarkerKind[]) {
    text(`letters on the ${k} disc`, t.marker.text, t.marker.colors[k]);
    p.push(markerPair(t, k));
  }

  // The side view.
  graphic('ground line', t.ground, t.diagramBg);
  graphic('ground hatching', t.groundHatch, t.diagramBg);
  graphic('apex star', t.lines.pullDown.color, t.diagramBg);
  graphic('hard deck line', t.accent, t.diagramBg);
  text('HARD DECK text', t.accent, t.diagramBg);
  return p;
}

export interface WorstPair {
  ratio: number;
  id: string;
}

/** The lowest ratio of a kind, per vision, and which pair it was. */
export function worstOf(pairs: readonly ContrastPair[], kind: PairKind): Record<Vision, WorstPair> {
  const out = {} as Record<Vision, WorstPair>;
  for (const v of VISIONS) {
    let worst: WorstPair = { ratio: Infinity, id: '' };
    for (const pair of pairs) if (pair.kind === kind && pair.ratio[v] < worst.ratio) worst = { ratio: pair.ratio[v], id: pair.id };
    out[v] = worst;
  }
  return out;
}
