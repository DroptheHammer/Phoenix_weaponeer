import type { FragOrdersData, FragOrdersPlayerGroup } from '../types';

/**
 * The notes a mission starts with when it is imported from FragOrders.
 *
 * A link import also records the mission's title and the link it came from, so
 * a planner can go back to the frag order. The title is the publisher's text;
 * it only ever appears as plain text.
 *
 * The threat count leaves out every threat the mission author hid, whatever
 * Settings reveals at the time: the note is saved with the mission and goes
 * into the brief pack, where nobody's switches apply, so counting hidden
 * threats would tell any later reader that some were withheld, and how many.
 */
export function importNotes(
  data: FragOrdersData,
  group: FragOrdersPlayerGroup,
): string {
  const from = data.source
    ? `Imported from FragOrders link: ${data.source.title ?? 'untitled mission'}\n${data.source.link}`
    : 'Imported from FragOrders';
  const unhidden = data.threats.filter((t) => !t.hidden_on_planner && !t.hidden_on_map);
  const identified = unhidden.filter((t) => t.system_id !== null).length;
  return `${from}\nAircraft: ${group.aircraft_type}\nThreats detected: ${unhidden.length} (${identified} identified)`;
}
