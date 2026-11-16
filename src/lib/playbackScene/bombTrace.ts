/**
 * The line a falling bomb leaves behind it in the 3D playback: which part of its fall is drawn at a given
 * moment. Pure: no three.js, no DOM, so geo-check can hold the rule for every attack type without a browser,
 * and the jet layer draws exactly what this returns.
 *
 * The rule, the same for every attack type and every jet: a bomb's line is drawn only while that bomb is in
 * the air. It starts at the release, runs from the release point to the bomb, and is gone when the bomb
 * lands. Nothing of any bomb's fall is drawn before its release, ahead of it, or after its impact. A line left
 * on the ground after the impact would lie ahead of the next bomb down the same attack path (the next jet on
 * that flank) and read as that bomb's own.
 *
 * Whose line is shown at all is the jet layer's: only a jet that wears the planner's colour code shows it.
 */

import type { ScenePoint, SceneSource } from './source';

/** A last piece of the line shorter than this, m, is left out: a line of no length has no direction to draw it by. */
export const TRACE_MIN_PIECE_M = 0.1;

/**
 * How many of the fall's points (source.plannedBomb, the release point first) the line covers at strike time t:
 * every point the bomb has already reached (source.bombFlown) while it is in the air; none before the release,
 * none from the impact on, none for a time that is not a number.
 */
export function bombTracePoints(src: Pick<SceneSource, 'plannedBomb' | 'bombFlown'>, jet: number, t_s: number): number {
  const flown = src.bombFlown(jet, t_s);
  const total = src.plannedBomb(jet).length / 3;
  return flown < total ? flown : 0;
}

/**
 * The line at strike time t as a polyline, written into `out` as xyz in three.js axes (the fall's own axes):
 * the points bombTracePoints covers, then the bomb itself (`bomb`, where it is at t), so the line ends on the
 * bomb, unless the bomb is within TRACE_MIN_PIECE_M of the last of them. Returns how many points were written
 * (0 when nothing is drawn; never more than `out` holds). Allocates nothing.
 */
export function bombTraceLine(src: Pick<SceneSource, 'plannedBomb' | 'bombFlown'>, jet: number, t_s: number, bomb: ScenePoint, out: Float32Array): number {
  const pts = src.plannedBomb(jet);
  const room = Math.floor(out.length / 3);
  const covered = Math.min(bombTracePoints(src, jet, t_s), room);
  for (let i = 0; i < covered * 3; i++) out[i] = pts[i];
  if (covered === 0 || covered >= pts.length / 3 || covered >= room) return covered;
  const a = (covered - 1) * 3;
  const dx = bomb.x - pts[a], dy = bomb.y - pts[a + 1], dz = bomb.z - pts[a + 2];
  if (dx * dx + dy * dy + dz * dz < TRACE_MIN_PIECE_M * TRACE_MIN_PIECE_M) return covered;
  out[covered * 3] = bomb.x;
  out[covered * 3 + 1] = bomb.y;
  out[covered * 3 + 2] = bomb.z;
  return covered + 1;
}
