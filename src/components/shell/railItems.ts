import type { TabItem } from '../ui/Tabs';

/** The planner's five panels: the desktop rail and the phone's bottom bar open the same ones. */
export type PanelType = 'waypoints' | 'threats' | 'flight' | 'attacks' | 'kneeboards';

/** The side panel's title on the desktop (the words the rail uses). */
export const PANEL_TITLES: Record<PanelType, string> = {
  waypoints: 'Waypoints',
  threats: 'Threats',
  flight: 'Flight',
  attacks: 'Attacks',
  kneeboards: 'Kneeboards',
};

/**
 * What the rail counts. `visibleThreats` is the visible mission's count (useVisibleMission):
 * threats the mission author hid are never counted unless revealed in Settings › Admin.
 * `hiddenAttacks` are attacks whose jet the Legend hides (a display filter, not a secret).
 */
export interface RailCounts {
  waypoints: number;
  visibleThreats: number;
  flightMembers: number;
  attacks: number;
  hiddenAttacks: number;
}

const hiddenNote = (n: number) => (n > 0 ? `${n} hidden` : undefined);

/** The desktop rail: "Waypoints (5)", "Threats (2)", "Flight (4)", "Attacks (2 · 1 hidden)", "Kneeboards". */
export function plannerRailItems(c: RailCounts): TabItem<PanelType>[] {
  return [
    { id: 'waypoints', label: 'Waypoints', icon: 'route', count: c.waypoints },
    { id: 'threats', label: 'Threats', icon: 'threat', count: c.visibleThreats },
    { id: 'flight', label: 'Flight', icon: 'flight', count: c.flightMembers },
    { id: 'attacks', label: 'Attacks', icon: 'attack', count: c.attacks, note: hiddenNote(c.hiddenAttacks) },
    { id: 'kneeboards', label: 'Kneeboards', icon: 'card' },
  ];
}

/** The phone's bottom bar: the same panels under the phone's own words (Route, Cards). */
export function phoneTabItems(c: RailCounts): TabItem<PanelType>[] {
  return [
    { id: 'waypoints', label: 'Route', icon: 'route', count: c.waypoints },
    { id: 'threats', label: 'Threats', icon: 'threat', count: c.visibleThreats },
    { id: 'flight', label: 'Flight', icon: 'flight', count: c.flightMembers },
    { id: 'attacks', label: 'Attacks', icon: 'attack', count: c.attacks, note: hiddenNote(c.hiddenAttacks) },
    { id: 'kneeboards', label: 'Cards', icon: 'card' },
  ];
}
