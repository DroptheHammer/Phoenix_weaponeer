import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, Polyline, ZoomControl, useMapEvents } from 'react-leaflet';
import { divIcon, DragEndEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Theater, Waypoint, ThreatInstance, Coordinates, Attack } from '../../types';
import type { FlightMember } from '../../types/flight.types';
import { useTheaterInfo } from '../../stores/theaterStore';
import { Fragment, useMemo, useEffect, useState } from 'react';
import { AttackProfileOverlay } from './AttackProfileOverlay';
import { AttackLabelLayer } from './AttackLabelLayer';
import { MapLegend } from './MapLegend';
import { buildAttackPicture, pictureFitPoints } from '../../lib/attackPicture';
import { leaderLine, type PlacedLabel } from '../../lib/labelLayout';
import { MARKER_Z } from './mapLayers';
import { applyDisplayFilter } from '../../lib/displayFilter';
import { useUiStore } from '../../stores/uiStore';

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
  /** Set right after an attack is added/edited; the map reframes on it once, then this should be cleared. */
  focusAttackId?: string | null;
  onAttackFocused?: () => void;
  onMoveThreat?: (threatId: string, position: Coordinates) => void;
  onRemoveThreat?: (threatId: string) => void;
  // Threat placement is driven by ThreatList via onRequestPlacement: it supplies
  // the callback, App toggles isPlacementMode, and a map click reports the position.
  isPlacementMode?: boolean;
  onPlacePosition?: (position: Coordinates) => void;
  flightMembers?: FlightMember[];
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
  const theaterInfo = useTheaterInfo(theater);

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

    if (theaterInfo) {
      const center = theaterInfo.default_center;
      map.setView([center.lat, center.lon], 8);
    }
  }, [fitKey, theater, theaterInfo, map]);

  return null;
}

/**
 * Reframes the map on one attack right after it's added or edited.
 *
 * Editing an attack from the panel doesn't move any waypoint or threat, so
 * `MapController` never re-fits — a planner who had panned in to check the
 * result was left staring at wherever they'd scrolled, with no way back to
 * the attack short of manually re-finding it. `focusAttackId` is set once by
 * the editor's Save and cleared here right after the fit, so it doesn't keep
 * yanking the view back on every unrelated re-render.
 */
function FocusController({
  attacks,
  waypoints,
  focusAttackId,
  onFocused,
}: {
  attacks: Attack[];
  waypoints: Waypoint[];
  focusAttackId?: string | null;
  onFocused: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!focusAttackId) return;
    const attack = attacks.find((a) => a.id === focusAttackId);
    const targetWaypoint = attack ? waypoints.find((wp) => wp.id === attack.targetWaypointId) : undefined;
    if (!attack || !targetWaypoint) {
      onFocused();
      return;
    }
    const ipWaypointId = (attack.profile as { ipWaypointId?: string }).ipWaypointId;
    const ipWaypoint = ipWaypointId ? waypoints.find((wp) => wp.id === ipWaypointId) : undefined;
    const picture = buildAttackPicture(attack, ipWaypoint, targetWaypoint);

    const fitPoints = picture ? pictureFitPoints(picture) : [];
    const points: [number, number][] =
      fitPoints.length > 0
        ? fitPoints.map((p) => [p.lat, p.lon] as [number, number])
        : [[targetWaypoint.coordinates.lat, targetWaypoint.coordinates.lon]];

    map.fitBounds(points, { padding: [64, 64], maxZoom: 13 });
    onFocused();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAttackId]);

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
  focusAttackId,
  onAttackFocused,
  onMoveThreat,
  onRemoveThreat,
  isPlacementMode = false,
  onPlacePosition,
  flightMembers = [],
}: MapViewProps) {
  const theaterInfo = useTheaterInfo(theater);
  const center = theaterInfo?.default_center ?? { lat: 0, lon: 0 };
  const [placedLabels, setPlacedLabels] = useState<PlacedLabel[]>([]);

  // Map display filter — a view-time control only. Applied here, at the draw
  // sites, and NOT fed into MapController/FocusController below: those two
  // re-fit the camera off the FULL waypoint/threat arrays so hiding the route
  // or a pilot's attack never yanks the view. See src/lib/displayFilter.ts.
  const hiddenAttackerIds = useUiStore((s) => s.hiddenAttackerIds);
  const hiddenThreatSources = useUiStore((s) => s.hiddenThreatSources);
  const routeHidden = useUiStore((s) => s.routeHidden);
  const filtered = useMemo(
    () =>
      applyDisplayFilter(
        { attacks, threats, waypoints },
        { hiddenAttackerIds, hiddenThreatSources, routeHidden },
      ),
    [attacks, threats, waypoints, hiddenAttackerIds, hiddenThreatSources, routeHidden],
  );
  const visibleWaypoints = filtered.waypoints;
  const visibleThreats = filtered.threats;
  const visibleAttacks = filtered.attacks;

  // Create waypoint route line — from the filtered (possibly hidden) set, so
  // hiding the route also removes this line. The camera fit above stays on
  // the full `waypoints` array regardless.
  const waypointPath = useMemo(() => {
    return visibleWaypoints.map((wp) => [wp.coordinates.lat, wp.coordinates.lon] as [number, number]);
  }, [visibleWaypoints]);

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
        <FocusController attacks={attacks} waypoints={waypoints} focusAttackId={focusAttackId} onFocused={() => onAttackFocused?.()} />
        <AttackLabelLayer attacks={visibleAttacks} waypoints={waypoints} flightMembers={flightMembers} onPlaced={setPlacedLabels} />
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
        {visibleWaypoints.map((waypoint) => (
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
        {visibleThreats.map((threat) => {
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
        {visibleAttacks.map((attack) => {
          // Any profile may name an IP; only popup cannot be drawn without one
          // (the overlay itself decides that).
          const ipWaypointId = (attack.profile as { ipWaypointId?: string }).ipWaypointId;
          const ipWaypoint = ipWaypointId ? waypoints.find((wp) => wp.id === ipWaypointId) : undefined;
          const targetWaypoint = waypoints.find(wp => wp.id === attack.targetWaypointId);

          if (!targetWaypoint) return null;

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

      {/* Attack-picture labels, laid out collision-aware over every visible attack. */}
      <div className="absolute inset-0 z-[900] pointer-events-none">
        <svg className="absolute inset-0 w-full h-full">
          {placedLabels
            .filter((l) => l.leader)
            .map((l, i) => {
              const line = leaderLine(l);
              if (!line) return null;
              const [[x1, y1], [x2, y2]] = [line.from, line.to];
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#374151" strokeWidth={1} />;
            })}
        </svg>
        {placedLabels.map((l, i) => (
          <div
            key={i}
            className="absolute rounded text-xs font-semibold px-1.5 py-1 shadow-lg leading-tight whitespace-nowrap"
            style={{
              left: l.rect.x,
              top: l.rect.y,
              background: l.style?.bg ?? '#ffffff',
              color: l.style?.fg ?? '#111827',
              border: `1px solid ${l.style?.border ?? '#374151'}`,
            }}
          >
            {l.lines.map((line, j) => (
              <div key={j}>{line}</div>
            ))}
          </div>
        ))}
      </div>

      {/* Placement mode indicator */}
      {isPlacementMode && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-dcs-accent text-white px-6 py-3 rounded-lg shadow-lg z-[1000] font-medium">
          Click map to place threat
        </div>
      )}

      {/* Map legend — doubles as the display filter control */}
      <MapLegend attacks={attacks} flightMembers={flightMembers} threats={threats} />
    </div>
  );
}
