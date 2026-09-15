import { Coordinates } from './waypoint.types';

// Threat system definition (from database)
export interface ThreatSystem {
  id: string;
  name: string; // "S-300PS (SA-10 Grumble)"
  natoDesignation: string; // "SA-10"
  type: ThreatType;

  // Engagement envelope
  maxRange_nm: number;
  minRange_nm: number;
  maxAltitude_ft: number;
  minAltitude_ft: number;
  optimalAltitude_ft?: number; // Where it's most effective

  // Performance
  missileSpeed_mach?: number;
  reloadTime_sec?: number;
  simultaneousEngagements?: number;
  reactionTime_sec?: number;

  // Radar (for SAMs)
  radar?: RadarInfo;

  // Gun data (for AAA)
  gun?: GunInfo;

  // DCS-specific
  dcsUnitName: string; // For pydcs/miz parsing
}

export type ThreatType = 'SAM' | 'AAA' | 'MANPADS' | 'SHORAD' | 'EWR';

export interface RadarInfo {
  type: 'CW' | 'PD' | 'TWS' | 'MTI';
  trackWhileScan: boolean;
  searchAltitude_ft?: number; // Max search altitude
  burnThroughRange_nm?: number; // Range where jamming is ineffective
}

export interface GunInfo {
  caliber_mm: number;
  rateOfFire_rpm: number;
  muzzleVelocity_mps: number;
  effectiveRange_m: number;
  radarGuided: boolean;
}

// Source of threat data
export type ThreatSource =
  | 'mission'   // From FragOrders/mission file - confirmed by mission creator
  | 'planning'; // Added by user during planning - assumed/what-if

// Placed threat instance on the map
export interface ThreatInstance {
  id: string;
  systemId: string; // Reference to ThreatSystem

  position: Coordinates;

  status: ThreatStatus;
  source: ThreatSource; // Where this threat came from
  orientationDeg?: number; // Facing direction (for directional systems)

  notes?: string;

  /**
   * The mission author hid this group on the DCS mission planner / F10 map.
   * Only ever set on imported threats; absent means not hidden, so older
   * saved missions are unaffected. See `lib/threatVisibility.ts`.
   */
  hiddenOnPlanner?: boolean;
  hiddenOnMap?: boolean;
}

export type ThreatStatus =
  | 'active' // Fully operational
  | 'degraded' // Reduced capability
  | 'suppressed' // Temporarily neutralized
  | 'destroyed' // Confirmed kill
  | 'unknown'; // Intel uncertain
