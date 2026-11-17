import type { Attack } from '../../types/attack.types';
import type { FragOrdersPlayerGroup } from '../../types/fragorders.types';
import type { FlightRole } from '../../types/flight.types';
import { importedMemberCallsign } from '../callsign';
import { PROFILE_LABELS } from '../profileLabels';
import type { MissionSummary } from './missionSummary';

/**
 * One jet card: callsign and role, then QTY / STORE one store a line, and on
 * the Flight overview a foot with the jet's attack. The same model feeds the
 * "Choose your flight" step (from the FragOrders group, no foot) and the
 * overview (from the open mission), so the two screens share one component.
 */

export interface JetStoreLine {
  quantity: number;
  name: string;
  /** false: not in the weapon table (amber, "Not in the weapon table"). null: the table has not loaded yet. */
  known: boolean | null;
}

export interface JetFoot {
  state: 'planned' | 'none' | 'noag';
  /** "#1 · T+0s" (the T+ only for a strike's jet), or null. */
  lead: string | null;
  /** "Maverick 8k level", or the profile type's name. */
  profile: string | null;
  estimated: boolean;
  /** Attacks of this jet beyond the first. */
  more: number;
}

export interface JetCardModel {
  key: string;
  position: number;
  callsign: string;
  role: string;
  stores: JetStoreLine[];
  foot?: JetFoot;
}

/** The roster's own words (FlightRoster.tsx ROLE_LABELS). */
export const ROLE_WORDS: Record<FlightRole, string> = {
  flight_lead: 'Flight Lead',
  element_lead: 'Element Lead',
  wingman: 'Wingman',
};

/** How many jets an import keeps (missionStore.ts `units.slice(0, 4)`). */
export const IMPORTED_JETS = 4;

/** The step's cards: the first four jets as the import will make them (jet 1 leads, the rest are wingmen; callsigns by the import's own rule). */
export function jetCardsFromGroup(group: FragOrdersPlayerGroup): JetCardModel[] {
  return group.units.slice(0, IMPORTED_JETS).map((unit, i) => ({
    key: `u${i}`,
    position: i + 1,
    callsign: importedMemberCallsign(group.callsign, unit.callsign, i),
    role: i === 0 ? ROLE_WORDS.flight_lead : ROLE_WORDS.wingman,
    stores: (unit.loadout ?? []).map((s) => ({ quantity: s.quantity, name: s.name, known: s.weapon_id !== null })),
  }));
}

/** The overview's cards, from the summary's jets and the mission's own attacks. */
export function jetCardsFromMission(
  summary: Pick<MissionSummary, 'flights'>,
  attacks: Pick<Attack, 'id' | 'attackerId' | 'sequenceNumber' | 'strikeId' | 'totOffset_s' | 'sourceProfileName' | 'profileType' | 'estimated'>[],
): JetCardModel[] {
  return summary.flights.map((jet) => {
    const own = attacks
      .filter((a) => a.attackerId === jet.memberId)
      .sort((a, b) => (Number.isFinite(a.sequenceNumber) ? a.sequenceNumber : 1e9) - (Number.isFinite(b.sequenceNumber) ? b.sequenceNumber : 1e9));
    const first = own[0];
    const foot: JetFoot = first
      ? {
          state: 'planned',
          lead: `#${Number.isFinite(first.sequenceNumber) ? first.sequenceNumber : 0}${first.strikeId ? ` · T+${first.totOffset_s ?? 0}s` : ''}`,
          profile: first.sourceProfileName ?? PROFILE_LABELS[first.profileType] ?? null,
          estimated: Boolean(first.estimated),
          more: own.length - 1,
        }
      : { state: jet.loadout.length > 0 ? 'none' : 'noag', lead: null, profile: null, estimated: false, more: 0 };
    return {
      key: jet.memberId,
      position: jet.position,
      callsign: jet.callsign,
      role: ROLE_WORDS[jet.role] ?? jet.role,
      stores: jet.loadout,
      foot,
    };
  });
}

/** "2 of 4 planned · 2 cards ready": a jet is planned with any attack, and its card is ready when one of its attacks is not blocked. */
export function readinessOf(summary: Pick<MissionSummary, 'flights' | 'attacks'>): { planned: number; cardsReady: number; jets: number } {
  const blocked = new Set(summary.attacks.filter((a) => a.status === 'blocked').map((a) => a.id));
  let planned = 0;
  let cardsReady = 0;
  for (const jet of summary.flights) {
    if (jet.attackIds.length > 0) planned += 1;
    if (jet.attackIds.some((id) => !blocked.has(id))) cardsReady += 1;
  }
  return { planned, cardsReady, jets: summary.flights.length };
}
