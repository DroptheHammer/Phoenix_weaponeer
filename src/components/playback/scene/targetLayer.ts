/**
 * The strike's targets in 3D, one mark per distinct target (source.targets),
 * however many jets share it: the planner's red, standing up off the ground.
 *
 * - A red ring laid on the drawn ground, about RING_PX across on screen
 *   (never under RING_MIN_M across), re-laid only when its size on the
 *   ground moves by 3% or the ground changes, so it follows the drawn ground
 *   instead of floating over a valley or sinking into a slope.
 * - A red post from the drawn ground up to TARGET_STAND_PX on screen above
 *   the higher of the planned target and the ground (targetPost). The
 *   planner's TGT disc sits on its top (markTop), drawn by the label layer.
 *   A target planned above the drawn ground keeps its post past the planned
 *   height, so its bombs visibly land on something.
 *
 * The targets do not move with a re-time, so nothing here is rebuilt when
 * the timing changes; only the camera's distance and the ground re-lay them.
 */
import { Color, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicMaterial, Vector3, type BufferAttribute, type InstancedInterleavedBuffer, type InterleavedBufferAttribute, type Object3D } from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { MARKER_COLOR } from '../../../lib/attackPicture';
import { RING_MIN_M, RING_PX, TARGET_POST_PX, targetPost, worldPerPixel, type SceneSource } from '../../../lib/playbackScene';
import type { DisposeBag } from './disposeBag';
import { ringGeometry, RING_INNER, RING_SEGMENTS } from './jetGeometry';
import type { FrameCtx, Layer } from './layer';

/** The ring floats this far above the drawn ground (plus a depth offset), so it never flickers into it. */
const RING_LIFT_M = 1;
/** A ring or a post is re-laid when the size of a screen pixel at the target moves by more than this share. */
const RELAY_SHARE = 0.03;
/** Draw order: after the jets' lines and the bomb's fall, before the bomb and the arrow. */
const ORDER = { post: 35, ring: 40 } as const;

export interface TargetLayer extends Layer {
  /** Target i's ring centre on the drawn ground, three.js axes (the scene's own object: read, never kept or written). */
  ringCentre(i: number): Vector3;
  /** The top of target i's post, where its TGT disc is drawn (the scene's own object). */
  markTop(i: number): Vector3;
}

interface Mark {
  ringPos: BufferAttribute;
  ringCentre: Vector3;
  ringRadius: number;
  postPos: Float32Array;
  postBuf: InstancedInterleavedBuffer;
  top: Vector3;
  postWpp: number;
  groundVersion: number;
}

export function createTargetLayer(o: { source: SceneSource; parent: Object3D; bag: DisposeBag }): TargetLayer {
  const { bag, source } = o;
  const red = new Color(MARKER_COLOR.TGT); // sRGB in, linear inside: shown as exactly the planner's red
  const ringMat = bag.add(new MeshBasicMaterial({
    color: red, side: DoubleSide, fog: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, // drawn just in front of the ground under it
  }));
  const postMat = bag.add(new LineMaterial({ color: red, linewidth: TARGET_POST_PX, worldUnits: false, depthWrite: false, fog: false, toneMapped: false }));

  const drawn: Object3D[] = [];
  const marks: Mark[] = source.targets.map((t) => {
    const ringGeom = bag.add(ringGeometry());
    const ringPos = ringGeom.getAttribute('position') as BufferAttribute;
    ringPos.setUsage(DynamicDrawUsage);
    const ring = new Mesh(ringGeom, ringMat);
    ring.renderOrder = ORDER.ring;
    ring.frustumCulled = false;

    // One segment, made once and rewritten in place on each re-lay.
    const postGeom = bag.add(new LineSegmentsGeometry());
    const postPos = new Float32Array(6);
    postGeom.setPositions(postPos);
    const postBuf = (postGeom.getAttribute('instanceStart') as InterleavedBufferAttribute).data as InstancedInterleavedBuffer;
    postBuf.setUsage(DynamicDrawUsage);
    const post = new LineSegments2(postGeom, postMat);
    post.renderOrder = ORDER.post;
    post.frustumCulled = false;

    drawn.push(ring, post);
    return {
      ringPos, ringCentre: new Vector3(t.x, t.y, t.z), ringRadius: 0,
      postPos: postBuf.array as Float32Array, postBuf, top: new Vector3(t.x, t.y, t.z), postWpp: 0, groundVersion: -1,
    };
  });
  if (drawn.length) o.parent.add(...drawn);

  const probe = new Vector3();

  function placeRing(i: number, radius: number, ctx: FrameCtx) {
    const t = source.targets[i], mk = marks[i];
    mk.ringCentre.set(t.x, ctx.heightAt(t.x, t.z) + RING_LIFT_M, t.z);
    const a = mk.ringPos.array as Float32Array;
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
    mk.ringPos.needsUpdate = true;
    mk.ringRadius = radius;
  }

  function placePost(i: number, wpp: number, ground: number) {
    const t = source.targets[i], mk = marks[i];
    const { bottom, top } = targetPost(t.y, ground, wpp);
    const p = mk.postPos;
    p[0] = t.x; p[1] = bottom; p[2] = t.z;
    p[3] = t.x; p[4] = top; p[5] = t.z;
    mk.postBuf.needsUpdate = true;
    mk.top.set(t.x, top, t.z);
    mk.postWpp = wpp;
  }

  return {
    update() {},

    afterCamera(ctx) {
      for (let i = 0; i < marks.length; i++) {
        const t = source.targets[i], mk = marks[i];
        const ground = ctx.heightAt(t.x, t.z);
        probe.set(t.x, ground, t.z);
        const wpp = worldPerPixel(ctx.camera.position.distanceTo(probe), ctx.camera.fov, ctx.viewH);
        const groundMoved = mk.groundVersion !== ctx.groundVersion;
        const radius = Math.max(RING_MIN_M, RING_PX * wpp);
        if (groundMoved || Math.abs(radius - mk.ringRadius) > mk.ringRadius * RELAY_SHARE) placeRing(i, radius, ctx);
        // The post's height on screen keeps changing with the distance even while the ring sits at its
        // smallest real size, so it has its own 3% rule.
        if (groundMoved || Math.abs(wpp - mk.postWpp) > mk.postWpp * RELAY_SHARE) placePost(i, wpp, ground);
        mk.groundVersion = ctx.groundVersion;
      }
    },

    ringCentre: (i) => marks[i].ringCentre,
    markTop: (i) => marks[i].top,

    dispose() {
      if (drawn.length) o.parent.remove(...drawn);
    },
  };
}
