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
import type { PlaybackLaunch, PlayStrikeButtonProps } from './types';
import { PlaybackOverlay } from './PlaybackOverlay';
import { PlaybackErrorBoundary, PlaybackUnavailable } from './PlaybackErrorBoundary';
import { probeWebGL2 } from './webgl';

export const PLAYBACK_AVAILABLE = true;

/** Builds what Play hands the playback from the attack editor's drafts (see launch.ts). */
export { playbackLaunchFromEditor } from './launch';

export function PlayStrikeButton({ disabled, title, build }: PlayStrikeButtonProps) {
  // undefined: closed. { launch }: open, with what the planner gave at the press.
  const [open, setOpen] = useState<{ launch: PlaybackLaunch | undefined }>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(undefined), []);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          // In a list row this click must not also select the row.
          e.stopPropagation();
          setOpen({ launch: build() });
        }}
        className={`px-3 py-2 rounded text-sm border transition-colors ${
          disabled ? 'border-gray-700 text-gray-500 cursor-not-allowed' : 'border-gray-600 text-gray-200 hover:border-gray-400'
        }`}
        title={title ?? (disabled ? 'Finish the plan to watch it fly in 3D' : 'Watch the strike fly in 3D')}
      >
        ▶ Play
      </button>
      {open && <PlaybackHost launch={open.launch} onClose={close} returnFocusTo={buttonRef.current} />}
    </>
  );
}

interface PlaybackHostProps {
  launch: PlaybackLaunch | undefined;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}

/** The overlay, the error boundary and the lazily loaded 3D view inside it. */
function PlaybackHost({ launch, onClose, returnFocusTo }: PlaybackHostProps) {
  const [attempt, setAttempt] = useState(0);
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
        <PlaybackErrorBoundary key={attempt} onRetry={() => setAttempt((a) => a + 1)} onClose={onClose}>
          <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-gray-400">Loading 3D playback…</div>}>
            <View launch={launch} onClose={onClose} bindTogglePlay={bindTogglePlay} />
          </Suspense>
        </PlaybackErrorBoundary>
      ) : (
        <PlaybackUnavailable heading="3D playback isn't available on this machine" message={support.reason} onClose={onClose} />
      )}
    </PlaybackOverlay>
  );
}
