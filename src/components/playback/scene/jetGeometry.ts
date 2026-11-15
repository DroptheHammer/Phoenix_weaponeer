/**
 * The shapes the 3D playback draws for a jet, its bomb, the flash where it
 * lands and its target, built by hand so there is nothing to load. All are drawn unlit (MeshBasicMaterial):
 * form comes from per-vertex shade, not lights, so a jet is exactly its
 * strike-editor colour on top and a darker shade underneath.
 */
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute } from 'three';
import { BOMB_HULL_M, BOMB_LEN_M, BOMB_NOSE_M, BOMB_TAIL_M, FLASH_SEGS, arrowFaces } from '../../../lib/playbackScene';

/**
 * The jet arrow, built from the shape in src/lib/playbackScene/arrowShape.ts (a flat delta with a tall
 * fin and raised wings, so a roll reads): the shape's triangles, not indexed, each vertex carrying its
 * face's shade as a grey vertex colour.
 */
export function arrowGeometry(): BufferGeometry {
  const faces = arrowFaces();
  const pos = faces.flatMap((f) => f.v.flatMap((p) => [p[0], p[1], p[2]]));
  const shade = faces.flatMap((f) => f.v.flatMap(() => [f.shade, f.shade, f.shade]));
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(shade, 3));
  return g;
}

/** The bomb: a tapered body BOMB_LEN_M (2.4 m) long, its narrow nose turned to point along local −Z, like the arrow. */
export function bombGeometry(): BufferGeometry {
  // A cylinder stands along +Y with its top (the narrow end) at +Y; turning it −90° about X takes +Y to −Z.
  return new CylinderGeometry(BOMB_NOSE_M, BOMB_TAIL_M, BOMB_LEN_M, 8).rotateX(-Math.PI / 2);
}

/**
 * The bomb's outline: the same tapered body grown by BOMB_HULL_M all round (every radius and each end), turned
 * the same way. Drawn from inside (back faces only) behind the bomb, it shows as an even rim; a scaled copy
 * of the body would leave a thin rim on its sides and a thick one at its ends.
 */
export function bombHullGeometry(): BufferGeometry {
  return new CylinderGeometry(BOMB_NOSE_M + BOMB_HULL_M, BOMB_TAIL_M + BOMB_HULL_M, BOMB_LEN_M + 2 * BOMB_HULL_M, 8).rotateX(-Math.PI / 2);
}

/**
 * A flat disc of radius 1 facing +Z (turned to face the camera where it is drawn): a fan of FLASH_SEGS
 * triangles from its centre, wound counter-clockwise as seen from +Z so its front faces the eye. Each vertex
 * has a colour with its own alpha, `inner` at the centre and `outer` round the rim, as linear values (what
 * `new Color(hex).toArray()` gives), so a disc can fade out toward its edge.
 */
export function flashGeometry(inner: readonly [number, number, number, number], outer: readonly [number, number, number, number]): BufferGeometry {
  const pos = [0, 0, 0];
  const col = [...inner];
  for (let k = 0; k < FLASH_SEGS; k++) {
    const a = (2 * Math.PI * k) / FLASH_SEGS;
    pos.push(Math.cos(a), Math.sin(a), 0);
    col.push(...outer);
  }
  const index: number[] = [];
  for (let k = 0; k < FLASH_SEGS; k++) index.push(0, 1 + k, 1 + ((k + 1) % FLASH_SEGS));
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 4));
  g.setIndex(index);
  return g;
}

/** Points round the target ring. */
export const RING_SEGMENTS = 64;
/** The ring's band, as fractions of its radius. */
export const RING_INNER = 0.82;

/**
 * The target ring: a flat band of RING_SEGMENTS quads, inner and outer
 * vertex pairs (inner at even indices, outer at odd). Positions are left at
 * zero: the target layer writes them every time the ring is resized or the
 * ground changes, so the band follows the drawn ground instead of floating
 * over a valley or sinking into a slope.
 */
export function ringGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(new Float32Array(RING_SEGMENTS * 2 * 3), 3));
  const index: number[] = [];
  for (let k = 0; k < RING_SEGMENTS; k++) {
    const i0 = 2 * k, o0 = i0 + 1, i1 = (2 * (k + 1)) % (2 * RING_SEGMENTS), o1 = i1 + 1;
    index.push(i0, o0, i1, i1, o0, o1);
  }
  g.setIndex(index);
  return g;
}
