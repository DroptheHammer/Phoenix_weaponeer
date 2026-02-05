/**
 * Calculator types for attack profile computations
 *
 * These match the Rust backend types for Tauri command serialization
 */

export interface PopupCCIPInput {
  target_elevation_ft: number;
  run_in_altitude_agl: number;
  run_in_speed_ktas: number;
  pop_distance_nm: number;
  apex_altitude_agl: number;
  dive_angle_deg: number;
  weapon_id: string;
}

export interface PopupCCIPResult {
  climb_angle_deg: number;
  apex_altitude_msl: number;
  roll_in_altitude_agl: number;
  release_altitude_agl: number;
  release_speed_ktas: number;
  min_safe_altitude_agl: number;
  pullout_altitude_agl: number;
  time_to_release_sec: number;
}
