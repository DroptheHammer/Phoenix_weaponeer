import { useRef, useState, type ReactNode, type PointerEvent, type KeyboardEvent } from 'react';
import { IconButton } from '../ui/IconButton';

export type Snap = 'half' | 'full';

/** Share of the space above the tab bar the sheet covers at each height. */
const HEIGHT: Record<Snap, number> = { half: 0.55, full: 1 };

interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Kept mounted but out of sight, e.g. while the map waits for a crosshair pick. */
  hidden?: boolean;
  /** Height the sheet opens at. Some tabs (e.g. Cards) start full instead of half. */
  initialSnap?: Snap;
}

/**
 * The phone layout's panel: slides up over the map from the tab bar.
 *
 * Half height leaves the map in view above it, so a planner can see the attack
 * while editing its list; full height is for long lists. Tap the handle to
 * switch, or drag it — let go near the top for full, the middle for half, or
 * low down to close. The handle is a 96 x 44 touch target over the sheet's head,
 * and Enter or Space on it switches too.
 */
export function BottomSheet({ title, onClose, children, hidden = false, initialSnap = 'half' }: BottomSheetProps) {
  const [snap, setSnap] = useState<Snap>(initialSnap);
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

  // The handle is a button, so a keyboard switches the height too.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setSnap(snap === 'half' ? 'full' : 'half');
  };

  const height = dragHeight !== null ? `${dragHeight}px` : `${HEIGHT[snap] * 100}%`;

  return (
    <div
      ref={sheetRef}
      className={`absolute inset-x-0 bottom-0 z-[1100] flex flex-col rounded-t-ui-xl border border-b-0 border-line-strong bg-surface-navy shadow-ui-up ${
        dragHeight === null ? 'transition-[height] duration-200 motion-reduce:transition-none' : ''
      } ${hidden ? 'hidden' : ''}`}
      style={{ height }}
      role="dialog"
      aria-label={title}
    >
      <div
        className="absolute left-1/2 top-0 z-[1] h-tap w-24 -translate-x-1/2 cursor-grab touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        tabIndex={0}
        aria-label={snap === 'half' ? 'Expand' : 'Shrink'}
        role="button"
      >
        <div className="absolute left-6 top-2 h-1.5 w-12 rounded-pill bg-tint-3" />
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 pb-1 pl-5 pr-2 pt-5">
        <h2 className="m-0 text-ui-title font-bold">{title}</h2>
        <IconButton icon="close" label={`Close ${title}`} onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
    </div>
  );
}
