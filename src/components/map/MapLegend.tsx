import { useMemo, useRef, useEffect, useState } from 'react';
import type { Attack, ThreatInstance } from '../../types';
import type { FlightMember } from '../../types/flight.types';
import { flightGroupOf } from '../../lib/callsign';
import { useUiStore } from '../../stores/uiStore';

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
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
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
      className="accent-[#e94560]"
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
 */
export function MapLegend({ attacks, flightMembers, threats }: MapLegendProps) {
  const [collapsed, setCollapsed] = useState(false);
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

  return (
    <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-3 text-xs z-[1000] max-w-[220px]">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between w-full font-semibold mb-2 text-gray-800"
        title={collapsed ? 'Expand legend' : 'Collapse legend'}
      >
        <span>Legend</span>
        <span className="text-gray-400">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
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
              <div className="max-h-40 overflow-y-auto space-y-1">
                {[...flightGroups.entries()].map(([group, members]) => {
                  const memberIds = members.map((m) => m.id);
                  const hiddenCount = memberIds.filter((id) => hiddenAttackerIds.includes(id)).length;
                  return (
                    <div key={group}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <TriCheckbox
                          checked={hiddenCount === 0}
                          indeterminate={hiddenCount > 0 && hiddenCount < memberIds.length}
                          onChange={() => toggleFlight(memberIds)}
                        />
                        <span className="font-medium">{group}</span>
                      </label>
                      <div className="ml-5 space-y-1">
                        {members.map((m) => (
                          <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                            <TriCheckbox
                              checked={!hiddenAttackerIds.includes(m.id)}
                              onChange={() => toggleAttacker(m.id)}
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
            <label className="flex items-center gap-2 cursor-pointer">
              <TriCheckbox
                checked={!hiddenThreatSources.includes('mission')}
                onChange={() => toggleThreatSource('mission')}
              />
              <div className="w-4 h-4 rounded-full border-2 border-red-500 bg-red-100"></div>
              <span>Mission ({missionThreatCount})</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <TriCheckbox
                checked={!hiddenThreatSources.includes('planning')}
                onChange={() => toggleThreatSource('planning')}
              />
              <div className="w-4 h-4 rounded-full border-2 border-red-500 border-dashed bg-red-50"></div>
              <span>Planning ({planningThreatCount})</span>
            </label>
          </div>

          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="font-semibold text-gray-800 mb-1">Route</div>
            <label className="flex items-center gap-2 cursor-pointer">
              <TriCheckbox checked={!routeHidden} onChange={toggleRoute} />
              <span>Route &amp; steerpoints</span>
            </label>
          </div>

          {anythingHidden && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <button onClick={showAll} className="text-dcs-accent hover:underline font-medium">
                Show all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
