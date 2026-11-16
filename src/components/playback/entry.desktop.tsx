/**
 * `@playback` in the desktop build: the Play button and the small, eager shell
 * around the 3D view. The phone build gets `entry.web.tsx` instead, so none of
 * this reaches it.
 *
 * Nothing here may import three.js or PlaybackView statically. The 3D code
 * (three.js alone is several hundred KB) loads only when Play is pressed, and
 * scripts/bundle-check.mjs fails the build if it ever reaches the main chunk.
 */
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import type { FragPanelProps, PlaybackLaunch, PlayStrikeButtonProps } from './types';
import { PlaybackOverlay } from './PlaybackOverlay';
import { PlaybackErrorBoundary, PlaybackUnavailable } from './PlaybackErrorBoundary';
import { probeWebGL2 } from './webgl';
import { BLAST_CHECK_FAILED, playbackLaunchFromMission } from './launch';

export const PLAYBACK_AVAILABLE = true;

/** Builds what Play hands the playback from the attack editor's drafts (see launch.ts). */
export { playbackLaunchFromEditor } from './launch';

// The blast check builds the playback, so its panel loads the first time a strike is open, never at start-up.
// A chunk that fails to load leaves one line in its place rather than an editor that cannot open.
const LazyFragPanel = lazy(() =>
  import('./FragPanel').catch(() => ({ default: () => <div className="text-xs text-amber-300">{BLAST_CHECK_FAILED}</div> })),
);

/**
 * The strike strip's "Warn by" choice and blast lines. While its code loads the strip keeps a blank line of the same
 * height: nothing false and no all-clear is ever shown in the meantime.
 */
export function FragPanel(props: FragPanelProps) {
  return (
    <Suspense fallback={<div className="h-5" />}>
      <LazyFragPanel {...props} />
    </Suspense>
  );
}

/**
 * The Play button. The attack editor gives it `build` (its drafts as they stand); the attack list gives it
 * `fromMission` (a strike or an attack of the saved plan), and wants it as a small text button like Edit.
 */
export function PlayStrikeButton({ disabled, title, variant, build, fromMission }: PlayStrikeButtonProps) {
  // undefined: closed. { launch }: open, with what the planner gave at the press.
  const [open, setOpen] = useState<{ launch: PlaybackLaunch | undefined }>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(undefined), []);
  // What the planner gives now: the press asks it, and Try again after a crash asks it afresh (an Apply may have moved the times since).
  const launchNow = useCallback(
    () => (build ? build() : fromMission && playbackLaunchFromMission(fromMission.subject, fromMission.weapons)),
    [build, fromMission],
  );
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          // In a list row this click must not also select the row.
          e.stopPropagation();
          setOpen({ launch: launchNow() });
        }}
        className={
          variant === 'text'
            ? `px-2 py-1 ${disabled ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-blue-400'}`
            : `px-3 py-2 rounded text-sm border transition-colors ${
                disabled ? 'border-gray-700 text-gray-500 cursor-not-allowed' : 'border-gray-600 text-gray-200 hover:border-gray-400'
              }`
        }
        title={title ?? (disabled ? 'Finish the plan to watch it fly in 3D' : 'Watch the strike fly in 3D')}
      >
        ▶ Play
      </button>
      {open && <PlaybackHost launch={open.launch} relaunch={launchNow} onClose={close} returnFocusTo={buttonRef.current} />}
    </>
  );
}

interface PlaybackHostProps {
  launch: PlaybackLaunch | undefined;
  /** A launch made afresh from the plan as it stands, for Try again. */
  relaunch: () => PlaybackLaunch | undefined;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}

/** The overlay, the error boundary and the lazily loaded 3D view inside it. */
function PlaybackHost({ launch: first, relaunch, onClose, returnFocusTo }: PlaybackHostProps) {
  const [attempt, setAttempt] = useState(0);
  const [launch, setLaunch] = useState(first);
  // Whether an Apply has written times into the saved plan from here, so neither the crash panel nor the view's own
  // lost-graphics panel says the plan is unchanged after one: kept here alone, as it must outlive a crashed view.
  // (An Apply to the editor's strike changes only the editor, not the plan.)
  const [applied, setApplied] = useState(false);
  const shown = useMemo(() => {
    const a = launch?.apply;
    return a?.to === 'mission' ? { ...launch!, apply: { ...a, write: (o: Record<string, number>) => (a.write(o), setApplied(true)) } } : launch;
  }, [launch]);
  // A new lazy() for every attempt: React.lazy remembers a failed import
  // forever, so Try again would otherwise show the same failure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const View = useMemo(() => lazy(() => import('./PlaybackView')), [attempt]);
  const support = probeWebGL2();
  // The view hands its play/pause over here, so Space in the overlay reaches it.
  const toggle = useRef<(() => void) | null>(null);
  const bindTogglePlay = useCallback((fn: (() => void) | null) => {
    toggle.current = fn;
  }, []);

  return (
    <PlaybackOverlay title="Strike playback" onClose={onClose} onTogglePlay={() => toggle.current?.()} returnFocusTo={returnFocusTo}>
      {support.ok ? (
        <PlaybackErrorBoundary key={attempt} onRetry={() => (setLaunch(relaunch()), setAttempt((a) => a + 1))} onClose={onClose} applied={applied}>
          <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-gray-400">Loading 3D playback…</div>}>
            <View launch={shown} onClose={onClose} bindTogglePlay={bindTogglePlay} applied={applied} />
          </Suspense>
        </PlaybackErrorBoundary>
      ) : (
        <PlaybackUnavailable heading="3D playback isn't available on this machine" message={support.reason} onClose={onClose} />
      )}
    </PlaybackOverlay>
  );
}
