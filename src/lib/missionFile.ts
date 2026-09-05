import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useMissionStore } from '../stores/missionStore';
import type { Mission } from '../types/mission.types';

/**
 * Mission file I/O — the only place that talks to `save_mission` / `load_mission`.
 *
 * The Rust `Mission` struct carries `#[serde(rename_all = "camelCase")]` so the
 * store's mission crosses the IPC boundary and lands on disk unchanged. If that
 * attribute ever comes off, every call here fails with `missing field
 * 'flight_members'`.
 */

const MISSION_FILTER = [{ name: 'Phoenix Mission', extensions: ['json'] }];

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

  const path = Array.isArray(picked) ? picked[0] : picked;
  try {
    const mission = await invoke<Mission>('load_mission', { path });
    useMissionStore.getState().loadMission(mission, path);
    return { status: 'ok', path };
  } catch (error) {
    return { status: 'error', message: String(error) };
  }
}
