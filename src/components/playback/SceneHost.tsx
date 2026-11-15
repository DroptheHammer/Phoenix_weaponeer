/**
 * The div the 3D scene draws in, and the one place the scene is created and
 * freed. It is memoised and reads its props once, when it mounts: the scene
 * is plain three.js (createScene.ts) and must never be rebuilt by an ordinary
 * React re-render, or a scrub would recreate the whole terrain. The parent
 * rebuilds it on purpose by changing its `key`: after the graphics driver
 * hands a lost WebGL context back, or on Try again.
 *
 * In development React mounts every effect twice (StrictMode), so a scene is
 * created, freed and created again on each open. createScene gives the WebGL
 * context back at once on free, so that costs nothing lasting.
 */
import { memo, useEffect, useRef } from 'react';
import type { StrikeWindow } from '../../lib/playback';
import type { CameraMode, SceneSource, TileSource } from '../../lib/playbackScene';
import { createPlaybackScene, type PlaybackScene, type TerrainStatus } from './scene/createScene';

export interface SceneHostProps {
  source: SceneSource;
  /** Undefined: flat ground, nothing fetched. */
  tiles: TileSource<CanvasImageSource> | undefined;
  /**
   * The stretch of strike time the clock plays, as it stands when the scene is made. After a
   * remount (a lost graphics context given back) the view hands over the range it holds now.
   */
  range?: StrikeWindow;
  /** Strike time to open at, s (kept across a remount). */
  startAt_s?: number;
  /** The camera to open in and the watched jet (a playback index) it follows; every flown jet is drawn. After a remount, the mode in force before it. */
  camera?: { mode: CameraMode; jet: number };
  /** The scene once made, and null when it is freed. */
  onReady(scene: PlaybackScene | null): void;
  /** The camera's mode changed. */
  onCamera(mode: CameraMode): void;
  onFatal(err: unknown): void;
  onTerrain(s: TerrainStatus): void;
  onContextLost(): void;
  onRemount(): void;
}

export const SceneHost = memo(function SceneHost(props: SceneHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The callbacks are read through this at call time, so they are always the latest;
  // the source, tiles, range, start time and camera are read once, at mount, on purpose.
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const p = latest.current;
    const scene = createPlaybackScene({
      host: hostRef.current!,
      source: p.source,
      tiles: p.tiles,
      range: p.range,
      startAt_s: p.startAt_s,
      camera: p.camera,
      onCamera: (m) => latest.current.onCamera(m),
      onFatal: (e) => latest.current.onFatal(e),
      onTerrain: (s) => latest.current.onTerrain(s),
      onContextLost: () => latest.current.onContextLost(),
      onRemount: () => latest.current.onRemount(),
    });
    p.onReady(scene);
    return () => {
      latest.current.onReady(null);
      scene.dispose();
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0 overflow-hidden" />;
});
