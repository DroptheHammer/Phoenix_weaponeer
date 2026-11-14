/**
 * The small print under the 3D view: what ground is drawn and how far to
 * trust it, the Real | Flat switch, the planner's theater warnings, and the
 * credits for the map, the elevation data and three.js.
 *
 * The credits are plain text, never links: a link inside the app's window
 * would navigate the app itself away from the planner.
 */
import { ELEVATION_SOURCES, THREE_CREDIT, type GroundMode, type HeightsFailure } from '../../lib/playbackScene';
import type { TerrainStatus } from './scene/createScene';

interface StatusNotesProps {
  /** Undefined until the scene reports its ground for the first time. */
  terrain: TerrainStatus | undefined;
  /** The planner's notes for this plan (unverified theater, real world). */
  notes: readonly string[];
  /** The graphics driver took the 3D view away and it is being rebuilt. */
  restoring: boolean;
  /** The machine draws 3D in software: it works, slowly. */
  software: boolean;
  onGround(mode: GroundMode): void;
}

/** Said whenever real-world terrain is drawn: it is a picture of the run, not a clearance check. */
export const REAL_GROUND_NOTE =
  'Real-world terrain, aligned so the target sits at its planned elevation. DCS ground can differ, so use it to picture the run, not to check clearance.';

const FAILED_BECAUSE: Record<HeightsFailure, string> = {
  missing: 'there is no elevation data for this area',
  offline: 'no network, and none saved from before',
  timeout: 'it took too long to load',
  broken: 'the elevation data could not be read',
  aborted: 'loading was stopped',
};

/** The one line that says what ground is drawn, and why when it isn't the real terrain. */
export function groundNote(t: TerrainStatus | undefined): string {
  if (!t) return 'Loading terrain…';
  const map = !t.map.done && t.map.total > 0 ? ` (map ${t.map.loaded + t.map.failed}/${t.map.total})` : '';
  switch (t.heights) {
    case 'loading':
      return `Loading terrain…${map}`;
    case 'failed':
      return `Terrain unavailable (${FAILED_BECAUSE[t.heightsFailure ?? 'broken']}): flat ground at the target's planned elevation.${map}`;
    case 'off':
      return "Flat ground at the target's planned elevation.";
    default:
      return t.ground === 'real' ? `${REAL_GROUND_NOTE}${map}` : `Flat ground at the target's planned elevation: terrain clearance isn't shown.${map}`;
  }
}

export function StatusNotes({ terrain, notes, restoring, software, onGround }: StatusNotesProps) {
  const realReady = terrain?.heights === 'ready';
  const drawn: GroundMode = terrain?.ground ?? 'flat';
  const realTitle = realReady
    ? 'Real-world terrain under the plan'
    : terrain?.heights === 'failed'
      ? 'The terrain could not be loaded'
      : terrain?.heights === 'off'
        ? 'No terrain source here'
        : 'Waiting for the terrain to load';
  const segment = (on: boolean) => `px-2 py-0.5 text-xs ${on ? 'bg-gray-600 text-white' : 'text-gray-300 hover:bg-gray-700'} disabled:text-gray-600 disabled:hover:bg-transparent disabled:cursor-not-allowed`;

  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-start gap-3">
        <div className="shrink-0 flex items-center gap-1.5">
          <span className="text-gray-400">Ground:</span>
          <div className="flex rounded border border-gray-600 overflow-hidden" role="group" aria-label="Ground">
            <button type="button" className={segment(drawn === 'real')} aria-pressed={drawn === 'real'} disabled={!realReady} title={realTitle} onClick={() => onGround('real')}>
              Real
            </button>
            <button
              type="button"
              className={segment(drawn === 'flat')}
              aria-pressed={drawn === 'flat'}
              title="Flat ground at the target's planned elevation, the same as the side view"
              onClick={() => onGround('flat')}
            >
              Flat
            </button>
          </div>
        </div>
        <p className="flex-1 min-w-0 text-gray-300">{restoring ? '3D view interrupted by the graphics driver: restoring…' : groundNote(terrain)}</p>
      </div>
      {notes.map((n) => (
        <p key={n} className="text-amber-300">⚠ {n}</p>
      ))}
      {software && <p className="text-gray-400">This machine draws 3D in software, so playback may be slow.</p>}
      <p className="text-gray-500">{terrain?.credits ?? THREE_CREDIT}</p>
      {terrain?.ground === 'real' && (
        // Folded, so the small print stays small: some of these sources require their own words wherever their heights are shown.
        <details className="text-gray-500">
          <summary className="cursor-pointer select-none">Elevation sources</summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {ELEVATION_SOURCES.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
