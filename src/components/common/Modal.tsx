import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIsPhone } from '../../hooks/useIsPhone';
import { DialogFrame } from '../ui/DialogFrame';
import { isTopDialog, tabStop } from '../ui/dialogKeys';

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
  /** A small uppercase line above the title (desktop). */
  eyebrow?: string;
  /** A line under the title (desktop). */
  description?: string;
  /** A strip under the body for the dialog's actions. */
  footer?: ReactNode;
  /** Tailwind height class for the panel (desktop, not `fill`). Default: as tall as its content, up to 90% of the window. */
  heightClass?: string;
  /** False: the body does not scroll; the children lay out their own scrolling areas. Default true. */
  scrollBody?: boolean;
}

// Everything the browser could Tab to. Disabled, tabindex="-1" and undrawn ones are filtered out below.
const TAB_CANDIDATES = 'a[href], area[href], button, input, select, textarea, [tabindex]';

/**
 * Portal-rendered modal, portalled to `document.body` at z-index 2000, with
 * its own text colour (portalled content sits outside the App container and so
 * does not inherit one). What it looks like is `DialogFrame` in the design
 * system (src/components/ui); this adds the portal and the keyboard.
 *
 * The keyboard, as in any modal dialog: focus moves into the dialog when it
 * opens and goes back to what opened it when it closes; Tab stays inside it;
 * Escape closes it. With one dialog over another, only the one on top answers
 * Escape and Tab, so one press never closes both.
 *
 * On a phone (web build) every modal is a full-screen page, clear of the
 * notch and the home bar, whatever its desktop size.
 */
export function Modal({ title, onClose, children, widthClass, fill = false, eyebrow, description, footer, heightClass, scrollBody }: ModalProps) {
  const isPhone = useIsPhone();
  const dialogRef = useRef<HTMLDivElement>(null);
  // The key listener is attached once and reads the latest onClose from here.
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  // Read while the dialog is first drawn, before a child's autoFocus can take focus, so it can be given back on close.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    const root = dialogRef.current;
    if (root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
    return () => {
      // Back to what opened it, if that is still in the page; otherwise nowhere.
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    // On window in the bubble phase, on purpose: the 3D playback takes Escape in the
    // capture phase and stops it there, which keeps the attack editor open under it.
    const onKeyDown = (event: KeyboardEvent) => {
      const root = dialogRef.current;
      if (!root || !isTopDialog(root, document)) return;
      if (event.key === 'Escape') {
        latestClose.current();
      } else if (event.key === 'Tab') {
        const stops = Array.from(root.querySelectorAll<HTMLElement>(TAB_CANDIDATES)).filter(
          (el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0,
        );
        const to = tabStop(stops, document.activeElement, event.shiftKey, root);
        if (to) {
          event.preventDefault();
          to.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return createPortal(
    <DialogFrame
      dialogRef={dialogRef}
      title={title}
      onClose={onClose}
      phone={isPhone}
      widthClass={widthClass}
      fill={fill}
      eyebrow={eyebrow}
      description={description}
      footer={footer}
      heightClass={heightClass}
      scrollBody={scrollBody}
    >
      {children}
    </DialogFrame>,
    document.body,
  );
}
