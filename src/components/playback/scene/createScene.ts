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
  BG, MAX_DPR, PlayClock, UI_EMIT_MS, homeBox, homePose, newSceneJetPose, FOG_FAR_K,
  type ActionPointsMode, type AttackColours, type CameraMode, type ClockSnapshot, type EnuBox, type GroundMode, type SceneJetPose, type SceneSource, type Speed, type TileSource,
} from '../../../lib/playbackScene';
import { CameraRig, type Follow } from './cameraRig';
import { DisposeBag } from './disposeBag';
import { createJetLayer, type JetLayer } from './jetLayer';
import { createLabelLayer, type LabelDebug, type LabelLayer } from './labelLayer';
import type { FrameCtx, Layer } from './layer';
import { createTargetLayer, type TargetLayer } from './targetLayer';
import { createTerrainLayer, type TerrainStatus } from './terrainLayer';

export type { TerrainStatus } from './terrainLayer';

export interface SceneOptions {
  /** The element the canvas fills (give it a size; the scene follows it with a ResizeObserver). */
  host: HTMLElement;
  /** The strike to show (sceneSourceFrom in src/lib/playbackScene). */
  source: SceneSource;
  /** Where map and elevation tiles come from. Undefined: flat ground in the land colour, nothing fetched. */
  tiles?: TileSource<CanvasImageSource>;
  /**
   * The stretch of strike time the clock plays (and the time bar shows). Default: the whole window
   * of the source. It is narrower than the window when playback opens just before the first action;
   * the jets and their trails are still drawn from the window's start, so a jet scrubbed to the
   * range's start is already well into its run-in.
   */
  range?: StrikeWindow;
  /** Strike time to open at, s. Default: the start of the range. */
  startAt_s?: number;
  /**
   * The camera to open in and the jet it follows (a playback index, never a seat), set before the
   * first frame (Chase starts behind that jet at the opening time). Every flown jet is drawn; this
   * one is the watched jet. Default: Orbit at the home view, watching jet 0, the first flown jet.
   */
  camera?: { mode: CameraMode; jet: number };
  /** The camera's mode changed (a mode chosen, or Home view, which is Orbit): the toolbar shows it. */
  onCamera?(mode: CameraMode): void;
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
  /** The camera back to its home view, in Orbit: the attack from just before the first action to just after the last bomb lands. */
  goHome(): void;
  /**
   * Change the camera's mode and the jet Chase and From target follow (a playback index, never a
   * seat). A cut, no easing.
   */
  setCamera(mode: CameraMode, jet: number): void;
  /** The camera's mode now. */
  cameraMode(): CameraMode;
  /**
   * Move the clock's range. The playhead stays where it is, kept inside the new range. Nothing
   * happens when the range is the one already set.
   */
  setRange(range: StrikeWindow): void;
  /** Altitude and speed on each jet's label (Show › Labels); off leaves the seat and callsign. */
  setLabels(on: boolean): void;
  /** The action points' discs, posts and the planner's words (Show › Action points). */
  setActionPoints(mode: ActionPointsMode): void;
  /** The planner's colour code on the watched jet only, or on every jet (Show › Attack colours). */
  setAttackColours(mode: AttackColours): void;
  /**
   * The strike re-timed: a new source for the same jets (the same playback, other delays). Nothing
   * happens when it is the source already shown. Every jet's path and trail follow it; the terrain and
   * the targets never move. With `range`, the clock's range moves too, and the playhead steps back by
   * `shift_s` inside it (a re-base after Apply), in one change.
   */
  setSource(next: SceneSource, o?: { range?: StrikeWindow; shift_s?: number }): void;
  /** The source drawn now. */
  source(): SceneSource;
  stats(): SceneStats;
  /**
   * Where jet `jet`'s (a playback index, default 0, the first flown jet) arrow, its falling bomb, its target's
   * ring centre or its target's TGT disc is on screen, at the clock's current time (a pending change
   * is drawn first). Undefined when that thing is not shown or is behind the camera. For the
   * screenshot checks.
   */
  project(what: 'jet' | 'bomb' | 'target' | 'targetMark', jet?: number): ScreenPoint | undefined;
  /** What the 2D overlay drew on the last frame (target discs and tags, action point discs, callouts, jet labels). For the screenshot checks. */
  debugLabels(): LabelDebug;
  /** Where a point (three.js axes: x east, y up, z = −north, m) is on screen through the camera as it is now. Undefined behind it. For the screenshot checks. */
  projectPoint(x: number, y: number, z: number): ScreenPoint | undefined;
  /** The box Home frames, ENU m (a copy). For the checks. */
  debugHome(): EnuBox;
  /** The camera's position and the point its controls turn round, three.js axes. For the checks. */
  debugCamera(): { x: number; y: number; z: number; target: { x: number; y: number; z: number } };
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
  let source = opts.source; // a re-time swaps it (setSource); the jets stay the same
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

  // What Home and Top-down frame: every jet and falling bomb from the clock's range start to just
  // after the last impact (homeBox). Worked out when a view first asks for it, kept until the range
  // moves; never per frame.
  let homeBoxKept: EnuBox | undefined;
  const homeBoxNow = (): EnuBox => {
    if (!homeBoxKept) {
      const s = clock.getSnapshot();
      homeBoxKept = homeBox(source, { t0_s: s.start, t1_s: s.end });
    }
    return homeBoxKept;
  };

  // ── The layers and the camera. If building them throws, the context is given back before the
  // error goes on to the boundary: a failed open must not hold one of the browser's ~16 contexts.
  let terrain: ReturnType<typeof createTerrainLayer>, targets: TargetLayer, labels: LabelLayer, rig: CameraRig;
  // One layer per flown jet, jets[k] drawing playback jet k.
  const jets: JetLayer[] = [];
  try {
    terrain = createTerrainLayer({
      source, tiles: opts.tiles, renderer, parent: scene, fog, bag, signal: abort.signal, invalidate,
      onStatus: (s) => opts.onTerrain?.(s),
    });
    targets = createTargetLayer({ source, parent: scene, bag });
    for (let k = 0; k < source.jetCount; k++) jets.push(createJetLayer({ source, jet: k, parent: scene, bag }));
    // The camera at home, framing the attack (worked out again for each window shape); its far
    // plane reaches past the haze's end from the farthest the camera can stand back.
    const homeFor = (aspect: number) => homePose({ box: homeBoxNow(), axis: source.attackAxis, aspect });
    rig = new CameraRig(canvas, homeFor, homeBoxNow, viewW / viewH, terrain.halfDiag_m, (FOG_FAR_K + 1) * terrain.halfDiag_m);
    // The 2D overlay last: nothing after it can throw, so a failed open never leaves its canvas behind.
    labels = createLabelLayer({ host, source, targets, jets, bag });
  } catch (err) {
    abort.abort();
    bag.disposeAll();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    liveScenes--;
    throw err;
  }
  // The targets before the labels: the overlay draws each TGT disc on the post top the target layer has just laid.
  const layers: Layer[] = [terrain, targets, ...jets, labels];
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
  // ── What the camera follows: the watched jet, filled every frame from its layer's pose (a jet
  // with no layer of its own is sampled here instead). Made once.
  let camJet = opts.camera && opts.camera.jet >= 0 && opts.camera.jet < source.jetCount ? opts.camera.jet : 0;

  const ctx: FrameCtx = {
    t: clock.time, dt: 0, source, camera: rig.camera, viewW, viewH, dpr,
    ground: terrain.ground, groundVersion: terrain.groundVersion, heightAt: terrain.heightAt,
    watched: camJet, attackColours: 'watched', focusPxPerM: 1,
    speed: clock.currentSpeed, labels: true, actionPoints: 'coming', again: false,
  };
  const follow: Follow = { jet: new Vector3(), vel: new Vector3(), heading_deg: 0, target: new Vector3(), targetGround: 0 };
  const camPose = newSceneJetPose();
  function fillFollow(p: SceneJetPose) {
    follow.jet.set(p.x, p.y, p.z);
    follow.vel.set(p.vx, p.vy, p.vz);
    follow.heading_deg = p.heading_deg;
    if (source.jetCount === 0) return;
    const tg = source.targetOf(camJet);
    follow.target.set(tg.x, tg.y, tg.z);
    follow.targetGround = terrain.heightAt(tg.x, tg.z);
  }
  /** The watched jet at the clock's time now, straight from the source (outside a frame). */
  const followNow = () => {
    if (source.jetCount > 0) fillFollow(source.jetAt(camJet, clock.time, camPose));
  };
  // The near plane never cuts off an arrow or a falling bomb: the distance to the nearest one shown, of any jet.
  const nearestTo = (p: Vector3): number => {
    let d = Infinity;
    for (let k = 0; k < jets.length; k++) {
      const a = jets[k].jetPosition(), b = jets[k].bombPosition();
      if (a) d = Math.min(d, p.distanceTo(a));
      if (b) d = Math.min(d, p.distanceTo(b));
    }
    return d;
  };
  // Following needs a jet: with none, Orbit and Top-down are all there is.
  const canFollow = (mode: CameraMode) => source.jetCount > 0 || mode === 'orbit' || mode === 'top';
  if (opts.camera && opts.camera.mode !== 'orbit' && canFollow(opts.camera.mode)) {
    followNow();
    rig.setMode(opts.camera.mode, follow);
  }
  opts.onCamera?.(rig.mode); // the toolbar shows the mode the scene really opened in

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
    ctx.dpr = dpr;
    ctx.ground = terrain.ground;
    ctx.groundVersion = terrain.groundVersion;
    ctx.watched = camJet;
    ctx.speed = clock.currentSpeed;
    ctx.again = false;
    // Pixels per metre where the eye is looking: at the orbit point, or, from the target (whose
    // controls are off and keep a stale orbit point), at the watched jet. Dashes are scaled by it.
    const cam = rig.camera;
    const focus = rig.mode === 'target' ? cam.position.distanceTo(follow.jet) : cam.position.distanceTo(rig.controls.target);
    ctx.focusPxPerM = viewH / (2 * Math.max(focus, 1) * Math.tan((cam.fov * Math.PI) / 360));
    for (const l of layers) l.update(ctx); // 1. everything moves to time t
    // 2. the camera follows the watched jet (Chase, From target), eases, stays above ground; keep drawing while it settles.
    if (source.jetCount > 0) fillFollow(jets[camJet] ? jets[camJet].pose : source.jetAt(camJet, ctx.t, camPose));
    if (rig.update(terrain.heightAt, nearestTo, follow)) dirty = true;
    for (const l of layers) l.afterCamera?.(ctx); // 3. sizes on screen, read off the final camera
    if (ctx.again) dirty = true; // a layer is still easing something (a callout fading): one more frame
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
  /** A world point (three.js axes, overwritten) to CSS pixels on the canvas through the camera now; undefined behind it or past the far plane. */
  function toScreen(v: Vector3) {
    v.project(rig.camera);
    if (v.z < -1 || v.z > 1) return undefined;
    return { x: (v.x * 0.5 + 0.5) * viewW, y: (-v.y * 0.5 + 0.5) * viewH };
  }

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
      opts.onCamera?.('orbit');
      invalidate();
    },
    setCamera: (mode, j) => {
      if (!canFollow(mode)) return;
      if (j >= 0 && j < source.jetCount) camJet = j;
      ctx.watched = camJet; // the watched jet carries the colour code
      followNow();
      rig.setMode(mode, follow);
      opts.onCamera?.(mode);
      invalidate();
    },
    cameraMode: () => rig.mode,
    setRange: (r) => {
      const now = clock.getSnapshot();
      if (r.t0_s === now.start && r.t1_s === now.end) return;
      clock.setRange(r.t0_s, r.t1_s); // t is kept inside the new range; the clock tells the UI and asks for a frame
      homeBoxKept = undefined; // Home frames the new range from now on
      rig.refresh();
      invalidate();
    },
    setLabels: (on) => {
      ctx.labels = on;
      invalidate();
    },
    setActionPoints: (mode) => {
      ctx.actionPoints = mode;
      invalidate();
    },
    setAttackColours: (mode) => {
      ctx.attackColours = mode;
      invalidate();
    },
    setSource: (next, o) => {
      if (next === source) return;
      source = next;
      ctx.source = next;
      for (const l of layers) l.setSource?.(next);
      if (o?.range) clock.shiftRange(o.range.t0_s, o.range.t1_s, o.shift_s ?? 0); // range first, then the playhead: one change
      homeBoxKept = undefined; // the jets fly other times now: Home frames them afresh
      rig.refresh();
      invalidate();
    },
    source: () => source,
    stats: () => ({ frames, renders, frameMs, sceneCreates, liveScenes }),
    project(what, j = 0) {
      if (disposed || contextLost || fatal || j < 0 || j >= jets.length) return undefined;
      if (dirty) {
        try { draw(0); } catch (err) { fail(err); return undefined; }
      }
      let p: Vector3 | undefined;
      if (what === 'target' || what === 'targetMark') {
        const i = source.targetIndexOf(j);
        p = what === 'target' ? targets.ringCentre(i) : targets.markTop(i);
      } else {
        p = what === 'jet' ? jets[j].jetPosition() : jets[j].bombPosition();
      }
      if (!p) return undefined;
      return toScreen(probe.copy(p));
    },
    debugLabels: () => labels.debugLabels(),
    projectPoint(x, y, z) {
      if (disposed || contextLost || fatal) return undefined;
      if (dirty) {
        try { draw(0); } catch (err) { fail(err); return undefined; }
      }
      return toScreen(probe.set(x, y, z));
    },
    debugHome: () => ({ ...homeBoxNow() }),
    debugCamera: () => {
      const p = rig.camera.position, t = rig.controls.target;
      return { x: p.x, y: p.y, z: p.z, target: { x: t.x, y: t.y, z: t.z } };
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
