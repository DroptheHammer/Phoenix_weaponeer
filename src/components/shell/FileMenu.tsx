import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';

export interface FileMenuItem {
  /** Stable key. */
  id: string;
  /** The row's name, and its accessible name exactly ("Close"). */
  label: string;
  /** The line under it ("Close this mission"), read as its description. */
  sub: string;
  icon: IconName;
  onSelect: () => void;
}

/** What a key pressed in the open menu does: move to a row, shut the menu, or nothing. */
export type MenuKeyAction = { focus: number } | { close: 'to-button' | 'move-on' } | null;

/**
 * The menu's keyboard, as a pure rule so a check can run it without a page. `at` is the row that
 * has focus (-1 for none) and `count` how many rows there are. Arrow keys wrap round; Escape shuts
 * the menu and gives the keyboard back to File; Tab shuts it and lets the browser move on.
 */
export function menuKey(key: string, at: number, count: number): MenuKeyAction {
  const to = (i: number): MenuKeyAction => ({ focus: (i + count) % count });
  if (key === 'ArrowDown') return to(at + 1);
  if (key === 'ArrowUp') return to(at - 1);
  if (key === 'Home') return to(0);
  if (key === 'End') return to(count - 1);
  if (key === 'Escape') return { close: 'to-button' };
  if (key === 'Tab') return { close: 'move-on' };
  return null;
}

/** A press shuts the menu unless it lands inside it or on File itself (File's own click toggles it). */
export function pressShutsMenu(wrap: { contains(node: unknown): boolean } | null, target: unknown): boolean {
  return !wrap?.contains(target);
}

/**
 * "File": a quiet header button that opens a list of two-line rows under it. Opening puts the
 * keyboard on the first row; Arrow keys, Home and End move; Escape shuts it and goes back to the
 * button; Tab shuts it and moves on; a press anywhere outside shuts it. Choosing a row shuts it,
 * gives the keyboard back to the button, then runs the row (which may open a dialog: the dialog
 * then hands the keyboard back to File when it closes).
 *
 * Escape is heard on the window while the menu is open, not on the menu: a press on the menu's
 * own padding leaves the keyboard on the page, and Escape must still shut the menu from there.
 * The arrow keys, Home, End and Tab stay on the menu, where the keyboard is when they matter. No
 * dialog can be open with the menu (a row shuts it before it runs, and a press anywhere else shuts
 * it), so the window's Escape is never meant for something else.
 */
export function FileMenu({ items }: { items: FileMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    rows.current[0]?.focus();
    const onDown = (event: PointerEvent) => {
      if (pressShutsMenu(wrap.current, event.target)) setOpen(false);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      const action = menuKey(event.key, -1, 0);
      if (action && 'close' in action && action.close === 'to-button') {
        event.preventDefault();
        close(true);
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = rows.current.filter((r): r is HTMLButtonElement => r !== null);
    const action = menuKey(event.key, list.indexOf(document.activeElement as HTMLButtonElement), list.length);
    if (!action) return;
    if ('focus' in action) {
      event.preventDefault();
      list[action.focus]?.focus();
    } else if (action.close === 'move-on') close(false);
    // Escape ('to-button') is the window's, above.
  };

  return (
    <div ref={wrap} className="relative">
      <Button
        ref={button}
        id={`${id}-button`}
        variant="quiet"
        size="bar"
        icon="folder"
        aria-label="File"
        title="File"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        <span className="max-[1279px]:sr-only">File</span>
        <Icon name="chev-down" size="sm" />
      </Button>
      {open ? (
        <div
          id={`${id}-menu`}
          role="menu"
          aria-labelledby={`${id}-button`}
          onKeyDown={onKeyDown}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-10 grid w-menu gap-0.5 rounded-ui-lg border border-line-strong bg-surface-navy p-1.5 shadow-ui-2"
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => {
                rows.current[i] = el;
              }}
              type="button"
              role="menuitem"
              aria-label={item.label}
              aria-describedby={`${id}-${item.id}-sub`}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
              className="grid min-h-[52px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 rounded-ui-sm px-3 py-1.5 text-left text-ink-2 outline-offset-[-2px] transition-colors duration-fast ease-ui motion-reduce:transition-none hover:bg-tint-2 hover:text-ink focus-visible:bg-tint-2 focus-visible:text-ink"
            >
              <Icon name={item.icon} />
              <span className="grid gap-0.5">
                <span className="text-ui-body font-semibold leading-snug text-ink">{item.label}</span>
                <span id={`${id}-${item.id}-sub`} className="text-ui-small text-ink-2">
                  {item.sub}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
