import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Polyline, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import { divIcon, type Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Attack, Coordinates, ThreatInstance, Waypoint } from '../../types';
import type { FlightMember } from '../../types/flight.types';
import { OSM_TILE_URL } from '../../lib/kneeboardBasemap';
import { escapeHtml } from '../../lib/html';
import { buildAttackPicture, pictureFitPoints } from '../../lib/attackPicture';
import type { IpAnchor } from '../../lib/ipAnchor';
import type { PlacedLabel } from '../../lib/labelLayout';
import { AttackProfileOverlay } from './AttackProfileOverlay';
import { AttackLabelLayer } from './AttackLabelLayer';
import { CustomIpMarker } from './CustomIpMarker';
import { PlacedLabelsOverlay } from './PlacedLabelsOverlay';
import { MARKER_Z } from './mapLayers';
import { CrosshairPick } from './CrosshairPick';
import { useIsPhone } from '../../hooks/useIsPhone';

/** One jet's attack as it would save right now. */
export interface PreviewAttack {
  attack: Attack;
  ipAnchor: IpAnchor | undefined;
  /** Drawn in full, with labels. The others are thin tracks in `color`. */
  selected: boolean;
  color?: string;
}

interface AttackPreviewMapProps {
  /** Every jet being edited. Empty until the picks are made. */
  attacks: PreviewAttack[];
  /** The selected jet's target: what the map frames on. */
  targetWaypoint: Waypoint | undefined;
  waypoints: Waypoint[];
  /** Already filtered for author-hidden threats (`useVisibleMission`). */
  threats: ThreatInstance[];
  threatSystems: { id: string; max_range_nm: number }[];
  flightMembers: FlightMember[];
  /** Drawn draggable while the IP is a custom point (on a phone: tap it, then Move). */
  customIp?: Coordinates;
  onMoveCustomIp: (point: Coordinates) => void;
  /** While true, the next click on this map places the custom IP (on a phone: the crosshair's "Set here"). */
  picking: boolean;
  onPick: (point: Coordinates) => void;
  onCancelPick: () => void;
}

const ll = (c: Coordinates): [number, number] => [c.lat, c.lon];

const waypointIcon = (label: string) =>
  divIcon({
    html: `<div class="bg-gray-600 text-white font-bold rounded-full w-6 h-6 flex items-center justify-center shadow border-2 border-white text-xs">${escapeHtml(label)}</div>`,
    className: 'custom-waypoint-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

/** Leaflet measures its box once; inside a modal that opens and resizes, tell it again. */
function ResizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/**
 * Frame the attack once, then hold. Re-fits only when `fitKey` changes — a new
 * target, the attack first appearing, a new profile type, or the Re-frame
 * button — never on a slider tick, or the map would chase the numbers.
 */
function FrameOnce({ fitKey, points }: { fitKey: string; points: Coordinates[] }) {
  const map = useMap();
  const pointsRef = useRef(points);
  pointsRef.current = points;
  useEffect(() => {
    const pts = pointsRef.current.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(ll);
    if (pts.length === 0) return;
    map.fitBounds(pts, { padding: [48, 48], maxZoom: 12 });
  }, [fitKey, map]);
  return null;
}

function ClickToPick({ picking, onPick }: { picking: boolean; onPick: (point: Coordinates) => void }) {
  useMapEvents({
    click: (e) => {
      if (picking) onPick({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

/**
 * The attack editor's own map: this one attack, the route for context, and the
 * threat rings, redrawn live as the Customize numbers move.
 *
 * Deliberately not a second `MapView`. That one reads the global display
 * filter (hide a pilot in the legend and the preview would go blank), re-fits
 * to the whole mission, and consumes shared one-shots (`focusThreatId`,
 * `mapPick`) that two maps would race on.
 */
export function AttackPreviewMap({
  attacks: previews,
  targetWaypoint,
  waypoints,
  threats,
  threatSystems,
  flightMembers,
  customIp,
  onMoveCustomIp,
  picking,
  onPick,
  onCancelPick,
}: AttackPreviewMapProps) {
  const [placedLabels, setPlacedLabels] = useState<PlacedLabel[]>([]);
  const [reframes, setReframes] = useState(0);
  const [map, setMap] = useState<LeafletMap | null>(null);
  // Phones place and move the IP with a centre crosshair (see CrosshairPick).
  // Moving is this map's own business, like the drag it replaces: the editor
  // only ever hears `onMoveCustomIp`.
  const isPhone = useIsPhone();
  const [moving, setMoving] = useState(false);
  const crosshair = isPhone && (picking || (moving && !!customIp));
  // Waiting on a click (desktop) or on "Set here" (phone): markers stand still.
  const busy = picking || crosshair;
  // "Place on map" while a move is open: the placement wins.
  useEffect(() => {
    if (picking) setMoving(false);
  }, [picking]);

  const selected = previews.find((p) => p.selected);
  const attack = selected?.attack;
  const ipAnchor = selected?.ipAnchor;
  const attacks = useMemo(() => (attack ? [attack] : []), [attack]);
  const route = useMemo(() => waypoints.map((wp) => ll(wp.coordinates)), [waypoints]);
  const wingmen = useMemo(
    () =>
      previews
        .filter((p) => !p.selected)
        .map((p) => {
          const target = waypoints.find((wp) => wp.id === p.attack.targetWaypointId);
          return { color: p.color ?? '#9ca3af', picture: target ? buildAttackPicture(p.attack, p.ipAnchor, target) : undefined };
        }),
    [previews, waypoints],
  );
  // Built once per route, not per render, so a slider tick doesn't swap every marker's DOM.
  const waypointIcons = useMemo(() => new Map(waypoints.map((wp) => [wp.id, waypointIcon(String(wp.steerpoint))])), [waypoints]);
  const rangeOf = useMemo(() => new Map(threatSystems.map((s) => [s.id, s.max_range_nm])), [threatSystems]);

  const fitPoints = useMemo(() => {
    if (!targetWaypoint) return waypoints.map((wp) => wp.coordinates);
    const picture = attack ? buildAttackPicture(attack, ipAnchor, targetWaypoint) : undefined;
    return [
      targetWaypoint.coordinates,
      ...(picture ? pictureFitPoints(picture) : []),
      ...(ipAnchor ? [ipAnchor.point] : []),
      ...wingmen.flatMap((w) => (w.picture ? pictureFitPoints(w.picture) : [])),
    ];
  }, [attack, ipAnchor, targetWaypoint, waypoints, wingmen]);
  const fitKey = `${targetWaypoint?.id ?? '-'}|${attack?.profileType ?? '-'}|${previews.length}|${reframes}`;

  const center = targetWaypoint?.coordinates ?? waypoints[0]?.coordinates ?? { lat: 0, lon: 0 };

  return (
    <div className="relative h-full w-full">
      <MapContainer
        ref={setMap}
        center={ll(center)}
        zoom={9}
        className={`h-full w-full ${picking && !isPhone ? 'cursor-crosshair' : ''}`}
        zoomControl={false}
      >
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url={OSM_TILE_URL} maxZoom={15} />
        <ZoomControl position="bottomleft" />
        <ResizeWatcher />
        <FrameOnce fitKey={fitKey} points={fitPoints} />
        {/* On a phone a tap never places anything: only "Set here" does. */}
        <ClickToPick picking={picking && !isPhone} onPick={onPick} />
        {targetWaypoint && <AttackLabelLayer attacks={attacks} waypoints={waypoints} flightMembers={flightMembers} onPlaced={setPlacedLabels} />}

        {route.length > 1 && <Polyline positions={route} color="#3B82F6" weight={2} opacity={0.4} dashArray="5, 10" interactive={false} />}
        {waypoints.map((wp) => (
          <Marker
            key={wp.id}
            position={ll(wp.coordinates)}
            icon={waypointIcons.get(wp.id)!}
            zIndexOffset={MARKER_Z.waypoint}
            interactive={false}
          />
        ))}

        {threats.map((threat) => {
          const range_nm = rangeOf.get(threat.systemId);
          if (!range_nm) return null;
          const color = threat.status === 'active' ? '#EF4444' : '#9CA3AF';
          return (
            <Circle
              key={threat.id}
              center={ll(threat.position)}
              radius={range_nm * 1852}
              interactive={false}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.06, weight: 2, dashArray: threat.source === 'mission' ? undefined : '8, 8' }}
            />
          );
        })}

        {/* The other jets: their track only, thin, in the jet's colour, under the selected one. */}
        {wingmen.map((w, i) =>
          w.picture?.lines
            .filter((line) => line.style !== 'bomb')
            .map((line, j) => (
              <Polyline
                key={`w${i}-${j}`}
                positions={line.points.map(ll)}
                interactive={false}
                pathOptions={{ color: w.color, weight: 2, opacity: 0.85, dashArray: line.style === 'route' || line.style === 'egressLeg' ? '6, 8' : undefined }}
              />
            )),
        )}

        {attack && targetWaypoint && (
          <AttackProfileOverlay attack={attack} ipAnchor={ipAnchor} targetWaypoint={targetWaypoint} isSelected isPlacementMode={busy} />
        )}
        {customIp && (
          <CustomIpMarker
            position={customIp}
            onMove={onMoveCustomIp}
            interactive={!busy}
            onRequestMove={isPhone ? () => setMoving(true) : undefined}
          />
        )}
      </MapContainer>

      <PlacedLabelsOverlay labels={placedLabels} />

      <button
        type="button"
        onClick={() => setReframes((n) => n + 1)}
        className="absolute top-3 right-3 z-[1000] bg-dcs-navy/90 text-white text-sm px-3 py-1.5 rounded shadow hover:bg-dcs-blue"
        title="Fit the map to the attack again"
      >
        ⟲ Re-frame
      </button>

      {crosshair && (
        <CrosshairPick
          key={picking ? 'place' : 'move'}
          map={map}
          compact
          prompt={picking ? 'Pan the map to put the IP under the crosshair' : 'Pan the map to move the IP'}
          confirmLabel={picking ? 'Set here' : 'Move here'}
          start={picking ? undefined : customIp}
          onSet={(point) => {
            if (picking) onPick(point);
            else {
              setMoving(false);
              onMoveCustomIp(point);
            }
          }}
          onCancel={() => (picking ? onCancelPick() : setMoving(false))}
        />
      )}

      {picking && !isPhone && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-dcs-accent text-white px-4 py-2 rounded-lg shadow-lg z-[1000] text-sm font-medium flex items-center gap-3">
          <span>Click the map to place the custom IP</span>
          <button type="button" onClick={onCancelPick} className="text-white/80 hover:text-white underline">
            Cancel
          </button>
        </div>
      )}

      {!targetWaypoint && (
        <div className="absolute inset-x-0 bottom-8 z-[1000] flex justify-center pointer-events-none">
          <div className="bg-dcs-navy/90 text-gray-200 text-sm px-4 py-2 rounded shadow">Pick a target, attacker and weapon to see the attack</div>
        </div>
      )}
    </div>
  );
}
