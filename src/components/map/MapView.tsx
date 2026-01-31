import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, Polyline, useMapEvents } from 'react-leaflet';
import { divIcon, DragEndEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Theater, Waypoint, ThreatInstance, Coordinates } from '../../types';
import { THEATERS } from '../../data/theaters';
import { useMemo, useEffect, useState } from 'react';

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
  bullseye?: Coordinates;
  threatSystems?: Map<string, ThreatSystem>;
  availableThreats?: ThreatSystem[];
  onAddThreat?: (systemId: string, position: Coordinates) => void;
  onMoveThreat?: (threatId: string, position: Coordinates) => void;
}

function MapController({ theater }: { theater: Theater }) {
  const map = useMap();
  const theaterData = THEATERS[theater];

  useEffect(() => {
    if (theaterData) {
      const center = theaterData.defaultBullseye;
      map.setView([center.lat, center.lon], 8);
    }
  }, [theater, theaterData, map]);

  return null;
}

// Handle map click events for threat placement
interface MapClickHandlerProps {
  isPlacementMode: boolean;
  selectedSystemId: string | null;
  onPlaceThreat: (position: Coordinates) => void;
}

function MapClickHandler({ isPlacementMode, selectedSystemId, onPlaceThreat }: MapClickHandlerProps) {
  useMapEvents({
    click: (e) => {
      if (isPlacementMode && selectedSystemId) {
        onPlaceThreat({ lat: e.latlng.lat, lon: e.latlng.lng });
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
  bullseye,
  threatSystems,
  availableThreats = [],
  onAddThreat,
  onMoveThreat,
}: MapViewProps) {
  const theaterData = THEATERS[theater];
  const center = theaterData?.defaultBullseye ?? { lat: 0, lon: 0 };

  // Placement mode state
  const [isPlacementMode, setIsPlacementMode] = useState(false);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);

  // Group available threats by type
  const threatsByType = useMemo(() => {
    return availableThreats.reduce((acc, threat) => {
      const type = threat.threat_type;
      if (!acc[type]) acc[type] = [];
      acc[type].push(threat);
      return acc;
    }, {} as Record<string, ThreatSystem[]>);
  }, [availableThreats]);

  // Create waypoint route line
  const waypointPath = useMemo(() => {
    return waypoints.map((wp) => [wp.coordinates.lat, wp.coordinates.lon] as [number, number]);
  }, [waypoints]);

  const handlePlaceThreat = (position: Coordinates) => {
    if (selectedSystemId && onAddThreat) {
      onAddThreat(selectedSystemId, position);
    }
  };

  const handleThreatDragEnd = (threatId: string, e: DragEndEvent) => {
    const latlng = e.target.getLatLng();
    if (onMoveThreat) {
      onMoveThreat(threatId, { lat: latlng.lat, lon: latlng.lng });
    }
  };

  const selectedSystem = selectedSystemId
    ? availableThreats.find(t => t.id === selectedSystemId)
    : null;

  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={8}
        className={`h-full w-full ${isPlacementMode ? 'cursor-crosshair' : ''}`}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={15}
        />
        <MapController theater={theater} />
        <MapClickHandler
          isPlacementMode={isPlacementMode}
          selectedSystemId={selectedSystemId}
          onPlaceThreat={handlePlaceThreat}
        />

        {/* Bullseye marker */}
        {bullseye && (
          <Marker position={[bullseye.lat, bullseye.lon]} icon={bullseyeIcon} interactive={!isPlacementMode}>
            <Popup>
              <div className="font-semibold">Bullseye</div>
              <div className="text-sm">
                {bullseye.lat.toFixed(5)}, {bullseye.lon.toFixed(5)}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Waypoint markers */}
        {waypoints.map((waypoint) => (
          <Marker
            key={waypoint.id}
            position={[waypoint.coordinates.lat, waypoint.coordinates.lon]}
            icon={createWaypointIcon(waypoint.steerpoint.toString(), waypoint.type)}
            interactive={!isPlacementMode}
          >
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
            <span key={threat.id}>
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
              </Circle>

              {/* Draggable center marker for planning threats */}
              <Marker
                position={[threat.position.lat, threat.position.lon]}
                icon={createThreatIcon(system.threat_type, isDraggable && !isPlacementMode)}
                draggable={isDraggable && !isPlacementMode}
                interactive={!isPlacementMode}
                eventHandlers={isDraggable && !isPlacementMode ? {
                  dragend: (e) => handleThreatDragEnd(threat.id, e),
                } : undefined}
              >
                <Popup>
                  <div className="font-semibold">{system.name}</div>
                  <div className="text-xs text-gray-500">
                    {isMissionThreat ? 'Mission Intel (fixed)' : 'Drag to reposition'}
                  </div>
                </Popup>
              </Marker>
            </span>
          );
        })}
      </MapContainer>

      {/* Threat Placement Toolbar */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 z-[1000] max-w-xs">
        <div className="font-semibold mb-2 text-gray-800 text-sm">Add Threat</div>

        {!isPlacementMode ? (
          <button
            onClick={() => setIsPlacementMode(true)}
            className="w-full bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-2 rounded transition-colors"
          >
            Enter Placement Mode
          </button>
        ) : (
          <div className="space-y-2">
            <select
              value={selectedSystemId || ''}
              onChange={(e) => setSelectedSystemId(e.target.value || null)}
              className="w-full text-sm border border-gray-300 rounded p-2 text-gray-800"
            >
              <option value="">Select threat type...</option>
              {Object.entries(threatsByType).map(([type, systems]) => (
                <optgroup key={type} label={type}>
                  {systems.map((sys) => (
                    <option key={sys.id} value={sys.id}>
                      {sys.nato_designation || sys.name} ({sys.max_range_nm}nm)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {selectedSystem && (
              <div className="text-xs text-gray-600 p-2 bg-gray-100 rounded">
                <div className="font-medium">{selectedSystem.name}</div>
                <div>Range: {selectedSystem.max_range_nm} nm</div>
                <div>Click map to place</div>
              </div>
            )}

            <button
              onClick={() => {
                setIsPlacementMode(false);
                setSelectedSystemId(null);
              }}
              className="w-full bg-gray-500 hover:bg-gray-600 text-white text-sm px-3 py-2 rounded transition-colors"
            >
              Exit Placement Mode
            </button>
          </div>
        )}
      </div>

      {/* Placement mode indicator */}
      {isPlacementMode && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-orange-500 text-white px-4 py-2 rounded-full shadow-lg z-[1000] text-sm font-medium">
          {selectedSystemId ? 'Click map to place threat' : 'Select a threat type'}
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
