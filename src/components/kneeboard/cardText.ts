import type { Mission } from '../../types/mission.types';
import type { MapStatus } from '../../lib/renderKneeboardCanvas';

/** "Viper 1-1 → TGT1 (DIVE CCIP)": which card is which, in the picker and under each card. */
export function attackCardLabel(mission: Mission, attackId: string): string {
  const attack = mission.attacks.find((a) => a.id === attackId);
  if (!attack) return attackId;
  const attacker = mission.flightMembers.find((m) => m.id === attack.attackerId);
  const target = mission.waypoints.find((w) => w.id === attack.targetWaypointId);
  const callsign = attacker?.callsign ?? '?';
  const targetName = target?.name ?? '?';
  const profile = attack.profileType.replace(/_/g, ' ').toUpperCase();
  return `${callsign} → ${targetName} (${profile})`;
}

/** The preview's one-line map status, or nothing when there is nothing to say. */
export function previewMapNote(status: MapStatus): string | null {
  if (status === 'unavailable') return 'map unavailable (offline?)';
  if (status === 'partial') return 'map incomplete';
  return null;
}

/** Appended to an export message when a card went out without all of its map. */
export function exportMapNote(statuses: MapStatus[]): string {
  if (statuses.includes('unavailable')) return ' — map tiles unavailable, saved without map';
  if (statuses.includes('partial')) return ' — map incomplete on some cards';
  return '';
}
