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
 * - The planner's words at the watched jet's points (every jet's with All
 *   jets), word for word what the map and the
 *   card print, on a white plate joined to its disc by a thin line: the
 *   markers' lines, the IP and egress labels, and the TGT marker's line at the
 *   target when the bombs land. As they come (the default), each shows from a
 *   little before the jet reaches its point to a little after, in real
 *   seconds whatever the speed, three of one jet's at most, fading in and
 *   out; Always, all of them. A plate that finds no free spot round its disc
 *   is left out that frame (its disc stays): it never covers another label.
 * - Each jet's label beside its arrow: "#1 Viper 1-1" in the jet's colour,
 *   and, with Show › Labels on, its altitude and speed as the planner prints
 *   them. It takes the side of the arrow that leaves a target's disc and tag
 *   uncovered (the jet passes right by its target at release).
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
  CALLOUT_FONT, CALLOUT_LEADER, CALLOUT_LEADER_PX, CALLOUT_LINE_PX, CALLOUT_PAD_PX, CALLOUT_STRIPE_PX, CalloutFader, CalloutPlacer,
  DISC_EDGE, DISC_EDGE_PX, DISC_RIM, DISC_RIM_PX, EGRESS_DOT_PX, LABEL_FONT, LABEL_GAP_PX, LABEL_LINE_PX, LABEL_PAD_PX, LABEL_PLATE, LABEL_TEXT,
  LabelText, MARKER_FONT, MARKER_OTHER_R_PX, MARKER_R_PX, OTHER_MARKER_ALPHA, TARGET_FONT, TARGET_R_PX, calloutTargets, letterInk, placeLabels, targetTag,
  type AttackColours, type SceneSource,
} from '../../../lib/playbackScene';
import type { DisposeBag } from './disposeBag';
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
  /** Each jet's label: its lines as shown, and its plate. */
  jets: { key: string; lines: string[]; x: number; y: number; w: number; h: number }[];
}

export interface LabelLayer extends Layer {
  /** What the last drawn frame put on the overlay (allocated only when called). */
  debugLabels(): LabelDebug;
}

const TGT_INK = letterInk(MARKER_COLOR.TGT);
const IP_INK = letterInk(LABEL_STYLE.ipBg);
/** What a callout hangs from: one of the discs, an egress dot, or its jet's target's disc. */
const AT_DISC = 0, AT_EGRESS = 1, AT_TARGET = 2;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function createLabelLayer(o: { host: HTMLElement; source: SceneSource; targets: TargetLayer; jets: readonly JetLayer[]; bag: DisposeBag }): LabelLayer {
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
  // The box round each target on screen this frame, its disc and its tag together: no jet's label and no plate covers it.
  let tbx = new Float32Array(0), tby = new Float32Array(0), tbw = new Float32Array(0), tbh = new Float32Array(0);
  let shownTargets = 0;
  let jetText: LabelText[] = [];
  // Per jet layer, each frame: anchor, plate size and place, whether shown, the second line shown.
  const nJ = o.jets.length;
  const jax = new Float32Array(nJ), jay = new Float32Array(nJ), jw = new Float32Array(nJ), jh = new Float32Array(nJ);
  const jx = new Float32Array(nJ), jy = new Float32Array(nJ), jOf = new Int16Array(nJ);
  const jL2: (string | undefined)[] = new Array(nJ).fill(undefined);
  let shownJets = 0;

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
  let fader = new CalloutFader(0), placer = new CalloutPlacer(1);
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
    tbx = new Float32Array(tags.length);
    tby = new Float32Array(tags.length);
    tbw = new Float32Array(tags.length);
    tbh = new Float32Array(tags.length);
    jetText = o.jets.map((jl) => new LabelText(s.labelOf(jl.jet), s.callsignOf(jl.jet)));
    watched = -1; // the discs and callouts are made again for this source
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
    fader = new CalloutFader(n);
    placer = new CalloutPlacer(n + nJ + tags.length);
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
        const n = shownJets++;
        jOf[n] = k;
        jL2[n] = l2;
        jax[n] = v.x;
        jay[n] = v.y;
        jw[n] = Math.max(text.width(1, measureLabel), l2 === undefined ? 0 : text.width(2, measureLabel)) + 2 * LABEL_PAD_PX;
        jh[n] = (l2 === undefined ? 1 : 2) * LABEL_LINE_PX;
      }
      placeLabels(shownJets, jax, jay, jw, jh, w, h, jx, jy, shownTargets, tbx, tby, tbw, tbh);

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

      // The callouts: which show and how much, then a spot for each, nearest the playhead first.
      nCandidates = 0;
      if (!showPoints) {
        fader.alpha.fill(0); // switched back on, they fade in afresh
      } else {
        nCandidates = calloutTargets(ctx.t, ctx.speed, ctx.actionPoints, cMark, cJet, nCallouts, fader.alpha, cTarget, cOrder);
        if (fader.step(ctx.dt, cTarget, nCallouts)) ctx.again = true;
        placer.begin(w, h);
        for (let n = 0; n < shownJets; n++) placer.block(jx[n], jy[n], jw[n], jh[n]);
        for (let b = 0; b < shownTargets; b++) placer.block(tbx[b], tby[b], tbw[b], tbh[b]);
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

      // ── Drawing, bottom to top.
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

      for (let n = 0; n < shownJets; n++) {
        const k = jOf[n], l2 = jL2[n];
        g.fillStyle = LABEL_PLATE;
        g.fillRect(jx[n], jy[n], jw[n], jh[n]);
        g.font = LABEL_FONT;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillStyle = o.jets[k].colour;
        g.fillText(jetText[k].line1, jx[n] + LABEL_PAD_PX, jy[n] + LABEL_LINE_PX / 2 + 0.5);
        if (l2 !== undefined) {
          g.fillStyle = LABEL_TEXT;
          g.fillText(l2, jx[n] + LABEL_PAD_PX, jy[n] + 1.5 * LABEL_LINE_PX + 0.5);
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
        const k = jOf[n], l2 = jL2[n];
        jets.push({ key: src ? src.labelOf(o.jets[k].jet) : '', lines: l2 === undefined ? [jetText[k].line1] : [jetText[k].line1, l2], x: jx[n], y: jy[n], w: jw[n], h: jh[n] });
      }
      return { targets, markers, callouts, jets };
    },

    dispose() {
      canvas.remove();
    },
  };
}
