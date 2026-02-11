import { useState } from 'react';
import { useMissionStore } from '../../stores/missionStore';
import { FlightMemberEditor } from './FlightMemberEditor';
import { LoadoutEditor } from './LoadoutEditor';
import { formatCallsign } from '../../lib/callsign';
import type { FlightMember, FlightRole, LoadoutItem } from '../../types';

interface Aircraft {
  id: string;
  name: string;
  dcs_module_name: string;
}

interface FlightRosterProps {
  aircraft: Aircraft[];
}

const ROLE_LABELS: Record<FlightRole, string> = {
  flight_lead: 'Flight Lead',
  element_lead: 'Element Lead',
  wingman: 'Wingman',
};

function summariseLoadout(loadout: LoadoutItem[]): string {
  if (!loadout || loadout.length === 0) return 'No loadout';
  return loadout.map((item) => `${item.quantity}x ${item.weaponType}`).join(', ');
}

export function FlightRoster({ aircraft }: FlightRosterProps) {
  const { mission, removeFlightMember, updateFlightMember } = useMissionStore();
  const [showEditor, setShowEditor] = useState(false);
  const [editingMember, setEditingMember] = useState<FlightMember | undefined>(undefined);
  const [loadoutMember, setLoadoutMember] = useState<FlightMember | undefined>(undefined);

  const handleAdd = () => {
    setEditingMember(undefined);
    setShowEditor(true);
  };

  const handleEdit = (member: FlightMember) => {
    setEditingMember(member);
    setShowEditor(true);
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingMember(undefined);
  };

  const handleLoadout = (member: FlightMember) => {
    setLoadoutMember(member);
  };

  const handleSaveLoadout = (newLoadout: LoadoutItem[]) => {
    if (loadoutMember) {
      updateFlightMember(loadoutMember.id, { loadout: newLoadout });
    }
    setLoadoutMember(undefined);
  };

  const handleCloseLoadout = () => {
    setLoadoutMember(undefined);
  };

  const getExistingPositions = (excludeId?: string): number[] => {
    return (mission?.flightMembers || [])
      .filter((m) => m.id !== excludeId)
      .map((m) => m.position);
  };

  const sortedMembers = [...(mission?.flightMembers || [])].sort(
    (a, b) => a.position - b.position
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold">Flight Roster</h3>
          <p className="text-sm text-gray-400">
            {sortedMembers.length} / 4 pilots assigned
          </p>
        </div>
        {sortedMembers.length < 4 && (
          <button
            onClick={handleAdd}
            className="bg-dcs-accent hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <span>+</span>
            <span>Add Pilot</span>
          </button>
        )}
      </div>

      {/* Member list */}
      {sortedMembers.length === 0 ? (
        <div className="text-gray-400 text-center py-8">
          <p>No pilots assigned.</p>
          <p className="text-sm mt-2">Add pilots to the flight using the button above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedMembers.map((member) => {
            const memberAircraft = aircraft.find((a) => a.id === member.aircraftId);
            return (
              <div
                key={member.id}
                className="bg-dcs-dark rounded-lg p-3 border border-gray-700"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-dcs-blue px-3 py-1 rounded text-lg font-bold min-w-[48px] text-center">
                      #{member.position}
                    </div>
                    <div>
                      <div className="font-medium">{formatCallsign(member.callsign)}</div>
                      <div className="text-sm text-gray-400">
                        {ROLE_LABELS[member.role]}
                        {member.pilotName && ` — ${member.pilotName}`}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {memberAircraft?.name || member.aircraftId}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 italic">
                        {summariseLoadout(member.loadout)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleLoadout(member)}
                      className="text-gray-400 hover:text-green-400 text-sm px-2 py-1 rounded hover:bg-gray-700 transition-colors"
                      title="Edit loadout"
                    >
                      Loadout
                    </button>
                    <button
                      onClick={() => handleEdit(member)}
                      className="text-gray-400 hover:text-blue-400 text-sm px-2 py-1 rounded hover:bg-gray-700 transition-colors"
                      title="Edit pilot"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeFlightMember(member.id)}
                      className="text-gray-400 hover:text-red-500 p-1"
                      title="Remove pilot"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor modal */}
      {showEditor && (
        <FlightMemberEditor
          member={editingMember}
          aircraft={aircraft}
          existingPositions={getExistingPositions(editingMember?.id)}
          onClose={handleCloseEditor}
        />
      )}

      {/* Loadout modal */}
      {loadoutMember && (
        <LoadoutEditor
          aircraftName={
            aircraft.find((a) => a.id === loadoutMember.aircraftId)?.name ??
            loadoutMember.aircraftId
          }
          loadout={loadoutMember.loadout}
          onSave={handleSaveLoadout}
          onClose={handleCloseLoadout}
        />
      )}
    </div>
  );
}
