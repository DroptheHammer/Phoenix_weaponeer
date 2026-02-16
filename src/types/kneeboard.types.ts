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

/** One step in the numbered procedure */
export interface KneeboardStep {
  title: string;      // e.g. "② ROLL IN"
  lines: string[];    // Bullet lines (short, readable)
  isWarning?: boolean; // Draw with red accent (e.g. weapons release step)
}

/** Raw attack geometry used to draw the diagram */
export interface KneeboardDiagramData {
  type: string; // 'popup_ccip' | 'dive_ccip' | 'level_ccrp' | ...
  egressDirection: string;
  egressHeading_deg: number;

  // Popup CCIP
  popupCCIP?: {
    runInHeading_deg: number;
    runInAltitude_ft: number;
    runInSpeed_ktas: number;
    popDistance_nm: number;
    climbAngle_deg: number;
    apexAltitude_ft: number;
    rollInAltitude_ft: number;
    diveAngle_deg: number;
    releaseAltitude_ft: number;
    releaseSpeed_ktas: number;
    minAltitude_ft: number;
  };

  // Dive CCIP
  diveCCIP?: {
    ingressHeading_deg: number;
    rollInAltitude_ft: number;
    diveAngle_deg: number;
    releaseAltitude_ft: number;
    releaseSpeed_ktas: number;
    pulloutG: number;
  };

  // Level CCRP
  levelCCRP?: {
    ingressHeading_deg: number;
    releaseAltitude_ft: number;
    releaseSpeed_ktas: number;
    egressHeading_deg: number;
  };
}

export interface KneeboardAttackSection {
  profileType: string; // Human readable
  parameters: Record<string, string>; // Key-value summary (still kept for reference)
  steps?: KneeboardStep[];           // NEW: numbered procedure
  diagram?: KneeboardDiagramData;    // NEW: raw data for diagram drawing
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
