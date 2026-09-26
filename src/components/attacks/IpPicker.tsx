import type { Coordinates, Waypoint } from '../../types';
import type { IpChoiceMode } from '../../lib/ipAnchor';
import { formatCoordinatesDMS } from '../../lib/coordinates';
import { waypointLabel } from '../../lib/waypointOptions';
import { IP_KNOB_RANGES } from '../../lib/customizeKnobs';
import { SliderField } from '../common/SliderField';
import { useIsPhone } from '../../hooks/useIsPhone';

interface IpPickerProps {
  mode: IpChoiceMode;
  ipWaypointId?: string;
  customIp?: Coordinates;
  /** Radial/distance of the custom IP off the target, when there is one. */
  fields?: { radial: string; distance: string };
  hasTarget: boolean;
  autoIpWaypoint?: Waypoint;
  ipWaypoints: Waypoint[];
  picking: boolean;
  onAuto: () => void;
  onWaypoint: (id: string) => void;
  onCustom: () => void;
  onPlace: () => void;
  onRadialDistance: (change: { radial?: number; distance?: number }) => void;
  /** Shown under the control, e.g. "Every jet in the strike runs in from here." */
  note?: string;
}

const select = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';

/**
 * Where the run-in starts: Auto (the waypoint before the target), a chosen
 * waypoint, or a custom point placed on the preview map, dragged there, or
 * dialled in as a radial and distance off the target.
 */
export function IpPicker({
  mode,
  ipWaypointId,
  customIp,
  fields,
  hasTarget,
  autoIpWaypoint,
  ipWaypoints,
  picking,
  onAuto,
  onWaypoint,
  onCustom,
  onPlace,
  onRadialDistance,
  note,
}: IpPickerProps) {
  const autoText = autoIpWaypoint ? `Auto — ${waypointLabel(autoIpWaypoint)}` : 'Auto — no prior waypoint';
  // A phone places the IP with the preview map's crosshair and moves it with
  // the marker's Move button, not a click and a drag (see CrosshairPick).
  const isPhone = useIsPhone();
  return (
    <div>
      <label className="block text-sm font-medium mb-1">Run in from (IP)</label>
      <div className="flex gap-2 mb-2">
        {([
          ['auto', 'Auto'],
          ['waypoint', 'Waypoint'],
          ['custom', 'Custom point'],
        ] as const).map(([m, text]) => (
          <button
            key={m}
            type="button"
            onClick={() => (m === 'auto' ? onAuto() : m === 'waypoint' ? onWaypoint(ipWaypointId ?? '') : onCustom())}
            disabled={!hasTarget}
            className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
              mode === m ? 'bg-dcs-blue border-blue-400 text-white' : 'bg-dcs-dark border-gray-600 text-gray-300 hover:border-gray-400'
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {mode === 'auto' && <div className="text-xs text-gray-400">{autoText}</div>}

      {mode === 'waypoint' && (
        <select className={select} style={{ colorScheme: 'dark' }} value={ipWaypointId ?? ''} onChange={(e) => onWaypoint(e.target.value)} disabled={!hasTarget}>
          <option value="">{autoText}</option>
          {ipWaypoints.map((wp) => (
            <option key={wp.id} value={wp.id}>{waypointLabel(wp)}</option>
          ))}
        </select>
      )}

      {mode === 'custom' && hasTarget && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={onPlace}
            className={`w-full py-1.5 rounded-lg text-sm border transition-colors ${
              picking ? 'bg-dcs-accent border-dcs-accent text-white' : 'border-gray-600 bg-dcs-dark text-gray-200 hover:border-gray-400'
            }`}
          >
            📍 {picking ? (isPhone ? 'Pan the map to the crosshair…' : 'Click the map…') : 'Place on map'}
          </button>
          <SliderField
            label="Radial from target"
            range={IP_KNOB_RANGES.radial_deg}
            value={fields ? Number(fields.radial) : undefined}
            onChange={(radial) => onRadialDistance({ radial })}
            disabled={!fields}
          />
          <SliderField
            label="Distance"
            range={IP_KNOB_RANGES.distance_nm}
            value={fields ? Number(fields.distance) : undefined}
            onChange={(distance) => onRadialDistance({ distance })}
            disabled={!fields}
          />
          <div className="text-xs text-gray-400">
            {customIp && fields
              ? `→ run-in ${Math.round((Number(fields.radial) + 180) % 360).toString().padStart(3, '0')}° · ${formatCoordinatesDMS(customIp)} · ${
                  isPhone ? 'tap the IP on the map, then Move' : 'drag the IP on the map to move it'
                }`
              : isPhone
                ? 'Tap "Place on map", then move the IP on the map or use the sliders.'
                : 'Click "Place on map", then drag the IP marker or use the sliders.'}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-400 mt-1">
        {note ?? 'Defaults to the waypoint before the target; pick a waypoint or drop a custom point to override.'}
      </div>
    </div>
  );
}
