import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { BottomSheet, type Snap } from './BottomSheet';
import { menuKey } from '../shell/FileMenu';
import { cx } from '../ui/cx';
import { IconButton } from '../ui/IconButton';
import { Icon, type IconName } from '../ui/Icon';
import { Tabs, type TabItem } from '../ui/Tabs';

export interface PhoneMenuItem {
  label: string;
  /** The row's icon: decoration only, the label is the row's name. */
  icon?: IconName;
  onClick: () => void;
  disabled?: boolean;
}

interface PhoneShellProps<Id extends string> {
  /** Mission name, or the app name with no mission open (the flight on the Flight overview). */
  title: string;
  /** A second, smaller line under the title: on the Flight overview the mission, place and when it was edited; on the map the place and whether work is not yet exported. */
  subtitle?: string;
  /** A back arrow before the title: the way back from the Flight overview. */
  onBack?: () => void;
  /** The back arrow's name, spoken by a screen reader and shown as its tooltip: the caller words it, as it names the place the arrow goes to. */
  backLabel?: string;
  /** Show the unsaved-work dot. */
  dirty?: boolean;
  menu: PhoneMenuItem[];
  /** The last file message; tap to dismiss. */
  message?: string | null;
  onDismissMessage?: () => void;
  /** The page under the top bar: the map, or the landing page. */
  children: ReactNode;
  /** Floats over the map, under the top bar (the unverified-projection warning). */
  banner?: ReactNode;
  /** The bottom bar's tabs (see railItems.ts, phoneTabItems). Absent on the landing page. */
  tabs?: TabItem<Id>[];
  activeTab?: Id | null;
  onTab?: (id: Id | null) => void;
  /** What the open tab shows, in the bottom sheet. */
  panel?: ReactNode;
  /** Keep the sheet mounted but hidden (the map is waiting for a crosshair pick). */
  hidePanel?: boolean;
  /** Tabs whose sheet opens straight at full height instead of half (e.g. Cards, for full-width card viewing). */
  fullTabs?: Id[];
}

/**
 * The open ⋯ menu: one row per action, an icon before each label. It is its own piece so the rows can be
 * drawn without a tap having opened the menu first.
 */
export function PhoneMenuList({ items, onPick }: { items: PhoneMenuItem[]; onPick: (item: PhoneMenuItem) => void }) {
  return (
    <div className="absolute right-0 top-full z-[1300] mt-1 grid w-menu gap-0.5 rounded-ui-lg border border-line-strong bg-surface-navy p-1.5 shadow-ui-2" role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => onPick(item)}
          className="flex min-h-12 w-full items-center gap-3 rounded-ui-sm px-3 text-left text-ui-body font-medium text-ink outline-offset-[-2px] hover:bg-tint-2 active:bg-tint-2 disabled:opacity-50"
        >
          {item.icon ? (
            <span className="grid text-ink-2">
              <Icon name={item.icon} />
            </span>
          ) : null}
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The web build's phone layout: a slim top bar with a ⋯ menu, the page (the
 * map, full screen) and a tab bar at the bottom. A tab opens its panel as a
 * bottom sheet over the map; tapping the open tab again closes it.
 *
 * The bars are navy, the tabs are icons with their count as a badge and the open
 * one in the accent, and the menu is a list of icon rows.
 *
 * Only the chrome is phone-specific. The panels are the same components as the
 * desktop layout, and App keeps every handler, so both layouts behave alike.
 */
export function PhoneShell<Id extends string>({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  dirty = false,
  menu,
  message,
  onDismissMessage,
  children,
  banner,
  tabs,
  activeTab = null,
  onTab,
  panel,
  hidePanel = false,
  fullTabs,
}: PhoneShellProps<Id>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  const closeMenu = (refocus: boolean) => {
    setMenuOpen(false);
    if (refocus) menuButton.current?.focus();
  };
  // The rows a key can land on (a disabled row takes no focus).
  const menuRows = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

  // The menu answers a keyboard as the desktop's File menu does. Opening puts the keyboard on the first
  // row; a tap anywhere outside shuts it; Escape shuts it from wherever the keyboard is (a tap on the
  // menu's own padding leaves it on the page) and gives it back to Menu. Escape asks menuKey what a key
  // means, as the arrows and Tab do on the menu itself.
  useEffect(() => {
    if (!menuOpen) return;
    menuRows()[0]?.focus();
    const onDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      const action = menuKey(event.key, -1, 0);
      if (action && 'close' in action && action.close === 'to-button') {
        event.preventDefault();
        closeMenu(true);
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rows = menuRows();
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return; // the keyboard is on Menu itself: Enter and Space work as on any button
    const action = menuKey(event.key, at, rows.length);
    if (!action) return;
    if ('focus' in action) {
      event.preventDefault();
      rows[action.focus]?.focus();
    } else if (action.close === 'move-on') closeMenu(false);
    // Escape ('to-button') is the window's, above.
  };

  const openTab = tabs?.find((t) => t.id === activeTab);
  // Some tabs (e.g. Cards) open straight at full height; a `key` forces a
  // remount on every tab switch so this applies fresh each time, even when
  // switching directly from one open tab to another.
  const initialSnap: Snap = activeTab != null && fullTabs?.includes(activeTab) ? 'full' : 'half';

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface-window text-ink">
      {/* Top bar, clear of the notch */}
      <header
        className={cx(
          'z-[1200] flex min-h-[calc(var(--bar)+var(--safe-top))] shrink-0 items-center gap-3 border-b border-line-strong bg-surface-navy pr-[max(0.5rem,var(--safe-right))] pt-[var(--safe-top)] shadow-ui-1',
          onBack ? 'pl-[max(0.25rem,var(--safe-left))]' : 'pl-[max(1rem,var(--safe-left))]',
        )}
      >
        {onBack ? <IconButton icon="chev-left" label={backLabel} onClick={onBack} /> : null}
        {/* The title over a smaller second line, each cut with an ellipsis rather than wrapping under the menu. */}
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h1 className="m-0 min-w-0 truncate text-ui-lead font-bold leading-ui-tight">
            {title}
            {dirty && <span role="img" aria-label="unsaved changes" className="ml-2 inline-block size-2 rounded-full bg-accent align-middle" />}
          </h1>
          {subtitle ? <p className="m-0 min-w-0 truncate text-ui-small leading-tight text-ink-2">{subtitle}</p> : null}
        </div>
        <div className="relative" ref={menuRef} onKeyDown={onMenuKeyDown}>
          <IconButton ref={menuButton} icon="more" label="Menu" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} />
          {menuOpen && (
            <PhoneMenuList
              items={menu}
              onPick={(item) => {
                setMenuOpen(false);
                item.onClick();
              }}
            />
          )}
        </div>
      </header>

      {message && (
        <button
          type="button"
          onClick={onDismissMessage}
          className={`z-[1150] shrink-0 px-4 py-2 text-left text-ui-small ${
            message.startsWith('Error') ? 'bg-red-900 text-red-100' : 'bg-surface-tile text-ink-2'
          }`}
        >
          {message}
        </button>
      )}

      <main className="relative min-h-0 flex-1">
        {children}
        {/* Stops short of the map's Layers button at the top right (MapLegend). */}
        {banner && <div className="absolute left-2 right-28 top-2 z-[1050]">{banner}</div>}
        {openTab && panel && (
          <BottomSheet key={String(activeTab)} title={openTab.label} onClose={() => onTab?.(null)} hidden={hidePanel} initialSnap={initialSnap}>
            {panel}
          </BottomSheet>
        )}
      </main>

      {tabs && <Tabs<Id> variant="bar" label="Planner panels" className="z-[1200] shrink-0" items={tabs} selected={activeTab} onSelect={(id) => onTab?.(id)} />}
    </div>
  );
}
