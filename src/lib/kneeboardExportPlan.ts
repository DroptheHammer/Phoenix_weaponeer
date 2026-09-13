import type { Attack } from '../types/attack.types';
import type { FlightMember } from '../types/flight.types';

/** The slice of an aircraft database row that kneeboard export needs. */
export interface AircraftFolderInfo {
  id: string;
  name: string;
  /** The database's guess at the DCS kneeboard folder name — only ever aims the picker. */
  kneeboard_path: string;
}

export interface AircraftExportGroup {
  aircraftId: string;
  attacks: Attack[];
}

/**
 * Cards grouped by the attacker's aircraft type, in the order each type first
 * appears. Each type goes to its own kneeboard folder — an A-10's cards in an
 * F-16 folder are cards DCS never shows the A-10 pilot. Attacks whose pilot has
 * left the flight come back separately rather than going anywhere.
 */
export function groupAttacksByAircraft(mission: { attacks: Attack[]; flightMembers: FlightMember[] }): {
  groups: AircraftExportGroup[];
  orphans: Attack[];
} {
  const groups: AircraftExportGroup[] = [];
  const orphans: Attack[] = [];
  for (const attack of mission.attacks) {
    const aircraftId = mission.flightMembers.find((m) => m.id === attack.attackerId)?.aircraftId;
    if (!aircraftId) {
      orphans.push(attack);
      continue;
    }
    const group = groups.find((g) => g.aircraftId === aircraftId);
    if (group) group.attacks.push(attack);
    else groups.push({ aircraftId, attacks: [attack] });
  }
  return { groups, orphans };
}

/**
 * `name`, or `name_2.png`, `name_3.png`… — the first one not yet taken in this
 * export, which it then marks taken. Two attacks by the same pilot on the same
 * target used to share a filename, so the second card silently replaced the
 * first. Compared case-insensitively, because Windows and macOS folders are.
 */
export function claimFilename(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem}_${n}${extension}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** A readable name and a folder hint for an aircraft type, even one the database does not know. */
export function aircraftFolderInfo(aircraftId: string, aircraft: AircraftFolderInfo[]): { name: string; folderHint: string } {
  const row = aircraft.find((a) => a.id === aircraftId);
  return { name: row?.name || aircraftId, folderHint: row?.kneeboard_path || aircraftId };
}
