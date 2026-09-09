import type { Attack, ThreatInstance, Waypoint } from '../types';
import type { DisplayFilter } from '../stores/uiStore';

export interface DisplayFilterable {
  attacks: Attack[];
  threats: ThreatInstance[];
  waypoints: Waypoint[];
}

/**
 * Pure map-display filter: which attacks, threats and waypoints get DRAWN.
 *
 * This is a view-time concern only. Callers that need the full mission data
 * regardless of what's on screen — `MapController`/`FocusController`'s camera
 * fit, `autoBuildAttack`'s `inferIp` walking `mission.waypoints` — must keep
 * using the unfiltered arrays and never pass a result of this function to them.
 *
 * Each field is filtered independently: hiding the route does not touch
 * threats or attacks, hiding a threat source does not touch waypoints, etc.
 */
export function applyDisplayFilter(
  { attacks, threats, waypoints }: DisplayFilterable,
  filter: DisplayFilter,
): DisplayFilterable {
  return {
    attacks: attacks.filter((a) => !filter.hiddenAttackerIds.includes(a.attackerId)),
    threats: threats.filter((t) => !filter.hiddenThreatSources.includes(t.source)),
    waypoints: filter.routeHidden ? [] : waypoints,
  };
}
