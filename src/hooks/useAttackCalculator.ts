import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PopupCCIPInput, PopupCCIPResult } from '../types/calculator.types';

/**
 * Hook for attack profile calculations
 *
 * Provides methods to calculate attack profiles using the Rust backend
 */
export function useAttackCalculator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PopupCCIPResult | null>(null);

  /**
   * Calculate Popup CCIP attack profile parameters
   */
  const calculatePopupCCIP = useCallback(async (input: PopupCCIPInput): Promise<PopupCCIPResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await invoke<PopupCCIPResult>('calculate_popup_ccip', { input });
      setResult(response);
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error('Failed to calculate popup CCIP:', errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Reset calculator state
   */
  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
  }, []);

  return {
    calculatePopupCCIP,
    loading,
    error,
    result,
    reset,
  };
}
