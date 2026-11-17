import type { Attack } from '../../types/attack.types';
import type { ThreatInstance, ThreatStatus } from '../../types/threat.types';
import type { Coordinates, Waypoint } from '../../types/waypoint.types';
import type { ThreatSystemInfo } from '../buildKneeboardCard';
import { CARD_THREAT_ROWS, canShoot, compareThreatsForCard } from '../cardThreats';
import { calculateBearing, calculateDistance } from '../coordinates';

/**
 * The threats that matter at one waypoint, for the Flight overview's threat
 * block: the systems that can reach it first, nearest first, then the nearest
 * others within the kneeboard card's own radius. Pure, and it only ever sees
 * the threats it is handed: the caller passes the visible mission's threats
 * (threatVisibility.ts), so a threat the author hid can be neither listed nor
 * counted here.
 *
 * "In reach" is the card's own test (cardThreats.ts canShoot): not an
 * early-warning radar, a range above 0, and the waypoint no farther than the
 * system's max range (horizontal distance only). "Near" is the card's "Threats
 * in area" radius, 60 nm (buildKneeboardCard.ts). One difference from the card,
 * on purpose: a system that can reach the waypoint from beyond 60 nm (an SA-5)
 * is listed here, because a planner wants the threats "covering" the
 * waypoint as well as those near it. The card lists one row per site; this
 * lists one row per system, at its nearest site, with how many of its sites
 * are near or in reach.
 */

/** The card's "Threats in area" radius (buildKneeboardCard.ts, `dist <= 60`). */
export const NEAR_RADIUS_NM = 60;
/** As many rows as the card prints. */
export const NEAR_ROWS = CARD_THREAT_ROWS;

export type ThreatClass = 'SAM' | 'SHORAD' | 'AAA' | 'MANPADS' | 'EWR';
export const THREAT_CLASSES: readonly ThreatClass[] = ['SAM', 'SHORAD', 'AAA', 'MANPADS', 'EWR'];

const isClass = (value: unknown): value is ThreatClass => THREAT_CLASSES.includes(value as ThreatClass);
const isPosition = (p: Coordinates | undefined | null): p is Coordinates =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

export interface ClassTally {
  cls: ThreatClass;
  systems: number;
  threats: number;
}

/** What the whole (visible) mission holds, by class. A threat whose system is not in the reference table is in the totals and in no class. */
export interface ThreatTotals {
  systems: number;
  threats: number;
  classes: ClassTally[];
}

export interface NearRow {
  systemId: string;
  name: string;
  nato: string | null;
  cls: ThreatClass | null;
  inReach: boolean;
  /**
   * The system's nearest site to the waypoint. Bearing is from the waypoint, rounded, as the card prints it.
   * Status is that site's (the card prints "DESTROYED" and the rest beside such a row; counting is the card's,
   * which does not look at status).
   */
  nearest: { threatId: string; position: Coordinates; distance_nm: number; bearing_deg: number; status: ThreatStatus };
  maxRange_nm: number;
  /** How many of this system's sites are within 60 nm of the waypoint or can reach it. */
  count: number;
}

/** A site the overview's map frames: a row's nearest site, or the nearest site of a system in reach that is not a row. */
export interface FramedSite {
  systemId: string;
  position: Coordinates;
  maxRange_nm: number;
}

export interface NearThreats {
  waypointId: string;
  /** At most NEAR_ROWS, in the card's order. */
  rows: NearRow[];
  /** Systems that can reach the waypoint and are not a row. */
  moreInReach: number;
  /** Their nearest sites, so the map frames them as well as the rows (often the long-range SAMs that cover the waypoint). */
  moreInReachSites: FramedSite[];
  /** Systems that are not a row and cannot reach the waypoint, and all their sites wherever they are. */
  outSystems: number;
  outThreats: number;
}

export function threatTotals(threats: ThreatInstance[], systems: ThreatSystemInfo[]): ThreatTotals {
  const typeOf = new Map(systems.map((s) => [s.id, s.threat_type]));
  const perSystem = new Map<string, number>();
  for (const t of threats) perSystem.set(t.systemId, (perSystem.get(t.systemId) ?? 0) + 1);
  const classes = THREAT_CLASSES.map((cls): ClassTally => ({ cls, systems: 0, threats: 0 }));
  for (const [systemId, count] of perSystem) {
    const type = typeOf.get(systemId);
    const tally = classes.find((c) => c.cls === type);
    if (!tally) continue;
    tally.systems += 1;
    tally.threats += count;
  }
  return { systems: perSystem.size, threats: threats.length, classes };
}

interface Site {
  threat: ThreatInstance;
  distance_nm: number;
  bearing_deg: number;
  maxRange_nm: number;
  type: string | undefined;
}

function sitesAt(at: Coordinates, threats: ThreatInstance[], systems: ThreatSystemInfo[]): Site[] {
  const byId = new Map(systems.map((s) => [s.id, s]));
  return threats
    .filter((t) => isPosition(t.position))
    .map((t) => {
      const system = byId.get(t.systemId);
      return {
        threat: t,
        distance_nm: calculateDistance(at, t.position),
        bearing_deg: Math.round(calculateBearing(at, t.position)) % 360,
        maxRange_nm: system?.max_range_nm ?? 0,
        type: system?.threat_type,
      };
    });
}

/** The card's own item shape, so its own compare and its own test decide. */
const asCardItem = (s: Site) => ({ name: s.threat.systemId, bearing_deg: s.bearing_deg, distance_nm: s.distance_nm, maxRange_nm: s.maxRange_nm, threatType: s.type });
const reaches = (s: Site): boolean => canShoot(asCardItem(s));

export function nearThreatsAt(waypoint: Waypoint, threats: ThreatInstance[], systems: ThreatSystemInfo[]): NearThreats {
  const empty: NearThreats = { waypointId: waypoint.id, rows: [], moreInReach: 0, moreInReachSites: [], outSystems: 0, outThreats: 0 };
  const allSystems = new Map<string, number>();
  for (const t of threats) allSystems.set(t.systemId, (allSystems.get(t.systemId) ?? 0) + 1);
  if (!isPosition(waypoint.coordinates)) {
    return { ...empty, outSystems: allSystems.size, outThreats: threats.length };
  }
  const byId = new Map(systems.map((s) => [s.id, s]));

  // Each system's sites, nearest first; the first is the one its row shows.
  const bySystem = new Map<string, Site[]>();
  for (const site of sitesAt(waypoint.coordinates, threats, systems)) {
    const list = bySystem.get(site.threat.systemId) ?? [];
    list.push(site);
    bySystem.set(site.threat.systemId, list);
  }
  const candidates: NearRow[] = [];
  const cardItem = new Map<string, ReturnType<typeof asCardItem>>();
  for (const [systemId, sites] of bySystem) {
    sites.sort((a, b) => a.distance_nm - b.distance_nm);
    const counted = sites.filter((s) => s.distance_nm <= NEAR_RADIUS_NM || reaches(s));
    if (counted.length === 0) continue;
    // One system has one range, so its nearest site is in reach exactly when any of its sites is.
    const nearest = sites[0];
    const system = byId.get(systemId);
    cardItem.set(systemId, asCardItem(nearest));
    candidates.push({
      systemId,
      name: system?.name ?? systemId,
      nato: system?.nato_designation ?? null,
      cls: isClass(system?.threat_type) ? system.threat_type : null,
      inReach: reaches(nearest),
      nearest: { threatId: nearest.threat.id, position: nearest.threat.position, distance_nm: nearest.distance_nm, bearing_deg: nearest.bearing_deg, status: nearest.threat.status },
      maxRange_nm: nearest.maxRange_nm,
      count: counted.length,
    });
  }
  // The card's order: in reach first, then nearest.
  candidates.sort((a, b) => compareThreatsForCard(cardItem.get(a.systemId)!, cardItem.get(b.systemId)!) || a.name.localeCompare(b.name));
  const rows = candidates.slice(0, NEAR_ROWS);
  const shown = new Set(rows.map((r) => r.systemId));
  const moreInReachSites: FramedSite[] = candidates
    .filter((c) => c.inReach && !shown.has(c.systemId))
    .map((c) => ({ systemId: c.systemId, position: c.nearest.position, maxRange_nm: c.maxRange_nm }));
  const moreInReach = moreInReachSites.length;
  const inReachIds = new Set(candidates.filter((c) => c.inReach).map((c) => c.systemId));
  let outSystems = 0;
  let outThreats = 0;
  for (const [systemId, count] of allSystems) {
    if (shown.has(systemId) || inReachIds.has(systemId)) continue;
    outSystems += 1;
    outThreats += count;
  }
  return { waypointId: waypoint.id, rows, moreInReach, moreInReachSites, outSystems, outThreats };
}

/** For the waypoint picker: how many systems can reach each waypoint, and how many more are near it. */
export function waypointThreatCounts(
  waypoint: Waypoint,
  threats: ThreatInstance[],
  systems: ThreatSystemInfo[],
): { inReach: number; nearOnly: number } {
  if (!isPosition(waypoint.coordinates)) return { inReach: 0, nearOnly: 0 };
  const inReach = new Set<string>();
  const near = new Set<string>();
  for (const site of sitesAt(waypoint.coordinates, threats, systems)) {
    if (reaches(site)) inReach.add(site.threat.systemId);
    else if (site.distance_nm <= NEAR_RADIUS_NM) near.add(site.threat.systemId);
  }
  for (const id of inReach) near.delete(id);
  return { inReach: inReach.size, nearOnly: near.size };
}

/**
 * Which waypoint the block is about when the overview opens: the first target an
 * attack aims at (by waypoint number), else the first waypoint the author marked
 * as a target, else the waypoint the most systems can reach (a later waypoint
 * before the spawn point, then the lower number). Null with no waypoints.
 * The waypoint type is a guess (waypoints are free text), so it only
 * breaks the tie when no attack names a target; it never hides a waypoint.
 */
export function defaultNearWaypoint(
  waypoints: Waypoint[],
  attacks: Pick<Attack, 'targetWaypointId'>[],
  threats: ThreatInstance[],
  systems: ThreatSystemInfo[],
): string | null {
  const route = [...waypoints].sort((a, b) => a.steerpoint - b.steerpoint);
  if (route.length === 0) return null;
  const targeted = new Set(attacks.map((a) => a.targetWaypointId));
  const target = route.find((w) => targeted.has(w.id));
  if (target) return target.id;
  const marked = route.find((w) => w.type === 'target');
  if (marked) return marked.id;
  const scored = route.map((w) => ({ w, reach: waypointThreatCounts(w, threats, systems).inReach }));
  scored.sort((a, b) => b.reach - a.reach || Number(a.w.steerpoint === 0) - Number(b.w.steerpoint === 0) || a.w.steerpoint - b.w.steerpoint);
  return scored[0].w.id;
}

/** "TGT1", or "Waypoint 3" when the author left it unnamed. The author's text as it is. */
export function waypointShortName(wp: Pick<Waypoint, 'name' | 'steerpoint'>): string {
  const name = (wp.name ?? '').trim();
  return name || `Waypoint ${wp.steerpoint}`;
}
