import { MAP_CREDIT } from '../map/MapCredit';
import { SIGHT_SOURCES } from '../../lib/sightTables';

/**
 * What the About dialog says, as data. The dialog draws the list and knows no entry by name, so a
 * source is added here and nowhere else. Loaded with the dialog, on demand, never at start-up.
 */

export const APP_NAME = 'Phoenix Weaponeer';
export const ABOUT_TITLE = `About ${APP_NAME}`;
export const COPYRIGHT = '© DroptheHammer';
export const LICENCE_NAME = 'PolyForm Strict License 1.0.0';
/** What the licence means, in the words of the README's License section. */
export const LICENCE_PLAIN =
  'Free to download and use for any noncommercial purpose, and to read the source. Not to be used commercially, modified, copied into other tools or redistributed without written permission.';
export const CREDITS_HEADING = 'Credits and sources';

/** The line the dialog shows for the build's version. The number is package.json's, handed in by the build. */
export const versionLine = (version: string) => `Version ${version}`;

export interface CreditEntry {
  /** Stable name for the entry: its React key, and what a check calls it by. */
  key: string;
  /** What the source is. */
  name: string;
  /** Whose it is, as its own page or licence file prints it. */
  owner: string;
  /** Its licence, as its own page or licence file states it. Left out where there is nothing of that kind to quote. */
  licence?: string;
  /** One line: what the app takes from it. */
  takes: string;
}

// The map's owner is the credit line drawn on the map itself, so the two cannot drift apart.
const MAP: CreditEntry = {
  key: 'map',
  name: 'Map data',
  owner: MAP_CREDIT,
  takes: "The map tiles under the planner's maps and behind the kneeboard cards' pictures.",
};

const FIGTREE: CreditEntry = {
  key: 'figtree',
  name: 'Figtree',
  owner: 'The Figtree Project Authors',
  licence: 'SIL Open Font License, Version 1.1',
  takes: "The typeface for the app's text.",
};

const JETBRAINS_MONO: CreditEntry = {
  key: 'jetbrains-mono',
  name: 'JetBrains Mono',
  owner: 'The JetBrains Mono Project Authors',
  licence: 'SIL Open Font License, Version 1.1',
  takes: "The typeface for the app's monospaced text.",
};

const PYDCS: CreditEntry = {
  key: 'pydcs',
  name: 'pydcs',
  owner: 'pydcs',
  licence: 'LGPL-3.0',
  takes: "DCS's own names for weapons and stores, which jet carries what, weapon weights, and airfield names and positions.",
};

const CHUCKS_GUIDES: CreditEntry = {
  key: 'chucks-guides',
  name: "Chuck's Guides",
  owner: "Chuck's Guides (chucksguides.com)",
  takes: "The delivery practice behind each jet's attack profiles, and a cross-check of each jet's weapon list, the Harrier's gun pod included.",
};

/**
 * The sight tables: one entry for each source in the data file the figures are read from, so the file and this
 * list cannot drift apart. The owner is the author as the source's own page gives it, and where it is found.
 * No card names any of them (the owner's ruling, 2026-11-18): this dialog and the read-me are where they are credited.
 */
export const SIGHT_ESTIMATES_NOTE = 'Around its printed figures the app works its own estimates, marked "est."; the source\'s author has not checked those.';
const SIGHT_TABLE_ENTRIES: CreditEntry[] = Object.entries(SIGHT_SOURCES).map(([id, s]) => {
  const where = s.file_no ? `${s.site} no. ${s.file_no}` : s.site;
  return {
    key: `sight-${id}`,
    name: s.title,
    owner: s.author ? `${s.author}, ${where}` : `${where} (the pack names no author)`,
    takes: `${s.takes} ${SIGHT_ESTIMATES_NOTE}`,
  };
});

/**
 * The list, in the order it is shown. `fromPlayback` is what the 3D playback adds (the elevation data, on the desktop build
 * only: the phone has no 3D playback and draws no heights, so its list has no such entry). It stands after the map.
 */
export const creditList = (fromPlayback: readonly CreditEntry[]): CreditEntry[] => [MAP, ...fromPlayback, FIGTREE, JETBRAINS_MONO, PYDCS, CHUCKS_GUIDES, ...SIGHT_TABLE_ENTRIES];

/** The strings of the dialog that are not entries, for the checks that read every word it prints. */
export const ABOUT_WORDS = [APP_NAME, ABOUT_TITLE, COPYRIGHT, LICENCE_NAME, LICENCE_PLAIN, CREDITS_HEADING] as const;
