import { useMemo, useRef, useEffect, useState } from 'react';
import type { Attack, ThreatInstance } from '../../types';
import type { FlightMember } from '../../types/flight.types';
import { flightGroupOf } from '../../lib/callsign';
import { useUiStore } from '../../stores/uiStore';
import { useIsPhone } from '../../hooks/useIsPhone';

interface MapLegendProps {
  /** Full, unfiltered mission attacks — used to enumerate flights/members and their counts. */
  attacks: Attack[];
  flightMembers: FlightMember[];
  /** Full, unfiltered mission threats — used for the Mission/Planning counts. */
  threats: ThreatInstance[];
}

/** A checkbox that can render a visual "some but not all" indeterminate state. */
function TriCheckbox({
  checked,
  indeterminate = false,
  onChange,
  roomy = false,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  roomy?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={`accent-[#e94560] ${roomy ? 'w-5 h-5' : ''}`}
    />
  );
}

/**
 * The map legend, now doubling as the display filter control.
 *
 * Extracted from `MapView` as it gains state — same precedent as
 * `labelLayout.ts` / `attackPicture.ts` in earlier sessions. Still rendered
 * by `MapView` so it keeps its position over the map. This is a WHITE panel
 * (`bg-white`, `text-gray-700`/`text-gray-800`), unlike the dark `dcs-navy`
 * panels used elsewhere in the app — match that, not the app chrome.
 *
 * On a phone a standing panel would cover a fifth of the map, so it folds
 * into a Layers button at the top right that opens the same content.
 */
export function MapLegend(props: MapLegendProps) {
  const isPhone = useIsPhone();
  const [collapsed, setCollapsed] = useState(false);

  if (isPhone) return <LayersButton {...props} />;

  return (
    <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 text-xs z-[1000] max-w-[220px]">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between w-full font-semibold mb-2 text-gray-800"
        title={collapsed ? 'Expand legend' : 'Collapse legend'}
      >
        <span>Legend</span>
        <span className="text-gray-400">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && <LegendContent {...props} />}
    </div>
  );
}

/**
 * Phone: a compact button, clear of the zoom control (bottom left) and the
 * bottom sheet, that opens the legend as a small panel under it. Any tap
 * outside the panel closes it, as the ⋯ menu does.
 */
function LayersButton(props: MapLegendProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mapPick = useUiStore((s) => s.mapPick);
  const anythingHidden = useUiStore(
    (s) => s.hiddenAttackerIds.length > 0 || s.hiddenThreatSources.length > 0 || s.routeHidden,
  );

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
    <div ref={ref} className="absolute top-2 right-2 z-[1000] flex flex-col items-end">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="min-h-[44px] px-3 rounded-lg bg-white text-gray-800 text-sm font-semibold shadow-lg flex items-center gap-1.5"
        aria-expanded={open}
      >
        <span aria-hidden>☰</span>
        <span>Layers</span>
        {/* Something is filtered out: say so while the panel is shut. */}
        {anythingHidden && <span className="w-2 h-2 rounded-full bg-dcs-accent" aria-label="some layers hidden" />}
      </button>
      {open && (
        <div
          className="mt-2 w-64 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain bg-white rounded-lg shadow-lg p-3 text-sm"
          style={{ maxHeight: 'min(60vh, 420px)' }}
          role="dialog"
          aria-label="Layers"
        >
          <LegendContent {...props} roomy />
        </div>
      )}
    </div>
  );
}

/** The legend's key and filter checkboxes; `roomy` sizes them for a finger. */
function LegendContent({ attacks, flightMembers, threats, roomy = false }: MapLegendProps & { roomy?: boolean }) {
  const hiddenAttackerIds = useUiStore((s) => s.hiddenAttackerIds);
  const hiddenThreatSources = useUiStore((s) => s.hiddenThreatSources);
  const routeHidden = useUiStore((s) => s.routeHidden);
  const toggleAttacker = useUiStore((s) => s.toggleAttacker);
  const toggleFlight = useUiStore((s) => s.toggleFlight);
  const toggleThreatSource = useUiStore((s) => s.toggleThreatSource);
  const toggleRoute = useUiStore((s) => s.toggleRoute);
  const showAll = useUiStore((s) => s.showAll);

  // Flights → members that actually have attacks, each with its attack count.
  // Only members with at least one attack are listed, so a single-pilot
  // mission looks exactly as it does today (the section is hidden entirely
  // below when this comes out empty).
  const flightGroups = useMemo(() => {
    const countByAttacker = new Map<string, number>();
    for (const a of attacks) {
      countByAttacker.set(a.attackerId, (countByAttacker.get(a.attackerId) ?? 0) + 1);
    }
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

  const anythingHidden =
    hiddenAttackerIds.length > 0 || hiddenThreatSources.length > 0 || routeHidden;

  // A finger needs a taller row than a mouse pointer.
  const row = `flex items-center gap-2 cursor-pointer ${roomy ? 'min-h-[40px]' : ''}`;

  return (
    <div className="space-y-1 text-gray-700">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full bg-red-500"></div>
        <span>Target</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
        <span>IP</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full bg-blue-500"></div>
        <span>Navigation</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full bg-orange-500"></div>
        <span>Bullseye</span>
      </div>

      {flightGroups.size > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <div className="font-semibold text-gray-800 mb-1">Attacks</div>
          {/* The phone panel scrolls as a whole; a scroller inside it would trap the thumb. */}
          <div className={`${roomy ? '' : 'max-h-40 overflow-y-auto'} space-y-1`}>
            {[...flightGroups.entries()].map(([group, members]) => {
              const memberIds = members.map((m) => m.id);
              const hiddenCount = memberIds.filter((id) => hiddenAttackerIds.includes(id)).length;
              return (
                <div key={group}>
                  <label className={row}>
                    <TriCheckbox
                      checked={hiddenCount === 0}
                      indeterminate={hiddenCount > 0 && hiddenCount < memberIds.length}
                      onChange={() => toggleFlight(memberIds)}
                      roomy={roomy}
                    />
                    <span className="font-medium">{group}</span>
                  </label>
                  <div className="ml-5 space-y-1">
                    {members.map((m) => (
                      <label key={m.id} className={row}>
                        <TriCheckbox
                          checked={!hiddenAttackerIds.includes(m.id)}
                          onChange={() => toggleAttacker(m.id)}
                          roomy={roomy}
                        />
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
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
        <div className="font-semibold text-gray-800 mb-1">Threats</div>
        <label className={row}>
          <TriCheckbox
            checked={!hiddenThreatSources.includes('mission')}
            onChange={() => toggleThreatSource('mission')}
            roomy={roomy}
          />
          <div className="w-4 h-4 rounded-full border-2 border-red-500 bg-red-100"></div>
          <span>Mission ({missionThreatCount})</span>
        </label>
        <label className={row}>
          <TriCheckbox
            checked={!hiddenThreatSources.includes('planning')}
            onChange={() => toggleThreatSource('planning')}
            roomy={roomy}
          />
          <div className="w-4 h-4 rounded-full border-2 border-red-500 border-dashed bg-red-50"></div>
          <span>Planning ({planningThreatCount})</span>
        </label>
      </div>

      <div className="mt-2 pt-2 border-t border-gray-200">
        <div className="font-semibold text-gray-800 mb-1">Route</div>
        <label className={row}>
          <TriCheckbox checked={!routeHidden} onChange={toggleRoute} roomy={roomy} />
          <span>Route &amp; steerpoints</span>
        </label>
      </div>

      {anythingHidden && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <button onClick={showAll} className={`text-dcs-accent hover:underline font-medium ${roomy ? 'min-h-[40px]' : ''}`}>
            Show all
          </button>
        </div>
      )}
    </div>
  );
}
