/**
 * The ground under the 3D playback, as three.js objects over the pure mesh
 * (src/lib/playbackScene/terrain.ts):
 * - one BufferGeometry on one grid, drawn flat at once (the jets fly from
 *   the first frame) and lifted in place when the heights arrive: the same
 *   index throughout, so a swap is two buffer copies, never a rebuild;
 * - the map draped as one canvas texture, in colour, sRGB, with the GPU's
 *   best anisotropic filtering so it stays readable at grazing angles;
 * - unlit, with the hillshade baked into vertex colours (a multiplier of 1
 *   on flat ground, so flat map is exactly the planner's tile colours) and
 *   tone mapping off, so the colours are not shifted;
 * - a plain skirt round the box in the land colour, just under the box's
 *   lowest edge, a shaded wall from the terrain's edge down to it, and a
 *   haze that follows the camera so the far edge melts away;
 * - Real | Flat switching by swapping the buffers, with heightAt switching
 *   with them (the camera's ground clamp and the target ring follow).
 */
import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicMaterial,
  SRGBColorSpace, type Fog, type Object3D, type WebGLRenderer,
} from 'three';
import {
  buildTerrainMesh, creditsFor, fogRange, gridLatLon, heightAt as meshHeightAt, planSceneTerrain, skirtHeight,
  type GroundMode, type HeightsFailure, type SceneSource, type TerrainMesh, type TerrainPlan, type TileSource,
} from '../../../lib/playbackScene';
import { LAND_COLOR, loadTerrain, type MapProgress, type TerrainLoad } from '../terrain/terrainLoader';
import type { DisposeBag } from './disposeBag';
import type { FrameCtx, Layer } from './layer';

/** What the view shows about the ground: loading notes, failures, the switch's state, the credits. */
export interface TerrainStatus {
  /** 'off': no tile source was given (flat only). */
  heights: 'loading' | 'ready' | 'failed' | 'off';
  /** Why the heights failed, when they did. */
  heightsFailure?: HeightsFailure;
  map: MapProgress;
  /** What the user asked for. */
  wanted: GroundMode;
  /** What is drawn: flat until the heights arrive, and for good if they failed. */
  ground: GroundMode;
  /** Plain-text credit line for what is drawn (never a link: it would navigate the app's own window away). */
  credits: string;
}

export interface TerrainLayer extends Layer {
  readonly plan: TerrainPlan;
  /** The ground being drawn. */
  readonly ground: GroundMode;
  /** Bumped whenever the drawn ground changes. */
  readonly groundVersion: number;
  status(): TerrainStatus;
  /** The user's choice. Real shows only once heights have arrived; until then (or if they fail) the ground stays flat. */
  setGround(mode: GroundMode): void;
  /** The drawn ground's height in three.js axes (x east, z = −north). */
  heightAt(x: number, z: number): number;
  /** Half the diagonal of the terrain box, m (for the camera's limits). */
  readonly halfDiag_m: number;
  /** The middle of the box in three.js axes (y = 0). */
  readonly centre: { x: number; z: number };
}

export interface TerrainLayerOptions {
  source: SceneSource;
  /** Undefined: flat ground in the land colour, nothing fetched. */
  tiles: TileSource<CanvasImageSource> | undefined;
  renderer: WebGLRenderer;
  parent: Object3D;
  fog: Fog;
  bag: DisposeBag;
  /** Aborted when the view closes: the loads stop and nothing calls back after. */
  signal: AbortSignal;
  /** Ask for a new frame (the loop renders only when something changed). */
  invalidate(): void;
  onStatus(s: TerrainStatus): void;
}

/** The skirt reaches this many box half-diagonals from the box's middle: past the camera's farthest pull-back, wholly in the haze. */
const SKIRT_REACH = 4;
/** The wall under the terrain's edge is the land colour times this. */
const WALL_SHADE = 0.72;

export function createTerrainLayer(o: TerrainLayerOptions): TerrainLayer {
  const { bag, renderer } = o;
  // Every target of the strike goes into the plan, not only the lead's: any of them in a depression sets the ground's level.
  const plan = planSceneTerrain(o.source, renderer.capabilities.maxTextureSize);
  const { box } = plan.grid;
  // Each vertex's lat/lon, kept only until the heights are built (the real mesh needs them once).
  let latlon: Float64Array | undefined = gridLatLon(plan.grid, plan.frame);
  const flat: TerrainMesh = buildTerrainMesh(plan, undefined, latlon);
  let real: TerrainMesh | undefined;
  let wanted: GroundMode = 'real';
  let ground: GroundMode = 'flat';
  let groundVersion = 0;

  const centre = { x: (box.west_m + box.east_m) / 2, z: -(box.south_m + box.north_m) / 2 };
  const halfDiag_m = Math.hypot(box.east_m - box.west_m, box.north_m - box.south_m) / 2;

  // ── The mesh: copies of the flat buffers, overwritten in place on every swap.
  const geometry = bag.add(new BufferGeometry());
  const position = new BufferAttribute(flat.positionsFlat.slice(), 3).setUsage(DynamicDrawUsage);
  const colour = new BufferAttribute(flat.colorsFlat.slice(), 3).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', colour);
  if (flat.uvs) geometry.setAttribute('uv', new BufferAttribute(flat.uvs, 2));
  geometry.setIndex(new BufferAttribute(flat.index, 1)); // Uint32: well over 65,535 vertices (native in WebGL 2)

  const withMap = !!(o.tiles && plan.drape && flat.uvs);
  const material = bag.add(new MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true }));
  let load: TerrainLoad | undefined;
  let texture: CanvasTexture | undefined;
  const map: MapProgress = { total: 0, loaded: 0, failed: 0, done: !withMap };

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false; // one mesh, always in view: no bounding-sphere upkeep after a swap
  mesh.renderOrder = 0;
  o.parent.add(mesh);

  // ── The skirt: a square frame round the box (a hole where the terrain is, so it can never poke up
  // through a valley inside), tucked one cell under the terrain's edge.
  const inset = plan.grid.dx_m;
  const R = SKIRT_REACH * halfDiag_m;
  const ix0 = box.west_m + inset, ix1 = box.east_m - inset, iz0 = -(box.north_m - inset), iz1 = -(box.south_m + inset);
  const ox0 = centre.x - R, ox1 = centre.x + R, oz0 = centre.z - R, oz1 = centre.z + R;
  const skirtGeometry = bag.add(new BufferGeometry());
  skirtGeometry.setAttribute('position', new BufferAttribute(new Float32Array([
    ix0, 0, iz0, ix1, 0, iz0, ix1, 0, iz1, ix0, 0, iz1, // inner ring: north-west, north-east, south-east, south-west
    ox0, 0, oz0, ox1, 0, oz0, ox1, 0, oz1, ox0, 0, oz1, // outer ring, same order
  ]), 3));
  const frame: number[] = [];
  for (let k = 0; k < 4; k++) {
    const i0 = k, i1 = (k + 1) % 4, o0 = 4 + k, o1 = 4 + ((k + 1) % 4);
    frame.push(i0, o0, i1, i1, o0, o1);
  }
  skirtGeometry.setIndex(frame);
  // Double-sided so its winding cannot hide it; opaque, so that costs nothing.
  const skirtMaterial = bag.add(new MeshBasicMaterial({ color: new Color(LAND_COLOR), side: DoubleSide, toneMapped: false, fog: true }));
  const skirt = new Mesh(skirtGeometry, skirtMaterial);
  skirt.frustumCulled = false;
  skirt.renderOrder = -1;
  o.parent.add(skirt);

  // ── The wall: from the terrain's edge straight down to the skirt, so real ground reads as a solid
  // block standing on the plain. Without it the hills end in mid-air, and from outside the box the
  // background shows through the gap as a dark band under them. On flat ground it is 2 m tall.
  const { segX, segY } = plan.grid;
  const row = segX + 1;
  const edge: number[] = []; // the box's edge vertices, once round: north, east, south, west
  for (let i = 0; i < segX; i++) edge.push(i);
  for (let j = 0; j < segY; j++) edge.push(j * row + segX);
  for (let i = segX; i > 0; i--) edge.push(segY * row + i);
  for (let j = segY; j > 0; j--) edge.push(j * row);
  const wallPosition = new BufferAttribute(new Float32Array(edge.length * 6), 3).setUsage(DynamicDrawUsage); // top and bottom of each post
  const wallIndex: number[] = [];
  for (let k = 0; k < edge.length; k++) {
    const a = 2 * k, b = 2 * ((k + 1) % edge.length);
    wallIndex.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const wallGeometry = bag.add(new BufferGeometry());
  wallGeometry.setAttribute('position', wallPosition);
  wallGeometry.setIndex(wallIndex);
  // The land colour in shade: an earth cut, clearly not more map.
  const wallMaterial = bag.add(new MeshBasicMaterial({ color: new Color(LAND_COLOR).multiplyScalar(WALL_SHADE), side: DoubleSide, toneMapped: false, fog: true }));
  const wall = new Mesh(wallGeometry, wallMaterial);
  wall.frustumCulled = false;
  wall.renderOrder = -1;
  o.parent.add(wall);

  let failure: HeightsFailure | undefined;
  const status = (): TerrainStatus => ({
    heights: !o.tiles ? 'off' : real ? 'ready' : failure ? 'failed' : 'loading',
    heightsFailure: failure,
    map: { ...map },
    wanted,
    ground,
    credits: creditsFor({ map: map.loaded > 0, elevation: ground === 'real' }),
  });
  const tell = () => { if (!o.signal.aborted) o.onStatus(status()); };

  function apply() {
    const next: GroundMode = wanted === 'real' && real ? 'real' : 'flat';
    const m = next === 'real' && real ? real : flat;
    (position.array as Float32Array).set(next === 'real' ? m.positionsReal! : m.positionsFlat);
    (colour.array as Float32Array).set(next === 'real' ? m.colorsReal! : m.colorsFlat);
    position.needsUpdate = true;
    colour.needsUpdate = true;
    skirt.position.y = skirtHeight(m, next);
    // The wall's posts: each edge vertex as drawn, and the same point down at the skirt.
    const p = position.array as Float32Array, w = wallPosition.array as Float32Array, base = skirt.position.y;
    for (let k = 0; k < edge.length; k++) {
      const v = edge[k] * 3, q = k * 6;
      w[q] = p[v]; w[q + 1] = p[v + 1]; w[q + 2] = p[v + 2];
      w[q + 3] = p[v]; w[q + 4] = base; w[q + 5] = p[v + 2];
    }
    wallPosition.needsUpdate = true;
    if (next !== ground) groundVersion++;
    ground = next;
    o.invalidate();
  }
  apply();

  if (!withMap) material.color.set(LAND_COLOR);

  // ── The loads.
  if (o.tiles) {
    load = loadTerrain(plan, o.tiles, {
      onHeights(outcome) {
        // Called from a promise: a throw here would be an unhandled rejection that reaches nothing,
        // and the small print would say "Loading terrain…" for good. A heights mesh that cannot be
        // built is a broken download as far as the user is concerned: flat ground, and say so.
        try {
          if (outcome.ok) {
            real = buildTerrainMesh(plan, outcome.mosaic, latlon);
            if (!real.positionsReal) { real = undefined; failure = 'broken'; }
          } else failure = outcome.reason;
        } catch (err) {
          real = undefined;
          failure = 'broken';
          if (import.meta.env.DEV) console.warn('playback: building the real ground failed:', err);
        }
        latlon = undefined;
        apply(); // flat → real when Real is wanted: the heights rise in place
        tell();
      },
      onDrapeUpdate() {
        if (texture) texture.needsUpdate = true;
        o.invalidate();
      },
      onMapProgress(p) {
        Object.assign(map, p);
        tell();
      },
    }, o.signal);
    if (withMap && load.drapeCanvas) {
      texture = bag.add(new CanvasTexture(load.drapeCanvas));
      texture.colorSpace = SRGBColorSpace; // or the map's colours wash out
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      // flipY stays at its default (true) for a canvas: the pure drapeUvs are written for that.
      material.map = texture;
      material.needsUpdate = true;
    }
  } else {
    latlon = undefined;
  }

  queueMicrotask(tell);

  const haze = { near_m: 0, far_m: 0 };

  return {
    plan,
    halfDiag_m,
    centre,
    get ground() { return ground; },
    get groundVersion() { return groundVersion; },
    status,
    setGround(mode) {
      wanted = mode;
      apply();
      tell();
    },
    heightAt: (x, z) => meshHeightAt(ground === 'real' && real ? real : flat, x, -z, ground),
    update() {
      // Nothing moves with strike time; the ground changes only through setGround and the loads.
    },
    afterCamera(ctx: FrameCtx) {
      // The haze follows the (final) camera: from a little past the box's middle to just past its far corner.
      const c = ctx.camera.position;
      fogRange(Math.hypot(c.x - centre.x, c.y, c.z - centre.z), halfDiag_m, haze); // into the kept object: no per-frame garbage
      o.fog.near = haze.near_m;
      o.fog.far = haze.far_m;
    },
    dispose() {
      o.parent.remove(mesh, skirt, wall);
      material.map = null;
      // The texture itself is in the bag (freed after this); the canvas behind it can go now.
      load?.release();
      real = undefined;
    },
  };
}
