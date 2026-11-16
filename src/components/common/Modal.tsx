import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIsPhone } from '../../hooks/useIsPhone';
import { DialogFrame } from '../ui/DialogFrame';

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

/**
 * Portal-rendered modal, portalled to `document.body` at z-index 2000, with
 * its own text colour (portalled content sits outside the App container and so
 * does not inherit one). What it looks like is `DialogFrame` in the design
 * system (src/components/ui); this adds the portal and Escape.
 *
 * On a phone (web build) every modal is a full-screen page, clear of the
 * notch and the home bar, whatever its desktop size.
 */
export function Modal({ title, onClose, children, widthClass, fill = false, eyebrow, description, footer, heightClass, scrollBody }: ModalProps) {
  const isPhone = useIsPhone();
  // Nothing in the app handled Escape before this component existed.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <DialogFrame
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
