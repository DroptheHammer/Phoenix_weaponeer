/**
 * The blast rule's words, each written once: the warning and its tooltip, the
 * gray notes, the footer's all-clears, the stripes' and the chip's titles, the
 * swatch and diamond sentences, and the choice between the two rules. The
 * spacing rule keeps its own words where they always were (strike.ts, the
 * lanes, the footer), chosen by the rule, so no sentence is written twice.
 *
 * Every blast number carries "(est.)": the radii come from a test judged by
 * eye, not from the game's own figures. Distances read in whole tens of feet,
 * rounded down, so a jet inside a 360 ft radius never reads "360 ft".
 */

import type { DbWeapon } from '../../types';
import type { BlastMeaning, BlastSource } from '../../types/weapon.types';
import { weaponClassOf } from '../weaponClass';
import type { TimedBurst } from './types';

const num = (x: number) => x.toLocaleString('en-US');
/** A distance as the words print it: floored to the nearest 10 ft. */
const tens = (ft: number) => num(Math.floor(ft / 10) * 10);
const whole = (ft: number) => num(Math.round(ft));

/** What a weapon's burst is called: a missile for the guided missiles and stand-off weapons, a bomb for the rest. */
export function burstNoun(w: Pick<DbWeapon, 'category' | 'guidance' | 'name'> | undefined): 'bomb' | 'missile' {
  return w && weaponClassOf(w) === 'agm' ? 'missile' : 'bomb';
}

/** "#1", "#1 and #2", "#1, #2 and #3". */
export function seatList(seats: readonly string[]): string {
  return seats.length <= 1 ? (seats[0] ?? '') : `${seats.slice(0, -1).join(', ')} and ${seats[seats.length - 1]}`;
}

/** The warning: in the strip, the footer and the chip's tooltip. */
export function burstSentence(c: TimedBurst, noun: 'bomb' | 'missile' = 'bomb'): string {
  return `${c.second} is ${tens(c.dist_ft)} ft from ${c.first}'s ${noun} when it goes off, inside its ${whole(c.radius_ft)} ft blast radius (est.)`;
}

const MEANING_WORDS: Record<BlastMeaning, string> = {
  destroyed: 'did not destroy the target',
  any_damage: 'did no visible damage',
};

/** Where a radius comes from, in words. */
export const SOURCE_WORDS: Record<BlastSource, string> = {
  community_measurement: 'a community test, judged by eye',
  owner_test: "the squadron's own test in DCS",
  game_data: "the game's own data",
  developer: "a statement by the game's developer",
  scripting_doc: 'the scripting documentation',
  estimate: 'an estimate',
};

/** The warning's tooltip: what the radius is, where it comes from, and what the check leaves out. */
export function burstSourceTitle(c: Pick<TimedBurst, 'radius_ft' | 'meaning' | 'source'>, noun: 'bomb' | 'missile' = 'bomb'): string {
  return `Blast radius ${whole(c.radius_ft)} ft (past it, a ${noun} of this kind ${MEANING_WORDS[c.meaning]}; source: ${SOURCE_WORDS[c.source]}). ` +
    'Distance only: hills in the way are not counted, so this can warn where DCS would not. ' +
    "It uses the planner's lines, not the smoothed 3D jets, so a jet can look a little outside when it is inside.";
}

/** The time bar's stripe and the seat's warning mark. */
export const burstBandTitle = (c: Pick<TimedBurst, 'first' | 'second'>) => `⚠ ${c.second} inside ${c.first}'s blast radius when it goes off (est.)`;

/** A lane's stripe: the times over target of `meLabel` that would put it inside `againstLabel`'s blast radius, or put `againstLabel` inside its own. */
export function burstZoneTitle(role: 'victim' | 'bomb', againstLabel: string, meLabel: string): string {
  return role === 'victim'
    ? `Inside ${againstLabel}'s blast radius if ${meLabel} is over the target here (est.)`
    : `Puts ${againstLabel} inside ${meLabel}'s blast radius if ${meLabel} is over the target here (est.)`;
}

/** The chip over the picture at a burst (the chip adds its own "(+n more)"). */
export const burstChipText = (c: Pick<TimedBurst, 'first' | 'second'>) => `⚠ ${c.second} inside ${c.first}'s blast radius (est.)`;

/** The gray note for a weapon no blast radius is on file for, with the seats that carry it. */
export function noRadiusNote(weaponName: string, seats: readonly string[], noun: 'bomb' | 'missile' = 'bomb'): string {
  const one = seats.length === 1;
  return `No blast radius on file for ${weaponName} (${seatList(seats)}): ${one ? `its ${noun} isn't` : `their ${noun}s aren't`} checked against the other jets`;
}

/** The gray note for a member the playback cannot fly. */
export const notFlownNote = (seatLabel: string) => `${seatLabel} isn't flown in 3D, so neither its jet nor its bomb is checked for blast`;

/** The footer's all-clear: names what was not checked, or says every distance was. */
export function footerOkBurst(unchecked: readonly string[]): string {
  return unchecked.length
    ? `✓ No blast warnings at these times. Not checked for blast: ${seatList(unchecked)} (no blast radius on file).`
    : '✓ No blast warnings at these times.';
}

/** The footer all-clear's tooltip when every weapon was checked. */
export const FOOTER_OK_BURST_TITLE = "Checked: every jet's distance from every other jet's bomb at the moment it goes off (est.). Distance only: hills in the way are not counted.";

/** The swatch that keys the footer's warning to the stripes. */
export const BURST_HATCH_KEY_TITLE = "Striped: a jet is inside another jet's blast radius when a bomb goes off (est.)";

/** What a lane's stripes are, said on its diamond. */
export const BURST_STRIPES_HANDLE_WORDS = "Stripes: times that would put it inside another jet's blast radius, or another jet inside its.";

/** The note that explains the hatching. */
export const BURST_HATCH_NOTE = "Hatched amber on the time bar and the lanes: times when a jet would be inside another jet's blast radius when a bomb goes off (est.).";

/** The note for a member the playback cannot fly. */
export const burstSkipNote = (seatLabel: string, callsign: string | undefined, reason: string) =>
  `${seatLabel}${callsign ? ` ${callsign}` : ''} isn't flown in 3D. ${reason} Its time still counts, but its jet and its bomb aren't checked for blast.`;

/** The strike strip's choice between the two rules. */
export const FRAG_RULE_LABEL = 'Warn by';
export const FRAG_RULE_OPTIONS = {
  burst: 'Blast radius when the bomb goes off (like DCS)',
  time: 'Spacing in time (real-world habit)',
} as const;
export const FRAG_RULE_TITLES = {
  burst: "Warns when a jet is inside a bomb's blast radius at the moment it goes off (est.). Distance only: hills in the way are not counted, so it can warn where DCS would not. The radius is the weapon table's; its source is in the table.",
  time: 'Warns when a jet is over the target within the earlier jet\'s frag clear time (est.). The real-world spacing habit, not what DCS does.',
} as const;
