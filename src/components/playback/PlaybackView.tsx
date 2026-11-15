/**
 * The 3D strike playback view, loaded lazily when Play is pressed (it brings
 * three.js with it). It takes props only: a snapshot of the plan made at the
 * press (the PlaybackLaunch), never the stores, so what plays is exactly what
 * the editor showed, and the dev harness can mount it with a made-up plan.
 *
 * Layout: the 3D scene fills the space, with the camera buttons, Home view and
 * Show over its top right; under it, the timeline (play, pause, scrub, speeds),
 * the watched jet's lane (its phase band in the planner's colours with the
 * lettered marks) and the small print (what ground is drawn, the Real | Flat
 * switch, the theater warnings, the credits). Fits a 1024×768 window. The
 * overlay around it has the title bar and the Close button.
 *
 * The time bar (the clock's range) starts 10 s before the earliest first action
 * of the jets flown, not at the start of the whole run-in; Show › Whole run-in
 * widens it. The lane's axis is the same range. Show › Labels and Show ›
 * Action points say what the 3D draws beside the jets and along the runs; Show ›
 * Attack colours whether the planner's colour code is on the watched jet only
 * or on every jet. The Show choices live here, for as long as the playback is
 * open.
 *
 * Every flown jet is drawn. One of them is watched: the jet the editor had
 * selected, else the first one flown. It carries the planner's colour code,
 * the cameras follow it and the lane under the time bar is its own.
 *
 * It opens riding behind the watched jet (Chase) at the start of the time bar,
 * unless that jet is not in the picture yet then: it opens at Home instead,
 * rather than on empty sky (still watching it). The camera in use outlives a
 * rebuilt scene.
 *
 * Failures stay inside playback: nothing to fly gives a plain sentence; a
 * frame or shader that breaks is thrown into the local error boundary; a lost
 * WebGL context is rebuilt from scratch when the driver gives it back (or,
 * after 5 s without it, offers Try again).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { buildStrikePlayback, retime, type StrikePlayback, type StrikeTiming } from '../../lib/playback';
import {
  initShow, jetColor, laneBands, laneMarks, markerMoments, openingMode, playRange, sceneSourceFrom, showReducer,
  type CameraMode, type GroundMode, type SceneSource, type ShowAction, type ShowState, type TileSource,
} from '../../lib/playbackScene';
import type { PlaybackScene, TerrainStatus } from './scene/createScene';
import { tauriTiles } from './terrain/tauriTiles';
import { SceneHost } from './SceneHost';
import { Timeline } from './Timeline';
import { JetLanes, type LaneInfo } from './JetLanes';
import { ViewToolbar } from './ViewToolbar';
import { CanvasChips, SoftwareChip } from './CanvasChips';
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
  /**
   * The Show choices whenever they change, with the very function the menu calls to change them
   * (so a check can make the same choice a click would): for the dev harness's checks only.
   */
  onShow?: (show: ShowState, act: (a: ShowAction) => void) => void;
  /** The watched seat (an index into the strike's members, skipped ones included): for the dev harness's checks only. */
  onWatched?: (seat: number) => void;
}

/** How long a lost WebGL context may stay away before playback offers Try again. */
const RESTORE_WAIT_MS = 5000;

/** The seat watched at open: the editor's selected jet when it is flown, else the first flown seat. */
function openingSeat(pb: StrikePlayback, jetId: string | undefined): number {
  const chosen = jetId === undefined ? -1 : pb.members.findIndex((m) => m.id === jetId && m.jet !== undefined);
  return chosen >= 0 ? chosen : Math.max(0, pb.members.findIndex((m) => m.jet !== undefined));
}

type Built =
  | { ok: true; pb: StrikePlayback; timing: StrikeTiming; source: SceneSource; title: string }
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
    const jet = pb.jets[0];
    return { ok: true, pb, timing, source, title: `${jet.callsign ?? launch.input.name} ${jet.label}` };
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
    // Bottom right: the top right belongs to the view's buttons.
    <div className="absolute bottom-2 right-3 pointer-events-none rounded bg-dcs-navy/80 px-2 py-0.5 text-xs font-mono text-gray-300">
      dev: {ms.toFixed(1)} ms a frame ({Math.round(1000 / ms)} fps)
    </div>
  );
}

export default function PlaybackView({ launch, onClose, bindTogglePlay, tiles, onScene, onShow, onWatched }: PlaybackViewOwnProps) {
  const support = probeWebGL2(); // cached: free after the first call
  const built = useMemo(() => buildView(launch), [launch]);
  const tileSource = tiles === null ? undefined : (tiles ?? tauriTiles);

  // The watched seat, picked once at open. The scene, the cameras and the side view take its jet (a
  // playback index), never the seat itself: a skipped #2 leaves #3 flying as jet 1.
  const [watched] = useState(() => (built.ok ? openingSeat(built.pb, launch?.jetId) : 0));
  const watchedJet = built.ok ? (built.pb.members[watched]?.jet ?? 0) : 0;

  // What the Show menu has chosen. It outlives a rebuilt scene (it is not in it), and nothing saves it.
  const [show, dispatchShow] = useReducer(showReducer, undefined, initShow);
  // The clock's range as the Show choices stand: a rebuilt scene opens with the range in force now.
  const range = useMemo(() => (built.ok ? playRange(built.pb, built.timing, show.wholeRunIn) : undefined), [built, show.wholeRunIn]);
  // The camera in use, as the scene reports it. It opens in Chase when the watched jet is in the picture at
  // the range's start, else at Home; a rebuilt scene opens in the mode in force.
  const [mode, setMode] = useState<CameraMode>(() => (built.ok && range ? openingMode(built.source, range, watchedJet) : 'orbit'));
  const camera = useMemo(() => ({ mode, jet: watchedJet }), [mode, watchedJet]);

  // The watched jet's lane, on the time bar's own axis: its phase bands and lettered marks, redone only
  // when the plan or the range changes (never while it plays).
  const lanes = useMemo<LaneInfo[]>(() => {
    if (!built.ok || !range) return [];
    const { pb, timing } = built;
    const k = pb.members[watched]?.jet;
    if (k === undefined) return [];
    const moments = pb.jets.map((j) => markerMoments(j));
    const bands = laneBands(pb, timing, range)[watched];
    const marks = laneMarks(pb, timing, range, (i) => moments[i])[watched];
    const jet = pb.jets[k];
    // A strike of one keeps the editor's colour for its jet, as the scene does.
    const colour = jetColor(pb.jets.length === 1 && launch?.colorIndex !== undefined ? launch.colorIndex : watched);
    return [{
      seat: watched, label: jet.label, callsign: jet.callsign, colour, marks, bands,
      tot_s: timing.jets[k].tot_s, cardPush_s: timing.readout.pushes[watched]?.push_s,
    }];
  }, [built, range, watched, launch?.colorIndex]);

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
  const onCamera = useCallback((m: CameraMode) => setMode(m), []);
  const pickCamera = useCallback((m: CameraMode) => sceneRef.current?.setCamera(m, watchedJet), [watchedJet]);
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
  // The one way a Show choice is made, by the menu and by the dev harness alike. Whole run-in also
  // moves the live clock's range, here and only here: a rebuilt scene takes the range as a prop instead.
  const act = useCallback((a: ShowAction) => {
    dispatchShow(a);
    if (a.type === 'wholeRunIn' && built.ok) sceneRef.current?.setRange(playRange(built.pb, built.timing, a.on));
  }, [built]);

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

  useEffect(() => {
    onShow?.(show, act);
  }, [show, act, onShow]);

  useEffect(() => {
    onWatched?.(watched);
  }, [watched, onWatched]);

  // What the labels, the action points and the colour code show, handed to the scene whenever the choice
  // changes and to every scene made (a rebuilt one included), so a context loss keeps them.
  useEffect(() => {
    scene?.setLabels(show.labels);
  }, [scene, show.labels]);
  useEffect(() => {
    scene?.setActionPoints(show.actionPoints);
  }, [scene, show.actionPoints]);
  useEffect(() => {
    scene?.setAttackColours(show.attackColours);
  }, [scene, show.attackColours]);

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
          jet={watchedJet}
          colorIndex={launch?.colorIndex}
          range={range}
          startAt_s={resumeAt.current}
          camera={camera}
          onReady={onReady}
          onCamera={onCamera}
          onFatal={onFatal}
          onTerrain={onTerrain}
          onContextLost={onContextLost}
          onRemount={rebuild}
        />
        {/* On its own dark plate: behind it can be the navy sky, the pale haze or the map. */}
        <div className="absolute top-2 left-3 max-w-[40%] truncate pointer-events-none rounded bg-dcs-navy/80 px-2 py-0.5 text-sm font-semibold text-gray-100">{built.title}</div>
        {scene && <CanvasChips scene={scene} source={built.source} jet={watchedJet} mode={mode} />}
        {support.software && <SoftwareChip />}
        {scene && (
          <ViewToolbar scene={scene} show={show} dispatch={act} mode={mode} seat={built.source.labelOf(watchedJet)} onMode={pickCamera} />
        )}
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
      <div className="shrink-0 border-t border-gray-700 bg-dcs-navy px-4 py-2 space-y-1">
        {scene ? <Timeline scene={scene} bands={lanes[0]?.bands ?? []} /> : <div className="h-8" />}
        {range && <JetLanes scene={scene} axis={range} lanes={lanes} />}
        <StatusNotes terrain={terrain} notes={launch?.notes ?? []} restoring={lost === 'restoring'} onGround={onGround} />
      </div>
    </div>
  );
}
