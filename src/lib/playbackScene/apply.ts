/**
 * What "Apply" does with the times set on the lanes, and what playback says
 * afterwards. Pure: the view hands the numbers over and shows the words, and
 * geo-check holds the numbers against the planner's own way of saving a strike.
 *
 * The cards number a strike's jets by their order over the target (time over
 * target, then flight position, then the attack's own number), not by the seats
 * playback opened with. So an Apply can leave the cards numbering a jet
 * differently, and playback says so rather than renumbering under the pilot.
 */

import { delaysToOffsets, type StrikePlayback } from '../playback';
import type { ApplyStatus } from './session';

/** A time is written to a thousandth of a second: no 0.1 + 0.2 noise reaches a saved plan (the attack list prints its offsets raw). */
const toMs = (s: number) => Math.round(s * 1000) / 1000 + 0; // + 0 turns a −0 into 0

/**
 * The editor's Apply: each member's time over target less the first member's, in member (the editor's) order.
 * The editor counts every time from its lead, whose own is always 0; a wingman moved ahead of the lead comes
 * out negative, and the save then re-bases the strike on whoever is first.
 */
export function editorOffsets(memberIds: readonly string[], delays: Readonly<Record<string, number>>): number[] {
  const lead = delays[memberIds[0]];
  return memberIds.map((id) => toMs(delays[id] - lead));
}

/**
 * The attack list's Apply: every member's time over target (a member not flown included) less the earliest,
 * by attack id, to a thousandth of a second. The plan counts from whoever is first over the target, and a
 * time moved ahead of the lead makes that jet the lead; the plan's own re-base then finds nothing more to do.
 */
export function planOffsets(pb: StrikePlayback, delays: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(Object.entries(delaysToOffsets(pb, { ...delays })).map(([id, s]) => [id, toMs(s)]));
}

/**
 * How far an Apply moves the strike's clock, so the times Reset goes back to, and the playhead, stay on the
 * same moments of the strike. The editor counts from its first member; the plan counts from whoever is first
 * over the target (what the planner's own re-base does), skipped members included.
 */
export function applyShift(to: ApplyStatus['to'], memberIds: readonly string[], delays: Readonly<Record<string, number>>): number {
  const times = memberIds.map((id) => delays[id]);
  if (to === 'editor') return times[0] ?? 0;
  return times.length ? Math.min(...times) : 0;
}

/**
 * The members, by index, in the order the cards will number them: time over target, then the flight position
 * (`tie[i][0]`), then the attack's own number (`tie[i][1]`). Give it the times as they will be written.
 */
export function cardOrder(delays: readonly number[], tie: readonly (readonly [number, number])[]): number[] {
  return delays.map((_, i) => i).sort((a, b) => delays[a] - delays[b] || tie[a][0] - tie[b][0] || tie[a][1] - tie[b][1]);
}

/** [seat, card index] (both from 0) for every seat the cards will number differently, in card order. */
export function renumbered(order: readonly number[]): [number, number][] {
  return order.flatMap((seat, card): [number, number][] => (seat === card ? [] : [[seat, card]]));
}

/** One seat the cards will number differently, as it is said: "#3 Viper 1-3 as #2" (the card index counts from 0). */
export function renumberedText(label: string, callsign: string | undefined, card: number): string {
  return `${label}${callsign ? ` ${callsign}` : ''} as #${card + 1}`;
}

/** "a", "a and b", "a, b and c". */
const sayList = (items: readonly string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** The Apply button's label and tooltip, for where the times go. */
export const APPLY_WORDS = {
  editor: { label: 'Apply to strike', title: "Write these times into the strike you're editing. Save the strike to keep them." },
  mission: { label: 'Apply to plan', title: 'Write these times into the plan and the cards.' },
} as const;

/** What playback says once the times are applied, a sentence a line, until they next change. */
export function applyStatusLines(st: ApplyStatus): string[] {
  const keep = 'Playback keeps the numbers it opened with.';
  if (st.to === 'editor') {
    return [
      'Applied to the strike in the editor. Save the strike to keep it; Cancel throws it away.',
      'Moving “Spacing over the target” on the Group tab spaces the jets evenly again and replaces these times.',
      ...(st.renumbered.length ? [`When you save, the cards will number jets in their order over the target: ${sayList(st.renumbered)}. ${keep}`] : []),
    ];
  }
  return [
    'Applied to the plan: the cards now use these times. To take it back, close playback and press Undo (⌘Z / Ctrl+Z), once for each Apply.',
    ...(st.renumbered.length ? [`The cards number jets in their order over the target, so they now have ${sayList(st.renumbered)}. ${keep}`] : []),
  ];
}
