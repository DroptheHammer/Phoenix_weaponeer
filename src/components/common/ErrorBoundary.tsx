import { Component, type ErrorInfo, type ReactNode } from 'react';
import { saveMissionAs } from '../../lib/missionFile';
import { useMissionStore } from '../../stores/missionStore';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  saving: boolean;
  saveMsg: string | null;
}

/**
 * Last line of defence. A crash while drawing any part of the app used to
 * leave a blank window — the planning still in memory, and no way to reach it.
 * The mission lives in the Zustand store, outside React, so it survives the
 * crash; this screen says what broke and offers to save a copy.
 *
 * A class component because React has no hook for catching render errors.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, saving: false, saveMsg: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render crash:', error, info.componentStack);
  }

  saveCopy = async () => {
    this.setState({ saving: true, saveMsg: null });
    const result = await saveMissionAs();
    this.setState({
      saving: false,
      saveMsg:
        result.status === 'ok' ? `Saved a copy to ${result.path}` : result.status === 'error' ? `Save failed: ${result.message}` : null,
    });
  };

  tryAgain = () => this.setState({ error: null, saveMsg: null });

  render() {
    const { error, saving, saveMsg } = this.state;
    if (!error) return this.props.children;
    const hasMission = Boolean(useMissionStore.getState().mission);

    return (
      <div className="min-h-screen bg-dcs-dark text-white flex items-center justify-center p-6">
        <div className="bg-dcs-navy rounded-lg shadow-xl max-w-xl w-full p-6 space-y-4">
          <h1 className="text-xl font-semibold text-dcs-accent">Something went wrong</h1>
          <p className="text-sm text-gray-300">
            Part of the app crashed while drawing.
            {hasMission && ' Your mission is still in memory — save a copy before trying anything else.'}
          </p>
          <pre className="text-xs bg-black/40 rounded p-2 whitespace-pre-wrap break-words text-red-200 max-h-40 overflow-auto">
            {error.message}
          </pre>
          {saveMsg && <p className="text-sm text-gray-300 break-words">{saveMsg}</p>}
          <div className="flex justify-end gap-3">
            <button onClick={this.tryAgain} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition-colors">
              Try again
            </button>
            {hasMission && (
              <button onClick={this.saveCopy} disabled={saving} className="px-4 py-2 rounded-lg bg-dcs-accent hover:bg-red-600 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save a copy…'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
