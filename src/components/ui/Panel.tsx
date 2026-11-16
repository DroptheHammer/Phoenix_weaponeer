import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

/**
 * group   a grouped list on a page: navy, hairline edge, 16 px corners, rows split by a hairline
 * float   what floats over the map (side panel, bars, menus): the one opaque navy material with a stronger edge and shadow
 * well    a recessed field area: the darkest surface with a control outline
 * dialog  the surface a dialog sits on: navy, strong edge, 24 px corners, shadow
 */
export type PanelTone = 'group' | 'float' | 'well' | 'dialog';

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'className'> {
  tone?: PanelTone;
  /** A group inside a float or a dialog: a faint fill instead of navy, so it reads as a step up from that surface. */
  nested?: boolean;
  /** Group only: a hairline between its direct children (rows). Default true. */
  divided?: boolean;
  as?: 'div' | 'section' | 'aside' | 'ul' | 'article' | 'nav';
  /** Layout only (width, margin, position, flex, grid). */
  className?: string;
  children?: ReactNode;
}

const TONE: Record<PanelTone, string> = {
  group: 'relative overflow-hidden rounded-ui-lg border border-line bg-surface-navy',
  float: 'rounded-ui-lg border border-line-strong bg-surface-float shadow-ui-2',
  well: 'rounded-ui-lg border border-control bg-surface-deep',
  dialog: 'flex flex-col overflow-hidden rounded-ui-xl border border-line-strong bg-surface-navy shadow-ui-2',
};
const GROUP_NESTED = 'relative overflow-hidden rounded-ui-lg border border-line bg-tint-1';

export function Panel({ tone = 'group', nested = false, divided = true, as: Tag = 'div', className, children, ...rest }: PanelProps) {
  const base = tone === 'group' && nested ? GROUP_NESTED : TONE[tone];
  return (
    <Tag {...rest} className={cx(base, tone === 'group' && divided && 'divide-y divide-line', className)}>
      {children}
    </Tag>
  );
}

export interface GroupLabelProps {
  children: ReactNode;
  /** Sentence-case text at the right end of the label ("2 of 4"). It may hold an icon beside its words. */
  note?: ReactNode;
  className?: string;
}

/** The small uppercase heading above a group. */
export function GroupLabel({ children, note, className }: GroupLabelProps) {
  return (
    <div className={cx('mx-1 mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-ui-caption font-semibold uppercase leading-4 tracking-label text-ink-3', className)}>
      <span>{children}</span>
      {note ? <span className="inline-flex items-center gap-1.5 font-medium normal-case tracking-tag">{note}</span> : null}
    </div>
  );
}
