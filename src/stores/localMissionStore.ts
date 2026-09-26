import { useEffect } from 'react';
import { create } from 'zustand';
import type { Mission } from '../types/mission.types';
import {
  deleteLocalMission,
  listLocalMissions,
  requestPersistentStorage,
  saveLocalMission,
  type LocalMissionEntry,
} from '../lib/localMissions';
import { useMissionStore } from './missionStore';

/**
 * The web build's autosave and "My missions" list (see `lib/localMissions`).
 *
 * Every change to the open mission is written to this browser shortly after
 * it happens, and at once when the page is hidden — a phone switching apps may
 * never bring the page back. So on the web, leaving a mission never loses
 * work, and the unsaved-changes prompt is only needed if saving here failed.
 */

interface LocalMissionState {
  entries: LocalMissionEntry[];
  /** The mission object last written here; autosave is current when it is the open mission. */
  savedMission: Mission | null;
  /** Why the last write failed (storage full, private browsing), if it did. */
  error: string | null;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useLocalMissionStore = create<LocalMissionState>((set) => ({
  entries: [],
  savedMission: null,
  error: null,

  refresh: async () => {
    try {
      set({ entries: await listLocalMissions() });
    } catch (e) {
      set({ error: `Saved missions could not be listed: ${String(e)}` });
    }
  },

  remove: async (id) => {
    try {
      await deleteLocalMission(id);
      set({ entries: await listLocalMissions() });
    } catch (e) {
      set({ error: `That mission could not be deleted: ${String(e)}` });
    }
  },
}));

/** How long after the last change the mission is written. */
const AUTOSAVE_DELAY_MS = 400;

let pending: Mission | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

async function write(mission: Mission): Promise<void> {
  try {
    await saveLocalMission(mission);
    useLocalMissionStore.setState({ savedMission: mission, error: null });
    void useLocalMissionStore.getState().refresh();
  } catch (e) {
    useLocalMissionStore.setState({ error: `Autosave failed — use Export .json to keep this plan: ${String(e)}` });
  }
}

/** Write any change still waiting. Resolves once it is stored (or has failed). */
export async function flushAutosave(): Promise<void> {
  clearTimeout(timer);
  const mission = pending;
  pending = null;
  if (mission) await write(mission);
}

/** Whether the open mission is safely stored here, so leaving it loses nothing. */
export function isAutosaved(mission: Mission | null): boolean {
  return mission !== null && useLocalMissionStore.getState().savedMission === mission;
}

/** Autosave the open mission while `enabled` (the web build). Mount once, in App. */
export function useAutosave(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    requestPersistentStorage();
    void useLocalMissionStore.getState().refresh();

    const stop = useMissionStore.subscribe((state, previous) => {
      if (state.mission === previous.mission) return;
      if (!state.mission) {
        // Closed: whatever was still waiting belongs to the mission just closed.
        void flushAutosave();
        return;
      }
      pending = state.mission;
      clearTimeout(timer);
      timer = setTimeout(() => void flushAutosave(), AUTOSAVE_DELAY_MS);
    });

    const onHidden = () => {
      if (document.visibilityState === 'hidden') void flushAutosave();
    };
    const onPageHide = () => void flushAutosave();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [enabled]);
}
