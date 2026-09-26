import { platform } from '@platform';
import { useLocalMissionStore } from '../stores/localMissionStore';
import { useMissionStore } from '../stores/missionStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { Mission } from '../types/mission.types';
import { loadLocalMission } from './localMissions';
import { isRealWorld, REAL_WORLD_SHARE_WARNING } from './strikeNearMe';
import { validateMission } from './validateMission';

/**
 * Mission file I/O — the only place that saves or opens a mission file.
 *
 * On the desktop this is `save_mission` / `load_mission`, whose Rust `Mission`
 * struct carries `#[serde(rename_all = "camelCase")]` so the store's mission
 * crosses the IPC boundary and lands on disk unchanged. If that attribute ever
 * comes off, every call here fails with `missing field 'flight_members'`. In
 * the browser, Save downloads the file and Open reads one the user picks,
 * through the same Rust code compiled to WebAssembly.
 */

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

async function writeTo(mission: Mission, path: string): Promise<FileResult> {
  // A "Strike near me" mission holds a real location; say so before it leaves the app.
  if (isRealWorld(mission) && !window.confirm(`${REAL_WORLD_SHARE_WARNING}\n\nSave the file anyway?`)) {
    return { status: 'cancelled' };
  }
  try {
    await platform.writeMission(mission, path);
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
    picked = await platform.chooseMissionSavePath(defaultFilename(mission.name));
  } catch (error) {
    return { status: 'error', message: String(error) };
  }
  if (!picked) return { status: 'cancelled' };

  return writeTo(mission, picked);
}

/** Writes to the mission's existing file, or falls back to Save As. */
export async function saveMission(): Promise<FileResult> {
  const { mission, filePath } = useMissionStore.getState();
  if (!mission) return { status: 'error', message: 'No mission loaded' };
  if (!filePath) return saveMissionAs();

  return writeTo(mission, filePath);
}

/** Prompts for a mission file and loads it into the store. */
export async function openMission(): Promise<FileResult> {
  let picked: string | null;
  try {
    picked = await platform.chooseMissionToOpen();
  } catch (error) {
    return { status: 'error', message: String(error) };
  }
  if (!picked) return { status: 'cancelled' };

  return openMissionAt(picked);
}

/** Opens a mission autosaved in this browser ("My missions", web build). */
export async function openLocalMission(id: string): Promise<FileResult> {
  try {
    const loaded = await loadLocalMission(id);
    if (loaded === null) return { status: 'error', message: 'That mission is no longer saved in this browser.' };
    // Checked like a file: storage can outlive the app version that wrote it.
    const check = validateMission(loaded);
    if (!check.ok) {
      return { status: 'error', message: `That saved mission can't be used — ${check.problems.join('; ')}` };
    }
    useMissionStore.getState().loadMission(check.mission);
    // Just read from storage, so it is already saved there.
    useLocalMissionStore.setState({ savedMission: useMissionStore.getState().mission });
    return { status: 'ok', path: check.mission.name };
  } catch (error) {
    return { status: 'error', message: String(error) };
  }
}

/** Loads a mission file already chosen — from the picker, or the recent list. */
export async function openMissionAt(path: string): Promise<FileResult> {
  try {
    const loaded = await platform.readMission(path);
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
