import { useMissionStore } from '../../stores/missionStore';
import { formatCoordinatesDMS } from '../../lib/coordinates';
import type { WaypointType } from '../../types';

const WAYPOINT_TYPE_LABELS: Record<WaypointType, string> = {
  nav: 'NAV',
  ip: 'IP',
  target: 'TGT',
  cap: 'CAP',
  marshal: 'MSH',
  tanker: 'TNK',
  divert: 'DVT',
  bullseye: 'BE',
  departure: 'DEP',
};

/** The route as the mission author set it: shown, never edited here. */
export function WaypointList() {
  const { mission } = useMissionStore();

  if (!mission || mission.waypoints.length === 0) {
    return (
      <div className="text-gray-400 text-center py-8">
        No waypoints yet. They come from the imported mission and can't be changed here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {mission.waypoints.map((waypoint) => (
        <div
          key={waypoint.id}
          className="bg-dcs-navy rounded-lg p-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="bg-dcs-blue px-2 py-1 rounded text-sm font-mono">
              {waypoint.steerpoint.toString().padStart(2, '0')}
            </div>
            <div className="bg-dcs-accent px-2 py-1 rounded text-xs font-bold">
              {WAYPOINT_TYPE_LABELS[waypoint.type]}
            </div>
            <div>
              <div className="font-medium">{waypoint.name}</div>
              <div className="text-sm text-gray-400 font-mono">
                {formatCoordinatesDMS(waypoint.coordinates)}
              </div>
            </div>
          </div>
          <span className="text-sm text-gray-400">
            {waypoint.elevation_ft.toLocaleString()} ft
          </span>
        </div>
      ))}
    </div>
  );
}
