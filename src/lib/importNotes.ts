import type { FragOrdersData, FragOrdersPlayerGroup } from '../types';

/**
 * The notes a mission starts with when it is imported from FragOrders.
 *
 * A link import also records the mission's title and the link it came from, so
 * a planner can go back to the frag order. The title is the publisher's text;
 * it only ever appears as plain text.
 */
export function importNotes(
  data: FragOrdersData,
  group: FragOrdersPlayerGroup,
  identifiedThreats: number,
): string {
  const from = data.source
    ? `Imported from FragOrders link: ${data.source.title ?? 'untitled mission'}\n${data.source.link}`
    : 'Imported from FragOrders';
  return `${from}\nAircraft: ${group.aircraft_type}\nThreats detected: ${data.threats.length} (${identifiedThreats} identified)`;
}
