import { useState } from 'react';
import { useMissionStore } from '../../stores/missionStore';
import { formatCoordinatesDMS } from '../../lib/coordinates';
import type { ThreatStatus, ThreatSource, Coordinates } from '../../types';

interface ThreatSystem {
  id: string;
  name: string;
  nato_designation: string | null;
  threat_type: string;
  max_range_nm: number;
  max_altitude_ft: number;
}

interface ThreatListProps {
  threatSystems: Map<string, ThreatSystem>;
  availableThreats: ThreatSystem[];
}

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

const SOURCE_LABELS: Record<ThreatSource, string> = {
  mission: 'Mission Intel',
  planning: 'Planning',
};

const THREAT_TYPE_COLORS: Record<string, string> = {
  SAM: 'text-red-400',
  AAA: 'text-orange-400',
  MANPADS: 'text-yellow-400',
  SHORAD: 'text-amber-400',
  EWR: 'text-blue-400',
};

export function ThreatList({ threatSystems, availableThreats }: ThreatListProps) {
  const { mission, addThreat, updateThreat, removeThreat } = useMissionStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedSystemId, setSelectedSystemId] = useState<string>('');
  const [newThreatCoords, setNewThreatCoords] = useState({ lat: '', lon: '' });
  const [newThreatNotes, setNewThreatNotes] = useState('');

  const handleAddThreat = () => {
    const lat = parseFloat(newThreatCoords.lat);
    const lon = parseFloat(newThreatCoords.lon);

    if (!selectedSystemId || isNaN(lat) || isNaN(lon)) {
      return;
    }

    addThreat({
      systemId: selectedSystemId,
      position: { lat, lon },
      status: 'active',
      source: 'planning',
      notes: newThreatNotes || undefined,
    });

    // Reset form
    setShowAddModal(false);
    setSelectedSystemId('');
    setNewThreatCoords({ lat: '', lon: '' });
    setNewThreatNotes('');
  };

  const handleStatusChange = (id: string, newStatus: ThreatStatus) => {
    updateThreat(id, { status: newStatus });
  };

  const handleRemoveThreat = (id: string, source: ThreatSource) => {
    if (source === 'mission') {
      if (!confirm('This threat was identified in the mission brief. Are you sure you want to remove it from your planning?')) {
        return;
      }
    }
    removeThreat(id);
  };

  // Group threats by source
  const missionThreats = mission?.threats.filter(t => t.source === 'mission') || [];
  const planningThreats = mission?.threats.filter(t => t.source === 'planning') || [];

  // Group available threats by type for the add modal
  const threatsByType = availableThreats.reduce((acc, threat) => {
    const type = threat.threat_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(threat);
    return acc;
  }, {} as Record<string, ThreatSystem[]>);

  // Use first target waypoint or bullseye as default position for new threats
  const defaultPosition: Coordinates | null = mission?.waypoints.find(w => w.type === 'target')?.coordinates
    || mission?.bullseye
    || null;

  return (
    <div className="h-full flex flex-col">
      {/* Header with add button */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold">Threat Laydown</h3>
          <p className="text-sm text-gray-400">
            {(mission?.threats.length || 0)} threats ({missionThreats.length} from mission, {planningThreats.length} planning)
          </p>
        </div>
        <button
          onClick={() => {
            if (defaultPosition) {
              setNewThreatCoords({
                lat: defaultPosition.lat.toFixed(5),
                lon: defaultPosition.lon.toFixed(5),
              });
            }
            setShowAddModal(true);
          }}
          className="bg-dcs-accent hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          <span>+</span>
          <span>Add Threat</span>
        </button>
      </div>

      {/* Threat list */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Mission threats section */}
        {missionThreats.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
              Mission Intel ({missionThreats.length})
            </h4>
            <div className="space-y-2">
              {missionThreats.map((threat) => {
                const system = threatSystems.get(threat.systemId);
                return (
                  <ThreatCard
                    key={threat.id}
                    threat={threat}
                    system={system}
                    onStatusChange={handleStatusChange}
                    onRemove={handleRemoveThreat}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Planning threats section */}
        {planningThreats.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-orange-400 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-orange-400 rounded-full"></span>
              Planning Assumptions ({planningThreats.length})
            </h4>
            <div className="space-y-2">
              {planningThreats.map((threat) => {
                const system = threatSystems.get(threat.systemId);
                return (
                  <ThreatCard
                    key={threat.id}
                    threat={threat}
                    system={system}
                    onStatusChange={handleStatusChange}
                    onRemove={handleRemoveThreat}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {(!mission || mission.threats.length === 0) && (
          <div className="text-gray-400 text-center py-8">
            <p>No threats identified.</p>
            <p className="text-sm mt-2">Import a mission with threats or add planning threats manually.</p>
          </div>
        )}
      </div>

      {/* Add Threat Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-dcs-navy rounded-lg p-6 w-[500px] max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">Add Planning Threat</h3>

            {/* Threat system selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Threat System</label>
              <select
                value={selectedSystemId}
                onChange={(e) => setSelectedSystemId(e.target.value)}
                className="w-full bg-dcs-dark border border-gray-600 rounded-lg p-2"
              >
                <option value="">Select a threat system...</option>
                {Object.entries(threatsByType).map(([type, systems]) => (
                  <optgroup key={type} label={type}>
                    {systems.map((sys) => (
                      <option key={sys.id} value={sys.id}>
                        {sys.name} {sys.nato_designation ? `(${sys.nato_designation})` : ''} - {sys.max_range_nm}nm
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Coordinates */}
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Latitude</label>
                <input
                  type="text"
                  value={newThreatCoords.lat}
                  onChange={(e) => setNewThreatCoords(prev => ({ ...prev, lat: e.target.value }))}
                  placeholder="e.g., 36.12345"
                  className="w-full bg-dcs-dark border border-gray-600 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Longitude</label>
                <input
                  type="text"
                  value={newThreatCoords.lon}
                  onChange={(e) => setNewThreatCoords(prev => ({ ...prev, lon: e.target.value }))}
                  placeholder="e.g., -115.12345"
                  className="w-full bg-dcs-dark border border-gray-600 rounded-lg p-2"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Notes (optional)</label>
              <input
                type="text"
                value={newThreatNotes}
                onChange={(e) => setNewThreatNotes(e.target.value)}
                placeholder="e.g., Possible SA-6 based on SIGINT"
                className="w-full bg-dcs-dark border border-gray-600 rounded-lg p-2"
              />
            </div>

            {/* Preview selected system */}
            {selectedSystemId && (
              <div className="mb-6 p-3 bg-dcs-dark rounded-lg">
                {(() => {
                  const sys = availableThreats.find(t => t.id === selectedSystemId);
                  if (!sys) return null;
                  return (
                    <div className="text-sm">
                      <div className="font-medium">{sys.name}</div>
                      <div className="text-gray-400 mt-1">
                        Type: <span className={THREAT_TYPE_COLORS[sys.threat_type] || 'text-gray-300'}>{sys.threat_type}</span>
                      </div>
                      <div className="text-gray-400">Range: {sys.max_range_nm} nm</div>
                      <div className="text-gray-400">Max Alt: {(sys.max_altitude_ft / 1000).toFixed(0)}k ft</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddThreat}
                disabled={!selectedSystemId || !newThreatCoords.lat || !newThreatCoords.lon}
                className="bg-dcs-accent hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
              >
                Add Threat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Individual threat card component
interface ThreatCardProps {
  threat: {
    id: string;
    systemId: string;
    position: Coordinates;
    status: ThreatStatus;
    source: ThreatSource;
    orientationDeg?: number;
    notes?: string;
  };
  system: ThreatSystem | undefined;
  onStatusChange: (id: string, status: ThreatStatus) => void;
  onRemove: (id: string, source: ThreatSource) => void;
}

function ThreatCard({ threat, system, onStatusChange, onRemove }: ThreatCardProps) {
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  return (
    <div className={`bg-dcs-dark rounded-lg p-3 border-l-4 ${
      threat.source === 'mission' ? 'border-blue-500' : 'border-orange-500'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${STATUS_COLORS[threat.status]} cursor-pointer`}
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              title={`Status: ${STATUS_LABELS[threat.status]} (click to change)`}
            />
            <div className="font-medium">
              {system?.name || threat.systemId}
            </div>
            {system?.nato_designation && (
              <span className="text-gray-400 text-sm">({system.nato_designation})</span>
            )}
          </div>

          <div className="text-sm text-gray-400 mt-1 font-mono">
            {formatCoordinatesDMS(threat.position)}
          </div>

          {system && (
            <div className="text-xs text-gray-500 mt-1">
              <span className={THREAT_TYPE_COLORS[system.threat_type] || 'text-gray-400'}>
                {system.threat_type}
              </span>
              <span className="mx-2">|</span>
              <span>{system.max_range_nm} nm</span>
              <span className="mx-2">|</span>
              <span>{(system.max_altitude_ft / 1000).toFixed(0)}k ft</span>
            </div>
          )}

          {threat.notes && (
            <div className="text-xs text-gray-500 mt-1 italic">
              {threat.notes}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded ${
            threat.source === 'mission' ? 'bg-blue-900 text-blue-300' : 'bg-orange-900 text-orange-300'
          }`}>
            {SOURCE_LABELS[threat.source]}
          </span>
          <button
            onClick={() => onRemove(threat.id, threat.source)}
            className="text-gray-400 hover:text-red-500 p-1 text-lg"
            title="Remove threat"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Status dropdown */}
      {showStatusDropdown && (
        <div className="mt-2 p-2 bg-dcs-navy rounded-lg">
          <div className="text-xs text-gray-400 mb-1">Change Status:</div>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(STATUS_LABELS) as ThreatStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => {
                  onStatusChange(threat.id, status);
                  setShowStatusDropdown(false);
                }}
                className={`px-2 py-1 text-xs rounded ${
                  threat.status === status
                    ? `${STATUS_COLORS[status]} text-white`
                    : 'bg-dcs-dark text-gray-300 hover:bg-gray-700'
                }`}
              >
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
