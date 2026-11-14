/**
 * The 3D playback scene's pure half: the clock, the camera arithmetic, the
 * look, the adapter onto the playback library, and the terrain maths. No
 * three.js, no React, no DOM anywhere in this folder (geo-check pins that),
 * so it runs under node and the three.js code under src/components/playback
 * stays a thin layer over it.
 *
 * File map: playClock (play, pause, seek, speed), cameraMath (home pose,
 * pixel size, arrow scale, near plane), sceneStyle (colours and sizes),
 * source (the only file that knows the playback library's sampling names),
 * actionPoints (each jet's first action, the moments that carry the
 * planner's words, the stretch of the clock that is played), homeView (what
 * Home frames, which camera opens), show (what the 3D view shows: the Show
 * menu's state), terrain (box, tiles, heights, mesh, credits), tileLoading
 * (the loader's rules: reply bytes, the request pool, all-or-nothing heights,
 * the drape's upload pace, the skirt and the haze).
 */

export * from './playClock';
export * from './cameraMath';
export * from './sceneStyle';
export * from './source';
export * from './actionPoints';
export * from './homeView';
export * from './show';
export * from './terrain';
export * from './tileLoading';
