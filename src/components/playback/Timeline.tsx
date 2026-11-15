/**
 * Play, pause, the scrubber and the speeds under the 3D view. The only
 * part of playback that re-renders while it plays: it reads the scene's clock
 * through useSyncExternalStore, and the clock tells React at most about 12
 * times a second (the 3D itself moves every frame without React).
 *
 * Dragging the scrubber pauses playback for the drag and carries on after it
 * if it was playing, so the jet follows the finger instead of fighting it.
 */
import { useSyncExternalStore } from 'react';
import { SPEEDS, speedLabel } from '../../lib/playbackScene';
import { fmtStrikeTime } from '../../lib/strike';
import type { PlaybackScene } from './scene/createScene';
import { keepFocus, SEG } from './ui';

/** A moment marked under the scrubber (IP push, pull-up, release, impact). */
export interface TimelineTick {
  t_s: number;
  label: string;
}

interface TimelineProps {
  scene: PlaybackScene;
  ticks: readonly TimelineTick[];
}

export function Timeline({ scene, ticks }: TimelineProps) {
  const snap = useSyncExternalStore(scene.subscribe, scene.getSnapshot);
  const span = Math.max(snap.end - snap.start, 1e-6);
  const endScrub = () => scene.endScrub();

  return (
    <div className="flex items-center gap-3 min-w-0">
      <button
        type="button"
        onClick={() => scene.toggle()}
        onMouseDown={keepFocus}
        className="shrink-0 w-24 px-3 py-1.5 rounded text-sm bg-dcs-blue hover:bg-blue-800 text-white"
        aria-label={snap.playing ? 'Pause' : 'Play'}
        title={snap.playing ? 'Pause (Space)' : 'Play (Space)'}
      >
        {snap.playing ? '❚❚ Pause' : '▶ Play'}
      </button>

      <span className="shrink-0 w-14 text-right font-mono text-sm text-gray-100" aria-live="off">{fmtStrikeTime(snap.t)}</span>

      <div className="relative flex-1 min-w-[120px] pb-3">
        <input
          type="range"
          aria-label="Strike time"
          min={snap.start}
          max={snap.end}
          step={0.05}
          value={snap.t}
          onPointerDown={() => scene.beginScrub()}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onLostPointerCapture={endScrub}
          onBlur={endScrub}
          onChange={(e) => scene.seek(e.currentTarget.valueAsNumber)}
          className="w-full accent-dcs-accent cursor-pointer"
        />
        {/* The moments the card names, so the scrubber can be dropped straight on them. A moment before the bar's start (the IP crossing, when the bar starts at the first action) has no place on it. */}
        {ticks.map((k, i) =>
          k.t_s < snap.start || k.t_s > snap.end ? null : (
            <span
              // By position: two moments with the same label and time must not share a key.
              key={i}
              title={`${k.label} ${fmtStrikeTime(k.t_s)}`}
              className="absolute bottom-0 w-px h-2 bg-gray-400"
              style={{ left: `${((k.t_s - snap.start) / span) * 100}%` }}
            />
          ),
        )}
      </div>

      <div className="shrink-0 flex rounded border border-gray-600 overflow-hidden" role="group" aria-label="Speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => scene.setSpeed(s)}
            onMouseDown={keepFocus}
            aria-pressed={snap.speed === s}
            className={`${SEG} ${snap.speed === s ? 'bg-gray-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
            title={`Play at ${speedLabel(s)} speed`}
          >
            {speedLabel(s)}
          </button>
        ))}
      </div>
    </div>
  );
}
