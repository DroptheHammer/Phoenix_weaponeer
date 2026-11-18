import type { FragOrdersData } from '../../types/fragorders.types';
import type { Mission } from '../../types/mission.types';
import { validateMission } from '../validateMission';
import { classifyLoadText, decodeLoadBytes, LOAD_MAX_BYTES, REFUSAL_MESSAGES, type RefusalReason } from './loadSniff';

/**
 * Takes what the load box was given and says what it turned into. It never
 * changes the open mission: the caller guards unsaved work and then commits, so
 * a refused or failed load leaves everything as it was.
 *
 * The backends (the link fetch and the FragOrders parser) are handed in rather
 * than imported, so this runs under the node checks with plain stand-ins.
 */

export type LoadSource =
  | { kind: 'text'; text: string }
  | {
      kind: 'file';
      name: string;
      size: number;
      /** Read only once the name and size are known to be worth reading. */
      bytes: () => Promise<Uint8Array>;
      /** Where the file lives, when the platform has paths; null for a dropped file. */
      path: string | null;
    };

/** A file turned away before any of it was read: the load box shows its own words for the reason. */
class ReadRefused {
  constructor(readonly reason: RefusalReason) {}
}

/**
 * What the desktop's read command (`read_load_file` in src-tauri/src/commands/mod.rs) answers when it
 * refuses a file unread, and the load box's own reason for each. A Rust test keeps these exact words
 * the same on both sides, so the planner never sees the command's codes.
 */
const READ_REFUSALS = new Map<string, RefusalReason>([
  ['not-json', 'not-a-mission-file'],
  ['not-a-file', 'not-a-mission-file'],
  ['too-large', 'too-large'],
]);

/**
 * A file known by its path: the desktop's own Choose file dialog, or a file dropped on the desktop window.
 * Its bytes are read through `readBytes` only when routeLoad wants them, and handed on untouched, so the
 * one decoder serves the desktop as it serves a browser's File (a UTF-16 export written by Windows
 * PowerShell included). The path stays with it, so a saved mission loaded this way saves back to its file
 * and joins Recent missions, exactly as Open does. The size is not known before reading (0 here): the
 * desktop's read command refuses anything over LOAD_MAX_BYTES itself.
 */
export type FileLoadSource = Extract<LoadSource, { kind: 'file' }>;
export function sourceFromPath(path: string, readBytes: (path: string) => Promise<Uint8Array>): FileLoadSource {
  const name = path.split(/[\\/]/).pop() || path;
  return {
    kind: 'file',
    name,
    size: 0,
    bytes: async () => {
      // The desktop reads nothing but .json; saying so here spares a trip to the backend for a picture or a
      // brief pack dropped by mistake. (A .miz never gets this far: routeLoad gives its own advice first.)
      if (!/\.json$/i.test(name)) throw new ReadRefused('not-a-mission-file');
      try {
        return await readBytes(path);
      } catch (e) {
        const reason = READ_REFUSALS.get(String(e));
        throw reason ? new ReadRefused(reason) : e;
      }
    },
    path,
  };
}

export interface LoadDeps {
  fetchLink(url: string): Promise<FragOrdersData>;
  parseFragOrders(jsonStr: string): Promise<FragOrdersData>;
}

export type LoadOutcome =
  | { kind: 'fragorders'; data: FragOrdersData; via: 'link' | 'link-payload' | 'cli-export' }
  | { kind: 'saved-mission'; mission: Mission; path: string | null }
  | { kind: 'error'; message: string; reason?: RefusalReason };

const refused = (reason: RefusalReason): LoadOutcome => ({ kind: 'error', message: REFUSAL_MESSAGES[reason], reason });

export async function routeLoad(input: LoadSource | LoadSource[], deps: LoadDeps): Promise<LoadOutcome> {
  // Several things at once is not guessed at: which one did they mean?
  const sources = Array.isArray(input) ? input : [input];
  if (sources.length !== 1) return refused('several-files');
  const source = sources[0];

  try {
    let text: string;
    if (source.kind === 'file') {
      // The cheap refusals come first, so a huge file or a .miz is never read into memory.
      if (source.size > LOAD_MAX_BYTES) return refused('too-large');
      if (/\.miz$/i.test(source.name)) return refused('miz');
      let bytes: Uint8Array;
      try {
        bytes = await source.bytes();
      } catch (e) {
        if (e instanceof ReadRefused) return refused(e.reason);
        return { kind: 'error', message: `Couldn't read that file — ${String(e)}` };
      }
      const decoded = decodeLoadBytes(bytes, source.name);
      if (!decoded.ok) return { kind: 'error', message: decoded.message, reason: decoded.reason };
      text = decoded.text;
    } else {
      text = source.text;
    }

    const kind = classifyLoadText(text, { fromFile: source.kind === 'file' });
    switch (kind.kind) {
      case 'link':
        return { kind: 'fragorders', data: await deps.fetchLink(kind.url), via: 'link' };
      case 'fragorders-json':
        return { kind: 'fragorders', data: await deps.parseFragOrders(kind.text), via: kind.shape };
      case 'saved-mission': {
        // A saved mission can come from anyone in the squadron: it is checked
        // exactly as Open checks one before it can reach the store.
        const check = validateMission(JSON.parse(kind.text));
        if (!check.ok) {
          return { kind: 'error', message: `Not a usable mission file — ${check.problems.join('; ')}` };
        }
        return { kind: 'saved-mission', mission: check.mission, path: source.kind === 'file' ? source.path : null };
      }
      case 'refused':
        return { kind: 'error', message: kind.message, reason: kind.reason };
    }
  } catch (e) {
    // The backend's own words (a dead link, a theater it can't place) are the
    // most useful thing to show; nothing here is dressed up.
    return { kind: 'error', message: String(e) };
  }
}

export interface LoadGate {
  /** A ticket for a load that is starting; it makes every older ticket stale. */
  next(): number;
  isLatest(token: number): boolean;
  /** The box that started loads is gone: no ticket is the latest, now or from here on, until `open`. */
  close(): void;
  /** The box is up again (a screen that mounts a second time): loads are wanted once more. */
  open(): void;
}

/**
 * A ticket per load, so a slow answer that arrives after a newer load started
 * (or after the box was closed) can tell it is stale and be ignored.
 */
export function latestGate(): LoadGate {
  let latest = 0;
  let closed = false;
  return {
    next: () => ++latest,
    isLatest: (token) => !closed && token === latest,
    close: () => { closed = true; },
    open: () => { closed = false; },
  };
}

/**
 * One load, from the moment it starts to its answer. The answer goes to `deliver` only while this is still the
 * latest load on the gate: a newer load, Cancel, or the box having gone from the screen makes it stale, and a
 * stale answer is thrown away. So a slow link can never open "Choose your flight" over the map, or replace the
 * open mission, after the planner has left the front page.
 */
export async function runLoad(
  gate: LoadGate,
  source: LoadSource | LoadSource[],
  deps: LoadDeps,
  deliver: (outcome: LoadOutcome) => void,
): Promise<void> {
  const token = gate.next();
  const outcome = await routeLoad(source, deps);
  if (gate.isLatest(token)) deliver(outcome);
}
