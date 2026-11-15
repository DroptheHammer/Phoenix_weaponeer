/**
 * The shapes the 3D playback draws for a jet, its bomb and its target, built
 * by hand so there is nothing to load. All are drawn unlit (MeshBasicMaterial):
 * form comes from per-vertex shade, not lights, so a jet is exactly its
 * strike-editor colour on top and a darker shade underneath.
 */
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute } from 'three';
import { BOMB_LEN_M, arrowFaces } from '../../../lib/playbackScene';

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
  return new CylinderGeometry(0.05, 0.18, BOMB_LEN_M, 8).rotateX(-Math.PI / 2);
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
