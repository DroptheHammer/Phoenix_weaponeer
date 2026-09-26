import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useMissionStore } from '../stores/missionStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { Mission } from '../types/mission.types';
import { validateMission } from './validateMission';

/**
 * Mission file I/O — the only place that talks to `save_mission` / `load_mission`.
 *
 * The Rust `Mission` struct carries `#[serde(rename_all = "camelCase")]` so the
 * store's mission crosses the IPC boundary and lands on disk unchanged. If that
 * attribute ever comes off, every call here fails with `missing field
 * 'flight_members'`.
 */

const MISSION_FILTER = [{ name: 'Phoenix Mission', extensions: ['json'] }];

/**
 * `load_mission`'s answer when the file is not there any more. Must match
 * `MISSION_FILE_GONE` in `src-tauri/src/commands/mod.rs` (a Rust test pins it).
 */
export const MISSION_FILE_GONE = 'That mission file has been moved or deleted.';

/** Outcome of a save/open attempt. `cancelled` means the user dismissed the picker. */
export type FileResult =
  | { status: 'ok'; path: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** Turn a mission name into something safe to hand a file picker. */
function defaultFilename(missionName: string): string {
  const base = missionName.trim().replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');
  return `${base || 'mission'}.json`;
}

/**
 * `save_mission` writes to whatever path it is given verbatim — it appends no
 * extension — so a picker that returns a bare name would produce an
 * extensionless file that the Open filter then hides.
 */
function withJsonExtension(path: string): string {
  return path.toLowerCase().endsWith('.json') ? path : `${path}.json`;
}

async function writeTo(mission: Mission, path: string): Promise<FileResult> {
  try {
    await invoke<void>('save_mission', { mission, path });
    const { setFilePath, markClean } = useMissionStore.getState();
    setFilePath(path);
    markClean();
    void useSettingsStore.getState().rememberRecentMission(path);
    return { status: 'ok', path };
  } catch (error) {
    return { status: 'error', message: String(error) };
  }
}

/** Always prompts for a location. */
export async function saveMissionAs(): Promise<FileResult> {
  const { mission } = useMissionStore.getState();
  if (!mission) return { status: 'error', message: 'No mission loaded' };

  let picked: string | null;
  try {
    picked = await save({
      defaultPath: defaultFilename(mission.name),
      filters: MISSION_FILTER,
      title: 'Save Mission',
    });
  } catch (error) {
    return { status: 'error', message: String(error) };
  }
  if (!picked) return { status: 'cancelled' };

  return writeTo(mission, withJsonExtension(picked));
}

/** Writes to the mission's existing file, or falls back to Save As. */
export async function saveMission(): Promise<FileResult> {
  const { mission, filePath } = useMissionStore.getState();
  if (!mission) return { status: 'error', message: 'No mission loaded' };
  if (!filePath) return saveMissionAs();

  return writeTo(mission, filePath);
}

/**
 * Prompts for a mission file and loads it into the store.
 *
 * Needs `dialog:allow-open` in `src-tauri/capabilities/default.json`; without
 * it the picker rejects with a permission error rather than opening.
 */
export async function openMission(): Promise<FileResult> {
  let picked: string | string[] | null;
  try {
    picked = await open({
      multiple: false,
      directory: false,
      filters: MISSION_FILTER,
      title: 'Open Mission',
    });
  } catch (error) {
    return { status: 'error', message: String(error) };
  }
  if (!picked) return { status: 'cancelled' };

  return openMissionAt(Array.isArray(picked) ? picked[0] : picked);
}

/** Loads a mission file already chosen — from the picker, or the recent list. */
export async function openMissionAt(path: string): Promise<FileResult> {
  try {
    const loaded = await invoke<unknown>('load_mission', { path });
    // A mission file can come from anyone in the squadron: nothing reaches the
    // store (and from there the map's raw-HTML markers) unchecked.
    const check = validateMission(loaded);
    if (!check.ok) {
      return { status: 'error', message: `Not a usable mission file — ${check.problems.join('; ')}` };
    }
    useMissionStore.getState().loadMission(check.mission, path);
    void useSettingsStore.getState().rememberRecentMission(path);
    return { status: 'ok', path };
  } catch (error) {
    return { status: 'error', message: String(error) };
  }
}
