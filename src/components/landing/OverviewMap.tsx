import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { ThreatInstance } from '../../types/threat.types';
import type { Coordinates, Waypoint } from '../../types/waypoint.types';
import { OSM_TILE_URL } from '../../lib/kneeboardBasemap';
import { FRAME_MAX_ZOOM, type OverviewFrame } from '../../lib/landing/overviewFrame';
import { createThreatIcon, createWaypointIcon, ROUTE_LINE, threatRingOptions } from '../map/mapMarkers';
import { MARKER_Z } from '../map/mapLayers';

/**
 * The Flight overview's map: the planner's own map style (tiles, the numbered
 * waypoint markers, the red range rings and lettered threat markers, drawn by
 * the same functions MapView uses), framed by overviewFrame.ts on the chosen
 * waypoint. A picture, not a tool: nothing on it can be dragged, clicked or
 * zoomed, so a phone's page scroll passes over it. "Open the map" is the tool.
 * It draws only what it is given; the overview gives it the visible mission.
 */
function Frame({ frame, fallback, padding }: { frame: OverviewFrame | null; fallback: Coordinates | null; padding: number }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      if (frame) map.fitBounds(frame.bounds, { padding: [padding, padding], maxZoom: FRAME_MAX_ZOOM, animate: false });
      else if (fallback) map.setView([fallback.lat, fallback.lon], 8, { animate: false });
    };
    fit();
    // The box changes size with the window: frame it again, so the same area stays in view.
    const observer = new ResizeObserver(fit);
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, frame, fallback, padding]);
  return null;
}

export function OverviewMap({
  waypoints, threats, rangeOf, typeOf, frame, fallback, label, phone,
}: {
  waypoints: Waypoint[];
  threats: ThreatInstance[];
  rangeOf: Map<string, number>;
  typeOf: Map<string, string>;
  frame: OverviewFrame | null;
  fallback: Coordinates | null;
  label: string;
  phone: boolean;
}) {
  const start = frame?.center ?? fallback ?? { lat: 0, lon: 0 };
  const route = waypoints.map((w) => [w.coordinates.lat, w.coordinates.lon] as [number, number]);
  return (
    <div role="img" aria-label={label} className="font-map h-full w-full">
      <MapContainer
        center={[start.lat, start.lon]}
        zoom={8}
        zoomSnap={0.5}
        className="h-full w-full"
        zoomControl={false}
        dragging={false}
        touchZoom={false}
        doubleClickZoom={false}
        scrollWheelZoom={false}
        boxZoom={false}
        keyboard={false}
      >
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url={OSM_TILE_URL} maxZoom={15} />
        <Frame frame={frame} fallback={fallback} padding={phone ? 16 : 24} />
        {route.length > 1 && <Polyline positions={route} {...ROUTE_LINE} interactive={false} />}
        {waypoints.map((w) => (
          <Marker key={w.id} position={[w.coordinates.lat, w.coordinates.lon]} icon={createWaypointIcon(String(w.steerpoint), w.type)} zIndexOffset={MARKER_Z.waypoint} interactive={false} keyboard={false} />
        ))}
        {threats.map((t) => {
          const range_nm = rangeOf.get(t.systemId);
          if (range_nm === undefined) return null;
          return (
            <Circle key={`r-${t.id}`} center={[t.position.lat, t.position.lon]} radius={range_nm * 1852} interactive={false} pathOptions={threatRingOptions(t, null)} />
          );
        })}
        {threats.map((t) =>
          rangeOf.has(t.systemId) ? (
            <Marker key={`m-${t.id}`} position={[t.position.lat, t.position.lon]} icon={createThreatIcon(typeOf.get(t.systemId) ?? '', false)} zIndexOffset={MARKER_Z.threat} interactive={false} keyboard={false} />
          ) : null,
        )}
      </MapContainer>
    </div>
  );
}
