import { v4 as uuidv4 } from 'uuid';
import { calculateBearing, calculateDestination, calculateDistance } from './coordinates';
import type { Coordinates, FlightMember, Mission, Waypoint } from '../types';

/**
 * "Strike near me": plan an attack on a real place — the planner's own
 * neighbourhood, found by the phone's GPS — just for fun. No DCS map covers
 * it, so it can't be flown; the mission sits on the `real_world`
 * pseudo-theater (`crates/core/src/theaters.rs`) and the app says so.
 *
 * Everything else is the normal planner: all attack geometry already works on
 * lat/lon, so a target and an IP are all a mission needs to auto-build.
 *
 * Privacy: the location never leaves the device. Nothing here calls a
 * service; the only network traffic is the map tiles, as for any map view.
 */

/** Must match `REAL_WORLD_ID` in `crates/core/src/theaters.rs`. */
export const REAL_WORLD_THEATER = 'real_world';

/** How far out the IP sits: a normal pop-up run-in distance. */
export const REAL_WORLD_IP_DISTANCE_NM = 10;

/** Every aircraft carries it, and it has a classic dive delivery. A weapon *name*, as loadouts store them. */
export const REAL_WORLD_DEFAULT_WEAPON = 'Mk-82 LDGP';

/** Shown before a real-world mission or card leaves the device. */
export const REAL_WORLD_SHARE_WARNING =
  'This contains the real location you picked. Share it only with people you would tell where that is.';

export function isRealWorld(mission: Pick<Mission, 'theater'> | null | undefined): boolean {
  return mission?.theater === REAL_WORLD_THEATER;
}

export interface RealWorldStrike {
  target: Coordinates;
  /** Ground elevation at the target, ft MSL. Typed in: no elevation service is asked. */
  targetElevation_ft: number;
  /** Where the planner is, when known. The IP goes on the far side of the target from here. */
  planner?: Coordinates;
  aircraftId: string;
  callsign: string;
  name: string;
}

/**
 * The run-in direction: from the planner towards the target and on past it,
 * so the IP is on the far side ("rolling in on the house from over there").
 * A target picked right where the planner stands (under 0.1 nm) gives no
 * direction, so the IP goes due south.
 */
export function realWorldIpBearing(target: Coordinates, planner?: Coordinates): number {
  if (!planner || calculateDistance(planner, target) < 0.1) return 180;
  return calculateBearing(planner, target);
}

/** A new real-world mission: one IP, one target, a one-jet flight. */
export function realWorldMission(strike: RealWorldStrike): Mission {
  const now = new Date().toISOString();
  const ipPoint = calculateDestination(
    strike.target,
    realWorldIpBearing(strike.target, strike.planner),
    REAL_WORLD_IP_DISTANCE_NM,
  );
  // Waypoint altitudes are MSL. The IP is planned at the target's ground
  // level; each profile sets its own run-in height above it.
  const waypoints: Waypoint[] = [
    {
      id: uuidv4(),
      steerpoint: 1,
      name: 'IP',
      type: 'ip',
      coordinates: ipPoint,
      elevation_ft: strike.targetElevation_ft,
    },
    {
      id: uuidv4(),
      steerpoint: 2,
      name: 'TGT',
      type: 'target',
      coordinates: strike.target,
      elevation_ft: strike.targetElevation_ft,
      targetInfo: { description: 'Real-world target (not in DCS)', priority: 1 },
    },
  ];
  const lead: FlightMember = {
    id: uuidv4(),
    callsign: strike.callsign,
    position: 1,
    role: 'flight_lead',
    aircraftId: strike.aircraftId,
    // Something to drop, so Add Attack builds in one tap; changed in Flight.
    loadout: [{ weaponType: REAL_WORLD_DEFAULT_WEAPON, quantity: 6 }],
  };
  return {
    id: uuidv4(),
    name: strike.name,
    date: now.split('T')[0],
    theater: REAL_WORLD_THEATER,
    bullseye: strike.target,
    waypoints,
    threats: [],
    flightMembers: [lead],
    attacks: [],
    strikes: [],
    notes: 'Strike near me: a real place, not a DCS map. Plan it for fun; it cannot be flown in DCS.',
    createdAt: now,
    updatedAt: now,
  };
}
