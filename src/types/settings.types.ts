/** Preferences that outlive a mission. Mirrors `Settings` in `src-tauri/src/settings.rs`. */
export interface Settings {
  /** Aircraft id (`f16c`) → the DCS kneeboard folder the user chose for that type. */
  kneeboardFolders: Record<string, string>;
  /** The grey map layer behind the kneeboard card's plan view. */
  kneeboardMap: boolean;
  /** Mission files last opened or saved, newest first. */
  recentMissions: string[];
  /** How long the loading splash stays up when the app starts: 0 to 10 seconds, in tenths (`src/lib/splash.ts`). */
  splashSeconds: number;
}

export interface SettingsLoad {
  settings: Settings;
  /** Set when the settings file was unreadable and defaults were used instead. */
  warning: string | null;
}
