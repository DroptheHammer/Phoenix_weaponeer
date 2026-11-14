/**
 * One colour per jet in a strike, the same on the tab, the preview map, the
 * readout and the 3D playback. Deliberately none of the attack picture's own
 * colours (blue route, red attack, green egress), so a wingman's track never
 * reads as a leg of the selected jet's.
 *
 * It lives here, in a file with no React, so the playback's scene maths
 * (src/lib/playbackScene, which geo-check runs under node) can use the very
 * same list as the strike editor's jet strip.
 */
export const JET_COLORS = ['#22d3ee', '#e879f9', '#a3e635', '#fbbf24'];
