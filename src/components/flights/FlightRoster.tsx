import { useMissionStore } from '../../stores/missionStore';
import type { FlightRole } from '../../types';

const ROLE_LABELS: Record<FlightRole, string> = {
  flight_lead: 'Flight Lead',
  element_lead: 'Element Lead',
  wingman: 'Wingman',
};

export function FlightRoster() {
  const { mission, removeFlightMember } = useMissionStore();

  if (!mission || mission.flightMembers.length === 0) {
    return (
      <div className="text-gray-400 text-center py-8">
        No flight members assigned. Add pilots to the flight.
      </div>
    );
  }

  // Sort by position
  const sortedMembers = [...mission.flightMembers].sort(
    (a, b) => a.position - b.position
  );

  return (
    <div className="space-y-2">
      {sortedMembers.map((member) => (
        <div
          key={member.id}
          className="bg-dcs-navy rounded-lg p-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="bg-dcs-blue px-3 py-1 rounded text-lg font-bold">
              #{member.position}
            </div>
            <div>
              <div className="font-medium">{member.callsign}</div>
              <div className="text-sm text-gray-400">
                {ROLE_LABELS[member.role]}
                {member.pilotName && ` - ${member.pilotName}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              {member.loadout.length} stations loaded
            </span>
            <button
              onClick={() => removeFlightMember(member.id)}
              className="text-gray-400 hover:text-red-500 p-1"
              title="Remove pilot"
            >
              &times;
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
