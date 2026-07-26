import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useMissionStore } from '../../stores/missionStore';
import { useAttackCalculator } from '../../hooks/useAttackCalculator';
import { PopupCCIPForm } from './forms/PopupCCIPForm';
import { calculateBearing } from '../../lib/coordinates';
import type {
  Attack,
  AttackProfileType,
  PopupCCIPProfile,
  Weapon,
  FuzeOption,
} from '../../types';

import { formatCallsign } from '../../lib/callsign';

interface Aircraft {
  id: string;
  name: string;
  dcs_module_name: string;
}

interface AttackEditorProps {
  attack?: Attack;
  onClose: () => void;
  weapons: Weapon[];
  fuzeOptions: Map<string, FuzeOption[]>;
  aircraft: Aircraft[];
}

export function AttackEditor({ attack, onClose, weapons, fuzeOptions, aircraft }: AttackEditorProps) {
  const { mission, addAttack, updateAttack } = useMissionStore();
  const { calculatePopupCCIP, result: calcResult, loading: calcLoading } = useAttackCalculator();

  // Form state
  const [targetWaypointId, setTargetWaypointId] = useState(attack?.targetWaypointId || '');
  const [attackerId, setAttackerId] = useState(attack?.attackerId || '');
  const [weaponId, setWeaponId] = useState(attack?.weaponId || '');
  const [fuzeId, setFuzeId] = useState(attack?.fuzeId || '');
  const [releaseQuantity, setReleaseQuantity] = useState(attack?.releaseQuantity || 1);
  const [releaseMode, setReleaseMode] = useState<'single' | 'pair' | 'ripple'>(attack?.releaseMode || 'single');
  // Only popup CCIP is implemented, so this is read-only for now.
  const [profileType] = useState<AttackProfileType>(attack?.profileType || 'popup_ccip');
  const [popupProfile, setPopupProfile] = useState<Partial<PopupCCIPProfile>>(
    attack && attack.profileType === 'popup_ccip' ? (attack.profile as PopupCCIPProfile) : {
      type: 'popup_ccip',
      runInAltitude_ft: 100,      // Validated test data
      runInSpeed_ktas: 450,
      popDistance_nm: 4.0,        // POP at 4nm from target
      apexAltitude_ft: 7500,      // ATK/apex at 7500ft
      diveAngle_deg: 20,          // 20° dive angle
      offsetDirection: 'right',   // Offset direction (right turn)
      offsetAngle_deg: 20,        // Offset angle (20° right)
      egressDirection: 'right',   // Match offset direction
      minAltitude_ft: 3000,       // Release altitude
    }
  );

  // Get mission data
  const targetWaypoints = mission?.waypoints.filter(wp => wp.type === 'target') || [];
  const ipWaypoints = mission?.waypoints.filter(wp => wp.type === 'ip') || [];
  const flightMembers = mission?.flightMembers || [];
  const selectedTarget = mission?.waypoints.find(wp => wp.id === targetWaypointId);
  const selectedWeapon = weapons.find(w => w.id === weaponId);
  const attacker = flightMembers.find(fm => fm.id === attackerId);

  // Calculate attack heading (IP to Target)
  const selectedIP = ipWaypoints.find(wp => wp.id === popupProfile.ipWaypointId);
  const calculatedAttackHeading = selectedIP && selectedTarget
    ? calculateBearing(selectedIP.coordinates, selectedTarget.coordinates)
    : null;

  // Filter weapons to attacker's loadout if they have one assigned
  const loadoutWeaponNames = attacker?.loadout?.map((l) => l.weaponType) ?? [];
  const availableWeapons =
    loadoutWeaponNames.length > 0
      ? weapons.filter((w) => loadoutWeaponNames.includes(w.name))
      : weapons;

  // Calculate profile only when explicitly called
  const triggerCalculation = useCallback(() => {
    if (!selectedTarget || !selectedWeapon || !popupProfile.runInAltitude_ft || !popupProfile.runInSpeed_ktas ||
        !popupProfile.popDistance_nm || !popupProfile.apexAltitude_ft || !popupProfile.diveAngle_deg) {
      return;
    }

    calculatePopupCCIP({
      target_elevation_ft: selectedTarget.elevation_ft || 0,
      run_in_altitude_agl: popupProfile.runInAltitude_ft,
      run_in_speed_ktas: popupProfile.runInSpeed_ktas,
      pop_distance_nm: popupProfile.popDistance_nm,
      apex_altitude_agl: popupProfile.apexAltitude_ft,
      dive_angle_deg: popupProfile.diveAngle_deg,
      weapon_id: weaponId,
    });
  }, [selectedTarget, selectedWeapon, popupProfile, weaponId, calculatePopupCCIP]);

  // Validate form
  const canSave = Boolean(
    targetWaypointId &&
    attackerId &&
    weaponId &&
    popupProfile.ipWaypointId &&
    popupProfile.runInAltitude_ft &&
    popupProfile.runInSpeed_ktas &&
    popupProfile.popDistance_nm &&
    popupProfile.apexAltitude_ft &&
    popupProfile.diveAngle_deg &&
    calcResult // Must have calculation result
  );

  const handleSave = () => {
    if (!canSave || !mission) return;

    const attackData: Omit<Attack, 'id'> = {
      targetWaypointId,
      attackerId,
      profileType,
      profile: popupProfile as PopupCCIPProfile,
      weaponId,
      fuzeId: fuzeId || undefined,
      releaseQuantity,
      releaseMode,
      sequenceNumber: attack?.sequenceNumber || mission.attacks.length + 1,
      notes: undefined,
    };

    if (attack) {
      updateAttack(attack.id, attackData);
    } else {
      addAttack(attackData);
    }

    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000]">
      <div className="bg-dcs-navy rounded-lg p-6 w-[800px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">
            {attack ? 'Edit Attack' : 'Add Attack'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* Step 1: Target & Attacker */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">Target & Attacker</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Target Waypoint</label>
                <select
                  value={targetWaypointId}
                  onChange={(e) => setTargetWaypointId(e.target.value)}
                  className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="">Select target...</option>
                  {targetWaypoints.map((wp) => (
                    <option key={wp.id} value={wp.id}>
                      {wp.name}
                    </option>
                  ))}
                </select>
                {selectedTarget && (
                  <div className="text-xs text-gray-400 mt-1">
                    Elev: {selectedTarget.elevation_ft?.toFixed(0) || 0} ft MSL
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Attacker</label>
                <select
                  value={attackerId}
                  onChange={(e) => {
                    setAttackerId(e.target.value);
                    // Clear weapon if it's not in the new attacker's loadout
                    const newAttacker = flightMembers.find((fm) => fm.id === e.target.value);
                    const newLoadoutNames = newAttacker?.loadout?.map((l) => l.weaponType) ?? [];
                    if (newLoadoutNames.length > 0) {
                      const selectedWeaponName = weapons.find((w) => w.id === weaponId)?.name;
                      if (selectedWeaponName && !newLoadoutNames.includes(selectedWeaponName)) {
                        setWeaponId('');
                      }
                    }
                  }}
                  className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="">Select attacker...</option>
                  {flightMembers.map((fm) => {
                    const ac = aircraft.find((a) => a.id === fm.aircraftId);
                    const label = [
                      formatCallsign(fm.callsign),
                      ac?.name || fm.aircraftId,
                      fm.pilotName,
                    ].filter(Boolean).join(' — ');
                    return (
                      <option key={fm.id} value={fm.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Step 2: Profile Type (hardcoded to Popup CCIP for now) */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">Attack Profile</h3>
            <div className="bg-dcs-blue px-4 py-2 rounded inline-block">
              Popup CCIP
            </div>
            <p className="text-sm text-gray-400 mt-2">
              Additional profile types (Dive CCIP, Level CCRP, etc.) coming soon
            </p>
          </div>

          {/* Step 3: Weapon Selection */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">Weapon</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Weapon</label>
                <select
                  value={weaponId}
                  onChange={(e) => {
                    setWeaponId(e.target.value);
                    setFuzeId(''); // Reset fuze when weapon changes
                  }}
                  className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="">Select weapon...</option>
                  {availableWeapons.map((weapon) => (
                    <option key={weapon.id} value={weapon.id}>
                      {weapon.name} ({weapon.weight_lbs} lbs)
                    </option>
                  ))}
                </select>
                {selectedWeapon && (
                  <div className="text-xs text-gray-400 mt-1">
                    {selectedWeapon.category} | {selectedWeapon.guidance}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Fuze</label>
                <select
                  value={fuzeId}
                  onChange={(e) => setFuzeId(e.target.value)}
                  className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
                  style={{ colorScheme: 'dark' }}
                  disabled={!weaponId}
                >
                  <option value="">Default</option>
                  {weaponId && fuzeOptions.get(weaponId)?.map((fuze) => (
                    <option key={fuze.id} value={fuze.id}>
                      {fuze.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Release Mode</label>
                <select
                  value={releaseMode}
                  onChange={(e) => setReleaseMode(e.target.value as typeof releaseMode)}
                  className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="single">Single</option>
                  <option value="pair">Pair</option>
                  <option value="ripple">Ripple</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={releaseQuantity}
                  onChange={(e) => setReleaseQuantity(parseInt(e.target.value) || 1)}
                  className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
                />
              </div>
            </div>
          </div>

          {/* Step 4: Profile Parameters */}
          {profileType === 'popup_ccip' && (
            <PopupCCIPForm
              profile={popupProfile}
              ipWaypoints={ipWaypoints}
              targetElevation={selectedTarget?.elevation_ft || 0}
              selectedWeapon={selectedWeapon || null}
              onChange={setPopupProfile}
              calculatorResult={calcResult}
              onCalculate={triggerCalculation}
              calculatedAttackHeading={calculatedAttackHeading}
            />
          )}

          {/* Calculation Status */}
          {calcLoading && (
            <div className="text-center text-yellow-400">
              Calculating...
            </div>
          )}

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
              {attack ? 'Update' : 'Add'} Attack
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
