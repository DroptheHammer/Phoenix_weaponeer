import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Settings, SettingsLoad } from '../types/settings.types';
import { useUiStore } from './uiStore';

interface SettingsState {
  settings: Settings;
  /** Why settings are defaults, or why the last change failed — shown in Settings. */
  warning: string | null;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  /** Remember (`folder`) or forget (`null`) one aircraft type's DCS kneeboard folder. */
  setKneeboardFolder: (aircraftId: string, folder: string | null) => Promise<void>;
  /** Turn the card's map layer on or off, now and for later launches. */
  setKneeboardMap: (on: boolean) => Promise<void>;
}

/**
 * App settings, fetched once at startup. The Rust side (`src-tauri/src/settings.rs`)
 * owns the file; every change round-trips through it and the store keeps what
 * was actually saved. A settings problem never stops the app — it lands in
 * `warning` instead.
 */
export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { kneeboardFolders: {}, kneeboardMap: true },
  warning: null,
  loaded: false,

  loadSettings: async () => {
    try {
      const load = await invoke<SettingsLoad>('get_settings');
      set({ settings: load.settings, warning: load.warning, loaded: true });
      useUiStore.getState().setKneeboardMap(load.settings.kneeboardMap);
    } catch (error) {
      set({ warning: `Settings could not be loaded: ${String(error)}`, loaded: true });
    }
  },

  setKneeboardFolder: async (aircraftId, folder) => {
    const settings = await invoke<Settings>('set_kneeboard_folder', { aircraftId, folder });
    set({ settings, warning: null });
  },

  setKneeboardMap: async (on) => {
    // The switch works at once either way; only remembering it can fail.
    useUiStore.getState().setKneeboardMap(on);
    try {
      const settings = await invoke<Settings>('set_kneeboard_map', { on });
      set({ settings, warning: null });
    } catch (error) {
      set({ warning: `The map setting could not be saved: ${String(error)}` });
    }
  },
}));
