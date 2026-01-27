import { useMissionStore } from '../../stores/missionStore';
import { formatCoordinatesDMS } from '../../lib/coordinates';
import type { ThreatStatus } from '../../types';

const STATUS_COLORS: Record<ThreatStatus, string> = {
  active: 'bg-red-600',
  degraded: 'bg-orange-500',
  suppressed: 'bg-yellow-500',
  destroyed: 'bg-gray-500',
  unknown: 'bg-purple-500',
};

const STATUS_LABELS: Record<ThreatStatus, string> = {
  active: 'Active',
  degraded: 'Degraded',
  suppressed: 'Suppressed',
  destroyed: 'Destroyed',
  unknown: 'Unknown',
};

export function ThreatList() {
  const { mission, removeThreat } = useMissionStore();

  if (!mission || mission.threats.length === 0) {
    return (
      <div className="text-gray-400 text-center py-8">
        No threats placed. Add threats from the threat library.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {mission.threats.map((threat) => (
        <div
          key={threat.id}
          className="bg-dcs-navy rounded-lg p-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div
              className={`w-3 h-3 rounded-full ${STATUS_COLORS[threat.status]}`}
              title={STATUS_LABELS[threat.status]}
            />
            <div>
              <div className="font-medium">{threat.systemId}</div>
              <div className="text-sm text-gray-400 font-mono">
                {formatCoordinatesDMS(threat.position)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {threat.orientationDeg !== undefined && (
              <span className="text-sm text-gray-400">
                HDG {threat.orientationDeg}°
              </span>
            )}
            <button
              onClick={() => removeThreat(threat.id)}
              className="text-gray-400 hover:text-red-500 p-1"
              title="Remove threat"
            >
              &times;
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
