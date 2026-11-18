import { useEffect, useState, type AnimationEvent, type ReactNode } from 'react';
import { cx } from '../ui/cx';
import { IconButton } from '../ui/IconButton';

export interface PanelSheetProps {
  title: string;
  onClose: () => void;
  /** Kept mounted but out of sight (the map is waiting for a placement click: an open attack editor must survive). */
  hidden?: boolean;
  /** Grid placement only (PlannerShell). */
  className?: string;
  children: ReactNode;
}

/**
 * The desktop side panel: one floating sheet, inset from the window's edges, with a fixed head
 * (the panel's name and a close button) and a body that scrolls. The forms inside are the
 * panels' own components, unchanged (padding 16 px, as before).
 *
 * It slides in once, when it opens from closed (PlannerShell mounts it then). Switching panels
 * keeps the same element, and coming back from a map pick only shows it again: the slide class
 * is dropped when the first slide ends (or when a pick hides the sheet first), because going
 * from display:none back to grid would otherwise start the animation over.
 */
export function PanelSheet({ title, onClose, hidden = false, className, children }: PanelSheetProps) {
  const [entering, setEntering] = useState(true);
  // A map pick that hides the sheet mid-slide ends the slide too (React has no animationcancel event).
  useEffect(() => {
    if (hidden) setEntering(false);
  }, [hidden]);
  const settle = (event: AnimationEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) setEntering(false);
  };
  return (
    <aside
      aria-labelledby="planner-panel-title"
      onAnimationEnd={settle}
      className={cx(
        // `hidden` as a class, not the attribute: the attribute loses to `grid` (same specificity, utilities come later).
        hidden ? 'hidden' : 'grid',
        'min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-ui-lg border border-line-strong bg-surface-float text-ink shadow-ui-2',
        entering && 'motion-safe:animate-sheet-in',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-line py-2 pl-5 pr-2">
        <h2 id="planner-panel-title" className="text-ui-title font-bold">
          {title}
        </h2>
        <IconButton icon="close" label="Close panel" onClick={onClose} />
      </header>
      <div className="min-h-0 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}
