import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';
import { IconButton } from './IconButton';
import { Panel } from './Panel';

export interface DialogFrameProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** A phone shows every dialog as a full-screen page, clear of the notch and the home bar. */
  phone: boolean;
  /** Tailwind width class for the panel (desktop, not `fill`). */
  widthClass?: string;
  /**
   * Nearly full screen, and the body does not scroll: the children fill a fixed-height body
   * and lay out their own scrolling areas (the attack editor).
   */
  fill?: boolean;
  /** A small uppercase line above the title (desktop). */
  eyebrow?: string;
  /** A line under the title (desktop). */
  description?: string;
  /** A strip under the body for the dialog's actions: Back on the left, the primary action on the right. */
  footer?: ReactNode;
  /**
   * Tailwind height class for the panel (desktop, not `fill`), e.g. `h-[min(700px,90vh)]` for a dialog
   * of one fixed size. Left out, the panel is as tall as its content, up to 90% of the window.
   */
  heightClass?: string;
  /**
   * Default true: the body scrolls. False: the body does not scroll and its children lay out their own
   * scrolling areas (two columns that scroll apart, with the header and footer staying put).
   */
  scrollBody?: boolean;
}

const SAFE_AREA: CSSProperties = {
  paddingTop: 'env(safe-area-inset-top)',
  paddingBottom: 'env(safe-area-inset-bottom)',
  paddingLeft: 'env(safe-area-inset-left)',
  paddingRight: 'env(safe-area-inset-right)',
};

/**
 * What a dialog looks like, with no portal, no state and no key handling, so it can be
 * checked as plain markup. Modal (src/components/common/Modal.tsx) wraps it.
 *
 * Contract kept from the old Modal, because other code finds dialogs by it: the element with
 * role="dialog" carries aria-label={title}, and the stack position is z-[2000]. App.tsx blocks
 * Undo while any [role="dialog"] exists, and the 3D playback overlay decides who is on top by
 * the last one in the page.
 */
export function DialogFrame({
  title, onClose, children, phone, widthClass = 'w-[440px]', fill = false, eyebrow, description, footer, heightClass = 'max-h-[90vh]', scrollBody = true,
}: DialogFrameProps) {
  if (phone) {
    return (
      <div className="fixed inset-0 z-[2000] flex flex-col bg-surface-navy text-ink" style={SAFE_AREA} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex shrink-0 items-center justify-between border-b border-line pl-4 pr-1">
          <h2 className="truncate py-3 text-ui-lead font-bold">{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        <div className={cx('min-h-0 flex-1', !fill && (scrollBody ? 'overflow-y-auto overscroll-contain p-4' : 'overflow-hidden p-4'))}>{children}</div>
        {footer ? <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-shade px-4 py-3">{footer}</div> : null}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-scrim">
      <Panel
        tone="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx('text-ink', fill ? 'h-[92vh] w-[96vw]' : `${widthClass} ${heightClass}`)}
      >
        <div className={cx('flex shrink-0 items-start justify-between gap-4', fill ? 'px-4 pb-2 pt-3' : 'px-6 pb-3 pt-4')}>
          <div className="grid min-w-0 gap-0.5">
            {eyebrow ? <p className="text-ui-caption font-semibold uppercase tracking-label text-ink-3">{eyebrow}</p> : null}
            <h2 className={cx('font-bold tracking-title', fill ? 'text-ui-title' : 'text-ui-headline')}>{title}</h2>
            {description ? <p className="text-ui-body text-ink-2">{description}</p> : null}
          </div>
          <IconButton icon="close" label={`Close ${title}`} onClick={onClose} className="-mr-2 -mt-1" />
        </div>
        <div className={cx('min-h-0 flex-1', fill ? 'px-4 pb-4' : scrollBody ? 'overflow-y-auto px-6 pb-4 pt-1' : 'overflow-hidden px-6 pb-4 pt-1')}>{children}</div>
        {footer ? <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-shade px-6 py-3">{footer}</div> : null}
      </Panel>
    </div>
  );
}
