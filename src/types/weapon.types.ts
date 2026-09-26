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

/**
 * A weapon row exactly as `get_all_weapons` returns it — snake_case, straight
 * off the Rust `Weapon` struct in `src-tauri/src/db/mod.rs`, with no serde
 * rename. This is the shape that actually exists at runtime.
 *
 * `Weapon` above is the camelCase model the UI was written against. The
 * mismatch silently disabled the attack editor's weapon-constraint check: it
 * read `minReleaseAlt_ft`, which is never present, so every release altitude
 * passed. Anything reading DB weapon fields should use this type.
 */
export interface DbWeapon {
  id: string;
  name: string;
  category: WeaponCategory | string;
  weight_lbs: number;
  drag_index?: number | null;
  guidance: GuidanceType | string;
  min_release_alt_ft?: number | null;
  max_release_alt_ft?: number | null;
  min_release_speed_ktas?: number | null;
  max_release_speed_ktas?: number | null;
  frag_lethal_radius_ft?: number | null;
  frag_effective_radius_ft?: number | null;
  frag_min_safe_alt_ft?: number | null;
  dcs_weapon_name?: string | null;
  notes?: string | null;
  /** Aircraft ids that carry it (the database's aircraft_weapons). */
  carried_by?: string[];
}
