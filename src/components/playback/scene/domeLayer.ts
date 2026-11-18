/**
 * The threat envelopes in 3D, in the map's own looks (the map draws every threat's circle the same way): red for an
 * active threat, grey for the rest; an active one a ring on the drawn ground with a wire cage over it (two arcs over its
 * centre and a ring part-way up), any other the ring alone; dashed where the threat is a planning assumption, solid
 * where it is mission intel. No fill. So an active envelope is told from a degraded one by its cage and its heavier
 * line as well as its colour, and planning from intel by the dashes.
 *
 * An early-warning radar the planner switches on in Show is its ring alone, in the same colours and dashes, and only
 * the part of it inside the drawn area (its range is detection, hundreds of miles, not a weapon's reach): never a
 * cage. Its words, the range it detects to, are the label layer's.
 *
 * Which threats exist, and their lines, are domes.ts's: every dome the source carries is drawn here when its system is
 * switched on (FrameCtx.domeMask). The lines go into four buffers, one per look (active or not, dashed or not), sized
 * once at open for every dome there is, and are laid again only when the drawn ground changes or a system is switched
 * on or off, never frame by frame. The domes do not move with the times, so a re-time changes nothing here.
 *
 * Each dome's base is the drawn ground under its centre (baseY), read again whenever the ground changes; the inside
 * test (createScene) measures a jet's height against it, so the cage and the test agree.
 */
import { Color, type Object3D } from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import {
  DOME_ACTIVE, DOME_ACTIVE_PX, DOME_IDLE, DOME_IDLE_PX, domeSegmentCount, domeSegmentsInto, terrainBoxOf, type SceneDome, type SceneSource, type TerrainBox,
} from '../../../lib/playbackScene';
import type { DisposeBag } from './disposeBag';
import type { FrameCtx, Layer } from './layer';
import { capacityGeometry, finish, type Capacity } from './jetLayer';

/** Drawn first of everything over the ground: every jet's lines, the targets and the words come after. */
const ORDER = 3;
/** The four looks, in buffer order. */
const LOOKS = ['active', 'activeDashed', 'idle', 'idleDashed'] as const;
const lookOf = (d: SceneDome) => (d.active ? 0 : 2) + (d.dashed ? 1 : 0);
/** How many points of each ground ring the debug read-back gives. */
const RING_POINTS = 16;

/** One dome as the layer last laid it (for the screenshot checks): read back off the buffers, not worked out again. */
export interface DomeDebugEntry {
  threatId: string;
  systemId: string;
  ewr: boolean;
  /** Its system is switched on now. */
  on: boolean;
  /** The buffer it is drawn in: red or grey, dashed or not. */
  look: (typeof LOOKS)[number];
  /** Segments laid for it. */
  segments: number;
  /** Of those, the ones on its ring (both ends at its range from its centre) and the rest (the cage's). */
  ring: number;
  cage: number;
  /** Up to RING_POINTS points of its ground ring as laid, three.js axes: the middles of ring segments spread round it (so a check can look for its colour there). */
  ringPoints: [number, number, number][];
}
export interface DomeDebug {
  domes: DomeDebugEntry[];
  /** Segments drawn per look. */
  looks: Record<(typeof LOOKS)[number], number>;
  /** Each look's line as its material has it: the colour ('#rrggbb') and the width, CSS pixels; and whether its mesh is shown. */
  materials: Record<(typeof LOOKS)[number], { colour: string; width: number; visible: boolean }>;
}

export interface DomeLayer extends Layer {
  /** Per dome, the drawn ground under its centre (three.js y), refilled when the ground changes. Read, never written. */
  readonly baseY: Float32Array;
  /** The systems switched on changed (FrameCtx.domeMask was rewritten): the lines are laid again at the next update. */
  maskChanged(): void;
  debug(): DomeDebug;
}

export function createDomeLayer(o: { source: SceneSource; parent: Object3D; bag: DisposeBag }): DomeLayer {
  const { bag } = o;
  // The domes are the open's, the same array in every source made for it.
  const domes = o.source.domes;
  const box: TerrainBox = terrainBoxOf(o.source.bounds);
  const baseY = new Float32Array(domes.length);
  // Room for every dome of each look, whichever are switched on.
  const room = [0, 0, 0, 0];
  for (const d of domes) room[lookOf(d)] += domeSegmentCount(d);
  const caps: Capacity[] = room.map((n) => capacityGeometry(bag, n, false, false));
  const meshes = caps.map((c, i) => {
    const active = i < 2;
    const mat = bag.add(new LineMaterial({
      color: new Color(active ? DOME_ACTIVE : DOME_IDLE), linewidth: active ? DOME_ACTIVE_PX : DOME_IDLE_PX,
      worldUnits: false, depthWrite: false, fog: true, toneMapped: false,
    }));
    const m = new LineSegments2(c.geom, mat);
    m.renderOrder = ORDER;
    m.frustumCulled = false; // the cages are huge and the geometry's bounds are not kept up to date as it is refilled
    return m;
  });
  if (meshes.length) o.parent.add(...meshes);

  // Where each dome went on the last lay: its first segment in its look's buffer and how many.
  const start = new Int32Array(domes.length), count = new Int32Array(domes.length);
  let laidGround = -1, maskDirty = true;
  let mask: Uint8Array = new Uint8Array(domes.length);

  function lay(ctx: FrameCtx) {
    if (ctx.groundVersion !== laidGround) {
      for (let i = 0; i < domes.length; i++) baseY[i] = ctx.heightAt(domes[i].x, domes[i].z);
    }
    for (const c of caps) c.n = 0;
    for (let i = 0; i < domes.length; i++) {
      count[i] = 0;
      if (!mask[i]) continue;
      const c = caps[lookOf(domes[i])];
      start[i] = c.n;
      const floats = domeSegmentsInto(domes[i], baseY[i], ctx.heightAt, box, c.pos, c.n * 6);
      count[i] = floats / 6;
      c.n += count[i];
    }
    for (const c of caps) finish(c);
    laidGround = ctx.groundVersion;
    maskDirty = false;
  }

  return {
    baseY,

    update(ctx) {
      mask = ctx.domeMask;
      if (maskDirty || ctx.groundVersion !== laidGround) lay(ctx);
    },

    maskChanged() {
      maskDirty = true;
    },

    debug() {
      const looks = { active: caps[0].n, activeDashed: caps[1].n, idle: caps[2].n, idleDashed: caps[3].n };
      const entries = domes.map((d, i): DomeDebugEntry => {
        const c = caps[lookOf(d)];
        const onRing: number[] = [];
        for (let s = start[i]; s < start[i] + count[i]; s++) {
          const p = s * 6;
          const r0 = Math.hypot(c.pos[p] - d.x, c.pos[p + 2] - d.z), r1 = Math.hypot(c.pos[p + 3] - d.x, c.pos[p + 5] - d.z);
          if (Math.abs(r0 - d.radius_m) <= 1 && Math.abs(r1 - d.radius_m) <= 1) onRing.push(p);
        }
        const ring = onRing.length, step = Math.max(1, ring / RING_POINTS);
        const ringPoints: [number, number, number][] = [];
        for (let k = 0; k < ring && ringPoints.length < RING_POINTS; k += step) {
          const p = onRing[Math.floor(k)];
          ringPoints.push([(c.pos[p] + c.pos[p + 3]) / 2, (c.pos[p + 1] + c.pos[p + 4]) / 2, (c.pos[p + 2] + c.pos[p + 5]) / 2]);
        }
        return { threatId: d.threatId, systemId: d.systemId, ewr: d.ewr, on: mask[i] === 1, look: LOOKS[lookOf(d)], segments: count[i], ring, cage: count[i] - ring, ringPoints };
      });
      const mat = (i: number) => {
        const m = meshes[i].material as LineMaterial;
        return { colour: `#${m.color.getHexString()}`, width: m.linewidth, visible: meshes[i].visible };
      };
      return { domes: entries, looks, materials: { active: mat(0), activeDashed: mat(1), idle: mat(2), idleDashed: mat(3) } };
    },

    dispose() {
      if (meshes.length) o.parent.remove(...meshes);
    },
  };
}
