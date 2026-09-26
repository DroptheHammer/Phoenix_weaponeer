import { useEffect } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { Coordinates } from '../../types';

interface CrosshairPickProps {
  /** The Leaflet map this sits over (from `MapContainer`'s ref); null until it mounts. */
  map: LeafletMap | null;
  /** What is being picked, e.g. "Put the threat under the crosshair". */
  prompt: string;
  /** The confirm button. Defaults to "Set here". */
  confirmLabel?: string;
  /** Pan here once when the pick opens, so moving a thing starts on it. */
  start?: Coordinates;
  /** Buttons only, for a short map (the attack editor's preview); the prompt becomes their label for screen readers. */
  compact?: boolean;
  onSet: (position: Coordinates) => void;
  onCancel: () => void;
}

/**
 * The phone's way of picking a point: a fixed crosshair in the middle of the
 * map, and a "Set here" button that takes the map's centre. The planner pans
 * the map under the crosshair instead of tapping it, so a fingertip never
 * hides the spot being picked, and a pan that ends in a lift never places
 * anything by accident.
 *
 * Rendered next to the `MapContainer`, not inside it, so taps on the buttons
 * never reach Leaflet as map clicks. The parent box must be the map's own
 * size: the crosshair is centred in it, and the map's centre is what is read.
 */
export function CrosshairPick({ map, prompt, confirmLabel = 'Set here', start, compact = false, onSet, onCancel }: CrosshairPickProps) {
  // Once per pick: later pans are the planner's own.
  useEffect(() => {
    if (map && start) map.panTo([start.lat, start.lon], { animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  const set = () => {
    if (!map) return;
    const center = map.getCenter();
    onSet({ lat: center.lat, lon: center.lng });
  };

  return (
    <>
      <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none" aria-hidden>
        {/* White on a dark edge, so it reads over sea, desert and snow alike. The
            gap in the middle leaves the exact point itself in view. */}
        <svg width="56" height="56" viewBox="0 0 56 56" className="drop-shadow">
          <g strokeLinecap="round">
            <g stroke="#111827" strokeWidth="5">
              <path d="M28 4v16M28 36v16M4 28h16M36 28h16" />
            </g>
            <g stroke="#ffffff" strokeWidth="2.5">
              <path d="M28 4v16M28 36v16M4 28h16M36 28h16" />
            </g>
          </g>
          <circle cx="28" cy="28" r="2.5" fill="#e94560" stroke="#ffffff" strokeWidth="1" />
        </svg>
      </div>

      {/* Clear of the zoom control at the bottom left. */}
      <div
        className="absolute left-14 right-3 bottom-3 z-[1000] bg-dcs-navy/95 text-white rounded-xl shadow-lg p-2 space-y-2"
        role="group"
        aria-label={prompt}
      >
        {!compact && <div className="text-sm text-center px-1">{prompt}</div>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] rounded-lg bg-gray-700 hover:bg-gray-600 text-base"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={set}
            disabled={!map}
            className="flex-[2] min-h-[44px] rounded-lg bg-dcs-accent hover:bg-red-600 disabled:opacity-50 text-base font-semibold"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
