export interface Weapon {
  id: string;
  name: string; // "Mk-82 LDGP"
  category: WeaponCategory;

  // Physical properties
  weight_lbs: number;
  dragIndex?: number; // For ballistic calculations

  // Guidance
  guidance: GuidanceType;

  // Delivery constraints
  minReleaseAlt_ft: number;
  maxReleaseAlt_ft: number;
  minReleaseSpeed_ktas: number;
  maxReleaseSpeed_ktas: number;

  // Fuzing options
  fuzeOptions: FuzeOption[];

  // Fragmentation data
  fragPattern?: FragPattern;

  // DCS-specific
  dcsWeaponName: string;
}

export type WeaponCategory =
  | 'bomb_unguided'
  | 'bomb_guided'
  | 'bomb_gps'
  | 'missile_agm'
  | 'rocket'
  | 'gun'
  | 'cluster'
  | 'standoff';

export type GuidanceType = 'none' | 'laser' | 'gps' | 'ir' | 'tv' | 'radar';

export interface FuzeOption {
  id: string;
  name: string; // "M904 Nose"
  type: 'nose' | 'tail' | 'proximity';
  armingDelay_sec?: number;
  burstHeight_ft?: number; // For proximity fuzes
}

export interface FragPattern {
  lethalRadius_ft: number;
  effectiveRadius_ft: number;
  minSafeAlt_ft: number; // Minimum release altitude for safety
}
