/**
 * The card's side view, laid over the 3D picture while the Side view button is pressed: the very picture the
 * kneeboard card and the attack editor draw (drawSideProfile, on the watched jet's own side profile, in the card's
 * Day colours), with the watched jet and its bomb moving on it as the clock runs.
 *
 * Two canvases, one over the other. The picture is drawn once for its size and jet. The dots are drawn on a clear
 * canvas above it after every frame the scene works out (scene.onDraw), so the picture itself is never redrawn
 * while it plays. The scene draws nothing meanwhile (the panel covers all of it): the clock and the layers still
 * move, and it is switched back on when another view is picked.
 *
 * The jet shows from the IP to its release and then its bomb to the target, in the card's own axes (range to its own
 * target across, height above it up), on the plan layer, the card's own lines: not the 3D's rounded corners.
 */
import { useEffect, useRef, useState } from 'react';
import type { StrikePlayback, StrikeTiming } from '../../lib/playback';
import {
  newSideDots, newSideScratch, sideCaption, sideDotsInto, sideMapping,
  SIDE_BOMB_R_PX, SIDE_INK, SIDE_JET_R_PX, SIDE_JET_RIM_PX, SIDE_LABEL_FONT, SIDE_LABEL_GAP_PX, SIDE_PAPER,
  type SideMap,
} from '../../lib/playbackScene';
import { drawSideProfile } from '../../lib/renderKneeboardCanvas';
import type { PlaybackScene } from './scene/createScene';
import { SIDE_BG } from './ui';

interface SidePanelProps {
  scene: PlaybackScene;
  pb: StrikePlayback;
  /** The strike at the times as they stand: where the dots are depends on them. */
  timing: StrikeTiming;
  /** The watched jet (a playback index). */
  jet: number;
  /** Its seat label, "#3", and its callsign when it has one. */
  seat: string;
  callsign?: string;
  /** Its seat colour. */
  colour: string;
}

/** A backing store sized for the device (no finer than twice the CSS pixels), with the 2D context scaled to CSS pixels. */
function sizeCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function SidePanel({ scene, pb, timing, jet, seat, callsign, colour }: SidePanelProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const side = pb.jets[jet]?.side;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (s.w === Math.floor(width) && s.h === Math.floor(height) ? s : { w: Math.floor(width), h: Math.floor(height) }));
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // The card's own picture, again whenever its box or its jet changes.
  useEffect(() => {
    const canvas = pictureRef.current;
    if (!canvas || !side || size.w === 0 || size.h === 0) return;
    const ctx = sizeCanvas(canvas, size.w, size.h);
    if (ctx) drawSideProfile(ctx, side, { x: 0, y: 0, w: size.w, h: size.h });
  }, [side, size]);

  // The dots: once now, then after every frame the scene works out. The listener is made afresh whenever the times,
  // the jet or the box change, so it always reads the times as they stand.
  useEffect(() => {
    const canvas = dotsRef.current;
    if (!canvas || !side || size.w === 0 || size.h === 0) return;
    const ctx = sizeCanvas(canvas, size.w, size.h);
    if (!ctx) return;
    const map: SideMap = sideMapping(side, { x: 0, y: 0, w: size.w, h: size.h });
    const dots = newSideDots();
    const scratch = newSideScratch();
    const { w, h } = size;
    // Off the picture (the IP is far to the left of what the card draws) there is nothing to see: leave it undrawn.
    const inside = (x: number, y: number, r: number) => x > -r && x < w + r && y > -r && y < h + r;
    const paint = (t_s: number) => {
      ctx.clearRect(0, 0, w, h);
      sideDotsInto(dots, pb, timing, jet, t_s, map, scratch);
      if (dots.bomb.visible && inside(dots.bomb.x, dots.bomb.y, SIDE_BOMB_R_PX)) {
        ctx.fillStyle = SIDE_INK;
        ctx.beginPath();
        ctx.arc(dots.bomb.x, dots.bomb.y, SIDE_BOMB_R_PX, 0, 2 * Math.PI);
        ctx.fill();
      }
      if (dots.jet.visible && inside(dots.jet.x, dots.jet.y, SIDE_JET_R_PX + SIDE_JET_RIM_PX)) {
        const { x, y } = dots.jet;
        ctx.fillStyle = colour;
        ctx.strokeStyle = SIDE_INK;
        ctx.lineWidth = SIDE_JET_RIM_PX;
        ctx.beginPath();
        ctx.arc(x, y, SIDE_JET_R_PX, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        // The seat label in dark ink on a halo of the paper's own colour, so the picture's lines under it do not cut it up.
        ctx.font = SIDE_LABEL_FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = SIDE_PAPER;
        ctx.strokeText(seat, x + SIDE_JET_R_PX + SIDE_LABEL_GAP_PX, y);
        ctx.fillStyle = SIDE_INK;
        ctx.fillText(seat, x + SIDE_JET_R_PX + SIDE_LABEL_GAP_PX, y);
      }
    };
    paint(scene.clock.time);
    return scene.onDraw(paint);
  }, [scene, pb, timing, jet, side, size, seat, colour]);

  return (
    <div ref={wrapRef} data-side-view="" className={`absolute inset-0 ${SIDE_BG}`}>
      <canvas ref={pictureRef} data-side-picture="" role="img" aria-label={`${seat}'s side view, as on the card`} className="absolute inset-0" style={{ width: size.w, height: size.h }} />
      <canvas ref={dotsRef} data-side-dots="" aria-hidden className="absolute inset-0 pointer-events-none" style={{ width: size.w, height: size.h }} />
      {!side && <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">No side view for this jet</div>}
      <div className="absolute bottom-2 left-3 max-w-[60%] pointer-events-none text-xs text-gray-700">{sideCaption(seat, callsign)}</div>
    </div>
  );
}
