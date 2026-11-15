/**
 * The timeline's sizes and the colours that are not the planner's, as plain
 * numbers and strings, so geo-check can hold them to contrast. The planner's
 * own colours (the phase lines, the marker discs, the IP label's blue) are not
 * copied here: the components import them from attackPicture.ts.
 */

import type { ActionKind } from './actionPoints';

/** The bottom panel's colour (tailwind's dcs-navy): everything on the lanes sits on it. */
export const PANEL = '#16213e';

/** One lane is this tall: a row of chips above the band, the band, a row of chips below it. */
export const LANE_H_PX = 30;
export const BAND_H_PX = 6;
/** The band's top edge in the lane: the chips above it take the first 12 px. */
export const BAND_TOP_PX = 12;
/** The band under the scrubber. */
export const SCRUB_BAND_H_PX = 4;

/** A chip is 12 px tall and as wide as its letters (6 px each, ten-pixel monospace) plus a little either side. */
export const CHIP_H_PX = 12;
export const CHIP_CHAR_PX = 6;
export const CHIP_PAD_PX = 2;
/** The least clear space between two chips in a row. */
export const CHIP_GAP_PX = 2;
/** A chip with no room is drawn as a dot this wide. */
export const CHIP_DOT_PX = 6;
export const chipWidth = (letters: string) => CHIP_CHAR_PX * letters.length + 2 * CHIP_PAD_PX;

/** The band's outline. The attack red alone is 2.94:1 on the panel for a protan eye, so the band is held by this line. */
export const BAND_OUTLINE = '#d1d5db';
/** The diamond at the time over target is the planner's red with this edge round it, for the same reason. */
export const DIAMOND_EDGE = '#ffffff';
/** The letters of the filled IP chip, on the IP label's own blue. */
export const IP_TEXT = '#ffffff';

/** Each chip's letters: black on every marker colour but the grey TRK, where white is the one that reads. */
export const CHIP_TEXT: Record<ActionKind, '#000000' | '#ffffff'> = {
  AP: '#000000', ROLL: '#000000', RUN: '#000000', POP: '#000000', PDP: '#000000', REL: '#000000', TRK: '#ffffff',
};

/** Where the time over target falls inside another jet's frag: amber stripes (0.35 read 2.5:1 on the panel). */
export const HATCH_RGB = '252, 211, 77';
export const HATCH_ALPHA = 0.5;
export const HATCH = `repeating-linear-gradient(45deg, rgba(${HATCH_RGB}, ${HATCH_ALPHA}) 0 3px, transparent 3px 7px)`;

/** The planner's dashed lines (route, egress leg) on a band: this much on, then off, every this many px. */
export const DASH_PERIOD_PX = 10;
export const DASH_ON_PX = 6;

/** The Show panel's background (tailwind gray-900). */
export const MENU_BG = '#111827';

/** A pale land colour for contrast checks only; the real map under the 3D view is not measured. */
export const LAND_REF = '#f2efe9';
