/**
 * One jet in the 3D playback (the spike draws one): its arrow, its planned
 * path, a 20 s trail, its bomb while it falls and the line of its whole
 * fall. Its target is the target layer's (one mark per distinct target,
 * however many jets share it). Everything is sampled from
 * the playback library's DISPLAY layer through the scene adapter
 * (src/lib/playbackScene/source.ts), so the picture is the planner's, timed.
 *
 * - The path and the trail wear the planner's colour code, the map's and the
 *   card's own LINE_STYLE: blue route and leg, yellow climb, orange
 *   pull-down, red attack, green egress, dashed where the planner dashes. The bomb's fall is the planner's thin red dashed bomb line.
 *   Colours are never the only cue: route and leg differ by the dash, and
 *   the arrow keeps its seat colour.
 * - The arrow points along the displayed velocity, not the heading number
 *   (meridians converge away from the target, and velocity is what the eye
 *   follows), and banks with the display's bank estimate.
 * - The arrow and the bomb keep a constant size on screen (about 28 px and
 *   10 px) so they read at 50 km, but never shrink below their real size
 *   close up.
 * - The trail is worked out afresh from the playback every frame instead of
 *   remembered, so scrubbing backwards, seeking and speed changes are always
 *   right; its buffers are made once, so no frame allocates.
 * - The path, the trail and the fall are three's wide lines (LineSegments2),
 *   a set width in CSS pixels: plain WebGL lines are one device pixel, too
 *   thin to follow over a map. They are opaque (a see-through wide line shows
 *   a bead at every joint) and still hidden by a hill in front of them.
 * - Each coloured line is two geometries, one for its solid stretches and one
 *   for its dashed ones: a dashed line material drops the round caps of every
 *   segment, so one dashed material for a mixed line would notch every bend.
 *   Each geometry has its own dark casing mesh under it (one mesh draws one
 *   geometry), so a dashed stretch is cased too.
 * - Nothing here is hazed: the jet must stay visible over the far terrain.
 */
import {
  Color, DoubleSide, DynamicDrawUsage, InstancedInterleavedBuffer, InterleavedBufferAttribute,
  Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3, type Object3D,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LINE_STYLE } from '../../../lib/attackPicture';
import { PHASES, PHASE_STYLE } from '../../../lib/playback';
import {
  ARROW_LEN_M, ARROW_PX, BOMB_LEN_M, BOMB_LINE_CASING_PX, BOMB_LINE_PX, BOMB_PX, LINE_CASING, PATH_CASING_PX, PATH_PX,
  TRAIL_CASING_PX, TRAIL_PX, TRAIL_S, jetColor,
  newSceneBombPose, newSceneJetPose, screenScale, worldPerPixel, type SceneJetPose, type ScenePhase, type SceneSource,
} from '../../../lib/playbackScene';
import type { DisposeBag } from './disposeBag';
import { arrowGeometry, bombGeometry } from './jetGeometry';
import type { FrameCtx, Layer } from './layer';

/** Trail samples: one every quarter second over TRAIL_S. */
const TRAIL_N = 81;
/**
 * The trail's dashes are laid along jet time × this speed, not metres flown, so they stay put on the
 * ground as the trail moves. Jet time measured from when the jet comes into the picture stays small
 * at any delay (strike time at a delay of hours would cost float32 its precision, a metre a step).
 */
const TRAIL_DASH_MPS = 250;

/** Per PHASES index: the planner's colour as linear RGB (three's working space; a hex divided by 255 would draw too pale), and whether it is dashed. */
const PHASE_RGB = new Float32Array(PHASES.length * 3);
const PHASE_DASHED = new Uint8Array(PHASES.length);
const PHASE_INDEX = {} as Record<ScenePhase, number>;
PHASES.forEach((p, i) => {
  const style = LINE_STYLE[PHASE_STYLE[p]];
  const c = new Color(style.color);
  PHASE_RGB.set([c.r, c.g, c.b], i * 3);
  PHASE_DASHED[i] = style.dash ? 1 : 0;
  PHASE_INDEX[p] = i;
});
/** The dash of the dashed stretches, CSS px on, px off (the route and the egress leg share the map's 10 / 10). */
const PATH_DASH = LINE_STYLE[PHASE_STYLE[PHASES.find((p) => LINE_STYLE[PHASE_STYLE[p]].dash) ?? 'route']].dash ?? [10, 10];
const BOMB_DASH = LINE_STYLE.bomb.dash ?? [4, 6];
/** Below this speed the velocity has no direction worth trusting: the heading and pitch are used. */
const MIN_SPEED_MPS = 0.5;

/**
 * Draw order: each line's casing just before the line itself, the path first, then the trail, the
 * bomb's fall, and the arrow and bomb last (the target layer's post and ring draw between the fall
 * and the bomb). Every casing of a line draws before any of its colour, so a casing never covers a
 * coloured stretch of its own line.
 */
const ORDER = { pathCasing: 6, path: 7, trailCasing: 31, trail: 32, fallCasing: 33, fall: 34, bomb: 59, arrow: 60 } as const;

/** An opaque wide line of a set width in CSS pixels, tested against the ground's depth but never writing its own. */
function wideLine(color: Color, px: number, more: { vertexColors?: boolean; dash?: number[] } = {}): LineMaterial {
  const m = new LineMaterial({ color, linewidth: px, worldUnits: false, depthWrite: false, fog: false, toneMapped: false, vertexColors: !!more.vertexColors });
  if (more.dash) {
    m.dashed = true;
    m.dashSize = more.dash[0];
    m.gapSize = more.dash[1];
  }
  return m;
}

/**
 * A wide-line geometry with room for `segs` segments, made once and refilled in place (never
 * re-made, so the graphics card's buffers are never reallocated): positions, and when asked a colour
 * per segment end and a distance along the line per segment end (for dashes).
 */
interface Capacity {
  geom: LineSegmentsGeometry;
  segs: number;
  pos: Float32Array;
  col: Float32Array | null;
  dist: Float32Array | null;
  buffers: InstancedInterleavedBuffer[];
  /** Segments written so far in this refill. */
  n: number;
}
function capacityGeometry(bag: DisposeBag, segs: number, colours: boolean, distances: boolean): Capacity {
  const geom = bag.add(new LineSegmentsGeometry());
  const room = Math.max(1, segs);
  const pos = new Float32Array(room * 6);
  geom.setPositions(pos);
  const buffers = [(geom.getAttribute('instanceStart') as InterleavedBufferAttribute).data as InstancedInterleavedBuffer];
  let col: Float32Array | null = null, dist: Float32Array | null = null;
  if (colours) {
    col = new Float32Array(room * 6);
    geom.setColors(col);
    buffers.push((geom.getAttribute('instanceColorStart') as InterleavedBufferAttribute).data as InstancedInterleavedBuffer);
  }
  if (distances) {
    dist = new Float32Array(room * 2);
    const d = new InstancedInterleavedBuffer(dist, 2, 1);
    geom.setAttribute('instanceDistanceStart', new InterleavedBufferAttribute(d, 1, 0));
    geom.setAttribute('instanceDistanceEnd', new InterleavedBufferAttribute(d, 1, 1));
    buffers.push(d);
  }
  for (const b of buffers) b.setUsage(DynamicDrawUsage);
  geom.instanceCount = 0;
  return { geom, segs: room, pos, col, dist, buffers, n: 0 };
}
/** Write one segment (start xyz, end xyz) with its colour and its two distances, if there is room. */
function putSegment(c: Capacity, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, rgb: Float32Array, ri: number, d0: number, d1: number) {
  if (c.n >= c.segs) return;
  const i = c.n++, p = i * 6;
  c.pos[p] = x0; c.pos[p + 1] = y0; c.pos[p + 2] = z0;
  c.pos[p + 3] = x1; c.pos[p + 4] = y1; c.pos[p + 5] = z1;
  if (c.col) {
    c.col[p] = c.col[p + 3] = rgb[ri];
    c.col[p + 1] = c.col[p + 4] = rgb[ri + 1];
    c.col[p + 2] = c.col[p + 5] = rgb[ri + 2];
  }
  if (c.dist) {
    c.dist[i * 2] = d0;
    c.dist[i * 2 + 1] = d1;
  }
}
/** End a refill: draw what was written, and send it to the graphics card. */
function finish(c: Capacity) {
  c.geom.instanceCount = c.n;
  for (const b of c.buffers) b.needsUpdate = true;
}

/** A line in the planner's colour code: solid and dashed stretches on their own geometries, each on its casing. */
interface CodedLine {
  solid: Capacity;
  dashed: Capacity;
  dashMat: LineMaterial;
  meshes: LineSegments2[];
}
function codedLine(bag: DisposeBag, segs: number, px: number, casingPx: number, order: { casing: number; line: number }): CodedLine {
  const solid = capacityGeometry(bag, segs, true, false);
  const dashed = capacityGeometry(bag, segs, true, true);
  // The colour comes from the vertices; the material's white leaves it as it is (three multiplies the two).
  const white = new Color('#ffffff');
  const casingMat = bag.add(wideLine(new Color(LINE_CASING), casingPx));
  const solidMat = bag.add(wideLine(white, px, { vertexColors: true }));
  const dashMat = bag.add(wideLine(white, px, { vertexColors: true, dash: PATH_DASH }));
  const meshes = [
    new LineSegments2(solid.geom, casingMat), new LineSegments2(dashed.geom, casingMat),
    new LineSegments2(solid.geom, solidMat), new LineSegments2(dashed.geom, dashMat),
  ];
  meshes.forEach((m, i) => {
    m.renderOrder = i < 2 ? order.casing : order.line;
    m.frustumCulled = false;
  });
  return { solid, dashed, dashMat, meshes };
}
/** One stretch of a coded line, on the solid or the dashed geometry by its phase. */
function putPhase(l: CodedLine, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, phase: number, d0: number, d1: number) {
  putSegment(PHASE_DASHED[phase] ? l.dashed : l.solid, x0, y0, z0, x1, y1, z1, PHASE_RGB, phase * 3, d0, d1);
}

export interface JetLayer extends Layer {
  /**
   * The jet at the last update's time, three.js axes (the scene's own object,
   * refilled every update: read, never kept or written). Its position is
   * valid even while the jet is hidden, so a camera can follow it then.
   */
  readonly pose: SceneJetPose;
  /** Where the arrow is now (three.js axes), or undefined while the jet is not shown. */
  jetPosition(): Vector3 | undefined;
  /** Where the bomb is now, or undefined unless it is falling. */
  bombPosition(): Vector3 | undefined;
}

/**
 * `colorIndex` is the editor's seat index for this jet (its JET_COLORS
 * entry): the selected jet flies alone as playback jet 0, but #2 must still
 * be magenta, as on the editor's map. Default: the playback index.
 */
export function createJetLayer(o: { source: SceneSource; jet: number; colorIndex?: number; parent: Object3D; bag: DisposeBag }): JetLayer {
  const { bag, jet } = o;
  let src = o.source;
  const colour = new Color(jetColor(o.colorIndex ?? jet)); // sRGB in, linear inside: shown as exactly the editor's colour

  // ── The arrow.
  const arrowMat = bag.add(new MeshBasicMaterial({ color: colour, vertexColors: true, side: DoubleSide, fog: false, toneMapped: false }));
  const arrow = new Mesh(bag.add(arrowGeometry()), arrowMat);
  arrow.renderOrder = ORDER.arrow;
  arrow.frustumCulled = false;
  arrow.visible = false;

  // ── The planned path, IP to the end of the drawn egress leg, in the planner's colours. Its buffers
  // are sized for any delay (pathCapacity), so a new timing refills them in place.
  const pathSegs = Math.max(1, src.pathCapacity(jet) - 1);
  const path = codedLine(bag, pathSegs, PATH_PX, PATH_CASING_PX, { casing: ORDER.pathCasing, line: ORDER.path });

  // ── The trail: the last TRAIL_S of the track in the planner's colours, wider than the path; each
  // frame refills its buffers in place.
  const trail = codedLine(bag, TRAIL_N - 1, TRAIL_PX, TRAIL_CASING_PX, { casing: ORDER.trailCasing, line: ORDER.trail });

  // ── The bomb's whole fall, release to impact, drawn from the start: the planner's bomb line,
  // thin, red and dashed, on its casing.
  const fall = capacityGeometry(bag, Math.max(1, src.bombCapacity(jet) - 1), false, true);
  const fallMat = bag.add(wideLine(new Color(LINE_STYLE.bomb.color), BOMB_LINE_PX, { dash: BOMB_DASH }));
  const fallCasing = new LineSegments2(fall.geom, bag.add(wideLine(new Color(LINE_CASING), BOMB_LINE_CASING_PX)));
  const fallLine = new LineSegments2(fall.geom, fallMat);
  fallCasing.renderOrder = ORDER.fallCasing;
  fallLine.renderOrder = ORDER.fall;
  fallCasing.frustumCulled = fallLine.frustumCulled = false;

  // ── The bomb, while it falls: the planner's bomb-line red.
  const bomb = new Mesh(bag.add(bombGeometry()), bag.add(new MeshBasicMaterial({ color: new Color(LINE_STYLE.bomb.color), fog: false, toneMapped: false })));
  bomb.renderOrder = ORDER.bomb;
  bomb.frustumCulled = false;
  bomb.visible = false;

  const drawn = [...path.meshes, ...trail.meshes, fallCasing, fallLine, bomb, arrow];
  o.parent.add(...drawn);

  // Scratch, made once: no frame allocates.
  const pose = newSceneJetPose(), past = newSceneJetPose(), bpose = newSceneBombPose();
  const dir = new Vector3(), m = new Matrix4(), qRoll = new Quaternion();
  const ORIGIN = new Vector3(0, 0, 0), UP = new Vector3(0, 1, 0), FWD = new Vector3(0, 0, -1), Z_AXIS = new Vector3(0, 0, 1);
  let lastTrailT = NaN;
  const D2R = Math.PI / 180;

  /** The planned path into its buffers, stretch by stretch, with the metres along it for the dashes. */
  function refillPath() {
    const pts = src.plannedPath(jet), ph = src.plannedPhase(jet);
    const segs = Math.min(pts.length / 3 - 1, pathSegs);
    path.solid.n = path.dashed.n = 0;
    let along = 0;
    for (let s = 0; s < segs; s++) {
      const a = s * 3;
      const len = Math.hypot(pts[a + 3] - pts[a], pts[a + 4] - pts[a + 1], pts[a + 5] - pts[a + 2]);
      putPhase(path, pts[a], pts[a + 1], pts[a + 2], pts[a + 3], pts[a + 4], pts[a + 5], ph[s], along, along + len);
      along += len;
    }
    finish(path.solid);
    finish(path.dashed);
  }

  /** The bomb's whole fall into its buffer, with the metres along it for the dashes. */
  function refillFall() {
    const pts = src.plannedBomb(jet);
    const segs = Math.min(pts.length / 3 - 1, fall.segs);
    fall.n = 0;
    let along = 0;
    for (let s = 0; s < segs; s++) {
      const a = s * 3;
      const len = Math.hypot(pts[a + 3] - pts[a], pts[a + 4] - pts[a + 1], pts[a + 5] - pts[a + 2]);
      putSegment(fall, pts[a], pts[a + 1], pts[a + 2], pts[a + 3], pts[a + 4], pts[a + 5], PHASE_RGB, 0, along, along + len);
      along += len;
    }
    finish(fall);
  }

  refillPath();
  refillFall();

  function placeArrow() {
    arrow.position.set(pose.x, pose.y, pose.z);
    dir.set(pose.vx, pose.vy, pose.vz);
    if (dir.lengthSq() < MIN_SPEED_MPS * MIN_SPEED_MPS) {
      const h = pose.heading_deg * D2R, p = pose.pitch_deg * D2R;
      dir.set(Math.cos(p) * Math.sin(h), Math.sin(p), -Math.cos(p) * Math.cos(h)); // ENU (cos p sin H, cos p cos H, sin p) in three's axes
    }
    dir.normalize();
    // lookAt from the origin toward `dir` aims the model's −Z (its nose) along dir with +Y kept up;
    // then the roll about the nose: right bank (positive) puts the right wing (+X) down.
    m.lookAt(ORIGIN, dir, UP);
    arrow.quaternion.setFromRotationMatrix(m);
    qRoll.setFromAxisAngle(Z_AXIS, -pose.bank_deg * D2R);
    arrow.quaternion.multiply(qRoll);
  }

  function updateTrail(t: number) {
    // Sample k is the trail k steps back from the jet; the segment from sample k−1 to sample k takes
    // the phase of its earlier end, sample k (a sample's phase is that of the stretch after it).
    trail.solid.n = trail.dashed.n = 0;
    const from = src.visibleFromOf(jet);
    let px = 0, py = 0, pz = 0, pd = 0;
    for (let k = 0; k < TRAIL_N; k++) {
      const tk = t - (k * TRAIL_S) / (TRAIL_N - 1);
      if (tk < src.window.t0_s) break;
      src.jetAt(jet, tk, past);
      if (!past.visible) break;
      const d = (tk - from) * TRAIL_DASH_MPS;
      if (k > 0) putPhase(trail, px, py, pz, past.x, past.y, past.z, PHASE_INDEX[past.phase], pd, d);
      px = past.x;
      py = past.y;
      pz = past.z;
      pd = d;
    }
    finish(trail.solid);
    finish(trail.dashed);
  }

  const sizeAt = (ctx: FrameCtx, p: Vector3, px: number, len_m: number) =>
    screenScale(worldPerPixel(ctx.camera.position.distanceTo(p), ctx.camera.fov, ctx.viewH), px, len_m);

  return {
    pose,

    update(ctx) {
      src = ctx.source;
      src.jetAt(jet, ctx.t, pose);
      arrow.visible = pose.visible;
      if (pose.visible) placeArrow();
      if (ctx.t !== lastTrailT) {
        updateTrail(ctx.t);
        lastTrailT = ctx.t;
      }

      src.bombAt(jet, ctx.t, bpose);
      bomb.visible = bpose.visible;
      if (bpose.visible) {
        bomb.position.set(bpose.x, bpose.y, bpose.z);
        dir.set(bpose.vx, bpose.vy, bpose.vz);
        if (dir.lengthSq() > MIN_SPEED_MPS * MIN_SPEED_MPS) bomb.quaternion.setFromUnitVectors(FWD, dir.normalize());
      }
    },

    afterCamera(ctx) {
      // Dashes are laid in metres along each line: scaled to the planner's pixels where the eye is looking.
      path.dashMat.dashScale = ctx.focusPxPerM;
      trail.dashMat.dashScale = ctx.focusPxPerM;
      fallMat.dashScale = ctx.focusPxPerM;
      if (arrow.visible) arrow.scale.setScalar(sizeAt(ctx, arrow.position, ARROW_PX, ARROW_LEN_M));
      if (bomb.visible) bomb.scale.setScalar(sizeAt(ctx, bomb.position, BOMB_PX, BOMB_LEN_M));
    },

    jetPosition: () => (arrow.visible ? arrow.position : undefined),
    bombPosition: () => (bomb.visible ? bomb.position : undefined),

    dispose() {
      o.parent.remove(...drawn);
    },
  };
}
