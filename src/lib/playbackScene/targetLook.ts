/**
 * From target's look, as plain numbers: no three.js, no DOM.
 *
 * From target sits over the watched jet's target and looks up at the jet. A level attack's egress runs
 * straight on, over the target, so the jet often passes over the eye itself. Looked at plainly, the
 * direction to the jet then swings round the sky in an instant: the picture spins by up to half a turn
 * in one frame (the camera keeps the sky up, so a look that goes over the top turns the whole picture
 * round). Holding the look under a limit alone does not stop that: the swing is in the look's heading,
 * not in how high it points.
 *
 * So while the jet is higher than the limit, the look stays at the limit and its heading turns round
 * smoothly from the jet's side of the sky to the other, through one side of the jet's track (the one
 * the jet passes on, the right on a pass straight over the eye), as the jet crosses the patch of sky
 * above the limit. The picture still has to turn half round on such a pass, but it does so over the
 * whole crossing instead of in one frame, and the jet stays in the picture: the look is never more than
 * about 10° from it (straight overhead), well inside the half of the 45° field of view.
 *
 * Positions are three.js axes (x east, y up, z = −north), metres; headings are compass degrees.
 */
import type { Look3 } from './bombCam';

/** From target never looks higher than this above the horizon: straight up, its heading would mean nothing and the picture would spin. */
export const TARGET_MAX_UP_DEG = 80;

const D2R = Math.PI / 180;

/**
 * The direction (a unit vector, written into `out`) From target looks along from `eye` toward `jet`, a jet
 * flying on `heading_deg`, never more than `maxUp_deg` above the horizon.
 *
 * At or under the limit it is the plain direction to the jet. Above it, the look is at the limit, and its
 * heading is the jet's heading as seen from the eye pushed sideways across the jet's track, by the more the
 * nearer the jet is to straight overhead (nothing at the limit's edge, so the look moves on smoothly as the
 * jet comes in under it). Which side it is pushed to is `side` (+1 the right of the track, −1 the left): the
 * caller hands back what the last frame returned, so the turn keeps to one side for the whole crossing even
 * if the jet's track wavers over the eye; with 0 the side the jet is on is taken (the right when it is
 * exactly over the eye). Returns the side used, 0 while the look is not limited.
 *
 * Nothing is allocated. Never NaN for finite inputs; the eye on the jet looks level along the heading.
 */
export function targetLook(eye: Look3, jet: Look3, heading_deg: number, maxUp_deg: number, side: number, out: Look3): number {
  const dx = jet.x - eye.x, dy = jet.y - eye.y, dz = jet.z - eye.z;
  const across = Math.hypot(dx, dz);
  const up = Math.sin(maxUp_deg * D2R), level = Math.cos(maxUp_deg * D2R);
  // Under the limit (or below the eye): the plain look at the jet.
  if (!(dy > 0) || dy * level <= across * up) {
    const l = Math.hypot(dx, dy, dz);
    if (l > 0) {
      out.x = dx / l;
      out.y = dy / l;
      out.z = dz / l;
    } else {
      out.x = Math.sin(heading_deg * D2R);
      out.y = 0;
      out.z = -Math.cos(heading_deg * D2R);
    }
    return 0;
  }
  // The radius, across the ground, of the patch of sky above the limit at the jet's height.
  const edge = (dy * level) / up;
  // The right of the jet's track, three.js axes.
  const rx = Math.cos(heading_deg * D2R), rz = Math.sin(heading_deg * D2R);
  const s = side > 0 ? 1 : side < 0 ? -1 : dx * rx + dz * rz < 0 ? -1 : 1;
  const push = (edge - across) * s;
  let hx = dx + push * rx, hz = dz + push * rz;
  let hl = Math.hypot(hx, hz);
  if (!(hl > 1e-9 * edge) || !(hl > 0)) {
    // Only when the side was held and the jet has since drifted the other way by just this much: look across the track.
    hx = s * rx;
    hz = s * rz;
    hl = 1;
  }
  out.x = (hx / hl) * level;
  out.y = up;
  out.z = (hz / hl) * level;
  return s;
}
