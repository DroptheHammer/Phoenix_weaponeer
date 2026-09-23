import { Marker } from 'react-leaflet';
import { divIcon, type DragEndEvent } from 'leaflet';
import type { Coordinates } from '../../types';
import { MARKER_Z } from './mapLayers';

const customIpIcon = divIcon({
  html: `<div class="flex items-center justify-center">
    <div class="bg-blue-700 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center shadow-lg border-2 border-blue-300 text-xs">
      IP
    </div>
  </div>`,
  className: 'custom-ip-marker',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

interface CustomIpMarkerProps {
  position: Coordinates;
  onMove: (position: Coordinates) => void;
  /** False while a map click is being waited on elsewhere — matches every other marker's placement-mode guard. */
  interactive?: boolean;
}

/**
 * A custom attack IP, draggable on the map — the same drag-to-reposition
 * pattern `ThreatList`'s planning threats use. Two callers: `MapView`, for a
 * saved attack's resolved custom point (`App.tsx`'s `handleMoveCustomIp`,
 * which writes straight to the mission), and the attack editor's
 * `AttackPreviewMap`, for the draft being edited.
 */
export function CustomIpMarker({ position, onMove, interactive = true }: CustomIpMarkerProps) {
  return (
    <Marker
      position={[position.lat, position.lon]}
      icon={customIpIcon}
      draggable={interactive}
      interactive={interactive}
      zIndexOffset={MARKER_Z.waypoint}
      eventHandlers={{
        dragend: (e: DragEndEvent) => {
          const latlng = e.target.getLatLng();
          onMove({ lat: latlng.lat, lon: latlng.lng });
        },
      }}
    />
  );
}
