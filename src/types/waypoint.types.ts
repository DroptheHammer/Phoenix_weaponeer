export interface Waypoint {
  id: string;
  /**
   * The route-point number, 0-based, exactly as FragOrders publishes it.
   *
   * Waypoint 0 is where the aircraft spawns — a ramp, a runway, or a point in
   * the air — and the first turnpoint is waypoint 1. FragOrders' DTC export
   * skips waypoint 0 and starts the jet at steerpoint 1, so for every waypoint
   * the pilot can actually select, this number *is* the cockpit STPT number.
   *
   * Numbers can have gaps: an imported point with no usable coordinates is
   * dropped without renumbering the ones around it.
   */
  steerpoint: number;
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
  | 'bullseye' // Bullseye reference
  | 'departure'; // Ramp/runway/air start — where the jet begins, not a place you fly to

export interface Coordinates {
  lat: number; // Decimal degrees (positive = North)
  lon: number; // Decimal degrees (positive = East)
}

export interface TargetInfo {
  description: string; // What's at the target
  priority: 1 | 2 | 3; // Target priority
  dmpiCount?: number; // Number of DMPIs (Desired Mean Points of Impact)
}
