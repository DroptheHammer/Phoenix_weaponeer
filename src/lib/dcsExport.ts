import { invoke } from '@tauri-apps/api/core';

/**
 * Get DCS kneeboard folder path for a specific aircraft
 * Returns full path like: C:\Users\...\Saved Games\DCS\Kneeboard\F-16C
 */
export async function getDcsKneeboardPath(
  aircraftKneeboardPath: string
): Promise<string | null> {
  try {
    const dcsBasePath = await invoke<string | null>('detect_dcs_folder');
    if (!dcsBasePath) return null;

    // Build full path: {DCS}/Kneeboard/{aircraft}/
    return `${dcsBasePath}/Kneeboard/${aircraftKneeboardPath}`;
  } catch (error) {
    console.error('Failed to detect DCS folder:', error);
    return null;
  }
}

/**
 * Get aircraft kneeboard path from aircraft ID
 * Maps normalized aircraft IDs to DCS kneeboard folder names
 */
export function getAircraftKneeboardPath(aircraftId: string): string {
  // Mapping from normalized aircraft IDs to DCS kneeboard folder names
  // These match the kneeboard_path field in the aircraft database
  const kneeboardPaths: Record<string, string> = {
    'f16c': 'F-16C',
    'f18c': 'FA-18C',
    'a10c': 'A-10C',
    'f15e': 'F-15E',
  };

  return kneeboardPaths[aircraftId] || aircraftId.toUpperCase();
}
