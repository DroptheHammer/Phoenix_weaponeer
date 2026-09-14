import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind width class for the panel. Defaults to a compact dialog. */
  widthClass?: string;
  /**
   * CSS-hide rather than unmount, and skip the Escape handler, while true.
   * For a modal that arms a map click (AttackEditor's custom-IP picker): the
   * map must become visible and clickable, but the form underneath — and
   * everything the planner has typed into it — must survive the trip.
   */
  hidden?: boolean;
}

/**
 * Portal-rendered modal matching the convention the hand-rolled dialogs use:
 * portalled to `document.body` at z-index 2000, `bg-dcs-navy` panel with its
 * own `text-white` (portalled content sits outside the App container and so
 * does not inherit it).
 *
 * `AttackEditor`, `LoadoutEditor`, `FlightMemberEditor` and `ThreatList` each
 * still carry their own copy of this markup; folding them in is a mechanical
 * change left for its own commit.
 */
export function Modal({ title, onClose, children, widthClass = 'w-[440px]', hidden = false }: ModalProps) {
  // Nothing in the app handled Escape before this component existed.
  // Skipped while hidden: an Escape meant for "cancel the map click" must not
  // also close the editor underneath it.
  useEffect(() => {
    if (hidden) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, hidden]);

  return createPortal(
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] ${hidden ? 'hidden' : ''}`}>
      <div className={`bg-dcs-navy text-white rounded-lg p-6 ${widthClass} max-h-[90vh] overflow-y-auto`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
