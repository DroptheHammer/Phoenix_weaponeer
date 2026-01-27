//! Tauri command handlers
//!
//! This module contains all the command handlers that are exposed to the frontend
//! via Tauri's IPC mechanism.

use crate::db;
use crate::AppState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

/// Mission data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mission {
    pub id: String,
    pub name: String,
    pub date: String,
    pub theater: String,
    pub bullseye: Coordinates,
    pub waypoints: Vec<Value>,
    pub threats: Vec<Value>,
    pub flight_members: Vec<Value>,
    pub attacks: Vec<Value>,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Coordinates {
    pub lat: f64,
    pub lon: f64,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MizData {
    pub theater: String,
    pub bullseye: Coordinates,
    pub waypoints: Vec<Value>,
    pub threats: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttackCalculationResult {
    pub release_altitude_ft: f64,
    pub release_speed_ktas: f64,
    pub time_to_release_sec: f64,
    pub min_safe_altitude_ft: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatExposure {
    pub threat_id: String,
    pub threat_name: String,
    pub min_distance_nm: f64,
    pub exposure_time_sec: f64,
    pub risk_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatExposureResult {
    pub exposures: Vec<ThreatExposure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KneeboardCard {
    pub id: String,
    pub flight_member_id: String,
    pub attack_id: String,
    pub header: Value,
    pub target_section: Value,
    pub threat_section: Value,
    pub attack_section: Value,
    pub weapon_section: Value,
    pub egress_section: Value,
}

// ============================================================================
// Mission Commands
// ============================================================================

/// Create a new mission
#[tauri::command]
pub fn new_mission(name: String, theater: String) -> Result<Mission, String> {
    let now = chrono_now();
    Ok(Mission {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        date: now.split('T').next().unwrap_or(&now).to_string(),
        theater,
        bullseye: Coordinates { lat: 0.0, lon: 0.0 },
        waypoints: vec![],
        threats: vec![],
        flight_members: vec![],
        attacks: vec![],
        notes: String::new(),
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Save mission to file
#[tauri::command]
pub fn save_mission(mission: Mission, path: String) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&mission).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// Load mission from file
#[tauri::command]
pub fn load_mission(path: String) -> Result<Mission, String> {
    let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mission: Mission = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(mission)
}

// ============================================================================
// Database Commands
// ============================================================================

/// Get all threat systems from the database
#[tauri::command]
pub fn get_all_threats(state: State<AppState>) -> Result<Vec<db::ThreatSystem>, String> {
    state.db.get_all_threats().map_err(|e| e.to_string())
}

/// Get threats filtered by type (SAM, AAA, MANPADS, SHORAD, EWR)
#[tauri::command]
pub fn get_threats_by_type(state: State<AppState>, threat_type: String) -> Result<Vec<db::ThreatSystem>, String> {
    state.db.get_threats_by_type(&threat_type).map_err(|e| e.to_string())
}

/// Get all weapons from the database
#[tauri::command]
pub fn get_all_weapons(state: State<AppState>) -> Result<Vec<db::Weapon>, String> {
    state.db.get_all_weapons().map_err(|e| e.to_string())
}

/// Get weapons compatible with a specific aircraft
#[tauri::command]
pub fn get_weapons_for_aircraft(state: State<AppState>, aircraft_id: String) -> Result<Vec<db::Weapon>, String> {
    state.db.get_weapons_for_aircraft(&aircraft_id).map_err(|e| e.to_string())
}

/// Get all aircraft from the database
#[tauri::command]
pub fn get_all_aircraft(state: State<AppState>) -> Result<Vec<db::Aircraft>, String> {
    state.db.get_all_aircraft().map_err(|e| e.to_string())
}

/// Get fuze options for a specific weapon
#[tauri::command]
pub fn get_fuze_options(state: State<AppState>, weapon_id: String) -> Result<Vec<db::FuzeOption>, String> {
    state.db.get_fuze_options(&weapon_id).map_err(|e| e.to_string())
}

// ============================================================================
// Import Commands
// ============================================================================

/// Parse a DCS .miz file
#[tauri::command]
pub fn parse_miz_file(path: String) -> Result<MizData, String> {
    // TODO: Implement .miz file parsing
    // This will use the zip crate to extract and mlua to parse Lua files
    Err(format!(
        "MIZ parsing not yet implemented for: {}",
        path
    ))
}

// ============================================================================
// Calculation Commands
// ============================================================================

/// Calculate attack profile parameters
#[tauri::command]
pub fn calculate_attack_profile(
    profile_type: String,
    params: Value,
    weapon_id: String,
    target_elevation: f64,
) -> Result<AttackCalculationResult, String> {
    // TODO: Implement attack profile calculations
    // This will use the calculators module
    let _ = (profile_type, params, weapon_id, target_elevation);
    Ok(AttackCalculationResult {
        release_altitude_ft: 4500.0,
        release_speed_ktas: 450.0,
        time_to_release_sec: 15.0,
        min_safe_altitude_ft: 3000.0,
    })
}

/// Calculate threat exposure during an attack run
#[tauri::command]
pub fn calculate_threat_exposure(
    attack: Value,
    threats: Vec<Value>,
    target: Coordinates,
) -> Result<ThreatExposureResult, String> {
    // TODO: Implement threat exposure calculations
    let _ = (attack, threats, target);
    Ok(ThreatExposureResult { exposures: vec![] })
}

// ============================================================================
// Export Commands
// ============================================================================

/// Render a kneeboard card to PNG
#[tauri::command]
pub fn render_kneeboard(card: KneeboardCard) -> Result<Vec<u8>, String> {
    // TODO: Implement kneeboard rendering using the image crate
    let _ = card;
    Err("Kneeboard rendering not yet implemented".to_string())
}

/// Export kneeboard cards to DCS kneeboard folder
#[tauri::command]
pub fn export_to_dcs_kneeboard(
    cards: Vec<KneeboardCard>,
    aircraft: String,
    dcs_path: String,
) -> Result<(), String> {
    // TODO: Implement export to DCS kneeboard folder
    let _ = (cards, aircraft, dcs_path);
    Err("DCS export not yet implemented".to_string())
}

// ============================================================================
// Utility Functions
// ============================================================================

/// Get current timestamp in ISO format
fn chrono_now() -> String {
    // Simple ISO timestamp without chrono dependency
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    // Approximate ISO format (good enough for scaffolding)
    format!("2024-01-01T00:00:{}Z", secs % 86400)
}
