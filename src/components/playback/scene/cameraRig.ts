/**
 * The 3D playback's camera: one perspective camera (45°) driven by three's
 * OrbitControls, in one of four modes (cameraMath.ts holds their arithmetic,
 * where geo-check tests it):
 * - Orbit: drag to turn round the strike, right-drag to slide along the
 *   ground, wheel to zoom toward the point under the cursor. Home view is
 *   Orbit at the home pose (behind the lead's run-in, swung to its right,
 *   35° up, framing the attack).
 * - Top-down: straight down, north up, like the map; drag to slide, wheel to
 *   zoom toward the cursor.
 * - Chase: rides behind the watched jet, swung behind its right shoulder; it
 *   moves with the jet and swings round with it through turns, and the user
 *   can still drag to look round the jet and wheel closer or farther.
 * - From target: over the watched jet's target, looking up at the jet; the
 *   mouse does nothing until another mode is picked.
 * The motion eases out (damping) when let go. Changing mode is a cut, no
 * easing.
 *
 * Two rules on top of every mode:
 * - it never goes below the drawn ground (30 m above it, real or flat);
 * - its near plane follows its height above that ground, so close in the
 *   ground under a low camera does not flicker and far out the 30-60 km of
 *   terrain still sorts (instead of a logarithmic depth buffer), and it never
 *   cuts off the point looked at or anything the scene says must be seen.
 */
import { MOUSE, PerspectiveCamera, TOUCH, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  chasePose, controlsFor, enuToThree, maxOrbitFor, MAX_ORBIT_BOXES, MAX_POLAR_DEG, MIN_CAMERA_AGL_M, MIN_ORBIT_M, nearPlaneFor,
  targetEye, topDownPose, yawDelta, type CameraMode, type EnuBox, type Pose, type Vec3,
} from '../../../lib/playbackScene';

// The orbit limits are pure (cameraMath.ts, where geo-check tests them); re-exported for readers of this file.
export { MAX_ORBIT_BOXES, MAX_POLAR_DEG, MIN_ORBIT_M };

/**
 * What the camera follows, filled by the scene every frame from the watched
 * jet (three.js axes), made once and reused. The jet's pose is valid even
 * while it is hidden, so the camera keeps following it before its run-in.
 */
export interface Follow {
  /** The jet's position and velocity, m and m/s. */
  jet: Vector3;
  vel: Vector3;
  /** Its heading, degrees: the chase camera's direction when the jet barely moves. */
  heading_deg: number;
  /** Its target's planned point, and the drawn ground's height under it, m. */
  target: Vector3;
  targetGround: number;
}

const UP = new Vector3(0, 1, 0);
const distOf = (p: Pose) => Math.hypot(p.eye[0] - p.look[0], p.eye[1] - p.look[1], p.eye[2] - p.look[2]);

export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly homeFor: (aspect: number) => Pose;
  private readonly boxFor: () => EnuBox;
  private readonly halfDiag_m: number;
  private readonly farBeyond_m: number;
  private home: Pose;
  private modeNow: CameraMode = 'orbit';
  // Chase: where the jet was and which way it flew last frame (so the camera moves and swings with it).
  private chaseValid = false;
  private readonly jetPrev = new Vector3();
  private readonly velPrev: Vec3 = [0, 0, 0];
  private readonly velNow: Vec3 = [0, 0, 0];
  private readonly step = new Vector3();
  // From target: the target and ground the eye was last worked out for.
  private readonly eyeTarget = new Vector3(NaN, NaN, NaN);
  private eyeGround = NaN;

  /**
   * `homeFor` gives the home pose in the playback's ENU metres for a canvas
   * aspect (cameraMath's homePose on the attack's box), and `boxFor` that box
   * itself (Top-down frames it): both are asked again on every resize and
   * mode change, so the views always frame the attack in the window as it is
   * now. `halfDiag_m` is the terrain box's half-diagonal (it sets the
   * zoom-out limit); the far plane reaches `farBeyond_m` past that limit, so
   * everything drawn stays inside it from the farthest the camera can go.
   */
  constructor(canvas: HTMLCanvasElement, homeFor: (aspect: number) => Pose, boxFor: () => EnuBox, aspect: number, halfDiag_m: number, farBeyond_m: number) {
    this.homeFor = homeFor;
    this.boxFor = boxFor;
    this.halfDiag_m = halfDiag_m;
    this.farBeyond_m = farBeyond_m;
    this.home = homeFor(aspect);
    this.camera = new PerspectiveCamera(this.home.fov_deg, aspect, 1, 2);
    this.controls = new OrbitControls(this.camera, canvas);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.1;
    c.screenSpacePanning = false; // pan slides along the ground, not up the screen
    this.goHome();
  }

  get mode(): CameraMode {
    return this.modeNow;
  }

  /**
   * The current mode's limits on the controls, and the far plane that follows
   * them. Run on a mode change, a resize, or a new home box; never per frame
   * (controlsFor makes a new object). Returns the top-down pose in Top-down.
   */
  private applyMode(): Pose | undefined {
    const cam = this.camera, c = this.controls;
    this.home = this.homeFor(cam.aspect);
    // The orbit zoom-out limit, never inside the home view (or the controls would pull the camera in on the next update).
    const orbitMax = maxOrbitFor(this.home, this.halfDiag_m);
    const top = this.modeNow === 'top' ? topDownPose(this.boxFor(), cam.aspect) : undefined;
    const cfg = controlsFor(this.modeNow, orbitMax, top ? distOf(top) : 0);
    c.enabled = cfg.enabled;
    c.enableRotate = cfg.rotate;
    c.enablePan = cfg.pan;
    c.enableZoom = cfg.zoom;
    c.minPolarAngle = cfg.minPolar_rad;
    c.maxPolarAngle = cfg.maxPolar_rad;
    c.minAzimuthAngle = cfg.minAzimuth_rad;
    c.maxAzimuthAngle = cfg.maxAzimuth_rad;
    c.minDistance = cfg.minDist_m;
    c.maxDistance = cfg.maxDist_m;
    c.zoomToCursor = cfg.zoomToCursor;
    c.zoomSpeed = cfg.zoomSpeed;
    // Without this a plain drag in Top-down would try to turn a view that cannot turn, and do nothing.
    c.mouseButtons.LEFT = cfg.leftPans ? MOUSE.PAN : MOUSE.ROTATE;
    c.touches.ONE = cfg.leftPans ? TOUCH.PAN : TOUCH.ROTATE;
    cam.far = Math.max(cfg.maxDist_m, orbitMax) + this.farBeyond_m;
    cam.updateProjectionMatrix();
    return top;
  }

  /** The camera at a pose (ENU): eye, the point the controls turn round, field of view. */
  private place(p: Pose): void {
    const [ex, ey, ez] = enuToThree(p.eye);
    const [lx, ly, lz] = enuToThree(p.look);
    this.camera.fov = p.fov_deg;
    this.camera.position.set(ex, ey, ez);
    this.controls.target.set(lx, ly, lz);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Whatever the controls were still easing out (a drag let go just before
   * the mode changed) is finished at once, before the camera moves: left
   * alone, it would drift the new view. Not from From target, where the
   * controls are off and their point is stale.
   */
  private settleControls(): void {
    if (this.modeNow === 'target') return;
    const c = this.controls;
    c.enableDamping = false;
    c.update();
    c.enableDamping = true;
  }

  /** Back to the home pose in Orbit, at once, framed for the window as it is now. */
  goHome(): void {
    this.settleControls();
    this.modeNow = 'orbit';
    this.chaseValid = false;
    this.applyMode();
    this.place(this.home);
    this.controls.update();
  }

  /**
   * Change mode, a cut. `follow` is the watched jet now (also when the watched
   * jet changes: Chase and From target start again on the new one).
   * - Orbit from Chase or From target turns round the point it was looking at (the jet); from Top-down it turns where it is.
   * - Top-down goes straight above the attack's box.
   * - Chase starts behind the jet's right shoulder.
   * - From target goes over the target.
   */
  setMode(mode: CameraMode, follow: Follow): void {
    const from = this.modeNow;
    this.settleControls();
    this.modeNow = mode;
    this.chaseValid = false;
    const top = this.applyMode();
    const c = this.controls;
    switch (mode) {
      case 'orbit':
        if (from === 'chase' || from === 'target') c.target.copy(follow.jet);
        c.update();
        break;
      case 'top':
        if (top) this.place(top);
        c.update();
        break;
      case 'chase':
        this.enterChase(follow);
        break;
      case 'target':
        this.eyeTarget.set(NaN, NaN, NaN); // worked out afresh on the next update, and now
        this.placeTarget(follow);
        this.jetPrev.copy(follow.jet);
        break;
    }
  }

  private enterChase(follow: Follow): void {
    const p = chasePose([follow.jet.x, -follow.jet.z, follow.jet.y], [follow.vel.x, -follow.vel.z, follow.vel.y], follow.heading_deg);
    this.place(p);
    this.controls.update();
    this.jetPrev.copy(follow.jet);
    this.velPrev[0] = follow.vel.x;
    this.velPrev[1] = -follow.vel.z;
    this.velPrev[2] = follow.vel.y;
    this.chaseValid = true;
  }

  /** From target: the eye over the target (worked out again only when the target or the ground under it changed), aimed at the jet. */
  private placeTarget(follow: Follow): boolean {
    let moved = false;
    if (!this.eyeTarget.equals(follow.target) || this.eyeGround !== follow.targetGround) {
      const [e, n, u] = targetEye([follow.target.x, -follow.target.z, follow.target.y], follow.targetGround);
      this.camera.position.set(e, u, -n);
      this.eyeTarget.copy(follow.target);
      this.eyeGround = follow.targetGround;
      moved = true;
    }
    this.camera.lookAt(follow.jet);
    return moved;
  }

  /** The canvas changed shape: the current mode's limits again (and in Top-down, the pose for the new shape). */
  resize(aspect: number): void {
    this.camera.aspect = aspect;
    const top = this.applyMode();
    if (this.modeNow === 'top' && top) {
      this.place(top);
      this.controls.update();
    }
  }

  /** The attack's box changed (the clock's range moved): the limits again. The camera stays where it is. */
  refresh(): void {
    this.applyMode();
  }

  /**
   * Once per rendered frame, after the jets have moved: follows the jet in
   * Chase and From target, eases the controls, keeps the camera above the
   * drawn ground, and sets the near plane. True while the camera is still
   * moving (the loop keeps rendering until it settles). `nearestTo(p)` is the
   * distance from p to the nearest thing the near plane must never cut off
   * (the arrows, the falling bombs).
   */
  update(heightAt: (x: number, z: number) => number, nearestTo: (p: Vector3) => number, follow: Follow): boolean {
    const cam = this.camera, c = this.controls;
    let moved = false;
    if (this.modeNow === 'target') {
      if (this.placeTarget(follow)) moved = true;
      if (!this.jetPrev.equals(follow.jet)) {
        this.jetPrev.copy(follow.jet);
        moved = true;
      }
    } else {
      if (this.modeNow === 'chase') {
        if (!this.chaseValid) {
          this.enterChase(follow);
          moved = true;
        } else {
          // Carried along with the jet, then swung round it by as much as it turned.
          this.step.subVectors(follow.jet, this.jetPrev);
          if (this.step.lengthSq() > 0) {
            cam.position.add(this.step);
            moved = true;
          }
          this.velNow[0] = follow.vel.x;
          this.velNow[1] = -follow.vel.z;
          this.velNow[2] = follow.vel.y;
          const yaw = yawDelta(this.velPrev, this.velNow);
          if (yaw !== 0) {
            this.step.subVectors(cam.position, follow.jet).applyAxisAngle(UP, yaw); // anticlockwise seen from above, as yawDelta counts
            cam.position.copy(follow.jet).add(this.step);
            moved = true;
          }
          c.target.copy(follow.jet);
          this.jetPrev.copy(follow.jet);
          this.velPrev[0] = this.velNow[0];
          this.velPrev[1] = this.velNow[1];
          this.velPrev[2] = this.velNow[2];
        }
      }
      if (c.update()) moved = true;
    }

    const ground = heightAt(cam.position.x, cam.position.z);
    const floor = ground + MIN_CAMERA_AGL_M;
    if (cam.position.y < floor) {
      cam.position.y = floor;
      cam.lookAt(this.modeNow === 'target' ? follow.jet : c.target); // in Chase the controls' point is the jet itself
      moved = true;
    }
    // In From target the controls' point is left over from the last mode: only the jet and its bomb count.
    let nearest = nearestTo(cam.position);
    if (this.modeNow !== 'target') nearest = Math.min(nearest, cam.position.distanceTo(c.target));
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
