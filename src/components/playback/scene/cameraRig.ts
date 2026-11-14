/**
 * The 3D playback's camera, spike version: one perspective camera (45°)
 * driven by three's OrbitControls. It starts at the home pose (behind the
 * lead's run-in, swung to its right, 35° up, framing the whole strike), and
 * the user drags to orbit, right-drags to pan along the ground, and wheels
 * to zoom; the motion eases out (damping) when let go.
 *
 * Two rules on top of the controls:
 * - it never goes below the drawn ground (30 m above it, real or flat);
 * - its near plane follows its height above that ground, so close in the
 *   ground under a low camera does not flicker and far out the 30-60 km of
 *   terrain still sorts (instead of a logarithmic depth buffer).
 *
 * The other cameras (chase, top-down, side-on, from the target) come later,
 * as more pure poses for this one camera.
 */
import { MathUtils, PerspectiveCamera, type Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  enuToThree, maxOrbitFor, MAX_ORBIT_BOXES, MIN_CAMERA_AGL_M, MIN_ORBIT_M, nearPlaneFor, type Pose,
} from '../../../lib/playbackScene';

// The orbit limits are pure (cameraMath.ts, where geo-check tests them); re-exported for readers of this file.
export { MAX_ORBIT_BOXES, MIN_ORBIT_M };
/** Never flatter than this from straight down, degrees: just short of the horizon, so the view never looks up from under the ground. */
export const MAX_POLAR_DEG = 87;

export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly homeFor: (aspect: number) => Pose;
  private readonly halfDiag_m: number;
  private readonly farBeyond_m: number;
  private home: Pose;

  /**
   * `homeFor` gives the home pose in the playback's ENU metres for a canvas
   * aspect (cameraMath's homePose): it is asked again on every resize, so
   * Home view always frames the strike in the window as it is now.
   * `halfDiag_m` is the terrain box's half-diagonal (it sets the zoom-out
   * limit); the far plane reaches `farBeyond_m` past that limit, so
   * everything drawn stays inside it from the farthest the camera can go.
   */
  constructor(canvas: HTMLCanvasElement, homeFor: (aspect: number) => Pose, aspect: number, halfDiag_m: number, farBeyond_m: number) {
    this.homeFor = homeFor;
    this.halfDiag_m = halfDiag_m;
    this.farBeyond_m = farBeyond_m;
    this.home = homeFor(aspect);
    this.camera = new PerspectiveCamera(this.home.fov_deg, aspect, 1, 2);
    this.controls = new OrbitControls(this.camera, canvas);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.1;
    c.screenSpacePanning = false; // pan slides along the ground, not up the screen
    c.maxPolarAngle = MathUtils.degToRad(MAX_POLAR_DEG);
    c.minDistance = MIN_ORBIT_M;
    this.applyLimits();
    this.goHome();
  }

  /**
   * The home pose for the current aspect, the zoom-out limit (never inside
   * the home view, or the controls would pull the camera in on the next
   * update) and the far plane that follows it.
   */
  private applyLimits(): void {
    this.home = this.homeFor(this.camera.aspect);
    const max = maxOrbitFor(this.home, this.halfDiag_m);
    this.controls.maxDistance = max;
    this.camera.far = max + this.farBeyond_m;
    this.camera.updateProjectionMatrix();
  }

  /** Back to the home pose, at once, framed for the window as it is now. */
  goHome(): void {
    this.applyLimits();
    const [ex, ey, ez] = enuToThree(this.home.eye);
    const [lx, ly, lz] = enuToThree(this.home.look);
    this.camera.fov = this.home.fov_deg;
    this.camera.position.set(ex, ey, ez);
    this.controls.target.set(lx, ly, lz);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.applyLimits();
  }

  /**
   * Once per rendered frame: eases the controls, keeps the camera above the
   * drawn ground, and sets the near plane. True while the camera is still
   * moving (the loop keeps rendering until it settles). `keep` and `keep2`
   * (the jet, its bomb) are things the near plane must never cut off, along
   * with the point the camera orbits.
   */
  update(heightAt: (x: number, z: number) => number, keep?: Vector3, keep2?: Vector3): boolean {
    const cam = this.camera;
    let moved = this.controls.update();
    const ground = heightAt(cam.position.x, cam.position.z);
    const floor = ground + MIN_CAMERA_AGL_M;
    if (cam.position.y < floor) {
      cam.position.y = floor;
      cam.lookAt(this.controls.target);
      moved = true;
    }
    let nearest = cam.position.distanceTo(this.controls.target);
    if (keep) nearest = Math.min(nearest, cam.position.distanceTo(keep));
    if (keep2) nearest = Math.min(nearest, cam.position.distanceTo(keep2));
    const near = nearPlaneFor(cam.position.y - ground, nearest);
    if (Math.abs(near - cam.near) > cam.near * 0.1) {
      cam.near = near;
      cam.updateProjectionMatrix();
      moved = true;
    }
    return moved;
  }

  dispose(): void {
    this.controls.dispose();
  }
}
