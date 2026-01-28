//! Tauri command handlers
//!
//! This module contains all the command handlers that are exposed to the frontend
//! via Tauri's IPC mechanism.

use crate::db;
use crate::parsers::{
    self, dcs_to_latlon, get_theater_params, get_threat_info, meters_to_feet, mps_to_ktas,
    normalize_theater_name, ProcessedCoordinates, ProcessedFragOrdersData, ProcessedPlayerGroup,
    ProcessedThreat, ProcessedTriggerZone, ProcessedUnit, ProcessedWaypoint, ThreatMatchConfidence,
};
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

/// Parse FragOrders JSON output and convert to Phoenix Weaponeer format
///
/// This command takes the raw JSON output from FragOrders CLI and processes it:
/// 1. Normalizes theater name
/// 2. Converts DCS coordinates to lat/lon
/// 3. Extracts player-flyable groups with waypoints
/// 4. Identifies threat units and maps them to database entries
/// 5. Extracts trigger zones
#[tauri::command]
pub fn parse_fragorders_json(
    state: State<AppState>,
    json_str: String,
) -> Result<ProcessedFragOrdersData, String> {
    // Parse the JSON
    let mission = parsers::parse_fragorders_json(&json_str)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    // Get theater and coordinate parameters
    let theater_name = mission.theater.as_deref().unwrap_or("Unknown");
    let normalized_theater = normalize_theater_name(theater_name);
    let theater_params = get_theater_params(theater_name)
        .ok_or_else(|| format!("Unknown theater: {}", theater_name))?;

    // Process bullseye
    let bullseye = mission
        .coalition
        .blue
        .as_ref()
        .and_then(|b| b.bullseye.as_ref())
        .map(|be| {
            let (lat, lon) = dcs_to_latlon(be.x, be.y, theater_params);
            ProcessedCoordinates { lat, lon }
        })
        .unwrap_or(ProcessedCoordinates { lat: 0.0, lon: 0.0 });

    // Extract player groups from blue coalition
    let mut player_groups = Vec::new();
    if let Some(blue) = &mission.coalition.blue {
        for country in &blue.country {
            // Check planes
            if let Some(planes) = &country.plane {
                for group in &planes.group {
                    if group.has_player() {
                        if let Some(processed) = process_player_group(group, theater_params) {
                            player_groups.push(processed);
                        }
                    }
                }
            }
            // Check helicopters
            if let Some(helis) = &country.helicopter {
                for group in &helis.group {
                    if group.has_player() {
                        if let Some(processed) = process_player_group(group, theater_params) {
                            player_groups.push(processed);
                        }
                    }
                }
            }
        }
    }

    // Extract threats from red coalition
    let mut threats = Vec::new();
    if let Some(red) = &mission.coalition.red {
        for country in &red.country {
            // Check vehicles (ground threats)
            if let Some(vehicles) = &country.vehicle {
                for group in &vehicles.group {
                    let group_name = group.name.clone().unwrap_or_default();
                    for unit in &group.units {
                        if let Some(unit_type) = &unit.unit_type {
                            if parsers::is_threat_unit(unit_type) {
                                let threat = process_threat_unit(
                                    &group_name,
                                    unit,
                                    unit_type,
                                    theater_params,
                                    &state.db,
                                );
                                threats.push(threat);
                            }
                        }
                    }
                }
            }
        }
    }

    // Deduplicate threats by position (keep one per approximate location)
    threats = deduplicate_threats(threats);

    // Extract trigger zones
    let mut trigger_zones = Vec::new();
    if let Some(triggers) = &mission.triggers {
        for zone in &triggers.zones {
            let (lat, lon) = dcs_to_latlon(zone.x, zone.y, theater_params);
            trigger_zones.push(ProcessedTriggerZone {
                name: zone.name.clone().unwrap_or_else(|| format!("Zone {}", zone.zone_id.unwrap_or(0))),
                center: ProcessedCoordinates { lat, lon },
                radius_m: zone.radius,
            });
        }
    }

    Ok(ProcessedFragOrdersData {
        theater: normalized_theater,
        bullseye,
        player_groups,
        threats,
        trigger_zones,
    })
}

/// Process a player group into the output format
fn process_player_group(
    group: &parsers::fragorders::Group,
    params: &parsers::TheaterCoordParams,
) -> Option<ProcessedPlayerGroup> {
    let name = group.name.clone().unwrap_or_else(|| "Unknown".to_string());

    // Get aircraft type from first player unit
    let first_player = group.first_player_unit()?;
    let aircraft_type = first_player.unit_type.clone().unwrap_or_else(|| "Unknown".to_string());

    // Get callsign from first player
    let callsign = first_player
        .callsign
        .as_ref()
        .map(|c| c.to_string_representation())
        .unwrap_or_else(|| name.clone());

    // Process units
    let units: Vec<ProcessedUnit> = group
        .units
        .iter()
        .filter(|u| u.is_player())
        .map(|u| ProcessedUnit {
            name: u.name.clone().unwrap_or_default(),
            callsign: u
                .callsign
                .as_ref()
                .map(|c| c.to_string_representation())
                .unwrap_or_default(),
            onboard_num: u.onboard_num.as_ref().map(|n| n.as_string()),
        })
        .collect();

    // Process waypoints
    let waypoints: Vec<ProcessedWaypoint> = group
        .route
        .as_ref()
        .map(|r| {
            r.points
                .iter()
                .enumerate()
                .map(|(i, pt)| {
                    let (lat, lon) = dcs_to_latlon(pt.x, pt.y, params);
                    let alt_ft = pt.alt.map(|a| meters_to_feet(a)).unwrap_or(0.0);
                    let speed_ktas = pt.speed.map(|s| mps_to_ktas(s));

                    // Infer waypoint type from name and type
                    let wp_type = infer_waypoint_type(
                        pt.name.as_deref(),
                        pt.point_type.as_deref(),
                        pt.action.as_deref(),
                    );

                    ProcessedWaypoint {
                        steerpoint: (i + 1) as i32,
                        name: pt.name.clone().unwrap_or_else(|| format!("WP{}", i + 1)),
                        wp_type,
                        position: ProcessedCoordinates { lat, lon },
                        altitude_ft: alt_ft,
                        speed_ktas,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    Some(ProcessedPlayerGroup {
        name,
        callsign,
        aircraft_type,
        units,
        waypoints,
    })
}

/// Process a threat unit into output format
fn process_threat_unit(
    group_name: &str,
    unit: &parsers::fragorders::Unit,
    unit_type: &str,
    params: &parsers::TheaterCoordParams,
    db: &db::Database,
) -> ProcessedThreat {
    let (lat, lon) = dcs_to_latlon(unit.x, unit.y, params);

    // Try to map to database entry
    let (system_id, system_name, confidence) = if let Some((normalized, conf)) = get_threat_info(unit_type) {
        // Look up in database
        match db.get_threat_by_dcs_name(normalized) {
            Ok(Some(threat)) => {
                let confidence = if conf > 0.8 {
                    ThreatMatchConfidence::High
                } else if conf > 0.5 {
                    ThreatMatchConfidence::Medium
                } else {
                    ThreatMatchConfidence::Low
                };
                (Some(threat.id), Some(threat.name), confidence)
            }
            _ => (None, None, ThreatMatchConfidence::Unknown),
        }
    } else {
        (None, None, ThreatMatchConfidence::Unknown)
    };

    ProcessedThreat {
        unit_type: unit_type.to_string(),
        group_name: group_name.to_string(),
        position: ProcessedCoordinates { lat, lon },
        system_id,
        system_name,
        confidence,
    }
}

/// Infer Phoenix waypoint type from DCS waypoint data
fn infer_waypoint_type(name: Option<&str>, point_type: Option<&str>, action: Option<&str>) -> String {
    let name_upper = name.unwrap_or("").to_uppercase();
    let action_upper = action.unwrap_or("").to_uppercase();

    // Check name patterns
    if name_upper.contains("IP") {
        return "ip".to_string();
    }
    if name_upper.contains("TGT") || name_upper.contains("TARGET") {
        return "target".to_string();
    }
    if name_upper.contains("CAP") {
        return "cap".to_string();
    }
    if name_upper.contains("MARSHAL") || name_upper.contains("HOLD") {
        return "marshal".to_string();
    }
    if name_upper.contains("TANKER") || name_upper.contains("ARCO") || name_upper.contains("TEXACO") {
        return "tanker".to_string();
    }
    if name_upper.contains("BULLS") || name_upper.contains("BE") {
        return "bullseye".to_string();
    }

    // Check DCS point type
    match point_type {
        Some("Land") | Some("Landing") => return "divert".to_string(),
        Some("Takeoff") | Some("TakeOff") | Some("Takeoff Parking Hot") => return "nav".to_string(),
        _ => {}
    }

    // Check action
    if action_upper.contains("LAND") {
        return "divert".to_string();
    }
    if action_upper.contains("ORBIT") || action_upper.contains("HOLD") {
        return "marshal".to_string();
    }

    // Default to nav
    "nav".to_string()
}

/// Deduplicate threats by approximate position (within ~500m)
fn deduplicate_threats(threats: Vec<ProcessedThreat>) -> Vec<ProcessedThreat> {
    let mut result: Vec<ProcessedThreat> = Vec::new();
    let threshold = 0.005; // ~500m in degrees

    for threat in threats {
        let dominated = result.iter().any(|existing| {
            let lat_diff = (existing.position.lat - threat.position.lat).abs();
            let lon_diff = (existing.position.lon - threat.position.lon).abs();
            lat_diff < threshold && lon_diff < threshold
        });

        if !dominated {
            result.push(threat);
        }
    }

    result
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
