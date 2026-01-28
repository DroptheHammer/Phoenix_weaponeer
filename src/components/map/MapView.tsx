import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, Polyline } from 'react-leaflet';
import { divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Theater, Waypoint, ThreatInstance, Coordinates } from '../../types';
import { THEATERS } from '../../data/theaters';
import { useMemo, useEffect } from 'react';

interface MapViewProps {
  theater: Theater;
  waypoints?: Waypoint[];
  threats?: ThreatInstance[];
  bullseye?: Coordinates;
  threatSystems?: Map<string, any>; // Map of threat system ID to threat system data
}

function MapController({ theater }: { theater: Theater }) {
  const map = useMap();
  const theaterData = THEATERS[theater];

  useEffect(() => {
    // Center map on theater when it changes
    if (theaterData) {
      const center = theaterData.defaultBullseye;
      map.setView([center.lat, center.lon], 8);
    }
  }, [theater, theaterData, map]);

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

export function MapView({ theater, waypoints = [], threats = [], bullseye, threatSystems }: MapViewProps) {
  const theaterData = THEATERS[theater];
  const center = theaterData?.defaultBullseye ?? { lat: 0, lon: 0 };

  // Create waypoint route line
  const waypointPath = useMemo(() => {
    return waypoints.map((wp) => [wp.coordinates.lat, wp.coordinates.lon] as [number, number]);
  }, [waypoints]);

  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={8}
        className="h-full w-full"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={15}
        />
        <MapController theater={theater} />

        {/* Bullseye marker */}
        {bullseye && (
          <Marker position={[bullseye.lat, bullseye.lon]} icon={bullseyeIcon}>
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

        {/* Threat circles */}
        {threats.map((threat) => {
          const system = threatSystems?.get(threat.systemId);
          if (!system) return null;

          // Convert nm to meters for Leaflet circle radius
          const maxRangeMeters = system.max_range_nm * 1852;

          return (
            <Circle
              key={threat.id}
              center={[threat.position.lat, threat.position.lon]}
              radius={maxRangeMeters}
              pathOptions={{
                color: threat.status === 'active' ? '#EF4444' : '#9CA3AF',
                fillColor: threat.status === 'active' ? '#EF4444' : '#9CA3AF',
                fillOpacity: 0.1,
                weight: 2,
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
                </div>
                {threat.notes && (
                  <div className="text-xs text-gray-600 mt-1 border-t pt-1">
                    {threat.notes}
                  </div>
                )}
              </Popup>
            </Circle>
          );
        })}
      </MapContainer>

      {/* Map legend */}
      <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-3 text-xs z-[1000]">
        <div className="font-semibold mb-2">Legend</div>
        <div className="space-y-1">
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
          <div className="flex items-center gap-2 mt-2 pt-2 border-t">
            <div className="w-4 h-4 rounded-full border-2 border-red-500 bg-red-500 opacity-20"></div>
            <span>Threat Zone</span>
          </div>
        </div>
      </div>
    </div>
  );
}
