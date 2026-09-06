// Mission
export type { Mission, Theater } from './mission.types';

// Waypoints
export type {
  Waypoint,
  WaypointType,
  Coordinates,
  TargetInfo,
} from './waypoint.types';

// Threats
export type {
  ThreatSystem,
  ThreatType,
  RadarInfo,
  GunInfo,
  ThreatInstance,
  ThreatStatus,
  ThreatSource,
} from './threat.types';

// Aircraft
export type {
  Aircraft,
  WeaponStation,
  DeliveryMode,
} from './aircraft.types';

// Weapons
export type {
  Weapon,
  DbWeapon,
  WeaponCategory,
  GuidanceType,
  FuzeOption,
  FragPattern,
} from './weapon.types';

// Flight
export type {
  FlightMember,
  FlightRole,
  LoadoutItem,
} from './flight.types';

// Attack
export type {
  Attack,
  AttackProfileType,
  AttackProfile,
  LevelCCRPProfile,
  DiveCCIPProfile,
  PopupCCIPProfile,
  LoftCCRPProfile,
  StandoffProfile,
} from './attack.types';

// Delivery profiles
export type {
  DeliveryProfile,
  ProfileGeometry,
  DeliveryModeCode,
  WeaponClass,
  ProfileParams,
  LevelParams,
  DiveParams,
  PopupParams,
  LoftParams,
  SightSetting,
  ProfileLibrary,
} from './profile.types';
export {
  SUPPORTED_GEOMETRIES,
  levelParams,
  diveParams,
  popupParams,
  loftParams,
} from './profile.types';

// Calculator
export type {
  PopupCCIPInput,
  PopupCCIPResult,
} from './calculator.types';

// Kneeboard
export type {
  KneeboardCard,
  KneeboardHeader,
  KneeboardTargetSection,
  KneeboardThreatSection,
  KneeboardThreatItem,
  KneeboardAttackSection,
  KneeboardWeaponSection,
  KneeboardEgressSection,
} from './kneeboard.types';

// FragOrders Import
export type {
  FragOrdersData,
  FragOrdersPlayerGroup,
  FragOrdersUnit,
  FragOrdersWaypoint,
  FragOrdersThreat,
  ThreatMatchConfidence,
  FragOrdersTriggerZone,
  FragOrdersImportOptions,
} from './fragorders.types';

export {
  getConfidenceLabel,
  getConfidenceClass,
  meetsConfidenceThreshold,
} from './fragorders.types';
