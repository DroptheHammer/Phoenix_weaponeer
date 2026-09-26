import { create } from 'zustand';
import { platform } from '@platform';
import type { Settings } from '../types/settings.types';
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
  /**
   * Put a mission file at the top of the front page's recent list. Never
   * throws: a list that fails to update must not fail the save or open.
   */
  rememberRecentMission: (path: string) => Promise<void>;
  /** Drop a mission file from the recent list. Never throws. */
  forgetRecentMission: (path: string) => Promise<void>;
}

/**
 * App settings, fetched once at startup. On the desktop the Rust side
 * (`src-tauri/src/settings.rs`) owns the file; in the browser it is this
 * browser's storage. Every change round-trips through the platform and the
 * store keeps what was actually saved. A settings problem never stops the
 * app — it lands in `warning` instead.
 */
export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { kneeboardFolders: {}, kneeboardMap: true, recentMissions: [] },
  warning: null,
  loaded: false,

  loadSettings: async () => {
    try {
      const load = await platform.getSettings();
      set({ settings: load.settings, warning: load.warning, loaded: true });
      useUiStore.getState().setKneeboardMap(load.settings.kneeboardMap);
    } catch (error) {
      set({ warning: `Settings could not be loaded: ${String(error)}`, loaded: true });
    }
  },

  setKneeboardFolder: async (aircraftId, folder) => {
    const settings = await platform.setKneeboardFolder(aircraftId, folder);
    set({ settings, warning: null });
  },

  setKneeboardMap: async (on) => {
    // The switch works at once either way; only remembering it can fail.
    useUiStore.getState().setKneeboardMap(on);
    try {
      const settings = await platform.setKneeboardMap(on);
      set({ settings, warning: null });
    } catch (error) {
      set({ warning: `The map setting could not be saved: ${String(error)}` });
    }
  },

  rememberRecentMission: async (path) => {
    try {
      set({ settings: await platform.rememberRecentMission(path) });
    } catch (error) {
      console.warn('Recent missions not updated:', error);
    }
  },

  forgetRecentMission: async (path) => {
    try {
      set({ settings: await platform.forgetRecentMission(path) });
    } catch (error) {
      console.warn('Recent missions not updated:', error);
    }
  },
}));
