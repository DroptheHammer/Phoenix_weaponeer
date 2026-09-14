import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import type { Attack, Waypoint } from '../../types';
import type { FlightMember } from '../../types/flight.types';
import { buildAttackPicture, LABEL_STYLE, pictureFitPoints } from '../../lib/attackPicture';
import { attackIpAnchor } from '../../lib/ipAnchor';
import { layoutLabels, edgeCrossing, labelsAreLegible, type LabelRequest, type PlacedLabel, type Rect } from '../../lib/labelLayout';

interface AttackLabelLayerProps {
  attacks: Attack[];
  waypoints: Waypoint[];
  flightMembers: FlightMember[];
  onPlaced: (placed: PlacedLabel[]) => void;
}

// A detached canvas purely to measure text width — never drawn to.
let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

const MARKER_HALF_PX = 21;

/**
 * Runs the same greedy label layout the kneeboard card uses (`labelLayout.ts`),
 * projected into map pixels, so attack-picture labels on the live map stay
 * legible instead of stacking on a fixed offset. Recomputes on pan/zoom and
 * whenever the attacks change; hands the placed boxes up to `MapView`, which
 * renders them as a plain overlay div (outside `MapContainer`, like the
 * legend) since the placement math — not the DOM — is what needs `useMap()`.
 */
export function AttackLabelLayer({ attacks, waypoints, flightMembers, onPlaced }: AttackLabelLayerProps) {
  const map = useMap();
  const onPlacedRef = useRef(onPlaced);
  onPlacedRef.current = onPlaced;

  useEffect(() => {
    const recompute = () => {
      const size = map.getSize();
      const bounds: Rect = { x: 0, y: 0, w: size.x, h: size.y };
      const toPx = (c: { lat: number; lon: number }): [number, number] => {
        const p = map.latLngToContainerPoint([c.lat, c.lon]);
        return [p.x, p.y];
      };
      const isVisible = ([x, y]: [number, number]) =>
        x >= bounds.x && x <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h;

      const obstacles: Rect[] = [];
      const requests: LabelRequest[] = [];

      for (const attack of attacks) {
        const targetWaypoint = waypoints.find((wp) => wp.id === attack.targetWaypointId);
        if (!targetWaypoint) continue;
        const ipAnchor = attackIpAnchor(waypoints, attack);
        const picture = buildAttackPicture(attack, ipAnchor, targetWaypoint);
        if (!picture) continue;

        // Project the attack's fit points to determine if labels are legible at this zoom
        const fitPoints = pictureFitPoints(picture);
        const fitPx = fitPoints.map(toPx);
        const legible = labelsAreLegible(fitPx);

        // Push marker obstacles for every marker in both branches
        for (const marker of picture.markers) {
          const [x, y] = toPx(marker.position);
          obstacles.push({ x: x - MARKER_HALF_PX, y: y - MARKER_HALF_PX, w: MARKER_HALF_PX * 2, h: MARKER_HALF_PX * 2 });
        }

        if (legible) {
          // Above threshold: emit per-marker callouts, egress tags, and IP tags as today
          for (const marker of picture.markers) {
            const [x, y] = toPx(marker.position);
            if (marker.permanent && isVisible([x, y])) {
              requests.push({ lines: marker.lines, anchor: [x, y], side: marker.side, size: 12, anchorRadius: MARKER_HALF_PX });
            }
          }
          for (const label of picture.labels) {
            let anchor = toPx(label.position);
            // Pin off-frame IP labels to the edge where the run-in enters
            if (label.kind === 'ip' && !isVisible(anchor)) {
              const routeLine = picture.lines.find((l) => l.style === 'route');
              if (routeLine && routeLine.points.length >= 2) {
                const actionPoint = routeLine.points[routeLine.points.length - 1];
                const actionPx = toPx(actionPoint);
                const crossing = edgeCrossing(anchor, actionPx, bounds);
                if (crossing) anchor = crossing;
                else continue;
              } else continue;
            } else if (!isVisible(anchor)) {
              continue;
            }
            requests.push({
              lines: [label.text],
              anchor,
              side: label.kind === 'egress' ? 'top' : 'bottom',
              size: 11,
              style:
                label.kind === 'egress'
                  ? { bg: LABEL_STYLE.egressBg, fg: '#ffffff', border: LABEL_STYLE.egressBorder }
                  : { bg: LABEL_STYLE.ipBg, fg: '#ffffff', border: LABEL_STYLE.ipBorder },
            });
          }
        } else {
          // Below threshold: emit one tag naming the attack, anchored at the target
          const tgtMarker = picture.markers.find((m) => m.kind === 'TGT');
          if (tgtMarker) {
            const tgtPx = toPx(tgtMarker.position);
            if (isVisible(tgtPx)) {
              const member = flightMembers.find((fm) => fm.id === attack.attackerId);
              const callsign = member?.callsign;
              const targetName = targetWaypoint.name || `STPT ${targetWaypoint.steerpoint}`;
              const tagText = callsign ? `${callsign} · ${targetName}` : targetName;
              requests.push({
                lines: [tagText],
                anchor: tgtPx,
                side: 'top',
                size: 11,
                anchorRadius: MARKER_HALF_PX,
              });
            }
          }
        }
      }

      onPlacedRef.current(layoutLabels(getMeasureCtx(), requests, obstacles, bounds));
    };

    recompute();
    map.on('move', recompute);
    map.on('zoom', recompute);
    map.on('resize', recompute);
    return () => {
      map.off('move', recompute);
      map.off('zoom', recompute);
      map.off('resize', recompute);
    };
  }, [map, attacks, waypoints, flightMembers]);

  return null;
}
