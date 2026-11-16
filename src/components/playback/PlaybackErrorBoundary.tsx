import { Component, type ErrorInfo, type ReactNode } from 'react';

interface UnavailableProps {
  heading: string;
  message: string;
  /** The technical text, folded away: useful in a bug report, noise otherwise. */
  detail?: string;
  onRetry?: () => void;
  onClose: () => void;
  /** An Apply has written times into the saved plan from this playback: the plan is no longer "unchanged". */
  applied?: boolean;
}

/**
 * What the panel says about the plan: unchanged, until an Apply from this playback has written times into it.
 * Never more than is true.
 */
export function planWords(applied: boolean | undefined): string {
  return applied ? 'The times you applied are saved in the plan.' : 'Your plan is unchanged, and the map and side view still show the attack.';
}

/**
 * What playback shows instead of the 3D view when it cannot run. The plan
 * lives in the store, outside playback, so nothing the user planned is lost:
 * the message says so, because that is the first thing they will wonder.
 */
export function PlaybackUnavailable({ heading, message, detail, onRetry, onClose, applied }: UnavailableProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div className="bg-dcs-navy rounded-lg max-w-lg w-full p-6 space-y-4">
        <h3 className="text-lg font-semibold text-dcs-accent">{heading}</h3>
        <p className="text-sm text-gray-300">
          {message} {planWords(applied)}
        </p>
        {detail && (
          <details className="text-xs text-gray-400">
            <summary className="cursor-pointer">Details</summary>
            <pre className="mt-2 bg-black/40 rounded p-2 whitespace-pre-wrap break-words max-h-40 overflow-auto">{detail}</pre>
          </details>
        )}
        <div className="flex justify-end gap-3">
          {onRetry && (
            <button type="button" onClick={onRetry} className="px-4 py-2 rounded border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400">
              Try again
            </button>
          )}
          <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface BoundaryProps {
  onRetry: () => void;
  onClose: () => void;
  /** As PlaybackUnavailable's: an Apply from this playback has written the plan. */
  applied?: boolean;
  children: ReactNode;
}

// The messages a failed dynamic import gives in Chromium (WebView2), WebKit and Firefox.
const CHUNK_LOAD = /dynamically imported module|Importing a module script failed|Failed to fetch/i;

/**
 * Catches anything playback throws, so a 3D failure stays inside the
 * playback window and never reaches the app-wide "Something went wrong"
 * screen. A class component because React has no hook for this. The caller
 * remounts it (a new key) on Try again, which clears the error, and hands the
 * view a launch made afresh, so an Apply written before the crash is in it.
 */
export class PlaybackErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Playback crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = CHUNK_LOAD.test(error.message);
    return (
      <PlaybackUnavailable
        heading={chunk ? "Couldn't load 3D playback" : '3D playback stopped'}
        message={chunk ? "The app couldn't load its 3D playback code. Try again, or restart the app." : 'Something went wrong in the 3D playback.'}
        detail={error.message}
        onRetry={this.props.onRetry}
        onClose={this.props.onClose}
        applied={this.props.applied}
      />
    );
  }
}
