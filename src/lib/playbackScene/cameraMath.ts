/**
 * Camera arithmetic for the 3D playback, pure (no three.js, no DOM), so
 * geo-check pins it under node. Poses are worked out in the playback's own
 * frame, east / north / up in metres (ENU, up = metres above the lead
 * target's planned elevation, as the playback library gives it), and turned
 * into three.js axes only at the end (`enuToThree`).
 *
 * What is here: the orbit camera's home pose, the size of a pixel in the
 * world, the constant-size rule for the jet arrow, the near plane, and the
 * four camera modes: Orbit (turn round the strike), Top-down (straight down,
 * north up, like the map), Chase (ride behind the watched jet) and From target
 * (look up at it from its target): each mode's limits for the controls and
 * its pose on entry.
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
   * What the home view must hold, ENU m: the attack as it is played
   * (homeBox in homeView.ts: every jet and falling bomb over the clock's
   * range, and the targets). Not the terrain's box, which is far wider:
   * framed on that, the run is a small mark in the middle of a slab.
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

// ── The camera modes ──

/** Orbit: turn round the strike. Top-down: straight down, north up. Chase: ride behind the watched jet. Target: look up at it from its target. */
export type CameraMode = 'orbit' | 'top' | 'chase' | 'target';

/** Chase: the eye this far behind the jet and this far above it on entry, m (about 1,300 ft back and 400 ft up). */
export const CHASE_BACK_M = 400;
export const CHASE_UP_M = 120;
/** How close and how far the wheel may take the chase camera from the jet, m. */
export const CHASE_MIN_M = 80;
export const CHASE_MAX_M = 3000;
/**
 * The chase eye sits this far round from straight behind the jet,
 * anticlockwise seen from above, degrees: behind its right shoulder (as the
 * home view sits), so a pop-up reads as a climb and a dive, not end-on.
 */
export const CHASE_SWING_DEG = 30;
/** The wheel's speed. Three's default is 1 (5% a notch); 2 is about 10% a notch, which reaches the attack from Home in a few turns. */
export const ZOOM_SPEED = 2;
/** Never flatter than this from straight down, degrees: just short of the horizon, so the view never looks up from under the ground. */
export const MAX_POLAR_DEG = 87;
/**
 * Top-down looks down from this angle off the vertical, radians, not from
 * exactly overhead: straight down there is no "up" on the screen, so the
 * picture could turn; this small lean keeps north at the top.
 */
export const TOP_POLAR_RAD = 0.001;

/** What the mouse and the wheel may do in a mode, and how far the camera may stand from what it looks at. */
export interface ControlsConfig {
  /** Off: the controls ignore the mouse and the wheel altogether (From target). */
  enabled: boolean;
  rotate: boolean;
  pan: boolean;
  zoom: boolean;
  minPolar_rad: number;
  maxPolar_rad: number;
  minAzimuth_rad: number;
  maxAzimuth_rad: number;
  minDist_m: number;
  maxDist_m: number;
  /** The wheel moves toward the point under the cursor, not toward the middle of the view. */
  zoomToCursor: boolean;
  zoomSpeed: number;
  /** A plain left drag slides the view instead of turning it (Top-down, where there is nothing to turn). */
  leftPans: boolean;
}

/**
 * The limits for a mode. `orbitMax_m` is the orbit zoom-out limit
 * (maxOrbitFor); `topDist_m` is how far the top-down pose stands from what it
 * looks at, which the limit always leaves room past.
 * - orbit: turn, slide, zoom to the cursor; from straight down to just short of the horizon; MIN_ORBIT_M to orbitMax_m.
 * - top: no turning, the angle held straight down and north up; a left drag slides; zoom to the cursor; MIN_ORBIT_M to the larger of orbitMax_m and 5% past the top-down pose.
 * - chase: turn round the jet and zoom toward it (the jet stays in the middle, so no sliding and no zoom to the cursor); CHASE_MIN_M to CHASE_MAX_M.
 * - target: the controls are off; the camera stays at the target and looks at the jet.
 */
export function controlsFor(mode: CameraMode, orbitMax_m: number, topDist_m: number): ControlsConfig {
  const orbit: ControlsConfig = {
    enabled: true, rotate: true, pan: true, zoom: true,
    minPolar_rad: 0, maxPolar_rad: (MAX_POLAR_DEG * Math.PI) / 180, minAzimuth_rad: -Infinity, maxAzimuth_rad: Infinity,
    minDist_m: MIN_ORBIT_M, maxDist_m: orbitMax_m, zoomToCursor: true, zoomSpeed: ZOOM_SPEED, leftPans: false,
  };
  switch (mode) {
    case 'orbit':
      return orbit;
    case 'top':
      return {
        ...orbit, rotate: false, minPolar_rad: TOP_POLAR_RAD, maxPolar_rad: TOP_POLAR_RAD, minAzimuth_rad: 0, maxAzimuth_rad: 0,
        maxDist_m: Math.max(orbitMax_m, topDist_m * HOME_ORBIT_SLACK), leftPans: true,
      };
    case 'chase':
      return { ...orbit, pan: false, minDist_m: CHASE_MIN_M, maxDist_m: CHASE_MAX_M, zoomToCursor: false };
    case 'target':
      return { ...orbit, enabled: false, rotate: false, pan: false, zoom: false, zoomToCursor: false };
  }
}

/**
 * Straight down on the box, north up, like the map: above the box's middle,
 * leaning TOP_POLAR_RAD to the south (so north is the top of the screen), and
 * as high as it must be for every corner of the box to sit within
 * 1 / HOME_MARGIN of the half-view at this canvas shape, never lower than
 * HOME_MIN_DIST_M above the middle.
 */
export function topDownPose(box: EnuBox, aspect: number): Pose {
  const look: Vec3 = [(box.min_e_m + box.max_e_m) / 2, (box.min_n_m + box.max_n_m) / 2, (box.min_up_m + box.max_up_m) / 2];
  const tanV = Math.tan((HOME_FOV / 2) * D2R), tanH = tanV * aspect;
  // A corner (e, n, u) from the middle is in view from a height H when its sideways and north offsets
  // fit the view at its own depth below the eye, H − u: so H ≥ u + margin × offset / tan(half view).
  let h = HOME_MIN_DIST_M;
  for (const e of [box.min_e_m - look[0], box.max_e_m - look[0]]) {
    for (const n of [box.min_n_m - look[1], box.max_n_m - look[1]]) {
      for (const u of [box.min_up_m - look[2], box.max_up_m - look[2]]) {
        h = Math.max(h, u + HOME_MARGIN * Math.max(Math.abs(e) / tanH, Math.abs(n) / tanV));
      }
    }
  }
  return { eye: [look[0], look[1] - h * Math.tan(TOP_POLAR_RAD), look[2] + h], look, fov_deg: HOME_FOV };
}

/** Below this horizontal speed a velocity has no direction worth trusting, m/s. */
const SLOW_MPS = 0.5;

/**
 * The chase camera's pose on entry: CHASE_BACK_M behind the jet along its
 * horizontal velocity (its heading when it barely moves), swung
 * CHASE_SWING_DEG behind its right shoulder, CHASE_UP_M above it, looking at
 * the jet. ENU in, ENU out.
 */
export function chasePose(jet: Vec3, vel: Vec3, heading_deg: number): Pose {
  let he = vel[0], hn = vel[1];
  const speed = Math.hypot(he, hn);
  if (speed < SLOW_MPS) {
    he = Math.sin(heading_deg * D2R);
    hn = Math.cos(heading_deg * D2R);
  } else {
    he /= speed;
    hn /= speed;
  }
  const back = rotate2([-he, -hn], CHASE_SWING_DEG * D2R);
  return {
    eye: [jet[0] + back[0] * CHASE_BACK_M, jet[1] + back[1] * CHASE_BACK_M, jet[2] + CHASE_UP_M],
    look: [jet[0], jet[1], jet[2]],
    fov_deg: HOME_FOV,
  };
}

/**
 * How far the horizontal velocity turned from `fromVel` to `toVel`, radians,
 * anticlockwise seen from above positive, in (−π, π]: the chase camera swings
 * round the jet by this much each frame, so it stays behind it through a turn.
 * 0 when either barely moves (its direction means nothing). ENU velocities.
 */
export function yawDelta(fromVel: Vec3, toVel: Vec3): number {
  if (Math.hypot(fromVel[0], fromVel[1]) < SLOW_MPS || Math.hypot(toVel[0], toVel[1]) < SLOW_MPS) return 0;
  let d = Math.atan2(toVel[1], toVel[0]) - Math.atan2(fromVel[1], fromVel[0]);
  if (d > Math.PI) d -= 2 * Math.PI;
  else if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * From target: the eye over the target, MIN_CAMERA_AGL_M above whichever is
 * higher, the planned target or the ground drawn under it (a target planned
 * below the drawn ground must not put the camera inside the hill). ENU.
 */
export function targetEye(target: Vec3, groundUp_m: number): Vec3 {
  return [target[0], target[1], Math.max(target[2], groundUp_m) + MIN_CAMERA_AGL_M];
}
