/**
 * The 3D strike playback, as data: a planned strike turned into time-stamped
 * jet and bomb tracks that agree with the map, the card and the strike
 * readout. Pure TypeScript: no React, DOM or three.js, so the phone build can
 * import it and the 3D scene stays its own chunk (geo-check pins that).
 *
 * Typical use:
 *   const input = playbackInputFromMission(mission, { strikeId }, weapons);
 *   const pb = buildStrikePlayback(input);            // once per plan
 *   let timing = retime(pb);                          // on every slider move
 *   sampleJet(pb, timing, k, t, 'plan', state);       // every frame
 *
 *   sampleJet(pb, timing, k, t, 'display', camState);  // the camera's layer
 *
 * File map: types (every type), frame (the local frame), input (mission →
 * input), chain / anchors / altitude / clock / resample (one jet's plan
 * layer), family (per-delivery speeds, stated times, falls), bomb, events,
 * frag (conflicts, slider danger zones, the cloud), jetTrack, strikePlayback,
 * timing (retime, Apply), display (rounded corners, the lead-in), formation
 * (display-only slots), sample (60 fps, sideCoords), threats (domes), bounds.
 *
 * Which layer for what: tests, the top-down and the side-on views use
 * 'plan' (the card's lines); the chase, orbit and from-target cameras use
 * 'display'. The side-on view should be drawn in `sideCoords` (range to the
 * jet's own target, AGL), the card's side-view axes.
 */

export * from './types';
export { FT_TO_M, NM_TO_M, makeLocalFrame, toLocal, fromLocal, fromLocalInto, upOf, toThree } from './frame';
export { PHASES, PHASE_STYLE } from './phases';
export { playbackInputFromMission, type PlaybackSubject } from './input';
export { buildJetTrack } from './jetTrack';
export { buildStrikePlayback, DEFAULT_OPTIONS } from './strikePlayback';
export { retime, delaysToOffsets } from './timing';
export { fragSpecOf, readoutJets, strikeJetsAt, dangerZones, inDangerZone, fragCloudAt, newFragCloudState } from './frag';
export { strikeEvents } from './events';
export { sampleJet, sampleBomb, newJetState, newBombState, sideCoords } from './sample';
export { formationLateral_m, pushWeight, directionWeight, slotSide, FORMATION_TOL_S, FORMATION_FADE_TO_S } from './formation';
export { threatDomes, domeHeightAt_m, insideDome } from './threats';
export { playbackBounds } from './bounds';
