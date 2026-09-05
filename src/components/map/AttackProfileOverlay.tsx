import { Polyline, Marker, Tooltip } from 'react-leaflet';
import { divIcon } from 'leaflet';
import type { Attack, Waypoint, PopupCCIPProfile, PopupCCIPResult } from '../../types';
import type { ChucksGuideParams } from '../../lib/attackGeometry';
import { MARKER_Z } from './mapLayers';
import {
  calculatePopupGeometry,
  getRecommendedParams,
  calculatePointAtDistance,
  resolveEgressHeading,
} from '../../lib/attackGeometry';

interface AttackProfileOverlayProps {
  attack: Attack;
  ipWaypoint: Waypoint;
  targetWaypoint: Waypoint;
  calculatorResult?: PopupCCIPResult;
  isSelected?: boolean;
  /** While placing a threat, overlay markers must not swallow the map click. */
  isPlacementMode?: boolean;
}

/**
 * Create a custom icon with a label
 */
// Tailwind only emits classes it can see as complete literals, so `bg-${color}-500`
// is not safe to construct at runtime — it survived only because these exact
// literals happen to appear in other files. Look them up explicitly instead.
const labelColorClasses: Record<string, string> = {
  red: 'bg-red-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
};

function createLabelIcon(label: string, color: string = 'red') {
  const colorClass = labelColorClasses[color] ?? 'bg-gray-500';
  return divIcon({
    html: `<div class="flex flex-col items-center">
      <div class="${colorClass} text-white font-bold rounded-full w-10 h-10 flex items-center justify-center shadow-lg border-2 border-white text-sm">
        ${label}
      </div>
    </div>`,
    className: 'custom-attack-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

export function AttackProfileOverlay({
  attack,
  ipWaypoint,
  targetWaypoint,
  calculatorResult,
  isSelected = false,
  isPlacementMode = false,
}: AttackProfileOverlayProps) {
  // Only support popup CCIP for now
  if (attack.profileType !== 'popup_ccip') {
    return null;
  }

  const profile = attack.profile as PopupCCIPProfile;

  // Get recommended parameters (from Chuck's Guides)
  const params = getRecommendedParams(attack.weaponId, 'popup_ccip');

  // The saved profile wins wherever the planner has actually set a value;
  // recommended params only fill the gaps. Checked with Number.isFinite rather
  // than truthiness so a legitimate 0 is honoured and a stray NaN is not.
  const num = (v: number | undefined, fallback: number) =>
    v != null && Number.isFinite(v) ? v : fallback;

  const effective: ChucksGuideParams = {
    ...params,
    offsetRange_nm: num(profile.popDistance_nm, params.offsetRange_nm),
    offsetAngle_deg: num(profile.offsetAngle_deg, params.offsetAngle_deg),
    offsetDirection: profile.offsetDirection ?? params.offsetDirection,
    climbAngle_deg: num(profile.climbAngle_deg, params.climbAngle_deg),
    turnInRange_nm: num(profile.turnInRange_nm, params.turnInRange_nm),
    apexAltitude_ft: num(profile.apexAltitude_ft, params.apexAltitude_ft),
    minReleaseAltitude_ft: num(profile.releaseAltitude_ft, params.minReleaseAltitude_ft),
    runInAltitude_ft: num(profile.runInAltitude_ft, params.runInAltitude_ft),
    runInSpeed_ktas: num(profile.runInSpeed_ktas, params.runInSpeed_ktas),
  };

  // Calculator results are raw floats (a climb angle arrives as 17.891334…),
  // so format before drawing them on the map.
  const nm = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  const deg = (v: number) => Math.round(v);

  // Don't attribute planner-edited numbers to the reference source.
  const isEdited = (Object.keys(effective) as (keyof ChucksGuideParams)[]).some(
    (key) => key !== 'source' && effective[key] !== params[key],
  );
  const sourceLabel = isEdited ? `${params.source} — edited` : params.source;

  // Calculate tactical geometry with offset turns
  const geometry = calculatePopupGeometry(
    ipWaypoint.coordinates,
    targetWaypoint.coordinates,
    effective,
    profile.runInHeading_deg // User can override attack heading
  );

  // Calculate altitude and speed at each point
  const runInAlt = effective.runInAltitude_ft;
  const runInSpeed = effective.runInSpeed_ktas;

  // At POP: same as run-in (start of climb)
  const popAlt = runInAlt;
  const popSpeed = runInSpeed;

  // At ATK: roll-in altitude from calculator, estimate speed using energy conservation
  const atkAlt = calculatorResult?.roll_in_altitude_agl || effective.apexAltitude_ft;
  // Energy conservation: v² = v₀² - 2*g*Δh (simplified, ignores thrust/drag)
  // g ≈ 32.2 ft/s², 1 knot = 1.68781 ft/s
  const g = 32.2; // ft/s²
  const knotsToFtPerSec = 1.68781;
  const popSpeedFtPerSec = popSpeed * knotsToFtPerSec;
  const deltaH = atkAlt - popAlt;
  const atkSpeedFtPerSec = Math.sqrt(Math.max(0, popSpeedFtPerSec * popSpeedFtPerSec - 2 * g * deltaH));
  const atkSpeed = atkSpeedFtPerSec / knotsToFtPerSec;

  // At TGT: release altitude and speed from calculator
  const tgtAlt = calculatorResult?.release_altitude_agl || effective.minReleaseAltitude_ft;
  const tgtSpeed = calculatorResult?.release_speed_ktas || runInSpeed;

  // Egress heading — shared with the kneeboard card so both say the same thing.
  const egressBearing = resolveEgressHeading(profile, geometry.attackHeading);

  // Calculate egress point using proper bearing calculation
  const egressPoint = calculatePointAtDistance(
    geometry.targetPoint,
    egressBearing,
    1.5 // 1.5nm egress line for visualization
  );

  // Visual styling
  const lineColor = isSelected ? '#3b82f6' : '#60a5fa'; // blue-600 or blue-400
  const lineWeight = isSelected ? 3 : 2;
  const opacity = isSelected ? 1.0 : 0.7;

  return (
    <>
      {/* 1. Initial leg: IP to Offset Turn Point (blue dashed) */}
      <Polyline
        positions={[
          [geometry.ipPoint.lat, geometry.ipPoint.lon],
          [geometry.offsetTurnPoint.lat, geometry.offsetTurnPoint.lon],
        ]}
        pathOptions={{
          color: lineColor,
          weight: lineWeight,
          opacity: opacity,
          dashArray: '10, 10',
        }}
      />

      {/* 2. Offset leg: Offset Turn to Turn-In Point (yellow solid) */}
      <Polyline
        positions={[
          [geometry.offsetTurnPoint.lat, geometry.offsetTurnPoint.lon],
          [geometry.turnInPoint.lat, geometry.turnInPoint.lon],
        ]}
        pathOptions={{
          color: '#fbbf24', // yellow-400
          weight: lineWeight,
          opacity: opacity,
        }}
      />

      {/* 3. Attack leg: Turn-In Point to Target (red solid) */}
      <Polyline
        positions={[
          [geometry.turnInPoint.lat, geometry.turnInPoint.lon],
          [geometry.targetPoint.lat, geometry.targetPoint.lon],
        ]}
        pathOptions={{
          color: '#ef4444', // red-500
          weight: lineWeight + 1,
          opacity: opacity,
        }}
      />

      {/* 4. Egress line from Target (green dashed) */}
      <Polyline
        positions={[
          [geometry.targetPoint.lat, geometry.targetPoint.lon],
          [egressPoint.lat, egressPoint.lon],
        ]}
        pathOptions={{
          color: '#22c55e', // green-500
          weight: lineWeight,
          opacity: opacity,
          dashArray: '10, 10',
        }}
      />

      {/* Pop Point marker */}
      <Marker
        interactive={!isPlacementMode}
        position={[geometry.offsetTurnPoint.lat, geometry.offsetTurnPoint.lon]}
        icon={createLabelIcon('POP', 'yellow')}
        zIndexOffset={MARKER_Z.attackPoint}
      >
        {/* POP hangs below while ATK sits above: the two points are only a
            fraction of a mile apart on a tight profile, so same-side permanent
            tooltips overlap and neither can be read. */}
        <Tooltip permanent direction="bottom" offset={[0, 20]} className="attack-tooltip">
          <div className="text-xs font-semibold">
            <div>{nm(effective.offsetRange_nm)}nm: Turn {deg(effective.offsetAngle_deg)}° {effective.offsetDirection}</div>
            <div>{Math.round(popAlt).toLocaleString()}ft AGL @ {Math.round(popSpeed)} KTAS</div>
            <div>Climb {deg(effective.climbAngle_deg)}° nose up</div>
          </div>
        </Tooltip>
      </Marker>

      {/* Attack Point marker */}
      <Marker
        interactive={!isPlacementMode}
        position={[geometry.turnInPoint.lat, geometry.turnInPoint.lon]}
        icon={createLabelIcon('ATK', 'orange')}
        zIndexOffset={MARKER_Z.attackPoint}
      >
        <Tooltip permanent direction="top" offset={[0, -20]} className="attack-tooltip">
          <div className="text-xs font-semibold">
            <div>{nm(effective.turnInRange_nm)}nm: Roll nose on</div>
            <div>{Math.round(atkAlt).toLocaleString()}ft AGL @ {Math.round(atkSpeed)} KTAS</div>
            <div>Attack hdg: {Math.round(geometry.attackHeading).toString().padStart(3, '0')}°</div>
          </div>
        </Tooltip>
      </Marker>

      {/* Target/Release point marker */}
      <Marker
        interactive={!isPlacementMode}
        position={[geometry.targetPoint.lat, geometry.targetPoint.lon]}
        icon={createLabelIcon('TGT', 'red')}
        zIndexOffset={MARKER_Z.attackPoint}
      >
        <Tooltip permanent direction="bottom" offset={[0, 20]} className="attack-tooltip">
          <div className="text-xs font-semibold">
            {calculatorResult ? (
              <>
                <div>Release: {Math.round(tgtAlt)}ft AGL @ {Math.round(tgtSpeed)} KTAS</div>
              </>
            ) : (
              <div>Min: {effective.minReleaseAltitude_ft}ft</div>
            )}
          </div>
        </Tooltip>
      </Marker>

      {/* IP info label */}
      <Marker
        interactive={!isPlacementMode}
        position={[geometry.ipPoint.lat, geometry.ipPoint.lon]}
        icon={divIcon({
          html: `<div class="bg-blue-900 bg-opacity-90 text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap border border-blue-400">
            IP: ${effective.runInAltitude_ft}ft @ ${effective.runInSpeed_ktas}kts
          </div>`,
          className: 'custom-info-label',
          iconSize: [120, 20],
          iconAnchor: [60, -15],
        })}
        zIndexOffset={MARKER_Z.label}
      />

      {/* Egress info label */}
      <Marker
        interactive={!isPlacementMode}
        position={[egressPoint.lat, egressPoint.lon]}
        icon={divIcon({
          html: `<div class="bg-green-900 bg-opacity-90 text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap border border-green-400">
            Defend ${profile.egressDirection ?? effective.offsetDirection}, Exit ${Math.round(egressBearing).toString().padStart(3, '0')}°
          </div>`,
          className: 'custom-info-label',
          iconSize: [150, 20],
          iconAnchor: [75, 10],
        })}
        zIndexOffset={MARKER_Z.label}
      />

      {/* Source attribution */}
      {isSelected && (
        <Marker
          interactive={!isPlacementMode}
          position={[geometry.ipPoint.lat, geometry.ipPoint.lon]}
          icon={divIcon({
            html: `<div class="bg-gray-900 bg-opacity-75 text-gray-300 px-2 py-1 rounded text-xs italic border border-gray-600">
              Source: ${sourceLabel}
            </div>`,
            className: 'custom-info-label',
            iconSize: [120, 20],
            iconAnchor: [60, 35],
          })}
          zIndexOffset={MARKER_Z.label}
        />
      )}
    </>
  );
}
