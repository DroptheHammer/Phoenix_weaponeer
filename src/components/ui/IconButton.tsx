import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

/** md: 44 x 44. sm: 32 x 32 (44 x 44 on a phone, --tap-sm), for a control inside a row or a header strip. */
export type IconButtonSize = 'md' | 'sm';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children' | 'aria-label' | 'title'> {
  icon: IconName;
  /** Required: the button has no text, so this is its name (aria-label, and the tooltip). */
  label: string;
  size?: IconButtonSize;
  /** For a button that opens or closes something: sets aria-pressed. */
  pressed?: boolean;
  /** Layout only (margin, position, shrink-0). */
  className?: string;
}

const BASE =
  'inline-grid shrink-0 place-items-center border-0 p-0 text-ink-2 transition-colors duration-fast ease-ui motion-reduce:transition-none enabled:hover:bg-tint-2 enabled:hover:text-ink enabled:active:bg-tint-2 disabled:cursor-not-allowed disabled:opacity-50';

const SIZE: Record<IconButtonSize, string> = {
  md: 'size-tap rounded-ui-md',
  sm: 'size-tap-sm rounded-ui-sm',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 'md', pressed, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cx(BASE, SIZE[size], className)}
    >
      <Icon name={icon} size="md" />
    </button>
  );
});
