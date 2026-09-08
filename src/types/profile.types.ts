/**
 * Delivery profile library.
 *
 * A profile is a named, pre-weaponeered way of delivering a class of weapon
 * from a specific aircraft — "30° Dive CCIP", "DTOS 20°", "Manual dive,
 * 105 mils". The pilot picks one; the tool fills the attack in. The numbers
 * are the tool's responsibility, not the pilot's.
 *
 * Mirrors the Rust struct in `src-tauri/src/profiles/mod.rs`, which is where
 * the files are parsed and validated. Bundled profiles live in
 * `src-tauri/resources/profiles/<aircraftId>.json`; a squadron can override
 * or add profiles in `<app data>/profiles/*.json`.
 *
 * Every altitude in `params` is **ft AGL** over the target. Level deliveries
 * are converted to MSL when an attack is instantiated.
 */

/** How the aircraft moves through the delivery. Drives geometry, overlay and card diagram. */
export type ProfileGeometry = 'level' | 'dive' | 'popup' | 'loft';

/** What the jet's weapons system is doing. Drives the step text on the card. */
export type DeliveryModeCode = 'CCIP' | 'CCRP' | 'AUTO' | 'DTOS' | 'MAN' | 'LABS' | 'LADD' | 'VIS';

/** Coarse weapon grouping a profile is written for. See `weaponClassOf`. */
export type WeaponClass = 'bomb_ld' | 'bomb_hd' | 'lgb' | 'jdam' | 'rocket' | 'gun' | 'cluster' | 'agm';

export const SUPPORTED_GEOMETRIES: ProfileGeometry[] = ['level', 'dive', 'popup'];

/** Optional run-in anchors any visual profile may carry; defaults apply when absent. */
export interface ActionPointParams {
  actionRange_nm?: number; // range from the target for the check turn; default 4.5
  offsetAngle_deg?: number; // the check turn; default 20° (dive, level) or the handbook's guide (pop-up)
}

export interface LevelParams extends ActionPointParams {
  releaseAltitude_ft: number; // AGL
  releaseSpeed_ktas: number;
}

export interface DiveParams extends ActionPointParams {
  rollInAltitude_ft: number; // AGL
  diveAngle_deg: number;
  releaseAltitude_ft: number; // AGL — floored to the weapon at auto-build time
  releaseSpeed_ktas: number;
  pulloutG?: number;
  ingressAltitude_ft?: number; // AGL, before roll-in; defaults to roll-in altitude
}

/**
 * Pop-up inputs, the handbook's way (docs/DELIVERY_PLANNING.md): the pilot
 * states dive angle and release floor; apex, pull-down altitude, climb angle,
 * angle-off and pop distance are derived at auto-build time.
 */
export interface PopupParams extends ActionPointParams {
  runInAltitude_ft: number; // AGL
  runInSpeed_ktas: number; // TAS through the profile
  diveAngle_deg: number;
  releaseAltitude_ft: number; // AGL floor — raised to the weapon at auto-build time
  trackingTime_s?: number; // wings-level tracking before release; default 5
  pullG?: number; // pull-up and pull-down; default 3.5
  minAltitude_ft: number; // hard deck, AGL
}

export interface LoftParams {
  ingressAltitude_ft: number; // AGL
  ingressSpeed_ktas: number;
  pullUpDistance_nm: number;
  pullUpAngle_deg: number;
  releaseAltitude_ft: number; // AGL
}

export type ProfileParams = LevelParams | DiveParams | PopupParams | LoftParams;

export interface SightSetting {
  /** Fixed-sight depression for manual deliveries (F-4E, A-4, F-5, Mirage F1) */
  depression_mils?: number;
  notes?: string;
}

export interface DeliveryProfile {
  /** "<aircraftId>.<something>", e.g. "f16c.dive.ccip30" */
  id: string;
  aircraftId: string;
  name: string;
  summary?: string;
  geometry: ProfileGeometry;
  deliveryMode: DeliveryModeCode;
  weaponClasses: WeaponClass[];
  params: ProfileParams;
  sight?: SightSetting;
  /** Aircraft-specific step lines merged into the card's procedure */
  procedure?: string[];
  /**
   * Weapon classes this is the go-to profile for on this aircraft — what
   * auto-build reaches for first. A subset of `weaponClasses`: a dive CCIP
   * profile can be *available* for an LGB while the level CCRP one is the
   * default for it.
   */
  defaultFor?: WeaponClass[];
  source: string;
  /** False until a pilot has flown it in DCS. The card says so. */
  verified: boolean;
  verifiedBy?: string;
  verifiedOn?: string;
}

// Narrowing helpers — the discriminant is `geometry` on the parent.
export function levelParams(p: DeliveryProfile): LevelParams | null {
  return p.geometry === 'level' ? (p.params as LevelParams) : null;
}
export function diveParams(p: DeliveryProfile): DiveParams | null {
  return p.geometry === 'dive' ? (p.params as DiveParams) : null;
}
export function popupParams(p: DeliveryProfile): PopupParams | null {
  return p.geometry === 'popup' ? (p.params as PopupParams) : null;
}
export function loftParams(p: DeliveryProfile): LoftParams | null {
  return p.geometry === 'loft' ? (p.params as LoftParams) : null;
}

/** What `list_delivery_profiles` returns: the merged library plus any user files it could not read. */
export interface ProfileLibrary {
  profiles: DeliveryProfile[];
  warnings: string[];
}
