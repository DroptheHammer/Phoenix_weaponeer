/**
 * Copy one jet's attack to another member of the flight.
 *
 * Never a raw clone of the saved attack: the profile, the delivery mode and the
 * sight number belong to the aircraft type, so a copy goes back through
 * auto-build for the new pilot and keeps what carries over — the target, the
 * IP and how it is anchored, the flank, the weapon and its release.
 */

import type { Attack } from '../types';
import { weaponChoicesFor } from './autoBuildAttack';
import { draftAttackData, draftFromAttack, resolveDraft, setAttacker, type DraftContext } from './attackDraft';

export interface AttackCopy {
  /** Ready for `addAttack`; absent when the copy could not be built (see `problems`). */
  attack?: Omit<Attack, 'id'>;
  /** What the copy did differently from the original, in plain words. */
  notes: string[];
  /** Why there is no copy. */
  problems: string[];
}

export function copyAttackTo(ctx: DraftContext, source: Attack, recipientId: string): AttackCopy {
  const { mission } = ctx;
  const recipient = mission.flightMembers.find((m) => m.id === recipientId);
  const original = mission.flightMembers.find((m) => m.id === source.attackerId);
  if (!recipient) return { notes: [], problems: ['That pilot is not in the flight.'] };

  const notes: string[] = [];
  const base = draftFromAttack(source, mission);
  const sameType = original?.aircraftId === recipient.aircraftId;

  let draft;
  if (sameType) {
    // Same airframe: everything transfers, hand edits included.
    draft = { ...base, attackerId: recipient.id };
    const carried = weaponChoicesFor(recipient, ctx.weapons);
    if (base.weaponId && recipient.loadout?.length && !carried.some((w) => w.id === base.weaponId)) {
      notes.push(`${recipient.callsign} is not carrying that weapon; auto-build chose another.`);
      draft = { ...draft, weaponId: '', fuzeId: '' };
    }
  } else {
    // Another airframe: a fresh build for the new pilot, told where the original
    // attack ran in from and what it dropped.
    const weaponOk = weaponChoicesFor(recipient, ctx.weapons).some((w) => w.id === base.weaponId);
    draft = {
      ...setAttacker(base, recipient.id),
      ipMode: base.ipMode,
      ipWaypointId: base.ipWaypointId,
      customIp: base.customIp,
      angleOffSide: base.angleOffSide,
      releaseQuantity: base.releaseQuantity,
      releaseMode: base.releaseMode,
      ...(weaponOk ? { weaponId: base.weaponId, fuzeId: base.fuzeId } : {}),
    };
    notes.push(`Rebuilt for the ${recipient.aircraftId.toUpperCase()}: its own profile and sight number.`);
    if (!weaponOk) notes.push('That weapon is not on offer to this jet; auto-build chose another.');
  }

  const resolved = resolveDraft(draft, ctx);
  if (!resolved.canSave) {
    const failed = resolved.checks.filter((c) => c.level === 'error').map((c) => c.text);
    return { notes, problems: [...resolved.problems, ...failed] };
  }
  const attack = draftAttackData(draft, resolved, undefined, mission.attacks.length + 1);
  if (!attack) return { notes, problems: ['The copy could not be built.'] };
  // A plain attack: the copy is not part of the original's strike, and
  // keeps no note that was written for the other pilot.
  return { attack: { ...attack, strikeId: undefined, totOffset_s: undefined, notes: undefined }, notes, problems: [] };
}
