/**
 * Play, pause, the scrubber and the speeds under the 3D view. The only
 * part of playback that re-renders while it plays: it reads the scene's clock
 * through useSyncExternalStore, and the clock tells React at most about 12
 * times a second (the 3D itself moves every frame without React).
 *
 * Dragging the scrubber pauses playback for the drag and carries on after it
 * if it was playing, so the jet follows the finger instead of fighting it.
 *
 * Under the bar runs the watched jet's phase band in the planner's colours,
 * the same band its lane draws below, so the colour code reads on the bar
 * itself (it moves to another jet's when another is watched), and, along the
 * bottom of the same strip, amber stripes over the strike's frag warnings (a
 * jet over the target inside another's frag; or, when the strike is warned by
 * blast radius, the moment a bomb went off with a jet inside its radius, drawn
 * at least a few pixels wide so an instant is not lost on a long bar). The
 * three columns are the lanes' own (ROW_GRID): Play and the clock on the
 * left, the bar in the middle, the speeds on the right.
 */
import { useSyncExternalStore } from 'react';
import { axisFraction, bandBox, SCRUB_BAND_H_PX, SPEEDS, speedLabel, type Band, type LaneBand } from '../../lib/playbackScene';
import { fmtStrikeTime } from '../../lib/strike';
import type { PlaybackScene } from './scene/createScene';
import { bandBackground, HATCH, keepFocus, ROW_GRID, SEG } from './ui';

interface TimelineProps {
  scene: PlaybackScene;
  /** The watched jet's stretches on the bar's own axis. */
  bands: readonly LaneBand[];
  /** The strike's frag warnings on the clock, strike time; a band with a `minPx` is drawn at least that wide. */
  conflicts?: readonly Band[];
}

export function Timeline({ scene, bands, conflicts = [] }: TimelineProps) {
  const snap = useSyncExternalStore(scene.subscribe, scene.getSnapshot);
  const endScrub = () => scene.endScrub();

  return (
    <div className={ROW_GRID}>
      <div className="flex min-w-0 items-center gap-2">
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
      </div>

      <div className="relative min-w-[120px] pb-3">
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
        {/* Inset 8 px each side, the thumb's own travel, so a stretch sits straight under the time it covers. Nothing here takes a press: the input is the control. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-2 bottom-0 h-3">
          <div className="absolute inset-x-0 top-0" style={{ height: SCRUB_BAND_H_PX }}>
            {bands.map((b) => (
              <span
                key={b.key}
                data-scrub-band={b.style}
                className="absolute inset-y-0"
                style={{ left: `${b.f0 * 100}%`, width: `${(b.f1 - b.f0) * 100}%`, background: bandBackground(b.style) }}
              />
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0" style={{ height: SCRUB_BAND_H_PX }}>
            {conflicts.map((c) => {
              // On the bar's own axis (the clock's range), cut to it: a stretch partly off the bar shows its part.
              const f0 = axisFraction({ t0_s: snap.start, t1_s: snap.end }, c.t0_s);
              const f1 = axisFraction({ t0_s: snap.start, t1_s: snap.end }, c.t1_s);
              if (!(f1 > f0)) return null;
              return (
                <span
                  key={c.key}
                  data-conflict={c.key}
                  className="absolute inset-y-0"
                  style={{ ...bandBox(f0, f1, c.minPx), background: HATCH }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex rounded border border-gray-600 overflow-hidden self-center justify-self-start" role="group" aria-label="Speed">
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
