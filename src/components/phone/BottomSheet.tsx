import { useRef, useState, type ReactNode, type PointerEvent } from 'react';

type Snap = 'half' | 'full';

/** Share of the space above the tab bar the sheet covers at each height. */
const HEIGHT: Record<Snap, number> = { half: 0.55, full: 1 };

interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Kept mounted but out of sight, e.g. while the map waits for a crosshair pick. */
  hidden?: boolean;
}

/**
 * The phone layout's panel: slides up over the map from the tab bar.
 *
 * Half height leaves the map in view above it, so a planner can see the attack
 * while editing its list; full height is for long lists. Tap the handle to
 * switch, or drag it — let go near the top for full, the middle for half, or
 * low down to close.
 */
export function BottomSheet({ title, onClose, children, hidden = false }: BottomSheetProps) {
  const [snap, setSnap] = useState<Snap>('half');
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number; container: number; moved: boolean } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const container = sheetRef.current?.parentElement?.clientHeight ?? window.innerHeight;
    drag.current = { startY: event.clientY, startHeight: HEIGHT[snap] * container, container, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = event.clientY - d.startY;
    if (Math.abs(dy) > 6) d.moved = true;
    if (d.moved) setDragHeight(Math.min(d.container, Math.max(0, d.startHeight - dy)));
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      setSnap(snap === 'half' ? 'full' : 'half');
      return;
    }
    const share = (dragHeight ?? d.startHeight) / d.container;
    setDragHeight(null);
    if (share < 0.25) onClose();
    else setSnap(share > 0.78 ? 'full' : 'half');
  };

  const height = dragHeight !== null ? `${dragHeight}px` : `${HEIGHT[snap] * 100}%`;

  return (
    <div
      ref={sheetRef}
      className={`absolute inset-x-0 bottom-0 z-[1100] flex flex-col bg-dcs-navy rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.5)] ${
        dragHeight === null ? 'transition-[height] duration-200' : ''
      } ${hidden ? 'hidden' : ''}`}
      style={{ height }}
      role="dialog"
      aria-label={title}
    >
      <div
        className="shrink-0 cursor-grab touch-none select-none pt-2 pb-1"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={snap === 'half' ? 'Expand' : 'Shrink'}
        role="button"
      >
        <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-500" />
      </div>
      <div className="shrink-0 flex items-center justify-between px-4 pb-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          onClick={onClose}
          className="w-11 h-11 -mr-2 flex items-center justify-center text-2xl text-gray-400 hover:text-white"
          aria-label={`Close ${title}`}
        >
          ×
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
    </div>
  );
}
