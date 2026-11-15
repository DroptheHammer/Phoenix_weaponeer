/**
 * The contract between the scene core (createScene.ts) and the things it
 * draws. Each layer builds its own three.js objects once, then is told the
 * time and the camera every rendered frame through one shared, mutable
 * FrameCtx (no per-frame allocation), and frees everything on dispose.
 *
 * Frame order: the world layers move to time t, then the camera follows,
 * then the after-camera layers (screen-size scaling, the 2D labels) run
 * with the final camera.
 */
import type { PerspectiveCamera } from 'three';
import type { ActionPointsMode, AttackColours, GroundMode, SceneSource } from '../../../lib/playbackScene';

export interface FrameCtx {
  /** Strike time, s. */
  t: number;
  /** This frame's wall-clock step, s, capped at 0.1. */
  dt: number;
  source: SceneSource;
  camera: PerspectiveCamera;
  /** The canvas in CSS pixels. */
  viewW: number;
  viewH: number;
  /** Device pixels per CSS pixel the scene draws at (capped): a 2D overlay sizes its backing store by it, so its text is sharp. */
  dpr: number;
  /** The ground being drawn. */
  ground: GroundMode;
  /** Bumped whenever the drawn ground changes (heights arrived, Real / Flat): anything seated on the ground re-seats. */
  groundVersion: number;
  /** The drawn ground's height at a point in three.js axes (x east, z = −north), m on the playback's datum. */
  heightAt(x: number, z: number): number;
  /** The jet the view is watching (a playback index): it carries the planner's colour code. */
  watched: number;
  /**
   * Show › Attack colours: the planner's colour code on the watched jet only (the others in their seat
   * colour, with small discs and no words), or on every jet. With one jet it is always on that jet.
   */
  attackColours: AttackColours;
  /**
   * CSS pixels per metre at the distance the camera is looking at (its orbit point, or the jet it
   * looks at from the target): dashes given in metres along a line are scaled by it, so they come
   * out the planner's length in pixels where the eye is.
   */
  focusPxPerM: number;
  /** The clock's speed setting, playing or paused: the planner's words show for set real seconds, so their stretch of strike time grows with it. */
  speed: number;
  /** Altitude and speed on each jet's label (off: seat and callsign only). */
  labels: boolean;
  /** The action points' discs, posts and words: none, as each jet nears a point, or all the time. */
  actionPoints: ActionPointsMode;
  /**
   * Set false before the layers update; a layer that is still easing something (a callout fading)
   * sets it true to have one more frame drawn, even while the clock stands still.
   */
  again: boolean;
}

export interface Layer {
  /** Called every rendered frame, before the camera moves. Must not allocate. */
  update(ctx: FrameCtx): void;
  /** Called every rendered frame after the camera has moved (sizes kept constant on screen read the final camera). Must not allocate. */
  afterCamera?(ctx: FrameCtx): void;
  /**
   * The strike was re-timed: a new source for the same jets. A layer that keeps something worked out
   * from the old timing (a planned path, a trail) redoes it here, once, not frame by frame.
   */
  setSource?(src: SceneSource): void;
  /** Frees what the layer made that is not in the shared bag (most things are). */
  dispose(): void;
}
