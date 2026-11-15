/**
 * DEV ONLY: the 3D playback on its own page, for the screenshot checks
 * (scripts/playback-shots.cjs) and for looking at it in a plain browser.
 * Served by the Vite dev server at /playback-harness.html; no production
 * build includes it (Vite builds index.html only).
 *
 * It mounts the real PlaybackView, inside the real PlaybackOverlay and error
 * boundary, on a made-up plan (fixture.ts) chosen by ?fixture=: one (the
 * default, a lone pop-up), strike4 (a four-ship), late (the four-ship with #2
 * at 300 s, watching #2) or skip (three jets, #2 skipped); ?watch=3 opens
 * watching #3. Tiles are chosen by ?tiles=:
 *   synthetic (default)  a known hill and a two-colour map, offline, the same every run
 *   live                 real OpenStreetMap and elevation tiles, fetched by the browser
 *   none                 flat ground, nothing fetched
 * Other parameters: ?open=0 starts closed; ?notes=1 adds an unverified-theater note
 * (the longest small print, for the 1024×768 fit check).
 *
 * Underneath sits a small fake "editor": the opener, a sentinel button, an
 * Escape listener like the real editor's, and a click counter on the
 * ancestor, so the checks can prove focus, keys and clicks stay in playback.
 *
 * window.__pb is the checks' handle; see PbHandle below.
 */
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import {
  jetColor, newSceneBombPose, sceneSourceFrom, type ActionPointsMode, type EnuBox, type GroundMode, type SceneMarker, type SceneSource, type Session, type SessionAction,
  type ShowState, type Speed, type TileSource,
} from '../../../lib/playbackScene';
import { JET_COLORS } from '../../../lib/jetColors';
import PlaybackView from '../PlaybackView';
import { PlaybackOverlay } from '../PlaybackOverlay';
import { PlaybackErrorBoundary } from '../PlaybackErrorBoundary';
import { lastLeak, sceneCounts, type PlaybackScene } from '../scene/createScene';
import { harnessFixtureLaunch, harnessMoments, type HarnessFixture } from './fixture';
import { COLOUR_SAMPLES, DRAPE_EAST, DRAPE_NORTH, DRAPE_WEST, HILL, hillHeight, syntheticTiles } from './syntheticTiles';
import { liveTiles } from './liveTiles';

const params = new URLSearchParams(location.search);
const tilesMode = params.get('tiles') ?? 'synthetic';
const fixtureName = (['one', 'strike4', 'late', 'skip'] as const).find((f) => f === params.get('fixture')) ?? 'one';
const watchParam = params.get('watch');
const notes = params.get('notes') === '1'
  ? ["Harness: coordinates unverified. This map's projection has not been checked against a known landmark, so the plan may sit offset over the ground drawn here."]
  : [];
const launch = harnessFixtureLaunch(fixtureName as HarnessFixture, notes, watchParam ? Number(watchParam) : undefined);
const moments = harnessMoments(launch);
// The same source the view builds, for the world positions the checks compare against.
const source = sceneSourceFrom(moments.pb, moments.timing);

/** Every map and elevation tile asked for, so a check can prove a re-time fetches nothing. */
let tileRequests = 0;
function counted(t: TileSource<CanvasImageSource>): TileSource<CanvasImageSource> {
  return {
    mapTile: (z, x, y) => { tileRequests++; return t.mapTile(z, x, y); },
    terrainTile: (z, x, y) => { tileRequests++; return t.terrainTile(z, x, y); },
  };
}
const tiles = tilesMode === 'live' ? counted(liveTiles) : tilesMode === 'none' ? null : counted(syntheticTiles(source.frame));

const counters = { sentinel: 0, ancestorClicks: 0, editorEscapes: 0 };
const consoleProblems: string[] = [];

// Filled in by the component below.
let scene: PlaybackScene | null = null;
// The session as the view holds it (the watched seat, the camera, the Show choices, every member's time),
// and the function every change to it goes through, the one the menu and the seat buttons call.
let sessionNow: Session | null = null;
let sessionAct: ((a: SessionAction) => void) | null = null;
let setOpenFn: (open: boolean) => void = () => {};
let isOpen = false;
let loseExt: WEBGL_lose_context | null = null;

const canvas = () => document.querySelector<HTMLCanvasElement>('[role="dialog"] canvas');

/** CSS pixels on the page from the canvas's own CSS pixels. */
function toPage(x: number, y: number): [number, number] | null {
  const c = canvas();
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return [r.left + x, r.top + y];
}

type Box = { l: number; t: number; r: number; b: number };
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom };
};

interface PbHandle {
  /** A scene is up, its ground has finished loading (or failed) and a frame has been drawn. */
  readonly ready: boolean;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  seek(t_s: number): void;
  play(): void;
  pause(): void;
  snapshot(): { t: number; playing: boolean; speed: number; start: number; end: number } | null;
  setGround(mode: GroundMode): void;
  terrain(): ReturnType<PlaybackScene['terrainStatus']> | null;
  /** Home view (Orbit at the home pose), as the button does. */
  goHome(): void;
  setSpeed(s: Speed): void;
  /** Where the jet (or its falling bomb, its target's ring centre, or its target's TGT disc) is on the page, at the clock's time. */
  project(jet?: number, what?: 'jet' | 'bomb' | 'target' | 'targetMark'): [number, number] | null;
  /** What the 2D overlay drew on the last frame, canvas pixels: each target's disc and tag, the action points' discs, the callouts, the jets' labels. */
  debugLabels(): ReturnType<PlaybackScene['debugLabels']> | null;
  /** Where a point (playback metres east, north, up) is on the page, through the camera as it is now. */
  projectPoint(e_m: number, n_m: number, up_m: number): [number, number] | null;
  /** The box Home frames, ENU metres. */
  home(): EnuBox | null;
  /** The camera's position and the point its controls turn round, three.js axes. */
  camera(): ReturnType<PlaybackScene['debugCamera']> | null;
  stats(): (ReturnType<PlaybackScene['stats']> & { open: boolean }) | ReturnType<typeof sceneCounts>;
  /** The leak check of the last scene closed. */
  readonly lastLeak: ReturnType<typeof lastLeak>;
  loseContext(): boolean;
  restoreContext(): boolean;
  /** Jet `jet`'s bomb's last falling sample and its target, three.js axes, from the playback itself (default the lead). */
  bombAtImpact(jet?: number): { bomb: [number, number, number]; target: [number, number, number] };
  /** The source the scene draws now (after a re-time, the re-timed one). */
  source(): SceneSource | null;
  /** Map and elevation tiles asked for since the page loaded. */
  tileRequests(): number;
  /** The seat the view watches (0 = #1), null until playback has opened. */
  watched(): number | null;
  /** The session as the view holds it now (null until playback has opened). */
  session(): Session | null;
  /**
   * What each seat button beside the lanes shows, read off the page as drawn (page pixels), in seat
   * order, skipped seats included: its text, whether it is pressed or disabled, its label and box.
   */
  seats(): { seat: number; text: string; pressed: boolean; disabled: boolean; label: string; box: Box }[];
  /**
   * Show › Whole run-in, made the way a click on its box makes it (the view's own handler, so the
   * clock's range moves with it): true = from the start of the whole run-in, false = from 10 s
   * before the first action.
   */
  setRange(whole: boolean): void;
  /** Show › Action points, made the way a click on its button makes it. */
  setActionPoints(mode: ActionPointsMode): void;
  /** The Show choices as the view last held them (null until playback has opened). */
  show(): ShowState | null;
  /**
   * What each lane under the time bar shows, read off the page as drawn (page pixels): its axis box, every
   * chip (letters, kind, row 0 above the band / 1 below / -1 a dot, centre x from the axis box's left edge, box),
   * the pinned group's marks and text, the diamond at the time over target, the line at the clock's time,
   * and every band stretch (style, phase, box).
   */
  lanes(): {
    seat: number;
    axis: Box;
    chips: { letters: string; kind: string; row: number; x: number; box: Box }[];
    pinned: { keys: string[]; text: string; box: Box }[];
    impact: Box | null;
    now: Box | null;
    bands: { style: string; phase: string; box: Box }[];
  }[];
  /**
   * t0 and t1: the library's window, the whole run-in. range and wholeRange: what the clock plays
   * without and with Show › Whole run-in. firstAction: the lead's first action after the IP.
   * All strike time. markers: the lead's action points as the scene places them (source.markers(0)),
   * each with the planner's own lines and its strike time. conflicts: the plan's frag conflicts, each
   * from the moment the second jet's bombs land to the moment the first jet's frag has cleared.
   */
  readonly moments: {
    t0: number; t1: number; range: { t0_s: number; t1_s: number }; wholeRange: { t0_s: number; t1_s: number }; firstAction: number;
    markers: readonly SceneMarker[];
    conflicts: { first: string; second: string; t0_s: number; t1_s: number }[];
    push?: number; pullUp?: number; release?: number; impact?: number; events: { kind: string; label: string; t_s: number }[];
    /** Each flown jet (playback index k): its seat, label, first action, release and impact, strike time. */
    jets: { seat: number; label: string; firstAction: number; release: number; impact: number }[];
  };
  /** jet: the lead's colour. jets: each member's seat colour, in seat order (skipped ones included). */
  readonly colours: { jet: string; jets: string[]; west: string; north: string; east: string };
  /** The fixture on the page. */
  readonly fixture: string;
  readonly samples: typeof COLOUR_SAMPLES;
  readonly hill: typeof HILL & { heightAt(e_m: number, n_m: number): number };
  readonly counters: typeof counters;
  readonly tiles: string;
  readonly consoleProblems: string[];
}

const pb: PbHandle = {
  get ready() {
    if (!scene) return false;
    const t = scene.terrainStatus();
    return t.heights !== 'loading' && t.map.done && scene.stats().renders > 0;
  },
  get isOpen() {
    return isOpen;
  },
  open: () => setOpenFn(true),
  close: () => setOpenFn(false),
  seek: (t) => scene?.seek(t),
  play: () => scene?.play(),
  pause: () => scene?.pause(),
  snapshot: () => (scene ? { ...scene.getSnapshot() } : null),
  setGround: (mode) => scene?.setGround(mode),
  terrain: () => scene?.terrainStatus() ?? null,
  goHome: () => scene?.goHome(),
  setSpeed: (s) => scene?.setSpeed(s),
  project(jet = 0, what = 'jet') {
    const p = scene?.project(what, jet);
    return p ? toPage(p.x, p.y) : null;
  },
  debugLabels: () => scene?.debugLabels() ?? null,
  projectPoint(e, n, up) {
    const p = scene?.projectPoint(e, up, -n); // three.js axes: x east, y up, z = −north
    return p ? toPage(p.x, p.y) : null;
  },
  home: () => scene?.debugHome() ?? null,
  camera: () => scene?.debugCamera() ?? null,
  stats: () => (scene ? { ...scene.stats(), open: isOpen } : sceneCounts()),
  get lastLeak() {
    return lastLeak();
  },
  loseContext() {
    const gl = canvas()?.getContext('webgl2');
    loseExt = gl?.getExtension('WEBGL_lose_context') ?? null;
    loseExt?.loseContext();
    return !!loseExt;
  },
  restoreContext() {
    if (!loseExt) return false;
    loseExt.restoreContext();
    loseExt = null;
    return true;
  },
  bombAtImpact(jet = 0) {
    const impact = moments.jets[jet]?.impact ?? 0;
    const b = source.bombAt(jet, impact - 0.001, newSceneBombPose());
    const t = source.targetOf(jet);
    return { bomb: [b.x, b.y, b.z], target: [t.x, t.y, t.z] };
  },
  source: () => scene?.source() ?? null,
  tileRequests: () => tileRequests,
  watched: () => sessionNow?.watched ?? null,
  session: () => sessionNow,
  seats: () =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] [data-seat]')].map((b) => ({
      seat: Number(b.getAttribute('data-seat')),
      text: (b.textContent ?? '').trim(),
      pressed: b.getAttribute('aria-pressed') === 'true',
      disabled: b.disabled,
      label: b.getAttribute('aria-label') ?? '',
      box: boxOf(b),
    })),
  setRange: (whole) => sessionAct?.({ type: 'show', a: { type: 'wholeRunIn', on: whole } }),
  setActionPoints: (mode) => sessionAct?.({ type: 'show', a: { type: 'actionPoints', value: mode } }),
  show: () => sessionNow?.show ?? null,
  lanes: () =>
    [...document.querySelectorAll('[role="dialog"] [data-lane]')].map((lane) => {
      const axis = lane.querySelector('[data-lane-axis]')!;
      const a = boxOf(axis);
      return {
        seat: Number(lane.getAttribute('data-lane')),
        axis: a,
        chips: [...axis.querySelectorAll('[data-chip]')].map((c) => {
          const b = boxOf(c);
          return { letters: c.getAttribute('data-chip') ?? '', kind: c.getAttribute('data-kind') ?? '', row: Number(c.getAttribute('data-row')), x: (b.l + b.r) / 2 - a.l, box: b };
        }),
        pinned: [...axis.querySelectorAll('[data-pinned]')].map((p) => ({ keys: (p.getAttribute('data-keys') ?? '').split(' ').filter(Boolean), text: (p.textContent ?? '').trim(), box: boxOf(p) })),
        impact: axis.querySelector('[data-impact]') ? boxOf(axis.querySelector('[data-impact]')!) : null,
        now: axis.querySelector('[data-now]') ? boxOf(axis.querySelector('[data-now]')!) : null,
        bands: [...axis.querySelectorAll('[data-band]')].map((s) => ({ style: s.getAttribute('data-band') ?? '', phase: s.getAttribute('data-phase') ?? '', box: boxOf(s) })),
      };
    }),
  moments: {
    t0: moments.window.t0_s, t1: moments.window.t1_s, range: moments.range, wholeRange: moments.wholeRange, firstAction: moments.firstAction,
    markers: source.markers(0),
    conflicts: moments.timing.conflicts.map((c) => ({ first: c.first, second: c.second, t0_s: c.t0_s, t1_s: c.t1_s })),
    push: moments.push, pullUp: moments.pullUp, release: moments.release, impact: moments.impact, events: moments.events,
    jets: moments.jets.map((j, k) => ({ seat: source.seatOf(k), label: j.label, firstAction: j.firstAction, release: j.release, impact: j.impact })),
  },
  colours: { jet: JET_COLORS[0], jets: moments.pb.members.map((_, i) => jetColor(i)), west: DRAPE_WEST, north: DRAPE_NORTH, east: DRAPE_EAST },
  fixture: fixtureName,
  samples: COLOUR_SAMPLES,
  hill: { ...HILL, heightAt: hillHeight },
  counters,
  tiles: tilesMode,
  consoleProblems,
};
(window as unknown as { __pb: PbHandle }).__pb = pb;

function Harness() {
  const [open, setOpen] = useState(params.get('open') !== '0');
  const [attempt, setAttempt] = useState(0);
  const openerRef = useRef<HTMLButtonElement>(null);
  const toggle = useRef<(() => void) | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const bind = useCallback((fn: (() => void) | null) => {
    toggle.current = fn;
  }, []);
  const onScene = useCallback((s: PlaybackScene | null) => {
    scene = s;
  }, []);
  const onSession = useCallback((s: Session, act: (a: SessionAction) => void) => {
    sessionNow = s;
    sessionAct = act;
  }, []);

  setOpenFn = setOpen;
  isOpen = open;

  // Like the real attack editor's Modal: a bubble-phase Escape on window. Playback must keep it from firing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') counters.editorEscapes++;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen bg-dcs-dark text-white p-6 space-y-4" onClick={() => counters.ancestorClicks++}>
      <h1 data-testid="editor-heading" className="text-lg font-semibold">Playback harness: fake editor (tiles: {tilesMode})</h1>
      <div className="flex gap-3">
        <button ref={openerRef} type="button" data-testid="opener" onClick={() => setOpen(true)} className="px-3 py-2 rounded text-sm border border-gray-600 text-gray-200">
          ▶ Play
        </button>
        <button type="button" data-testid="sentinel" onClick={() => counters.sentinel++} className="px-3 py-2 rounded text-sm border border-gray-600 text-gray-200">
          Sentinel
        </button>
      </div>
      {open && (
        <PlaybackOverlay title="Strike playback" onClose={close} onTogglePlay={() => toggle.current?.()} returnFocusTo={openerRef.current}>
          <PlaybackErrorBoundary key={attempt} onRetry={() => setAttempt((a) => a + 1)} onClose={close}>
            <PlaybackView launch={launch} onClose={close} bindTogglePlay={bind} tiles={tiles} onScene={onScene} onSession={onSession} />
          </PlaybackErrorBoundary>
        </PlaybackOverlay>
      )}
    </div>
  );
}

// Console errors and warnings the checks look at (three.js reports lost contexts and leaks here).
for (const level of ['error', 'warn'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    consoleProblems.push(`${level}: ${args.map(String).join(' ')}`);
    original(...args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
