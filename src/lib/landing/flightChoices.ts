import type { FragOrdersPlayerGroup } from '../../types/fragorders.types';
import { flightGroupOf, formatCallsign } from '../callsign';
import { normalizeAircraftType } from '../../stores/missionStore';

/**
 * The "Choose your flight" step's list: every player flight in the mission,
 * grouped under its aircraft, in the order the mission lists them. Nothing is
 * refused: a flight of an aircraft the app has no delivery profiles for is
 * listed and can be picked, with a note (warn, do not block).
 */

export interface FlightChoice {
  /** The group's index in data.player_groups: what the import is handed. */
  index: number;
  /** "Venom 1". */
  label: string;
  /** All the group's jets; the import keeps the first four. */
  jets: number;
  aircraftId: string;
  aircraftName: string;
  /** null while the profile library has not loaded: nothing is said either way. */
  hasProfiles: boolean | null;
}

export interface FlightTypeGroup {
  aircraftId: string;
  aircraftName: string;
  hasProfiles: boolean | null;
  flights: FlightChoice[];
}

/** "Venom 1" from the lead's "Venom11 1-1" or "Venom 1-1"; the group's name when the callsign says nothing. */
export function flightLabelOf(group: Pick<FragOrdersPlayerGroup, 'callsign' | 'name'>, index: number): string {
  const call = flightGroupOf(formatCallsign((group.callsign ?? '').trim()));
  return call || (group.name ?? '').trim() || `Flight ${index + 1}`;
}

export function flightChoices(
  groups: FragOrdersPlayerGroup[],
  aircraft: ReadonlyArray<{ id: string; name: string }>,
  /** Aircraft ids the profile library has at least one profile for; null while it loads. */
  profileAircraftIds: ReadonlySet<string> | null,
): FlightTypeGroup[] {
  const byType = new Map<string, FlightTypeGroup>();
  groups.forEach((group, index) => {
    const aircraftId = normalizeAircraftType(group.aircraft_type);
    const aircraftName = aircraft.find((a) => a.id === aircraftId)?.name ?? group.aircraft_type;
    const hasProfiles = profileAircraftIds ? profileAircraftIds.has(aircraftId) : null;
    const type = byType.get(aircraftId) ?? { aircraftId, aircraftName, hasProfiles, flights: [] };
    type.flights.push({ index, label: flightLabelOf(group, index), jets: group.units.length, aircraftId, aircraftName, hasProfiles });
    byType.set(aircraftId, type);
  });
  return [...byType.values()];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * The filter: every word typed must match. A number ("4", "11") matches the
 * callsign's own number as a prefix, so "4" finds Jester 4 and not every F-4 or
 * F-14. Any other word matches the callsign plus the aircraft's name and id,
 * letters and digits only, so "f16", "F-16C", "hornet" and "venom 1" all work.
 */
export function flightMatches(choice: Pick<FlightChoice, 'label' | 'aircraftName' | 'aircraftId'>, query: string): boolean {
  const tokens = query.split(/\s+/).map(norm).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = norm(`${choice.label} ${choice.aircraftName} ${choice.aircraftId}`);
  const num = /(\d+)\s*$/.exec(choice.label)?.[1] ?? '';
  return tokens.every((t) => (/^\d+$/.test(t) ? num.startsWith(t) : hay.includes(t)));
}

/** The groups with only the matching flights, empty groups dropped. */
export function filterChoices(types: FlightTypeGroup[], query: string): FlightTypeGroup[] {
  return types
    .map((t) => ({ ...t, flights: t.flights.filter((f) => flightMatches(f, query)) }))
    .filter((t) => t.flights.length > 0);
}
