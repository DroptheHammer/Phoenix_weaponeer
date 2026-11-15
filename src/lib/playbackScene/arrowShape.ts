/**
 * The jet arrow's shape as plain numbers, so geo-check can hold it and the three.js side
 * (scene/jetGeometry.ts) only turns it into a geometry.
 *
 * The arrow is a flat delta ARROW_LEN_M long and 2 × ARROW_HALF_SPAN_M wide, nose along local −Z, wings along
 * ±X, +Y up. It has to show a ROLL as well as a heading, in a picture only about 28 px long, so beyond the
 * delta it carries two cues that read at that size:
 *
 * - a tall fin standing on its back (the vertical reference: leaning means banked, hanging below the wings
 *   means inverted), and
 * - wings raised a few degrees (dihedral): from ahead or behind they make a V that opens up, rolled over it
 *   opens down.
 *
 * The underside is drawn darker than the top, so a jet that has gone over shows its other face. Colour is
 * never the only cue: the fin and the dihedral are shapes.
 *
 * The footprint is fixed (nose at −ARROW_LEN_M/2, tail at +ARROW_LEN_M/2, the wing tips at ±ARROW_HALF_SPAN_M):
 * the size rule keeps the arrow ARROW_PX long on screen from ARROW_LEN_M, so the arrow stays exactly as
 * long as it was; the fin and the dihedral only add height.
 *
 * Vertex shade is a multiplier on the seat colour in linear light (the material is unlit), so a jet's top is
 * exactly its strike-editor colour and the other faces are darker shades of it.
 */
import { ARROW_LEN_M } from './sceneStyle';

/** Half the arrow's width, m: the wing tips' distance from the centre line. */
export const ARROW_HALF_SPAN_M = 6;
/** Half the arrow's thickness, m: its top face stands this far above the deck and its underside this far below. */
export const ARROW_HALF_THICK_M = 0.4;
/** How far in front of the tail the notch between the wings sits, m. */
export const ARROW_NOTCH_M = 4;
/** The fin's height above the deck, m: the apex is this far above the wing plane. */
export const ARROW_FIN_M = 6.5;
/** The fin is swept: its root starts this far behind the arrow's middle, m, and runs back to the tail, and its apex stands half a metre in front of the tail. */
export const ARROW_FIN_ROOT_Z_M = 2;
export const ARROW_FIN_APEX_BACK_M = 0.5;
/** The wings rise this many degrees toward their tips: the tips stand ARROW_HALF_SPAN_M × tan(this) above the nose and the notch. */
export const ARROW_DIHEDRAL_DEG = 12;
/** Shade of each face, a linear multiplier on the seat colour. */
export const ARROW_TOP_SHADE = 1.0;
export const ARROW_FIN_SHADE = 0.7;
export const ARROW_UNDER_SHADE = 0.4;

export type ArrowVec = readonly [number, number, number];
export interface ArrowFace {
  part: 'top' | 'fin' | 'under';
  shade: number;
  /** Three corners, x y z. The winding says which way the face looks: a top face's normal points up, an underside's down (the material draws both sides). */
  v: readonly [ArrowVec, ArrowVec, ArrowVec];
}

/**
 * Every triangle of the arrow: the two top faces, the two undersides and the fin. Made fresh each call
 * (the geometry is built once per jet, never per frame).
 */
export function arrowFaces(): ArrowFace[] {
  const half = ARROW_LEN_M / 2; // nose at −half, tail at +half
  const h = ARROW_HALF_THICK_M;
  const tip = ARROW_HALF_SPAN_M * Math.tan((ARROW_DIHEDRAL_DEG * Math.PI) / 180); // how far the wing tips stand above the deck
  const N: ArrowVec = [0, 0, -half], L: ArrowVec = [-ARROW_HALF_SPAN_M, tip, half], R: ArrowVec = [ARROW_HALF_SPAN_M, tip, half], K: ArrowVec = [0, 0, half - ARROW_NOTCH_M];
  const lift = (p: ArrowVec, dy: number): ArrowVec => [p[0], p[1] + dy, p[2]];
  const face = (part: ArrowFace['part'], shade: number, a: ArrowVec, b: ArrowVec, c: ArrowVec, dy: number): ArrowFace =>
    ({ part, shade, v: [lift(a, dy), lift(b, dy), lift(c, dy)] });
  return [
    face('top', ARROW_TOP_SHADE, N, L, K, h), face('top', ARROW_TOP_SHADE, N, K, R, h),
    face('under', ARROW_UNDER_SHADE, N, K, L, -h), face('under', ARROW_UNDER_SHADE, N, R, K, -h),
    { part: 'fin', shade: ARROW_FIN_SHADE, v: [[0, h, ARROW_FIN_ROOT_Z_M], [0, h, half], [0, ARROW_FIN_M, half - ARROW_FIN_APEX_BACK_M]] },
  ];
}
