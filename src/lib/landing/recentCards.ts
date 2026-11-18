import type { Mission } from '../../types/mission.types';
import type { Coordinates } from '../../types/waypoint.types';
import { flightGroupOf, formatCallsign } from '../callsign';
import type { LocalMissionEntry } from '../localMissions';
import { MISSION_FILE_GONE } from '../missionFile';
import { isRealWorld } from '../strikeNearMe';
import { visibleMission, type HiddenReveal } from '../threatVisibility';
import { validateMission } from '../validateMission';
import { MAX_THUMB_THREATS, MAX_THUMB_WAYPOINTS, type ThumbnailInput } from './thumbnailPlan';

// The picture's own limits and input shape live with the picture; they are
// offered here too, as the card is what fills the input in.
export { MAX_THUMB_THREATS, MAX_THUMB_WAYPOINTS };
export type { ThumbnailInput };

/**
 * What the front page shows for a recently opened mission, read without opening
 * it: a name, a few counts and the little route picture.
 *
 * A card is built from a mission file that may have been written, or last read,
 * a long time ago, and it is kept on screen with no way for the planner to ask
 * what was hidden from them in it. So a card is always made as if no hidden
 * threat were revealed, whatever the Admin switches say now: it takes no reveal
 * input at all, and the mission it was made from is not kept in it. Nothing
 * here reads or writes a setting, a file or a store; the readers are handed in.
 */

/** Nothing the mission author hid is shown on a card. Frozen, so no caller can loosen it. */
export const STRICT_REVEAL: Readonly<HiddenReveal> = Object.freeze({ onPlanner: false, onMap: false });

/** The recent list holds eight; a few more is room to grow, never a way to read a whole disk. */
export const MAX_RECENT_PEEKS = 12;

/** Where a recent mission lives: a file (desktop), or an entry kept in this browser (web). */
export type RecentKey =
  | { source: 'file'; path: string }
  | { source: 'browser'; id: string; name: string; savedAt: string };

export type RecentCard =
  | {
      status: 'ok';
      key: RecentKey;
      name: string;
      theaterId: string;
      lastEdited: string | null;
      flights: Array<{ group: string; aircraftIds: string[]; jets: number }>;
      attackCount: number;
      thumbnail: ThumbnailInput;
    }
  | { status: 'missing'; key: RecentKey; label: string }
  | { status: 'unreadable'; key: RecentKey; label: string; message: string };

/**
 * How the cards are read. There is deliberately no way to forget a recent file
 * or to open a mission here: reading must never reorder the list or change the
 * open mission. Pruning a dead entry stays with the click.
 */
export interface PeekDeps {
  readMission(path: string): Promise<unknown>;
  loadLocalMission(id: string): Promise<unknown | null>;
  /** Waits for the next screen frame, so a run of reads never holds the page up. */
  nextFrame(): Promise<void>;
}

/** A name for one card, whatever it is. */
export const recentKeyId = (key: RecentKey): string => (key.source === 'file' ? `file:${key.path}` : `browser:${key.id}`);

/** A file's name without its folders, whichever way the folders are written. */
export const fileNameOf = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** What a card is called when its file cannot be read: the file's name, or the name the browser kept it under. */
const labelOf = (key: RecentKey): string => (key.source === 'file' ? fileNameOf(key.path) : key.name);

/**
 * The cards to show, in order. The desktop remembers file paths; the browser
 * keeps no paths, only the missions it holds itself, so it ignores any it is given.
 */
export function recentKeys(isWeb: boolean, recentPaths: string[], localEntries: LocalMissionEntry[]): RecentKey[] {
  if (isWeb) {
    return localEntries.map((e): RecentKey => ({ source: 'browser', id: e.id, name: e.name, savedAt: e.savedAt }));
  }
  return recentPaths.map((path): RecentKey => ({ source: 'file', path }));
}

const finiteTime = (text: unknown): text is string => typeof text === 'string' && Number.isFinite(Date.parse(text));

/** The number the position is sorted by: a hand-made file might leave it out. */
const positionOf = (position: unknown): number => (typeof position === 'number' && Number.isFinite(position) ? position : 99);

/**
 * What the file's own complaints say, without the values it was complaining
 * about: a card must not echo a hidden threat's half-written position, or a
 * note, back onto the front page.
 */
const withoutValues = (problem: string): string => problem.replace(/ \(got [\s\S]*\)$/, '');

/**
 * One card from a mission as it came off disk or out of storage. The mission is
 * checked first, exactly as Open checks it, and is not kept: the card holds
 * only what it shows.
 */
export function recentCardFrom(
  raw: unknown,
  key: RecentKey,
  fallbackCenterOf: (theaterId: string) => Coordinates | null,
): RecentCard {
  const check = validateMission(raw);
  if (!check.ok) {
    return {
      status: 'unreadable',
      key,
      label: labelOf(key),
      message: `Not a usable mission file — ${check.problems.map(withoutValues).join('; ')}`,
    };
  }
  const mission: Mission = check.mission;
  const visible = visibleMission(mission, STRICT_REVEAL);

  // Flights by the group their callsigns share ("Viper 1-1" and "Viper 1-2" are one flight).
  const groups = new Map<string, { group: string; aircraftIds: string[]; jets: number }>();
  for (const member of [...mission.flightMembers].sort((a, b) => positionOf(a.position) - positionOf(b.position))) {
    const group = flightGroupOf(formatCallsign(member.callsign));
    const entry = groups.get(group) ?? { group, aircraftIds: [], jets: 0 };
    if (!entry.aircraftIds.includes(member.aircraftId)) entry.aircraftIds.push(member.aircraftId);
    entry.jets += 1;
    groups.set(group, entry);
  }

  // The browser knows when it last wrote the mission; a file knows what the mission says.
  const savedAt = key.source === 'browser' ? key.savedAt : undefined;
  const lastEdited = [savedAt, mission.updatedAt].find(finiteTime) ?? null;

  return {
    status: 'ok',
    key,
    name: mission.name,
    theaterId: mission.theater,
    lastEdited,
    flights: [...groups.values()],
    attackCount: mission.attacks.length,
    thumbnail: {
      waypoints: visible.waypoints
        .slice(0, MAX_THUMB_WAYPOINTS)
        .map((w) => ({ lat: w.coordinates.lat, lon: w.coordinates.lon, steerpoint: w.steerpoint })),
      threats: visible.threats
        .slice(0, MAX_THUMB_THREATS)
        .map((t) => ({ lat: t.position.lat, lon: t.position.lon, systemId: t.systemId })),
      fallbackCenter: fallbackCenterOf(mission.theater),
      realWorld: isRealWorld(mission),
    },
  };
}

/**
 * Read one recent mission and make its card. Never rejects, never opens the
 * mission, never touches the recent list: a file that is gone is a "missing"
 * card, and the planner's click is what removes it.
 */
export async function peekRecent(
  key: RecentKey,
  deps: PeekDeps,
  fallbackCenterOf: (theaterId: string) => Coordinates | null,
): Promise<RecentCard> {
  try {
    const raw = key.source === 'file' ? await deps.readMission(key.path) : await deps.loadLocalMission(key.id);
    if (raw === null || raw === undefined) return { status: 'missing', key, label: labelOf(key) };
    return recentCardFrom(raw, key, fallbackCenterOf);
  } catch (e) {
    const message = String(e);
    if (message === MISSION_FILE_GONE) return { status: 'missing', key, label: labelOf(key) };
    return { status: 'unreadable', key, label: labelOf(key), message };
  }
}

/**
 * Cards for the first few keys, one at a time with a frame between, handed over
 * in key order as each is ready. Stops as soon as `isCancelled` says so (the
 * page was left), and then hands over nothing more.
 */
export async function peekRecents(
  keys: RecentKey[],
  deps: PeekDeps,
  fallbackCenterOf: (theaterId: string) => Coordinates | null,
  onCard: (card: RecentCard) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const wanted = keys.slice(0, MAX_RECENT_PEEKS);
  for (let i = 0; i < wanted.length; i++) {
    if (isCancelled()) return;
    if (i > 0) await deps.nextFrame();
    if (isCancelled()) return;
    const card = await peekRecent(wanted[i], deps, fallbackCenterOf);
    if (isCancelled()) return;
    onCard(card);
  }
}
