import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThreatInstance } from '../../types/threat.types';
import type { Waypoint } from '../../types/waypoint.types';
import type { ThreatSystemInfo } from '../../lib/buildKneeboardCard';
import { waypointThreatCounts } from '../../lib/landing/nearThreats';
import { waypointLabel } from '../../lib/waypointOptions';
import { Dot, type DotKind } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Modal } from '../common/Modal';
import { cx } from '../ui/cx';
import { OW } from './overviewWords';

const DOT_OF: Record<string, DotKind> = { target: 'target', ip: 'ip', departure: 'departure', bullseye: 'bullseye' };
/** The dot a waypoint gets by its (guessed) type: it only colours, it never filters. The overview's map caption uses it too. */
export const waypointDotKind = (type: string): DotKind => DOT_OF[type] ?? 'nav';

/**
 * The waypoint the threat block is about, as a small text button that opens the
 * list (a choice list opens from its own button, never as an inline drop-down,
 * so the row stays compact). Every imported waypoint is offered, in route
 * order; the type only colours the dot (waypoints are free text). Picking one
 * re-frames the map. Desktop: a popover under the button. Phone: a full-screen
 * list (Modal's phone page).
 */
export function WaypointPicker({
  waypoints, threats, systems, chosenId, short, onPick, phone,
}: {
  waypoints: Waypoint[];
  threats: ThreatInstance[];
  systems: ThreatSystemInfo[];
  chosenId: string | null;
  short: string;
  onPick: (id: string) => void;
  phone: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const route = useMemo(() => [...waypoints].sort((a, b) => a.steerpoint - b.steerpoint), [waypoints]);
  // Counted only while the list is open: it is a distance per waypoint per threat.
  const counts = useMemo(() => (open ? new Map(route.map((w) => [w.id, waypointThreatCounts(w, threats, systems)])) : null), [open, route, threats, systems]);

  useEffect(() => {
    if (!open || phone) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    wrap.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open, phone]);

  const pick = (id: string) => { onPick(id); setOpen(false); button.current?.focus(); };
  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const list = (
    <div role="menu" aria-label={OW.pickerTitle} onKeyDown={onListKey} className="grid gap-0.5">
      {route.map((w) => {
        const c = counts?.get(w.id);
        const on = w.id === chosenId;
        return (
          <button
            key={w.id}
            type="button"
            role="menuitemradio"
            aria-checked={on}
            onClick={() => pick(w.id)}
            className={cx(
              'grid min-h-[52px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 rounded-ui-sm px-3 py-1.5 text-left',
              on ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-tint-2 hover:text-ink',
            )}
          >
            <Dot kind={waypointDotKind(w.type)} />
            <span className="grid gap-0.5">
              <span className="text-ui-body font-semibold text-ink">{waypointLabel(w)}</span>
              <span className="text-ui-small text-ink-2">{c ? OW.pickerRow(c.inReach, c.nearOnly) : ''}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={wrap} className="relative inline-flex">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={OW.changeWaypoint(short)}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-tap-sm items-center gap-1 rounded-ui-sm px-2 text-ui-small font-bold text-info hover:bg-info-soft"
      >
        {short}
        <Icon name="chev-down" size="sm" />
      </button>
      {open && !phone && (
        <div className="absolute left-0 top-full z-40 mt-2 max-h-[min(360px,50vh)] w-[312px] overflow-y-auto rounded-ui-lg border border-line-strong bg-surface-navy p-1.5 shadow-ui-2">
          {list}
        </div>
      )}
      {open && phone && (
        <Modal title={OW.pickerTitle} onClose={() => setOpen(false)}>
          {list}
        </Modal>
      )}
    </div>
  );
}
