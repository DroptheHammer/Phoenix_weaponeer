import { useMissionStore } from '../../stores/missionStore';
import type { AttackProfileType } from '../../types';

const PROFILE_LABELS: Record<AttackProfileType, string> = {
  level_ccrp: 'Level CCRP',
  dive_ccip: 'Dive CCIP',
  popup_ccip: 'Popup CCIP',
  loft_ccrp: 'Loft CCRP',
  low_angle_low_drag: 'LALD',
  high_angle_strafe: 'Strafe',
  standoff: 'Standoff',
};

export function AttackList() {
  const { mission, removeAttack } = useMissionStore();

  if (!mission || mission.attacks.length === 0) {
    return (
      <div className="text-gray-400 text-center py-8">
        No attacks planned. Assign attacks to flight members.
      </div>
    );
  }

  // Sort by sequence number
  const sortedAttacks = [...mission.attacks].sort(
    (a, b) => a.sequenceNumber - b.sequenceNumber
  );

  return (
    <div className="space-y-2">
      {sortedAttacks.map((attack) => {
        const attacker = mission.flightMembers.find(
          (m) => m.id === attack.attackerId
        );
        const target = mission.waypoints.find(
          (w) => w.id === attack.targetWaypointId
        );

        return (
          <div
            key={attack.id}
            className="bg-dcs-navy rounded-lg p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="bg-dcs-accent px-2 py-1 rounded text-sm font-bold">
                #{attack.sequenceNumber}
              </div>
              <div className="bg-dcs-blue px-2 py-1 rounded text-xs">
                {PROFILE_LABELS[attack.profileType]}
              </div>
              <div>
                <div className="font-medium">
                  {attacker?.callsign ?? 'Unknown'} → {target?.name ?? 'Unknown'}
                </div>
                <div className="text-sm text-gray-400">
                  {attack.weaponId} × {attack.releaseQuantity} ({attack.releaseMode})
                </div>
              </div>
            </div>
            <button
              onClick={() => removeAttack(attack.id)}
              className="text-gray-400 hover:text-red-500 p-1"
              title="Remove attack"
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
