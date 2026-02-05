import { useState } from 'react';
import { useMissionStore } from '../../stores/missionStore';
import { AttackEditor } from './AttackEditor';
import type { AttackProfileType, Weapon, FuzeOption, Attack } from '../../types';

const PROFILE_LABELS: Record<AttackProfileType, string> = {
  level_ccrp: 'Level CCRP',
  dive_ccip: 'Dive CCIP',
  popup_ccip: 'Popup CCIP',
  loft_ccrp: 'Loft CCRP',
  low_angle_low_drag: 'LALD',
  high_angle_strafe: 'Strafe',
  standoff: 'Standoff',
};

interface AttackListProps {
  weapons: Weapon[];
  fuzeOptions: Map<string, FuzeOption[]>;
}

export function AttackList({ weapons, fuzeOptions }: AttackListProps) {
  const { mission, removeAttack } = useMissionStore();
  const [showEditor, setShowEditor] = useState(false);
  const [editingAttack, setEditingAttack] = useState<Attack | undefined>(undefined);

  const handleAddAttack = () => {
    setEditingAttack(undefined);
    setShowEditor(true);
  };

  const handleEditAttack = (attack: Attack) => {
    setEditingAttack(attack);
    setShowEditor(true);
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingAttack(undefined);
  };

  // Sort by sequence number
  const sortedAttacks = mission?.attacks
    ? [...mission.attacks].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    : [];

  return (
    <div className="h-full flex flex-col">
      {/* Header with add button */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold">Attack Plan</h3>
          <p className="text-sm text-gray-400">
            {sortedAttacks.length} attack{sortedAttacks.length !== 1 ? 's' : ''} planned
          </p>
        </div>
        <button
          onClick={handleAddAttack}
          className="bg-dcs-accent hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          <span>+</span>
          <span>Add Attack</span>
        </button>
      </div>

      {/* Attack list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {sortedAttacks.length === 0 ? (
          <div className="text-gray-400 text-center py-8">
            <p>No attacks planned.</p>
            <p className="text-sm mt-2">Add attacks to create your mission briefing.</p>
          </div>
        ) : (
          sortedAttacks.map((attack) => {
            const attacker = mission?.flightMembers.find(
              (m) => m.id === attack.attackerId
            );
            const target = mission?.waypoints.find(
              (w) => w.id === attack.targetWaypointId
            );
            const weapon = weapons.find(w => w.id === attack.weaponId);

            return (
              <div
                key={attack.id}
                className="bg-dcs-navy rounded-lg p-3 flex items-center justify-between hover:bg-dcs-darker transition-colors"
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
                      {weapon?.name || attack.weaponId} × {attack.releaseQuantity} ({attack.releaseMode})
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEditAttack(attack)}
                    className="text-gray-400 hover:text-blue-400 px-2 py-1"
                    title="Edit attack"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeAttack(attack.id)}
                    className="text-gray-400 hover:text-red-500 p-1"
                    title="Remove attack"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Attack Editor Modal */}
      {showEditor && (
        <AttackEditor
          attack={editingAttack}
          onClose={handleCloseEditor}
          weapons={weapons}
          fuzeOptions={fuzeOptions}
        />
      )}
    </div>
  );
}
