import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, Polyline, ZoomControl, useMapEvents } from 'react-leaflet';
import { divIcon, DragEndEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Theater, Waypoint, ThreatInstance, Coordinates, Attack } from '../../types';
import { THEATERS } from '../../data/theaters';
import { Fragment, useMemo, useEffect } from 'react';
import { AttackProfileOverlay } from './AttackProfileOverlay';
import { MARKER_Z } from './mapLayers';

interface ThreatSystem {
  id: string;
  name: string;
  nato_designation: string | null;
  threat_type: string;
  max_range_nm: number;
  max_altitude_ft: number;
}

interface MapViewProps {
  theater: Theater;
  waypoints?: Waypoint[];
  threats?: ThreatInstance[];
  attacks?: Attack[];
  bullseye?: Coordinates;
  threatSystems?: Map<string, ThreatSystem>;
  selectedAttackId?: string;
  onMoveThreat?: (threatId: string, position: Coordinates) => void;
  onRemoveThreat?: (threatId: string) => void;
  // Threat placement is driven by ThreatList via onRequestPlacement: it supplies
  // the callback, App toggles isPlacementMode, and a map click reports the position.
  isPlacementMode?: boolean;
  onPlacePosition?: (position: Coordinates) => void;
}

/**
 * Frames the map on the mission itself.
 *
 * Fits the view to the actual waypoints (and threats, so their rings stay visible)
 * rather than a fixed theater coordinate. Bullseye is deliberately excluded — it is
 * an arbitrary reference datum, often far from the route, and letting it drive the
 * viewport pushes the flight path to the edge of the screen.
 *
 * Falls back to the theater's default view only when there is nothing to frame.
 */
function MapController({
  theater,
  waypoints,
  threats,
}: {
  theater: Theater;
  waypoints: Waypoint[];
  threats: ThreatInstance[];
}) {
  const map = useMap();
  const theaterData = THEATERS[theater];

  // Fit only when the set of points actually changes, so panning/zooming isn't
  // yanked back on every unrelated re-render.
  const fitKey = useMemo(
    () =>
      [
        ...waypoints.map((wp) => `${wp.coordinates.lat},${wp.coordinates.lon}`),
        ...threats.map((t) => `${t.position.lat},${t.position.lon}`),
      ].join('|'),
    [waypoints, threats],
  );

  useEffect(() => {
    const points: [number, number][] = [
      ...waypoints.map((wp) => [wp.coordinates.lat, wp.coordinates.lon] as [number, number]),
      ...threats.map((t) => [t.position.lat, t.position.lon] as [number, number]),
    ].filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));

    if (points.length > 0) {
      map.fitBounds(points, { padding: [48, 48], maxZoom: 11 });
      return;
    }

    if (theaterData) {
      const center = theaterData.defaultBullseye;
      map.setView([center.lat, center.lon], 8);
    }
  }, [fitKey, theater, theaterData, map]);

  return null;
}

// Map click handler for threat placement
function MapClickHandler({
  isPlacementMode,
  onPlacePosition
}: {
  isPlacementMode: boolean;
  onPlacePosition?: (position: Coordinates) => void;
}) {
  useMapEvents({
    click: (e) => {
      if (isPlacementMode && onPlacePosition) {
        onPlacePosition({ lat: e.latlng.lat, lon: e.latlng.lng });
      }
    },
  });
  return null;
}


// Custom waypoint icon
const createWaypointIcon = (label: string, type: string) => {
  const colors: Record<string, string> = {
    target: 'bg-red-500',
    ip: 'bg-yellow-500',
    nav: 'bg-blue-500',
    cap: 'bg-purple-500',
    tanker: 'bg-green-500',
    bullseye: 'bg-orange-500',
    default: 'bg-gray-500',
  };

  const color = colors[type] || colors.default;

  return divIcon({
    html: `<div class="flex flex-col items-center">
      <div class="${color} text-white font-bold rounded-full w-8 h-8 flex items-center justify-center shadow-lg border-2 border-white">
        ${label}
      </div>
    </div>`,
    className: 'custom-waypoint-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

// Create bullseye icon
const bullseyeIcon = divIcon({
  html: `<div class="flex items-center justify-center">
    <div class="bg-orange-500 text-white font-bold rounded-full w-10 h-10 flex items-center justify-center shadow-lg border-2 border-white">
      BE
    </div>
  </div>`,
  className: 'custom-bullseye-marker',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

// Create threat center marker icon
const createThreatIcon = (threatType: string, isDraggable: boolean) => {
  const colors: Record<string, string> = {
    SAM: '#DC2626',
    AAA: '#EA580C',
    MANPADS: '#CA8A04',
    SHORAD: '#D97706',
    EWR: '#2563EB',
  };
  const color = colors[threatType] || '#6B7280';
  const cursor = isDraggable ? 'cursor-move' : 'cursor-default';

  return divIcon({
    html: `<div class="flex items-center justify-center ${cursor}">
      <div style="background-color: ${color}; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"
           class="text-white font-bold rounded w-6 h-6 flex items-center justify-center text-xs">
        ${threatType.charAt(0)}
      </div>
    </div>`,
    className: 'custom-threat-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

export function MapView({
  theater,
  waypoints = [],
  threats = [],
  attacks = [],
  bullseye,
  threatSystems,
  selectedAttackId,
  onMoveThreat,
  onRemoveThreat,
  isPlacementMode = false,
  onPlacePosition,
}: MapViewProps) {
  const theaterData = THEATERS[theater];
  const center = theaterData?.defaultBullseye ?? { lat: 0, lon: 0 };

  // Create waypoint route line
  const waypointPath = useMemo(() => {
    return waypoints.map((wp) => [wp.coordinates.lat, wp.coordinates.lon] as [number, number]);
  }, [waypoints]);

  const handleThreatDragEnd = (threatId: string, e: DragEndEvent) => {
    const latlng = e.target.getLatLng();
    if (onMoveThreat) {
      onMoveThreat(threatId, { lat: latlng.lat, lon: latlng.lng });
    }
  };

  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={8}
        className={`h-full w-full ${isPlacementMode ? 'cursor-crosshair' : ''}`}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={15}
        />
        <ZoomControl position="bottomleft" />
        <MapController theater={theater} waypoints={waypoints} threats={threats} />
        <MapClickHandler isPlacementMode={isPlacementMode} onPlacePosition={onPlacePosition} />

        {/* Bullseye marker */}
        {bullseye && (
          <Marker
            key={`bullseye-${isPlacementMode}`}
            position={[bullseye.lat, bullseye.lon]}
            icon={bullseyeIcon}
            zIndexOffset={MARKER_Z.bullseye}
            interactive={!isPlacementMode}
          >
            {!isPlacementMode && (
              <Popup>
                <div className="font-semibold">Bullseye</div>
                <div className="text-sm">
                  {bullseye.lat.toFixed(5)}, {bullseye.lon.toFixed(5)}
                </div>
              </Popup>
            )}
          </Marker>
        )}

        {/* Waypoint markers */}
        {waypoints.map((waypoint) => (
          <Marker
            key={`${waypoint.id}-${isPlacementMode}`}
            position={[waypoint.coordinates.lat, waypoint.coordinates.lon]}
            icon={createWaypointIcon(waypoint.steerpoint.toString(), waypoint.type)}
            zIndexOffset={MARKER_Z.waypoint}
            interactive={!isPlacementMode}
          >
            {!isPlacementMode && (
              <Popup>
                <div className="font-semibold">{waypoint.name}</div>
                <div className="text-sm text-gray-600">
                  Steerpoint {waypoint.steerpoint} • {waypoint.type.toUpperCase()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {waypoint.coordinates.lat.toFixed(5)}, {waypoint.coordinates.lon.toFixed(5)}
                </div>
                <div className="text-xs text-gray-500">
                  Elev: {waypoint.elevation_ft.toFixed(0)} ft MSL
                </div>
                {waypoint.targetInfo && (
                  <div className="text-xs mt-1 border-t pt-1">
                    <div className="font-medium">Target Info:</div>
                    <div>{waypoint.targetInfo.description}</div>
                    <div>Priority: {waypoint.targetInfo.priority}</div>
                  </div>
                )}
              </Popup>
            )}
          </Marker>
        ))}

        {/* Waypoint route line */}
        {waypointPath.length > 1 && (
          <Polyline
            positions={waypointPath}
            color="#3B82F6"
            weight={2}
            opacity={0.6}
            dashArray="5, 10"
          />
        )}

        {/* Threat circles and center markers */}
        {threats.map((threat) => {
          const system = threatSystems?.get(threat.systemId);
          if (!system) return null;

          const maxRangeMeters = system.max_range_nm * 1852;
          const isMissionThreat = threat.source === 'mission';
          const baseColor = threat.status === 'active' ? '#EF4444' : '#9CA3AF';
          const isDraggable = !isMissionThreat && !!onMoveThreat;

          return (
            <Fragment key={`${threat.id}-${isPlacementMode}`}>
              {/* Threat engagement envelope */}
              <Circle
                center={[threat.position.lat, threat.position.lon]}
                radius={maxRangeMeters}
                interactive={!isPlacementMode}
                pathOptions={{
                  color: baseColor,
                  fillColor: baseColor,
                  fillOpacity: isMissionThreat ? 0.1 : 0.05,
                  weight: isMissionThreat ? 2 : 2,
                  dashArray: isMissionThreat ? undefined : '8, 8',
                }}
              >
                {!isPlacementMode && (
                  <Popup>
                    <div className="font-semibold">{system.name}</div>
                    {system.nato_designation && (
                      <div className="text-sm text-gray-600">{system.nato_designation}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {threat.position.lat.toFixed(5)}, {threat.position.lon.toFixed(5)}
                    </div>
                    <div className="text-xs mt-1">
                      <div>Range: {system.max_range_nm} nm</div>
                      <div>Max Alt: {(system.max_altitude_ft / 1000).toFixed(1)}k ft</div>
                      <div>Status: <span className="font-medium capitalize">{threat.status}</span></div>
                      <div>Source: <span className={`font-medium ${isMissionThreat ? 'text-blue-600' : 'text-orange-600'}`}>
                        {isMissionThreat ? 'Mission Intel' : 'Planning Assumption'}
                      </span></div>
                    </div>
                    {!isMissionThreat && (
                      <div className="text-xs text-orange-600 mt-1 border-t pt-1">
                        Drag marker to reposition
                      </div>
                    )}
                    {threat.notes && (
                      <div className="text-xs text-gray-600 mt-1 border-t pt-1">
                        {threat.notes}
                      </div>
                    )}
                  </Popup>
                )}
              </Circle>

              {/* Draggable center marker for planning threats */}
              <Marker
                position={[threat.position.lat, threat.position.lon]}
                icon={createThreatIcon(system.threat_type, isDraggable)}
                zIndexOffset={MARKER_Z.threat}
                draggable={isDraggable && !isPlacementMode}
                interactive={!isPlacementMode}
                eventHandlers={isDraggable && !isPlacementMode ? {
                  dragend: (e) => handleThreatDragEnd(threat.id, e),
                } : undefined}
              >
                {!isPlacementMode && (
                  <Popup>
                    <div className="font-semibold">{system.name}</div>
                    {system.nato_designation && (
                      <div className="text-xs text-gray-600">{system.nato_designation}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {isMissionThreat ? 'Mission Intel (fixed)' : 'Drag to reposition'}
                    </div>
                    {!isMissionThreat && onRemoveThreat && (
                      <button
                        onClick={() => onRemoveThreat(threat.id)}
                        className="mt-1 text-xs text-gray-500 hover:text-red-600 transition-colors"
                        title="Delete threat"
                      >
                        × Delete
                      </button>
                    )}
                  </Popup>
                )}
              </Marker>
            </Fragment>
          );
        })}

        {/* Attack profile overlays */}
        {attacks.map((attack) => {
          const ipWaypoint = waypoints.find(wp =>
            attack.profileType === 'popup_ccip' &&
            (attack.profile as any).ipWaypointId === wp.id
          );
          const targetWaypoint = waypoints.find(wp => wp.id === attack.targetWaypointId);

          if (!ipWaypoint || !targetWaypoint) return null;

          return (
            <AttackProfileOverlay
              key={`${attack.id}-${isPlacementMode}`}
              attack={attack}
              ipWaypoint={ipWaypoint}
              targetWaypoint={targetWaypoint}
              isSelected={attack.id === selectedAttackId}
              isPlacementMode={isPlacementMode}
            />
          );
        })}
      </MapContainer>

      {/* Placement mode indicator */}
      {isPlacementMode && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-dcs-accent text-white px-6 py-3 rounded-lg shadow-lg z-[1000] font-medium">
          Click map to place threat
        </div>
      )}

      {/* Map legend */}
      <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-3 text-xs z-[1000]">
        <div className="font-semibold mb-2 text-gray-800">Legend</div>
        <div className="space-y-1 text-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500"></div>
            <span>Target</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
            <span>IP</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500"></div>
            <span>Navigation</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-orange-500"></div>
            <span>Bullseye</span>
          </div>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
            <div className="w-4 h-4 rounded-full border-2 border-red-500 bg-red-100"></div>
            <span>Mission Threat</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-red-500 border-dashed bg-red-50"></div>
            <span>Planning Threat</span>
          </div>
        </div>
      </div>
    </div>
  );
}
