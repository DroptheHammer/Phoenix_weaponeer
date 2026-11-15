/**
 * The Chase camera watching the watched jet's bomb land, as plain numbers: no three.js, no DOM.
 *
 * From the release Chase turns its look from the jet to the falling bomb, follows it down, stays on the
 * burst a while after it lands, and turns back to the jet. Chase moves its eye with the jet as before;
 * only where it looks changes. From target is left looking at the jet: there the bomb falls onto the
 * eye, so turning to it would only sweep the view straight down in the last moment.
 *
 * How far the look is turned is a pure function of the clock's time and its speed setting, as the
 * callouts and the flash are: no easing is kept from one frame to the next, so a seek away and back,
 * a re-timed strike, a change of camera or of watched jet and a rebuilt scene all show the look the
 * clock's time gives, and at 16× the turns are as quick to the eye as at 1×.
 *
 * Positions are three.js axes (x east, y up, z = −north), metres.
 */

/** The look turns from the jet to the bomb over this many real seconds from the release, */
export const AIM_IN_WALL_S = 0.4;
/** stays on the landing this long (real seconds) after the impact, so the burst is seen, */
export const AIM_HOLD_WALL_S = 2.5;
/** and turns back to the jet over this long: slower than the turn in, as it is a bigger turn and nothing is missed by it. */
export const AIM_OUT_WALL_S = 1.0;
/** The look never points more than this far below the horizon: straight down its heading would mean nothing and the picture could flip. */
export const AIM_MAX_DOWN_DEG = 80;

/** A point or a direction, three.js axes. */
export interface Look3 {
  x: number;
  y: number;
  z: number;
}

const D2R = Math.PI / 180;

/** 0 below 0, 1 above 1, and an S between: it starts and ends without a jolt. */
const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * How far Chase's look is turned from the jet toward the bomb, 0…1, at strike time `t_s` for a bomb
 * released at `release_s` that lands at `impact_s`: 0 before the release; rising over AIM_IN_WALL_S real
 * seconds to 1; 1 until AIM_HOLD_WALL_S real seconds after the impact; back to 0 over AIM_OUT_WALL_S. Real
 * seconds are strike seconds ÷ the speed setting (playing or paused alike), so the turns last as long to
 * the eye at 16× as at 1×. A speed of 0, below 0 or not a number is taken as 1; a time that is not a
 * finite number gives 0. Never NaN. Stateless.
 */
export function aimWeight(t_s: number, release_s: number, impact_s: number, speed: number): number {
  if (!Number.isFinite(t_s) || !Number.isFinite(release_s) || !Number.isFinite(impact_s)) return 0;
  const s = speed > 0 && speed < Infinity ? speed : 1;
  const into = smoothstep((t_s - release_s) / s / AIM_IN_WALL_S);
  const back = smoothstep((t_s - (impact_s + AIM_HOLD_WALL_S * s)) / s / AIM_OUT_WALL_S);
  return into * (1 - back);
}

/**
 * The direction (a unit vector) from `eye` to look along: the direction to the jet turned toward the
 * direction to `aim` by `w` of the angle between them (a spherical blend, so the look turns at the
 * weight's own pace: blending the points, or the directions in a straight line, would sweep most of a
 * big turn into the last few per cent of the weight). With no defined turn (the two directions the same,
 * or opposite) it is the jet's direction. Then, if it points more than AIM_MAX_DOWN_DEG below the
 * horizon, it is raised to that, keeping its heading (the jet's heading when it points straight down).
 * `w` is held to 0…1 (not a number counts as 0). Written into `out` and handed back: nothing is allocated.
 */
export function lookDirection(eye: Look3, jet: Look3, aim: Look3, w: number, out: Look3): Look3 {
  let ax = jet.x - eye.x, ay = jet.y - eye.y, az = jet.z - eye.z;
  const al = Math.hypot(ax, ay, az);
  if (al > 0) {
    ax /= al;
    ay /= al;
    az /= al;
  } else {
    // The eye on the jet: no direction to it. North, level, so the answer is still a direction.
    ax = 0;
    ay = 0;
    az = -1;
  }
  let dx = ax, dy = ay, dz = az;
  const k = w > 0 ? (w < 1 ? w : 1) : 0;
  const bl = Math.hypot(aim.x - eye.x, aim.y - eye.y, aim.z - eye.z);
  if (k > 0 && bl > 0) {
    const bx = (aim.x - eye.x) / bl, by = (aim.y - eye.y) / bl, bz = (aim.z - eye.z) / bl;
    const c = ax * bx + ay * by + az * bz;
    const th = Math.acos(c > 1 ? 1 : c < -1 ? -1 : c);
    if (th > 1e-6 && th < Math.PI - 1e-6) {
      const s = Math.sin(th);
      const p = Math.sin((1 - k) * th) / s, q = Math.sin(k * th) / s;
      dx = p * ax + q * bx;
      dy = p * ay + q * by;
      dz = p * az + q * bz;
    }
  }
  const lowest = -Math.sin(AIM_MAX_DOWN_DEG * D2R);
  if (dy < lowest) {
    let hx = dx, hz = dz, hl = Math.hypot(hx, hz);
    if (!(hl > 1e-12)) {
      hx = ax;
      hz = az;
      hl = Math.hypot(hx, hz);
    }
    if (!(hl > 1e-12)) {
      hx = 0;
      hz = -1;
      hl = 1;
    }
    const across = Math.cos(AIM_MAX_DOWN_DEG * D2R) / hl;
    dx = hx * across;
    dy = lowest;
    dz = hz * across;
  }
  out.x = dx;
  out.y = dy;
  out.z = dz;
  return out;
}
