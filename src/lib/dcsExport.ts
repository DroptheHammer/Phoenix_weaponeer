import { platform } from '@platform';

/**
 * Where kneeboard cards go in DCS.
 *
 * The app never decides this on its own. DCS installs differ too much — a
 * moved or OneDrive-redirected Saved Games, `DCS.openbeta`, module folder names
 * nobody has checked against a real install — so a detected path is only where
 * the folder picker opens. The folder the user actually picks is remembered per
 * aircraft type in Settings, and used without asking from then on.
 *
 * Desktop only: the web build has no DCS install to write into.
 */

/** Whether a remembered folder is still there (DCS reinstalled or moved means ask again). */
export async function folderStillThere(folder: string): Promise<boolean> {
  try {
    return await platform.folderExists(folder);
  } catch {
    return false;
  }
}

/**
 * Ask for an aircraft type's kneeboard folder. Opens at the current folder when
 * it still exists, otherwise at our best guess, and lets the user go the rest
 * of the way. Resolves `null` when they cancel.
 */
export async function chooseKneeboardFolder(aircraftName: string, folderHint: string, current?: string): Promise<string | null> {
  let defaultPath: string | undefined;
  if (current && (await folderStillThere(current))) {
    defaultPath = current;
  } else {
    try {
      defaultPath = (await platform.suggestKneeboardFolder(folderHint)) ?? undefined;
    } catch {
      defaultPath = undefined;
    }
  }
  return platform.chooseFolder(
    `Kneeboard folder for ${aircraftName} (usually Saved Games/DCS/Kneeboard/${folderHint})`,
    defaultPath,
  );
}
