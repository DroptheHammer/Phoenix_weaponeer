import { useMissionStore } from '../../stores/missionStore';
import { useTheaterInfo } from '../../stores/theaterStore';

export function MissionInfo() {
  const { mission, updateMissionName, updateMissionNotes } = useMissionStore();
  // Called before the early return — hooks cannot be conditional.
  const theaterInfo = useTheaterInfo(mission?.theater);

  if (!mission) {
    return null;
  }

  return (
    <div className="bg-dcs-navy rounded-lg p-4 space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Mission Name</label>
        <input
          type="text"
          value={mission.name}
          onChange={(e) => updateMissionName(e.target.value)}
          className="w-full bg-dcs-dark text-white px-3 py-2 rounded border border-gray-600 focus:border-dcs-accent focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Theater</label>
          <div className="text-white">{theaterInfo?.display_name ?? mission.theater}</div>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Date</label>
          <div className="text-white">{mission.date}</div>
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Notes</label>
        <textarea
          value={mission.notes}
          onChange={(e) => updateMissionNotes(e.target.value)}
          rows={4}
          className="w-full bg-dcs-dark text-white px-3 py-2 rounded border border-gray-600 focus:border-dcs-accent focus:outline-none resize-none"
          placeholder="Mission notes..."
        />
      </div>
    </div>
  );
}
