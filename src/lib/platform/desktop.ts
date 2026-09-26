import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { join } from '@tauri-apps/api/path';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { Mission } from '../../types/mission.types';
import type { Settings, SettingsLoad } from '../../types/settings.types';
import type { CoreCommand, Platform } from './types';

/**
 * The desktop (Tauri) platform: everything goes through a Rust command or a
 * native dialog. Imported as `@platform` in the desktop build only.
 */

const MISSION_FILTER = [{ name: 'Phoenix Mission', extensions: ['json'] }];

/**
 * `save_mission` writes to whatever path it is given verbatim — it appends no
 * extension — so a picker that returns a bare name would produce an
 * extensionless file that the Open filter then hides.
 */
function withJsonExtension(path: string): string {
  return path.toLowerCase().endsWith('.json') ? path : `${path}.json`;
}

/** Keep a Tauri listener's unlisten, and undo it on cleanup even if registration is still in flight. */
function subscribe(start: Promise<() => void>, what: string): () => void {
  let stop: (() => void) | undefined;
  let disposed = false;
  start
    .then((unlisten) => {
      if (disposed) unlisten();
      else stop = unlisten;
    })
    .catch((e) => console.warn(`${what} unavailable:`, e));
  return () => {
    disposed = true;
    stop?.();
  };
}

export const platform: Platform = {
  isWeb: false,

  call: <T>(command: CoreCommand, args?: Record<string, unknown>) => invoke<T>(command, args),

  getSettings: () => invoke<SettingsLoad>('get_settings'),
  setKneeboardFolder: (aircraftId, folder) => invoke<Settings>('set_kneeboard_folder', { aircraftId, folder }),
  setKneeboardMap: (on) => invoke<Settings>('set_kneeboard_map', { on }),
  rememberRecentMission: (path) => invoke<Settings>('remember_recent_mission', { path }),
  forgetRecentMission: (path) => invoke<Settings>('forget_recent_mission', { path }),

  async chooseMissionSavePath(defaultName) {
    const picked = await save({ defaultPath: defaultName, filters: MISSION_FILTER, title: 'Save Mission' });
    return picked ? withJsonExtension(picked) : null;
  },
  writeMission: (mission: Mission, path) => invoke<void>('save_mission', { mission, path }),
  /** Needs `dialog:allow-open` in `src-tauri/capabilities/default.json`. */
  async chooseMissionToOpen() {
    const picked = await open({ multiple: false, directory: false, filters: MISSION_FILTER, title: 'Open Mission' });
    if (!picked) return null;
    return Array.isArray(picked) ? picked[0] : picked;
  },
  readMission: (path) => invoke<unknown>('load_mission', { path }),

  chooseCardSavePath: (defaultName) =>
    save({ defaultPath: defaultName, filters: [{ name: 'PNG Image', extensions: ['png'] }], title: 'Save Kneeboard Card' }),
  async chooseFolder(title, defaultPath) {
    const picked = await open({ directory: true, multiple: false, defaultPath, title });
    return typeof picked === 'string' ? picked : null;
  },
  pathInFolder: (folder, filename) => join(folder, filename),
  writeCard: (path, base64Png) => invoke<void>('save_kneeboard_png', { path, base64Data: base64Png }),
  // The desktop exports into folders instead; the phone layout never shows here.
  shareFiles: async () => 'unsupported',

  folderExists: (path) => invoke<boolean>('folder_exists', { path }),
  suggestKneeboardFolder: (kneeboardPath) => invoke<string | null>('suggest_kneeboard_folder', { kneeboardPath }),

  quit: () => void invoke('exit_app'),

  guardClose(mustAsk, ask) {
    // Closing the window — the X, or Alt+F4 on Windows. Needs
    // `core:window:allow-destroy` in capabilities/default.json: once a close
    // listener exists, the window only closes when we destroy it.
    const appWindow = getCurrentWindow();
    const stopClose = subscribe(
      appWindow.onCloseRequested((event) => {
        if (!mustAsk()) return; // not prevented, so Tauri closes the window
        event.preventDefault();
        ask(() => appWindow.destroy());
      }),
      'Close guard',
    );

    // Cmd+Q / Dock "Quit" on macOS is an app-level exit request, not a window
    // close — `onCloseRequested` above never sees it. `lib.rs` intercepts it
    // and emits this event instead of letting the app quit; `exit_app` then
    // actually terminates once the planner has answered.
    const stopQuit = subscribe(
      listen('quit-requested', () => {
        if (!mustAsk()) {
          void invoke('exit_app');
          return;
        }
        ask(() => invoke<void>('exit_app'));
      }),
      'Quit guard',
    );

    return () => {
      stopClose();
      stopQuit();
    };
  },
};
