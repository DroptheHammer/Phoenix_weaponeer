import type { Mission } from '../../types/mission.types';
import { flightGroupOf, formatCallsign } from '../callsign';

/**
 * "Venom 1" and "4 × F-16C Viper" (or "3 jets · F-16C Viper, F/A-18C Hornet"), from the jets in position
 * order; the mission's name when it has no jets. Its own small module because the header shows it on every
 * screen, and the rest of the overview loads only when the overview opens.
 */
export function flightTitle(
  mission: Pick<Mission, 'name' | 'flightMembers'>,
  aircraft: ReadonlyArray<{ id: string; name: string }>,
): { flight: string; jetsLine: string } {
  const jets = [...mission.flightMembers].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  if (jets.length === 0) return { flight: mission.name, jetsLine: '' };
  const names = [...new Set(jets.map((j) => aircraft.find((a) => a.id === j.aircraftId)?.name ?? j.aircraftId))];
  const n = jets.length;
  return {
    flight: flightGroupOf(formatCallsign(jets[0].callsign)),
    jetsLine: names.length === 1 ? `${n} × ${names[0]}` : `${n} jets · ${names.join(', ')}`,
  };
}
