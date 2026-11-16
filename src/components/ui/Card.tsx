import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'className'> {
  /**
   * What the card is. 'div' and 'article' are plain. 'button' and 'a' make the whole card
   * the control (a recent mission): it gets the hover state, and keyboard focus from the
   * global focus ring. A 'button' card has type="button"; an 'a' card needs an href.
   */
  as?: 'div' | 'article' | 'button' | 'a';
  /** Hover and pointer cursor. On by default for 'button' and 'a'. */
  interactive?: boolean;
  href?: string;
  /** Layout only (width, margin, grid placement). */
  className?: string;
  children?: ReactNode;
}

const CARD = 'relative flex min-w-0 flex-col overflow-hidden rounded-ui-lg border border-line bg-surface-navy text-left text-ink shadow-ui-1';
const INTERACTIVE = 'cursor-pointer transition-colors duration-fast ease-ui motion-reduce:transition-none hover:border-control hover:bg-surface-raised';

export function Card({ as = 'div', interactive, href, className, children, ...rest }: CardProps) {
  const live = interactive ?? (as === 'button' || as === 'a');
  const classes = cx(CARD, live && INTERACTIVE, className);
  if (as === 'button') {
    return (
      <button {...(rest as HTMLAttributes<HTMLButtonElement>)} type="button" className={classes}>
        {children}
      </button>
    );
  }
  if (as === 'a') {
    return (
      <a {...(rest as HTMLAttributes<HTMLAnchorElement>)} href={href} className={classes}>
        {children}
      </a>
    );
  }
  const Tag = as;
  return (
    <Tag {...rest} className={classes}>
      {children}
    </Tag>
  );
}
