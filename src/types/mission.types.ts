import { Coordinates, Waypoint } from './waypoint.types';
import { ThreatInstance } from './threat.types';
import { FlightMember } from './flight.types';
import { Attack } from './attack.types';

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

  notes: string;
  createdAt: string; // ISO timestamp
  updatedAt: string;
}

export type Theater =
  | 'caucasus'
  | 'persian_gulf'
  | 'syria'
  | 'nevada'
  | 'normandy'
  | 'channel'
  | 'south_atlantic'
  | 'sinai'
  | 'kola';
