import { Polyline, Marker, Tooltip } from 'react-leaflet';
import { divIcon } from 'leaflet';
import type { Attack, Waypoint, PopupCCIPResult } from '../../types';
import type { LabelSide, LineStyleKey, MarkerKind } from '../../types/attackPicture.types';
import { MARKER_Z } from './mapLayers';
import { buildAttackPicture, LINE_STYLE, MARKER_TAILWIND } from '../../lib/attackPicture';

interface AttackProfileOverlayProps {
  attack: Attack;
  /** Popup attacks need one; dive and level draw a schematic run-in without it. */
  ipWaypoint?: Waypoint;
  targetWaypoint: Waypoint;
  /** Legacy prop from the Rust pop-up calculator; no longer read. */
  calculatorResult?: PopupCCIPResult;
  isSelected?: boolean;
  /** While placing a threat, overlay markers must not swallow the map click. */
  isPlacementMode?: boolean;
}

// Tailwind only emits classes it can see as complete literals. These are the
// marker colours from attackPicture.ts: bg-purple-500 bg-orange-500
// bg-yellow-500 bg-gray-500 bg-red-500.

const ll = (c: { lat: number; lon: number }): [number, number] => [c.lat, c.lon];

const TOOLTIP_OFFSET: Record<LabelSide, [number, number]> = {
  top: [0, -20],
  bottom: [0, 20],
  left: [-20, 0],
  right: [20, 0],
};

/**
 * Draws the attack picture — the same lines, markers and words the kneeboard
 * card prints. The picture itself comes from `buildAttackPicture`; this
 * component only hands it to Leaflet.
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
        >
          <Tooltip permanent={marker.permanent} direction={marker.side} offset={TOOLTIP_OFFSET[marker.side]} className="attack-tooltip">
            <div className="text-xs font-semibold">
              {marker.lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </Tooltip>
        </Marker>
      ))}

      {picture.labels.map((label, i) => (
        <Marker
          key={`${label.kind}-${i}`}
          interactive={!isPlacementMode}
          position={ll(label.position)}
          icon={divIcon({
            html:
              label.kind === 'egress'
                ? `<div class="bg-green-900 bg-opacity-90 text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap border border-green-400">${label.text}</div>`
                : `<div class="bg-blue-900 bg-opacity-90 text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap border border-blue-400">${label.text}</div>`,
            className: 'custom-info-label',
            iconSize: label.kind === 'egress' ? [150, 20] : [190, 20],
            iconAnchor: label.kind === 'egress' ? [75, 10] : [95, -15],
          })}
          zIndexOffset={MARKER_Z.label}
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
