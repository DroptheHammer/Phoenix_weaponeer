/**
 * The small print under the 3D view: what ground is drawn and how far to
 * trust it, the Real | Flat switch, the planner's theater warnings, and the
 * credits for the map, the elevation data and three.js, with the folded list
 * of elevation sources on the same row (a row less under the picture).
 *
 * On the credits line, beside the sources' fold, is a button that unfolds the notes:
 * what playback assumed and could not show (a jet it does not fly, a target planned
 * off the ground drawn under it, where the time bar starts, the push time, what the
 * stripes mean). They are folded to begin with, so the picture keeps its room; a
 * note that asks for the pilot's attention makes the button amber. Unfolded, the
 * list takes a few lines under the credits and scrolls. The planner's theater
 * warnings are not among them: they stay in view, in amber, always.
 *
 * The credits are plain text, never links: a link inside the app's window
 * would navigate the app itself away from the planner.
 */
import { Fragment, useState } from 'react';
import { DRAWING_CHECKS_HEAD, ELEVATION_SOURCES, THREE_CREDIT, type GroundMode, type HeightsFailure, type Note } from '../../lib/playbackScene';
import type { TerrainStatus } from './scene/createScene';
import { keepFocus } from './ui';

interface StatusNotesProps {
  /** Undefined until the scene reports its ground for the first time. */
  terrain: TerrainStatus | undefined;
  /** The planner's theater warnings for this plan (unverified coordinates, real world): always in view. */
  theater: readonly string[];
  /** What playback assumed and could not show: folded under a button. */
  notes: readonly Note[];
  /** The graphics driver took the 3D view away and it is being rebuilt. */
  restoring: boolean;
  onGround(mode: GroundMode): void;
}

/** What resting on the notes button says. (The button itself reads "Notes (n)", with the count.) */
export const NOTES_TITLE = 'What this view assumed and could not show';

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

export function StatusNotes({ terrain, theater, notes, restoring, onGround }: StatusNotesProps) {
  const [open, setOpen] = useState(false);
  const attention = notes.some((n) => n.tone === 'warn');
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
      {theater.map((n, i) => (
        // By position: two notes may read the same, and a key must not repeat.
        <p key={i} className="text-amber-300">⚠ {n}</p>
      ))}
      {/* One row: the credits take what the notes' button and the sources' fold leave; opened, the sources drop to a row of their own so their long lines have the full width. */}
      <div className="flex flex-wrap items-start gap-x-3 text-gray-500">
        <p className="min-w-0 flex-1 basis-0">{terrain?.credits ?? THREE_CREDIT}</p>
        {notes.length > 0 && (
          // Beside the other fold, on the line that is already there: on the ground line it would squeeze the ground note onto a second line.
          <button
            type="button"
            data-notes-toggle
            aria-expanded={open}
            aria-controls="pb-notes"
            title={NOTES_TITLE}
            onClick={() => setOpen((o) => !o)}
            onMouseDown={keepFocus}
            className={`shrink-0 whitespace-nowrap hover:text-blue-400 ${attention ? 'text-amber-300' : 'text-gray-400'}`}
          >
            {attention ? '⚠ ' : ''}Notes ({notes.length}) {open ? '▾' : '▸'}
          </button>
        )}
        {terrain?.ground === 'real' && (
          // Folded, so the small print stays small: some of these sources require their own words wherever their heights are shown.
          <details className="open:basis-full">
            <summary className="cursor-pointer select-none whitespace-nowrap">Elevation sources</summary>
            <ul className="mt-1 space-y-0.5 pl-3">
              {ELEVATION_SOURCES.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </details>
        )}
      </div>
      {open && (
        <ul id="pb-notes" data-notes className="max-h-24 overflow-y-auto space-y-0.5">
          {notes.map((n, i) => (
            <Fragment key={n.key}>
              {/* The planner's drawing checks come last: their heading stands before the first of them. */}
              {n.group === 'drawing' && notes[i - 1]?.group !== 'drawing' && <li data-notes-head className="text-gray-300">{DRAWING_CHECKS_HEAD}</li>}
              <li data-note={n.key} data-tone={n.tone} className={n.tone === 'warn' ? 'text-amber-300' : 'text-gray-400'}>
                {n.tone === 'warn' ? '⚠ ' : ''}{n.text}
              </li>
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
