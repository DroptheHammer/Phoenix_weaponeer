import type { Mission } from '../../types/mission.types';
import type { WaypointType } from '../../types/waypoint.types';
import { flightTitle } from './flightTitle';
import { visibleMission, type HiddenReveal } from '../threatVisibility';
import { jetCardsFromMission, readinessOf, type JetCardModel } from './jetCards';
import { summarizeMission, type MissionSummary, type SummaryRefs } from './missionSummary';
import { defaultNearWaypoint, nearThreatsAt, threatTotals, waypointShortName, type NearThreats, type ThreatTotals } from './nearThreats';
import { frameAround, type OverviewFrame } from './overviewFrame';

/**
 * Everything the Flight overview shows, from the open mission, in one pure
 * call. The threats come from the visible mission only (the reveal switches
 * of Settings > Admin, applied by threatVisibility.ts), so neither the block,
 * the counts nor the map can hold a threat the planner may not see. The model
 * carries no count, flag or hint of the threats left out.
 */

export interface OverviewWaypoint {
  id: string;
  steerpoint: number;
  /** "TGT1", or "Waypoint 3". */
  short: string;
  type: WaypointType;
  elevation_ft: number;
}

export interface OverviewModel {
  /** "Venom 1". */
  flight: string;
  /** "4 × F-16C Viper", or "3 jets · F-16C Viper, F/A-18C Hornet" for a mixed flight; "" with no jets. */
  jetsLine: string;
  theater: MissionSummary['theater'];
  lastEdited: string | null;
  jets: JetCardModel[];
  readiness: { planned: number; cardsReady: number; jets: number };
  totals: ThreatTotals;
  waypoints: OverviewWaypoint[];
  /** The waypoint the block is about: the one asked for if it exists, else the default. */
  chosen: OverviewWaypoint | null;
  near: NearThreats | null;
  frame: OverviewFrame | null;
  /** What the map draws: every visible threat. */
  mapThreatIds: string[];
}

export function buildOverview(mission: Mission, reveal: HiddenReveal, refs: SummaryRefs, chosenWaypointId: string | null): OverviewModel {
  const summary = summarizeMission(mission, reveal, refs);
  const visible = visibleMission(mission, reveal);
  const threats = visible.threats;
  const jets = jetCardsFromMission(summary, visible.attacks);
  const { flight, jetsLine } = flightTitle(visible, refs.aircraft);

  const waypoints: OverviewWaypoint[] = [...visible.waypoints]
    .sort((a, b) => a.steerpoint - b.steerpoint)
    .map((w) => ({ id: w.id, steerpoint: w.steerpoint, short: waypointShortName(w), type: w.type, elevation_ft: w.elevation_ft }));
  const asked = chosenWaypointId ? visible.waypoints.find((w) => w.id === chosenWaypointId) : undefined;
  const chosenId = asked?.id ?? defaultNearWaypoint(visible.waypoints, visible.attacks, threats, refs.threatSystems);
  const chosenWp = visible.waypoints.find((w) => w.id === chosenId) ?? null;
  const near = chosenWp ? nearThreatsAt(chosenWp, threats, refs.threatSystems) : null;
  // The map frames the rows and every other system in reach ("+ N more in reach"): those are often the
  // long-range SAMs that cover the waypoint, which a planner needs to see.
  const framed = near
    ? [...near.rows.map((r) => ({ systemId: r.systemId, position: r.nearest.position, maxRange_nm: r.maxRange_nm })), ...near.moreInReachSites]
    : [];
  const frame = chosenWp ? frameAround(chosenWp.coordinates, framed) : null;

  return {
    flight,
    jetsLine,
    theater: summary.theater,
    lastEdited: summary.lastEdited,
    jets,
    readiness: readinessOf(summary),
    totals: threatTotals(threats, refs.threatSystems),
    waypoints,
    chosen: waypoints.find((w) => w.id === chosenWp?.id) ?? null,
    near,
    frame,
    mapThreatIds: threats.map((t) => t.id),
  };
}
