import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMissionStore } from '../../stores/missionStore';
import type { FlightMember, FlightRole } from '../../types';

interface Aircraft {
  id: string;
  name: string;
  dcs_module_name: string;
}

interface FlightMemberEditorProps {
  member?: FlightMember;
  aircraft: Aircraft[];
  existingPositions: number[];
  onClose: () => void;
}

const ROLE_LABELS: Record<FlightRole, string> = {
  flight_lead: 'Flight Lead',
  element_lead: 'Element Lead',
  wingman: 'Wingman',
};

function suggestRole(position: 1 | 2 | 3 | 4): FlightRole {
  if (position === 1) return 'flight_lead';
  if (position === 3) return 'element_lead';
  return 'wingman';
}

export function FlightMemberEditor({
  member,
  aircraft,
  existingPositions,
  onClose,
}: FlightMemberEditorProps) {
  const { addFlightMember, updateFlightMember } = useMissionStore();

  const defaultPosition = ([1, 2, 3, 4] as (1 | 2 | 3 | 4)[]).find(
    (p) => !existingPositions.includes(p)
  ) || 1;

  const [callsign, setCallsign] = useState(member?.callsign || '');
  const [position, setPosition] = useState<1 | 2 | 3 | 4>(
    member?.position || defaultPosition
  );
  const [role, setRole] = useState<FlightRole>(
    member?.role || suggestRole(member?.position || defaultPosition)
  );
  const [aircraftId, setAircraftId] = useState(
    member?.aircraftId || (aircraft[0]?.id || '')
  );
  const [pilotName, setPilotName] = useState(member?.pilotName || '');

  const availablePositions = ([1, 2, 3, 4] as (1 | 2 | 3 | 4)[]).filter(
    (p) => !existingPositions.includes(p) || p === member?.position
  );

  const handlePositionChange = (newPosition: 1 | 2 | 3 | 4) => {
    setPosition(newPosition);
    if (!member) {
      setRole(suggestRole(newPosition));
    }
  };

  const canSave = Boolean(
    callsign.trim() && aircraftId && availablePositions.includes(position)
  );

  const handleSave = () => {
    if (!canSave) return;

    const memberData: Omit<FlightMember, 'id'> = {
      callsign: callsign.trim(),
      position,
      role,
      aircraftId,
      loadout: member?.loadout || [],
      pilotName: pilotName.trim() || undefined,
    };

    if (member) {
      updateFlightMember(member.id, memberData);
    } else {
      addFlightMember(memberData);
    }

    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000]">
      <div className="bg-dcs-navy text-white rounded-lg p-6 w-[500px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">
            {member ? 'Edit Pilot' : 'Add Pilot'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* Pilot Identity */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">Pilot Identity</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Callsign <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value)}
                  placeholder="e.g. Viper 1"
                  className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Pilot Name{' '}
                  <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={pilotName}
                  onChange={(e) => setPilotName(e.target.value)}
                  placeholder="e.g. Maj. Smith"
                  className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 placeholder-gray-500"
                />
              </div>
            </div>
          </div>

          {/* Flight Position */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">Flight Position</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Position <span className="text-red-400">*</span>
                </label>
                <select
                  value={position}
                  onChange={(e) =>
                    handlePositionChange(parseInt(e.target.value) as 1 | 2 | 3 | 4)
                  }
                  className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
                  style={{ colorScheme: 'dark' }}
                >
                  {([1, 2, 3, 4] as (1 | 2 | 3 | 4)[]).map((p) => (
                    <option
                      key={p}
                      value={p}
                      disabled={!availablePositions.includes(p)}
                    >
                      #{p}{!availablePositions.includes(p) ? ' (taken)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Role <span className="text-red-400">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as FlightRole)}
                  className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
                  style={{ colorScheme: 'dark' }}
                >
                  {(Object.keys(ROLE_LABELS) as FlightRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Aircraft */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">Aircraft</h3>
            <div>
              <label className="block text-sm font-medium mb-1">
                Type <span className="text-red-400">*</span>
              </label>
              <select
                value={aircraftId}
                onChange={(e) => setAircraftId(e.target.value)}
                className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
                style={{ colorScheme: 'dark' }}
              >
                <option value="">Select aircraft...</option>
                {aircraft.map((ac) => (
                  <option key={ac.id} value={ac.id}>
                    {ac.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={`px-6 py-2 rounded transition-colors ${
                canSave
                  ? 'bg-dcs-accent hover:bg-red-600 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {member ? 'Update' : 'Add'} Pilot
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
