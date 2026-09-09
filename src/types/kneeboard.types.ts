import type { AttackPicture, SideProfile } from './attackPicture.types';

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
  /** "Viper 1-1 — 30° Dive CCIP, Mk-84 attack on STPT 8 (TGT1)" */
  title?: string;
  missionDate: string;
  targetName: string;
  targetSteerpoint?: number;
  /** Each drawn as an amber strip under the header: unverified map, estimated profile… */
  cautions?: string[];
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
  /** 'SAM' | 'SHORAD' | 'AAA' | 'MANPADS' | 'EWR'. An EWR's maxRange_nm is
   *  DETECTION range, not an engagement envelope, so it must not be ranked or
   *  drawn as though it could shoot. */
  threatType?: string;
  notes?: string;
}

/**
 * The two pictures the card draws: the attack north-up, exactly as the planner's
 * map shows it, and the same attack as altitude against distance. No text
 * procedure — the labels on the pictures are the procedure.
 */
export interface KneeboardDiagramData {
  type: string; // 'popup_ccip' | 'dive_ccip' | 'level_ccrp' | ...
  /** North-up plan view, in lat/lon; the renderer projects it. */
  picture?: AttackPicture;
  /** Side view. */
  side?: SideProfile;
  attackHeading_deg?: number;
  egressDirection: string;
  egressHeading_deg: number;
  /** Manual deliveries: the one number a legacy pilot needs at the roll-in. */
  sightDepression_mils?: number;
}

export interface KneeboardAttackSection {
  profileType: string; // Human readable
  parameters: Record<string, string>; // Key-value summary (kept for reference)
  diagram?: KneeboardDiagramData;
}

export interface KneeboardWeaponSection {
  weaponName: string;
  quantity: number;
  fuze: string;
  armingDelay?: string;
  releaseMode: string;
  minSafeAlt_ft?: number;
  /** Sanity-check failures from attackChecks, drawn as red ⚠ lines under the weapon */
  warnings?: string[];
}

export interface KneeboardEgressSection {
  direction: string;
  heading_deg: number;
  fenceOutWaypoint?: string;
  abortProcedure?: string;
  rescueBullseye?: string;
}
