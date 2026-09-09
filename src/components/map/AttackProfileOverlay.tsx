import { Polyline, Marker } from 'react-leaflet';
import { divIcon } from 'leaflet';
import type { Attack, Waypoint } from '../../types';
import type { LineStyleKey, MarkerKind } from '../../types/attackPicture.types';
import { MARKER_Z } from './mapLayers';
import { buildAttackPicture, LINE_STYLE, MARKER_TAILWIND } from '../../lib/attackPicture';

interface AttackProfileOverlayProps {
  attack: Attack;
  /** Popup attacks need one; dive and level draw a schematic run-in without it. */
  ipWaypoint?: Waypoint;
  targetWaypoint: Waypoint;
  isSelected?: boolean;
  /** While placing a threat, overlay markers must not swallow the map click. */
  isPlacementMode?: boolean;
}

// Tailwind only emits classes it can see as complete literals. These are the
// marker colours from attackPicture.ts: bg-purple-500 bg-orange-500
// bg-yellow-500 bg-gray-500 bg-red-500.

const ll = (c: { lat: number; lon: number }): [number, number] => [c.lat, c.lon];

/**
 * Draws the attack picture — the same lines and markers the kneeboard card
 * prints. The picture itself comes from `buildAttackPicture`; this component
 * hands its lines and marker icons to Leaflet. The labels (the white/green/
 * blue text boxes) are NOT drawn here — `AttackLabelLayer` lays out every
 * visible attack's labels together, collision-aware, and `MapView` renders
 * them as one overlay so two attacks' boxes (or two points on the same
 * short leg) never stack on top of each other.
 */
export function AttackProfileOverlay({ attack, ipWaypoint, targetWaypoint, isSelected = false, isPlacementMode = false }: AttackProfileOverlayProps) {
  const picture = buildAttackPicture(attack, ipWaypoint, targetWaypoint);
  if (!picture) return null;

  const pathFor = (style: LineStyleKey) => {
    const base = LINE_STYLE[style];
    const isTransit = style === 'route' || style === 'leg';
    return {
      color: isTransit && isSelected ? '#3b82f6' : base.color,
      weight: base.width + (isTransit && isSelected ? 1 : 0),
      opacity: isTransit ? (isSelected ? 1.0 : 0.7) : 0.9,
      dashArray: base.dash ? base.dash.join(', ') : undefined,
    };
  };

  return (
    <>
      {picture.lines.map((line, i) => (
        <Polyline key={`${line.style}-${i}`} positions={line.points.map(ll)} pathOptions={pathFor(line.style)} />
      ))}

      {picture.markers.map((marker, i) => (
        <Marker
          key={`${marker.kind}-${i}`}
          interactive={!isPlacementMode}
          position={ll(marker.position)}
          icon={createLabelIcon(marker.kind)}
          zIndexOffset={MARKER_Z.attackPoint}
        />
      ))}
    </>
  );
}

function createLabelIcon(kind: MarkerKind) {
  return divIcon({
    html: `<div class="flex flex-col items-center">
      <div class="${MARKER_TAILWIND[kind]} text-white font-bold rounded-full w-10 h-10 flex items-center justify-center shadow-lg border-2 border-white text-sm">
        ${kind}
      </div>
    </div>`,
    className: 'custom-attack-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}
