import type { FlightRole } from '../../types/flight.types';
import type { Mission } from '../../types/mission.types';
import type { DbWeapon, FuzeOption } from '../../types/weapon.types';
import { getTheaterInfo, type TheaterInfo } from '../../stores/theaterStore';
import { weaponForLoadoutItem } from '../autoBuildAttack';
import { buildKneeboardCard, type ThreatSystemInfo } from '../buildKneeboardCard';
import { flightGroupOf, formatCallsign } from '../callsign';
import { strikeMembers, strikeOf } from '../strike';
import { isRealWorld } from '../strikeNearMe';
import { visibleMission, type HiddenReveal } from '../threatVisibility';
import { waypointLabel } from '../waypointOptions';

/**
 * A mission, boiled down to what a planner wants to see the moment it opens:
 * which targets, which threats, who flies what, and whether each attack is
 * ready to brief. Pure and read-only: nothing here changes the mission, and
 * nothing is kept.
 *
 * Everything it says about threats is worked out from the mission as this
 * planner may see it, so it counts what the threat list counts and nothing
 * else: a summary of a mission with a threat the author hid is the same as a
 * summary of that mission without it. It carries no threat position, no threat
 * note, no mission notes and no FragOrders warning: only counts, names and the
 * card's own cautions.
 */

/** How far the map projection of the mission's theater can be trusted. */
export type TheaterState = 'verified' | 'unverified' | 'unknown' | 'real_world';

/** The lookups the summary names things from. Whatever has not loaded yet is simply empty. */
export interface SummaryRefs {
  threatSystems: ThreatSystemInfo[];
  aircraft: Array<{ id: string; name: string }>;
  weapons: DbWeapon[];
  fuzeOptions: Map<string, FuzeOption[]>;
}

export interface ThreatTally {
  systemId: string;
  name: string;
  nato: string | null;
  count: number;
}

export interface SummaryTarget {
  waypointId: string;
  /** As stored: waypoint 0 is the spawn point, and the number is the cockpit steerpoint. */
  steerpoint: number;
  label: string;
  attackIds: string[];
}

export interface SummaryJet {
  memberId: string;
  callsign: string;
  flight: string;
  position: 1 | 2 | 3 | 4;
  role: FlightRole;
  aircraftName: string;
  attackIds: string[];
  /** `known` is null while the weapon table has not loaded: nothing can be called unknown yet. */
  loadout: Array<{ quantity: number; name: string; known: boolean | null }>;
}

export interface SummaryAttack {
  id: string;
  /** The attack's own number; an attack saved without one reads 0. */
  sequence: number;
  attackerCallsign: string | null;
  targetLabel: string | null;
  weaponName: string | null;
  strike: { id: string; name: string } | null;
  estimated: boolean;
  status: 'ready' | 'caution' | 'blocked';
  /** Why it is blocked. A blocked attack carries no reasons: the look puts its own words to this. */
  blockedBy?: 'no-attacker' | 'no-target' | 'error';
  /** What the card would warn about, in the card's own words. */
  reasons: string[];
}

export interface MissionSummary {
  name: string;
  lastEdited: string | null;
  theater: { id: string; displayName: string; state: TheaterState };
  targets: SummaryTarget[];
  /** Waypoints that look like targets but no attack uses. A hint, never a target. */
  targetHints: Array<{ waypointId: string; steerpoint: number; label: string }>;
  threats: {
    visibleCount: number;
    fromMission: number;
    planning: number;
    bySystem: ThreatTally[];
  };
  flights: SummaryJet[];
  attacks: SummaryAttack[];
  strikes: Array<{ id: string; name: string; memberAttackIds: string[]; spacing_s: number }>;
  readiness: { ready: number; caution: number; blocked: number; jetsWithoutAttack: string[] };
}

export function theaterStateOf(theaterId: string, info: TheaterInfo | undefined): TheaterState {
  if (isRealWorld({ theater: theaterId })) return 'real_world';
  if (!info) return 'unknown';
  return info.verified ? 'verified' : 'unverified';
}

const finiteOr = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/**
 * True when a number anywhere in the card is not a number. A saved attack that
 * lost its profile numbers still builds a card, but one that draws as NaN, and
 * that is not an attack to brief.
 */
function hasBrokenNumber(value: unknown): boolean {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (value !== null && typeof value === 'object') return Object.values(value).some(hasBrokenNumber);
  return false;
}

/** Most numerous first, then by name. */
const byCountThenName = (a: ThreatTally, b: ThreatTally): number => b.count - a.count || a.name.localeCompare(b.name);

/**
 * `visible` is what this planner may see, and everything below is read from it
 * (the mission itself is read only for its name, theater, times and strikes).
 * The caller memoises on mission, reveal and refs.
 */
export function summarizeMission(mission: Mission, reveal: HiddenReveal, refs: SummaryRefs): MissionSummary {
  const visible = visibleMission(mission, reveal);
  // Read here, as the card reads it, so the two can never disagree about the theater.
  const info = getTheaterInfo(mission.theater);

  // ─── Threats ───
  const tally = (systemId: string, count: number): ThreatTally => {
    const system = refs.threatSystems.find((s) => s.id === systemId);
    return { systemId, name: system?.name ?? systemId, nato: system?.nato_designation ?? null, count };
  };
  const visibleBySystem = new Map<string, number>();
  for (const threat of visible.threats) visibleBySystem.set(threat.systemId, (visibleBySystem.get(threat.systemId) ?? 0) + 1);

  // ─── Targets: whatever the attacks aim at, whatever the waypoint is called ───
  const attacks = [...visible.attacks].sort((a, b) => finiteOr(a.sequenceNumber, Number.MAX_SAFE_INTEGER) - finiteOr(b.sequenceNumber, Number.MAX_SAFE_INTEGER));
  const targeted = new Set(attacks.map((a) => a.targetWaypointId));
  const targets: SummaryTarget[] = visible.waypoints
    .filter((w) => targeted.has(w.id))
    .sort((a, b) => a.steerpoint - b.steerpoint)
    .map((w) => ({
      waypointId: w.id,
      steerpoint: w.steerpoint,
      label: waypointLabel(w),
      attackIds: attacks.filter((a) => a.targetWaypointId === w.id).map((a) => a.id),
    }));
  const targetHints = visible.waypoints
    .filter((w) => w.type === 'target' && !targeted.has(w.id))
    .sort((a, b) => a.steerpoint - b.steerpoint)
    .map((w) => ({ waypointId: w.id, steerpoint: w.steerpoint, label: waypointLabel(w) }));

  // ─── Flights ───
  const flights: SummaryJet[] = [...visible.flightMembers]
    .sort((a, b) => finiteOr(a.position, 99) - finiteOr(b.position, 99))
    .map((member) => {
      const callsign = formatCallsign(member.callsign);
      return {
        memberId: member.id,
        callsign,
        flight: flightGroupOf(callsign),
        position: member.position,
        role: member.role,
        aircraftName: refs.aircraft.find((a) => a.id === member.aircraftId)?.name ?? member.aircraftId,
        attackIds: attacks.filter((a) => a.attackerId === member.id).map((a) => a.id),
        loadout: member.loadout.map((item) => {
          const weapon = weaponForLoadoutItem(item, refs.weapons);
          return { quantity: item.quantity, name: weapon?.name ?? item.weaponType, known: refs.weapons.length === 0 ? null : weapon !== undefined };
        }),
      };
    });

  // ─── Attacks and how ready each one is ───
  const summaryAttacks = attacks.map((attack): SummaryAttack => {
    const attacker = visible.flightMembers.find((m) => m.id === attack.attackerId);
    const target = visible.waypoints.find((w) => w.id === attack.targetWaypointId);
    const strike = strikeOf(visible, attack.strikeId);
    const base = {
      id: attack.id,
      sequence: finiteOr(attack.sequenceNumber, 0),
      attackerCallsign: attacker ? formatCallsign(attacker.callsign) : null,
      targetLabel: target ? waypointLabel(target) : null,
      weaponName: refs.weapons.find((w) => w.id === attack.weaponId)?.name ?? null,
      strike: strike ? { id: strike.id, name: strike.name } : null,
      estimated: Boolean(attack.estimated),
    };
    if (!attacker) return { ...base, status: 'blocked', blockedBy: 'no-attacker', reasons: [] };
    if (!target) return { ...base, status: 'blocked', blockedBy: 'no-target', reasons: [] };

    try {
      // The card is built from the visible mission, so nothing it says can come from a hidden threat.
      const card = buildKneeboardCard(visible, attack.id, refs.weapons, refs.fuzeOptions, refs.threatSystems);
      if (!card || hasBrokenNumber(card)) return { ...base, status: 'blocked', blockedBy: 'error', reasons: [] };
      const reasons = [...(card.header.cautions ?? []), ...(card.weaponSection.warnings ?? [])];
      if (refs.weapons.length > 0 && !refs.weapons.some((w) => w.id === attack.weaponId)) reasons.push('Weapon not in the weapon table');
      // The card puts the unverified-map caution first whenever the theater is not
      // verified. That is a fact about the whole mission, shown once under the
      // theater, so it must not make every attack read "caution".
      const aboutTheAttack = info?.verified ? reasons : reasons.slice(1);
      return { ...base, status: aboutTheAttack.length > 0 ? 'caution' : 'ready', reasons };
    } catch {
      return { ...base, status: 'blocked', blockedBy: 'error', reasons: [] };
    }
  });

  const attackers = new Set(attacks.map((a) => a.attackerId));
  const tallyOf = (status: SummaryAttack['status']) => summaryAttacks.filter((a) => a.status === status).length;

  return {
    name: mission.name,
    lastEdited: Number.isFinite(Date.parse(mission.updatedAt)) ? mission.updatedAt : null,
    theater: { id: mission.theater, displayName: info?.display_name ?? mission.theater, state: theaterStateOf(mission.theater, info) },
    targets,
    targetHints,
    threats: {
      visibleCount: visible.threats.length,
      fromMission: visible.threats.filter((t) => t.source === 'mission').length,
      planning: visible.threats.filter((t) => t.source === 'planning').length,
      bySystem: [...visibleBySystem].map(([systemId, count]) => tally(systemId, count)).sort(byCountThenName),
    },
    flights,
    attacks: summaryAttacks,
    strikes: (mission.strikes ?? []).map((strike) => ({
      id: strike.id,
      name: strike.name,
      memberAttackIds: strikeMembers(visible, strike.id).map((a) => a.id),
      spacing_s: strike.spacing_s,
    })),
    readiness: {
      ready: tallyOf('ready'),
      caution: tallyOf('caution'),
      blocked: tallyOf('blocked'),
      jetsWithoutAttack: flights.filter((jet) => !attackers.has(jet.memberId)).map((jet) => jet.callsign),
    },
  };
}
