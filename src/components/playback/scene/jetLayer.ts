/**
 * One jet in the 3D playback (the scene makes one of these per flown jet):
 * its arrow, its planned path, a 20 s trail, its bomb while it falls and the
 * line the bomb leaves behind it. Its target is the target layer's (one mark per
 * distinct target, however many jets share it). Everything is sampled from
 * the playback library's DISPLAY layer through the scene adapter
 * (src/lib/playbackScene/source.ts), so the picture is the planner's, timed.
 *
 * - The watched jet's path and trail wear the planner's colour code, the
 *   map's and the card's own LINE_STYLE: blue route and leg, yellow climb,
 *   orange pull-down, red attack, green egress, dashed where the planner
 *   dashes. Colours are never the only cue: route and leg differ by the
 *   dash, and the arrow keeps its seat colour.
 * - The other jets (unless Show › Attack colours is All jets) fly in their
 *   seat colour instead: a thinner path with no casing, a little darker,
 *   still dashed where the planner dashes; a solid trail; the bomb in a
 *   darker seat colour, in a dark outline. Thinner and uncased, they never
 *   read as a leg of the watched jet's, and the watched jet's lines draw
 *   over theirs. Which look a jet wears changes only when the watched jet or
 *   the choice does: the colours are refilled then, never frame by frame.
 * - A re-timed strike hands the layer a new source: the path is refilled in
 *   place and the trail and the bomb's line are worked out again, even paused.
 * - The arrow points along the displayed velocity, not the heading number
 *   (meridians converge away from the target, and velocity is what the eye
 *   follows), and rolls about the nose by the lift roll (the roll a pilot would hold to fly the drawn
 *   path, from the playback library's attitude).
 * - The arrow and the bomb keep a constant size on screen (about 28 px and
 *   14 px) so they read at 50 km, but never shrink below their real size
 *   close up.
 * - The bomb has an outline so it can be found at the head of its own line
 *   and over the ground: a slightly larger copy of its shape drawn from
 *   inside behind it (white on a jet that wears the planner's colours,
 *   whose bomb is the planner's red; dark on the others, whose bombs are
 *   pale seat colours).
 * - While the bomb is in the air it leaves a line behind it: grey dashes from the release point to the
 *   bomb, one look on every jet that draws it (BOMB_TRACE_* in sceneStyle.ts). Nothing of the fall is drawn
 *   before the release or ahead of the bomb, and the line is gone when the bomb lands: left on the ground it
 *   would lie ahead of the next bomb down the same attack path and read as that bomb's own. Which part of
 *   the fall is drawn is bombTraceLine's (src/lib/playbackScene/bombTrace.ts), worked out from the clock's
 *   time alone, so a seek either way gives the same picture. The dashes are laid in metres from the release
 *   point, so they stay put along the fall as the line grows instead of crawling with the bomb. It is the
 *   bomb's path, not an effect: no Show switch. Only a jet that wears the planner's colour code shows it
 *   (see wear()); the other jets' bombs keep their marker and ring and draw no line.
 * - The trail is worked out afresh from the playback every frame instead of
 *   remembered, so scrubbing backwards, seeking and speed changes are always
 *   right; its buffers are made once, so no frame allocates.
 * - The path, the trail and the bomb's line are three's wide lines (LineSegments2),
 *   a set width in CSS pixels: plain WebGL lines are one device pixel, too
 *   thin to follow over a map. They are opaque (a see-through wide line shows
 *   a bead at every joint) and still hidden by a hill in front of them.
 * - The path and the trail are each two geometries, one for their solid stretches and one
 *   for their dashed ones: a dashed line material drops the round caps of every
 *   segment, so one dashed material for a mixed line would notch every bend.
 *   Each geometry has its own dark casing mesh under it (one mesh draws one
 *   geometry), so a dashed stretch is cased too. The bomb's line has no casing.
 * - A thin post in the point's colour stands under each action point and the
 *   IP, from the drawn ground up to the point; the discs on top are the label
 *   layer's. The posts go with the discs when Action points is Off.
 * - Nothing here is hazed: the jet must stay visible over the far terrain.
 */
import {
  BackSide, Color, DoubleSide, DynamicDrawUsage, InstancedInterleavedBuffer, InterleavedBufferAttribute,
  Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3, type Object3D,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LABEL_STYLE, LINE_STYLE, MARKER_COLOR } from '../../../lib/attackPicture';
import { PHASES, PHASE_STYLE } from '../../../lib/playback';
import {
  ARROW_LEN_M, ARROW_PX, BG, BOMB_HULL, BOMB_HULL_OTHER, BOMB_LEN_M, BOMB_PX,
  BOMB_TRACE_COLOUR, BOMB_TRACE_DASH, BOMB_TRACE_PX, LINE_CASING, OTHER_MARKER_ALPHA, OTHER_SHADE,
  PATH_CASING_PX, PATH_OTHER_PX, PATH_PX, POST_PX, TRAIL_CASING_PX, TRAIL_OTHER_CASING_PX, TRAIL_OTHER_PX, TRAIL_PX, TRAIL_S, bombTraceLine, jetColor, mixHex,
  newSceneBombPose, newSceneJetPose, otherBombHex, screenScale, worldPerPixel, type SceneJetPose, type ScenePhase, type SceneSource,
} from '../../../lib/playbackScene';
import type { DisposeBag } from './disposeBag';
import { arrowGeometry, bombGeometry, bombHullGeometry } from './jetGeometry';
import type { FrameCtx, Layer } from './layer';

/** Trail samples: one every quarter second over TRAIL_S. */
const TRAIL_N = 81;
/**
 * The trail's dashes are laid along jet time × this speed, not metres flown, so they stay put on the
 * ground as the trail moves. Jet time measured from when the jet comes into the picture stays small
 * at any delay (strike time at a delay of hours would cost float32 its precision, a metre a step).
 */
const TRAIL_DASH_MPS = 250;

/** Per PHASES index: the planner's colour as linear RGB (three's working space; a hex divided by 255 would draw too pale), and whether it is dashed. */
const PHASE_RGB = new Float32Array(PHASES.length * 3);
const PHASE_DASHED = new Uint8Array(PHASES.length);
const PHASE_INDEX = {} as Record<ScenePhase, number>;
PHASES.forEach((p, i) => {
  const style = LINE_STYLE[PHASE_STYLE[p]];
  const c = new Color(style.color);
  PHASE_RGB.set([c.r, c.g, c.b], i * 3);
  PHASE_DASHED[i] = style.dash ? 1 : 0;
  PHASE_INDEX[p] = i;
});
/** The dash of the dashed stretches, CSS px on, px off (the route and the egress leg share the map's 10 / 10). */
const PATH_DASH = LINE_STYLE[PHASE_STYLE[PHASES.find((p) => LINE_STYLE[PHASE_STYLE[p]].dash) ?? 'route']].dash ?? [10, 10];
/** Below this speed the velocity has no direction worth trusting: the heading and pitch are used. */
const MIN_SPEED_MPS = 0.5;

/**
 * Draw order: each line's casing just before the line itself, the path first, then the trail, the
 * bomb's line, and the arrow and bomb last (the target layer's post and ring draw between the bomb's
 * line and the bomb). Every casing of a line draws before any of its colour, so a casing never covers a
 * coloured stretch of its own line. The other jets' path and trail draw just before the watched
 * jet's, so where they cross the watched jet's colour code lies on top. The bomb's outline draws just
 * before the bomb: it is seen from inside, so the bomb must come after it. The bomb's line draws over
 * the trail and under the posts (which are 35, here and in the target layer).
 */
const ORDER = {
  otherPath: 5, pathCasing: 6, path: 7, otherTrailCasing: 29, otherTrail: 30, trailCasing: 31, trail: 32,
  trace: 34.5, posts: 35, bombHull: 58, bomb: 59, arrow: 60,
} as const;

/** Posts under the action points: one per marker kind and the IP, at most. */
const POST_SEGS = 9;
/** A point this close above the drawn ground (or under it) gets no post: there is nothing to stand it on. */
const POST_MIN_M = 5;
/** The posts start this far above the drawn ground, so they never flicker into it. */
const POST_LIFT_M = 1;
/** Per marker kind (and the IP, in the IP disc's edge blue): the post's colour as linear RGB, worked out once. */
const POST_KINDS = [...Object.keys(MARKER_COLOR), 'IP'];
const POST_RGB = new Float32Array(POST_KINDS.length * 3);
POST_KINDS.forEach((k, i) => {
  const c = new Color(k === 'IP' ? LABEL_STYLE.ipBorder : MARKER_COLOR[k as keyof typeof MARKER_COLOR]);
  POST_RGB.set([c.r, c.g, c.b], i * 3);
});

/** An opaque wide line of a set width in CSS pixels, tested against the ground's depth but never writing its own. */
export function wideLine(color: Color, px: number, more: { vertexColors?: boolean; dash?: number[] } = {}): LineMaterial {
  const m = new LineMaterial({ color, linewidth: px, worldUnits: false, depthWrite: false, fog: false, toneMapped: false, vertexColors: !!more.vertexColors });
  if (more.dash) {
    m.dashed = true;
    m.dashSize = more.dash[0];
    m.gapSize = more.dash[1];
  }
  return m;
}

/**
 * A wide-line geometry with room for `segs` segments, made once and refilled in place (never
 * re-made, so the graphics card's buffers are never reallocated): positions, and when asked a colour
 * per segment end and a distance along the line per segment end (for dashes).
 */
export interface Capacity {
  geom: LineSegmentsGeometry;
  segs: number;
  pos: Float32Array;
  col: Float32Array | null;
  dist: Float32Array | null;
  buffers: InstancedInterleavedBuffer[];
  /** Segments written so far in this refill. */
  n: number;
}
export function capacityGeometry(bag: DisposeBag, segs: number, colours: boolean, distances: boolean): Capacity {
  const geom = bag.add(new LineSegmentsGeometry());
  const room = Math.max(1, segs);
  const pos = new Float32Array(room * 6);
  geom.setPositions(pos);
  const buffers = [(geom.getAttribute('instanceStart') as InterleavedBufferAttribute).data as InstancedInterleavedBuffer];
  let col: Float32Array | null = null, dist: Float32Array | null = null;
  if (colours) {
    col = new Float32Array(room * 6);
    geom.setColors(col);
    buffers.push((geom.getAttribute('instanceColorStart') as InterleavedBufferAttribute).data as InstancedInterleavedBuffer);
  }
  if (distances) {
    dist = new Float32Array(room * 2);
    const d = new InstancedInterleavedBuffer(dist, 2, 1);
    geom.setAttribute('instanceDistanceStart', new InterleavedBufferAttribute(d, 1, 0));
    geom.setAttribute('instanceDistanceEnd', new InterleavedBufferAttribute(d, 1, 1));
    buffers.push(d);
  }
  for (const b of buffers) b.setUsage(DynamicDrawUsage);
  geom.instanceCount = 0;
  return { geom, segs: room, pos, col, dist, buffers, n: 0 };
}
/** Write one segment (start xyz, end xyz) with its colour and its two distances, if there is room. */
export function putSegment(c: Capacity, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, rgb: Float32Array, ri: number, d0: number, d1: number) {
  if (c.n >= c.segs) return;
  const i = c.n++, p = i * 6;
  c.pos[p] = x0; c.pos[p + 1] = y0; c.pos[p + 2] = z0;
  c.pos[p + 3] = x1; c.pos[p + 4] = y1; c.pos[p + 5] = z1;
  if (c.col) {
    c.col[p] = c.col[p + 3] = rgb[ri];
    c.col[p + 1] = c.col[p + 4] = rgb[ri + 1];
    c.col[p + 2] = c.col[p + 5] = rgb[ri + 2];
  }
  if (c.dist) {
    c.dist[i * 2] = d0;
    c.dist[i * 2 + 1] = d1;
  }
}
/** End a refill: draw what was written, and send it to the graphics card. */
export function finish(c: Capacity) {
  c.geom.instanceCount = c.n;
  for (const b of c.buffers) b.needsUpdate = true;
}

/** A line in the planner's colour code: solid and dashed stretches on their own geometries, each on its casing. */
interface CodedLine {
  solid: Capacity;
  dashed: Capacity;
  solidMat: LineMaterial;
  dashMat: LineMaterial;
  casingMat: LineMaterial;
  /** The two casings (solid, dashed), then the two coloured meshes (solid, dashed). */
  meshes: LineSegments2[];
}
function codedLine(bag: DisposeBag, segs: number, px: number, casingPx: number, order: { casing: number; line: number }): CodedLine {
  const solid = capacityGeometry(bag, segs, true, false);
  const dashed = capacityGeometry(bag, segs, true, true);
  // The colour comes from the vertices; the material's white leaves it as it is (three multiplies the two).
  const white = new Color('#ffffff');
  const casingMat = bag.add(wideLine(new Color(LINE_CASING), casingPx));
  const solidMat = bag.add(wideLine(white, px, { vertexColors: true }));
  const dashMat = bag.add(wideLine(white, px, { vertexColors: true, dash: PATH_DASH }));
  const meshes = [
    new LineSegments2(solid.geom, casingMat), new LineSegments2(dashed.geom, casingMat),
    new LineSegments2(solid.geom, solidMat), new LineSegments2(dashed.geom, dashMat),
  ];
  meshes.forEach((m, i) => {
    m.renderOrder = i < 2 ? order.casing : order.line;
    m.frustumCulled = false;
  });
  return { solid, dashed, solidMat, dashMat, casingMat, meshes };
}
/** A coded line's widths and draw order for one look; `casingPx` 0 hides its casing. */
function lookOf(l: CodedLine, px: number, casingPx: number, order: { casing: number; line: number }) {
  l.solidMat.linewidth = l.dashMat.linewidth = px;
  if (casingPx > 0) l.casingMat.linewidth = casingPx;
  l.meshes.forEach((m, i) => {
    if (i < 2) m.visible = casingPx > 0;
    m.renderOrder = i < 2 ? order.casing : order.line;
  });
}
/** One stretch of a coded line, on the solid or the dashed geometry by its phase. */
function putPhase(l: CodedLine, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, phase: number, d0: number, d1: number) {
  putSegment(PHASE_DASHED[phase] ? l.dashed : l.solid, x0, y0, z0, x1, y1, z1, PHASE_RGB, phase * 3, d0, d1);
}

/** The arrow as the scene really has it now, read off its mesh (for the screenshot checks). */
export interface ArrowDebug {
  /** The arrow is drawn now (its jet is in the picture). */
  visible: boolean;
  /**
   * The roll the mesh really has: the signed angle of its up side about its nose, from the vertical plane
   * through the nose, right wing down positive, wrapped to (−180, 180]. The pose's own roll is not wrapped.
   */
  bank_deg: number;
  /** The nose and the up side of the mesh as unit vectors, three.js axes. */
  nose: [number, number, number];
  up: [number, number, number];
}

/** The bomb's line as the layer laid it (for the checks): see JetLayer.debugTrace. */
export interface BombTraceDebug {
  points: number;
  drawn: number;
  segments: number;
  shown: boolean;
}

export interface JetLayer extends Layer {
  /** The playback index of the jet drawn. */
  readonly jet: number;
  /** Its colour ('#rrggbb'), the arrow's: its label's first line wears it. */
  readonly colour: string;
  /**
   * The jet at the last update's time, three.js axes (the scene's own object,
   * refilled every update: read, never kept or written). Its position is
   * valid even while the jet is hidden, so a camera can follow it then.
   */
  readonly pose: SceneJetPose;
  /** Where the arrow is now (three.js axes), or undefined while the jet is not shown. */
  jetPosition(): Vector3 | undefined;
  /** Where the bomb is now, or undefined unless it is falling. */
  bombPosition(): Vector3 | undefined;
  /** The arrow's nose, up side and roll as its mesh has them now. Allocates, so only for the checks, never per frame. */
  debugArrow(): ArrowDebug;
  /**
   * The bomb's line as laid on the last frame, read off its geometry and mesh: `points`, the points of the bomb's whole
   * fall; `drawn`, how many of them the laid line runs through from the release point on (only while the bomb is in
   * the air: 0 before the release and from the impact on); `segments`, how many pieces of line the geometry holds (the
   * last one ends on the bomb); `shown`, whether its mesh is drawn at all (only on a jet that wears the planner's colour
   * code). Allocates, so only for the checks.
   */
  debugTrace(): BombTraceDebug;
}

/**
 * The jet's colour is its seat's (source.seatOf: a skipped #2 leaves the
 * second flown jet as #3, in #3's colour), never its playback index, so a
 * jet wears the colour the editor's map and jet strip give its seat.
 */
export function createJetLayer(o: { source: SceneSource; jet: number; parent: Object3D; bag: DisposeBag }): JetLayer {
  const { bag, jet } = o;
  let src = o.source;
  const colourHex = jetColor(src.seatOf(jet));
  const colour = new Color(colourHex); // sRGB in, linear inside: shown as exactly the editor's colour
  // The seat colour as the lines take it when this jet is not the watched one, linear RGB, worked out once.
  const seatPathRgb = Float32Array.from(new Color(mixHex(colourHex, BG, OTHER_SHADE)).toArray());
  const seatTrailRgb = Float32Array.from(colour.toArray());
  // The bomb's colours: the planner's red with a white outline, or a darker seat colour (the one the checks
  // read, otherBombHex) with a dark outline.
  const bombRed = new Color(LINE_STYLE.bomb.color), bombSeat = new Color(otherBombHex(colourHex));
  const hullWhite = new Color(BOMB_HULL), hullDark = new Color(BOMB_HULL_OTHER);

  // ── The arrow.
  const arrowMat = bag.add(new MeshBasicMaterial({ color: colour, vertexColors: true, side: DoubleSide, fog: false, toneMapped: false }));
  const arrow = new Mesh(bag.add(arrowGeometry()), arrowMat);
  arrow.renderOrder = ORDER.arrow;
  arrow.frustumCulled = false;
  arrow.visible = false;

  // ── The planned path, IP to the end of the drawn egress leg, in the planner's colours. Its buffers
  // are sized for any delay (pathCapacity), so a new timing refills them in place.
  const pathSegs = Math.max(1, src.pathCapacity(jet) - 1);
  const path = codedLine(bag, pathSegs, PATH_PX, PATH_CASING_PX, { casing: ORDER.pathCasing, line: ORDER.path });

  // ── The trail: the last TRAIL_S of the track in the planner's colours, wider than the path; each
  // frame refills its buffers in place.
  const trail = codedLine(bag, TRAIL_N - 1, TRAIL_PX, TRAIL_CASING_PX, { casing: ORDER.trailCasing, line: ORDER.trail });

  // ── The bomb's line while it falls: grey dashes from the release point to the bomb, one look for every
  // jet, with no casing (the ground shows between the dashes). The fall's points it covers and the bomb
  // are written into traceXyz by bombTraceLine, then into the geometry as segments carrying the metres
  // from the release point for the dashes; both are refilled in place whenever the clock's time or the
  // source changes. The fall has at most bombCapacity points at any delay, and the line ends on the
  // bomb before the fall's last point (the impact) is reached, so bombCapacity points and one fewer
  // segments always hold it.
  const traceRoom = Math.max(2, src.bombCapacity(jet));
  const trace = capacityGeometry(bag, traceRoom - 1, false, true);
  const traceXyz = new Float32Array(traceRoom * 3);
  const traceMat = bag.add(wideLine(new Color(BOMB_TRACE_COLOUR), BOMB_TRACE_PX, { dash: BOMB_TRACE_DASH }));
  const traceLine = new LineSegments2(trace.geom, traceMat);
  traceLine.renderOrder = ORDER.trace;
  traceLine.frustumCulled = false;

  // ── The bomb, while it falls: the planner's bomb-line red (a darker seat colour on the other jets).
  const bombMat = bag.add(new MeshBasicMaterial({ color: bombRed.clone(), fog: false, toneMapped: false }));
  const bomb = new Mesh(bag.add(bombGeometry()), bombMat);
  bomb.renderOrder = ORDER.bomb;
  bomb.frustumCulled = false;
  bomb.visible = false;
  // Its outline: a child, so it takes the bomb's place, turn, size and whether it is shown for free.
  const hullMat = bag.add(new MeshBasicMaterial({ color: hullWhite.clone(), side: BackSide, fog: false, toneMapped: false }));
  const hull = new Mesh(bag.add(bombHullGeometry()), hullMat);
  hull.renderOrder = ORDER.bombHull;
  hull.frustumCulled = false;
  bomb.add(hull);

  // ── A thin post under each action point and the IP, in the point's colour, from the drawn ground up
  // to the point, so a disc high on a climb reads as standing over its spot on the ground. Laid again
  // only when the source or the ground changes.
  const posts = capacityGeometry(bag, POST_SEGS, true, false);
  const postMat = bag.add(wideLine(new Color('#ffffff'), POST_PX, { vertexColors: true }));
  const postLine = new LineSegments2(posts.geom, postMat);
  postLine.renderOrder = ORDER.posts;
  postLine.frustumCulled = false;
  let postsSource: SceneSource | undefined;
  let postsGround = -1;

  const drawn = [...path.meshes, ...trail.meshes, traceLine, postLine, bomb, arrow];
  o.parent.add(...drawn);

  // Scratch, made once: no frame allocates.
  const pose = newSceneJetPose(), past = newSceneJetPose(), bpose = newSceneBombPose();
  const dir = new Vector3(), m = new Matrix4(), qRoll = new Quaternion();
  const ORIGIN = new Vector3(0, 0, 0), UP = new Vector3(0, 1, 0), FWD = new Vector3(0, 0, -1), Z_AXIS = new Vector3(0, 0, 1);
  let lastTrailT = NaN;
  /** The clock's time the bomb's line was last laid for. */
  let lastTraceT = NaN;
  const D2R = Math.PI / 180;
  /** Whether this jet wears the planner's colour code now (the watched jet, or every jet with All jets). */
  let coded = true;

  /** One stretch of the path: the planner's colour, or the darker seat colour still dashed where the planner dashes. */
  function putPath(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, phase: number, d0: number, d1: number) {
    if (coded) putPhase(path, x0, y0, z0, x1, y1, z1, phase, d0, d1);
    else putSegment(PHASE_DASHED[phase] ? path.dashed : path.solid, x0, y0, z0, x1, y1, z1, seatPathRgb, 0, d0, d1);
  }
  /** One stretch of the trail: the planner's colour, or the seat colour, solid. */
  function putTrail(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, phase: number, d0: number, d1: number) {
    if (coded) putPhase(trail, x0, y0, z0, x1, y1, z1, phase, d0, d1);
    else putSegment(trail.solid, x0, y0, z0, x1, y1, z1, seatTrailRgb, 0, d0, d1);
  }

  /** The planned path into its buffers, stretch by stretch, with the metres along it for the dashes. */
  function refillPath() {
    const pts = src.plannedPath(jet), ph = src.plannedPhase(jet);
    const segs = Math.min(pts.length / 3 - 1, pathSegs);
    path.solid.n = path.dashed.n = 0;
    let along = 0;
    for (let s = 0; s < segs; s++) {
      const a = s * 3;
      const len = Math.hypot(pts[a + 3] - pts[a], pts[a + 4] - pts[a + 1], pts[a + 5] - pts[a + 2]);
      putPath(pts[a], pts[a + 1], pts[a + 2], pts[a + 3], pts[a + 4], pts[a + 5], ph[s], along, along + len);
      along += len;
    }
    finish(path.solid);
    finish(path.dashed);
  }

  /**
   * Put on the look of a coded jet or of another one: widths, casings, draw order, the bomb's colour
   * and outline, whether its line shows, and the posts' strength; then the path and the trail are
   * refilled in their colours and the posts laid again (the IP's goes with the IP disc). Only when the
   * look changes.
   */
  function wear(on: boolean) {
    coded = on;
    // Only a jet in the colour code draws its bomb's line. Every line is the same grey, so a lead's
    // bomb still falling past a wingman's release point would otherwise read as the wingman's own line
    // running ahead of a bomb not yet dropped. The line is still laid every time, so it is right the
    // moment the jet comes into the code.
    traceLine.visible = on;
    lookOf(path, on ? PATH_PX : PATH_OTHER_PX, on ? PATH_CASING_PX : 0, on ? { casing: ORDER.pathCasing, line: ORDER.path } : { casing: ORDER.pathCasing, line: ORDER.otherPath });
    lookOf(trail, on ? TRAIL_PX : TRAIL_OTHER_PX, on ? TRAIL_CASING_PX : TRAIL_OTHER_CASING_PX,
      on ? { casing: ORDER.trailCasing, line: ORDER.trail } : { casing: ORDER.otherTrailCasing, line: ORDER.otherTrail });
    bombMat.color.copy(on ? bombRed : bombSeat);
    hullMat.color.copy(on ? hullWhite : hullDark);
    postMat.transparent = !on;
    postMat.opacity = on ? 1 : OTHER_MARKER_ALPHA;
    postMat.needsUpdate = true;
    refillPath();
    lastTrailT = NaN;
    postsSource = undefined;
  }

  /** A re-timed source: the path again, in place; the trail, the bomb's line and the posts at the next update. */
  function takeSource(next: SceneSource) {
    src = next;
    refillPath();
    lastTrailT = NaN;
    lastTraceT = NaN;
    postsSource = undefined;
  }

  /**
   * The bomb's line into its geometry for clock time t: the polyline bombTraceLine gives (the fall's points
   * the bomb has passed, then the bomb as it is this frame, bpose; nothing unless the bomb is in the air),
   * one segment per stretch of it. Each segment carries the metres along the fall from the release point,
   * so a dash already laid never moves as the line grows.
   */
  function layTrace(t: number) {
    const n = bombTraceLine(src, jet, t, bpose, traceXyz);
    const p = traceXyz;
    trace.n = 0;
    let along = 0;
    for (let s = 0; s + 1 < n; s++) {
      const a = s * 3;
      const len = Math.hypot(p[a + 3] - p[a], p[a + 4] - p[a + 1], p[a + 5] - p[a + 2]);
      putSegment(trace, p[a], p[a + 1], p[a + 2], p[a + 3], p[a + 4], p[a + 5], PHASE_RGB, 0, along, along + len);
      along += len;
    }
    finish(trace);
  }

  refillPath();

  /** The posts into their buffer: one per action point and the IP that stands at least POST_MIN_M off the drawn ground. */
  function layPosts(ctx: FrameCtx) {
    posts.n = 0;
    const post = (x: number, y: number, z: number, kind: string) => {
      const g = ctx.heightAt(x, z);
      if (y - g < POST_MIN_M) return;
      putSegment(posts, x, g + POST_LIFT_M, z, x, y, z, POST_RGB, POST_KINDS.indexOf(kind) * 3, 0, 0);
    };
    for (const m of src.markers(jet)) post(m.x, m.y, m.z, m.kind);
    // The other jets have no IP disc, so no post under it either.
    if (coded) for (const l of src.labelPoints(jet)) if (l.kind === 'ip') post(l.x, l.y, l.z, 'IP');
    finish(posts);
    postsSource = src;
    postsGround = ctx.groundVersion;
  }

  function placeArrow() {
    arrow.position.set(pose.x, pose.y, pose.z);
    dir.set(pose.vx, pose.vy, pose.vz);
    if (dir.lengthSq() < MIN_SPEED_MPS * MIN_SPEED_MPS) {
      const h = pose.heading_deg * D2R, p = pose.pitch_deg * D2R;
      dir.set(Math.cos(p) * Math.sin(h), Math.sin(p), -Math.cos(p) * Math.cos(h)); // ENU (cos p sin H, cos p cos H, sin p) in three's axes
    }
    dir.normalize();
    // lookAt from the origin toward `dir` aims the model's −Z (its nose) along dir with +Y kept up;
    // then the roll about the nose: right bank (positive) puts the right wing (+X) down.
    m.lookAt(ORIGIN, dir, UP);
    arrow.quaternion.setFromRotationMatrix(m);
    qRoll.setFromAxisAngle(Z_AXIS, -pose.bank_deg * D2R);
    arrow.quaternion.multiply(qRoll);
  }

  /**
   * The roll the mesh really has, worked out from where its nose and its up side point, so a wrong sign or
   * a dropped roll in placeArrow shows. U is "up" made perpendicular to the nose, R = nose × U is the side
   * the right wing is on, and the roll is the angle of the mesh's up side from U toward R.
   */
  function debugArrow(): ArrowDebug {
    const nose = new Vector3(0, 0, -1).applyQuaternion(arrow.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(arrow.quaternion);
    const u = new Vector3(0, 1, 0).addScaledVector(nose, -nose.y).normalize();
    const r = new Vector3().crossVectors(nose, u);
    return {
      visible: arrow.visible,
      bank_deg: Math.atan2(up.dot(r), up.dot(u)) / D2R,
      nose: [nose.x, nose.y, nose.z],
      up: [up.x, up.y, up.z],
    };
  }

  /**
   * The bomb's line read back off what was laid, not worked out again: the pieces in its geometry, how many of
   * the fall's own points the laid polyline passes through from the release point on (each piece's start, then
   * the last piece's end; the bomb itself, the line's usual last point, is not a fall point), and whether the
   * mesh is shown. A layer that laid something other than bombTraceLine's line, or showed it on the wrong jet,
   * reads differently here.
   */
  function debugTrace(): BombTraceDebug {
    const pts = src.plannedBomb(jet), total = pts.length / 3, n = trace.n, pos = trace.pos;
    let drawn = 0;
    for (let i = 0; n > 0 && i <= n && i < total; i++) {
      const v = i < n ? i * 6 : (n - 1) * 6 + 3;
      if (pos[v] !== Math.fround(pts[i * 3]) || pos[v + 1] !== Math.fround(pts[i * 3 + 1]) || pos[v + 2] !== Math.fround(pts[i * 3 + 2])) break;
      drawn++;
    }
    return { points: total, drawn, segments: n, shown: traceLine.visible };
  }

  function updateTrail(t: number) {
    // Sample k is the trail k steps back from the jet; the segment from sample k−1 to sample k takes
    // the phase of its earlier end, sample k (a sample's phase is that of the stretch after it).
    trail.solid.n = trail.dashed.n = 0;
    const from = src.visibleFromOf(jet);
    let px = 0, py = 0, pz = 0, pd = 0;
    for (let k = 0; k < TRAIL_N; k++) {
      const tk = t - (k * TRAIL_S) / (TRAIL_N - 1);
      if (tk < src.window.t0_s) break;
      src.jetAt(jet, tk, past);
      if (!past.visible) break;
      const d = (tk - from) * TRAIL_DASH_MPS;
      if (k > 0) putTrail(px, py, pz, past.x, past.y, past.z, PHASE_INDEX[past.phase], pd, d);
      px = past.x;
      py = past.y;
      pz = past.z;
      pd = d;
    }
    finish(trail.solid);
    finish(trail.dashed);
  }

  const sizeAt = (ctx: FrameCtx, p: Vector3, px: number, len_m: number) =>
    screenScale(worldPerPixel(ctx.camera.position.distanceTo(p), ctx.camera.fov, ctx.viewH), px, len_m);

  return {
    jet,
    colour: colourHex,
    pose,

    update(ctx) {
      if (ctx.source !== src) takeSource(ctx.source);
      const wantCoded = src.jetCount === 1 || ctx.attackColours === 'all' || ctx.watched === jet;
      if (wantCoded !== coded) wear(wantCoded);
      if (src !== postsSource || ctx.groundVersion !== postsGround) layPosts(ctx);
      postLine.visible = ctx.actionPoints !== 'off';
      src.jetAt(jet, ctx.t, pose);
      arrow.visible = pose.visible;
      if (pose.visible) placeArrow();
      if (ctx.t !== lastTrailT) {
        updateTrail(ctx.t);
        lastTrailT = ctx.t;
      }

      src.bombAt(jet, ctx.t, bpose);
      bomb.visible = bpose.visible;
      if (bpose.visible) {
        bomb.position.set(bpose.x, bpose.y, bpose.z);
        dir.set(bpose.vx, bpose.vy, bpose.vz);
        if (dir.lengthSq() > MIN_SPEED_MPS * MIN_SPEED_MPS) bomb.quaternion.setFromUnitVectors(FWD, dir.normalize());
      }
      // The bomb's line ends on the bomb, so it is laid after it, and only when the time (or the source) is new.
      if (ctx.t !== lastTraceT) {
        layTrace(ctx.t);
        lastTraceT = ctx.t;
      }
    },

    afterCamera(ctx) {
      // Dashes are laid in metres along each line: scaled to the planner's pixels where the eye is looking.
      path.dashMat.dashScale = ctx.focusPxPerM;
      trail.dashMat.dashScale = ctx.focusPxPerM;
      traceMat.dashScale = ctx.focusPxPerM;
      if (arrow.visible) arrow.scale.setScalar(sizeAt(ctx, arrow.position, ARROW_PX, ARROW_LEN_M));
      if (bomb.visible) bomb.scale.setScalar(sizeAt(ctx, bomb.position, BOMB_PX, BOMB_LEN_M));
    },

    setSource(next) {
      if (next !== src) takeSource(next);
    },

    jetPosition: () => (arrow.visible ? arrow.position : undefined),
    bombPosition: () => (bomb.visible ? bomb.position : undefined),
    debugArrow,
    debugTrace,

    dispose() {
      o.parent.remove(...drawn);
    },
  };
}
