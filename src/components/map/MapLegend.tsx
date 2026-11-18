import { useMemo, useRef, useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Attack, ThreatInstance } from '../../types';
import type { FlightMember } from '../../types/flight.types';
import { flightGroupOf } from '../../lib/callsign';
import { useUiStore } from '../../stores/uiStore';
import { cx } from '../ui/cx';
import { Icon } from '../ui/Icon';
import { Dot } from '../ui/Chip';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { ABOVE_CREDIT } from './MapCredit';

export interface MapLegendProps {
  /** Full, unfiltered mission attacks — used to enumerate flights/members and their counts. */
  attacks: Attack[];
  flightMembers: FlightMember[];
  /**
   * The threats the planner may see (the visible mission's: author-hidden ones are not
   * here unless revealed in Settings › Admin) — used for the Mission/Planning counts.
   */
  threats: ThreatInstance[];
}

/** Is anything filtered off the map? Shown on the closed Legend (desktop) and Layers (phone) button. */
export const selectAnythingHidden = (s: { hiddenAttackerIds: string[]; hiddenThreatSources: string[]; routeHidden: boolean }) =>
  s.hiddenAttackerIds.length > 0 || s.hiddenThreatSources.length > 0 || s.routeHidden;

/** A checkbox that can show "some but not all" (indeterminate). The browser's own box, in the accent. */
function TriCheckbox({ checked, indeterminate = false, onChange }: { checked: boolean; indeterminate?: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} className="size-[var(--check)] shrink-0 cursor-pointer accent-dcs-accent" />;
}

/**
 * The desktop legend: closed, one small "Legend" button at the map's bottom-left corner, under
 * the rail; open, one box anchored to that corner (the button is its bottom row and the key and
 * filters open above it), never wider than --legend-w and never taller than the room left under
 * the rail (it scrolls inside). It is a flex item of the planner's left column (PlannerShell), so
 * that room is worked out by the layout, not by a number here.
 *
 * Open or closed is kept for the session (uiStore.legendOpen); Escape inside it closes it and
 * puts the keyboard back on its button. A click elsewhere does not close it: it is a standing
 * display filter, as the old panel was.
 */
export function LegendDock(props: MapLegendProps) {
  const open = useUiStore((s) => s.legendOpen);
  const setOpen = useUiStore((s) => s.setLegendOpen);
  const filtered = useUiStore(selectAnythingHidden);
  return (
    <LegendBox open={open} filtered={filtered} onOpenChange={setOpen}>
      <LegendContent {...props} />
    </LegendBox>
  );
}

/** The Legend's box and button, given its state (LegendDock connects it to the store; checks render it directly). */
export function LegendBox({ open, filtered, onOpenChange, children }: { open: boolean; filtered: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  const button = useRef<HTMLButtonElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    onOpenChange(false);
    button.current?.focus();
  };

  return (
    // Panel "float" is the one opaque material of what floats over the map, so the Legend follows
    // it if it ever changes. The button stays hand-made: open, it is the box's bottom row with a
    // hairline above it and the chevron at its end, which Button's layout-only className cannot
    // say, and its name is the box's title (bold, full ink), not a quiet action.
    <Panel
      as="section"
      tone="float"
      aria-label="Legend"
      onKeyDown={onKeyDown}
      className={cx('pointer-events-auto flex min-h-0 shrink flex-col-reverse overflow-hidden', open ? 'w-legend' : 'min-w-dock')}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? 'map-legend-body' : undefined}
        title={filtered ? 'Some layers are hidden' : undefined}
        onClick={() => onOpenChange(!open)}
        className={cx(
          'flex min-h-tap shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-ui-small font-bold text-ink outline-offset-[-2px] transition-colors duration-fast ease-ui motion-reduce:transition-none hover:bg-tint-2',
          open ? 'justify-start border-t border-line' : 'justify-center',
        )}
      >
        <span className="grid text-ink-2">
          <Icon name="layers" />
        </span>
        <span>Legend</span>
        {filtered ? <span className="font-semibold text-ink-2">· filtered</span> : null}
        {open ? (
          <span className="ml-auto grid text-ink-2">
            <Icon name="chev-down" size="sm" />
          </span>
        ) : null}
      </button>
      {open ? (
        <div id="map-legend-body" className="min-h-0 overflow-y-auto overscroll-contain px-3.5 pb-2.5 pt-3.5 text-ui-small text-ink">
          {children}
        </div>
      ) : null}
    </Panel>
  );
}

/**
 * Phone: a compact button, clear of the zoom control (bottom left) and the bottom sheet, that
 * opens the legend as a small panel under it. Any tap outside the panel closes it, as the ⋯
 * menu does. Its place, words and behaviour are as before; its look is the app's navy.
 */
export function LayersButton(props: MapLegendProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mapPick = useUiStore((s) => s.mapPick);
  const anythingHidden = useUiStore(selectAnythingHidden);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  // A crosshair pick wants the whole map; the planner can reopen it after.
  useEffect(() => {
    if (mapPick) setOpen(false);
  }, [mapPick]);

  return (
    // The button sits 12 px from the map's top and right edge (clear of a notch), the panel 8 px
    // under it, as tall as the map allows down to 8 px above the map credit's chip (ABOVE_CREDIT:
    // the chip is in the same corner, and held sideways the panel is tall enough to reach it),
    // then it scrolls. The wrapper runs down the map's right side but lets every touch through
    // except on the button and the panel.
    // font-sans: this sits inside MapView's `font-map` wrapper, which is kept for the attack
    // labels, but it is app chrome, so it takes the app's font.
    <div ref={ref} className={cx('pointer-events-none absolute right-[max(0.75rem,var(--safe-right))] top-3 z-[1000] flex flex-col items-end gap-2 font-sans', ABOVE_CREDIT)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="pointer-events-auto flex min-h-tap shrink-0 items-center gap-2 rounded-ui-md border border-line-strong bg-surface-float pl-3.5 pr-3 text-ui-small font-semibold text-ink shadow-ui-2"
        aria-expanded={open}
      >
        <span className="grid text-ink-2">
          <Icon name="layers" />
        </span>
        <span>Layers</span>
        {/* Something is filtered out: say so while the panel is shut. */}
        {anythingHidden && <span className="size-2 rounded-full bg-accent" aria-label="some layers hidden" />}
      </button>
      {open && (
        <div
          className="pointer-events-auto min-h-0 w-[min(var(--legend-w),calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-ui-lg border border-line-strong bg-surface-float px-4 pb-4 pt-3 text-ui-small text-ink shadow-ui-2"
          role="dialog"
          aria-label="Layers"
        >
          <LegendContent {...props} roomy />
        </div>
      )}
    </div>
  );
}

const SET = 'm-0 min-w-0 border-0 border-t border-line p-0 pt-2';
const SET_TITLE = 'float-left w-full pb-0.5 text-ui-caption font-semibold uppercase tracking-label text-ink-3';

/** The legend's key and filter checkboxes; `roomy` sizes the rows for a finger (44 px). */
export function LegendContent({ attacks, flightMembers, threats, roomy = false }: MapLegendProps & { roomy?: boolean }) {
  const hiddenAttackerIds = useUiStore((s) => s.hiddenAttackerIds);
  const hiddenThreatSources = useUiStore((s) => s.hiddenThreatSources);
  const routeHidden = useUiStore((s) => s.routeHidden);
  const toggleAttacker = useUiStore((s) => s.toggleAttacker);
  const toggleFlight = useUiStore((s) => s.toggleFlight);
  const toggleThreatSource = useUiStore((s) => s.toggleThreatSource);
  const toggleRoute = useUiStore((s) => s.toggleRoute);
  const showAll = useUiStore((s) => s.showAll);
  const anythingHidden = useUiStore(selectAnythingHidden);

  // Flights → members that actually have attacks, each with its attack count. Only members
  // with at least one attack are listed; with none, the Attacks set is not shown.
  const flightGroups = useMemo(() => {
    const countByAttacker = new Map<string, number>();
    for (const a of attacks) countByAttacker.set(a.attackerId, (countByAttacker.get(a.attackerId) ?? 0) + 1);
    const groups = new Map<string, { id: string; callsign: string; count: number }[]>();
    for (const member of flightMembers) {
      const count = countByAttacker.get(member.id);
      if (!count) continue;
      const group = flightGroupOf(member.callsign);
      const list = groups.get(group) ?? [];
      list.push({ id: member.id, callsign: member.callsign, count });
      groups.set(group, list);
    }
    for (const list of groups.values()) list.sort((a, b) => a.callsign.localeCompare(b.callsign));
    return groups;
  }, [attacks, flightMembers]);

  const missionThreatCount = threats.filter((t) => t.source === 'mission').length;
  const planningThreatCount = threats.filter((t) => t.source === 'planning').length;

  const row = cx('flex cursor-pointer items-center', roomy ? 'min-h-tap gap-3' : 'min-h-7 gap-2');
  const nest = roomy ? 'grid pl-[calc(var(--check)+0.75rem)]' : 'grid pl-[calc(var(--check)+0.5rem)]';

  return (
    <div className="grid gap-2.5">
      <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-2 p-0">
        <li className="flex min-w-0 items-center gap-2"><Dot kind="target" />Target</li>
        <li className="flex min-w-0 items-center gap-2"><Dot kind="ip" />IP</li>
        <li className="flex min-w-0 items-center gap-2"><Dot kind="nav" />Navigation</li>
        <li className="flex min-w-0 items-center gap-2"><Dot kind="bullseye" />Bullseye</li>
      </ul>

      {flightGroups.size > 0 && (
        <fieldset className={SET}>
          <legend className={SET_TITLE}>Attacks</legend>
          <div className="clear-both">
            {[...flightGroups.entries()].map(([group, members]) => {
              const memberIds = members.map((m) => m.id);
              const hiddenCount = memberIds.filter((id) => hiddenAttackerIds.includes(id)).length;
              return (
                <div key={group}>
                  <label className={row}>
                    <TriCheckbox checked={hiddenCount === 0} indeterminate={hiddenCount > 0 && hiddenCount < memberIds.length} onChange={() => toggleFlight(memberIds)} />
                    <span>{group}</span>
                  </label>
                  <div className={nest}>
                    {members.map((m) => (
                      <label key={m.id} className={row}>
                        <TriCheckbox checked={!hiddenAttackerIds.includes(m.id)} onChange={() => toggleAttacker(m.id)} />
                        <span>
                          {m.callsign} · {m.count} attack{m.count !== 1 ? 's' : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset className={SET}>
        <legend className={SET_TITLE}>Threats</legend>
        <div className="clear-both">
          <label className={row}>
            <TriCheckbox checked={!hiddenThreatSources.includes('mission')} onChange={() => toggleThreatSource('mission')} />
            <svg viewBox="0 0 18 18" aria-hidden="true" className="size-[18px] shrink-0 fill-none stroke-data-ring" strokeWidth={2}>
              <circle cx="9" cy="9" r="7" />
            </svg>
            <span>Mission ({missionThreatCount})</span>
          </label>
          <label className={row}>
            <TriCheckbox checked={!hiddenThreatSources.includes('planning')} onChange={() => toggleThreatSource('planning')} />
            <svg viewBox="0 0 18 18" aria-hidden="true" className="size-[18px] shrink-0 fill-none stroke-data-ring" strokeWidth={2} strokeDasharray="4.33 3">
              <circle cx="9" cy="9" r="7" />
            </svg>
            <span>Planning ({planningThreatCount})</span>
          </label>
        </div>
      </fieldset>

      <fieldset className={SET}>
        <legend className={SET_TITLE}>Route</legend>
        <div className="clear-both">
          <label className={row}>
            <TriCheckbox checked={!routeHidden} onChange={toggleRoute} />
            <span>Route &amp; waypoints</span>
          </label>
        </div>
      </fieldset>

      {anythingHidden && (
        <div className="border-t border-line pt-2">
          <Button variant="text" onClick={showAll}>
            Show all
          </Button>
        </div>
      )}
    </div>
  );
}
