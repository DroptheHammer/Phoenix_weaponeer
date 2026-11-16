/**
 * A saved mission's strike (or lone attack) as playback input. The strike
 * editor builds `PlaybackInput` from its unsaved drafts itself, with the same
 * fields, so it plays what is on screen.
 */

import type { Attack, DbWeapon, Mission } from '../../types';
import { attackIpAnchor } from '../ipAnchor';
import { attackSpeedOf, strikeFragRule, strikeMembers, strikeOf } from '../strike';
import type { PlaybackInput, PlaybackJetInput, SkippedJet } from './types';

export type PlaybackSubject = { strikeId: string } | { attackId: string };

/**
 * Members in `strikeMembers` order (lead = first on target), labelled #1…#n
 * like the cards, with their raw offsets. A lone attack, an attack whose
 * strikeId dangles, and a one-member strike play as a strike of one at offset
 * 0. An attack in a real strike plays its whole strike. Undefined when the
 * subject does not exist.
 */
export function playbackInputFromMission(mission: Mission, subject: PlaybackSubject, weapons: DbWeapon[]): PlaybackInput | undefined {
  let members: Attack[];
  let strike = 'strikeId' in subject ? strikeOf(mission, subject.strikeId) : undefined;
  if ('strikeId' in subject) {
    if (!strike) return undefined;
    members = strikeMembers(mission, strike.id);
    if (!members.length) return undefined;
  } else {
    const attack = mission.attacks.find((a) => a.id === subject.attackId);
    if (!attack) return undefined;
    strike = strikeOf(mission, attack.strikeId);
    members = strike ? strikeMembers(mission, strike.id) : [attack];
  }
  const asStrike = !!strike && members.length >= 2;
  if (!asStrike && 'attackId' in subject) members = members.filter((a) => a.id === subject.attackId);
  if (!asStrike) members = members.slice(0, 1);

  const callsign = (a: Attack) => mission.flightMembers.find((m) => m.id === a.attackerId)?.callsign;
  const jets: PlaybackJetInput[] = [];
  const skipped: SkippedJet[] = [];
  members.forEach((attack, k) => {
    const label = `#${k + 1}`;
    const totOffset_s = asStrike ? (attack.totOffset_s ?? 0) : 0;
    const target = mission.waypoints.find((wp) => wp.id === attack.targetWaypointId);
    const weapon = weapons.find((w) => w.id === attack.weaponId);
    if (!target) {
      // Still a member: the readout's frag rule needs only its weapon and TOT.
      skipped.push({ id: attack.id, label, reason: 'Its target waypoint is missing.', totOffset_s, weapon, speed_ktas: attackSpeedOf(attack.profile), order: k });
      return;
    }
    jets.push({
      id: attack.id, attack, ipAnchor: attackIpAnchor(mission.waypoints, attack), target,
      weapon, totOffset_s, label, callsign: callsign(attack),
    });
  });
  const lone = members[0];
  return {
    name: asStrike ? strike!.name : `${callsign(lone) ?? 'Attack'} #${lone.sequenceNumber}`,
    strikeId: asStrike ? strike!.id : undefined,
    jets,
    skipped,
    fragRule: strikeFragRule(strike),
  };
}
