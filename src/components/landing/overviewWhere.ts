import type { Mission } from '../../types/mission.types';
import { editedWhen } from '../../lib/landing/editedWhen';
import { flightTitle } from '../../lib/landing/flightTitle';
import { W } from './words';

/** What the app knows only straight after an import, kept in App state until another mission loads or this one closes. */
export interface ImportContext {
  missionId: string;
  playerFlights: number;
  via: 'link' | 'link-payload' | 'cli-export';
}

/**
 * The header's "where you are" on the Flight overview (the desktop header's lead; the phone's two-line title):
 * title "Venom 1", beside it "4 × F-16C Viper", under it "{mission name} · Nevada (NTTR) · FragOrders link ·
 * edited today, 14:20" ("FragOrders link" only straight after a link import: a saved mission keeps no source).
 * Small and loaded at start-up: the rest of the overview loads only when it opens.
 */
export function overviewWhere(
  mission: Mission,
  aircraft: ReadonlyArray<{ id: string; name: string }>,
  importContext: ImportContext | null,
  theaterName: string,
  now: Date,
): { title: string; aircraft: string; sub: string } {
  const { flight, jetsLine } = flightTitle(mission, aircraft);
  const fromLink = importContext?.missionId === mission.id && importContext.via === 'link';
  const when = editedWhen(mission.updatedAt, now);
  const sub = [mission.name, theaterName, fromLink ? W.sourceLink : null, when ? W.edited(when) : null].filter(Boolean).join(' · ');
  return { title: flight, aircraft: jetsLine, sub };
}
