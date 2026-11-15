/**
 * The 3D playback scene's core, in plain three.js (no React renderer): the
 * renderer, the render loop, the clock, the camera, the layers, and a full
 * clean-up on close. The React view mounts it into a div once and talks to
 * it through the methods it returns; nothing here re-renders React except
 * the clock's snapshot, at most about 12 times a second while playing.
 *
 * WHY three IS PINNED EXACTLY ("three": "0.187.0" in package.json, and
 * @types/three with it, while every other dependency floats on ^ or ~):
 * three.js ships a release about every month, and its minor versions break
 * things (renamed options, changed colour handling, dropped features). An
 * upgrade must be a deliberate step, with the playback checked on screen
 * afterwards, never something a routine `npm install` does by itself.
 * After an upgrade, also re-check the markers in scripts/bundle-check.mjs.
 *
 * The loop renders only when something changed (playing, a seek, the camera
 * moving or easing out, a resize, a new map tile, the ground switching), so
 * a paused view leaves the graphics card idle: the app stays open for hours.
 *
 * Frame order: the world layers move to strike time t, then the camera
 * follows (and is kept above the ground), then whatever must read the final
 * camera (sizes kept constant on screen).
 *
 * Failures: a frame that throws stops the loop and goes to onFatal (errors
 * inside requestAnimationFrame never reach a React error boundary by
 * themselves); so does a shader the graphics driver cannot compile (three
 * only logs those by default, leaving a black canvas). A lost WebGL context
 * (driver reset) stops drawing and asks the host to remount once it is
 * restored: one code path, the same one every open uses.
 */
import { Color, Fog, NoToneMapping, SRGBColorSpace, Scene, Vector3, WebGLRenderer } from 'three';
import type { StrikeWindow } from '../../../lib/playback';
import {
  BG, MAX_DPR, PlayClock, UI_EMIT_MS, homePose, FOG_FAR_K,
  type ClockSnapshot, type GroundMode, type SceneSource, type Speed, type TileSource,
} from '../../../lib/playbackScene';
import { CameraRig } from './cameraRig';
import { DisposeBag } from './disposeBag';
import { createJetLayer, type JetLayer } from './jetLayer';
import type { FrameCtx, Layer } from './layer';
import { createTerrainLayer, type TerrainStatus } from './terrainLayer';

export type { TerrainStatus } from './terrainLayer';

export interface SceneOptions {
  /** The element the canvas fills (give it a size; the scene follows it with a ResizeObserver). */
  host: HTMLElement;
  /** The strike to show (sceneSourceFrom in src/lib/playbackScene). */
  source: SceneSource;
  /** Where map and elevation tiles come from. Undefined: flat ground in the land colour, nothing fetched. */
  tiles?: TileSource<CanvasImageSource>;
  /** The jet drawn (the spike draws one). Default 0, the lead. */
  jet?: number;
  /** The editor's colour for that jet (index into JET_COLORS). Default: the jet's own index. */
  colorIndex?: number;
  /**
   * The stretch of strike time the clock plays (and the time bar shows). Default: the whole window
   * of the source. It is narrower than the window when playback opens just before the first action;
   * the jets and their trails are still drawn from the window's start, so a jet scrubbed to the
   * range's start is already well into its run-in.
   */
  range?: StrikeWindow;
  /** Strike time to open at, s. Default: the start of the range. */
  startAt_s?: number;
  /** Something broke beyond repair (a frame threw, a shader failed): show the error view. Called at most once. */
  onFatal(err: unknown): void;
  /** The ground's loading notes, failures, switch state and credits, whenever they change. */
  onTerrain?(s: TerrainStatus): void;
  /** The graphics driver took the WebGL context away: drawing has stopped (show a "restoring…" note). */
  onContextLost?(): void;
  /** The context is back: dispose this scene and create a new one (remount the host). */
  onRemount?(): void;
}

export interface SceneStats {
  /** Animation frames this scene has seen. */
  frames: number;
  /** Frames actually drawn (fewer: nothing is drawn while nothing changes). */
  renders: number;
  /** The time from one drawn frame to the next while drawing without a break, ms, smoothed. 0 until two in a row. About 16.7 on a 60 Hz screen that keeps up. */
  frameMs: number;
  /** Scenes created since the app started (a scrub must never create one). */
  sceneCreates: number;
  /** Scenes created and not yet disposed. */
  liveScenes: number;
}

/** GPU objects still alive when a scene finished disposing: both must be 0. */
export interface LeakReport {
  geometries: number;
  textures: number;
}

export interface ScreenPoint {
  /** CSS pixels from the canvas's left and top edges. */
  x: number;
  y: number;
}

export interface PlaybackScene {
  /** The clock itself (time, playing, speed). React reads it with useSyncExternalStore(scene.subscribe, scene.getSnapshot). */
  readonly clock: PlayClock;
  subscribe(listener: () => void): () => void;
  getSnapshot(): ClockSnapshot;
  play(): void;
  pause(): void;
  toggle(): void;
  /** Jump to strike time t, s (clamped to the window). */
  seek(t_s: number): void;
  setSpeed(s: Speed): void;
  /** A scrubber drag starts: playback pauses for the drag and resumes after it if it was playing. */
  beginScrub(): void;
  endScrub(): void;
  /** Real terrain or flat ground. Real shows only once the heights are in. */
  setGround(mode: GroundMode): void;
  terrainStatus(): TerrainStatus;
  /** Re-measure the host now (the ResizeObserver does this by itself; for layouts it cannot see). */
  resize(): void;
  /** The camera back to its home view. */
  goHome(): void;
  /**
   * Move the clock's range. The playhead stays where it is, kept inside the new range. Nothing
   * happens when the range is the one already set.
   */
  setRange(range: StrikeWindow): void;
  stats(): SceneStats;
  /**
   * Where the jet, its falling bomb or its target ring is on screen, at the
   * clock's current time (a pending change is drawn first). Undefined when
   * that thing is not shown or is behind the camera. For the screenshot checks.
   */
  project(what: 'jet' | 'bomb' | 'target'): ScreenPoint | undefined;
  /** Frees everything: loop, loads, listeners, every geometry, material and texture, and the WebGL context. Returns the leak check. Safe to call twice. */
  dispose(): LeakReport;
}

let sceneCreates = 0;
let liveScenes = 0;
let lastLeakReport: LeakReport | undefined;

/** The leak check of the most recently disposed scene (undefined before the first close). */
export function lastLeak(): LeakReport | undefined {
  return lastLeakReport ? { ...lastLeakReport } : undefined;
}

/** Scenes created since start, and scenes alive now (for the harness's open-and-close check). */
export function sceneCounts(): { sceneCreates: number; liveScenes: number } {
  return { sceneCreates, liveScenes };
}

export function createPlaybackScene(opts: SceneOptions): PlaybackScene {
  const { host } = opts;
  const source = opts.source;
  const jet = opts.jet !== undefined && opts.jet >= 0 && opts.jet < source.jetCount ? opts.jet : 0;
  const bag = new DisposeBag();
  const abort = new AbortController(); // stops the tile loads on close; nothing calls back after it

  // ── Renderer. The constructor throws without a WebGL 2 context: the host's effect lets that reach the error boundary.
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'default' });
  sceneCreates++;
  liveScenes++;
  renderer.outputColorSpace = SRGBColorSpace; // three's default, written so a reader sees it
  renderer.toneMapping = NoToneMapping; // three's default: the planner's colours must not shift
  renderer.setClearColor(BG, 1); // the window's own colour: no flash on open
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
  host.appendChild(canvas);

  let fatal = false;
  const fail = (err: unknown) => {
    if (fatal) return;
    fatal = true;
    renderer.setAnimationLoop(null);
    opts.onFatal(err);
  };
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const detail = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)].filter((s) => s && s.trim()).join('\n');
    fail(new Error(`A 3D shader did not compile on this graphics driver.\n${detail}`));
  };

  const scene = new Scene();
  scene.background = new Color(BG);
  const fog = new Fog(BG, 1e6, 2e6); // the terrain layer moves it with the camera every frame
  scene.fog = fog;

  const range = opts.range ?? source.window;
  const clock = new PlayClock(range.t0_s, range.t1_s, opts.startAt_s ?? range.t0_s);
  let dirty = true;
  const invalidate = () => { dirty = true; };

  // ── Size and pixel ratio (dpr −1 so the first applySize goes through).
  let viewW = Math.max(1, host.clientWidth), viewH = Math.max(1, host.clientHeight), dpr = -1, rawDpr = 0;

  // ── The layers and the camera. If building them throws, the context is given back before the
  // error goes on to the boundary: a failed open must not hold one of the browser's ~16 contexts.
  let terrain: ReturnType<typeof createTerrainLayer>, jets: JetLayer | undefined, rig: CameraRig;
  try {
    terrain = createTerrainLayer({
      source, tiles: opts.tiles, renderer, parent: scene, fog, bag, signal: abort.signal, invalidate,
      onStatus: (s) => opts.onTerrain?.(s),
    });
    jets = source.jetCount > 0 ? createJetLayer({ source, jet, colorIndex: opts.colorIndex ?? jet, parent: scene, bag }) : undefined;
    // The camera at home, framing the strike as it is played (worked out again for each window
    // shape); its far plane reaches past the haze's end from the farthest the camera can stand back.
    const homeFor = (aspect: number) => homePose({ box: source.played, axis: source.attackAxis, aspect });
    rig = new CameraRig(canvas, homeFor, viewW / viewH, terrain.halfDiag_m, (FOG_FAR_K + 1) * terrain.halfDiag_m);
  } catch (err) {
    abort.abort();
    bag.disposeAll();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    liveScenes--;
    throw err;
  }
  const layers: Layer[] = jets ? [terrain, jets] : [terrain];
  const onControlsChange = () => invalidate();
  rig.controls.addEventListener('change', onControlsChange);

  function applySize() {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    rawDpr = window.devicePixelRatio || 1;
    const nextDpr = Math.min(rawDpr, MAX_DPR); // frame rate on Retina screens and integrated graphics
    if (w === viewW && h === viewH && nextDpr === dpr) return;
    viewW = w;
    viewH = h;
    dpr = nextDpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false); // false: the canvas's CSS size stays 100% of the host
    rig.resize(w / h);
    invalidate();
  }
  applySize();
  const ro = new ResizeObserver(() => applySize());
  ro.observe(host);

  // One mutable frame context, reused every frame: no per-frame garbage.
  const ctx: FrameCtx = {
    t: clock.time, dt: 0, source, camera: rig.camera, viewW, viewH,
    ground: terrain.ground, groundVersion: terrain.groundVersion, heightAt: terrain.heightAt,
  };

  // ── The frame.
  let frames = 0, renders = 0, frameMs = 0, drewLast = false;
  let lastTime: number | null = null, lastEmit = -Infinity;
  let contextLost = false, disposed = false;

  function draw(dt: number) {
    dirty = false;
    ctx.t = clock.time;
    ctx.dt = dt;
    ctx.source = source;
    ctx.viewW = viewW;
    ctx.viewH = viewH;
    ctx.ground = terrain.ground;
    ctx.groundVersion = terrain.groundVersion;
    for (const l of layers) l.update(ctx); // 1. everything moves to time t
    // 2. the camera eases, stays above ground; keep drawing while it settles. Its near plane never cuts off the jet or its bomb.
    if (rig.update(terrain.heightAt, jets?.jetPosition(), jets?.bombPosition())) dirty = true;
    for (const l of layers) l.afterCamera?.(ctx); // 3. sizes on screen, read off the final camera
    renderer.render(scene, rig.camera);
    renders++;
  }

  function frame(time: number) {
    frames++;
    const wallDt = lastTime === null ? 0 : (time - lastTime) / 1000; // the first frame never jumps
    lastTime = time;
    if (contextLost || disposed || fatal) return;
    if ((window.devicePixelRatio || 1) !== rawDpr) applySize(); // the window moved to another screen

    const advanced = clock.advance(wallDt); // capped per frame: a hidden window cannot leap to the end
    // Discrete changes (play, pause, seek, the end) tell the UI themselves; ticks only at about 12 Hz.
    if (advanced && clock.isPlaying && time - lastEmit >= UI_EMIT_MS) {
      lastEmit = time;
      clock.emit();
    }
    if (!advanced && !dirty) { // nothing changed: leave the graphics card alone
      drewLast = false;
      return;
    }
    // Two drawn frames in a row: the gap between them is the frame time (for the dev readout).
    if (drewLast && wallDt > 0) frameMs = frameMs === 0 ? wallDt * 1000 : frameMs * 0.9 + wallDt * 100;
    drewLast = true;
    draw(Math.min(wallDt, 0.1));
  }
  renderer.setAnimationLoop((time) => {
    try {
      frame(time);
    } catch (err) {
      fail(err);
    }
  });

  // ── Context loss: stop, and once the driver gives it back, rebuild from scratch through the normal mount.
  const onLost = (e: Event) => {
    e.preventDefault(); // tells the browser we want it back
    contextLost = true;
    opts.onContextLost?.();
  };
  const onRestored = () => opts.onRemount?.();
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  // The clock's own changes (seek, play, speed) need a frame too.
  const unsubscribeClock = clock.subscribe(invalidate);

  let scrubWasPlaying = false;
  const probe = new Vector3();

  function disposeAll(): LeakReport {
    renderer.setAnimationLoop(null); // 1. no more frames
    abort.abort(); // 2. tile loads stop; no callback fires after this
    ro.disconnect();
    unsubscribeClock();
    rig.controls.removeEventListener('change', onControlsChange);
    // Removed before forceContextLoss below, which fires 'webglcontextlost' and would otherwise show "restoring…" on close.
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    for (let i = layers.length - 1; i >= 0; i--) {
      try { layers[i].dispose(); } catch (err) { console.warn('playback dispose:', err); }
    }
    rig.dispose(); // 3. the controls' listeners
    bag.disposeAll(); // 4. every geometry, material and texture
    scene.clear();
    // 5. The leak check: every GPU object must be gone before the renderer goes.
    const m = renderer.info.memory;
    const report: LeakReport = { geometries: m.geometries, textures: m.textures };
    if (import.meta.env.DEV && (report.geometries || report.textures)) console.warn('playback: undisposed GPU objects', report);
    renderer.renderLists.dispose();
    renderer.dispose(); // 6. programs and internal caches
    renderer.forceContextLoss(); // 7. give the context back now, not at garbage collection (browsers cap live contexts at about 16)
    canvas.remove();
    return report;
  }

  let report: LeakReport | undefined;

  return {
    clock,
    subscribe: clock.subscribe,
    getSnapshot: clock.getSnapshot,
    play: () => clock.play(),
    pause: () => clock.pause(),
    toggle: () => clock.toggle(),
    seek: (t) => clock.seek(t),
    setSpeed: (s) => clock.setSpeed(s),
    beginScrub: () => {
      scrubWasPlaying = clock.isPlaying;
      clock.pause();
    },
    endScrub: () => {
      if (scrubWasPlaying) clock.play();
      scrubWasPlaying = false;
    },
    setGround: (mode) => {
      terrain.setGround(mode);
      invalidate();
    },
    terrainStatus: () => terrain.status(),
    resize: () => applySize(),
    goHome: () => {
      rig.goHome();
      invalidate();
    },
    setRange: (r) => {
      const now = clock.getSnapshot();
      if (r.t0_s === now.start && r.t1_s === now.end) return;
      clock.setRange(r.t0_s, r.t1_s); // t is kept inside the new range; the clock tells the UI and asks for a frame
      invalidate();
    },
    stats:() => ({ frames, renders, frameMs, sceneCreates, liveScenes }),
    project(what) {
      if (disposed || contextLost || fatal || !jets) return undefined;
      if (dirty) {
        try { draw(0); } catch (err) { fail(err); return undefined; }
      }
      const p = what === 'jet' ? jets.jetPosition() : what === 'bomb' ? jets.bombPosition() : jets.targetPosition();
      if (!p) return undefined;
      probe.copy(p).project(rig.camera);
      if (probe.z < -1 || probe.z > 1) return undefined; // behind the camera or past the far plane
      return { x: (probe.x * 0.5 + 0.5) * viewW, y: (-probe.y * 0.5 + 0.5) * viewH };
    },
    dispose() {
      if (disposed) return report!;
      disposed = true;
      liveScenes--;
      report = disposeAll();
      lastLeakReport = report;
      return report;
    },
  };
}
