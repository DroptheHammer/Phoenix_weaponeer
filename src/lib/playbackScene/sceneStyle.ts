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
/** The bomb's length on screen, CSS pixels, and its real length, m: the same rule as the arrow. */
export const BOMB_PX = 10;
export const BOMB_LEN_M = 2.4;

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
/** A jet drawn in its seat colour has its path mixed this far toward the background. */
export const PATH_SHADE = 0.45;
/** The trail behind the jet: wider than the path, so the stretch just flown stands out. */
export const TRAIL_PX = 3.5;
export const TRAIL_CASING_PX = 6;
/** The bomb's whole fall: thin and dashed in the planner's bomb-line red, on its casing. */
export const BOMB_LINE_PX = 1.5;
export const BOMB_LINE_CASING_PX = 3.5;
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
export const MARKER_OTHER_R_PX = 7;
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
