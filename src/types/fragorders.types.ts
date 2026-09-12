import type { Coordinates } from './waypoint.types';

/**
 * Processed FragOrders data returned from the Rust backend
 */
export interface FragOrdersData {
  theater: string;
  /** Theater name as DCS writes it, for display */
  theater_display_name: string;
  /**
   * False when this map's projection has never been checked against a known
   * landmark. The import still works; the UI must warn rather than present the
   * positions as trustworthy.
   */
  projection_verified: boolean;
  bullseye: Coordinates;
  player_groups: FragOrdersPlayerGroup[];
  threats: FragOrdersThreat[];
  trigger_zones: FragOrdersTriggerZone[];
  /**
   * Items the importer could not place (unprojectable waypoints, threats or
   * zones). Empty on a clean import. Shown to the user so a partial import
   * cannot look like a complete one.
   */
  warnings: string[];
}

/**
 * A player-flyable group from the mission
 */
export interface FragOrdersPlayerGroup {
  name: string;
  callsign: string;
  aircraft_type: string;
  units: FragOrdersUnit[];
  waypoints: FragOrdersWaypoint[];
}

/**
 * Individual player unit within a group
 */
export interface FragOrdersUnit {
  name: string;
  callsign: string;
  onboard_num: string | null;
}

/**
 * Waypoint from FragOrders with DCS-to-Phoenix type mapping
 */
export interface FragOrdersWaypoint {
  steerpoint: number;
  name: string;
  wp_type: string;
  position: Coordinates;
  altitude_ft: number;
  speed_ktas: number | null;
}

/**
 * Threat unit from the mission
 */
export interface FragOrdersThreat {
  unit_type: string;
  group_name: string;
  position: Coordinates;
  system_id: string | null;
  system_name: string | null;
  confidence: ThreatMatchConfidence;
}

/**
 * Confidence level for threat identification
 */
export type ThreatMatchConfidence = 'High' | 'Medium' | 'Low' | 'Unknown';

/**
 * Trigger zone from the mission
 */
export interface FragOrdersTriggerZone {
  name: string;
  center: Coordinates;
  radius_m: number;
}

/**
 * Options for importing FragOrders data into a mission
 */
export interface FragOrdersImportOptions {
  /** Index of the player group to import waypoints from */
  selectedGroupIndex: number;
  /** Whether to import threat data */
  importThreats: boolean;
  /** Minimum confidence level for threat imports */
  minThreatConfidence: ThreatMatchConfidence;
  /** Whether to import trigger zones as waypoints */
  importTriggerZones: boolean;
}

/**
 * Get a display-friendly confidence label
 */
export function getConfidenceLabel(confidence: ThreatMatchConfidence): string {
  switch (confidence) {
    case 'High':
      return 'High (Exact match)';
    case 'Medium':
      return 'Medium (Pattern match)';
    case 'Low':
      return 'Low (Fuzzy match)';
    case 'Unknown':
      return 'Unknown (Manual mapping needed)';
  }
}

/**
 * Get a CSS class for confidence level styling
 */
export function getConfidenceClass(confidence: ThreatMatchConfidence): string {
  switch (confidence) {
    case 'High':
      return 'text-green-600';
    case 'Medium':
      return 'text-yellow-600';
    case 'Low':
      return 'text-orange-500';
    case 'Unknown':
      return 'text-red-500';
  }
}

/**
 * Check if a confidence level meets a minimum threshold
 */
export function meetsConfidenceThreshold(
  confidence: ThreatMatchConfidence,
  minimum: ThreatMatchConfidence
): boolean {
  const levels: ThreatMatchConfidence[] = ['Unknown', 'Low', 'Medium', 'High'];
  const confIndex = levels.indexOf(confidence);
  const minIndex = levels.indexOf(minimum);
  return confIndex >= minIndex;
}
