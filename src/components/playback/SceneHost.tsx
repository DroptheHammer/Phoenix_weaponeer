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
import type { SceneSource, TileSource } from '../../lib/playbackScene';
import { createPlaybackScene, type PlaybackScene, type TerrainStatus } from './scene/createScene';

export interface SceneHostProps {
  source: SceneSource;
  /** Undefined: flat ground, nothing fetched. */
  tiles: TileSource<CanvasImageSource> | undefined;
  /** The jet drawn (the spike draws one). */
  jet: number;
  /** The editor's colour for it (index into JET_COLORS). */
  colorIndex?: number;
  /** Strike time to open at, s (kept across a remount). */
  startAt_s?: number;
  /** The scene once made, and null when it is freed. */
  onReady(scene: PlaybackScene | null): void;
  onFatal(err: unknown): void;
  onTerrain(s: TerrainStatus): void;
  onContextLost(): void;
  onRemount(): void;
}

export const SceneHost = memo(function SceneHost(props: SceneHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The callbacks are read through this at call time, so they are always the latest;
  // the source, tiles, jet and start time are read once, at mount, on purpose.
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const p = latest.current;
    const scene = createPlaybackScene({
      host: hostRef.current!,
      source: p.source,
      tiles: p.tiles,
      jet: p.jet,
      colorIndex: p.colorIndex,
      startAt_s: p.startAt_s,
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
