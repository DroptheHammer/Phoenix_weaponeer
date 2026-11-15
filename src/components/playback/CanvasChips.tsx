/**
 * Short notes laid over the top middle of the 3D picture, one under another,
 * never catching a press. For now one: in Chase or From target, while the
 * watched jet is not in the picture (before its run-in or after it leaves),
 * a chip says so, because the camera keeps following where the jet would be
 * and the picture would otherwise show empty sky with no reason given.
 *
 * It reads the clock's snapshot (at most about 12 times a second while
 * playing), not every frame.
 */
import { useRef, useSyncExternalStore } from 'react';
import { newSceneJetPose, type CameraMode, type SceneJetPose, type SceneSource } from '../../lib/playbackScene';
import type { PlaybackScene } from './scene/createScene';

interface CanvasChipsProps {
  scene: PlaybackScene;
  source: SceneSource;
  /** The watched jet (a playback index). */
  jet: number;
  mode: CameraMode;
}

export function CanvasChips({ scene, source, jet, mode }: CanvasChipsProps) {
  const snap = useSyncExternalStore(scene.subscribe, scene.getSnapshot);
  // One pose, kept: the check runs on every snapshot.
  const pose = useRef<SceneJetPose | null>(null);
  pose.current ??= newSceneJetPose();
  const following = mode === 'chase' || mode === 'target';
  const away = following && jet < source.jetCount && !source.jetAt(jet, snap.t, pose.current).visible;
  if (!away) return null;
  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
      <div className="pointer-events-none rounded bg-dcs-navy/80 px-2 py-0.5 text-xs text-gray-300">
        {source.labelOf(jet)} isn't in the picture at this moment (before its run-in or after it leaves)
      </div>
    </div>
  );
}
