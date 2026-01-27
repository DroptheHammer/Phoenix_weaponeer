export interface KneeboardCard {
  id: string;

  flightMemberId: string;
  attackId: string;

  // Rendered content sections
  header: KneeboardHeader;
  targetSection: KneeboardTargetSection;
  threatSection: KneeboardThreatSection;
  attackSection: KneeboardAttackSection;
  weaponSection: KneeboardWeaponSection;
  egressSection: KneeboardEgressSection;

  // Output
  renderedImage?: string; // Base64 PNG or file path
}

export interface KneeboardHeader {
  callsign: string;
  missionDate: string;
  targetName: string;
}

export interface KneeboardTargetSection {
  name: string;
  coordinates: string; // Formatted (N 41 23'45" E 044 12'34")
  coordinatesMGRS: string; // MGRS format
  elevation_ft: number;
  description: string;
}

export interface KneeboardThreatSection {
  threats: KneeboardThreatItem[];
}

export interface KneeboardThreatItem {
  name: string; // "SA-10"
  bearing_deg: number; // From target
  distance_nm: number; // From target
  maxRange_nm: number;
  notes?: string;
}

export interface KneeboardAttackSection {
  profileType: string; // Human readable
  parameters: Record<string, string>; // Key-value pairs to display
}

export interface KneeboardWeaponSection {
  weaponName: string;
  quantity: number;
  fuze: string;
  armingDelay?: string;
  releaseMode: string;
  minSafeAlt_ft?: number;
}

export interface KneeboardEgressSection {
  direction: string;
  heading_deg: number;
  fenceOutWaypoint?: string;
  abortProcedure?: string;
  rescueBullseye?: string;
}
