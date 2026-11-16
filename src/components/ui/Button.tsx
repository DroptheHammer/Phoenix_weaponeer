import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

/**
 * primary   the one action a screen leads with: accent fill, dark ink. Disabled, it turns grey,
 *           so it never looks half-ready
 * tonal     the everyday button: a soft white fill and edge
 * emphasis  an action that matters but is not THE action: accent tint
 * quiet     no fill until hovered: Settings, Quit, Back, secondary actions
 * outline   a neutral edge, no fill: Delete (with the trash icon and the word).
 *           Not red: the app defines no danger colour, and the word and icon say what it does
 * text      the small sky-blue button for a list row (Copy, Edit, Ungroup); one fixed size
 */
export type ButtonVariant = 'primary' | 'tonal' | 'emphasis' | 'quiet' | 'outline' | 'text';

/**
 * md       44 px tall, 15 px text (the default)
 * lg       52 px tall, 17 px text, for the one hero action
 * compact  44 px tall, 13 px text (15 on a phone), tighter padding: a row of buttons in a bar
 * sm       36 px tall, pill, 13 px text: a button inside a panel row ("Play strike")
 * bar      36 px tall, 15 px text, 12 px corners: a button in the 48 px app header
 * Ignored by the `text` variant, which is 32 px tall (44 on a phone, --tap-sm).
 */
export type ButtonSize = 'md' | 'lg' | 'compact' | 'sm' | 'bar';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** A leading icon. The label still carries the name; the icon is decoration. */
  icon?: IconName;
  /** A trailing icon, after the label: the arrow of a text button that goes somewhere ("Open Threats on the map"). */
  iconEnd?: IconName;
  /** Working: the button is disabled, announced as busy, and shows the progress cursor. Change the label yourself ("Fetching..."). */
  busy?: boolean;
  /** For a button that opens or closes something: sets aria-pressed. Adds no look of its own. */
  pressed?: boolean;
  /** Layout only: width, margin, flex, self-*, shrink-0. Never colour, padding or radius (see cx). */
  className?: string;
}

// Every string below is written out whole so Tailwind can see the classes. Each variant
// sets the border colour and its disabled look exactly once, and each size sets its own
// padding, radius, gap and text. The cursor is set once, in the component: a variant-prefixed
// class (disabled:...) is emitted after a plain one, so having both would let
// `disabled:cursor-not-allowed` beat `cursor-progress` on a busy button, which is disabled.
const BASE =
  'inline-flex items-center justify-center whitespace-nowrap leading-ui-tight transition-colors duration-fast ease-ui motion-reduce:transition-none';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'border border-transparent bg-accent font-bold text-ink-on-accent enabled:hover:bg-accent-hover enabled:active:bg-accent-hover disabled:bg-tint-2 disabled:text-ink-3',
  tonal:
    'border border-line-strong bg-tint-2 font-semibold text-ink enabled:hover:bg-tint-3 enabled:active:bg-tint-3 disabled:opacity-50',
  emphasis:
    'border border-accent-line bg-accent-soft font-semibold text-accent-fg enabled:hover:bg-accent-soft-hover enabled:active:bg-accent-soft-hover disabled:opacity-50',
  quiet:
    'border border-transparent font-semibold text-ink-2 enabled:hover:bg-tint-2 enabled:hover:text-ink enabled:active:bg-tint-2 disabled:opacity-50',
  outline:
    'border-[1.5px] border-control font-semibold text-ink enabled:hover:bg-tint-2 enabled:active:bg-tint-2 disabled:opacity-50',
  text:
    'border border-transparent font-semibold text-info enabled:hover:bg-info-soft enabled:active:bg-info-soft disabled:opacity-50',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'min-h-tap gap-2 rounded-ui-md px-4 text-ui-body',
  lg: 'min-h-btn-lg gap-2 rounded-ui-md px-6 text-ui-lead',
  compact: 'min-h-tap gap-2 rounded-ui-md px-3 text-ui-compact',
  sm: 'min-h-btn-sm gap-2 rounded-pill pl-2.5 pr-3.5 text-ui-small',
  bar: 'min-h-bar-btn gap-2 rounded-ui-md px-3 text-ui-body',
};

const TEXT_SIZE = 'min-h-tap-sm min-w-tap-sm gap-1 rounded-ui-sm px-2 text-ui-compact';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'tonal', size = 'md', icon, iconEnd, busy = false, pressed, className, type = 'button', disabled, children, ...rest },
  ref,
) {
  const isText = variant === 'text';
  const iconSize = isText ? 'sm' : 'md';
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-pressed={pressed}
      className={cx(BASE, VARIANT[variant], isText ? TEXT_SIZE : SIZE[size], busy ? 'cursor-progress' : 'disabled:cursor-not-allowed', className)}
    >
      {icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={iconSize} /> : null}
    </button>
  );
});
