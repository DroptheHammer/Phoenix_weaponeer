import { aircraftFolderInfo, claimFilename, type AircraftFolderInfo } from './kneeboardExportPlan';
import { zipStore, type ZipEntry } from './zip';

/** One rendered card on its way into the pack. */
export interface PackCard {
  aircraftId: string;
  /** e.g. `Viper_1-1_TGT_5.png`; made unique within its folder here. */
  filename: string;
  png: Uint8Array;
}

/** A name safe as a file name on Windows, macOS and Linux. */
function safeName(name: string, fallback: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');
  return cleaned || fallback;
}

/** `<mission>_brief_pack.zip`. */
export function briefPackFilename(missionName: string): string {
  return `${safeName(missionName, 'mission')}_brief_pack.zip`;
}

const README = `Phoenix Weaponeer - brief pack

Kneeboard/    Each aircraft type's cards, in a folder named the way DCS names it.
              Copy the folders inside Kneeboard/ into
              Saved Games/DCS/Kneeboard/ (or Saved Games/DCS.openbeta/Kneeboard/)
              on the PC you fly on. Merge with the folders already there.
*.json        The mission file. Open it in Phoenix Weaponeer to see or change the plan.
`;

/**
 * The files of a brief pack, laid out for Saved Games: every card under
 * `Kneeboard/<DCS aircraft folder>/`, the mission file, and a short README.
 * Two cards that would share a name in one folder get `_2`, `_3`… (as the
 * folder exports do), so none replaces another.
 */
export function briefPackEntries(input: {
  missionName: string;
  /** The mission as it saves to a `.json` file. */
  missionJson: string;
  cards: PackCard[];
  aircraft: AircraftFolderInfo[];
}): ZipEntry[] {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];
  const takenByFolder = new Map<string, Set<string>>();

  for (const card of input.cards) {
    const folder = safeName(aircraftFolderInfo(card.aircraftId, input.aircraft).folderHint, card.aircraftId);
    const taken = takenByFolder.get(folder.toLowerCase()) ?? new Set<string>();
    takenByFolder.set(folder.toLowerCase(), taken);
    entries.push({ path: `Kneeboard/${folder}/${claimFilename(card.filename, taken)}`, data: card.png });
  }

  entries.push({ path: `${safeName(input.missionName, 'mission')}.json`, data: encoder.encode(input.missionJson) });
  entries.push({ path: 'README.txt', data: encoder.encode(README) });
  return entries;
}

export function briefPackZip(input: Parameters<typeof briefPackEntries>[0]): Uint8Array {
  return zipStore(briefPackEntries(input));
}
