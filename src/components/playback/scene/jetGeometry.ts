/**
 * The shapes the 3D playback draws for a jet, its bomb and its target, built
 * by hand so there is nothing to load. All are drawn unlit (MeshBasicMaterial):
 * form comes from per-vertex shade, not lights, so a jet is exactly its
 * strike-editor colour on top and a darker shade underneath.
 */
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute } from 'three';
import { ARROW_LEN_M, BOMB_LEN_M } from '../../../lib/playbackScene';

/**
 * The jet arrow: a flat delta ARROW_LEN_M (18 m) long and 12 m wide, nose
 * along local −Z, wings along ±X, with a small fin on top (+Y) so pitch and
 * bank read from the side. Four triangle groups, not indexed: top, underside
 * and the fin. Vertex shade: top 1.0, fin 0.8, underside 0.55.
 */
export function arrowGeometry(): BufferGeometry {
  const half = ARROW_LEN_M / 2; // 9 m: nose at −9, tail at +9
  const h = 0.4; // half its thickness, m
  const N = [0, 0, -half], L = [-6, 0, half], R = [6, 0, half], K = [0, 0, half - 4]; // nose, tail corners, the notch
  const tri = (a: number[], b: number[], c: number[], dy: number) => [a[0], a[1] + dy, a[2], b[0], b[1] + dy, b[2], c[0], c[1] + dy, c[2]];
  const pos = [
    ...tri(N, L, K, h), ...tri(N, K, R, h), // top
    ...tri(N, K, L, -h), ...tri(N, R, K, -h), // underside
    0, h, 1, 0, h, half, 0, 3.5, half - 1, // fin
  ];
  const shade = [...Array(6).fill(1), ...Array(6).fill(0.55), ...Array(3).fill(0.8)].flatMap((s: number) => [s, s, s]);
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
 * zero: the jet layer writes them every time the ring is resized or the
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
