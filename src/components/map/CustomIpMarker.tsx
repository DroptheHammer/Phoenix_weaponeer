import { Marker, Popup, useMap } from 'react-leaflet';
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
  popupAnchor: [0, -16],
});

interface CustomIpMarkerProps {
  position: Coordinates;
  onMove: (position: Coordinates) => void;
  /** False while a map click is being waited on elsewhere — matches every other marker's placement-mode guard. */
  interactive?: boolean;
  /**
   * Phone: no dragging. A tap opens a popup whose "Move" button calls this,
   * and the caller arms a crosshair pick that ends in `onMove`. A drag on a
   * touch screen fights the map's own pan, and the finger hides the point.
   */
  onRequestMove?: () => void;
}

/**
 * A custom attack IP, draggable on the map — the same drag-to-reposition
 * pattern `ThreatList`'s planning threats use. Two callers: `MapView`, for a
 * saved attack's resolved custom point (`App.tsx`'s `handleMoveCustomIp`,
 * which writes straight to the mission), and the attack editor's
 * `AttackPreviewMap`, for the draft being edited.
 */
export function CustomIpMarker({ position, onMove, interactive = true, onRequestMove }: CustomIpMarkerProps) {
  const map = useMap();
  return (
    <Marker
      position={[position.lat, position.lon]}
      icon={customIpIcon}
      draggable={interactive && !onRequestMove}
      interactive={interactive}
      zIndexOffset={MARKER_Z.waypoint}
      eventHandlers={{
        dragend: (e: DragEndEvent) => {
          const latlng = e.target.getLatLng();
          onMove({ lat: latlng.lat, lon: latlng.lng });
        },
      }}
    >
      {onRequestMove && interactive && (
        <Popup>
          <div className="font-semibold">Custom IP</div>
          <button
            type="button"
            onClick={() => {
              map.closePopup();
              onRequestMove();
            }}
            className="mt-2 min-h-[44px] px-4 rounded-lg bg-dcs-blue text-white text-sm font-medium"
          >
            Move
          </button>
        </Popup>
      )}
    </Marker>
  );
}
