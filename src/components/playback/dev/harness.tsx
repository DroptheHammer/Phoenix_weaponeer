/**
 * DEV ONLY: the 3D playback on its own page, for the screenshot checks
 * (scripts/playback-shots.cjs) and for looking at it in a plain browser.
 * Served by the Vite dev server at /playback-harness.html; no production
 * build includes it (Vite builds index.html only).
 *
 * It mounts the real PlaybackView, inside the real PlaybackOverlay and error
 * boundary, on a made-up pop-up (fixture.ts), with tiles chosen by ?tiles=:
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
import { PerspectiveCamera, Vector3 } from 'three';
import '../../../index.css';
import { enuToThree, homePose, newSceneBombPose, sceneSourceFrom, type GroundMode } from '../../../lib/playbackScene';
import { JET_COLORS } from '../../../lib/jetColors';
import PlaybackView from '../PlaybackView';
import { PlaybackOverlay } from '../PlaybackOverlay';
import { PlaybackErrorBoundary } from '../PlaybackErrorBoundary';
import { lastLeak, sceneCounts, type PlaybackScene } from '../scene/createScene';
import { harnessLaunch, harnessMoments } from './fixture';
import { COLOUR_SAMPLES, DRAPE_EAST, DRAPE_NORTH, DRAPE_WEST, HILL, hillHeight, syntheticTiles } from './syntheticTiles';
import { liveTiles } from './liveTiles';

const params = new URLSearchParams(location.search);
const tilesMode = params.get('tiles') ?? 'synthetic';
const notes = params.get('notes') === '1'
  ? ["Harness: coordinates unverified. This map's projection has not been checked against a known landmark, so the plan may sit offset over the ground drawn here."]
  : [];
const launch = harnessLaunch(notes);
const moments = harnessMoments(launch);
// The same source the view builds, for the world positions the checks compare against.
const source = sceneSourceFrom(moments.pb, moments.timing);
const tiles = tilesMode === 'live' ? liveTiles : tilesMode === 'none' ? null : syntheticTiles(source.frame);

const counters = { sentinel: 0, ancestorClicks: 0, editorEscapes: 0 };
const consoleProblems: string[] = [];

// Filled in by the component below.
let scene: PlaybackScene | null = null;
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

interface PbHandle {
  /** A scene is up, its ground has finished loading (or failed) and a frame has been drawn. */
  readonly ready: boolean;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  seek(t_s: number): void;
  play(): void;
  pause(): void;
  snapshot(): { t: number; playing: boolean; speed: number } | null;
  setGround(mode: GroundMode): void;
  terrain(): ReturnType<PlaybackScene['terrainStatus']> | null;
  goHome(): void;
  /** Where the jet (or its falling bomb, or its target ring) is on the page, at the clock's time. */
  project(jet?: number, what?: 'jet' | 'bomb' | 'target'): [number, number] | null;
  /** Where a ground point (playback metres east, north, up) is on the page. Valid only in the home view. */
  projectWorld(e_m: number, n_m: number, up_m: number): [number, number] | null;
  stats(): (ReturnType<PlaybackScene['stats']> & { open: boolean }) | ReturnType<typeof sceneCounts>;
  /** The leak check of the last scene closed. */
  readonly lastLeak: ReturnType<typeof lastLeak>;
  loseContext(): boolean;
  restoreContext(): boolean;
  /** The bomb's last falling sample and the target, three.js axes, from the playback itself. */
  bombAtImpact(): { bomb: [number, number, number]; target: [number, number, number] };
  readonly moments: { t0: number; t1: number; push?: number; pullUp?: number; release?: number; impact?: number; events: { kind: string; label: string; t_s: number }[] };
  readonly colours: { jet: string; west: string; north: string; east: string };
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
  project(_jet = 0, what = 'jet') {
    const p = scene?.project(what);
    return p ? toPage(p.x, p.y) : null;
  },
  projectWorld(e, n, up) {
    // The home camera, rebuilt from the same pure pose the scene's Home view uses: worked out for
    // the canvas's shape now, as the scene's goHome does.
    const c = canvas();
    if (!c) return null;
    const aspect = Math.max(1, c.clientWidth) / Math.max(1, c.clientHeight);
    const home = homePose({ box: source.played, axis: source.attackAxis, aspect });
    const cam = new PerspectiveCamera(home.fov_deg, aspect, 1, 1e7);
    cam.position.set(...enuToThree(home.eye));
    cam.lookAt(new Vector3(...enuToThree(home.look)));
    cam.updateMatrixWorld();
    const v = new Vector3(...enuToThree([e, n, up])).project(cam);
    return toPage((v.x * 0.5 + 0.5) * c.clientWidth, (-v.y * 0.5 + 0.5) * c.clientHeight);
  },
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
  bombAtImpact() {
    const impact = moments.impact ?? 0;
    const b = source.bombAt(0, impact - 0.001, newSceneBombPose());
    const t = source.targetOf(0);
    return { bomb: [b.x, b.y, b.z], target: [t.x, t.y, t.z] };
  },
  moments: {
    t0: moments.window.t0_s, t1: moments.window.t1_s, push: moments.push, pullUp: moments.pullUp,
    release: moments.release, impact: moments.impact, events: moments.events,
  },
  colours: { jet: JET_COLORS[0], west: DRAPE_WEST, north: DRAPE_NORTH, east: DRAPE_EAST },
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
            <PlaybackView launch={launch} onClose={close} bindTogglePlay={bind} tiles={tiles} onScene={onScene} />
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
