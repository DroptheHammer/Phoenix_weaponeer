import { cx } from './cx';
import { Icon, type IconName } from './Icon';

/**
 * rail       the side rail: one floating bar, icon over label, the count as a badge
 * bar        the phone's bottom tab bar: the same tab as the rail, spread across the width, clear of the home bar
 * pills      a row of selectable pills, "Group (2)": the editor's Group / jet tabs, profile and mode choices
 * segmented  one pill-shaped control with one choice lit: Day / Night / NVG
 */
export type TabsVariant = 'rail' | 'bar' | 'pills' | 'segmented';

export interface TabItem<Id extends string> {
  id: Id;
  label: string;
  /** Shown after the label ("Threats (2)", any short text works), or as the badge on the rail and the bar, where it must stay a number of up to three digits. */
  count?: string | number;
  /** rail and bar: the icon above the label. */
  icon?: IconName;
  title?: string;
  disabled?: boolean;
}

export interface TabsProps<Id extends string> {
  items: readonly TabItem<Id>[];
  /** The id that is on, or null when none is (the rail with its panel closed). */
  selected: Id | null;
  onSelect: (id: Id | null) => void;
  variant: TabsVariant;
  /** The group's accessible name ("Panels"). */
  label: string;
  /** Pressing the selected item calls onSelect(null). Default: true for rail and bar (they open and close a panel), false for pills and segmented. */
  toggle?: boolean;
  /** Layout only: position, margin, width. */
  className?: string;
}

/** What `selected` becomes when `id` is pressed. Pure, so it is tested without a DOM. */
export function nextSelection<Id extends string>(selected: Id | null, id: Id, toggle: boolean): Id | null {
  return toggle && selected === id ? null : id;
}

// Not a role="tablist": every consumer (the rail, the phone tabs, the jet strip) is a set of
// buttons with aria-pressed, the tests find them as buttons, and the rail opens a panel
// rather than switching a tabpanel.
const GROUP: Record<TabsVariant, string> = {
  rail: 'inline-grid gap-0.5 rounded-ui-lg border border-line-strong bg-surface-float p-1.5 shadow-ui-2',
  bar: 'grid grid-flow-col auto-cols-fr gap-0.5 border-t border-line-strong bg-surface-navy pt-1.5 pb-[calc(0.375rem+var(--safe-bottom))] pl-[max(0.5rem,var(--safe-left))] pr-[max(0.5rem,var(--safe-right))]',
  pills: 'flex flex-wrap gap-2',
  segmented: 'inline-grid auto-cols-fr grid-flow-col rounded-pill border border-control bg-tint-1 p-0.5',
};

const ITEM: Record<TabsVariant, { base: string; on: string; off: string }> = {
  rail: {
    base: 'grid min-h-rail-btn w-rail content-center justify-items-center gap-0.5 rounded-ui-md px-1 py-1.5 text-ui-caption leading-tight transition-colors duration-fast ease-ui motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50',
    on: 'bg-accent font-bold text-ink-on-accent',
    off: 'font-semibold text-ink hover:bg-tint-2',
  },
  bar: {
    base: 'grid min-h-tab min-w-0 content-center justify-items-center gap-0.5 rounded-ui-md px-0.5 py-1.5 text-ui-small leading-tight transition-colors duration-fast ease-ui motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50',
    on: 'bg-accent font-bold text-ink-on-accent',
    off: 'font-semibold text-ink-2 hover:bg-tint-2 active:bg-tint-2',
  },
  pills: {
    base: 'inline-flex min-h-tap-sm items-center gap-2 rounded-ui-md border px-3 text-ui-small font-semibold transition-colors duration-fast ease-ui motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50',
    on: 'border-accent bg-accent-soft text-ink',
    off: 'border-control bg-surface-deep text-ink-2 hover:bg-tint-2 hover:text-ink',
  },
  segmented: {
    base: 'grid min-h-[38px] min-w-12 place-items-center rounded-pill px-2.5 text-ui-small transition-colors duration-fast ease-ui motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50',
    on: 'bg-accent font-bold text-ink-on-accent',
    off: 'font-semibold text-ink-2 hover:bg-tint-2',
  },
};

const BADGE_BASE =
  'absolute -top-[7px] left-[calc(100%-5px)] h-[18px] min-w-[18px] rounded-pill px-1 text-center text-ui-caption font-bold leading-[18px]';

export function Tabs<Id extends string>({ items, selected, onSelect, variant, label, toggle, className }: TabsProps<Id>) {
  const toggles = toggle ?? (variant === 'rail' || variant === 'bar');
  const style = ITEM[variant];
  const stacked = variant === 'rail' || variant === 'bar'; // icon over label, the count as a badge on the icon
  return (
    <div role="group" aria-label={label} className={cx(GROUP[variant], className)}>
      {items.map((item) => {
        const on = item.id === selected;
        const withCount = item.count !== undefined && !stacked;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={on}
            title={item.title}
            disabled={item.disabled}
            onClick={() => onSelect(nextSelection(selected, item.id, toggles))}
            className={cx(style.base, on ? style.on : style.off)}
          >
            {stacked ? (
              <>
                <span className="relative grid">
                  {item.icon ? <Icon name={item.icon} size="rail" /> : null}
                  {item.count !== undefined ? <span className={cx(BADGE_BASE, on ? 'bg-surface-deep text-ink' : 'bg-tint-3 text-ink')}>{item.count}</span> : null}
                </span>
                <span>{item.label}</span>
              </>
            ) : (
              <>
                {item.label}
                {withCount ? ` (${item.count})` : null}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
