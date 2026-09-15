import type { ThreatInstance } from '../types';

/**
 * Enemy threats the mission author hid.
 *
 * DCS lets the author hide a group on the F10 map (`hidden`) and on the
 * mission planner (`hiddenOnPlanner`). Either one hides the threat here, from
 * everything: the map, the threat list, the threat-aware attack geometry and
 * the kneeboard card. Otherwise a geometry choice or a card would give the
 * position away. Planners see only a count by system ("probable threats,
 * location unknown").
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

export interface ProbableThreat {
  /** What the threats were grouped by: a system id, or a system name. */
  key: string;
  count: number;
}

/**
 * The threats this planner may NOT see, counted by `keyOf`. The result carries
 * no positions by construction, only a key and a count. Most numerous first.
 */
export function probableThreats<T extends HideFlags>(
  threats: T[],
  reveal: HiddenReveal,
  keyOf: (threat: T) => string,
): ProbableThreat[] {
  const counts = new Map<string, number>();
  for (const threat of threats) {
    if (isThreatVisible(threat, reveal)) continue;
    const key = keyOf(threat);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** How many threats carry each author flag, for the Admin switches' labels. */
export function hiddenCounts(threats: HideFlags[]): { onPlanner: number; onMap: number; both: number } {
  let onPlanner = 0;
  let onMap = 0;
  let both = 0;
  for (const threat of threats) {
    if (threat.hiddenOnPlanner) onPlanner++;
    if (threat.hiddenOnMap) onMap++;
    if (threat.hiddenOnPlanner && threat.hiddenOnMap) both++;
  }
  return { onPlanner, onMap, both };
}
