import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';

interface PlaybackOverlayProps {
  title: string;
  onClose: () => void;
  /** Called when Space is pressed anywhere in playback that isn't a control. */
  onTogglePlay?: () => void;
  /**
   * Where focus goes back to on close. Defaults to whatever had focus when
   * playback opened, but macOS webviews don't focus a button on click, so
   * the opener passes itself.
   */
  returnFocusTo?: HTMLElement | null;
  children: ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Playback is opened from inside other components (the attack editor now, an
// attack-list row later). React delivers events from a portal to its React
// ancestors, so without this every click in playback would also reach them:
// in the attack list, a click would select the row and fly the map to it.
const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * The full-window frame playback draws in: a portal on document.body, above
 * the attack editor. Never above z-index 2000, so a quit or unsaved-changes
 * dialog opened later still paints on top of it.
 *
 * It behaves as a real modal dialog: it takes focus when it opens and gives it
 * back when it closes, and Tab stays inside it. Otherwise Space and Enter would
 * press the editor's buttons underneath. `role="dialog"` also keeps the app's
 * Undo shortcut off while it is open.
 */
export function PlaybackOverlay({ title, onClose, onTogglePlay, returnFocusTo, children }: PlaybackOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // The handlers below are attached once; they read the latest props from here.
  const latest = useRef({ onClose, onTogglePlay });
  latest.current = { onClose, onTogglePlay };
  const returnTo = useRef(returnFocusTo);
  returnTo.current = returnFocusTo;

  useEffect(() => {
    const root = rootRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root?.focus({ preventScroll: true });
    return () => {
      const back = returnTo.current ?? opener;
      if (back?.isConnected) back.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    // Is playback the dialog on top? Portals append to the end of <body>, so
    // the last dialog in the document is the newest. If another dialog opened
    // over playback (quit, unsaved changes), that one owns the keyboard.
    const isTop = () => {
      const root = rootRef.current;
      const dialogs = document.querySelectorAll('[role="dialog"]');
      const top = dialogs[dialogs.length - 1];
      return !!root && !!top && root.contains(top);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || !isTop()) return;
      if (e.key === 'Escape') {
        // Capture phase on window runs before every other listener, and
        // stopping it here keeps the attack editor's own Escape (a bubble-phase
        // window listener) from closing the editor and losing its draft.
        e.stopPropagation();
        e.preventDefault();
        // A panel left open over the picture (the Show menu) takes this Escape and closes itself: it is the thing on top.
        const layer = rootRef.current?.querySelector<HTMLElement>('[data-esc-close]');
        if (layer) {
          layer.dispatchEvent(new Event('pb-esc'));
          return;
        }
        latest.current.onClose();
      } else if (e.key === 'Tab') {
        trapTab(e, rootRef.current!);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== ' ' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    // Space on a control means that control (press the button, type the space).
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
    latest.current.onTogglePlay?.();
  };

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="fixed inset-0 z-[2000] bg-dcs-dark text-white flex flex-col outline-none"
      onClick={stop}
      onPointerDown={stop}
      onMouseDown={stop}
      onDoubleClick={stop}
      onKeyDown={onKeyDown}
    >
      <div className="shrink-0 flex items-center justify-between pl-4 pr-1 border-b border-gray-700">
        <h2 className="text-lg font-semibold py-2 truncate">{title}</h2>
        <button type="button" onClick={onClose} className="w-10 h-10 text-gray-400 hover:text-white text-2xl" aria-label="Close playback" title="Close (Esc)">
          ×
        </button>
      </div>
      <div className="relative flex-1 min-h-0">{children}</div>
    </div>,
    document.body,
  );
}

/**
 * Keep Tab inside playback: wrap from the last control to the first and back,
 * and pull focus in if it has somehow ended up outside (on <body>, say).
 */
function trapTab(e: KeyboardEvent, root: HTMLElement) {
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
  const active = document.activeElement;
  if (items.length === 0) {
    e.preventDefault();
    root.focus({ preventScroll: true });
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const outside = !active || active === root || !root.contains(active);
  if (outside || (e.shiftKey ? active === first : active === last)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
}
