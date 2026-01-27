import { useState, useCallback } from 'react';

/**
 * Hook for invoking Tauri commands with loading and error states
 *
 * Note: In development without Tauri, commands will fail gracefully.
 * This hook wraps the Tauri invoke function when available.
 */
export function useTauriCommand<TArgs, TResult>() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TResult | null>(null);

  const invoke = useCallback(
    async (command: string, args?: TArgs): Promise<TResult | null> => {
      setLoading(true);
      setError(null);

      try {
        // Dynamic import to handle cases where Tauri isn't available
        const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
        const response = await tauriInvoke<TResult>(command, args as Record<string, unknown>);
        setResult(response);
        return response;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        console.error(`Tauri command "${command}" failed:`, errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
  }, []);

  return {
    invoke,
    loading,
    error,
    result,
    reset,
  };
}

/**
 * Check if running inside Tauri
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}
