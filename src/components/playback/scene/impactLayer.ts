/**
 * What happens where one jet's bomb lands, at its time over target (the scene makes one of these per flown
 * jet, beside its jet layer): a flash, a marker for the moment and the place, and, where the weapon table has a
 * blast radius for the weapon, a ring on the ground at that radius. It is not a simulation of the weapon: the
 * flash is no weapon's size, and the ring is the table's figure, an estimate.
 *
 * - The flash is a bright disc that always faces the camera and keeps a set size on screen (FLASH_R_PX at
 *   full size), so it reads from far off: a cream core fading to amber at its rim, on a darker disc of the
 *   window's dark under it, so the pale core still reads on pale land. It is drawn over everything in the
 *   3D picture (no depth test), as the planner's markers are.
 * - It sits just over the higher of the planned target and the drawn ground: a target planned under the
 *   ground would otherwise burst inside the hill.
 * - The ring is the weapon's blast radius, true size and never larger, laid on the drawn ground round the
 *   target: where a sphere of that radius round a burst on the ground meets the ground. It grows to its radius,
 *   holds and fades as impactPhase says. A ring too small on screen to read as one (impactFx.ringFade) is not
 *   drawn: it fades by thinning its line and its casing together (a see-through wide line shows a bead at every
 *   joint), so a far camera sees the flash and the words only. A weapon with no blast radius has no ring.
 * - It hands the label layer what the words beside the burst need (`tag`): whether they show, whether the ring
 *   is drawn large enough for its radius to be named, how strong they are and where the burst is.
 * - When it shows is worked out from the clock's time and its speed setting alone (impactPhase, in real
 *   seconds, as the callouts are), never from what was drawn on the frame before: a seek away and back, a
 *   re-timed strike and a rebuilt scene all give the same picture, and at 16× it lasts as long to the eye
 *   as at 1×. Its meshes are hidden, never removed, when it does not show.
 * - Show › Impact off hides all of it.
 */
import { Color, Group, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import {
  BG, FLASH_CORE, FLASH_R_PX, FLASH_RIM, FLASH_SCORCH, FLASH_SCORCH_ALPHA, IMPACT_LIFT_M, IMPACT_RING, IMPACT_RING_CASING_PX, IMPACT_RING_PX,
  IMPACT_RING_SEGS, LINE_CASING, impactPhase, newImpactPhase, ringFade, ringPixels, worldPerPixel, type SceneImpactInfo, type SceneSource,
} from '../../../lib/playbackScene';
import type { DisposeBag } from './disposeBag';
import { flashGeometry } from './jetGeometry';
import { capacityGeometry, finish, putSegment, wideLine } from './jetLayer';
import type { FrameCtx, Layer } from './layer';

/**
 * Draw order: the ring's casing, then the ring, then the flash's dark disc and its core, all after every line, post,
 * ring, bomb and arrow of the jets and the targets, so nothing in 3D covers them.
 */
const ORDER = { ringCasing: 83, ring: 84, scorch: 85, core: 86 } as const;
/** A ring line thinner than this, px, is hidden rather than drawn as a faint bead-strewn thread. */
const RING_MIN_LINE_PX = 0.3;
/** The ring's corners round a unit circle, made once for every layer. */
const RING_COS = new Float64Array(IMPACT_RING_SEGS + 1);
const RING_SIN = new Float64Array(IMPACT_RING_SEGS + 1);
for (let k = 0; k <= IMPACT_RING_SEGS; k++) {
  RING_COS[k] = Math.cos((2 * Math.PI * k) / IMPACT_RING_SEGS);
  RING_SIN[k] = Math.sin((2 * Math.PI * k) / IMPACT_RING_SEGS);
}
/** The ring's line takes its colour from its material, so its segments carry none. */
const NO_RGB = new Float32Array(3);

/** What the words beside a burst need from its layer, written every frame (the layer's own object: read, never kept or written). */
export interface ImpactTag {
  /** The words show: Show › Impact is on and the ring's time has not run out (they show with or without a ring). */
  shown: boolean;
  /** The ring is drawn at half strength or more, so its radius is named: the weapon has one and it is at least 5 px on screen. */
  withRadius: boolean;
  /** How strong the words are: the ring's strength (impactPhase), whether or not a ring is drawn. */
  alpha: number;
  /** Where the burst is, three.js axes. */
  readonly centre: Vector3;
}

/** The effect at one jet's impact as the layer used it on the last frame drawn (for the screenshot checks). */
export interface ImpactDebug {
  /** Strike seconds since the impact (negative before it). */
  age_s: number;
  /** The phase the layer drew with (impactPhase): the flash's size and strength, the ring's radius share and strength. */
  flash: number;
  flashAlpha: number;
  ring: number;
  ringAlpha: number;
  /** Whether the flash's meshes were drawn. */
  flashShown: boolean;
  /** Whether the ring's meshes were drawn. */
  ringShown: boolean;
  /** The weapon's blast radius, the ring's full radius, m (0 for a weapon with none). */
  ringRadius_m: number;
  /** That full radius on screen where the ring lies, CSS px (0 when the ring was not worked out: no radius, or nothing of the impact shown). */
  ringPx: number;
  /** How strongly the ring is drawn for that size (impactFx.ringFade), before its strength in time. */
  ringFade: number;
  /** The radius the drawn ring's geometry was laid at, m (0 while the ring is not drawn): what the picture shows, not what was asked. */
  laidRadius_m: number;
  /** Where the burst is, three.js axes. */
  centre: { x: number; y: number; z: number };
}

export interface ImpactLayer extends Layer {
  /** The playback index of the jet whose bomb this is. */
  readonly jet: number;
  /** Its weapon as the picture needs it (the source's, for the source shown now). */
  readonly info: SceneImpactInfo;
  /** What the words beside the burst need, as of the last frame. */
  readonly tag: ImpactTag;
  /**
   * Where the burst is now (three.js axes; the layer's own object, read, never kept or written), for as long as the
   * flash or the ring's time lasts with Show › Impact on (a weapon with no radius: the flash's); otherwise undefined.
   */
  burstPosition(): Vector3 | undefined;
  /** What the layer drew on the last frame. Allocates, so only for the checks. */
  debug(): ImpactDebug;
}

export function createImpactLayer(o: { source: SceneSource; jet: number; parent: Object3D; bag: DisposeBag }): ImpactLayer {
  const { bag, jet } = o;
  let src = o.source;
  let info = src.impactInfo(jet);

  // The colours as linear values (three's working space), with an alpha per vertex: the core fades out toward its rim.
  const rgba = (hex: string, a: number): [number, number, number, number] => {
    const c = new Color(hex);
    return [c.r, c.g, c.b, a];
  };
  const coreMat = bag.add(new MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  const scorchMat = bag.add(new MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  const core = new Mesh(bag.add(flashGeometry(rgba(FLASH_CORE, 1), rgba(FLASH_RIM, 0))), coreMat);
  const scorch = new Mesh(bag.add(flashGeometry(rgba(BG, 1), rgba(BG, 1))), scorchMat);
  scorch.scale.setScalar(FLASH_SCORCH);
  core.renderOrder = ORDER.core;
  scorch.renderOrder = ORDER.scorch;
  core.frustumCulled = scorch.frustumCulled = false;

  // The flash: placed on the burst, turned to face the camera and sized on screen after the camera has moved.
  const flash = new Group();
  flash.add(scorch, core);
  flash.visible = false;

  // The ring: one closed loop of wide-line pieces, made once and laid again in place only when its radius, the
  // ground or the source changes; a cream line over a dark casing, the two meshes sharing the one geometry.
  const ring = capacityGeometry(bag, IMPACT_RING_SEGS, false, false);
  const ringFillMat = bag.add(wideLine(new Color(IMPACT_RING), IMPACT_RING_PX));
  const ringCasingMat = bag.add(wideLine(new Color(LINE_CASING), IMPACT_RING_CASING_PX));
  // Drawn over the 3D, as the flash is: the target's own red ring lies on the same ground a little in front of it (and
  // is about this size when the ring is close enough to read), so a depth-tested ring would vanish under it.
  ringFillMat.depthTest = ringCasingMat.depthTest = false;
  const ringCasing = new LineSegments2(ring.geom, ringCasingMat);
  const ringFill = new LineSegments2(ring.geom, ringFillMat);
  ringCasing.renderOrder = ORDER.ringCasing;
  ringFill.renderOrder = ORDER.ring;
  ringCasing.frustumCulled = ringFill.frustumCulled = false;
  ringCasing.visible = ringFill.visible = false;

  // Everything this layer draws, hidden as one by Show › Impact.
  const group = new Group();
  group.add(ringCasing, ringFill, flash);
  group.visible = false;
  o.parent.add(group);

  // Made once: no frame allocates.
  const phase = newImpactPhase();
  const centre = new Vector3();
  const tag: ImpactTag = { shown: false, withRadius: false, alpha: 0, centre };
  let age = NaN;
  /** The ring may show this frame by its time and its weapon; whether it is big enough on screen is known only after the camera. */
  let ringOn = false;
  let ringPx = 0, fade = 0;
  /** What the ring was last laid for: its radius, the ground and the source. */
  let laidR = NaN, laidGround = -1;
  let laidSrc: SceneSource | undefined;

  function takeSource(next: SceneSource) {
    src = next;
    info = next.impactInfo(jet);
    laidSrc = undefined;
  }

  /** The ring round the target at radius `r_m`, each corner on the drawn ground just above it. */
  function layRing(r_m: number, ctx: FrameCtx) {
    const tg = src.targetOf(jet);
    ring.n = 0;
    let px = tg.x + r_m, pz = tg.z, py = ctx.heightAt(px, pz) + IMPACT_LIFT_M;
    for (let k = 1; k <= IMPACT_RING_SEGS; k++) {
      const x = tg.x + r_m * RING_COS[k], z = tg.z + r_m * RING_SIN[k], y = ctx.heightAt(x, z) + IMPACT_LIFT_M;
      putSegment(ring, px, py, pz, x, y, z, NO_RGB, 0, 0, 0);
      px = x;
      py = y;
      pz = z;
    }
    finish(ring);
    laidR = r_m;
    laidGround = ctx.groundVersion;
    laidSrc = src;
  }

  return {
    jet,
    get info() {
      return info;
    },
    tag,

    update(ctx: FrameCtx) {
      if (ctx.source !== src) takeSource(ctx.source);
      const impactT = src.impactOf(jet);
      age = ctx.t - impactT;
      impactPhase(ctx.t - impactT, ctx.speed, phase);
      const tg = src.targetOf(jet);
      centre.set(tg.x, Math.max(tg.y, ctx.heightAt(tg.x, tg.z)) + IMPACT_LIFT_M, tg.z);
      flash.visible = phase.flashAlpha > 0 && phase.flash > 0;
      ringOn = info.ringRadius_m !== null && phase.ringAlpha > 0 && phase.ring > 0;
      group.visible = ctx.impact && (flash.visible || ringOn);
      coreMat.opacity = phase.flashAlpha;
      scorchMat.opacity = FLASH_SCORCH_ALPHA * phase.flashAlpha;
      // The words show for as long as the ring would, ring or no ring: a weapon with no radius still has its impact named.
      tag.shown = ctx.impact && phase.ringAlpha > 0;
      tag.alpha = phase.ringAlpha;
      tag.withRadius = false;
    },

    afterCamera(ctx: FrameCtx) {
      ringPx = 0;
      fade = 0;
      if (!group.visible) {
        ringCasing.visible = ringFill.visible = false;
        return;
      }
      const wpp = worldPerPixel(ctx.camera.position.distanceTo(centre), ctx.camera.fov, ctx.viewH);
      if (flash.visible) {
        flash.position.copy(centre);
        flash.quaternion.copy(ctx.camera.quaternion);
        flash.scale.setScalar(FLASH_R_PX * phase.flash * wpp);
      }
      // The ring's full radius on screen decides how strongly it is drawn, so its growth never moves the fade.
      const radius_m = info.ringRadius_m;
      if (radius_m !== null) {
        ringPx = ringPixels(radius_m, wpp);
        fade = ringFade(ringPx);
        tag.withRadius = fade >= 0.5;
      }
      const k = ringOn ? phase.ringAlpha * fade : 0;
      ringFillMat.linewidth = IMPACT_RING_PX * k;
      ringCasingMat.linewidth = IMPACT_RING_CASING_PX * k;
      ringFill.visible = IMPACT_RING_PX * k >= RING_MIN_LINE_PX;
      ringCasing.visible = IMPACT_RING_CASING_PX * k >= RING_MIN_LINE_PX;
      if (radius_m !== null && (ringFill.visible || ringCasing.visible)) {
        const r = phase.ring * radius_m;
        if (r !== laidR || ctx.groundVersion !== laidGround || src !== laidSrc) layRing(r, ctx);
      }
    },

    setSource(next) {
      if (next !== src) takeSource(next);
    },

    burstPosition: () => (group.visible ? centre : undefined),

    debug: () => ({
      age_s: age,
      flash: phase.flash,
      flashAlpha: phase.flashAlpha,
      ring: phase.ring,
      ringAlpha: phase.ringAlpha,
      flashShown: group.visible && flash.visible,
      ringShown: group.visible && (ringFill.visible || ringCasing.visible),
      ringRadius_m: info.ringRadius_m ?? 0,
      ringPx,
      ringFade: fade,
      laidRadius_m: group.visible && (ringFill.visible || ringCasing.visible) ? laidR : 0,
      centre: { x: centre.x, y: centre.y, z: centre.z },
    }),

    dispose() {
      o.parent.remove(group);
    },
  };
}
