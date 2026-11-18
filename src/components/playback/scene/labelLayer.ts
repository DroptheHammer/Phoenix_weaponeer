/**
 * The 3D view's 2D overlay: one plain canvas laid over the WebGL canvas
 * (position absolute, filling the host, never taking the mouse), redrawn
 * after the camera on every frame the scene draws. Discs and words are
 * drawn here rather than as textures in the 3D scene, so they stay a set
 * size on screen, sharp at any distance, and their look is ordinary canvas
 * code that is easy to restyle.
 *
 * What it draws, bottom to top:
 * - Every flown jet's action points: a disc in the planner's marker colour at
 *   each point (on the drawn line, where the arrow passes), with the marker's
 *   letters. The watched jet (every jet with Show › Attack colours › All
 *   jets) also gets an "IP" disc on the planner's IP blue and a small green
 *   dot at the end of the egress leg; the other jets' discs are smaller and
 *   fainter, and drawn under the watched jet's. Gone when Show › Action
 *   points is Off.
 * - Each distinct target's red TGT disc (the map's and the card's own mark) on
 *   the top of its post, with its tag on a plate to the right ("TGT1 · #1 #3":
 *   the waypoint's name, then every seat on it, so whose target it is never
 *   rests on colour). These stay whatever Action points says.
 * - A ring round every falling bomb (Show › Impact): an open circle, the same size on screen at
 *   any distance, so the bomb is found whatever its line, its size and the view do to it. A jet that wears
 *   the planner's colour code gets the larger solid ring, the others a smaller, fainter one. It starts
 *   twice its size at the release and settles to its size in half a real second (a pure function of the
 *   clock's time and speed, so it is the same after a seek or a re-time). No words cover the ring of a jet
 *   that wears the colour code: the box round it as drawn this frame (the pulse in it, plus a few pixels) is
 *   kept clear of every callout plate, the words beside a burst and the jets' labels, so the bomb Chase
 *   turns to watch is never hidden. A plate with no clear spot left is left out that frame; a jet's label
 *   takes its least covering corner. The other jets' fainter rings are not kept clear (with four jets
 *   there would be no room left for words): a plate or a label still covers them.
 * - The planner's words at the watched jet's points (every jet's with All
 *   jets), word for word what the map and the
 *   card print, on a white plate joined to its disc by a thin line: the
 *   markers' lines, the IP and egress labels, and the TGT marker's line at the
 *   target when the bombs land. As they come (the default), each shows from a
 *   little before the jet reaches its point to a little after, in real
 *   seconds whatever the speed, three of one jet's at most, fading in and
 *   out; Always, all of them. A plate that finds no free spot round its disc
 *   is left out that frame (its disc stays): it never covers another label.
 * - The words beside each burst (Show › Impact), for as long as the ring
 *   there lasts: "#1 impact" on a dark plate, and, while the ring is drawn
 *   large enough to read, the weapon's blast radius ("blast radius 250 ft
 *   (est.)"); a weapon with no radius has the first line only. They are placed
 *   like the callouts, after them, round the flash, and whatever Show › Action
 *   points says: they never cover a callout, a jet's label or a target's disc
 *   and tag, and with no free spot they are left out that frame.
 * - The words beside each early-warning radar's ring switched on in Show
 *   ("Tall Rack · detection range 200 nm"), at the ring's point inside the
 *   drawn area nearest the lead's target, by a dot in the ring's colour. They
 *   are what tells a radar's ring from a weapon's (with the missing cage), so
 *   colour is never the only sign; where they would cover other words or an
 *   action-point disc they are left out that frame, never moved.
 * - Each jet's label beside its arrow: "#1 Viper 1-1" in the jet's colour,
 *   and, with Show › Labels on, its altitude and speed as the planner prints
 *   them; whatever Labels says, while the jet is inside a threat's envelope
 *   switched on in Show, a third line in amber naming it ("◎ inside SA-6
 *   Gainful"). It takes the side of the arrow that leaves a target's disc and tag
 *   uncovered (the jet passes right by its target at release), and the other
 *   jets' arrows with their rings (a label over another jet's arrow hides that
 *   jet). Where no side is free (jets close together, each with three lines) it
 *   slides up or down, a line at a time, until it covers nothing, and a thin
 *   line in the jet's colour, drawn first so every disc and plate lies over it,
 *   joins it to its arrow.
 *
 * The view's own controls lie over the picture too (the camera buttons along
 * the top right, the strike's name at the top left). The view measures them
 * and hands their boxes over (setChromeBoxes); every plate and every jet's
 * label keeps off them, as off a target's disc and tag, so a word is never
 * hidden under a button. Discs, rings and the targets' tags stay where they are.
 *
 * The backing store follows the canvas's CSS size times the scene's capped
 * device pixel ratio, so text is sharp on a Retina screen without costing
 * more pixels than the 3D itself draws. Strings and their widths are worked
 * out once per source, watched jet and Attack colours choice (a jet label's
 * numbers only when they change), and nothing is allocated frame by frame.
 */
import { Vector3, type PerspectiveCamera } from 'three';
import { LABEL_STYLE, MARKER_COLOR } from '../../../lib/attackPicture';
import {
  ARROW_PX, BOMB_RING_EDGE_PX, BOMB_RING_LINE_PX, CALLOUT_FONT, CALLOUT_LEADER, CALLOUT_LEADER_PX, CALLOUT_LINE_PX, CALLOUT_PAD_PX, CALLOUT_STRIPE_PX, CHROME_BOXES_MAX, CalloutFader,
  CalloutPlacer, DISC_EDGE, DISC_EDGE_PX, DISC_RIM, DISC_RIM_PX, DOME_ACTIVE, DOME_IDLE, EGRESS_DOT_PX, FLASH_R_PX, LABEL_FONT, LABEL_GAP_PX, LABEL_LINE_PX, LABEL_PAD_PX, LABEL_PLATE,
  LABEL_TEXT, LABEL_WARN, LabelText, MARKER_FONT, MARKER_OTHER_R_PX, MARKER_R_PX, OTHER_MARKER_ALPHA, TARGET_FONT, TARGET_R_PX, blockKeepClear, bombRingLook, calloutTargets,
  ewrTagPoint, ewrTagText, impactTagLines, letterInk, placeLabels, releasePulse, targetTag, terrainBoxOf, type AttackColours, type BombRingLook, type SceneDome, type SceneSource,
} from '../../../lib/playbackScene';
import type { DisposeBag } from './disposeBag';
import type { ImpactLayer } from './impactLayer';
import type { JetLayer } from './jetLayer';
import type { FrameCtx, Layer } from './layer';
import type { TargetLayer } from './targetLayer';

/** What was drawn on the last frame, CSS pixels from the canvas's top left. For the screenshot checks. */
export interface LabelDebug {
  /** Each target's disc centre and tag, and the box round the two (left, top, width, height) that labels and plates keep clear of. */
  targets: { key: string; x: number; y: number; tag: string; box: [number, number, number, number] }[];
  /** The action points' discs and the IP disc, each with its radius in px (smaller on a jet that does not wear the colour code). */
  markers: { key: string; x: number; y: number; r: number }[];
  /** Every callout showing at all (alpha above 0), placed or dropped for want of room; the plate's top left and size. */
  callouts: { key: string; lines: readonly string[]; alpha: number; x: number; y: number; w: number; h: number; placed: boolean }[];
  /**
   * Each jet's label: its lines as shown, its plate, its arrow's point it stands beside, the half size of the square round
   * that arrow (and its ring) that the other labels keep off, whether it slid away from that row (and has a leader), and
   * the jet's colour (its first line's and its leader's).
   */
  jets: { key: string; lines: string[]; x: number; y: number; w: number; h: number; ax: number; ay: number; keepR: number; slid: boolean; colour: string }[];
  /** The ring round each falling bomb as drawn (a playback jet index, its centre, its radius with the release pulse in it, its alpha). */
  bombs: { jet: number; x: number; y: number; r: number; alpha: number }[];
  /** The words beside each burst showing at all (`impact-<playback jet index>`), placed or dropped for want of room; the plate's top left and size. */
  tags: { key: string; kind: 'impact'; lines: readonly string[]; alpha: number; x: number; y: number; w: number; h: number; placed: boolean }[];
  /**
   * The words beside each early-warning radar's ring that is switched on and has its tag point on screen (keyed by its
   * threat), placed or left out because they would cover other words; the plate's top left and size.
   */
  ewr: { key: string; text: string; x: number; y: number; w: number; h: number; placed: boolean }[];
  /** The boxes of the view's own controls as last handed over (setChromeBoxes). */
  chrome: ScreenBox[];
  /** Every box the plates and the jets' labels kept off on the last frame besides the targets': each kept ring's (`ring`, its jet), then each control's. */
  kept: { kind: 'ring' | 'chrome'; jet?: number; x: number; y: number; w: number; h: number }[];
}

/** A box on the canvas, CSS pixels from its top left. */
export interface ScreenBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelLayer extends Layer {
  /**
   * The boxes of the view's own controls over the picture (CSS pixels from the canvas's top left), which plates and jet
   * labels keep off from the next frame on; at most CHROME_BOXES_MAX are kept. Copied: the array may be reused.
   */
  setChromeBoxes(boxes: readonly ScreenBox[]): void;
  /** What the last drawn frame put on the overlay (allocated only when called). */
  debugLabels(): LabelDebug;
}

const TGT_INK = letterInk(MARKER_COLOR.TGT);
const IP_INK = letterInk(LABEL_STYLE.ipBg);
/** What a callout hangs from: one of the discs, an egress dot, or its jet's target's disc. */
const AT_DISC = 0, AT_EGRESS = 1, AT_TARGET = 2;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** Whether two boxes (left, top, width, height) overlap. */
const overlaps = (x: number, y: number, w: number, h: number, ox: number, oy: number, ow: number, oh: number) => x < ox + ow && x + w > ox && y < oy + oh && y + h > oy;

export function createLabelLayer(o: {
  host: HTMLElement; source: SceneSource; targets: TargetLayer; jets: readonly JetLayer[]; impacts: readonly ImpactLayer[]; bag: DisposeBag;
}): LabelLayer {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.labels = '';
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  o.host.appendChild(canvas); // after the WebGL canvas, so it is drawn over it
  const g = canvas.getContext('2d');
  const measureLabel = (s: string) => {
    if (!g) return 0;
    g.font = LABEL_FONT;
    return g.measureText(s).width;
  };

  let src: SceneSource | undefined;
  let w = 0, h = 0, dpr = 0;
  const v = new Vector3();

  // ── Per source: the targets' tags, the jets' label words.
  let tags: string[] = [];
  let tagW = new Float32Array(0);
  let tx = new Float32Array(0), ty = new Float32Array(0), tOn = new Uint8Array(0);
  // The boxes no jet's label and no plate covers this frame: first each target on screen, its disc and its tag together
  // (shownTargets of them), then the coded jets' falling bombs' rings, then the view's own controls (nBlocked in all).
  let tbx = new Float32Array(0), tby = new Float32Array(0), tbw = new Float32Array(0), tbh = new Float32Array(0);
  let shownTargets = 0, nBlocked = 0;
  // The view's own controls as handed over, kept until the next hand-over.
  const chX = new Float32Array(CHROME_BOXES_MAX), chY = new Float32Array(CHROME_BOXES_MAX), chW = new Float32Array(CHROME_BOXES_MAX), chH = new Float32Array(CHROME_BOXES_MAX);
  let nChrome = 0;
  let jetText: LabelText[] = [];
  // Per jet layer, each frame: anchor, plate size and place, whether shown, the second line shown.
  const nJ = o.jets.length;
  const jax = new Float32Array(nJ), jay = new Float32Array(nJ), jw = new Float32Array(nJ), jh = new Float32Array(nJ);
  const jx = new Float32Array(nJ), jy = new Float32Array(nJ), jOf = new Int16Array(nJ);
  const jL2: (string | undefined)[] = new Array(nJ).fill(undefined);
  // And the third line shown, the envelope the jet is inside (none: undefined).
  const jL3: (string | undefined)[] = new Array(nJ).fill(undefined);
  // Whether the label had to slide away from its arrow's row (no corner was free): then a leader joins it to its arrow.
  const jSlid = new Uint8Array(nJ);
  // The half size of the square round each shown jet's arrow that the other labels keep off: the white ring when it has
  // one, else the arrow at its usual size on screen.
  const jKeepR = new Float32Array(nJ);
  let shownJets = 0;
  // Per jet layer: whether it wears the planner's colour code (set with the discs), and each frame its bomb's ring.
  const jCoded = new Uint8Array(nJ);
  const bx = new Float32Array(nJ), by = new Float32Array(nJ), br = new Float32Array(nJ), ba = new Float32Array(nJ), bOn = new Uint8Array(nJ);
  // Each frame: whether that ring is drawn and its jet wears the colour code, so words keep off it.
  const bKeep = new Uint8Array(nJ);
  const ringLook: BombRingLook = { r: 0, alpha: 0 };
  // Per impact layer: the words beside its burst, both ways they can read (with the radius and without), and each
  // plate's size, worked out once per source; each frame where the plate went and whether it was placed.
  const nI = o.impacts.length;
  let tagWith: string[][] = [], tagWithout: string[][] = [];
  const tagWithW = new Float32Array(nI), tagWithH = new Float32Array(nI), tagWithoutW = new Float32Array(nI), tagWithoutH = new Float32Array(nI);
  const iOn = new Uint8Array(nI), iRadius = new Uint8Array(nI), iPlaced = new Uint8Array(nI);
  const iX = new Float32Array(nI), iY = new Float32Array(nI);
  // The early-warning radars' words: per radar ring that has a point inside the drawn area, its dome, its words and their
  // width, and the ring's point they stand beside (worked out once for the open's domes); each frame where they went.
  let ewrDomes: readonly SceneDome[] | undefined;
  let ewrDome = new Int16Array(0), ewrText: string[] = [], ewrW = new Float32Array(0), ewrPx = new Float32Array(0), ewrPz = new Float32Array(0);
  let ewrOn = new Uint8Array(0), ewrPlaced = new Uint8Array(0), ewrX = new Float32Array(0), ewrY = new Float32Array(0), ewrDotX = new Float32Array(0), ewrDotY = new Float32Array(0);
  // The height each radar's point stands at (1 m over the drawn ground there), read again only when the ground changes.
  let ewrPy = new Float32Array(0), ewrGround = -1;

  // ── Per source, watched jet and Attack colours choice: every jet's discs, the coded jets' egress dots
  // and callouts. A coded jet is the watched one, or every jet with All jets (with one jet, that one).
  let watched = -1;
  let colours: AttackColours | undefined;
  // The discs: the other jets' first, then the coded jets', so drawing in this order puts the coded ones on top.
  let discKey: string[] = [], discFill: string[] = [], discEdge: string[] = [], discInk: string[] = [], discText: string[] = [];
  let discPos: Vector3[] = [];
  let discR = new Float32Array(0), discAlpha = new Float32Array(0);
  let discX = new Float32Array(0), discY = new Float32Array(0), discOn = new Uint8Array(0);
  let egPos: Vector3[] = [];
  let egX = new Float32Array(0), egY = new Float32Array(0), egOn = new Uint8Array(0);
  let cKey: string[] = [], cLines: (readonly string[])[] = [], cColour: string[] = [];
  let cMark = new Float64Array(0), cJet = new Int16Array(0), cKind = new Uint8Array(0), cAt = new Int16Array(0);
  let cW = new Float32Array(0), cH = new Float32Array(0), cTW = new Float32Array(0);
  let cTarget = new Float32Array(0), cOrder = new Int16Array(0), cPlaced = new Uint8Array(0), cX = new Float32Array(0), cY = new Float32Array(0);
  let fader = new CalloutFader(0), placer = new CalloutPlacer(1), placerRoom = 1;
  let nCallouts = 0, nCandidates = 0, showPoints = false;

  /** The tags and the jets' words, once per source. */
  function remember(s: SceneSource) {
    src = s;
    tags = s.targets.map((t) => targetTag(t, s.seatLabels));
    if (g) g.font = LABEL_FONT;
    tagW = Float32Array.from(tags, (t) => (g ? g.measureText(t).width : 0));
    tx = new Float32Array(tags.length);
    ty = new Float32Array(tags.length);
    tOn = new Uint8Array(tags.length);
    // Room for every target, every jet's ring and every control.
    const nb = tags.length + nJ + CHROME_BOXES_MAX;
    tbx = new Float32Array(nb);
    tby = new Float32Array(nb);
    tbw = new Float32Array(nb);
    tbh = new Float32Array(nb);
    jetText = o.jets.map((jl) => new LabelText(s.labelOf(jl.jet), s.callsignOf(jl.jet)));
    tagWith = o.impacts.map((il) => impactTagLines(s.labelOf(il.jet), s.impactInfo(il.jet).ringRadius_ft, true));
    tagWithout = o.impacts.map((il) => impactTagLines(s.labelOf(il.jet), s.impactInfo(il.jet).ringRadius_ft, false));
    const plateW = (lines: readonly string[]) => Math.max(0, ...lines.map((l) => (g ? g.measureText(l).width : 0))) + 2 * LABEL_PAD_PX;
    for (let i = 0; i < nI; i++) {
      tagWithW[i] = plateW(tagWith[i]);
      tagWithH[i] = tagWith[i].length * LABEL_LINE_PX;
      tagWithoutW[i] = plateW(tagWithout[i]);
      tagWithoutH[i] = tagWithout[i].length * LABEL_LINE_PX;
    }
    if (s.domes !== ewrDomes) rememberRadars(s);
    watched = -1; // the discs and callouts are made again for this source
  }

  /** The radars' words and the point of each ring they stand beside: once for the open's domes (a re-time keeps them). */
  function rememberRadars(s: SceneSource) {
    ewrDomes = s.domes;
    const box = terrainBoxOf(s.bounds);
    const list: { i: number; text: string; x: number; z: number }[] = [];
    s.domes.forEach((d, i) => {
      if (!d.ewr) return;
      const p = ewrTagPoint(d, box);
      if (p) list.push({ i, text: ewrTagText(d), x: p.x, z: p.z });
    });
    if (g) g.font = LABEL_FONT;
    ewrDome = Int16Array.from(list, (e) => e.i);
    ewrText = list.map((e) => e.text);
    ewrW = Float32Array.from(list, (e) => (g ? g.measureText(e.text).width : 0) + 2 * LABEL_PAD_PX);
    ewrPx = Float32Array.from(list, (e) => e.x);
    ewrPz = Float32Array.from(list, (e) => e.z);
    const n = list.length;
    ewrOn = new Uint8Array(n);
    ewrPlaced = new Uint8Array(n);
    ewrX = new Float32Array(n);
    ewrY = new Float32Array(n);
    ewrDotX = new Float32Array(n);
    ewrDotY = new Float32Array(n);
    ewrPy = new Float32Array(n);
    ewrGround = -1;
  }

  /**
   * Whether the box (x, y, w, h) covers any words already placed this frame (a jet's label, a blocked box, a callout, the
   * words at a burst, another radar's) or an action-point disc that is on.
   */
  function coversWords(x: number, y: number, bw: number, bh: number, upTo: number): boolean {
    for (let n = 0; n < shownJets; n++) if (overlaps(x, y, bw, bh, jx[n], jy[n], jw[n], jh[n])) return true;
    for (let b = 0; b < nBlocked; b++) if (overlaps(x, y, bw, bh, tbx[b], tby[b], tbw[b], tbh[b])) return true;
    for (let i = 0; i < nCallouts; i++) if (cPlaced[i] && overlaps(x, y, bw, bh, cX[i], cY[i], cW[i], cH[i])) return true;
    for (let i = 0; i < discPos.length; i++) {
      if (!discOn[i]) continue;
      const r = discR[i] + DISC_EDGE_PX + DISC_RIM_PX;
      if (overlaps(x, y, bw, bh, discX[i] - r, discY[i] - r, 2 * r, 2 * r)) return true;
    }
    for (let i = 0; i < nI; i++) {
      if (iPlaced[i] && overlaps(x, y, bw, bh, iX[i], iY[i], iRadius[i] ? tagWithW[i] : tagWithoutW[i], iRadius[i] ? tagWithH[i] : tagWithoutH[i])) return true;
    }
    for (let e = 0; e < upTo; e++) if (ewrPlaced[e] && overlaps(x, y, bw, bh, ewrX[e], ewrY[e], ewrW[e], LABEL_LINE_PX)) return true;
    return false;
  }

  /**
   * Every jet's discs, and the coded jets' egress dots and callouts with their words measured: once per
   * source, watched jet and Attack colours choice.
   */
  function rememberPoints(s: SceneSource, jet: number, mode: AttackColours) {
    watched = jet;
    colours = mode;
    const isCoded = (k: number) => s.jetCount === 1 || mode === 'all' || k === jet;
    const jetsInOrder: number[] = [];
    for (let k = 0; k < s.jetCount; k++) if (!isCoded(k)) jetsInOrder.push(k);
    for (let k = 0; k < s.jetCount; k++) if (isCoded(k)) jetsInOrder.push(k);
    for (let i = 0; i < nJ; i++) jCoded[i] = isCoded(o.jets[i].jet) ? 1 : 0;

    const discs: { key: string; fill: string; edge: string; ink: string; text: string; pos: Vector3; r: number; alpha: number }[] = [];
    const eg: Vector3[] = [];
    // The callouts: each marker's lines at its disc, the IP label at the IP disc, the egress label at
    // the dot, and the TGT marker's line at the target's disc when the bombs land.
    const list: { key: string; lines: readonly string[]; colour: string; t: number; jet: number; kind: number; at: number }[] = [];
    for (const k of jetsInOrder) {
      const coded = isCoded(k);
      const points = s.labelPoints(k);
      for (const m of s.markers(k)) {
        if (coded) list.push({ key: m.key, lines: m.lines, colour: MARKER_COLOR[m.kind], t: m.t_s, jet: k, kind: AT_DISC, at: discs.length });
        discs.push({
          key: m.key, fill: MARKER_COLOR[m.kind], edge: DISC_EDGE, ink: letterInk(MARKER_COLOR[m.kind]), text: m.kind, pos: new Vector3(m.x, m.y, m.z),
          r: coded ? MARKER_R_PX : MARKER_OTHER_R_PX, alpha: coded ? 1 : OTHER_MARKER_ALPHA,
        });
      }
      if (!coded) continue; // the other jets: small discs only, no IP disc, no egress dot, no words
      const ip = points.find((p) => p.kind === 'ip');
      if (ip) {
        list.push({ key: ip.key, lines: [ip.text], colour: LABEL_STYLE.ipBorder, t: ip.t_s, jet: k, kind: AT_DISC, at: discs.length });
        discs.push({ key: ip.key, fill: LABEL_STYLE.ipBg, edge: LABEL_STYLE.ipBorder, ink: IP_INK, text: 'IP', pos: new Vector3(ip.x, ip.y, ip.z), r: MARKER_R_PX, alpha: 1 });
      }
      const e = points.find((p) => p.kind === 'egress');
      if (e) {
        list.push({ key: e.key, lines: [e.text], colour: LABEL_STYLE.egressBorder, t: e.t_s, jet: k, kind: AT_EGRESS, at: eg.length });
        eg.push(new Vector3(e.x, e.y, e.z));
      }
      const tw = s.targetWords(k);
      if (tw) list.push({ key: tw.key, lines: tw.lines, colour: MARKER_COLOR.TGT, t: tw.t_s, jet: k, kind: AT_TARGET, at: k });
    }
    discKey = discs.map((d) => d.key);
    discFill = discs.map((d) => d.fill);
    discEdge = discs.map((d) => d.edge);
    discInk = discs.map((d) => d.ink);
    discText = discs.map((d) => d.text);
    discPos = discs.map((d) => d.pos);
    discR = Float32Array.from(discs, (d) => d.r);
    discAlpha = Float32Array.from(discs, (d) => d.alpha);
    discX = new Float32Array(discs.length);
    discY = new Float32Array(discs.length);
    discOn = new Uint8Array(discs.length);
    egPos = eg;
    egX = new Float32Array(eg.length);
    egY = new Float32Array(eg.length);
    egOn = new Uint8Array(eg.length);

    const n = list.length;
    // A re-timed strike (every step of a time dragged or typed) hands over a new source with the same points:
    // its callouts keep how far each has faded in and the spot each plate had, so the planner's words hold
    // steady instead of blinking out and fading back at every step. Only other points (another source, another
    // watched jet or Attack colours choice) start afresh.
    const sameKeys = n === nCallouts && cKey.length === n && list.every((c, i) => c.key === cKey[i]);
    nCallouts = n;
    cKey = list.map((c) => c.key);
    cLines = list.map((c) => c.lines);
    cColour = list.map((c) => c.colour);
    cMark = Float64Array.from(list, (c) => c.t);
    cJet = Int16Array.from(list, (c) => c.jet);
    cKind = Uint8Array.from(list, (c) => c.kind);
    cAt = Int16Array.from(list, (c) => c.at);
    if (g) g.font = CALLOUT_FONT;
    cTW = Float32Array.from(list, (c) => Math.max(0, ...c.lines.map((l) => (g ? g.measureText(l).width : 0))));
    cW = Float32Array.from(cTW, (t) => Math.ceil(t) + CALLOUT_STRIPE_PX + 2 * CALLOUT_PAD_PX);
    cH = Float32Array.from(list, (c) => c.lines.length * CALLOUT_LINE_PX + 2 * CALLOUT_PAD_PX);
    cTarget = new Float32Array(n);
    cOrder = new Int16Array(n);
    cPlaced = new Uint8Array(n);
    cX = new Float32Array(n);
    cY = new Float32Array(n);
    if (!sameKeys) fader = new CalloutFader(n);
    // Room for every callout, a blocked box per jet label, two slots per jet beside its burst, and every box words keep
    // off (the targets', a ring per jet, the controls').
    const room = n + 4 * nJ + tags.length + CHROME_BOXES_MAX;
    if (!sameKeys || room !== placerRoom) placer = new CalloutPlacer(room);
    placerRoom = room;
    nCandidates = 0;
  }

  remember(o.source);

  /** A world point (overwritten) to CSS pixels on the canvas; false when it is behind the camera or past its far plane. */
  function toScreen(p: Vector3, camera: PerspectiveCamera, ctx: FrameCtx): boolean {
    p.project(camera);
    if (p.z < -1 || p.z > 1) return false;
    p.x = (p.x * 0.5 + 0.5) * ctx.viewW;
    p.y = (-p.y * 0.5 + 0.5) * ctx.viewH;
    return true;
  }
  const inView = (x: number, y: number, m: number) => x >= -m && x <= w + m && y >= -m && y <= h + m;

  /** A disc with its letters; `squeeze` narrows them to fit inside it (a marker's "ROLL" in a 10 px disc). */
  function disc(x: number, y: number, r: number, fill: string, edge: string, letters: string, ink: string, font: string, squeeze = false) {
    if (!g) return;
    g.beginPath();
    g.arc(x, y, r + DISC_EDGE_PX + DISC_RIM_PX, 0, 2 * Math.PI);
    g.fillStyle = DISC_RIM;
    g.fill();
    g.beginPath();
    g.arc(x, y, r + DISC_EDGE_PX, 0, 2 * Math.PI);
    g.fillStyle = edge;
    g.fill();
    g.beginPath();
    g.arc(x, y, r, 0, 2 * Math.PI);
    g.fillStyle = fill;
    g.fill();
    g.font = font;
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (squeeze) g.fillText(letters, x, y + 0.5, 2 * r - 4);
    else g.fillText(letters, x, y + 0.5);
  }

  /** Callout i's anchor on screen this frame: writes ax, ay, ar; false when it is not on screen. */
  let ax = 0, ay = 0, ar = 0;
  function anchorOf(i: number): boolean {
    const at = cAt[i];
    if (cKind[i] === AT_DISC) {
      if (!discOn[at]) return false;
      ax = discX[at];
      ay = discY[at];
      ar = discR[at] + DISC_EDGE_PX + DISC_RIM_PX;
      return true;
    }
    if (cKind[i] === AT_EGRESS) {
      if (!egOn[at]) return false;
      ax = egX[at];
      ay = egY[at];
      ar = EGRESS_DOT_PX;
      return true;
    }
    const ti = src && at >= 0 && at < src.jetCount ? src.targetIndexOf(at) : -1;
    if (ti < 0 || !tOn[ti]) return false;
    ax = tx[ti];
    ay = ty[ti];
    ar = TARGET_R_PX + DISC_EDGE_PX + DISC_RIM_PX;
    return true;
  }

  return {
    update() {},

    setChromeBoxes(boxes) {
      nChrome = 0;
      for (const b of boxes) {
        if (nChrome >= CHROME_BOXES_MAX) break;
        if (!(b.w > 0 && b.h > 0)) continue; // a control not laid out (hidden, or not there yet) blocks nothing
        chX[nChrome] = b.x;
        chY[nChrome] = b.y;
        chW[nChrome] = b.w;
        chH[nChrome] = b.h;
        nChrome++;
      }
    },

    afterCamera(ctx) {
      if (!g) return;
      if (ctx.source !== src) remember(ctx.source);
      if (ctx.watched !== watched || ctx.attackColours !== colours) rememberPoints(ctx.source, ctx.watched, ctx.attackColours);
      if (ctx.viewW !== w || ctx.viewH !== h || ctx.dpr !== dpr) {
        w = ctx.viewW;
        h = ctx.viewH;
        dpr = ctx.dpr;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      // ── Where everything goes.
      // The targets' discs and tags.
      const tEdge = TARGET_R_PX + DISC_EDGE_PX + DISC_RIM_PX;
      shownTargets = 0;
      for (let i = 0; i < tags.length; i++) {
        tOn[i] = 0;
        if (!toScreen(v.copy(o.targets.markTop(i)), ctx.camera, ctx)) continue;
        if (v.x < -tEdge - tagW[i] - 2 * LABEL_PAD_PX - LABEL_GAP_PX || v.x > w + tEdge || v.y < -tEdge || v.y > h + tEdge) continue;
        tOn[i] = 1;
        tx[i] = v.x;
        ty[i] = v.y;
        const b = shownTargets++;
        tbx[b] = v.x - tEdge;
        tby[b] = v.y - tEdge;
        tbw[b] = 2 * tEdge + LABEL_GAP_PX + tagW[i] + 2 * LABEL_PAD_PX;
        tbh[b] = 2 * tEdge;
      }

      // The jets' labels, beside their arrows.
      shownJets = 0;
      for (let k = 0; k < nJ; k++) {
        const jl = o.jets[k], at = jl.jetPosition();
        if (!at || !toScreen(v.copy(at), ctx.camera, ctx)) continue;
        const text = jetText[k];
        const l2 = ctx.labels ? text.line2(jl.pose, ctx.source.altRefOf(jl.jet)) : undefined;
        // The envelope the jet is inside, whatever Labels says: a warning is not a detail to switch off with the numbers.
        const di = jl.jet < ctx.inside.length ? ctx.inside[jl.jet] : -1;
        const l3s = text.line3(di >= 0 ? ctx.source.domes[di] : undefined);
        const l3 = l3s === '' ? undefined : l3s;
        const n = shownJets++;
        jOf[n] = k;
        jL2[n] = l2;
        jL3[n] = l3;
        jax[n] = v.x;
        jay[n] = v.y;
        jKeepR[n] = Math.max(jl.haloPx(), ARROW_PX / 2);
        jw[n] = Math.max(text.width(1, measureLabel), l2 === undefined ? 0 : text.width(2, measureLabel), l3 === undefined ? 0 : text.width(3, measureLabel)) + 2 * LABEL_PAD_PX;
        jh[n] = (1 + (l2 === undefined ? 0 : 1) + (l3 === undefined ? 0 : 1)) * LABEL_LINE_PX;
      }

      // The rings round the falling bombs: where, how big (the pulse at the release is in it) and how solid.
      // A bomb behind the camera or past its far plane has none; a bomb hidden behind a hill in the 3D still has
      // its ring, as a disc does. Worked out before any words are placed: a coded jet's ring is kept clear of them.
      for (let k = 0; k < nJ; k++) {
        bOn[k] = 0;
        bKeep[k] = 0;
        const at = ctx.impact ? o.jets[k].bombPosition() : undefined;
        if (!at || !toScreen(v.copy(at), ctx.camera, ctx)) continue;
        bombRingLook(jCoded[k] === 1, ringLook);
        const r = ringLook.r * releasePulse(ctx.t - ctx.source.releaseOf(o.jets[k].jet), ctx.speed);
        if (!inView(v.x, v.y, r + 4)) continue;
        bOn[k] = 1;
        bKeep[k] = jCoded[k];
        bx[k] = v.x;
        by[k] = v.y;
        br[k] = r;
        ba[k] = ringLook.alpha;
      }

      // What words keep off besides the targets: the coded jets' rings, then the view's own controls.
      nBlocked = blockKeepClear(shownTargets, tbx, tby, tbw, tbh, nJ, bKeep, bx, by, br, nChrome, chX, chY, chW, chH);
      placeLabels(shownJets, jax, jay, jw, jh, w, h, jx, jy, nBlocked, tbx, tby, tbw, tbh, jSlid, jKeepR);

      // Every jet's discs and the coded jets' egress dots.
      showPoints = ctx.actionPoints !== 'off';
      for (let i = 0; i < discPos.length; i++) {
        discOn[i] = 0;
        if (!showPoints || !toScreen(v.copy(discPos[i]), ctx.camera, ctx) || !inView(v.x, v.y, discR[i] + DISC_EDGE_PX + DISC_RIM_PX)) continue;
        discOn[i] = 1;
        discX[i] = v.x;
        discY[i] = v.y;
      }
      for (let i = 0; i < egPos.length; i++) {
        egOn[i] = 0;
        if (!showPoints || !toScreen(v.copy(egPos[i]), ctx.camera, ctx) || !inView(v.x, v.y, EGRESS_DOT_PX)) continue;
        egOn[i] = 1;
        egX[i] = v.x;
        egY[i] = v.y;
      }

      // The plates' placer starts afresh each frame with the jets' labels, the targets, the coded jets' rings and the
      // view's controls blocked, whatever Show › Action points says: the words beside a burst are placed through it
      // with the action points off too.
      placer.begin(w, h);
      for (let n = 0; n < shownJets; n++) placer.block(jx[n], jy[n], jw[n], jh[n]);
      for (let b = 0; b < nBlocked; b++) placer.block(tbx[b], tby[b], tbw[b], tbh[b]);

      // The callouts: which show and how much, then a spot for each, nearest the playhead first.
      nCandidates = 0;
      if (!showPoints) {
        fader.alpha.fill(0); // switched back on, they fade in afresh
        cPlaced.fill(0); // and their last spots, unseen now, block nothing (a radar's words test them)
      } else {
        nCandidates = calloutTargets(ctx.t, ctx.speed, ctx.actionPoints, cMark, cJet, nCallouts, fader.alpha, cTarget, cOrder);
        if (fader.step(ctx.dt, cTarget, nCallouts)) ctx.again = true;
        cPlaced.fill(0);
        // Those meant to show first, then those fading out.
        for (let pass = 0; pass < 2; pass++) {
          for (let p = 0; p < nCandidates; p++) {
            const i = cOrder[p];
            if ((cTarget[i] > 0) !== (pass === 0) || !(fader.alpha[i] > 0) || !anchorOf(i)) continue;
            if (placer.place(i, ax, ay, ar, cW[i], cH[i]) < 0) continue;
            cPlaced[i] = 1;
            cX[i] = placer.x;
            cY[i] = placer.y;
          }
        }
      }

      // The words beside each burst, after the callouts (so they never push one out), round the flash's core.
      for (let i = 0; i < nI; i++) {
        iOn[i] = 0;
        iPlaced[i] = 0;
        const t = o.impacts[i].tag;
        if (!t.shown || !(t.alpha > 0) || !toScreen(v.copy(t.centre), ctx.camera, ctx)) continue;
        iOn[i] = 1;
        iRadius[i] = t.withRadius ? 1 : 0;
        const tw = t.withRadius ? tagWithW[i] : tagWithoutW[i], th = t.withRadius ? tagWithH[i] : tagWithoutH[i];
        if (placer.place(nCallouts + 2 * i, v.x, v.y, FLASH_R_PX, tw, th) < 0) continue;
        iPlaced[i] = 1;
        iX[i] = placer.x;
        iY[i] = placer.y;
      }

      // The words beside each switched-on radar's ring, last: to the right of the ring's point nearest the lead's target,
      // and left out (never moved) where they would cover any other words, an action-point disc, or leave the picture.
      if (ctx.groundVersion !== ewrGround) {
        for (let e = 0; e < ewrDome.length; e++) ewrPy[e] = ctx.heightAt(ewrPx[e], ewrPz[e]) + 1;
        ewrGround = ctx.groundVersion;
      }
      for (let e = 0; e < ewrDome.length; e++) {
        ewrOn[e] = 0;
        ewrPlaced[e] = 0;
        if (!ctx.domeMask[ewrDome[e]] || !toScreen(v.set(ewrPx[e], ewrPy[e], ewrPz[e]), ctx.camera, ctx) || !inView(v.x, v.y, 0)) continue;
        ewrOn[e] = 1;
        ewrDotX[e] = v.x;
        ewrDotY[e] = v.y;
        ewrX[e] = v.x + LABEL_GAP_PX;
        ewrY[e] = v.y - LABEL_LINE_PX / 2;
        if (ewrX[e] + ewrW[e] > w || ewrY[e] < 0 || ewrY[e] + LABEL_LINE_PX > h || coversWords(ewrX[e], ewrY[e], ewrW[e], LABEL_LINE_PX, e)) continue;
        ewrPlaced[e] = 1;
      }

      // ── Drawing, bottom to top.
      // A jet's label slid away from its arrow's row (no corner was free) is joined to its arrow by a thin line in the jet's
      // own colour, from the arrow to the nearest corner of its plate: which jet a label names never rests on where it
      // stands. Drawn first, so every disc, tag and plate lies over it and it never crosses a target's name.
      for (let n = 0; n < shownJets; n++) {
        if (!jSlid[n]) continue;
        const cx = jax[n] - jx[n] < jx[n] + jw[n] - jax[n] ? jx[n] : jx[n] + jw[n];
        const cy = jay[n] - jy[n] < jy[n] + jh[n] - jay[n] ? jy[n] : jy[n] + jh[n];
        g.beginPath();
        g.moveTo(jax[n], jay[n]);
        g.lineTo(cx, cy);
        g.strokeStyle = o.jets[jOf[n]].colour;
        g.lineWidth = CALLOUT_LEADER_PX;
        g.stroke();
      }

      if (showPoints) {
        // In array order: the other jets' small, faint discs first, the coded jets' on top of them.
        for (let i = 0; i < discPos.length; i++) {
          if (!discOn[i]) continue;
          g.globalAlpha = discAlpha[i];
          disc(discX[i], discY[i], discR[i], discFill[i], discEdge[i], discText[i], discInk[i], MARKER_FONT, true);
        }
        g.globalAlpha = 1;
        for (let i = 0; i < egPos.length; i++) {
          if (!egOn[i]) continue;
          g.beginPath();
          g.arc(egX[i], egY[i], EGRESS_DOT_PX + 1, 0, 2 * Math.PI);
          g.fillStyle = DISC_EDGE;
          g.fill();
          g.beginPath();
          g.arc(egX[i], egY[i], EGRESS_DOT_PX, 0, 2 * Math.PI);
          g.fillStyle = LABEL_STYLE.egressBorder;
          g.fill();
        }
      }

      for (let i = 0; i < tags.length; i++) {
        if (!tOn[i]) continue;
        disc(tx[i], ty[i], TARGET_R_PX, MARKER_COLOR.TGT, DISC_EDGE, 'TGT', TGT_INK, TARGET_FONT);
        // The tag on its plate, to the right of the disc, centred on it.
        const px = tx[i] + tEdge + LABEL_GAP_PX, py = ty[i] - LABEL_LINE_PX / 2;
        g.fillStyle = LABEL_PLATE;
        g.fillRect(px, py, tagW[i] + 2 * LABEL_PAD_PX, LABEL_LINE_PX);
        g.font = LABEL_FONT;
        g.fillStyle = LABEL_TEXT;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(tags[i], px + LABEL_PAD_PX, ty[i] + 0.5);
      }

      // The bombs' rings: a dark band under a white line, the discs' own edge, open so the bomb shows through.
      // The other jets' first and fainter, the coded jets' on top of them.
      for (let pass = 0; pass < 2; pass++) {
        for (let k = 0; k < nJ; k++) {
          if (!bOn[k] || jCoded[k] !== pass) continue;
          g.globalAlpha = ba[k];
          g.beginPath();
          g.arc(bx[k], by[k], br[k], 0, 2 * Math.PI);
          g.strokeStyle = DISC_EDGE;
          g.lineWidth = BOMB_RING_EDGE_PX;
          g.stroke();
          g.strokeStyle = DISC_RIM;
          g.lineWidth = BOMB_RING_LINE_PX;
          g.stroke();
        }
      }
      g.globalAlpha = 1;

      for (let p = 0; p < nCandidates; p++) {
        const i = cOrder[p];
        if (!cPlaced[i] || !anchorOf(i)) continue;
        const px = cX[i], py = cY[i], pw = cW[i], ph = cH[i];
        g.globalAlpha = fader.alpha[i];
        // A thin line from the disc's rim to the nearest point of the plate.
        const nx = clamp(ax, px, px + pw), ny = clamp(ay, py, py + ph), dx = nx - ax, dy = ny - ay, L = Math.hypot(dx, dy);
        if (L > ar) {
          g.beginPath();
          g.moveTo(ax + (dx / L) * ar, ay + (dy / L) * ar);
          g.lineTo(nx, ny);
          g.strokeStyle = CALLOUT_LEADER;
          g.lineWidth = CALLOUT_LEADER_PX;
          g.stroke();
        }
        g.fillStyle = LABEL_STYLE.tooltipBg;
        g.fillRect(px, py, pw, ph);
        g.strokeStyle = LABEL_STYLE.tooltipBorder;
        g.lineWidth = 1;
        g.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
        g.fillStyle = cColour[i];
        g.fillRect(px, py, CALLOUT_STRIPE_PX, ph);
        g.font = CALLOUT_FONT;
        g.fillStyle = LABEL_STYLE.tooltipText;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        const lines = cLines[i];
        for (let k = 0; k < lines.length; k++) g.fillText(lines[k], px + CALLOUT_STRIPE_PX + CALLOUT_PAD_PX, py + CALLOUT_PAD_PX + (k + 0.5) * CALLOUT_LINE_PX + 0.5);
      }
      g.globalAlpha = 1;

      // The words beside the bursts, on the jets' dark plate, fading with the ring; under the jets' labels.
      for (let i = 0; i < nI; i++) {
        if (!iPlaced[i]) continue;
        const lines = iRadius[i] ? tagWith[i] : tagWithout[i];
        g.globalAlpha = o.impacts[i].tag.alpha;
        g.fillStyle = LABEL_PLATE;
        g.fillRect(iX[i], iY[i], iRadius[i] ? tagWithW[i] : tagWithoutW[i], iRadius[i] ? tagWithH[i] : tagWithoutH[i]);
        g.font = LABEL_FONT;
        g.fillStyle = LABEL_TEXT;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        for (let k = 0; k < lines.length; k++) g.fillText(lines[k], iX[i] + LABEL_PAD_PX, iY[i] + (k + 0.5) * LABEL_LINE_PX + 0.5);
      }
      g.globalAlpha = 1;

      // The radars' words: a dot in the ring's own colour on its point, then the plate beside it.
      for (let e = 0; e < ewrDome.length; e++) {
        if (!ewrPlaced[e]) continue;
        const d = ctx.source.domes[ewrDome[e]];
        g.beginPath();
        g.arc(ewrDotX[e], ewrDotY[e], EGRESS_DOT_PX + 1, 0, 2 * Math.PI);
        g.fillStyle = DISC_EDGE;
        g.fill();
        g.beginPath();
        g.arc(ewrDotX[e], ewrDotY[e], EGRESS_DOT_PX, 0, 2 * Math.PI);
        g.fillStyle = d && d.active ? DOME_ACTIVE : DOME_IDLE;
        g.fill();
        g.fillStyle = LABEL_PLATE;
        g.fillRect(ewrX[e], ewrY[e], ewrW[e], LABEL_LINE_PX);
        g.font = LABEL_FONT;
        g.fillStyle = LABEL_TEXT;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(ewrText[e], ewrX[e] + LABEL_PAD_PX, ewrY[e] + LABEL_LINE_PX / 2 + 0.5);
      }

      for (let n = 0; n < shownJets; n++) {
        const k = jOf[n], l2 = jL2[n], l3 = jL3[n];
        g.fillStyle = LABEL_PLATE;
        g.fillRect(jx[n], jy[n], jw[n], jh[n]);
        g.font = LABEL_FONT;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillStyle = o.jets[k].colour;
        g.fillText(jetText[k].line1, jx[n] + LABEL_PAD_PX, jy[n] + LABEL_LINE_PX / 2 + 0.5);
        let row = 1;
        if (l2 !== undefined) {
          g.fillStyle = LABEL_TEXT;
          g.fillText(l2, jx[n] + LABEL_PAD_PX, jy[n] + (row + 0.5) * LABEL_LINE_PX + 0.5);
          row++;
        }
        if (l3 !== undefined) {
          g.fillStyle = LABEL_WARN;
          g.fillText(l3, jx[n] + LABEL_PAD_PX, jy[n] + (row + 0.5) * LABEL_LINE_PX + 0.5);
        }
      }
    },

    debugLabels() {
      const targets: LabelDebug['targets'] = [];
      let b = 0;
      (src?.targets ?? []).forEach((t, i) => {
        if (!tOn[i]) return;
        targets.push({ key: t.key, x: tx[i], y: ty[i], tag: tags[i], box: [tbx[b], tby[b], tbw[b], tbh[b]] });
        b++;
      });
      const markers: LabelDebug['markers'] = [];
      if (showPoints) discKey.forEach((key, i) => {
        if (discOn[i]) markers.push({ key, x: discX[i], y: discY[i], r: discR[i] });
      });
      const callouts: LabelDebug['callouts'] = [];
      for (let p = 0; p < nCandidates; p++) {
        const i = cOrder[p];
        if (!(fader.alpha[i] > 0)) continue;
        callouts.push({ key: cKey[i], lines: cLines[i], alpha: fader.alpha[i], x: cX[i], y: cY[i], w: cW[i], h: cH[i], placed: !!cPlaced[i] });
      }
      const jets: LabelDebug['jets'] = [];
      for (let n = 0; n < shownJets; n++) {
        const k = jOf[n], l2 = jL2[n], l3 = jL3[n];
        const lines = [jetText[k].line1];
        if (l2 !== undefined) lines.push(l2);
        if (l3 !== undefined) lines.push(l3);
        jets.push({ key: src ? src.labelOf(o.jets[k].jet) : '', lines, x: jx[n], y: jy[n], w: jw[n], h: jh[n], ax: jax[n], ay: jay[n], keepR: jKeepR[n], slid: jSlid[n] === 1, colour: o.jets[k].colour });
      }
      const bombs: LabelDebug['bombs'] = [];
      for (let k = 0; k < nJ; k++) {
        if (bOn[k]) bombs.push({ jet: o.jets[k].jet, x: bx[k], y: by[k], r: br[k], alpha: ba[k] });
      }
      const tagList: LabelDebug['tags'] = [];
      for (let i = 0; i < nI; i++) {
        if (!iOn[i]) continue;
        const r = iRadius[i] === 1;
        tagList.push({
          key: `impact-${o.impacts[i].jet}`, kind: 'impact', lines: r ? tagWith[i] : tagWithout[i], alpha: o.impacts[i].tag.alpha,
          x: iX[i], y: iY[i], w: r ? tagWithW[i] : tagWithoutW[i], h: r ? tagWithH[i] : tagWithoutH[i], placed: !!iPlaced[i],
        });
      }
      const chrome: ScreenBox[] = [];
      for (let i = 0; i < nChrome; i++) chrome.push({ x: chX[i], y: chY[i], w: chW[i], h: chH[i] });
      // The kept boxes after the targets', in the order blockKeepClear wrote them: the kept rings by jet, then the controls.
      const kept: LabelDebug['kept'] = [];
      let at = shownTargets;
      for (let k = 0; k < nJ && at < nBlocked; k++) {
        if (!bKeep[k]) continue;
        kept.push({ kind: 'ring', jet: o.jets[k].jet, x: tbx[at], y: tby[at], w: tbw[at], h: tbh[at] });
        at++;
      }
      for (; at < nBlocked; at++) kept.push({ kind: 'chrome', x: tbx[at], y: tby[at], w: tbw[at], h: tbh[at] });
      const ewr: LabelDebug['ewr'] = [];
      for (let e = 0; e < ewrDome.length; e++) {
        if (!ewrOn[e]) continue;
        ewr.push({ key: src?.domes[ewrDome[e]]?.threatId ?? '', text: ewrText[e], x: ewrX[e], y: ewrY[e], w: ewrW[e], h: LABEL_LINE_PX, placed: !!ewrPlaced[e] });
      }
      return { targets, markers, callouts, jets, bombs, tags: tagList, chrome, kept, ewr };
    },

    dispose() {
      canvas.remove();
    },
  };
}
