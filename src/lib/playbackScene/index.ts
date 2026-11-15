/**
 * The 3D playback scene's pure half: the clock, the camera arithmetic, the
 * look, the adapter onto the playback library, and the terrain maths. No
 * three.js, no React, no DOM anywhere in this folder (geo-check pins that),
 * so it runs under node and the three.js code under src/components/playback
 * stays a thin layer over it.
 *
 * File map: playClock (play, pause, seek, speed), cameraMath (home pose,
 * pixel size, arrow scale, near plane, the four camera modes' limits and
 * poses), sceneStyle (colours and sizes), arrowShape (the jet arrow's triangles and shades: a fin and
 * raised wings so a roll reads),
 * source (the only file that knows the playback library's sampling names),
 * targets (one mark per distinct target, its tag, its post), callouts (the
 * letters on the discs, when the planner's words show, where their plates go,
 * how they fade), labels (each jet's label words and where they go),
 * actionPoints (each jet's first action, the moments that carry the
 * planner's words, the stretch of the clock that is played), homeView (what
 * Home frames, which camera opens), show (what the 3D view shows: the Show
 * menu's state), session (what the open playback remembers: the jet watched,
 * the camera, the Show choices, every member's time over target), apply (what
 * Apply writes from those times and says afterwards, and how the cards will
 * number the jets then), lanes (the
 * timeline's axis (kept still while a time is dragged), each jet's phase bands
 * and lettered marks, where the chips go, the stretches of frag conflict and
 * of each jet's danger zones, the keys that move a time), laneStyle (the timeline's sizes and
 * the colours that are not the planner's), terrain (box, tiles, heights, mesh,
 * credits), tileLoading (the loader's rules: reply bytes, the request pool,
 * all-or-nothing heights, the drape's upload pace, the skirt and the haze).
 */

export * from './playClock';
export * from './cameraMath';
export * from './sceneStyle';
export * from './arrowShape';
export * from './source';
export * from './targets';
export * from './callouts';
export * from './labels';
export * from './actionPoints';
export * from './homeView';
export * from './show';
export * from './session';
export * from './apply';
export * from './lanes';
export * from './laneStyle';
export * from './terrain';
export * from './tileLoading';
