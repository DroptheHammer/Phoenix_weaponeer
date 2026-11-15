/**
 * What happens where one jet's bomb lands, at its time over target (the scene makes one of these per flown
 * jet, beside its jet layer): a flash, a marker for the moment and the place. It is not a simulation of the
 * weapon, and no weapon number sizes it.
 *
 * - The flash is a bright disc that always faces the camera and keeps a set size on screen (FLASH_R_PX at
 *   full size), so it reads from far off: a cream core fading to amber at its rim, on a darker disc of the
 *   window's dark under it, so the pale core still reads on pale land. It is drawn over everything in the
 *   3D picture (no depth test), as the planner's markers are.
 * - It sits just over the higher of the planned target and the drawn ground: a target planned under the
 *   ground would otherwise burst inside the hill.
 * - When it shows is worked out from the clock's time and its speed setting alone (impactPhase, in real
 *   seconds, as the callouts are), never from what was drawn on the frame before: a seek away and back, a
 *   re-timed strike and a rebuilt scene all give the same picture, and at 16× it lasts as long to the eye
 *   as at 1×. Its meshes are hidden, never removed, when it does not show.
 * - Show › Impact off hides it.
 */
import { Color, Group, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import {
  BG, FLASH_CORE, FLASH_R_PX, FLASH_RIM, FLASH_SCORCH, FLASH_SCORCH_ALPHA, IMPACT_LIFT_M, impactPhase, newImpactPhase, worldPerPixel,
  type SceneSource,
} from '../../../lib/playbackScene';
import type { DisposeBag } from './disposeBag';
import { flashGeometry } from './jetGeometry';
import type { FrameCtx, Layer } from './layer';

/** Draw order: after every line, post, ring, bomb and arrow of the jets and the targets, so nothing in 3D covers the flash. */
const ORDER = { scorch: 85, core: 86 } as const;

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
  /** Whether a ring was drawn (there is none yet: always false). */
  ringShown: boolean;
  /** Where the burst is, three.js axes. */
  centre: { x: number; y: number; z: number };
}

export interface ImpactLayer extends Layer {
  /** The playback index of the jet whose bomb this is. */
  readonly jet: number;
  /** Where the burst is now (three.js axes; the layer's own object, read, never kept or written), or undefined while nothing of it shows. */
  burstPosition(): Vector3 | undefined;
  /** What the layer drew on the last frame. Allocates, so only for the checks. */
  debug(): ImpactDebug;
}

export function createImpactLayer(o: { source: SceneSource; jet: number; parent: Object3D; bag: DisposeBag }): ImpactLayer {
  const { bag, jet } = o;
  let src = o.source;

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
  // Everything this layer draws, hidden as one by Show › Impact.
  const group = new Group();
  group.add(flash);
  group.visible = false;
  o.parent.add(group);

  // Made once: no frame allocates.
  const phase = newImpactPhase();
  const centre = new Vector3();
  let age = NaN;

  return {
    jet,

    update(ctx: FrameCtx) {
      if (ctx.source !== src) src = ctx.source;
      const impactT = src.impactOf(jet);
      age = ctx.t - impactT;
      impactPhase(ctx.t - impactT, ctx.speed, phase);
      const tg = src.targetOf(jet);
      centre.set(tg.x, Math.max(tg.y, ctx.heightAt(tg.x, tg.z)) + IMPACT_LIFT_M, tg.z);
      flash.visible = phase.flashAlpha > 0 && phase.flash > 0;
      group.visible = ctx.impact && flash.visible;
      coreMat.opacity = phase.flashAlpha;
      scorchMat.opacity = FLASH_SCORCH_ALPHA * phase.flashAlpha;
    },

    afterCamera(ctx: FrameCtx) {
      if (!group.visible || !flash.visible) return;
      flash.position.copy(centre);
      flash.quaternion.copy(ctx.camera.quaternion);
      flash.scale.setScalar(FLASH_R_PX * phase.flash * worldPerPixel(ctx.camera.position.distanceTo(centre), ctx.camera.fov, ctx.viewH));
    },

    setSource(next) {
      src = next;
    },

    burstPosition: () => (group.visible ? centre : undefined),

    debug: () => ({
      age_s: age,
      flash: phase.flash,
      flashAlpha: phase.flashAlpha,
      ring: phase.ring,
      ringAlpha: phase.ringAlpha,
      flashShown: group.visible && flash.visible,
      ringShown: false,
      centre: { x: centre.x, y: centre.y, z: centre.z },
    }),

    dispose() {
      o.parent.remove(group);
    },
  };
}
