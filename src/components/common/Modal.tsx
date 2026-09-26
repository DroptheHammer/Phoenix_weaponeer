import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIsPhone } from '../../hooks/useIsPhone';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind width class for the panel. Defaults to a compact dialog. Ignored when `fill` is set. */
  widthClass?: string;
  /**
   * Nearly full screen, and the panel does not scroll: the children fill a
   * fixed-height body and lay out their own scrolling areas. For the attack
   * editor, whose controls scroll beside a map that must stay put.
   */
  fill?: boolean;
}

/**
 * Portal-rendered modal matching the convention the hand-rolled dialogs use:
 * portalled to `document.body` at z-index 2000, `bg-dcs-navy` panel with its
 * own `text-white` (portalled content sits outside the App container and so
 * does not inherit it).
 *
 * On a phone (web build) every modal is a full-screen page, clear of the
 * notch and the home bar, whatever its desktop size.
 */
export function Modal({ title, onClose, children, widthClass = 'w-[440px]', fill = false }: ModalProps) {
  const isPhone = useIsPhone();
  // Nothing in the app handled Escape before this component existed.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (isPhone) {
    return createPortal(
      <div
        className="fixed inset-0 z-[2000] bg-dcs-navy text-white flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
        role="dialog"
        aria-label={title}
      >
        <div className="shrink-0 flex justify-between items-center pl-4 pr-1 border-b border-gray-700">
          <h2 className="text-lg font-semibold py-3 truncate">{title}</h2>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-white text-2xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className={`flex-1 min-h-0 ${fill ? '' : 'overflow-y-auto overscroll-contain p-4'}`}>{children}</div>
      </div>,
      document.body,
    );
  }

  const panel = fill ? 'w-[96vw] h-[92vh] flex flex-col' : `${widthClass} max-h-[90vh] overflow-y-auto`;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000]">
      <div className={`bg-dcs-navy text-white rounded-lg ${fill ? 'p-4' : 'p-6'} ${panel}`}>
        <div className={`flex justify-between items-center ${fill ? 'mb-3' : 'mb-4'}`}>
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">
            ×
          </button>
        </div>
        {fill ? <div className="flex-1 min-h-0">{children}</div> : children}
      </div>
    </div>,
    document.body
  );
}
