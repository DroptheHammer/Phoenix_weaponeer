import { useRef, type PointerEvent, type WheelEvent } from 'react';
import { FullScreenCard } from './FullScreenCard';

interface CardZoomProps {
  src: string;
  label: string;
  onClose: () => void;
}

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;

interface View {
  scale: number;
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

const midpoint = (points: Point[]): Point => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});
const spread = (points: Point[]) => (points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));

/**
 * One card, full screen: pinch to zoom, drag to pan, double-tap to zoom in on
 * a spot or back out. Done by hand rather than with the browser's own page
 * zoom, which would zoom the ✕ off the screen too.
 */
export function CardZoom({ src, label, onClose }: CardZoomProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const view = useRef<View>({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  // The gesture so far: where it started, re-taken whenever a finger lands or lifts.
  const start = useRef<{ view: View; mid: Point; spread: number; moved: boolean } | null>(null);
  const lastTap = useRef<{ at: number; point: Point } | null>(null);

  /** A pointer's position from the middle of the frame, where the card is centred. */
  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = frameRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
      : { x: 0, y: 0 };
  };

  /** Show `next`, kept from sliding the card out of view. */
  const apply = (next: View) => {
    const scale = Math.min(MAX_SCALE, Math.max(1, next.scale));
    const frame = frameRef.current;
    const img = imgRef.current;
    let { x, y } = next;
    if (frame && img) {
      const maxX = Math.max(0, (img.offsetWidth * scale - frame.clientWidth) / 2);
      const maxY = Math.max(0, (img.offsetHeight * scale - frame.clientHeight) / 2);
      x = Math.min(maxX, Math.max(-maxX, x));
      y = Math.min(maxY, Math.max(-maxY, y));
    }
    if (scale === 1) x = y = 0;
    view.current = { scale, x, y };
    if (img) img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };

  /** Zoom to `scale`, keeping the spot under `at` where it is. */
  const zoomAbout = (from: View, at: Point, scale: number) => {
    const contentX = (at.x - from.x) / from.scale;
    const contentY = (at.y - from.y) / from.scale;
    apply({ scale, x: at.x - contentX * scale, y: at.y - contentY * scale });
  };

  const restart = (moved = false) => {
    const points = [...pointers.current.values()];
    start.current = points.length ? { view: { ...view.current }, mid: midpoint(points), spread: spread(points), moved } : null;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, local(event));
    restart(pointers.current.size > 1);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !start.current) return;
    pointers.current.set(event.pointerId, local(event));
    const points = [...pointers.current.values()];
    const s = start.current;
    const mid = midpoint(points);
    if (Math.hypot(mid.x - s.mid.x, mid.y - s.mid.y) > 8) s.moved = true;
    if (points.length >= 2 && s.spread > 0) {
      const scale = s.view.scale * (spread(points) / s.spread);
      const contentX = (s.mid.x - s.view.x) / s.view.scale;
      const contentY = (s.mid.y - s.view.y) / s.view.scale;
      apply({ scale, x: mid.x - contentX * scale, y: mid.y - contentY * scale });
    } else if (s.view.scale > 1) {
      apply({ ...s.view, x: s.view.x + mid.x - s.mid.x, y: s.view.y + mid.y - s.mid.y });
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    const wasTap = pointers.current.size === 1 && s !== null && !s.moved;
    const point = local(event);
    pointers.current.delete(event.pointerId);
    restart(true);
    if (!wasTap) return;

    const now = event.timeStamp;
    const prev = lastTap.current;
    if (prev && now - prev.at < DOUBLE_TAP_MS && Math.hypot(point.x - prev.point.x, point.y - prev.point.y) < 40) {
      lastTap.current = null;
      if (view.current.scale > 1.05) apply({ scale: 1, x: 0, y: 0 });
      else zoomAbout(view.current, point, DOUBLE_TAP_SCALE);
    } else {
      lastTap.current = { at: now, point };
    }
  };

  // A mouse wheel or trackpad, for a narrow desktop browser.
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    zoomAbout(view.current, local(event), view.current.scale * Math.exp(-event.deltaY * 0.002));
  };

  return (
    <FullScreenCard label={`${label}, zoomed`} onClose={onClose} footer="Pinch or double-tap to zoom">
      <div
        className="absolute inset-0 overflow-hidden touch-none"
        style={{
          padding:
            'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        }}
      >
        <div
          ref={frameRef}
          className="w-full h-full flex items-center justify-center"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <img
            ref={imgRef}
            src={src}
            alt={label}
            draggable={false}
            className="max-w-full max-h-full object-contain origin-center will-change-transform"
          />
        </div>
      </div>
    </FullScreenCard>
  );
}
