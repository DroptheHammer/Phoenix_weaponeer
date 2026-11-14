/**
 * The 3D strike playback view, loaded lazily when Play is pressed (it brings
 * three.js with it). It takes props only: a snapshot of the plan made at the
 * press (the PlaybackLaunch), never the stores, so what plays is exactly what
 * the editor showed, and the dev harness can mount it with a made-up plan.
 *
 * Layout: the 3D scene fills the space; under it, the timeline (play, pause,
 * scrub, speeds) and the small print (what ground is drawn, the Real | Flat
 * switch, the theater warnings, the credits). Fits a 1024×768 window. The
 * overlay around it has the title bar and the Close button.
 *
 * Failures stay inside playback: nothing to fly gives a plain sentence; a
 * frame or shader that breaks is thrown into the local error boundary; a lost
 * WebGL context is rebuilt from scratch when the driver gives it back (or,
 * after 5 s without it, offers Try again).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildStrikePlayback, retime, strikeEvents } from '../../lib/playback';
import { sceneSourceFrom, type GroundMode, type SceneSource, type TileSource } from '../../lib/playbackScene';
import type { PlaybackScene, TerrainStatus } from './scene/createScene';
import { tauriTiles } from './terrain/tauriTiles';
import { SceneHost } from './SceneHost';
import { Timeline, type TimelineTick } from './Timeline';
import { StatusNotes } from './StatusNotes';
import { PlaybackUnavailable } from './PlaybackErrorBoundary';
import { probeWebGL2 } from './webgl';
import type { PlaybackLaunch, PlaybackViewProps } from './types';

export interface PlaybackViewOwnProps extends PlaybackViewProps {
  /**
   * Where map and elevation tiles come from. Left out: the desktop app's own
   * tile commands. Null: flat ground, nothing fetched. The dev harness passes
   * a synthetic source here.
   */
  tiles?: TileSource<CanvasImageSource> | null;
  /** The live scene, and null when it goes: for the dev harness's checks only. */
  onScene?: (scene: PlaybackScene | null) => void;
}

/** How long a lost WebGL context may stay away before playback offers Try again. */
const RESTORE_WAIT_MS = 5000;

type Built =
  | { ok: true; source: SceneSource; ticks: TimelineTick[]; title: string }
  | { ok: false; message: string; detail?: string };

/** The plan as the scene draws it, worked out once per open. */
function buildView(launch: PlaybackLaunch | undefined): Built {
  if (!launch) return { ok: false, message: 'Nothing could be built from this plan yet.' };
  try {
    const pb = buildStrikePlayback(launch.input);
    if (pb.jets.length === 0) {
      const why = pb.skipped.map((s) => s.reason).join(' ');
      return { ok: false, message: `This attack can't be flown in 3D yet.${why ? ` ${why}` : ''}` };
    }
    const timing = retime(pb);
    const source = sceneSourceFrom(pb, timing);
    // The spike draws one jet, the first: its four card moments go under the scrubber.
    const ticks = strikeEvents(pb, timing).events.filter((e) => e.jet === 0 && e.tick).map((e) => ({ t_s: e.t_s, label: e.label }));
    const jet = pb.jets[0];
    return { ok: true, source, ticks, title: `${jet.callsign ?? launch.input.name} ${jet.label}` };
  } catch (e) {
    return { ok: false, message: 'The playback could not be worked out from this plan.', detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * DEV ONLY (`npm run tauri dev`, never in a release build): the time between
 * drawn frames while the scene is moving, so "it feels slow on my machine"
 * can be reported as a number.
 */
function FrameTime({ scene }: { scene: PlaybackScene }) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setMs(scene.stats().frameMs), 500);
    return () => window.clearInterval(id);
  }, [scene]);
  if (!ms) return null;
  return (
    <div className="absolute top-2 right-3 pointer-events-none rounded bg-dcs-navy/80 px-2 py-0.5 text-xs font-mono text-gray-300">
      dev: {ms.toFixed(1)} ms a frame ({Math.round(1000 / ms)} fps)
    </div>
  );
}

export default function PlaybackView({ launch, onClose, bindTogglePlay, tiles, onScene }: PlaybackViewOwnProps) {
  const support = probeWebGL2(); // cached: free after the first call
  const built = useMemo(() => buildView(launch), [launch]);
  const tileSource = tiles === null ? undefined : (tiles ?? tauriTiles);

  const [scene, setScene] = useState<PlaybackScene | null>(null);
  const [terrain, setTerrain] = useState<TerrainStatus>();
  const [fatal, setFatal] = useState<Error>();
  const [lost, setLost] = useState<'no' | 'restoring' | 'stuck'>('no');
  const [mountKey, setMountKey] = useState(0);
  const sceneRef = useRef<PlaybackScene | null>(null);
  // Kept across a rebuild, so a driver reset doesn't send the user back to the start or undo their Flat.
  const resumeAt = useRef<number | undefined>(undefined);
  const groundWanted = useRef<GroundMode>('real');

  const onReady = useCallback((s: PlaybackScene | null) => {
    sceneRef.current = s;
    if (s && groundWanted.current === 'flat') s.setGround('flat');
    setScene(s);
  }, []);
  const onFatal = useCallback((e: unknown) => setFatal(e instanceof Error ? e : new Error(String(e))), []);
  const onTerrain = useCallback((s: TerrainStatus) => setTerrain(s), []);
  const onContextLost = useCallback(() => setLost('restoring'), []);
  const rebuild = useCallback(() => {
    resumeAt.current = sceneRef.current?.clock.time ?? resumeAt.current;
    setLost('no');
    setTerrain(undefined);
    setMountKey((k) => k + 1);
  }, []);
  const onGround = useCallback((mode: GroundMode) => {
    groundWanted.current = mode;
    sceneRef.current?.setGround(mode);
  }, []);

  // A lost context that does not come back: offer Try again rather than a frozen picture.
  useEffect(() => {
    if (lost !== 'restoring') return;
    const id = window.setTimeout(() => setLost('stuck'), RESTORE_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [lost]);

  // Space in the overlay plays and pauses this scene.
  useEffect(() => {
    bindTogglePlay(scene ? scene.toggle : null);
    return () => bindTogglePlay(null);
  }, [scene, bindTogglePlay]);

  useEffect(() => {
    if (!onScene) return;
    onScene(scene);
    return () => onScene(null);
  }, [scene, onScene]);

  if (fatal) throw fatal; // into the local error boundary, which keeps the plan safe and offers Try again

  if (!support.ok) {
    return <PlaybackUnavailable heading="3D playback isn't available on this machine" message={support.reason} onClose={onClose} />;
  }
  if (!built.ok) {
    return <PlaybackUnavailable heading="Nothing to play" message={built.message} detail={built.detail} onClose={onClose} />;
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative flex-1 min-h-0">
        <SceneHost
          key={mountKey}
          source={built.source}
          tiles={tileSource}
          jet={0}
          colorIndex={launch?.colorIndex ?? 0}
          startAt_s={resumeAt.current}
          onReady={onReady}
          onFatal={onFatal}
          onTerrain={onTerrain}
          onContextLost={onContextLost}
          onRemount={rebuild}
        />
        {/* On its own dark plate: behind it can be the navy sky, the pale haze or the map. */}
        <div className="absolute top-2 left-3 pointer-events-none rounded bg-dcs-navy/80 px-2 py-0.5 text-sm font-semibold text-gray-100">{built.title}</div>
        {import.meta.env.DEV && scene && <FrameTime scene={scene} />}
        {!scene && <div className="absolute inset-0 flex items-center justify-center text-gray-400 pointer-events-none">Starting 3D…</div>}
        {lost === 'stuck' && (
          <PlaybackUnavailable
            heading="3D view interrupted"
            message="The graphics driver stopped the 3D view and hasn't given it back."
            onRetry={rebuild}
            onClose={onClose}
          />
        )}
      </div>
      <div className="shrink-0 border-t border-gray-700 bg-dcs-navy px-4 py-2 space-y-2">
        {scene ? <Timeline scene={scene} ticks={built.ticks} /> : <div className="h-8" />}
        <StatusNotes terrain={terrain} notes={launch?.notes ?? []} restoring={lost === 'restoring'} software={support.software} onGround={onGround} />
      </div>
    </div>
  );
}
