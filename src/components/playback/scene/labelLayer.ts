/**
 * The 3D view's 2D overlay: one plain canvas laid over the WebGL canvas
 * (position absolute, filling the host, never taking the mouse), redrawn
 * after the camera on every frame the scene draws. Discs and words are
 * drawn here rather than as textures in the 3D scene, so they stay a set
 * size on screen, sharp at any distance, and their look is ordinary canvas
 * code that is easy to restyle.
 *
 * It draws, for each distinct target, the planner's red TGT disc (the map's
 * and the card's own mark) on the top of the target's post, with a dark
 * edge and a white rim so it reads over pale land and dark sky alike, and
 * the target's tag on a plate to the right of it ("TGT1 · #1 #3": the
 * waypoint's name, then every seat on it, so whose target it is never rests
 * on colour).
 *
 * The backing store follows the canvas's CSS size times the scene's capped
 * device pixel ratio, so text is sharp on a Retina screen without costing
 * more pixels than the 3D itself draws. Strings and their widths are worked
 * out once per source, never per frame.
 */
import { Vector3, type PerspectiveCamera } from 'three';
import { MARKER_COLOR } from '../../../lib/attackPicture';
import {
  DISC_EDGE, DISC_EDGE_PX, DISC_RIM, DISC_RIM_PX, LABEL_FONT, LABEL_GAP_PX, LABEL_LINE_PX, LABEL_PAD_PX, LABEL_PLATE, LABEL_TEXT,
  TARGET_FONT, TARGET_R_PX, letterInk, targetTag, type SceneSource,
} from '../../../lib/playbackScene';
import type { DisposeBag } from './disposeBag';
import type { FrameCtx, Layer } from './layer';
import type { TargetLayer } from './targetLayer';

/** What was drawn on the last frame, CSS pixels from the canvas's top left. For the screenshot checks. */
export interface LabelDebug {
  targets: { key: string; x: number; y: number; tag: string }[];
}

export interface LabelLayer extends Layer {
  /** What the last drawn frame put on the overlay (allocated only when called). */
  debugLabels(): LabelDebug;
}

const TGT_INK = letterInk(MARKER_COLOR.TGT);

export function createLabelLayer(o: { host: HTMLElement; source: SceneSource; targets: TargetLayer; bag: DisposeBag }): LabelLayer {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.labels = '';
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  o.host.appendChild(canvas); // after the WebGL canvas, so it is drawn over it
  const g = canvas.getContext('2d');

  let src: SceneSource | undefined;
  let tags: string[] = [];
  let tagW = new Float32Array(0);
  // Where each target's disc was drawn last frame (NaN when it was not), for debugLabels.
  let drawnX = new Float32Array(0), drawnY = new Float32Array(0);
  let w = 0, h = 0, dpr = 0;
  const v = new Vector3();

  /** The tags and their widths, once per source. */
  function remember(s: SceneSource) {
    src = s;
    tags = s.targets.map((t) => targetTag(t, s.seatLabels));
    if (g) g.font = LABEL_FONT;
    tagW = Float32Array.from(tags, (t) => (g ? g.measureText(t).width : 0));
    drawnX = new Float32Array(tags.length).fill(NaN);
    drawnY = new Float32Array(tags.length).fill(NaN);
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

  function disc(x: number, y: number, r: number, fill: string, letters: string, ink: string, font: string) {
    if (!g) return;
    g.beginPath();
    g.arc(x, y, r + DISC_EDGE_PX + DISC_RIM_PX, 0, 2 * Math.PI);
    g.fillStyle = DISC_RIM;
    g.fill();
    g.beginPath();
    g.arc(x, y, r + DISC_EDGE_PX, 0, 2 * Math.PI);
    g.fillStyle = DISC_EDGE;
    g.fill();
    g.beginPath();
    g.arc(x, y, r, 0, 2 * Math.PI);
    g.fillStyle = fill;
    g.fill();
    g.font = font;
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letters, x, y + 0.5);
  }

  return {
    update() {},

    afterCamera(ctx) {
      if (!g) return;
      if (ctx.source !== src) remember(ctx.source);
      if (ctx.viewW !== w || ctx.viewH !== h || ctx.dpr !== dpr) {
        w = ctx.viewW;
        h = ctx.viewH;
        dpr = ctx.dpr;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const r = TARGET_R_PX, edge = r + DISC_EDGE_PX + DISC_RIM_PX;
      for (let i = 0; i < tags.length; i++) {
        drawnX[i] = drawnY[i] = NaN;
        if (!toScreen(v.copy(o.targets.markTop(i)), ctx.camera, ctx)) continue;
        if (v.x < -edge - tagW[i] - 2 * LABEL_PAD_PX - LABEL_GAP_PX || v.x > w + edge || v.y < -edge || v.y > h + edge) continue;
        disc(v.x, v.y, r, MARKER_COLOR.TGT, 'TGT', TGT_INK, TARGET_FONT);
        // The tag on its plate, to the right of the disc, centred on it.
        const px = v.x + edge + LABEL_GAP_PX, py = v.y - LABEL_LINE_PX / 2;
        g.fillStyle = LABEL_PLATE;
        g.fillRect(px, py, tagW[i] + 2 * LABEL_PAD_PX, LABEL_LINE_PX);
        g.font = LABEL_FONT;
        g.fillStyle = LABEL_TEXT;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(tags[i], px + LABEL_PAD_PX, v.y + 0.5);
        drawnX[i] = v.x;
        drawnY[i] = v.y;
      }
    },

    debugLabels() {
      const targets: LabelDebug['targets'] = [];
      (src?.targets ?? []).forEach((t, i) => {
        if (Number.isFinite(drawnX[i])) targets.push({ key: t.key, x: drawnX[i], y: drawnY[i], tag: tags[i] });
      });
      return { targets };
    },

    dispose() {
      canvas.remove();
    },
  };
}
