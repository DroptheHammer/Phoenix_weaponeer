import { useEffect, useRef, useState } from 'react';
import type { PopupCCIPProfile, Waypoint, Weapon, PopupCCIPResult } from '../../../types';

interface PopupCCIPFormProps {
  profile: Partial<PopupCCIPProfile>;
  ipWaypoints: Waypoint[];
  targetElevation: number;
  selectedWeapon: Weapon | null;
  onChange: (profile: Partial<PopupCCIPProfile>) => void;
  calculatorResult: PopupCCIPResult | null;
  onCalculate: () => void;
  calculatedAttackHeading: number | null;
}

interface PresetProfile {
  name: string;
  popDistance_nm: number;
  apexAltitude_ft: number;
  diveAngle_deg: number;
  runInAltitude_ft: number;
  runInSpeed_ktas: number;
}

const PRESETS: PresetProfile[] = [
  {
    name: 'Standard',
    popDistance_nm: 4.0,        // 4nm POP, 20° turn
    apexAltitude_ft: 7500,      // ATK at 2.14nm from target, 7500ft apex
    diveAngle_deg: 20,          // 20° dive
    runInAltitude_ft: 100,      // Low run-in at 100ft
    runInSpeed_ktas: 450,       // 450 KTAS
  },
];

export function PopupCCIPForm({
  profile,
  ipWaypoints,
  targetElevation,
  selectedWeapon,
  onChange,
  calculatorResult,
  onCalculate,
  calculatedAttackHeading,
}: PopupCCIPFormProps) {
  // Track whether egress direction is auto-set or manually overridden
  const [egressIsAuto, setEgressIsAuto] = useState(true);
  const prevOffsetDirection = useRef(profile.offsetDirection);

  // Auto-update egress direction when offset direction changes
  useEffect(() => {
    // Check if offset direction changed
    if (profile.offsetDirection && profile.offsetDirection !== prevOffsetDirection.current) {
      // Auto-update egress to match offset
      onChange({ ...profile, egressDirection: profile.offsetDirection });
      setEgressIsAuto(true);
      prevOffsetDirection.current = profile.offsetDirection;
    }
  }, [profile.offsetDirection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply preset and trigger calculation
  const applyPreset = (preset: PresetProfile) => {
    onChange({
      ...profile,
      popDistance_nm: preset.popDistance_nm,
      apexAltitude_ft: preset.apexAltitude_ft,
      diveAngle_deg: preset.diveAngle_deg,
      runInAltitude_ft: preset.runInAltitude_ft,
      runInSpeed_ktas: preset.runInSpeed_ktas,
    });
    // Calculate after preset is applied
    setTimeout(() => onCalculate(), 100);
  };

  // Update calculated values when calculator returns results
  useEffect(() => {
    if (calculatorResult) {
      onChange({
        ...profile,
        climbAngle_deg: calculatorResult.climb_angle_deg,
        rollInAltitude_ft: calculatorResult.roll_in_altitude_agl,
        releaseAltitude_ft: calculatorResult.release_altitude_agl,
        releaseSpeed_ktas: calculatorResult.release_speed_ktas,
      });
    }
  }, [calculatorResult]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* Preset Buttons */}
      <div>
        <label className="block text-sm font-medium mb-2">Profile Presets</label>
        <div className="flex gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset)}
              className="bg-dcs-blue hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Run-in Section */}
      <div className="border border-gray-700 rounded-lg p-4">
        <h4 className="font-semibold mb-3 text-blue-400">Run-in</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">IP Waypoint</label>
            <select
              value={profile.ipWaypointId || ''}
              onChange={(e) => onChange({ ...profile, ipWaypointId: e.target.value })}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              style={{ colorScheme: 'dark' }}
            >
              <option value="">Select IP...</option>
              {ipWaypoints.map((wp) => (
                <option key={wp.id} value={wp.id}>
                  {wp.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Heading (deg)</label>
            <input
              type="number"
              value={profile.runInHeading_deg ?? ''}
              onChange={(e) => onChange({
                ...profile,
                runInHeading_deg: e.target.value === '' ? undefined : parseFloat(e.target.value),
              })}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              placeholder="Auto from IP→Target"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Altitude (ft AGL)</label>
            <input
              type="number"
              value={profile.runInAltitude_ft || ''}
              onChange={(e) => onChange({ ...profile, runInAltitude_ft: parseFloat(e.target.value) })}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              placeholder="200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Speed (KTAS)</label>
            <input
              type="number"
              value={profile.runInSpeed_ktas || ''}
              onChange={(e) => onChange({ ...profile, runInSpeed_ktas: parseFloat(e.target.value) })}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              placeholder="450"
            />
          </div>
        </div>
      </div>

      {/* Pop Section */}
      <div className="border border-gray-700 rounded-lg p-4">
        <h4 className="font-semibold mb-3 text-yellow-400">Pop Maneuver</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Pop Distance (nm)</label>
            <input
              type="number"
              step="0.1"
              value={profile.popDistance_nm || ''}
              onChange={(e) => onChange({ ...profile, popDistance_nm: parseFloat(e.target.value) })}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              placeholder="4.0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Apex Altitude (ft AGL)</label>
            <input
              type="number"
              value={profile.apexAltitude_ft || ''}
              onChange={(e) => onChange({ ...profile, apexAltitude_ft: parseFloat(e.target.value) })}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              placeholder="7500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Offset Direction</label>
            <select
              value={profile.offsetDirection || 'right'}
              onChange={(e) => onChange({ ...profile, offsetDirection: e.target.value as 'left' | 'right' })}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              style={{ colorScheme: 'dark' }}
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Offset Angle (deg)
              <span className="text-xs text-gray-400 ml-1">(rec: 20°)</span>
            </label>
            <input
              type="number"
              value={profile.offsetAngle_deg || ''}
              onChange={(e) => onChange({ ...profile, offsetAngle_deg: parseFloat(e.target.value) })}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              placeholder="20"
            />
          </div>

          {calculatorResult && (
            <div className="col-span-2 bg-dcs-darker rounded p-2 text-sm">
              <span className="text-gray-400">Climb Angle: </span>
              <span className="text-white font-medium">{calculatorResult.climb_angle_deg.toFixed(1)}°</span>
            </div>
          )}
        </div>
      </div>

      {/* Attack Section */}
      <div className="border border-gray-700 rounded-lg p-4">
        <h4 className="font-semibold mb-3 text-red-400">Attack</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-dcs-darker rounded p-2">
            <label className="block text-xs text-gray-400 mb-1">Final Attack Dive Angle</label>
            <div className="text-white font-medium">{profile.diveAngle_deg || 20}°</div>
          </div>

          {calculatorResult && (
            <div className="bg-dcs-darker rounded p-2">
              <label className="block text-xs text-gray-400 mb-1">Final Attack Speed</label>
              <div className="text-white font-medium">{Math.round(calculatorResult.release_speed_ktas)} KTAS</div>
            </div>
          )}

          <div className="bg-dcs-darker rounded p-2">
            <label className="block text-xs text-gray-400 mb-1">Final Attack Heading</label>
            <div className="text-white font-medium">
              {profile.runInHeading_deg != null
                ? `${Math.round(profile.runInHeading_deg).toString().padStart(3, '0')}°`
                : calculatedAttackHeading !== null
                  ? `${Math.round(calculatedAttackHeading).toString().padStart(3, '0')}°`
                  : '---'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Min Release Altitude</label>
            <input
              type="number"
              value={profile.minAltitude_ft || ''}
              onChange={(e) => onChange({ ...profile, minAltitude_ft: parseFloat(e.target.value) })}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              placeholder="3000"
            />
          </div>

          {calculatorResult && (
            <>
              <div className="bg-dcs-darker rounded p-2">
                <label className="block text-xs text-gray-400 mb-1">Roll-in Alt (calc)</label>
                <div className="text-white font-medium">{Math.round(calculatorResult.roll_in_altitude_agl)} ft AGL</div>
              </div>

              <div className="bg-dcs-darker rounded p-2">
                <label className="block text-xs text-gray-400 mb-1">Release Alt (calc)</label>
                <div className="text-white font-medium">{Math.round(calculatorResult.release_altitude_agl)} ft AGL</div>
              </div>

              <div className="col-span-2 bg-yellow-900 bg-opacity-30 rounded p-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400">⚠</span>
                  <div>
                    <div className="text-white">Min Safe: {Math.round(calculatorResult.min_safe_altitude_agl)} ft AGL</div>
                    <div className="text-xs text-gray-400">Time to release: {calculatorResult.time_to_release_sec.toFixed(1)}s</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Egress Section */}
      <div className="border border-gray-700 rounded-lg p-4">
        <h4 className="font-semibold mb-3 text-green-400">Egress</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Direction
              {egressIsAuto && <span className="text-xs text-gray-400 ml-1">[Auto]</span>}
            </label>
            <select
              value={profile.egressDirection || 'left'}
              onChange={(e) => {
                onChange({ ...profile, egressDirection: e.target.value as 'left' | 'right' });
                setEgressIsAuto(false);
              }}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              style={{ colorScheme: 'dark' }}
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Heading (deg)</label>
            <input
              type="number"
              value={profile.egressHeading_deg || ''}
              onChange={(e) => onChange({ ...profile, egressHeading_deg: parseFloat(e.target.value) })}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              placeholder="Auto"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Hard Deck (ft MSL)</label>
            <input
              type="number"
              value={profile.minAltitude_ft || ''}
              onChange={(e) => onChange({ ...profile, minAltitude_ft: parseFloat(e.target.value) })}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              placeholder={`${Math.round(targetElevation + 500)}`}
            />
          </div>
        </div>
      </div>

      {/* Weapon Safety Check */}
      {selectedWeapon && calculatorResult && (
        <div className="bg-dcs-darker rounded-lg p-4">
          <h4 className="font-semibold mb-2">Weapon Constraints</h4>
          <div className="text-sm space-y-1">
            {selectedWeapon.minReleaseAlt_ft && calculatorResult.release_altitude_agl < selectedWeapon.minReleaseAlt_ft && (
              <div className="text-red-400">
                ⚠ Release altitude below weapon minimum ({selectedWeapon.minReleaseAlt_ft} ft)
              </div>
            )}
            {selectedWeapon.fragPattern?.minSafeAlt_ft && calculatorResult.release_altitude_agl < selectedWeapon.fragPattern.minSafeAlt_ft && (
              <div className="text-red-400">
                ⚠ Release altitude below frag safety ({selectedWeapon.fragPattern.minSafeAlt_ft} ft)
              </div>
            )}
            {(!selectedWeapon.minReleaseAlt_ft || calculatorResult.release_altitude_agl >= selectedWeapon.minReleaseAlt_ft) &&
             (!selectedWeapon.fragPattern?.minSafeAlt_ft || calculatorResult.release_altitude_agl >= selectedWeapon.fragPattern.minSafeAlt_ft) && (
              <div className="text-green-400">✓ Within weapon constraints</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
