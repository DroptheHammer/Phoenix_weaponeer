import { useState } from 'react';
import { useMissionStore } from '../../stores/missionStore';
import { useUiStore } from '../../stores/uiStore';
import { AttackEditor } from './AttackEditor';
import { strikeOf, strikeMembers } from '../../lib/strike';
import type { AttackProfileType, DbWeapon, FuzeOption, Attack, Strike } from '../../types';

const PROFILE_LABELS: Record<AttackProfileType, string> = {
  level_ccrp: 'Level CCRP',
  dive_ccip: 'Dive CCIP',
  popup_ccip: 'Popup CCIP',
  loft_ccrp: 'Loft CCRP',
  low_angle_low_drag: 'LALD',
  high_angle_strafe: 'Strafe',
  standoff: 'Standoff',
};

interface Aircraft {
  id: string;
  name: string;
  dcs_module_name: string;
}

interface AttackListProps {
  weapons: DbWeapon[];
  fuzeOptions: Map<string, FuzeOption[]>;
  aircraft: Aircraft[];
  /** Threat ranges, so auto-build can pick an egress away from the nearest one */
  threatSystems?: Array<{ id: string; max_range_nm: number }>;
  onAttackSaved?: () => void;
}

export function AttackList({ weapons, fuzeOptions, aircraft, threatSystems, onAttackSaved }: AttackListProps) {
  const { mission, removeAttack, removeStrike, setFocusAttackId } = useMissionStore();
  const hiddenAttackerIds = useUiStore((state) => state.hiddenAttackerIds);
  const selectedAttackId = useUiStore((state) => state.selectedAttackId);
  const selectAttack = useUiStore((state) => state.selectAttack);
  const [showEditor, setShowEditor] = useState(false);
  const [editingAttack, setEditingAttack] = useState<Attack | undefined>(undefined);
  const [startStrike, setStartStrike] = useState(false);

  const handleAddAttack = () => {
    setEditingAttack(undefined);
    setStartStrike(false);
    setShowEditor(true);
  };

  const handleAddStrike = () => {
    setEditingAttack(undefined);
    setStartStrike(true);
    setShowEditor(true);
  };

  const handleEditAttack = (attack: Attack) => {
    setEditingAttack(attack);
    setStartStrike(false);
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
  // A strike lists once, where its first attack falls, with its jets lead first.
  const listItems: ({ kind: 'attack'; attack: Attack } | { kind: 'strike'; strike: Strike; members: Attack[] })[] = [];
  const listed = new Set<string>();
  for (const attack of sortedAttacks) {
    const strike = mission ? strikeOf(mission, attack.strikeId) : undefined;
    if (!strike) listItems.push({ kind: 'attack', attack });
    else if (!listed.has(strike.id)) {
      listed.add(strike.id);
      listItems.push({ kind: 'strike', strike, members: strikeMembers(mission!, strike.id) });
    }
  }

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
        <div className="flex gap-2">
          {(mission?.flightMembers.length ?? 0) > 1 && (
            <button
              onClick={handleAddStrike}
              className="border border-cyan-700 text-cyan-200 hover:bg-cyan-950 px-3 py-2 rounded-lg transition-colors"
              title="Plan the flight together: shared IP, mirrored split, spacing over the target"
            >
              + Add Strike
            </button>
          )}
          <button
            onClick={handleAddAttack}
            className="bg-dcs-accent hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <span>+</span>
            <span>Add Attack</span>
          </button>
        </div>
      </div>

      {/* Attack list: plain attacks, and each strike once, its jets under it, lead first */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {sortedAttacks.length === 0 ? (
          <div className="text-gray-400 text-center py-8">
            <p>No attacks planned.</p>
            <p className="text-sm mt-2">Add attacks to create your mission briefing.</p>
          </div>
        ) : (
          listItems.map((item) => {
            if (item.kind === 'strike') {
              const target = mission?.waypoints.find((w) => w.id === item.members[0]?.targetWaypointId);
              return (
                <div key={item.strike.id} className="rounded-lg border border-cyan-800 bg-cyan-950 bg-opacity-30 p-2 space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="text-sm">
                      <span className="font-semibold text-cyan-200">{item.strike.name}</span>
                      <span className="text-gray-400"> · {target?.name ?? 'no target'} · {item.members.length} jets · {item.strike.spacing_s} s spacing</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <button onClick={() => handleEditAttack(item.members[0])} className="text-gray-400 hover:text-blue-400 px-2 py-1" title="Edit the whole strike">
                        Edit
                      </button>
                      <button
                        onClick={() => removeStrike(item.strike.id)}
                        className="text-gray-400 hover:text-amber-300 px-2 py-1"
                        title="Ungroup: keep every jet's attack as it is, just not coordinated"
                      >
                        Ungroup
                      </button>
                    </div>
                  </div>
                  {item.members.map((attack) => renderRow(attack, `T+${attack.totOffset_s ?? 0}s`))}
                </div>
              );
            }
            return renderRow(item.attack);
          })
        )}
      </div>

      {/* Attack Editor Modal */}
      {showEditor && (
        <AttackEditor
          attack={editingAttack}
          startStrike={startStrike}
          onClose={handleCloseEditor}
          onSaved={onAttackSaved}
          weapons={weapons}
          fuzeOptions={fuzeOptions}
          aircraft={aircraft}
          threatSystems={threatSystems}
        />
      )}
    </div>
  );

  function renderRow(attack: Attack, strikeBadge?: string) {
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
                onClick={() => {
                  // Select for the highlight, focus for the fly-to. The focus
                  // action also un-hides the attacker, so a selected attack is
                  // never invisible behind the display filter.
                  selectAttack(attack.id);
                  setFocusAttackId(attack.id);
                }}
                className={`rounded-lg p-3 flex items-center justify-between transition-colors cursor-pointer ${
                  selectedAttackId === attack.id
                    ? 'bg-dcs-darker ring-2 ring-amber-400'
                    : 'bg-dcs-navy hover:bg-dcs-darker'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="bg-dcs-accent px-2 py-1 rounded text-sm font-bold">
                    #{attack.sequenceNumber}
                  </div>
                  {strikeBadge && <div className="text-xs font-mono text-cyan-200">{strikeBadge}</div>}
                  <div className="bg-dcs-blue px-2 py-1 rounded text-xs">
                    {attack.sourceProfileName ?? PROFILE_LABELS[attack.profileType]}
                    {attack.estimated && <span className="ml-1 text-amber-300" title="Profile not yet flown in DCS">~</span>}
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <span>{attacker?.callsign ?? 'Unknown'} → {target?.name ?? 'Unknown'}</span>
                      {hiddenAttackerIds.includes(attack.attackerId) && (
                        <span className="text-gray-500 text-xs italic" title="Hidden by the map display filter">
                          hidden on map
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400">
                      {weapon?.name || attack.weaponId} × {attack.releaseQuantity} ({attack.releaseMode})
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEditAttack(attack); }}
                    className="text-gray-400 hover:text-blue-400 px-2 py-1"
                    title="Edit attack"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeAttack(attack.id); }}
                    className="text-gray-400 hover:text-red-500 p-1"
                    title="Remove attack"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
  }
}
