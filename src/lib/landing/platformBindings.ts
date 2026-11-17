import { platform } from '@platform';
import { getTheaterInfo } from '../../stores/theaterStore';
import type { FragOrdersData } from '../../types/fragorders.types';
import type { Mission } from '../../types/mission.types';
import type { Coordinates } from '../../types/waypoint.types';
import { loadLocalMission } from '../localMissions';
import { adoptCheckedMission } from '../missionFile';
import { sourceFromPath, type FileLoadSource, type LoadDeps, type LoadSource } from './loadRouter';
import type { PeekDeps } from './recentCards';

/**
 * The one place the front page's data layer meets the platform (the desktop
 * app or the browser build). Everything else under src/lib/landing/ is handed
 * what it needs, so it can be checked in plain node without either.
 */

/** The two backends the load box reaches, the same two the FragOrders dialog uses. */
export const platformLoadDeps: LoadDeps = {
  fetchLink: (url) => platform.call<FragOrdersData>('fetch_fragorders_url', { url }),
  parseFragOrders: (jsonStr) => platform.call<FragOrdersData>('parse_fragorders_json', { jsonStr }),
};

/** How the recent cards are read: a file by path on the desktop, an entry in this browser on the web. */
export const platformPeekDeps: PeekDeps = {
  readMission: (path) => platform.readMission(path),
  loadLocalMission: (id) => loadLocalMission(id),
  nextFrame: () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
};

/**
 * A file the planner picked or dropped, as the load box reads it. The browser
 * has no paths, so there the file's name stands in for one, as it does when the
 * planner opens a mission from the menu; on the desktop a dropped file has none.
 */
export function sourceFromFile(file: File): LoadSource {
  return {
    kind: 'file',
    name: file.name,
    size: file.size,
    bytes: async () => new Uint8Array(await file.arrayBuffer()),
    path: platform.isWeb ? file.name : null,
  };
}

/**
 * Desktop: the load box's Choose file, through the system's own dialog (the one Open uses), so the file's path
 * comes with it. Null when the planner cancels. Not used on the web, which has no paths.
 */
export async function chooseFileToLoad(): Promise<FileLoadSource | null> {
  const path = await platform.chooseMissionToOpen();
  return path ? sourceFromPath(path, (p) => platform.readLoadFile(p)) : null;
}

export type FileDropEvent = { type: 'over' } | { type: 'leave' } | { type: 'drop'; sources: FileLoadSource[] };

/**
 * Desktop: files dragged onto the window, with their paths. Resolves to the unsubscribe. In the browser it
 * resolves to a no-op and the page's own drop events serve the load box.
 */
export function subscribeFileDrop(handler: (e: FileDropEvent) => void): Promise<() => void> {
  return platform.onFileDrop((e) =>
    handler(e.type === 'drop' ? { type: 'drop', sources: e.paths.map((p) => sourceFromPath(p, (q) => platform.readLoadFile(q))) } : e),
  );
}

/** Commit a saved mission the load box has already checked: exactly what Open does. */
export function adoptSavedMission(mission: Mission, path: string | null): void {
  adoptCheckedMission(mission, path);
}

/** Where to look on the map for a theater, when a mission has nothing to frame. */
export function fallbackCenterOf(theaterId: string): Coordinates | null {
  return getTheaterInfo(theaterId)?.default_center ?? null;
}
