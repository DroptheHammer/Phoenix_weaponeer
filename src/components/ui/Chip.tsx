import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

/**
 * neutral  a label or type tag (SAM, profile name)
 * quiet    the same, lower in the hierarchy
 * ok       a status that is done ("Planned"): a light fill with a sky check, neutral on purpose so
 *          it is not taken for a control
 * none     a status not yet done ("No attack", "No A-G stores"): the quiet fill; give it its icon
 *          (`dash-ring` for not yet, `minus` for nothing to do)
 * detect   the load box's "FragOrders link": information, sky blue
 * warn     a caution that carries its icon and its word ("not in the weapon table"): amber with the warning triangle
 * estimated  ESTIMATED: an outline with a tilde. Never amber and never a triangle, so a
 *          caution and an estimate cannot be mistaken for each other
 */
export type ChipTone = 'neutral' | 'quiet' | 'ok' | 'none' | 'detect' | 'warn' | 'estimated';

/** sm: a 22 px tag or status tag, with a 14 px icon. lg: a 28 px chip, with a 16 px icon. */
export type ChipSize = 'sm' | 'lg';

export interface ChipProps {
  tone?: ChipTone;
  size?: ChipSize;
  /** A leading icon. A `warn` chip gets the warning triangle, an `estimated` chip the tilde and an `ok` chip the check, unless you give another (or `null`). */
  icon?: IconName | null;
  /** Hover text, for an abbreviation. */
  title?: string;
  /** Layout only (margin, self-*, shrink-0). */
  className?: string;
  children: ReactNode;
}

const BASE = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill font-semibold';

// Letter-spacing belongs to the tone (type tags are .02em, ESTIMATED .06em, the status tags none),
// so no size and tone set it both.
const TONE: Record<ChipTone, string> = {
  neutral: 'bg-tint-2 text-ink tracking-tag',
  quiet: 'bg-tint-2 text-ink-2 tracking-tag',
  ok: 'bg-tint-3 text-ink',
  none: 'bg-tint-1 text-ink-2',
  detect: 'bg-info-soft text-info',
  warn: 'bg-tint-1 text-warn',
  estimated: 'border border-control text-ink tracking-label',
};

const DEFAULT_ICON: Partial<Record<ChipTone, IconName>> = { warn: 'warn', estimated: 'est', ok: 'check' };

// The icon's own colour where it differs from the text: the "done" check is sky.
const ICON_TONE: Partial<Record<ChipTone, string>> = { ok: 'text-info' };

const SIZE: Record<ChipSize, string> = {
  sm: 'min-h-tag px-2 text-ui-caption',
  lg: 'min-h-chip py-0.5 pl-2.5 pr-3 text-ui-small',
};

export function Chip({ tone = 'neutral', size = 'sm', icon, title, className, children }: ChipProps) {
  const name = icon === undefined ? (DEFAULT_ICON[tone] ?? null) : icon;
  return (
    <span title={title} className={cx(BASE, TONE[tone], SIZE[size], className)}>
      {name ? <Icon name={name} size={size === 'sm' ? 'xs' : 'sm'} className={ICON_TONE[tone]} /> : null}
      {children}
    </span>
  );
}

/** What a data dot stands for: the planner's own colour for it, with the white rim the map gives its markers. */
export type DotKind = 'target' | 'ip' | 'nav' | 'bullseye' | 'departure' | 'sam' | 'aaa' | 'manpads' | 'shorad' | 'ewr';

const DOT: Record<DotKind, string> = {
  target: 'bg-data-target',
  ip: 'bg-data-ip',
  nav: 'bg-data-nav',
  bullseye: 'bg-data-bullseye',
  departure: 'bg-data-departure',
  sam: 'bg-data-sam',
  aaa: 'bg-data-aaa',
  manpads: 'bg-data-manpads',
  shorad: 'bg-data-shorad',
  ewr: 'bg-data-ewr',
};

/** A 10 px dot. Decorative: put the word beside it, never rely on the colour. */
export function Dot({ kind, className }: { kind: DotKind; className?: string }) {
  return <span aria-hidden="true" className={cx('inline-block size-2.5 shrink-0 rounded-full shadow-halo', DOT[kind], className)} />;
}
