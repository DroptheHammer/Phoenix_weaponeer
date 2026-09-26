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

/** A latitude and longitude, if both are numbers inside their ranges. */
function point(lat: number, lon: number): Coordinates | null {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/** One degrees[-minutes[-seconds]] value, without its hemisphere letter. */
const DMS_VALUE = String.raw`(\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*(?:(\d+(?:\.\d+)?)\s*(?:["″]|'')?)?)?`;

/** A hemisphere letter and the value it goes with, from a match's groups. */
function dmsPart(hemi: string, deg: string, min?: string, sec?: string): { value: number; hemi: string } {
  return { value: Number(deg) + Number(min ?? 0) / 60 + Number(sec ?? 0) / 3600, hemi: hemi.toUpperCase() };
}

/**
 * A place typed or pasted in: "36.23, -115.03", the app's own DMS
 * ("N 36°13'51.53" W 114°26'40.49""), or a Google Maps / OpenStreetMap link
 * (they carry the position in the address). `null` when it isn't one.
 * Read here, on the device; nothing is looked up anywhere.
 */
export function parseLocation(text: string): Coordinates | null {
  const t = text.trim();
  if (!t) return null;

  // Map links: Google's "@lat,lon," / "q=lat,lon" / "ll=lat,lon", OSM's "mlat=..&mlon=.." or "#map=z/lat/lon".
  const num = String.raw`(-?\d+(?:\.\d+)?)`;
  for (const pattern of [
    new RegExp(`@${num},${num}`),
    new RegExp(`[?&](?:q|ll|query|center)=${num}(?:,|%2C)\\s*${num}`, 'i'),
    new RegExp(`#map=\\d+(?:\\.\\d+)?/${num}/${num}`),
  ]) {
    const m = t.match(pattern);
    if (m) return point(Number(m[1]), Number(m[2]));
  }
  const osm = t.match(new RegExp(`mlat=${num}.*mlon=${num}`));
  if (osm) return point(Number(osm[1]), Number(osm[2]));

  // Plain decimal degrees: "36.23, -115.03" or "36.23 -115.03".
  const decimal = t.match(new RegExp(`^${num}\\s*[,;\\s]\\s*${num}$`));
  if (decimal) return point(Number(decimal[1]), Number(decimal[2]));

  // Degrees, minutes, seconds with hemisphere letters, all before ("N 36°…
  // W 115°…", the app's own) or all after ("36°…N 115°…W").
  const before = t.match(new RegExp(`^([NSEW])\\s*${DMS_VALUE}\\s*[,;]?\\s*([NSEW])\\s*${DMS_VALUE}$`, 'i'));
  const after = t.match(new RegExp(`^${DMS_VALUE}\\s*([NSEW])\\s*[,;]?\\s*${DMS_VALUE}\\s*([NSEW])$`, 'i'));
  const parts = before
    ? [dmsPart(before[1], before[2], before[3], before[4]), dmsPart(before[5], before[6], before[7], before[8])]
    : after
      ? [dmsPart(after[4], after[1], after[2], after[3]), dmsPart(after[8], after[5], after[6], after[7])]
      : null;
  if (!parts) return null;
  const lat = parts.find((p) => p.hemi === 'N' || p.hemi === 'S');
  const lon = parts.find((p) => p.hemi === 'E' || p.hemi === 'W');
  if (!lat || !lon) return null;
  return point(lat.hemi === 'S' ? -lat.value : lat.value, lon.hemi === 'W' ? -lon.value : lon.value);
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
