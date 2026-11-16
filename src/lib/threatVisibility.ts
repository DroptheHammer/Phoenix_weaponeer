import type { FragOrdersThreat, ThreatInstance, ThreatSource } from '../types';

/**
 * Enemy threats the mission author hid.
 *
 * DCS lets the author hide a group on the F10 map (`hidden`) and on the
 * mission planner (`hiddenOnPlanner`). Either one hides the threat here, from
 * everything: the map, the threat list, the threat-aware attack geometry and
 * the kneeboard card. Otherwise a geometry choice or a card would give the
 * position away. Nor does the planner say that any are hidden, how many, or
 * of what kind: no count, no summary, and totals count only what is shown.
 *
 * ⚙ Settings → Admin can reveal each kind, and a revealed threat behaves like
 * any other. A threat hidden both ways needs both switches.
 *
 * This hides positions in the planner, nothing more: the mission file itself
 * still holds them.
 */

/** Which author-hidden threats are revealed. Both false unless an admin switch is on. */
export interface HiddenReveal {
  onPlanner: boolean;
  onMap: boolean;
}

/** The two author flags, as carried on a saved threat. Absent means not hidden. */
export interface HideFlags {
  hiddenOnPlanner?: boolean;
  hiddenOnMap?: boolean;
}

/** True when the mission author hid this threat either way. */
export const isHiddenByAuthor = (threat: HideFlags): boolean =>
  Boolean(threat.hiddenOnPlanner || threat.hiddenOnMap);

/** True when this planner may see the threat: every hide flag it carries is revealed. */
export function isThreatVisible(threat: HideFlags, reveal: HiddenReveal): boolean {
  if (threat.hiddenOnPlanner && !reveal.onPlanner) return false;
  if (threat.hiddenOnMap && !reveal.onMap) return false;
  return true;
}

/**
 * The mission with only the threats this planner may see. Returns the same
 * object when nothing is hidden, so memoised consumers do not rebuild.
 */
export function visibleMission<M extends { threats: ThreatInstance[] }>(mission: M, reveal: HiddenReveal): M {
  const threats = mission.threats.filter((threat) => isThreatVisible(threat, reveal));
  return threats.length === mission.threats.length ? mission : { ...mission, threats };
}

/** What the planner's threat list shows, worked out from the whole mission. */
export interface ThreatListView<T> {
  fromMission: T[];
  planning: T[];
  /** The line under the list's title, e.g. "3 threats (2 from mission, 1 planning)". */
  summary: string;
  /** Nothing to list: the list says "No threats identified." */
  empty: boolean;
}

/**
 * The threat list as this planner sees it. A mission whose threats are all
 * hidden reads exactly like a mission with none, so nothing gives them away.
 */
export function threatListView<T extends HideFlags & { source: ThreatSource }>(
  threats: T[],
  reveal: HiddenReveal,
): ThreatListView<T> {
  const shown = threats.filter((threat) => isThreatVisible(threat, reveal));
  const fromMission = shown.filter((threat) => threat.source === 'mission');
  const planning = shown.filter((threat) => threat.source === 'planning');
  return {
    fromMission,
    planning,
    summary: `${shown.length} threats (${fromMission.length} from mission, ${planning.length} planning)`,
    empty: shown.length === 0,
  };
}

/** The importer's snake_case flags, in the shape the visibility rule reads. */
export const importFlagsOf = (threat: Pick<FragOrdersThreat, 'hidden_on_planner' | 'hidden_on_map'>): HideFlags => ({
  hiddenOnPlanner: threat.hidden_on_planner,
  hiddenOnMap: threat.hidden_on_map,
});

type ImportThreat = Pick<FragOrdersThreat, 'hidden_on_planner' | 'hidden_on_map' | 'system_id' | 'unit_type'>;

/** What the import preview says about threats, worked out before anything is imported. */
export interface ImportThreatView<T> {
  /** The rows the preview lists, and the number in its "Threats (N)" heading. */
  shown: T[];
  /** Shown threats matched to a database row. */
  identified: number;
  /** Shown threats with no database row. */
  unidentified: number;
  /** The DCS unit types of those, for the warning that they will not be imported. */
  unmatchedTypes: string[];
  /** The importer's notices (a link carrying no air defences), only when nothing is listed. */
  notices: string[];
  /** Nothing listed and no notice: the preview says "No threats detected in mission." */
  noneDetected: boolean;
}

/**
 * The import preview's threat section as this planner sees it. Every figure
 * and line comes from the threats shown, so a mission whose threats are all
 * hidden previews exactly like a mission with none.
 */
export function importThreatView<T extends ImportThreat>(
  data: { threats: T[]; notices: string[] },
  reveal: HiddenReveal,
): ImportThreatView<T> {
  const shown = data.threats.filter((threat) => isThreatVisible(importFlagsOf(threat), reveal));
  const unmatched = shown.filter((threat) => threat.system_id === null);
  const notices = shown.length === 0 ? data.notices : [];
  return {
    shown,
    identified: shown.length - unmatched.length,
    unidentified: unmatched.length,
    unmatchedTypes: [...new Set(unmatched.map((threat) => threat.unit_type))],
    notices,
    noneDetected: shown.length === 0 && notices.length === 0,
  };
}
