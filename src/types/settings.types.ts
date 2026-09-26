/** Preferences that outlive a mission. Mirrors `Settings` in `src-tauri/src/settings.rs`. */
export interface Settings {
  /** Aircraft id (`f16c`) → the DCS kneeboard folder the user chose for that type. */
  kneeboardFolders: Record<string, string>;
  /** The grey map layer behind the kneeboard card's plan view. */
  kneeboardMap: boolean;
}

export interface SettingsLoad {
  settings: Settings;
  /** Set when the settings file was unreadable and defaults were used instead. */
  warning: string | null;
}
