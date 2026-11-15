/**
 * The 3D playback's look, as plain numbers and strings: no three.js, no DOM,
 * so geo-check can read them and the scene code imports them from one place.
 */

import { JET_COLORS } from '../jetColors';

/** The strike editor's jet colours (tab, preview map, readout), so a jet is the same colour in 3D. */
export { JET_COLORS };

/** The window colour (tauri.conf.json backgroundColor, index.html), so the scene's edge and fog melt into the app. */
export const BG = '#1a1a2e';

/** Device pixel ratio cap: a Retina screen at 2× costs 1.8× the pixels of 1.5× for little visible gain. */
export const MAX_DPR = 1.5;

/** The jet arrow's length on screen, nose to tail, in CSS pixels, whenever its real size would be smaller. */
export const ARROW_PX = 28;
/** The arrow model's real length, m: close up (a chase camera) it is drawn at this size, never smaller. */
export const ARROW_LEN_M = 18;
/**
 * The bomb's length on screen, CSS pixels, and its real length, m: the same rule as the arrow. It is
 * drawn 14 px long so it can be found on its own fall line: a 10 px one, 1.5 px across, read as one more
 * dash of that red line.
 */
export const BOMB_PX = 14;
export const BOMB_LEN_M = 2.4;
/**
 * The bomb's shape: a tapered body, the narrow nose and the wide tail's radii, m. At 14 px long the tail
 * is 5 px across, over three times the fall line's width.
 */
export const BOMB_NOSE_M = 0.12;
export const BOMB_TAIL_M = 0.43;
/**
 * The bomb's outline: a second, slightly larger body seen from inside, so it shows as an even rim round
 * the real one. It is the same shape grown by this much all round (a scaled copy would leave a thin rim
 * on the sides and a thick one at the ends): at 14 px per 2.4 m that is an end overhang of 1.25 px and a
 * side rim of 1.1 to 1.4 px.
 */
export const BOMB_HULL_M = 0.215;
/**
 * The outline's colour. White on a jet that wears the planner's colour code, where the bomb is the
 * planner's red: white on the dark casing of its fall line, and the red on white reads. The other jets
 * have no fall line and their seat colours (cyan, lime, amber) are too pale on white, so their outline is
 * the window's dark instead.
 */
export const BOMB_HULL = '#ffffff';
export const BOMB_HULL_OTHER = BG;
/** The share the other jets' bombs are darkened to from their seat colour, in linear light (see otherBombHex). */
export const OTHER_BOMB_SHADE = 0.8;
/**
 * A ring round each falling bomb on the 2D overlay: an open circle (the bomb and its line show through)
 * of a dark band with a white line on top, the discs' own edge, so it reads on pale land, on dark ground
 * and over the red line. A jet that wears the planner's colour code gets the larger, solid ring; the
 * others a smaller, fainter one. Both clear the outline's half-length (8.25 px at its longest, a bomb
 * lying across the picture) by the ring line's half-width, so the bomb never pokes through its ring.
 */
export const BOMB_RING_R_PX = 11;
export const BOMB_RING_OTHER_R_PX = 10;
export const BOMB_RING_LINE_PX = 2;
export const BOMB_RING_EDGE_PX = 6;

/**
 * The lines are drawn a set width in CSS pixels (three's wide lines), not
 * the one device pixel plain WebGL lines get: at one pixel the path was all
 * but invisible over a pale map, and thinner still on a high-density screen.
 *
 * The lines are opaque on purpose: a see-through wide line shows a bead at
 * every joint.
 *
 * The planned path and the trail carry the planner's colour code (the map's
 * and the card's LINE_STYLE, one colour per stretch, dashed where the
 * planner dashes), each on a casing in LINE_CASING a little wider, so the
 * pale yellow climb and the blue route read on any map.
 */
export const LINE_CASING = BG;
export const PATH_PX = 2;
export const PATH_CASING_PX = 4;
/**
 * The jets that are not watched (with Show › Attack colours on the watched jet) fly in their seat
 * colour instead, thinner, so the watched jet's colour code stands out and the others never read as a
 * leg of it: the path 1.5 px with no casing, its colour mixed this far toward the background, still
 * dashed where the planner dashes; the trail in the plain seat colour, solid, on a thinner casing.
 * They are told apart by width, casing, arrow and label as well as colour (seat #4's amber is also the
 * climb's yellow).
 */
export const PATH_OTHER_PX = 1.5;
export const OTHER_SHADE = 0.15;
/** The trail behind the jet: wider than the path, so the stretch just flown stands out. */
export const TRAIL_PX = 3.5;
export const TRAIL_CASING_PX = 6;
export const TRAIL_OTHER_PX = 2.5;
export const TRAIL_OTHER_CASING_PX = 4.5;
/** The bomb's whole fall: thin and dashed in the planner's bomb-line red, on its casing. */
export const BOMB_LINE_PX = 1.5;
export const BOMB_LINE_CASING_PX = 3.5;
/**
 * The bomb's trace: a solid line from the release to where the bomb is now, left in place after it lands, so
 * the path it took to the target can be seen. On a jet that wears the planner's colour code it is the bomb
 * line's red, heavier than the dashed fall line still ahead of it and no heavier than the jet's own trail, on
 * a casing. The other jets' is the colour of their bomb, thinner and uncased, as their paths are.
 */
export const BOMB_TRACE_PX = 3;
export const BOMB_TRACE_CASING_PX = 5;
export const BOMB_TRACE_OTHER_PX = 1.5;
/** How far back the trail reaches behind the jet, s of strike time. */
export const TRAIL_S = 20;

/**
 * The target, in the planner's red (MARKER_COLOR.TGT, read where it is drawn, never copied): a ring
 * on the drawn ground RING_PX across on screen (never under RING_MIN_M across the ground, so it
 * stays a ring close up), a post standing up from it, and the TGT disc on top.
 */
export const RING_PX = 14;
export const RING_MIN_M = 60;
/** The posts under the action points' discs, CSS pixels wide; the target's own post is a little wider. */
export const POST_PX = 1.5;
export const TARGET_POST_PX = 2;
/** The TGT disc's radius on screen, CSS pixels, and the font of its letters. */
export const TARGET_R_PX = 12;
export const TARGET_FONT = 'bold 10px ui-sans-serif, system-ui, sans-serif';
/**
 * Every disc's edge: a dark band, then a thin white rim outside it, so a yellow or a red disc
 * reads over pale land (the POP yellow on pale land is 1.67:1) and over the dark background alike.
 */
export const DISC_EDGE = BG;
export const DISC_EDGE_PX = 2;
export const DISC_RIM = '#ffffff';
export const DISC_RIM_PX = 1;

/**
 * The action points: a disc in the planner's marker colour (MARKER_COLOR, read where it is drawn) at
 * each point, with the marker's letters squeezed to fit inside it; the IP gets a disc of its own
 * ("IP" on the planner's IP blue) and the end of the egress leg a small dot.
 */
export const MARKER_R_PX = 10;
/** The jets that are not watched get smaller, fainter discs (no words, no IP disc), and their posts are as faint. */
export const MARKER_OTHER_R_PX = 7;
export const OTHER_MARKER_ALPHA = 0.75;
export const MARKER_FONT = 'bold 9px ui-sans-serif, system-ui, sans-serif';
export const EGRESS_DOT_PX = 3;

/**
 * The planner's words at a point: a white plate like the map's and the card's tooltips (LABEL_STYLE,
 * read where it is drawn), a stripe of the point's colour down its left edge, and a thin light line
 * from the disc to the plate, so it is clear which point the words belong to.
 */
export const CALLOUT_FONT = '600 12px ui-sans-serif, system-ui, sans-serif';
export const CALLOUT_LINE_PX = 15;
export const CALLOUT_PAD_PX = 5;
export const CALLOUT_STRIPE_PX = 3;
export const CALLOUT_LEADER = '#e5e7eb';
export const CALLOUT_LEADER_PX = 1;

/** The words drawn beside things on the picture (the target's tag, each jet's label): a dark plate with light text. */
export const LABEL_FONT = '12px ui-sans-serif, system-ui, sans-serif';
export const LABEL_PLATE = 'rgba(26,26,46,0.85)';
export const LABEL_TEXT = '#e5e7eb';
/** A label plate's line height and its padding, CSS pixels, and the gap between a disc and its plate. */
export const LABEL_LINE_PX = 16;
export const LABEL_PAD_PX = 4;
export const LABEL_GAP_PX = 4;

/** Jet k's colour, the same as its tab in the strike editor. */
export function jetColor(k: number): string {
  return JET_COLORS[((k % JET_COLORS.length) + JET_COLORS.length) % JET_COLORS.length];
}

/**
 * The colour the other jets' bombs are drawn in: the seat colour darkened by OTHER_BOMB_SHADE the way
 * three.js darkens a colour (each channel to linear light, scaled, back to sRGB), not as a plain product
 * of the sRGB numbers, so the picture and the checks that read this agree. '#rrggbb' in and out.
 */
export function otherBombHex(hex: string): string {
  const toLinear = (c: number) => (c < 0.04045 ? c * 0.0773993808 : (c * 0.9478672986 + 0.0521327014) ** 2.4);
  const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** 0.41666 - 0.055);
  let out = '#';
  for (let i = 0; i < 3; i++) {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    out += Math.round(Math.min(1, Math.max(0, toSrgb(toLinear(c) * OTHER_BOMB_SHADE))) * 255).toString(16).padStart(2, '0');
  }
  return out;
}

/** '#rrggbb' `a` moved the share `k` (0…1) of the way toward `b`, channel by channel, as '#rrggbb'. */
export function mixHex(a: string, b: string, k: number): string {
  const ch = (s: string, i: number) => parseInt(s.slice(1 + 2 * i, 3 + 2 * i), 16);
  let out = '#';
  for (let i = 0; i < 3; i++) out += Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * k).toString(16).padStart(2, '0');
  return out;
}
