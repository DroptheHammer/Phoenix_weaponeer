import { Coordinates, Waypoint } from './waypoint.types';
import { ThreatInstance } from './threat.types';
import { FlightMember } from './flight.types';
import { Attack } from './attack.types';
import type { Strike } from './strike.types';

export interface Mission {
  id: string;
  name: string;
  date: string; // Mission date (YYYY-MM-DD)
  theater: Theater;
  bullseye: Coordinates;

  waypoints: Waypoint[];
  threats: ThreatInstance[];
  flightMembers: FlightMember[];
  attacks: Attack[];
  /** Coordinated multi-ship attacks. Optional: saves from before strikes existed load without it. */
  strikes?: Strike[];

  notes: string;
  createdAt: string; // ISO timestamp
  updatedAt: string;
}

/**
 * Stable theater id (e.g. 'nevada', 'south_atlantic').
 *
 * Deliberately not a union of literals. The authoritative list lives in
 * `THEATER_PARAMS` in `crates/core/src/parsers/coordinate_conversion.rs` and
 * reaches the frontend through the `list_theaters` command — see
 * `src/stores/theaterStore.ts`. A hard-coded union here is what let the two
 * lists drift apart, leaving three maps that the backend supported but that
 * could not be represented in the frontend at all.
 */
export type Theater = string;
