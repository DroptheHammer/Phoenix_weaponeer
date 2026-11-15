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

/** Jet k's colour, the same as its tab in the strike editor. */
export function jetColor(k: number): string {
  return JET_COLORS[((k % JET_COLORS.length) + JET_COLORS.length) % JET_COLORS.length];
}
