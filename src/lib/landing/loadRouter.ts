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

/**
 * A ticket per load, so a slow answer that arrives after a newer load started
 * (or after the box was closed) can tell it is stale and be ignored.
 */
export function latestGate(): { next(): number; isLatest(token: number): boolean } {
  let latest = 0;
  return {
    next: () => ++latest,
    isLatest: (token) => token === latest,
  };
}
