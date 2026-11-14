/**
 * Camera arithmetic for the 3D playback, pure (no three.js, no DOM), so
 * geo-check pins it under node. Poses are worked out in the playback's own
 * frame, east / north / up in metres (ENU, up = metres above the lead
 * target's planned elevation, as the playback library gives it), and turned
 * into three.js axes only at the end (`enuToThree`).
 *
 * This is the spike's subset: the orbit camera's home pose, the size of a
 * pixel in the world, the constant-size rule for the jet arrow, and the near
 * plane. The other camera modes (chase, top-down, side-on, from the target)
 * come later.
 */

export type Vec3 = [e: number, n: number, u: number];

export interface Pose {
  eye: Vec3;
  look: Vec3;
  fov_deg: number;
}

/** A box in ENU metres, the shape of the playback library's bounds. */
export interface EnuBox {
  min_e_m: number;
  max_e_m: number;
  min_n_m: number;
  max_n_m: number;
  min_up_m: number;
  max_up_m: number;
}

/** What the home pose needs to know about the strike. */
export interface HomeContext {
  /**
   * What the home view must hold, ENU m: the strike as it is played (the
   * scene source's `played` box: the drawn paths and the targets). Not the
   * terrain's box, which is far wider: framed on that, the run is a small
   * mark in the middle of a slab.
   */
  box: EnuBox;
  /** The lead's attack axis: a horizontal unit vector (e, n) pointing along the run-in, toward the target. */
  axis: [e: number, n: number];
  /** Canvas width / height. */
  aspect: number;
}

const D2R = Math.PI / 180;

/** The perspective camera's vertical field of view, degrees. */
export const HOME_FOV = 45;
/**
 * The home view sits this far round from straight behind the run-in,
 * anticlockwise seen from above, degrees: behind the jet's right shoulder
 * (run-in heading north → camera south-south-east), so the run-in is seen a
 * little from the side instead of end-on.
 */
export const HOME_SWING_DEG = 30;
/** And this far above the horizon, degrees. */
export const HOME_ELEVATION_DEG = 35;
/**
 * Slack around the framed box: its outermost corner sits at 1 / HOME_MARGIN
 * of the way from the middle of the canvas to its edge (80%), so the arrow
 * and the ring at the ends of the run are not cut by the edge.
 */
export const HOME_MARGIN = 1.25;
/** The home view never stands closer than this, m, however small the box (a strike of one point). */
export const HOME_MIN_DIST_M = 3000;
/** No perspective camera goes lower than this above the drawn ground, m. */
export const MIN_CAMERA_AGL_M = 30;

/** ENU → three.js (x = east, y = up, z = −north). Getting this wrong mirrors the world. */
export function enuToThree(v: Vec3): [x: number, y: number, z: number] {
  return [v[0], v[2], -v[1]];
}

/** Rotate a horizontal vector anticlockwise (seen from above) by `rad`. */
function rotate2(v: [number, number], rad: number): [number, number] {
  const c = Math.cos(rad), s = Math.sin(rad);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

/**
 * The orbit camera's home: behind the run-in and swung 30° to its right,
 * 35° up, looking at the middle of the box, and as close as it can stand
 * with every corner of the box still in view (with HOME_MARGIN to spare) at
 * this canvas shape. The fit is exact, corner by corner, not a sphere round
 * the box: a strike is long, thin and nearly flat, and a sphere round that
 * leaves it a fifth of the canvas wide.
 */
export function homePose(c: HomeContext): Pose {
  const b = c.box;
  const look: Vec3 = [(b.min_e_m + b.max_e_m) / 2, (b.min_n_m + b.max_n_m) / 2, (b.min_up_m + b.max_up_m) / 2];
  const back = rotate2([-c.axis[0], -c.axis[1]], HOME_SWING_DEG * D2R);
  const el = HOME_ELEVATION_DEG * D2R, cosEl = Math.cos(el), sinEl = Math.sin(el);
  // From the look point toward the eye (a unit vector), and the camera's own right and up for that direction.
  const dE = back[0] * cosEl, dN = back[1] * cosEl, dU = sinEl;
  const rE = -back[1], rN = back[0]; // horizontal
  const uE = -back[0] * sinEl, uN = -back[1] * sinEl, uU = cosEl;
  const tanV = Math.tan((HOME_FOV / 2) * D2R), tanH = tanV * c.aspect;
  // A corner p (from the look point) is in view from distance D when its sideways and upward
  // offsets fit the view at its own depth, D − p·d: so D ≥ p·d + margin × offset / tan(half view).
  let dist = HOME_MIN_DIST_M;
  for (const e of [b.min_e_m - look[0], b.max_e_m - look[0]]) {
    for (const n of [b.min_n_m - look[1], b.max_n_m - look[1]]) {
      for (const u of [b.min_up_m - look[2], b.max_up_m - look[2]]) {
        const toward = e * dE + n * dN + u * dU;
        const side = Math.abs(e * rE + n * rN), up = Math.abs(e * uE + n * uN + u * uU);
        dist = Math.max(dist, toward + HOME_MARGIN * Math.max(side / tanH, up / tanV));
      }
    }
  }
  return {
    eye: [look[0] + dE * dist, look[1] + dN * dist, look[2] + dU * dist],
    look,
    fov_deg: HOME_FOV,
  };
}

/** World metres covered by one screen pixel at `dist_m` from a perspective camera (CSS pixels in, so the DPR does not matter). */
export function worldPerPixel(dist_m: number, vFov_deg: number, viewH_px: number): number {
  return (2 * dist_m * Math.tan((vFov_deg * Math.PI) / 360)) / viewH_px;
}

/**
 * The uniform scale for a model `len_m` long so it spans at least `px` on
 * screen, but never below its true size (scale 1). Far away the arrow is
 * about 28 px long; close up it is the real 18 m.
 */
export function screenScale(worldPerPx: number, px: number, len_m: number): number {
  return Math.max(1, (px * worldPerPx) / len_m);
}

/** The near plane is never farther than this share of the distance to the nearest thing that must be seen. */
export const NEAR_SHARE = 0.5;

/**
 * The near plane for a camera this high above the drawn ground, m. It
 * follows the height, so depth precision goes where it is needed: close up
 * the ground under a low camera does not flicker, and far away the 30-60 km
 * of terrain still sorts (instead of a logarithmic depth buffer).
 *
 * `nearest_m` is the distance to the nearest thing that must not be cut off
 * (the point the camera orbits, the jet): the plane stays within half of it.
 * Without that, a camera 3 km up over a high-altitude delivery would put the
 * plane 150-200 m out and slice away the orbit point at full zoom-in, or the
 * arrow as it passes close by.
 */
export function nearPlaneFor(agl_m: number, nearest_m = Infinity): number {
  return Math.min(200, Math.max(1, Math.min(agl_m * 0.05, NEAR_SHARE * nearest_m)));
}

/** The orbit camera is never closer to the point it orbits than this, m. */
export const MIN_ORBIT_M = 150;
/** Nor, normally, farther than this many terrain-box half-diagonals: the whole box stays a sensible size on screen. */
export const MAX_ORBIT_BOXES = 2.5;
/** The zoom-out limit always leaves this much room beyond the home view. */
export const HOME_ORBIT_SLACK = 1.05;

/**
 * The orbit camera's zoom-out limit, m: MAX_ORBIT_BOXES box half-diagonals,
 * but never closer than the home view itself. In a window taller than it is
 * wide the home view stands farther back (it fits the strike across the
 * narrow width), and a smaller limit would pull the camera in on its first
 * frame, so home would no longer frame the strike.
 */
export function maxOrbitFor(home: Pose, halfDiag_m: number): number {
  const homeDist = Math.hypot(home.eye[0] - home.look[0], home.eye[1] - home.look[1], home.eye[2] - home.look[2]);
  return Math.max(MIN_ORBIT_M * 2, MAX_ORBIT_BOXES * halfDiag_m, homeDist * HOME_ORBIT_SLACK);
}
