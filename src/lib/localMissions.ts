import type { Mission } from '../types/mission.types';

/**
 * Missions kept in this browser (IndexedDB), for the web build's autosave and
 * its "My missions" list. A phone closes background tabs freely, so without
 * this a half-finished plan is lost; the desktop has real files instead.
 *
 * What is stored here stays on this device and in this browser. It survives
 * reloads and updates of the app, but clearing site data removes it, and
 * Safari may clear it for a site not added to the Home Screen after weeks of
 * disuse — which is why Export .json stays the durable backup.
 */

const DB_NAME = 'phoenix-weaponeer';
const DB_VERSION = 1;
const STORE = 'missions';

/** One saved mission, as the list shows it. */
export interface LocalMissionEntry {
  id: string;
  name: string;
  theater: string;
  attackCount: number;
  /** ISO time it was last written here. */
  savedAt: string;
}

interface StoredMission {
  id: string;
  savedAt: string;
  mission: Mission;
}

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error('This browser would not open its storage.'));
    };
  });
  return opening;
}

/** Run one request in a transaction and resolve with its result. */
async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = act(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? request.error);
    tx.onabort = () => reject(tx.error ?? new Error('Saving in this browser was stopped (storage full?).'));
  });
}

export async function saveLocalMission(mission: Mission): Promise<void> {
  const record: StoredMission = { id: mission.id, savedAt: new Date().toISOString(), mission };
  await run('readwrite', (store) => store.put(record));
}

/** Every mission kept here, most recently saved first. */
export async function listLocalMissions(): Promise<LocalMissionEntry[]> {
  const records = await run<StoredMission[]>('readonly', (store) => store.getAll());
  return records
    .map((r) => ({
      id: r.id,
      name: r.mission?.name ?? 'Untitled mission',
      theater: r.mission?.theater ?? '',
      attackCount: Array.isArray(r.mission?.attacks) ? r.mission.attacks.length : 0,
      savedAt: r.savedAt,
    }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** The stored mission, unchecked (the caller validates it), or `null` if it is gone. */
export async function loadLocalMission(id: string): Promise<unknown | null> {
  const record = await run<StoredMission | undefined>('readonly', (store) => store.get(id));
  return record?.mission ?? null;
}

export async function deleteLocalMission(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
}

/**
 * Ask the browser not to evict this site's storage under pressure. Browsers
 * decide for themselves (an installed Home Screen app usually gets it); a
 * refusal changes nothing.
 */
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => undefined);
}
