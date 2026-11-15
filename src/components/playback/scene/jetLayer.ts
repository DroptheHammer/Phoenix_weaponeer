/**
 * One jet in the 3D playback (the spike draws one): its arrow, its planned
 * path, a 20 s trail, its bomb while it falls, and a ring on the ground at
 * its target. Everything is sampled from the playback library's DISPLAY
 * layer through the scene adapter (src/lib/playbackScene/source.ts), so the
 * picture is the planner's, timed.
 *
 * - The arrow points along the displayed velocity, not the heading number
 *   (meridians converge away from the target, and velocity is what the eye
 *   follows), and banks with the display's bank estimate.
 * - The arrow and the bomb keep a constant size on screen (about 28 px and
 *   10 px) so they read at 50 km, but never shrink below their real size
 *   close up.
 * - The trail is worked out afresh from the playback every frame instead of
 *   remembered, so scrubbing backwards, seeking and speed changes are always
 *   right; its buffers are made once, so no frame allocates.
 * - The path and the trail are three's wide lines (LineSegments2), a set
 *   width in CSS pixels: plain WebGL lines are one device pixel, too thin to
 *   follow over a map. They are opaque (a see-through wide line shows a bead
 *   at every joint) and still hidden by a hill in front of them.
 * - Nothing here is hazed: the jet must stay visible over the far terrain.
 */
import {
  type BufferAttribute, Color, DoubleSide, DynamicDrawUsage, type InstancedInterleavedBuffer, type InterleavedBufferAttribute,
  Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3, type Object3D,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import {
  ARROW_LEN_M, ARROW_PX, BG, BOMB_LEN_M, BOMB_PX, PATH_PX, PATH_SHADE, TRAIL_CASING_PX, TRAIL_PX, TRAIL_S, jetColor,
  newSceneBombPose, newSceneJetPose, screenScale, worldPerPixel, type SceneJetPose, type SceneSource,
} from '../../../lib/playbackScene';
import type { DisposeBag } from './disposeBag';
import { arrowGeometry, bombGeometry, ringGeometry, RING_INNER, RING_SEGMENTS } from './jetGeometry';
import type { FrameCtx, Layer } from './layer';

/** Trail samples: one every quarter second over TRAIL_S. */
const TRAIL_N = 81;
/** The target ring's radius on screen, CSS pixels, and its smallest real radius, m. */
export const RING_PX = 14;
export const RING_MIN_M = 60;
/** The ring floats this far above the drawn ground (plus a depth offset), so it never flickers into it. */
const RING_LIFT_M = 1;
/** Below this speed the velocity has no direction worth trusting: the heading and pitch are used. */
const MIN_SPEED_MPS = 0.5;

/** Draw order: the muted path first, then the trail on its casing, the ring, and the arrow and bomb last. */
const ORDER = { path: 5, casing: 29, trail: 30, ring: 40, bomb: 59, arrow: 60 } as const;

/** A polyline's points (xyz, xyz, …) as wide-line segments (start xyz, end xyz per segment). */
function segmentsOf(points: Float32Array): Float32Array {
  const n = Math.max(0, points.length / 3 - 1);
  const out = new Float32Array(n * 6);
  for (let k = 0; k < n; k++) out.set(points.subarray(k * 3, k * 3 + 6), k * 6);
  return out;
}

/** An opaque wide line of a set width in CSS pixels, tested against the ground's depth but never writing its own. */
function wideLine(color: Color, px: number): LineMaterial {
  return new LineMaterial({ color, linewidth: px, worldUnits: false, depthWrite: false, fog: false, toneMapped: false });
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
  /** The ring's centre on the drawn ground. */
  targetPosition(): Vector3;
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

  // ── The planned path: the whole visible display track, thin and muted toward the background.
  const pathGeom = bag.add(new LineSegmentsGeometry());
  pathGeom.setPositions(segmentsOf(src.plannedPath(jet)));
  const path = new LineSegments2(pathGeom, bag.add(wideLine(colour.clone().lerp(new Color(BG), PATH_SHADE), PATH_PX)));
  path.renderOrder = ORDER.path;
  path.frustumCulled = false;

  // ── The trail: the last TRAIL_S of the track in the jet's colour, on a dark casing. One buffer of
  // segments (start xyz, end xyz), made once and shared by both; each frame refills it in place.
  const trailSegs = new Float32Array((TRAIL_N - 1) * 6);
  const trailGeom = bag.add(new LineSegmentsGeometry());
  trailGeom.setPositions(trailSegs);
  const trailBuffer = (trailGeom.getAttribute('instanceStart') as InterleavedBufferAttribute).data as InstancedInterleavedBuffer;
  trailBuffer.setUsage(DynamicDrawUsage);
  trailGeom.instanceCount = 0;
  const casing = new LineSegments2(trailGeom, bag.add(wideLine(new Color(BG), TRAIL_CASING_PX)));
  casing.renderOrder = ORDER.casing;
  casing.frustumCulled = false;
  const trail = new LineSegments2(trailGeom, bag.add(wideLine(colour, TRAIL_PX)));
  trail.renderOrder = ORDER.trail;
  trail.frustumCulled = false;

  // ── The bomb, while it falls: the jet's colour a shade darker.
  const bomb = new Mesh(bag.add(bombGeometry()), bag.add(new MeshBasicMaterial({ color: colour.clone().multiplyScalar(0.8), fog: false, toneMapped: false })));
  bomb.renderOrder = ORDER.bomb;
  bomb.frustumCulled = false;
  bomb.visible = false;

  // ── The target ring, laid on the drawn ground and kept about RING_PX across on screen.
  const ringGeom = bag.add(ringGeometry());
  const ringPos = ringGeom.getAttribute('position') as BufferAttribute;
  ringPos.setUsage(DynamicDrawUsage);
  const ring = new Mesh(ringGeom, bag.add(new MeshBasicMaterial({
    color: colour, side: DoubleSide, fog: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, // drawn just in front of the ground under it
  })));
  ring.renderOrder = ORDER.ring;
  ring.frustumCulled = false;
  const ringCentre = new Vector3();
  let ringRadius = 0, ringGroundVersion = -1;

  o.parent.add(path, casing, trail, ring, bomb, arrow);

  // Scratch, made once: no frame allocates.
  const pose = newSceneJetPose(), past = newSceneJetPose(), bpose = newSceneBombPose();
  const dir = new Vector3(), probe = new Vector3(), m = new Matrix4(), qRoll = new Quaternion();
  const ORIGIN = new Vector3(0, 0, 0), UP = new Vector3(0, 1, 0), FWD = new Vector3(0, 0, -1), Z_AXIS = new Vector3(0, 0, 1);
  let lastTrailT = NaN;
  const D2R = Math.PI / 180;

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
    // Sample k is the trail k steps back from the jet; segment k−1 joins sample k−1 to sample k.
    let n = 0;
    for (let k = 0; k < TRAIL_N; k++) {
      const tk = t - (k * TRAIL_S) / (TRAIL_N - 1);
      if (tk < src.window.t0_s) break;
      src.jetAt(jet, tk, past);
      if (!past.visible) break;
      if (k > 0) {
        const end = (k - 1) * 6 + 3;
        trailSegs[end] = past.x;
        trailSegs[end + 1] = past.y;
        trailSegs[end + 2] = past.z;
      }
      if (k < TRAIL_N - 1) {
        const start = k * 6;
        trailSegs[start] = past.x;
        trailSegs[start + 1] = past.y;
        trailSegs[start + 2] = past.z;
      }
      n++;
    }
    trailGeom.instanceCount = Math.max(0, n - 1);
    trailBuffer.needsUpdate = true;
  }

  function placeRing(radius: number, ctx: FrameCtx) {
    const t = src.targetOf(jet);
    ringCentre.set(t.x, ctx.heightAt(t.x, t.z) + RING_LIFT_M, t.z);
    const a = ringPos.array as Float32Array;
    for (let k = 0; k < RING_SEGMENTS; k++) {
      const ang = (2 * Math.PI * k) / RING_SEGMENTS, c = Math.cos(ang), s = Math.sin(ang);
      for (let side = 0; side < 2; side++) {
        const r = side === 0 ? radius * RING_INNER : radius;
        const x = t.x + r * c, z = t.z + r * s, v = (2 * k + side) * 3;
        a[v] = x;
        a[v + 1] = ctx.heightAt(x, z) + RING_LIFT_M;
        a[v + 2] = z;
      }
    }
    ringPos.needsUpdate = true;
    ringRadius = radius;
    ringGroundVersion = ctx.groundVersion;
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
      if (arrow.visible) arrow.scale.setScalar(sizeAt(ctx, arrow.position, ARROW_PX, ARROW_LEN_M));
      if (bomb.visible) bomb.scale.setScalar(sizeAt(ctx, bomb.position, BOMB_PX, BOMB_LEN_M));
      // The ring: re-laid only when its size on the ground moves by 3% or the ground itself changed.
      const t = src.targetOf(jet);
      probe.set(t.x, ctx.heightAt(t.x, t.z), t.z);
      const wpp = worldPerPixel(ctx.camera.position.distanceTo(probe), ctx.camera.fov, ctx.viewH);
      const radius = Math.max(RING_MIN_M, RING_PX * wpp);
      if (ringGroundVersion !== ctx.groundVersion || Math.abs(radius - ringRadius) > ringRadius * 0.03) placeRing(radius, ctx);
    },

    jetPosition: () => (arrow.visible ? arrow.position : undefined),
    bombPosition: () => (bomb.visible ? bomb.position : undefined),
    targetPosition: () => ringCentre,

    dispose() {
      o.parent.remove(path, casing, trail, ring, bomb, arrow);
    },
  };
}
