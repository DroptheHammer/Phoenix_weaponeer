import { Coordinates } from './waypoint.types';
import type { DeliveryModeCode } from './profile.types';

export interface Attack {
  id: string;

  // What
  targetWaypointId: string; // Reference to target waypoint
  attackerId: string; // Reference to FlightMember

  // How
  profileType: AttackProfileType;
  profile: AttackProfile; // Type-specific parameters

  // With what
  weaponId: string;
  fuzeId?: string;
  releaseQuantity: number;
  releaseMode: 'single' | 'pair' | 'ripple';
  rippleInterval_ft?: number; // Spacing for ripple

  // Sequence
  sequenceNumber: number; // Order in attack flow

  notes?: string;

  // Where the numbers came from. Snapshotted when the attack is built from a
  // delivery profile, so a saved mission still renders correctly if the
  // profile is later renamed, edited or removed.
  sourceProfileId?: string;
  sourceProfileName?: string;
  deliveryMode?: DeliveryModeCode;
  /** The profile had not been flown in DCS when this attack was built — the card says so */
  estimated?: boolean;
  /** Fixed-sight depression for manual deliveries (F-4E, A-4, F-5, Mirage F1) */
  sightDepression_mils?: number;
  /** Aircraft-specific setup lines from the profile, printed as the first step */
  procedure?: string[];
  /** The planner changed numbers after auto-build */
  customized?: boolean;
}

export type AttackProfileType =
  | 'level_ccrp'
  | 'dive_ccip'
  | 'popup_ccip'
  | 'loft_ccrp'
  | 'low_angle_low_drag'
  | 'high_angle_strafe'
  | 'standoff';

// Union type for profile-specific parameters
export type AttackProfile =
  | LevelCCRPProfile
  | DiveCCIPProfile
  | PopupCCIPProfile
  | LoftCCRPProfile
  | StandoffProfile;

export interface LevelCCRPProfile {
  type: 'level_ccrp';
  ipWaypointId?: string; // Draws the run-in from a real IP when set
  ingressHeading_deg: number;
  releaseAltitude_ft: number; // MSL
  releaseSpeed_ktas: number;
  egressHeading_deg?: number; // undefined = straight ahead (resolveEgressHeading)
}

export interface DiveCCIPProfile {
  type: 'dive_ccip';
  ipWaypointId?: string; // Draws the run-in from a real IP when set
  ingressHeading_deg: number;
  ingressAltitude_ft?: number; // AGL, before roll-in; defaults to roll-in altitude
  rollInAltitude_ft: number; // AGL
  diveAngle_deg: number;
  releaseAltitude_ft: number; // AGL
  releaseSpeed_ktas: number;
  pulloutG: number;
  egressDirection: 'left' | 'right' | 'straight';
  egressHeading_deg?: number; // undefined = 90° break off the ingress heading (resolveEgressHeading)
}

export interface PopupCCIPProfile {
  type: 'popup_ccip';

  // Run-in
  ipWaypointId: string; // Initial Point waypoint
  runInHeading_deg?: number; // undefined = auto from IP→Target bearing
  runInAltitude_ft: number; // AGL
  runInSpeed_ktas: number;

  // Pop maneuver
  popDistance_nm: number; // Distance from target to begin pop
  climbAngle_deg: number;
  apexAltitude_ft: number; // AGL

  // Offset maneuver (optional — undefined falls back to recommended params)
  offsetDirection?: 'left' | 'right';
  offsetAngle_deg?: number; // Degrees off the attack axis during the offset leg
  turnInRange_nm?: number; // Range from target to turn in for the attack

  // Attack
  rollInAltitude_ft: number; // AGL
  diveAngle_deg: number;
  releaseAltitude_ft: number; // AGL
  releaseSpeed_ktas: number;

  // Egress
  minAltitude_ft: number; // Hard deck, ft AGL — the card and diagram print it as AGL
  egressDirection: 'left' | 'right';
  egressHeading_deg?: number; // undefined = auto: 90° break off the attack heading (resolveEgressHeading)
}

export interface LoftCCRPProfile {
  type: 'loft_ccrp';
  ingressHeading_deg: number;
  ingressAltitude_ft: number;
  ingressSpeed_ktas: number;
  pullUpDistance_nm: number;
  pullUpAngle_deg: number;
  releaseAltitude_ft: number;
  egressHeading_deg: number;
}

export interface StandoffProfile {
  type: 'standoff';
  releasePoint: Coordinates;
  releaseAltitude_ft: number;
  releaseSpeed_ktas: number;
  releaseHeading_deg: number;
  standoffDistance_nm: number;
}
