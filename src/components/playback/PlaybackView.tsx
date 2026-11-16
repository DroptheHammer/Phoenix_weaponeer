/**
 * The 3D strike playback view, loaded lazily when Play is pressed (it brings
 * three.js with it). It takes props only: a snapshot of the plan made at the
 * press (the PlaybackLaunch), never the stores, so what plays is exactly what
 * the editor showed, and the dev harness can mount it with a made-up plan.
 *
 * Layout: the 3D scene fills the space, with the camera buttons, Home view and
 * Show over its top right; under it, the timeline (play, pause, scrub, speeds)
 * with the amber stripes of any frag warning along it (the moment a bomb went
 * off with another jet inside its blast radius; on a strike warned by spacing
 * in time, a jet over the target inside another's frag), one lane for every jet
 * of the strike (its phase band in the planner's colours with the lettered
 * marks, and its times; its own stripes of where its time would put it inside
 * another jet's blast radius, or another jet inside its own, show only while
 * that time is being set), a line about the frag and cone warnings (opening
 * with a swatch of the time bar's stripes while it has any), and the small print
 * (what ground is drawn, the Real | Flat switch, the theater warnings, the
 * credits). Fits a 1024×768 window. The overlay around it has the title bar and
 * the Close button. While the playhead is on a frag warning, a chip over the
 * picture names it, also at 16×. The words the 3D lays on the picture keep off
 * the camera buttons and the strike's name, whose boxes are measured here.
 *
 * The frag warnings follow the rule the strike is warned by: the spacing
 * rule, or a jet's distance from a bomb's blast radius at the moment it goes
 * off. The library's readout, bands and danger zones already do; the footer's
 * all-clear, the swatch's tooltip and what a diamond says its stripes are
 * take their words from the same rule here.
 *
 * The time bar (the clock's range) starts 10 s before the earliest first action
 * of the jets flown, not at the start of the whole run-in; Show › Whole run-in
 * widens it. The lanes' axis is the same range. Show › Labels and Show ›
 * Action points say what the 3D draws beside the jets and along the runs; Show ›
 * Attack colours whether the planner's colour code is on the watched jet only
 * or on every jet; Show › Impact whether each falling bomb has a ring round it;
 * Show › Watch the bomb land whether Chase turns to the watched jet's bomb as it
 * falls and lands.
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
 * open; it outlives a rebuilt scene, and nothing saves it.
 *
 * The times over target are moved on the lanes (a handle on each diamond, the
 * keys, a box to type in) and put back by Reset. Every new time re-times the
 * strike: the timing, the readout's warnings, the stripes, the lanes and the
 * scene's source are all worked out again from the session's times, and the
 * live scene is handed the new source, never rebuilt. While a handle is held
 * the paths are sampled coarsely so each move can be followed, and the time bar
 * and the lanes keep the scale they had; when it is let go the paths are
 * sampled finely again and both re-fit to the new earliest first action.
 *
 * When the plan has somewhere to keep the times (the attack editor's strike, or
 * a strike played from the attack list), Apply writes them there: into the
 * editor's sliders, or into the saved plan itself. Reset then goes back to the
 * times just applied, and a line under the footer says what was done and which
 * jets the cards will number differently, until the times change again.
 *
 * Played from the attack list, the view is given the plan as saved and builds
 * the jets itself; a strike and a lone attack are told apart in the title.
 *
 * The clock's range has two writers and no more. Show › Whole run-in sets it
 * (and a rebuilt scene is handed the one in force); a committed change of times
 * sets it inside the scene's setSource, which moves the range before the
 * playhead's step. An Apply is such a change that also says how far it moved
 * the strike's clock (its first member's time becomes 0), so the playhead stays
 * on the same moment of the strike. Nothing re-sets the range whenever it
 * happens to change: the range moves while a handle is held, and the bar must
 * not.
 *
 * Failures stay inside playback: nothing to fly gives a plain sentence; a
 * frame or shader that breaks is thrown into the local error boundary; a lost
 * WebGL context is rebuilt from scratch when the driver gives it back (or,
 * after 5 s without it, offers Try again).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { buildStrikePlayback, dangerZones, playbackInputFromMission, retime, type PlaybackInput, type StrikePlayback, type StrikeTiming } from '../../lib/playback';
import {
  APPLY_WORDS, applyShift, applyStatusLines, axisFraction, cardOrder, conflictBands, DRAG_PATH_STEP_S, editorOffsets, initSession, isDirty, jetColor, laneAxis, laneBands, laneMarks,
  markerMoments, openingMode, PATH_STEP_S, planOffsets, playRange, renumbered, renumberedText, sceneSourceFrom, seatConflictTitle, seatInConflict, sessionReducer, zoneBands,
  type Axis, type CameraMode, type GroundMode, type SceneSource, type Session, type SessionAction, type ShowAction, type TileSource,
} from '../../lib/playbackScene';
import type { PlaybackScene, TerrainStatus } from './scene/createScene';
import { tauriTiles } from './terrain/tauriTiles';
import { SceneHost } from './SceneHost';
import { Timeline } from './Timeline';
import { JetLanes, type LaneInfo } from './JetLanes';
import { DelayFooter } from './DelayFooter';
import { fragChromeWords } from './laneText';
import { ViewToolbar } from './ViewToolbar';
import { CanvasChips, SoftwareChip } from './CanvasChips';
import { StatusNotes } from './StatusNotes';
import { PlaybackUnavailable } from './PlaybackErrorBoundary';
import { probeWebGL2 } from './webgl';
import { cardTie } from './cardTie';
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
  /**
   * An Apply from this playback has written times into the saved plan, so the panel shown if the 3D view is lost no
   * longer says the plan is unchanged. The host keeps it (it outlives the view, for its crash panel too).
   */
  applied?: boolean;
}

/** How long a lost WebGL context may stay away before playback offers Try again. */
const RESTORE_WAIT_MS = 5000;

type BuiltOk = {
  ok: true; launch: PlaybackLaunch; pb: StrikePlayback; timing: StrikeTiming; source: SceneSource; title: string;
  /** What breaks a tie in time over target on the cards, in seat order: the editor's, or worked out here from the saved plan. */
  tie?: PlaybackLaunch['tie'];
};
type Built = BuiltOk | { ok: false; message: string; detail?: string };

/** The plan as the scene draws it, worked out once per open. */
function buildView(launch: PlaybackLaunch | undefined): Built {
  if (!launch) return { ok: false, message: 'Nothing could be built from this plan yet.' };
  try {
    // The attack editor hands over its jets. The attack list hands over the plan as saved, and they are built here.
    const from = launch.fromMission;
    const input: PlaybackInput | undefined = launch.input ?? (from && playbackInputFromMission(from.mission, from.subject, from.weapons));
    if (!input) return { ok: false, message: from ? 'This strike or attack is no longer in the plan.' : 'Nothing could be built from this plan yet.' };
    const pb = buildStrikePlayback(input);
    if (pb.jets.length === 0) {
      const why = pb.skipped.map((s) => s.reason).join(' ');
      return { ok: false, message: `This attack can't be flown in 3D yet.${why ? ` ${why}` : ''}` };
    }
    const timing = retime(pb);
    const source = sceneSourceFrom(pb, timing);
    // A lone attack from the list is "Viper 1-1 · attack #3", so its number does not read as a second seat number.
    const lone = from && !input.strikeId ? from.mission.attacks.find((a) => a.id === input.jets[0]?.id) : undefined;
    const title = launch.title ?? (lone ? `${input.jets[0].callsign ?? 'Attack'} · attack #${lone.sequenceNumber}` : input.name);
    return { ok: true, launch, pb, timing, source, title, tie: launch.tie ?? (from && cardTie(from.mission, pb.members.map((m) => m.id))) };
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
 * drawn frames while the scene is moving, and what the last change of times cost
 * to work out and hand to the scene, so "it feels slow on my machine" can be
 * reported as a number.
 */
function FrameTime({ scene, reTime }: { scene: PlaybackScene; reTime: () => number | undefined }) {
  const [ms, setMs] = useState(0);
  const [re, setRe] = useState<number>();
  useEffect(() => {
    const id = window.setInterval(() => {
      setMs(scene.stats().frameMs);
      setRe(reTime());
    }, 500);
    return () => window.clearInterval(id);
  }, [scene, reTime]);
  if (!ms) return null;
  return (
    // Bottom right: the top right belongs to the view's buttons.
    <div className="absolute bottom-2 right-3 pointer-events-none rounded bg-dcs-navy/80 px-2 py-0.5 text-xs font-mono text-gray-300">
      dev: {ms.toFixed(1)} ms a frame ({Math.round(1000 / ms)} fps){re !== undefined && ` · re-time ${re.toFixed(1)} ms`}
    </div>
  );
}

/** The clock for the dev readout above: a release build never calls it. */
const devNow = () => (import.meta.env.DEV ? performance.now() : 0);

export default function PlaybackView({ launch, onClose, bindTogglePlay, tiles, onScene, onSession, applied }: PlaybackViewOwnProps) {
  const support = probeWebGL2(); // cached: free after the first call
  const built = useMemo(() => buildView(launch), [launch]);
  if (!support.ok) {
    return <PlaybackUnavailable heading="3D playback isn't available on this machine" message={support.reason} onClose={onClose} />;
  }
  if (!built.ok) {
    return <PlaybackUnavailable heading="Nothing to play" message={built.message} detail={built.detail} onClose={onClose} />;
  }
  return <PlaybackStage built={built} software={support.software} onClose={onClose} bindTogglePlay={bindTogglePlay} tiles={tiles} onScene={onScene} onSession={onSession} applied={applied} />;
}

interface PlaybackStageProps extends Pick<PlaybackViewOwnProps, 'onClose' | 'bindTogglePlay' | 'tiles' | 'onScene' | 'onSession' | 'applied'> {
  built: BuiltOk;
  /** The machine draws 3D in software: a chip on the picture says so. */
  software: boolean;
}

/** Everything that needs a plan to hold: the session, the lanes, the scene and its wiring. */
function PlaybackStage({ built, software, onClose, bindTogglePlay, tiles, onScene, onSession, applied }: PlaybackStageProps) {
  const { pb } = built;
  const tileSource = tiles === null ? undefined : (tiles ?? tauriTiles);

  // The session: the watched seat, the camera in use, what the Show menu has chosen, every member's time
  // over target. It outlives a rebuilt scene (it is not in it), and nothing saves it. The scene and the
  // cameras take the watched seat's jet (a playback index), never the seat itself: a skipped #2 leaves
  // #3 flying as jet 1.
  const [session, dispatch] = useReducer(sessionReducer, built, openSession);
  const { show, watched, dragging } = session;
  const watchedJet = pb.members[watched]?.jet ?? 0;
  // The camera the scene is told about: the side view (not built yet) leaves the scene's own camera as it is.
  const cameraMode: CameraMode = session.mode === 'side' ? 'orbit' : session.mode;

  // The strike at the times as they stand. Playback opened with the plan's times, for which the timing and
  // the source were already worked out (the first render reuses them); any other set is worked out afresh.
  // While a handle is held the paths are sampled coarsely, so every move can be followed.
  const openedWith = useRef(session.delays_s);
  const reTime = useRef({ timing: 0, source: 0, scene: 0 }); // DEV: what the last change cost, ms
  const timing = useMemo(() => {
    if (session.delays_s === openedWith.current) return built.timing;
    const t0 = devNow();
    const t = retime(pb, session.delays_s);
    reTime.current.timing = devNow() - t0;
    return t;
  }, [built, pb, session.delays_s]);
  const source = useMemo(() => {
    if (timing === built.timing && !dragging) return built.source;
    const t0 = devNow();
    const s = sceneSourceFrom(pb, timing, dragging ? DRAG_PATH_STEP_S : PATH_STEP_S);
    reTime.current.source = devNow() - t0;
    return s;
  }, [built, pb, timing, dragging]);

  // The clock's range as the Show choices stand, and the axis the lanes and the bar draw on: the same range,
  // except that while a handle is held it stays as it was when the hold began (the lane must not slide under
  // the pointer). A rebuilt scene opens with the axis in force now.
  const live = useMemo(() => playRange(pb, timing, show.wholeRunIn), [pb, timing, show.wholeRunIn]);
  const frozen = useRef<Axis>();
  const axis = laneAxis(frozen.current, live, dragging);
  useEffect(() => {
    if (!dragging) frozen.current = live;
  }, [dragging, live]);
  const camera = useMemo(() => ({ mode: cameraMode, jet: watchedJet }), [cameraMode, watchedJet]);

  // One lane for every member, on the time bar's own axis: phase bands and lettered marks, the stripes of the
  // times that would put a jet inside another jet's blast radius when a bomb goes off, or another jet inside its
  // own (on a strike warned by spacing in time, inside another's frag), and the warning mark where it is in such
  // a warning now. Redone when the times or the axis change (never while it plays).
  const moments = useMemo(() => pb.jets.map((j) => markerMoments(j)), [pb]);
  const seatLabels = useMemo(() => pb.members.map((m) => m.label), [pb]);
  const seatCallsigns = useMemo(() => pb.members.map((m) => (m.jet === undefined ? undefined : pb.jets[m.jet].callsign)), [pb]);
  const lanes = useMemo<LaneInfo[]>(() => {
    const bands = laneBands(pb, timing, axis);
    const marks = laneMarks(pb, timing, axis, (k) => moments[k]);
    // The seat's colour, as the scene draws the jet (a skipped #2 leaves the next jet as #3, in #3's colour).
    return pb.members.map((m, seat) => {
      const locked = m.id === session.locked;
      const base = {
        id: m.id, seat, label: m.label, colour: jetColor(seat), marks: marks[seat], bands: bands[seat], tot_s: timing.delays_s[m.id],
        cardPush_s: timing.readout.pushes[seat]?.push_s, locked,
        conflict: seatInConflict(timing.conflicts, seat) ? seatConflictTitle(timing.conflicts, seat) : undefined,
      };
      if (m.jet === undefined) return { ...base, zones: [], skipped: pb.skipped.find((s) => s.id === m.id)?.reason ?? 'Not flown in 3D.' };
      return { ...base, zones: locked ? [] : zoneBands(dangerZones(pb, timing, m.jet), m.label, seatLabels), callsign: pb.jets[m.jet].callsign };
    });
  }, [pb, timing, axis, moments, seatLabels, session.locked]);
  const watchedBands = useMemo(() => lanes.find((l) => l.seat === watched)?.bands ?? [], [lanes, watched]);
  const conflicts = useMemo(() => conflictBands(timing.conflicts), [timing]);
  // The time bar has stripes to show when some conflict has a part on its axis (the bar cuts each to it): then
  // the footer's first line carries a swatch of them. A strike of one, or times clear of every frag, have none.
  const barStriped = useMemo(() => conflicts.some((c) => axisFraction(axis, c.t1_s) > axisFraction(axis, c.t0_s)), [conflicts, axis]);
  // The words that follow the strike's frag rule: the footer's all-clear and the swatch's tooltip, and what a diamond
  // says its stripes are. Under the blast rule the all-clear also names the weapons that had no radius to check.
  const fragWords = useMemo(() => fragChromeWords(pb.fragRule, timing.blast?.unchecked), [pb.fragRule, timing.blast]);

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
  // The one way the session is changed, by the menu, the lanes and the dev harness alike. Whole run-in also
  // moves the live clock's range, here and only here (a change of times moves it inside setSource, below): a
  // rebuilt scene takes the range as a prop instead.
  const act = useCallback((a: SessionAction) => {
    dispatch(a);
    if (a.type === 'show' && a.a.type === 'wholeRunIn') sceneRef.current?.setRange(playRange(pb, timing, a.a.on));
  }, [pb, timing]);
  const actShow = useCallback((a: ShowAction) => act({ type: 'show', a }), [act]);
  const setDelay = useCallback((id: string, value_s: number) => act({ type: 'delay', id, value_s }), [act]);
  const setDrag = useCallback((on: boolean) => act({ type: 'drag', on }), [act]);
  const reset = useCallback(() => act({ type: 'reset' }), [act]);
  // Apply: the times go to where the plan keeps them (the editor's sliders, or the saved plan itself), and the
  // session takes them as the plan's own, so Reset now returns to them. The strike's clock moves by `shift` (the
  // first member's time becomes 0 in the editor; whoever is earliest becomes 0 in the plan): the setSource effect
  // below hands that to the scene together with the new source, so the playhead stays on the same moment. The
  // cards number jets by their order over the target; the jets that order would renumber are named.
  const { apply } = built.launch;
  const { tie } = built;
  const pendingShift = useRef(0);
  const applyTimes = useCallback(() => {
    if (!apply || !isDirty(session)) return;
    const { memberIds, delays_s } = session;
    // To the editor: one time for each jet in its order, less the first jet's. To the plan: each attack's time
    // by its id, less the earliest. Either way `offsets` is the times as written, in seat order.
    let offsets: number[];
    if (apply.to === 'editor') {
      offsets = editorOffsets(memberIds, delays_s);
      apply.write(offsets);
    } else {
      const written = planOffsets(pb, delays_s);
      apply.write(written);
      offsets = memberIds.map((id) => written[id]);
    }
    const others = tie?.length === memberIds.length ? renumbered(cardOrder(offsets, tie)) : [];
    pendingShift.current = applyShift(apply.to, memberIds, delays_s);
    act({
      type: 'applied', to: apply.to, shift_s: pendingShift.current,
      renumbered: others.map(([seat, card]) => renumberedText(seatLabels[seat], seatCallsigns[seat], card)),
    });
  }, [apply, tie, pb, session, act, seatLabels, seatCallsigns]);
  const statusLines = useMemo(() => (session.status ? applyStatusLines(session.status) : undefined), [session.status]);
  // DEV: nothing to report until the times have been changed once.
  const reTimeMs = useCallback(() => {
    const ms = reTime.current.timing + reTime.current.source + reTime.current.scene;
    return import.meta.env.DEV && ms > 0 ? ms : undefined;
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

  useEffect(() => {
    onSession?.(session, act);
  }, [session, act, onSession]);

  // Every new set of times hands the live scene its new source (never a rebuild). A committed change
  // (a time let go of, typed, stepped by a key, or Reset) also hands over the axis, and the scene moves the
  // clock's range inside the same call, before the playhead's step; while a handle is held it hands over the
  // source alone, so the bar keeps its scale. The scene made a moment ago already has this source: no change.
  useEffect(() => {
    if (!scene) return;
    const shift_s = pendingShift.current; // an Apply's: used once
    pendingShift.current = 0;
    const t0 = devNow();
    scene.setSource(source, dragging ? {} : { range: axis, shift_s });
    reTime.current.scene = devNow() - t0;
    // The axis and the drag flag read here are those of the render that made this source. (Whole run-in
    // changes the axis alone, and moves the range itself, in `act`.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, source]);

  // What the labels, the action points, the colour code and the bombs' rings show, and whether Chase watches the bomb land,
  // handed to the scene whenever the choice changes and to every scene made (a rebuilt one included), so a context loss keeps them.
  useEffect(() => {
    scene?.setLabels(show.labels);
  }, [scene, show.labels]);
  useEffect(() => {
    scene?.setActionPoints(show.actionPoints);
  }, [scene, show.actionPoints]);
  useEffect(() => {
    scene?.setAttackColours(show.attackColours);
  }, [scene, show.attackColours]);
  useEffect(() => {
    scene?.setImpact(show.impact);
  }, [scene, show.impact]);
  useEffect(() => {
    scene?.setBombCam(show.bombCam);
  }, [scene, show.bombCam]);

  // The view's own controls over the picture (the camera buttons along the top right, the strike's name at the top
  // left), measured against the canvas and handed to the scene, so callout plates and jet labels keep off them. Measured
  // when a scene is made (a rebuilt one included) and again whenever the picture, the name or a button changes size:
  // the Chase button's text names the watched seat, so the row widens and narrows with it.
  const stageRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = stageRef.current, name = nameRef.current;
    // The row is whatever holds the first button (Orbit), however deep the toolbar nests it.
    const row = toolbarRef.current?.querySelector('button')?.parentElement;
    if (!scene || !stage || !name || !row) {
      // Without the boxes words may sit under the buttons: say so loudly on the dev server, where every screenshot
      // check's "no page errors" step reads the console.
      if (import.meta.env.DEV && scene) {
        console.error('PlaybackView: the camera buttons or the name chip were not found; words will not keep off them');
      }
      return;
    }
    const buttons = Array.from(row.children).filter((e) => e.tagName === 'BUTTON'); // the buttons alone, not the Show panel
    const measure = () => {
      const canvas = stage.querySelector('canvas') ?? stage;
      const c = canvas.getBoundingClientRect();
      if (!(c.width > 0) || buttons.length === 0) return;
      // In the canvas's own CSS pixels, also while the overlay around it is still scaling in.
      const k = canvas.clientWidth / c.width;
      const box = (l: number, t: number, r: number, b: number) => ({ x: (l - c.left) * k, y: (t - c.top) * k, w: (r - l) * k, h: (b - t) * k });
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (const e of buttons) {
        const q = e.getBoundingClientRect();
        l = Math.min(l, q.left);
        t = Math.min(t, q.top);
        r = Math.max(r, q.right);
        b = Math.max(b, q.bottom);
      }
      const n = name.getBoundingClientRect();
      scene.setChromeBoxes([box(l, t, r, b), box(n.left, n.top, n.right, n.bottom)]);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    ro.observe(name);
    for (const e of buttons) ro.observe(e);
    return () => ro.disconnect();
  }, [scene]);

  if (fatal) throw fatal; // into the local error boundary, which keeps the plan safe and offers Try again

  return (
    <div className="absolute inset-0 flex flex-col">
      <div ref={stageRef} className="relative flex-1 min-h-0">
        <SceneHost
          key={mountKey}
          source={source}
          tiles={tileSource}
          range={axis}
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
        <div ref={nameRef} data-name-chip="" className="absolute top-2 left-3 max-w-[40%] truncate pointer-events-none rounded bg-dcs-navy/80 px-2 py-0.5 text-sm font-semibold text-gray-100">{built.title}</div>
        {scene && <CanvasChips scene={scene} source={source} jet={watchedJet} mode={cameraMode} conflicts={timing.conflicts} warnings={timing.readout.warnings} />}
        {software && <SoftwareChip />}
        {scene && (
          // A wrapper with no box of its own (the toolbar still lies over the whole picture), there to find its buttons by.
          <div ref={toolbarRef} className="contents">
            <ViewToolbar scene={scene} show={show} dispatch={actShow} mode={cameraMode} seat={source.labelOf(watchedJet)} onMode={pickCamera} />
          </div>
        )}
        {import.meta.env.DEV && scene && <FrameTime scene={scene} reTime={reTimeMs} />}
        {!scene && <div className="absolute inset-0 flex items-center justify-center text-gray-400 pointer-events-none">Starting 3D…</div>}
        {lost === 'stuck' && (
          <PlaybackUnavailable
            heading="3D view interrupted"
            message="The graphics driver stopped the 3D view and hasn't given it back."
            onRetry={rebuild}
            onClose={onClose}
            applied={applied}
          />
        )}
      </div>
      <div className="shrink-0 border-t border-gray-700 bg-dcs-navy px-4 py-2 space-y-1">
        {scene ? <Timeline scene={scene} bands={watchedBands} conflicts={conflicts} /> : <div className="h-8" />}
        <JetLanes scene={scene} axis={axis} lanes={lanes} watched={watched} onWatch={watchSeat} onDelay={setDelay} onDrag={setDrag} stripesWords={fragWords.stripesHandle} />
        <DelayFooter
          warnings={timing.readout.warnings}
          words={fragWords}
          stripes={barStriped}
          dirty={isDirty(session)}
          single={pb.members.length < 2}
          onReset={reset}
          apply={apply && pb.members.length >= 2 ? { ...APPLY_WORDS[apply.to], onApply: applyTimes } : undefined}
          status={statusLines}
        />
        <StatusNotes terrain={terrain} notes={built.launch.notes} restoring={lost === 'restoring'} onGround={onGround} />
      </div>
    </div>
  );
}
