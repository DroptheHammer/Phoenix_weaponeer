import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Theater } from '../../types';
import { THEATERS } from '../../data/theaters';

interface MapViewProps {
  theater: Theater;
}

function MapController({ theater }: { theater: Theater }) {
  const map = useMap();
  const theaterData = THEATERS[theater];

  // Center map on theater when it changes
  if (theaterData) {
    const center = theaterData.defaultBullseye;
    map.setView([center.lat, center.lon], 8);
  }

  return null;
}

export function MapView({ theater }: MapViewProps) {
  const theaterData = THEATERS[theater];
  const center = theaterData?.defaultBullseye ?? { lat: 0, lon: 0 };

  return (
    <div className="h-full w-full">
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={8}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController theater={theater} />
        {/* Waypoint markers, threat rings, and attack vectors will be added here */}
      </MapContainer>
    </div>
  );
}
