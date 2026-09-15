import { useMemo } from 'react';
import { useMissionStore } from '../stores/missionStore';
import { useUiStore } from '../stores/uiStore';
import { visibleMission } from '../lib/threatVisibility';

/**
 * The open mission as this planner may see it: threats the mission author hid
 * are removed unless revealed in ⚙ Settings → Admin.
 *
 * Anything that shows threats or plans against them (the map, the threat list,
 * auto-build, kneeboard cards) must read the mission through this, not straight
 * from `useMissionStore`. See `lib/threatVisibility.ts`.
 */
export function useVisibleMission() {
  const mission = useMissionStore((state) => state.mission);
  const reveal = useUiStore((state) => state.revealHidden);
  return useMemo(() => (mission ? visibleMission(mission, reveal) : mission), [mission, reveal]);
}
