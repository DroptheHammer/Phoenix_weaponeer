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

  /** Member of this coordinated strike (see strike.types.ts). A dangling id is ignored. */
  strikeId?: string;
  /** Seconds after the strike lead over the target; 0 for the lead. */
  totOffset_s?: number;
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

/**
 * Fields shared by every visual delivery: the run-in is anchored on the route.
 * Fly the IP→target leg to the action point, make the check turn, run up the
 * offset leg, join the attack. Absent on saves that predate the model.
 */
export interface ActionPointFields {
  /** Range from the target at which the check turn is made (4.5 nm by default). */
  actionRange_nm?: number;
  /** The check turn at the action point, degrees off the direct line. */
  offsetAngle_deg?: number;
  /** Which flank the offset leg runs up: ingress from the target's left or right. */
  offsetDirection?: 'left' | 'right';
  /**
   * Level CCRP only: offset leg as a multiple of the run-in (join) range.
   * When present, the leg is authoritative and actionRange_nm is derived from it.
   * When absent, actionRange_nm is authoritative (dive, popup, and legacy level saves).
   */
  offsetLegRatio?: number;
}

/**
 * Where the run-in starts. Precedence: an explicit custom point beats an
 * explicitly chosen waypoint, which beats the prior numeric waypoint
 * (`inferIp`/`inferIpFrom`). Resolved by `resolveIpAnchor` (`lib/ipAnchor.ts`)
 * — read that, never these fields directly.
 */
export interface IpAnchorFields {
  /** A waypoint the planner picked, or auto-build resolved to. */
  ipWaypointId?: string;
  /** A point the planner dropped on the map or dialed in as a radial/distance off the target. Wins over ipWaypointId. */
  customIp?: Coordinates;
}

export interface LevelCCRPProfile extends ActionPointFields, IpAnchorFields {
  type: 'level_ccrp';
  /** The attack axis: whatever the action-point geometry produces. */
  ingressHeading_deg: number;
  releaseAltitude_ft: number; // MSL
  releaseSpeed_ktas: number;
  /** The break after release; undefined = straight ahead */
  egressDirection?: 'left' | 'right' | 'straight';
  egressHeading_deg?: number; // undefined = straight ahead (resolveEgressHeading)
}

export interface DiveCCIPProfile extends ActionPointFields, IpAnchorFields {
  type: 'dive_ccip';
  /** The attack axis: whatever the action-point geometry produces. The roll-in is the turn onto it. */
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

/**
 * A pop-up as flown, on the F-16 handbook's model (docs/DELIVERY_PLANNING.md).
 *
 * Inputs are the dive angle, the release floor, speed, tracking time and G,
 * plus the angle-off and the flank the approach is flown on. The rest is
 * derived by `applyPopupPlan` and stored so the card, the map and the diagram
 * all print the same numbers. Saves that predate the model carry no
 * `approachHeading_deg`; the map and card rebuild a plan from their inputs.
 */
export interface PopupCCIPProfile extends IpAnchorFields {
  type: 'popup_ccip';

  /** The attack axis (pull-down → target): route ∓ check turn ± pull-down turn. Derived. */
  runInHeading_deg?: number;
  /** Heading flown on the offset leg and through the pop: route ∓ check turn. Derived. */
  approachHeading_deg?: number;
  runInAltitude_ft: number; // AGL
  runInSpeed_ktas: number; // TAS, used for the whole chain

  // Inputs
  diveAngle_deg: number;
  releaseAltitude_ft: number; // AGL floor — "release by"
  releaseSpeed_ktas: number; // = runInSpeed_ktas
  trackingTime_s?: number; // default 5
  pullG?: number; // default 3.5
  minAltitude_ft: number; // Hard deck, ft AGL — the card and diagram print it as AGL

  // The run-in on the route: action point, check turn, flank (see ActionPointFields)
  actionRange_nm?: number; // default 4.5 nm
  offsetAngle_deg?: number; // the check turn; default from the handbook's angle-off guide, rounded to 5°
  offsetDirection?: 'left' | 'right'; // ingress from the target's left / right flank
  /** The pull-down turn (the handbook's angle-off) that closes the geometry. Derived. */
  pullDownTurn_deg?: number;
  /** False when even a 90° pull-down cannot reach the target for this check turn and range. Derived. */
  geometryCloses?: boolean;

  // Derived — recomputed by applyPopupPlan whenever an input changes
  climbAngle_deg: number;
  apexAltitude_ft: number; // AGL
  rollInAltitude_ft: number; // Pull-down altitude, AGL (name kept for the diagram)
  popDistance_nm: number; // Range from target at the pull-up point
  turnInRange_nm?: number; // Range from target at the pull-down point
  trackAltitude_ft?: number; // Wings-level (MAP) altitude, AGL
  mapDistance_nm?: number; // Range from target where tracking begins
  aimOffDistance_ft?: number; // Beyond the target, where the nose points while tracking
  bombRange_ft?: number;
  popToPullDown_nm?: number;
  turnRadius_nm?: number;

  // Egress
  egressDirection: 'left' | 'right';
  egressHeading_deg?: number; // undefined = auto: 90° break off the attack heading (resolveEgressHeading)
}

export interface LoftCCRPProfile extends IpAnchorFields {
  type: 'loft_ccrp';
  ingressHeading_deg: number;
  ingressAltitude_ft: number;
  ingressSpeed_ktas: number;
  pullUpDistance_nm: number;
  pullUpAngle_deg: number;
  releaseAltitude_ft: number;
  egressHeading_deg: number;
}

export interface StandoffProfile extends IpAnchorFields {
  type: 'standoff';
  releasePoint: Coordinates;
  releaseAltitude_ft: number;
  releaseSpeed_ktas: number;
  releaseHeading_deg: number;
  standoffDistance_nm: number;
}
