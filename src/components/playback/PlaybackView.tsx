/**
 * The 3D strike playback view, loaded lazily when Play is pressed (it brings
 * three.js with it). It takes props only: a snapshot of the plan made at the
 * press (the PlaybackLaunch), never the stores, so what plays is exactly what
 * the editor showed, and the dev harness can mount it with a made-up plan.
 *
 * Layout: the 3D scene fills the space, with the camera buttons, Home view and
 * Show over its top right; under it, the timeline (play, pause, scrub, speeds)
 * with the amber stripes of any frag conflict along it, one lane for every jet
 * of the strike (its phase band in the planner's colours with the lettered
 * marks, and its times), a line about the frag and cone warnings, and the small
 * print (what ground is drawn, the Real | Flat switch, the theater warnings,
 * the credits). Fits a 1024×768 window. The overlay around it has the title
 * bar and the Close button.
 *
 * The time bar (the clock's range) starts 10 s before the earliest first action
 * of the jets flown, not at the start of the whole run-in; Show › Whole run-in
 * widens it. The lanes' axis is the same range. Show › Labels and Show ›
 * Action points say what the 3D draws beside the jets and along the runs; Show ›
 * Attack colours whether the planner's colour code is on the watched jet only
 * or on every jet.
 *
 * Every flown jet is drawn. One of them is watched: the jet the editor had
 * selected, else the first one flown, and the seat buttons beside the lanes
 * move the watch. It carries the planner's colour code, the cameras follow it
 * and the time bar's own band is its.
 *
 * It opens riding behind the watched jet (Chase) at the start of the time bar,
 * unless that jet is not in the picture yet then: it opens at Home instead,
 * rather than on empty sky (still watching it).
 *
 * What the open playback remembers (the watched seat, the camera in use, the
 * Show choices and every member's time over target) is one pure session
 * (src/lib/playbackScene/session.ts), held here for as long as the playback is
 * open; it outlives a rebuilt scene, and nothing saves it. The times are the
 * plan's for now: nothing changes them yet.
 *
 * Failures stay inside playback: nothing to fly gives a plain sentence; a
 * frame or shader that breaks is thrown into the local error boundary; a lost
 * WebGL context is rebuilt from scratch when the driver gives it back (or,
 * after 5 s without it, offers Try again).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { buildStrikePlayback, retime, type StrikePlayback, type StrikeTiming } from '../../lib/playback';
import {
  conflictBands, initSession, jetColor, laneBands, laneMarks, markerMoments, openingMode, playRange, sceneSourceFrom, sessionReducer,
  type CameraMode, type GroundMode, type SceneSource, type Session, type SessionAction, type ShowAction, type TileSource,
} from '../../lib/playbackScene';
import type { PlaybackScene, TerrainStatus } from './scene/createScene';
import { tauriTiles } from './terrain/tauriTiles';
import { SceneHost } from './SceneHost';
import { Timeline } from './Timeline';
import { JetLanes, type LaneInfo } from './JetLanes';
import { DelayFooter } from './DelayFooter';
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
   * The session whenever it changes, with the very function every change to it goes through (the
   * menu's choices, the seat buttons and the camera buttons make theirs this way, so a check can make
   * the same change a click would): for the dev harness's checks only.
   */
  onSession?: (session: Session, act: (a: SessionAction) => void) => void;
}

/** How long a lost WebGL context may stay away before playback offers Try again. */
const RESTORE_WAIT_MS = 5000;

type BuiltOk = { ok: true; launch: PlaybackLaunch; pb: StrikePlayback; timing: StrikeTiming; source: SceneSource; title: string };
type Built = BuiltOk | { ok: false; message: string; detail?: string };

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
    return { ok: true, launch, pb, timing, source, title: launch.title ?? launch.input.name };
  } catch (e) {
    return { ok: false, message: 'The playback could not be worked out from this plan.', detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The session as playback opens: the editor's selected jet watched (else the first flown), in Chase
 * behind it unless it is not in the picture when the time bar starts, then Home in Orbit.
 */
function openSession(built: BuiltOk): Session {
  const { pb, timing, source, launch } = built;
  const seat = initSession(pb, launch.jetId).watched;
  const range = playRange(pb, timing, false);
  return initSession(pb, launch.jetId, { mode: openingMode(source, range, pb.members[seat]?.jet ?? 0) });
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

export default function PlaybackView({ launch, onClose, bindTogglePlay, tiles, onScene, onSession }: PlaybackViewOwnProps) {
  const support = probeWebGL2(); // cached: free after the first call
  const built = useMemo(() => buildView(launch), [launch]);
  if (!support.ok) {
    return <PlaybackUnavailable heading="3D playback isn't available on this machine" message={support.reason} onClose={onClose} />;
  }
  if (!built.ok) {
    return <PlaybackUnavailable heading="Nothing to play" message={built.message} detail={built.detail} onClose={onClose} />;
  }
  return <PlaybackStage built={built} software={support.software} onClose={onClose} bindTogglePlay={bindTogglePlay} tiles={tiles} onScene={onScene} onSession={onSession} />;
}

interface PlaybackStageProps extends Pick<PlaybackViewOwnProps, 'onClose' | 'bindTogglePlay' | 'tiles' | 'onScene' | 'onSession'> {
  built: BuiltOk;
  /** The machine draws 3D in software: a chip on the picture says so. */
  software: boolean;
}

/** Everything that needs a plan to hold: the session, the lanes, the scene and its wiring. */
function PlaybackStage({ built, software, onClose, bindTogglePlay, tiles, onScene, onSession }: PlaybackStageProps) {
  const { pb, timing } = built;
  const tileSource = tiles === null ? undefined : (tiles ?? tauriTiles);

  // The session: the watched seat, the camera in use, what the Show menu has chosen. It outlives a
  // rebuilt scene (it is not in it), and nothing saves it. The scene and the cameras take the watched
  // seat's jet (a playback index), never the seat itself: a skipped #2 leaves #3 flying as jet 1.
  const [session, dispatch] = useReducer(sessionReducer, built, openSession);
  const { show, watched } = session;
  const watchedJet = pb.members[watched]?.jet ?? 0;
  // The camera the scene is told about: the side view (not built yet) leaves the scene's own camera as it is.
  const cameraMode: CameraMode = session.mode === 'side' ? 'orbit' : session.mode;
  // The clock's range as the Show choices stand: a rebuilt scene opens with the range in force now.
  const range = useMemo(() => playRange(pb, timing, show.wholeRunIn), [pb, timing, show.wholeRunIn]);
  const camera = useMemo(() => ({ mode: cameraMode, jet: watchedJet }), [cameraMode, watchedJet]);

  // One lane for every member, on the time bar's own axis: phase bands and lettered marks, redone only when
  // the plan or the range changes (never while it plays).
  const moments = useMemo(() => pb.jets.map((j) => markerMoments(j)), [pb]);
  const lanes = useMemo<LaneInfo[]>(() => {
    const bands = laneBands(pb, timing, range);
    const marks = laneMarks(pb, timing, range, (k) => moments[k]);
    // The seat's colour, as the scene draws the jet (a skipped #2 leaves the next jet as #3, in #3's colour).
    return pb.members.map((m, seat) => {
      const base = { seat, label: m.label, colour: jetColor(seat), marks: marks[seat], bands: bands[seat], tot_s: timing.delays_s[m.id], cardPush_s: timing.readout.pushes[seat]?.push_s };
      if (m.jet === undefined) return { ...base, skipped: pb.skipped.find((s) => s.id === m.id)?.reason ?? 'Not flown in 3D.' };
      return { ...base, callsign: pb.jets[m.jet].callsign };
    });
  }, [pb, timing, range, moments]);
  const watchedBands = useMemo(() => lanes.find((l) => l.seat === watched)?.bands ?? [], [lanes, watched]);
  const conflicts = useMemo(() => conflictBands(timing.conflicts), [timing]);

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
  const onCamera = useCallback((m: CameraMode) => dispatch({ type: 'mode', mode: m }), []);
  const pickCamera = useCallback((m: CameraMode) => sceneRef.current?.setCamera(m, watchedJet), [watchedJet]);
  // A seat button: the watch moves to that seat's jet. The scene keeps its camera mode; Chase and From
  // target start again on the new jet, and the planner's colour code moves with it. (The scene moves its
  // watched jet only through setCamera, which also puts Top-down back to its first view.)
  const watchSeat = useCallback((seat: number) => {
    const jet = pb.members[seat]?.jet;
    if (jet === undefined || seat === watched) return;
    dispatch({ type: 'watch', seat });
    const s = sceneRef.current;
    if (s) s.setCamera(s.cameraMode(), jet);
  }, [pb, watched]);
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
  // The one way the session is changed, by the menu and by the dev harness alike. Whole run-in also
  // moves the live clock's range, here and only here: a rebuilt scene takes the range as a prop instead.
  const act = useCallback((a: SessionAction) => {
    dispatch(a);
    if (a.type === 'show' && a.a.type === 'wholeRunIn') sceneRef.current?.setRange(playRange(pb, timing, a.a.on));
  }, [pb, timing]);
  const actShow = useCallback((a: ShowAction) => act({ type: 'show', a }), [act]);

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
    onSession?.(session, act);
  }, [session, act, onSession]);

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

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative flex-1 min-h-0">
        <SceneHost
          key={mountKey}
          source={built.source}
          tiles={tileSource}
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
        {scene && <CanvasChips scene={scene} source={built.source} jet={watchedJet} mode={cameraMode} />}
        {software && <SoftwareChip />}
        {scene && (
          <ViewToolbar scene={scene} show={show} dispatch={actShow} mode={cameraMode} seat={built.source.labelOf(watchedJet)} onMode={pickCamera} />
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
        {scene ? <Timeline scene={scene} bands={watchedBands} conflicts={conflicts} /> : <div className="h-8" />}
        <JetLanes scene={scene} axis={range} lanes={lanes} watched={watched} onWatch={watchSeat} />
        <DelayFooter warnings={timing.readout.warnings} />
        <StatusNotes terrain={terrain} notes={built.launch.notes} restoring={lost === 'restoring'} onGround={onGround} />
      </div>
    </div>
  );
}
