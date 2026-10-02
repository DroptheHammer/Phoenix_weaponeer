/**
 * Copy one jet's attack to another member of the flight.
 *
 * Never a raw clone of the saved attack: the profile, the delivery mode and the
 * sight number belong to the aircraft type, so a copy goes back through
 * auto-build for the new pilot and keeps what carries over — the target, the
 * IP and how it is anchored, the flank, the weapon and its release.
 */

import type { Attack } from '../types';
import { loadoutWeapons, weaponChoicesFor } from './autoBuildAttack';
import { isFired, weaponClassOf } from './weaponClass';
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
    // "Has a loadout" means a store the weapon table knows: a jet carrying only
    // unrecognised stores is treated like one with none.
    const hasLoadout = loadoutWeapons(recipient, ctx.weapons).length > 0;
    if (base.weaponId && hasLoadout && !carried.some((w) => w.id === base.weaponId)) {
      notes.push(`${recipient.callsign} is not carrying that weapon; auto-build chose another.`);
      draft = { ...draft, weaponId: '', fuzeId: '' };
    }
  } else {
    // Another airframe: a fresh build for the new pilot, told where the original
    // attack ran in from and what it dropped. The weapon has to be on the new jet's
    // own list (what it carries, or what its aircraft is mapped to): a store the
    // planner reached with "Show all weapons" does not follow to another airframe.
    const onOffer = weaponChoicesFor(recipient, ctx.weapons).some((w) => w.id === base.weaponId);
    // A jet with no loadout has nothing for auto-build to choose instead, so a
    // bomb or missile the table doesn't list for it is kept and flagged: the
    // table may be the one that is wrong. A gun or rockets never transfer.
    const weapon = ctx.weapons.find((w) => w.id === base.weaponId);
    const keptUnlisted =
      !onOffer && !!weapon && !!weaponClassOf(weapon) && !isFired(weaponClassOf(weapon)) &&
      loadoutWeapons(recipient, ctx.weapons).length === 0;
    const weaponOk = onOffer || keptUnlisted;
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
    if (keptUnlisted) {
      notes.push(`The weapon table does not list ${weapon.name} for the ${recipient.aircraftId.toUpperCase()}; kept — check the jet can carry it.`);
    }
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
