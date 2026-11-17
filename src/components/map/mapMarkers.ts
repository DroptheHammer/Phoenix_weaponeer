import { divIcon, type PathOptions } from 'leaflet';
import { escapeHtml } from '../../lib/html';
import type { ThreatInstance } from '../../types';

/*
 * The planner map's own markers and threat rings, moved here unchanged from
 * MapView.tsx so the Flight overview's map draws them with the very same code.
 * Not restyled: the map's look is protected (the owner's rule), and a check
 * keeps MapView drawing through these and nothing else.
 */

// Custom waypoint icon
export const createWaypointIcon = (label: string, type: string) => {
  const colors: Record<string, string> = {
    target: 'bg-red-500',
    ip: 'bg-yellow-500',
    nav: 'bg-blue-500',
    cap: 'bg-purple-500',
    tanker: 'bg-green-500',
    bullseye: 'bg-orange-500',
    departure: 'bg-slate-500',
    default: 'bg-gray-500',
  };

  const color = colors[type] || colors.default;

  // Raw HTML: Leaflet assigns this to innerHTML, and `label` and `type` come
  // from the mission file. Escape everything interpolated.
  return divIcon({
    html: `<div class="flex flex-col items-center">
      <div class="${escapeHtml(color)} text-white font-bold rounded-full w-8 h-8 flex items-center justify-center shadow-lg border-2 border-white">
        ${escapeHtml(label)}
      </div>
    </div>`,
    className: 'custom-waypoint-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

// Create threat center marker icon
export const createThreatIcon = (threatType: string, isDraggable: boolean) => {
  const colors: Record<string, string> = {
    SAM: '#DC2626',
    AAA: '#EA580C',
    MANPADS: '#CA8A04',
    SHORAD: '#D97706',
    EWR: '#2563EB',
  };
  const color = colors[threatType] || '#6B7280';
  const cursor = isDraggable ? 'cursor-move' : 'cursor-default';

  return divIcon({
    html: `<div class="flex items-center justify-center ${cursor}">
      <div style="background-color: ${escapeHtml(color)}; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"
           class="text-white font-bold rounded w-6 h-6 flex items-center justify-center text-xs">
        ${escapeHtml(threatType.charAt(0))}
      </div>
    </div>`,
    className: 'custom-threat-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

/** The dashed route line between waypoints. */
export const ROUTE_LINE = { color: '#3B82F6', weight: 2, opacity: 0.6, dashArray: '5, 10' } as const;

/** A threat's engagement ring, as MapView has always drawn it (selected: amber and heavier). */
export function threatRingOptions(threat: Pick<ThreatInstance, 'id' | 'status' | 'source'>, selectedThreatId: string | null | undefined): PathOptions {
  const isMissionThreat = threat.source === 'mission';
  const baseColor = threat.status === 'active' ? '#EF4444' : '#9CA3AF';
  const selected = threat.id === selectedThreatId;
  return {
    color: selected ? '#FBBF24' : baseColor,
    fillColor: baseColor,
    fillOpacity: selected ? 0.18 : isMissionThreat ? 0.1 : 0.05,
    weight: selected ? 4 : 2,
    dashArray: isMissionThreat ? undefined : '8, 8',
  };
}
