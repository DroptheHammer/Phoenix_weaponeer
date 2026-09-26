import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BottomSheet, type Snap } from './BottomSheet';

export interface PhoneMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface PhoneTab<Id extends string> {
  id: Id;
  label: string;
  /** Count or short note under the label. */
  badge?: string;
}

interface PhoneShellProps<Id extends string> {
  /** Mission name, or the app name with no mission open. */
  title: string;
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
  /** Absent on the landing page. */
  tabs?: PhoneTab<Id>[];
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
 * The web build's phone layout: a slim top bar with a ⋯ menu, the page (the
 * map, full screen) and a tab bar at the bottom. A tab opens its panel as a
 * bottom sheet over the map; tapping the open tab again closes it.
 *
 * Only the chrome is phone-specific. The panels are the same components as the
 * desktop layout, and App keeps every handler, so both layouts behave alike.
 */
export function PhoneShell<Id extends string>({
  title,
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

  // Close the menu on any tap outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  const openTab = tabs?.find((t) => t.id === activeTab);
  // Some tabs (e.g. Cards) open straight at full height; a `key` forces a
  // remount on every tab switch so this applies fresh each time, even when
  // switching directly from one open tab to another.
  const initialSnap: Snap = activeTab != null && fullTabs?.includes(activeTab) ? 'full' : 'half';

  return (
    <div className="h-[100dvh] flex flex-col bg-dcs-dark text-white overflow-hidden">
      {/* Top bar, clear of the notch */}
      <header
        className="shrink-0 bg-dcs-navy shadow-lg flex items-center gap-2 pl-4 pr-1 z-[1200]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <h1 className="flex-1 min-w-0 truncate text-base font-semibold py-3">
          {title}
          {dirty && <span className="text-dcs-accent ml-1" aria-label="unsaved changes">●</span>}
        </h1>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            className="w-11 h-11 flex items-center justify-center text-2xl text-gray-300 hover:text-white"
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute right-1 top-full mt-1 w-60 rounded-xl bg-dcs-blue shadow-2xl py-1 z-[1300]" role="menu">
              {menu.map((item) => (
                <button
                  key={item.label}
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setMenuOpen(false);
                    item.onClick();
                  }}
                  className="block w-full text-left px-4 py-3 text-base hover:bg-blue-600 disabled:opacity-40"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {message && (
        <button
          onClick={onDismissMessage}
          className={`shrink-0 text-left text-sm px-4 py-2 z-[1150] ${
            message.startsWith('Error') ? 'bg-red-900 text-red-100' : 'bg-dcs-blue text-gray-200'
          }`}
        >
          {message}
        </button>
      )}

      <main className="relative flex-1 min-h-0">
        {children}
        {/* Stops short of the map's Layers button at the top right (MapLegend). */}
        {banner && <div className="absolute top-2 left-2 right-28 z-[1050]">{banner}</div>}
        {openTab && panel && (
          <BottomSheet
            key={String(activeTab)}
            title={openTab.label}
            onClose={() => onTab?.(null)}
            hidden={hidePanel}
            initialSnap={initialSnap}
          >
            {panel}
          </BottomSheet>
        )}
      </main>

      {tabs && (
        <nav
          className="shrink-0 bg-dcs-navy border-t border-gray-700 grid z-[1200]"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => onTab?.(active ? null : tab.id)}
                className={`min-h-[56px] flex flex-col items-center justify-center px-1 ${
                  active ? 'text-dcs-accent' : 'text-gray-300'
                }`}
                aria-pressed={active}
              >
                <span className="text-sm font-medium leading-tight">{tab.label}</span>
                {tab.badge !== undefined && <span className="text-xs text-gray-400 leading-tight">{tab.badge}</span>}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
