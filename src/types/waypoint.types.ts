export interface Waypoint {
  id: string;
  steerpoint: number; // DCS steerpoint number (1-99)
  name: string; // e.g., "IP ALPHA", "TGT 1"
  type: WaypointType;

  coordinates: Coordinates;
  elevation_ft: number; // MSL

  // Optional timing
  tos?: string; // Time on station (HH:MM:SS)

  // For target waypoints
  targetInfo?: TargetInfo;
}

export type WaypointType =
  | 'nav' // Navigation waypoint
  | 'ip' // Initial Point
  | 'target' // Target
  | 'cap' // Combat Air Patrol point
  | 'marshal' // Marshal/holding point
  | 'tanker' // Tanker track
  | 'divert' // Divert airfield
  | 'bullseye'; // Bullseye reference

export interface Coordinates {
  lat: number; // Decimal degrees (positive = North)
  lon: number; // Decimal degrees (positive = East)
}

export interface TargetInfo {
  description: string; // What's at the target
  priority: 1 | 2 | 3; // Target priority
  dmpiCount?: number; // Number of DMPIs (Desired Mean Points of Impact)
}
