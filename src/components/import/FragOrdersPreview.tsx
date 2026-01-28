import { useState } from 'react';
import type { FragOrdersData, FragOrdersPlayerGroup } from '../../types';
import { getConfidenceClass } from '../../types';

interface FragOrdersPreviewProps {
  data: FragOrdersData;
  onBack: () => void;
  onImport: (selectedGroupIndex: number) => void;
}

export function FragOrdersPreview({ data, onBack, onImport }: FragOrdersPreviewProps) {
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);

  const selectedGroup = data.player_groups[selectedGroupIndex];
  const knownThreats = data.threats.filter((t) => t.system_id !== null);
  const unknownThreats = data.threats.filter((t) => t.system_id === null);

  return (
    <div className="space-y-4">
      {/* Theater and Bullseye */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-dcs-dark rounded-lg p-3">
          <h4 className="text-sm text-gray-400 mb-1">Theater</h4>
          <p className="font-medium capitalize">{data.theater.replace('_', ' ')}</p>
        </div>
        <div className="bg-dcs-dark rounded-lg p-3">
          <h4 className="text-sm text-gray-400 mb-1">Bullseye</h4>
          <p className="font-mono text-sm">
            {data.bullseye.lat.toFixed(4)}°, {data.bullseye.lon.toFixed(4)}°
          </p>
        </div>
      </div>

      {/* Player Group Selection */}
      {data.player_groups.length > 0 ? (
        <div className="bg-dcs-dark rounded-lg p-4">
          <h3 className="font-medium mb-3">Player Groups ({data.player_groups.length})</h3>
          {data.player_groups.length > 1 && (
            <div className="mb-3">
              <label className="text-sm text-gray-400 block mb-1">Select flight to import:</label>
              <select
                value={selectedGroupIndex}
                onChange={(e) => setSelectedGroupIndex(Number(e.target.value))}
                className="bg-dcs-navy text-white px-3 py-2 rounded border border-gray-600 focus:border-dcs-accent focus:outline-none w-full"
              >
                {data.player_groups.map((group, idx) => (
                  <option key={idx} value={idx}>
                    {group.callsign} - {group.name} ({group.aircraft_type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedGroup && (
            <PlayerGroupDetails group={selectedGroup} />
          )}
        </div>
      ) : (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-yellow-300">
          No player-flyable groups found in this mission.
        </div>
      )}

      {/* Threats */}
      <div className="bg-dcs-dark rounded-lg p-4">
        <h3 className="font-medium mb-3">
          Threats ({data.threats.length})
          {knownThreats.length > 0 && (
            <span className="text-green-400 text-sm ml-2">
              {knownThreats.length} identified
            </span>
          )}
          {unknownThreats.length > 0 && (
            <span className="text-yellow-400 text-sm ml-2">
              {unknownThreats.length} unknown
            </span>
          )}
        </h3>

        {data.threats.length > 0 ? (
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-left">
                <tr>
                  <th className="pb-2">DCS Unit Type</th>
                  <th className="pb-2">Identified As</th>
                  <th className="pb-2">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {data.threats.slice(0, 20).map((threat, idx) => (
                  <tr key={idx}>
                    <td className="py-1 font-mono text-xs">{threat.unit_type}</td>
                    <td className="py-1">
                      {threat.system_name || (
                        <span className="text-gray-500 italic">Unknown</span>
                      )}
                    </td>
                    <td className={`py-1 ${getConfidenceClass(threat.confidence)}`}>
                      {threat.confidence}
                    </td>
                  </tr>
                ))}
                {data.threats.length > 20 && (
                  <tr>
                    <td colSpan={3} className="py-2 text-gray-400 text-center">
                      ... and {data.threats.length - 20} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No threats detected in mission.</p>
        )}
      </div>

      {/* Trigger Zones */}
      {data.trigger_zones.length > 0 && (
        <div className="bg-dcs-dark rounded-lg p-4">
          <h3 className="font-medium mb-2">Trigger Zones ({data.trigger_zones.length})</h3>
          <div className="flex flex-wrap gap-2">
            {data.trigger_zones.slice(0, 10).map((zone, idx) => (
              <span
                key={idx}
                className="bg-dcs-navy px-2 py-1 rounded text-sm"
                title={`Radius: ${(zone.radius_m / 1000).toFixed(1)}km`}
              >
                {zone.name}
              </span>
            ))}
            {data.trigger_zones.length > 10 && (
              <span className="text-gray-400 text-sm">
                +{data.trigger_zones.length - 10} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-between pt-4 border-t border-gray-700">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white px-4 py-2 transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => onImport(selectedGroupIndex)}
          disabled={data.player_groups.length === 0}
          className="bg-dcs-accent hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors"
        >
          Import Mission
        </button>
      </div>
    </div>
  );
}

function PlayerGroupDetails({ group }: { group: FragOrdersPlayerGroup }) {
  return (
    <div className="space-y-3">
      {/* Group Info */}
      <div className="flex gap-4 text-sm">
        <div>
          <span className="text-gray-400">Callsign:</span>{' '}
          <span className="font-medium">{group.callsign}</span>
        </div>
        <div>
          <span className="text-gray-400">Aircraft:</span>{' '}
          <span className="font-medium">{group.aircraft_type}</span>
        </div>
        <div>
          <span className="text-gray-400">Pilots:</span>{' '}
          <span className="font-medium">{group.units.length}</span>
        </div>
      </div>

      {/* Waypoints */}
      <div>
        <h4 className="text-sm text-gray-400 mb-2">
          Waypoints ({group.waypoints.length})
        </h4>
        <div className="max-h-40 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-400 text-left sticky top-0 bg-dcs-dark">
              <tr>
                <th className="pb-1 w-12">STP</th>
                <th className="pb-1">Name</th>
                <th className="pb-1">Type</th>
                <th className="pb-1 text-right">Alt (ft)</th>
                <th className="pb-1 text-right">Speed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {group.waypoints.map((wp) => (
                <tr key={wp.steerpoint}>
                  <td className="py-1 font-mono">{wp.steerpoint}</td>
                  <td className="py-1">{wp.name}</td>
                  <td className="py-1">
                    <WaypointTypeBadge type={wp.wp_type} />
                  </td>
                  <td className="py-1 text-right font-mono">
                    {Math.round(wp.altitude_ft).toLocaleString()}
                  </td>
                  <td className="py-1 text-right font-mono text-gray-400">
                    {wp.speed_ktas ? `${Math.round(wp.speed_ktas)} kts` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function WaypointTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    ip: 'bg-yellow-600',
    target: 'bg-red-600',
    cap: 'bg-blue-600',
    marshal: 'bg-purple-600',
    tanker: 'bg-green-600',
    divert: 'bg-orange-600',
    nav: 'bg-gray-600',
  };

  const color = colors[type] || colors.nav;

  return (
    <span className={`${color} text-white text-xs px-1.5 py-0.5 rounded uppercase`}>
      {type}
    </span>
  );
}
