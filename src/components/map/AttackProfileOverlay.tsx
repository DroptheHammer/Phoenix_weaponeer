import { Polyline, Marker, Tooltip, Circle } from 'react-leaflet';
import { divIcon } from 'leaflet';
import type { Attack, Waypoint, PopupCCIPProfile, PopupCCIPResult } from '../../types';
import { calculatePopupGeometry, getRecommendedParams, calculatePointAtDistance, calculateDistance } from '../../lib/attackGeometry';

interface AttackProfileOverlayProps {
  attack: Attack;
  ipWaypoint: Waypoint;
  targetWaypoint: Waypoint;
  calculatorResult?: PopupCCIPResult;
  isSelected?: boolean;
}

/**
 * Create a custom icon with a label
 */
function createLabelIcon(label: string, color: string = 'red') {
  return divIcon({
    html: `<div class="flex flex-col items-center">
      <div class="bg-${color}-500 text-white font-bold rounded-full w-10 h-10 flex items-center justify-center shadow-lg border-2 border-white text-sm">
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
}: AttackProfileOverlayProps) {
  // Only support popup CCIP for now
  if (attack.profileType !== 'popup_ccip') {
    return null;
  }

  const profile = attack.profile as PopupCCIPProfile;

  // Get recommended parameters (from Chuck's Guides)
  const params = getRecommendedParams(attack.weaponId, 'popup_ccip');

  // Calculate tactical geometry with offset turns
  const geometry = calculatePopupGeometry(
    ipWaypoint.coordinates,
    targetWaypoint.coordinates,
    params,
    profile.runInHeading_deg // User can override attack heading
  );

  // Calculate altitude and speed at each point
  const runInAlt = profile.runInAltitude_ft || params.runInAltitude_ft;
  const runInSpeed = profile.runInSpeed_ktas || params.runInSpeed_ktas;

  // At POP: same as run-in (start of climb)
  const popAlt = runInAlt;
  const popSpeed = runInSpeed;

  // At ATK: roll-in altitude from calculator, estimate speed using energy conservation
  const atkAlt = calculatorResult?.roll_in_altitude_agl || params.apexAltitude_ft;
  // Energy conservation: v² = v₀² - 2*g*Δh (simplified, ignores thrust/drag)
  // g ≈ 32.2 ft/s², 1 knot = 1.68781 ft/s
  const g = 32.2; // ft/s²
  const knotsToFtPerSec = 1.68781;
  const popSpeedFtPerSec = popSpeed * knotsToFtPerSec;
  const deltaH = atkAlt - popAlt;
  const atkSpeedFtPerSec = Math.sqrt(Math.max(0, popSpeedFtPerSec * popSpeedFtPerSec - 2 * g * deltaH));
  const atkSpeed = atkSpeedFtPerSec / knotsToFtPerSec;

  // At TGT: release altitude and speed from calculator
  const tgtAlt = calculatorResult?.release_altitude_agl || params.minReleaseAltitude_ft;
  const tgtSpeed = calculatorResult?.release_speed_ktas || runInSpeed;

  // Calculate egress heading (90° turn from attack heading)
  const egressBearing = profile.egressDirection === 'left'
    ? (geometry.attackHeading - 90 + 360) % 360
    : (geometry.attackHeading + 90) % 360;

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
        position={[geometry.offsetTurnPoint.lat, geometry.offsetTurnPoint.lon]}
        icon={createLabelIcon('POP', 'yellow')}
      >
        <Tooltip permanent direction="top" offset={[0, -20]}>
          <div className="text-xs font-semibold">
            <div>{params.offsetRange_nm}nm: Turn {params.offsetAngle_deg}° {params.offsetDirection}</div>
            <div>{Math.round(popAlt)}ft AGL @ {Math.round(popSpeed)} KTAS</div>
            <div>Climb {params.climbAngle_deg}° nose up</div>
          </div>
        </Tooltip>
      </Marker>

      {/* Attack Point marker */}
      <Marker
        position={[geometry.turnInPoint.lat, geometry.turnInPoint.lon]}
        icon={createLabelIcon('ATK', 'orange')}
      >
        <Tooltip permanent direction="top" offset={[0, -20]}>
          <div className="text-xs font-semibold">
            <div>{params.turnInRange_nm}nm: Roll nose on</div>
            <div>{Math.round(atkAlt)}ft AGL @ {Math.round(atkSpeed)} KTAS</div>
            <div>Attack hdg: {Math.round(geometry.attackHeading).toString().padStart(3, '0')}°</div>
          </div>
        </Tooltip>
      </Marker>

      {/* Target/Release point marker */}
      <Marker
        position={[geometry.targetPoint.lat, geometry.targetPoint.lon]}
        icon={createLabelIcon('TGT', 'red')}
      >
        <Tooltip permanent direction="bottom" offset={[0, 20]}>
          <div className="text-xs font-semibold">
            {calculatorResult ? (
              <>
                <div>Release: {Math.round(tgtAlt)}ft AGL @ {Math.round(tgtSpeed)} KTAS</div>
              </>
            ) : (
              <div>Min: {params.minReleaseAltitude_ft}ft</div>
            )}
          </div>
        </Tooltip>
      </Marker>

      {/* IP info label */}
      <Marker
        position={[geometry.ipPoint.lat, geometry.ipPoint.lon]}
        icon={divIcon({
          html: `<div class="bg-blue-900 bg-opacity-90 text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap border border-blue-400">
            IP: ${params.runInAltitude_ft}ft @ ${params.runInSpeed_ktas}kts
          </div>`,
          className: 'custom-info-label',
          iconSize: [120, 20],
          iconAnchor: [60, -15],
        })}
      />

      {/* Egress info label */}
      <Marker
        position={[egressPoint.lat, egressPoint.lon]}
        icon={divIcon({
          html: `<div class="bg-green-900 bg-opacity-90 text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap border border-green-400">
            Defend ${params.offsetDirection}, Exit ${Math.round(egressBearing).toString().padStart(3, '0')}°
          </div>`,
          className: 'custom-info-label',
          iconSize: [150, 20],
          iconAnchor: [75, 10],
        })}
      />

      {/* Source attribution */}
      {isSelected && (
        <Marker
          position={[geometry.ipPoint.lat, geometry.ipPoint.lon]}
          icon={divIcon({
            html: `<div class="bg-gray-900 bg-opacity-75 text-gray-300 px-2 py-1 rounded text-xs italic border border-gray-600">
              Source: ${params.source}
            </div>`,
            className: 'custom-info-label',
            iconSize: [120, 20],
            iconAnchor: [60, 35],
          })}
        />
      )}
    </>
  );
}
