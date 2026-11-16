/**
 * Short notes laid over the 3D picture.
 *
 * Top middle, one under another:
 * - The frag warning chip, in amber with a "⚠": while the playhead is on one
 *   of the strike's frag warnings it names it ("⚠ #2 inside #1's blast radius
 *   (est.)" at the second the bomb goes off; on a strike warned by spacing in
 *   time, the spacing rule's words), with "(+1 more)" when there are more. At
 *   speed the playhead can pass a warning between two looks at the clock, so
 *   the chip also names every warning swept since the last look while playing,
 *   and once shown it stays up for a moment of wall time (CHIP_HOLD_MS), so it
 *   can be read at 16× too. Its tooltip is the footer's full warning, so it is
 *   the one note here that takes the pointer (it is small and comes and goes).
 * - In Chase or From target, while the watched jet is not in the picture
 *   (before its run-in or after it leaves), a chip says so, because the camera
 *   keeps following where the jet would be and the picture would otherwise show
 *   empty sky with no reason given. It never catches a press.
 * Both read the clock's snapshot (at most about 12 times a second while
 * playing), not every frame.
 *
 * Bottom left: on a machine that draws 3D in software, one line saying so. It
 * is a chip on the picture and not a row under it, so it takes no height from
 * the picture (the rows under it are tight at 1024×768).
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ConflictRow } from '../../lib/playback';
import {
  chipConflicts, chipSpan, chipText, chipTitle, CHIP_HOLD_MS, newSceneJetPose,
  type CameraMode, type ClockSnapshot, type SceneJetPose, type SceneSource,
} from '../../lib/playbackScene';
import type { PlaybackScene } from './scene/createScene';

interface CanvasChipsProps {
  scene: PlaybackScene;
  source: SceneSource;
  /** The watched jet (a playback index). */
  jet: number;
  mode: CameraMode;
  /** The strike's frag warnings at the times as they stand, on the clock. */
  conflicts: readonly ConflictRow[];
  /** The readout's warnings at the same times: one per conflict first, in their order, so conflict i is warning i. */
  warnings: readonly string[];
}

/** Said when the machine's WebGL runs in software: it works, slowly. */
export function SoftwareChip() {
  return (
    <div className="absolute bottom-2 left-3 pointer-events-none rounded bg-dcs-navy/80 px-2 py-0.5 text-xs text-gray-300">
      This machine draws 3D in software, so playback may be slow.
    </div>
  );
}

type Chip = { text: string; title: string | undefined };

export function CanvasChips({ scene, source, jet, mode, conflicts, warnings }: CanvasChipsProps) {
  const snap = useSyncExternalStore(scene.subscribe, scene.getSnapshot);
  // One pose, kept: the check runs on every snapshot.
  const pose = useRef<SceneJetPose | null>(null);
  pose.current ??= newSceneJetPose();
  const following = mode === 'chase' || mode === 'target';
  const away = following && jet < source.jetCount && !source.jetAt(jet, snap.t, pose.current).visible;

  // The warnings the playhead is on, or swept since the snapshot shown last (of this scene: a rebuilt one's clock
  // starts afresh). The indices go into one array, made again only when the warnings change.
  const last = useRef<{ scene: PlaybackScene; snap: ClockSnapshot } | null>(null);
  const prev = last.current?.scene === scene ? last.current.snap : undefined;
  const idx = useMemo(() => new Int8Array(Math.min(conflicts.length, 128)), [conflicts]);
  const n = chipConflicts(conflicts, snap.t, chipSpan(prev, snap), idx);
  const text = chipText(conflicts, idx, n);
  const title = chipTitle(warnings, idx, n);
  useEffect(() => {
    last.current = { scene, snap };
  }, [scene, snap]);

  // A chip once shown stays up CHIP_HOLD_MS of wall time after the last snapshot that named it: one timer, set
  // again on each such snapshot, cleared when the chips go.
  const [held, setHeld] = useState<Chip | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (text === undefined) return;
    setHeld((h) => (h && h.text === text && h.title === title ? h : { text, title }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHeld(null), CHIP_HOLD_MS);
  }, [snap, text, title]);
  const chip: Chip | null = text !== undefined ? { text, title } : held;

  if (!chip && !away) return null;
  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
      {chip && (
        <div data-frag-chip="" title={chip.title} className="pointer-events-auto cursor-default rounded bg-dcs-navy/80 px-2 py-0.5 text-xs text-amber-300">
          {chip.text}
        </div>
      )}
      {away && (
        <div className="pointer-events-none rounded bg-dcs-navy/80 px-2 py-0.5 text-xs text-gray-300">
          {source.labelOf(jet)} isn't in the picture at this moment (before its run-in or after it leaves)
        </div>
      )}
    </div>
  );
}
