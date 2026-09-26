import type { Mission } from '../../types/mission.types';
import type { Settings, SettingsLoad } from '../../types/settings.types';

/**
 * What the app needs from the platform it runs on.
 *
 * Two implementations: `desktop.ts` (Tauri, the installers) and `web.ts` (the
 * browser build, with the Rust core compiled to WebAssembly). Code imports
 * whichever the build selects as `@platform` — never either file directly —
 * so the desktop bundle never contains the web code and vice versa.
 */

/** Commands the shared Rust core answers identically on both platforms. */
export type CoreCommand =
  | 'list_theaters'
  | 'list_delivery_profiles'
  | 'get_all_threats'
  | 'get_threats_by_type'
  | 'get_all_weapons'
  | 'get_weapons_for_aircraft'
  | 'get_all_aircraft'
  | 'get_fuze_options'
  | 'parse_fragorders_json'
  | 'fetch_fragorders_url';

/**
 * How a `shareFiles` call ended:
 * - `shared`: the share sheet took the files.
 * - `downloaded`: no share sheet for files here, so each was downloaded instead.
 * - `cancelled`: the planner closed the share sheet. Not an error.
 * - `blocked`: the browser wants a fresh tap first (the one that asked went
 *   stale while the cards were drawn). Asking again works.
 * - `unsupported`: this platform has no sharing (the desktop app).
 */
export type ShareResult = 'shared' | 'downloaded' | 'cancelled' | 'blocked' | 'unsupported';

export interface Platform {
  /** The browser build: no file paths, no folders, no DCS install. */
  readonly isWeb: boolean;

  /** Ask the Rust core. Rejects with the core's error text. */
  call<T>(command: CoreCommand, args?: Record<string, unknown>): Promise<T>;

  // ---- Settings ----
  getSettings(): Promise<SettingsLoad>;
  setKneeboardFolder(aircraftId: string, folder: string | null): Promise<Settings>;
  setKneeboardMap(on: boolean): Promise<Settings>;
  rememberRecentMission(path: string): Promise<Settings>;
  forgetRecentMission(path: string): Promise<Settings>;

  // ---- Mission files ----
  /** Where to save a mission; `null` when the user cancels. */
  chooseMissionSavePath(defaultName: string): Promise<string | null>;
  /** Save a mission to a path from `chooseMissionSavePath` (or the one it was opened from). */
  writeMission(mission: Mission, path: string): Promise<void>;
  /** Which mission file to open; `null` when the user cancels. */
  chooseMissionToOpen(): Promise<string | null>;
  /** The mission at a path, unchecked (the caller validates it). */
  readMission(path: string): Promise<unknown>;

  // ---- Kneeboard cards ----
  /** Where to save one card; `null` when the user cancels. */
  chooseCardSavePath(defaultName: string): Promise<string | null>;
  /** A folder for many cards; `null` when the user cancels. */
  chooseFolder(title: string, defaultPath?: string): Promise<string | null>;
  /** A file name inside a folder from `chooseFolder`. */
  pathInFolder(folder: string, filename: string): Promise<string>;
  /** Write a card (PNG as base64) to a path from the two choosers above. */
  writeCard(path: string, base64Png: string): Promise<void>;
  /**
   * Hand files to the system share sheet, all in one go (Messages, AirDrop,
   * Files, Photos…). Must be called from a tap. The desktop app keeps its
   * export buttons and answers `unsupported`.
   */
  shareFiles(files: { name: string; blob: Blob }[], title: string): Promise<ShareResult>;

  // ---- DCS kneeboard folders (desktop only; the web build never asks) ----
  folderExists(path: string): Promise<boolean>;
  suggestKneeboardFolder(kneeboardPath: string): Promise<string | null>;

  // ---- The app itself ----
  /** Quit, after the caller's own unsaved-changes check. */
  quit(): void;
  /**
   * Hold a window close or quit while there is unsaved work. `mustAsk` is read
   * at the moment of closing; when it says yes, `ask` gets the action that
   * finishes closing once the planner has answered (it rejects if the window
   * would not close). Returns the cleanup.
   */
  guardClose(mustAsk: () => boolean, ask: (finish: () => Promise<void>) => void): () => void;
}
