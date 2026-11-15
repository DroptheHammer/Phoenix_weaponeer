/**
 * What breaks a tie in time over target on the cards, for a strike played from the attack list: the cards
 * number a strike's jets by time over target, then by the flight position of the pilot, then by the number
 * the attack has. Playback takes these to say which jets an Apply leaves numbered differently on the cards.
 * (The attack editor works the same out for its drafts in launch.ts: a draft not saved yet has no number.)
 *
 * Plain TypeScript with no imports of code, so the lazily loaded view and the checks share it.
 */
import type { Mission } from '../../types';

/** [flight position, attack number] for each member id, in the order given (seat order). A pilot with no position goes last, as the cards do. */
export function cardTie(mission: Mission, memberIds: readonly string[]): [number, number][] {
  return memberIds.map((id): [number, number] => {
    const attack = mission.attacks.find((a) => a.id === id);
    const pilot = attack && mission.flightMembers.find((f) => f.id === attack.attackerId);
    return [pilot?.position ?? 9, attack?.sequenceNumber ?? 1e9];
  });
}
