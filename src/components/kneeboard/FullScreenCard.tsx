import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface FullScreenCardProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** Small print along the bottom: "2 / 5", or a hint. */
  footer?: ReactNode;
}

/**
 * Black, edge to edge, over everything (the top bar and tab bar included):
 * the frame for the zoomed card and for kneeboard mode. The ✕ sits inside the
 * safe area, so the notch or the camera never covers it, portrait or landscape.
 */
export function FullScreenCard({ label, onClose, children, footer }: FullScreenCardProps) {
  // Escape, for a browser with a keyboard.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[2100] bg-black text-white overscroll-none select-none" role="dialog" aria-label={label}>
      {children}
      <button
        onClick={onClose}
        className="absolute w-11 h-11 flex items-center justify-center rounded-full bg-black/60 text-2xl text-gray-200 hover:text-white"
        style={{
          top: 'calc(env(safe-area-inset-top) + 8px)',
          right: 'calc(env(safe-area-inset-right) + 8px)',
        }}
        aria-label="Close"
      >
        ✕
      </button>
      {footer && (
        <div
          className="absolute inset-x-0 text-center text-xs text-gray-400 pointer-events-none"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6px)' }}
        >
          <span className="inline-block rounded-full bg-black/60 px-3 py-0.5">{footer}</span>
        </div>
      )}
    </div>,
    document.body,
  );
}
