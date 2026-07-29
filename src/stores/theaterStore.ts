import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Theater, Coordinates } from '../types';

/**
 * A DCS theater, as reported by the Rust backend.
 *
 * Field names are snake_case because they come straight off the `list_theaters`
 * command without a serde rename.
 */
export interface TheaterInfo {
  /** Theater name as DCS writes it (e.g. "SinaiMap") */
  dcs_name: string;
  /** Stable id used throughout the app (e.g. "sinai") */
  id: Theater;
  display_name: string;
  /** Whether missions on this map can be imported at all */
  supported: boolean;
  /** Whether the map's projection has been independently confirmed */
  verified: boolean;
  /** Where to centre the map when a mission has nothing to frame */
  default_center: Coordinates;
}

interface TheaterState {
  theaters: Record<string, TheaterInfo>;
  loaded: boolean;
  loadTheaters: () => Promise<void>;
}

/**
 * The theater list, fetched once at startup.
 *
 * `THEATER_PARAMS` in `src-tauri/src/parsers/coordinate_conversion.rs` is the
 * single source of truth. The frontend used to hard-code a parallel copy, which
 * silently drifted out of sync — it was missing three maps entirely, so those
 * could never be represented here even when the backend supported them.
 */
export const useTheaterStore = create<TheaterState>((set) => ({
  theaters: {},
  loaded: false,

  loadTheaters: async () => {
    const list = await invoke<TheaterInfo[]>('list_theaters');
    set({
      theaters: Object.fromEntries(list.map((theater) => [theater.id, theater])),
      loaded: true,
    });
  },
}));

/** Non-reactive lookup, for use outside React render. */
export function getTheaterInfo(id: Theater): TheaterInfo | undefined {
  return useTheaterStore.getState().theaters[id];
}

/** Reactive lookup — re-renders once the list has loaded. */
export function useTheaterInfo(id: Theater | undefined): TheaterInfo | undefined {
  return useTheaterStore((state) => (id ? state.theaters[id] : undefined));
}

/** Falls back to the raw id so the UI never renders an empty theater name. */
export function getTheaterDisplayName(id: Theater): string {
  return getTheaterInfo(id)?.display_name ?? id;
}
