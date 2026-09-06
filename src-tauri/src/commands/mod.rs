//! Tauri command handlers
//!
//! This module contains all the command handlers that are exposed to the frontend
//! via Tauri's IPC mechanism.

use crate::calculators;
use crate::db;
use crate::parsers::{
    self, dcs_to_latlon, get_theater_params, get_threat_info, meters_to_feet, mps_to_ktas,
    normalize_theater_name, ProcessedCoordinates, ProcessedFragOrdersData, ProcessedPlayerGroup,
    ProcessedThreat, ProcessedTriggerZone, ProcessedUnit, ProcessedWaypoint, ThreatMatchConfidence,
};
use crate::profiles;
use crate::AppState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::ShellExt;

/// Mission data structure
///
/// The field names here are the on-disk format of a saved mission *and* the
/// IPC contract with the frontend, whose `Mission` interface
/// (`src/types/mission.types.ts`) is camelCase. Hence `rename_all`: without it
/// `save_mission` rejects the store's mission with `missing field
/// 'flight_members'`.
///
/// Any field added here later needs `#[serde(default)]`, or every mission
/// saved before that day stops loading.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

/// Input parameters for popup CCIP calculation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PopupCCIPInput {
    pub target_elevation_ft: f64,
    pub run_in_altitude_agl: f64,
    pub run_in_speed_ktas: f64,
    pub pop_distance_nm: f64,
    pub apex_altitude_agl: f64,
    pub dive_angle_deg: f64,
    pub weapon_id: String,
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
// Delivery Profile Commands
// ============================================================================

/// The squadron's profile folder: `<app data>/profiles`, next to the database.
/// Created on first use with a README explaining the format.
fn profiles_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?
        .join("profiles");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create {}: {e}", dir.display()))?;
        std::fs::write(dir.join("README.txt"), profiles::USER_DIR_README)
            .map_err(|e| format!("Cannot write README: {e}"))?;
    }
    Ok(dir)
}

/// Bundled profiles merged with the squadron's overrides. Unreadable user
/// files come back as warnings so the UI can say so.
#[tauri::command]
pub fn list_delivery_profiles(app: AppHandle) -> Result<profiles::ProfileLibrary, String> {
    let dir = profiles_dir(&app)?;
    profiles::load_all(&dir)
}

/// Open the squadron profile folder in Finder / Explorer.
///
/// `Shell::open` is deprecated in favour of tauri-plugin-opener; it still
/// works, and a second plugin for one folder-reveal is not worth it yet.
#[allow(deprecated)]
#[tauri::command]
pub fn reveal_profiles_dir(app: AppHandle) -> Result<String, String> {
    let dir = profiles_dir(&app)?;
    let path = dir.to_string_lossy().to_string();
    app.shell()
        .open(path.clone(), None)
        .map_err(|e| format!("Cannot open {path}: {e}"))?;
    Ok(path)
}

// ============================================================================
// Theater Commands
// ============================================================================

/// A DCS theater as advertised to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TheaterInfo {
    /// Theater name as DCS writes it (e.g. "SinaiMap")
    pub dcs_name: String,
    /// Stable id used throughout the app (e.g. "sinai")
    pub id: String,
    /// Human-readable name for the UI
    pub display_name: String,
    /// Whether missions on this map can be imported at all
    pub supported: bool,
    /// Whether the projection has been independently confirmed
    pub verified: bool,
    /// (lat, lon) to centre the map on when there is nothing to frame
    pub default_center: Coordinates,
}

/// List every DCS theater the app knows about.
///
/// `THEATER_PARAMS` in `coordinate_conversion.rs` is the single source of truth
/// for this. The frontend used to keep its own parallel copy of the list, which
/// drifted — it was missing three maps outright. Adding a map should mean
/// editing one table, not three.
#[tauri::command]
pub fn list_theaters() -> Vec<TheaterInfo> {
    parsers::all_theater_params()
        .iter()
        .map(|p| TheaterInfo {
            dcs_name: p.dcs_name.to_string(),
            id: p.normalized_name.to_string(),
            display_name: p.display_name.to_string(),
            supported: !p.proj4_string.is_empty(),
            verified: p.verified,
            default_center: Coordinates {
                lat: p.default_center.0,
                lon: p.default_center.1,
            },
        })
        .collect()
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

    // A known theater with no projection string is worse than an unknown one:
    // every dcs_to_latlon call below would fail, so the import would "succeed"
    // with a (0,0) bullseye, no waypoints and no threats. Fail loudly instead.
    if theater_params.proj4_string.is_empty() {
        return Err(format!(
            "Theater {} is recognized but has no coordinate projection defined yet, \
             so waypoints and threats cannot be positioned. Supported theaters: {}.",
            theater_name,
            parsers::supported_theater_names().join(", ")
        ));
    }

    // Process bullseye. Unlike waypoints, a missing bullseye is normal (not every
    // mission defines one) — but a conversion *failure* is not, so it is reported
    // rather than quietly becoming (0,0) off the coast of Africa.
    let bullseye = match mission
        .coalition
        .blue
        .as_ref()
        .and_then(|b| b.bullseye.as_ref())
    {
        Some(be) => match dcs_to_latlon(be.x, be.y, theater_params) {
            Ok((lat, lon)) => ProcessedCoordinates { lat, lon },
            Err(e) => {
                return Err(format!("Failed to convert bullseye coordinates: {}", e));
            }
        },
        None => ProcessedCoordinates { lat: 0.0, lon: 0.0 },
    };

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
                                if let Some(threat) = process_threat_unit(
                                    &group_name,
                                    unit,
                                    unit_type,
                                    theater_params,
                                    &state.db,
                                ) {
                                    threats.push(threat);
                                }
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
            let name = zone
                .name
                .clone()
                .unwrap_or_else(|| format!("Zone {}", zone.zone_id.unwrap_or(0)));
            match dcs_to_latlon(zone.x, zone.y, theater_params) {
                Ok((lat, lon)) => trigger_zones.push(ProcessedTriggerZone {
                    name,
                    center: ProcessedCoordinates { lat, lon },
                    radius_m: zone.radius,
                }),
                Err(e) => eprintln!("WARNING: dropping trigger zone {:?}: {}", name, e),
            }
        }
    }

    Ok(ProcessedFragOrdersData {
        theater: normalized_theater,
        theater_display_name: theater_params.display_name.to_string(),
        projection_verified: theater_params.verified,
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
                .filter_map(|(i, pt)| {
                    // A waypoint with no usable coordinates cannot be planned
                    // against, so it is still dropped — but say so rather than
                    // letting it vanish from the route without a trace.
                    let (lat, lon) = match dcs_to_latlon(pt.x, pt.y, params) {
                        Ok(coords) => coords,
                        Err(e) => {
                            eprintln!(
                                "WARNING: dropping waypoint {} {:?}: {}",
                                i + 1,
                                pt.name,
                                e
                            );
                            return None;
                        }
                    };
                    let alt_ft = pt.alt.map(|a| meters_to_feet(a)).unwrap_or(0.0);
                    let speed_ktas = pt.speed.map(|s| mps_to_ktas(s));

                    // Infer waypoint type from name and type
                    let wp_type = infer_waypoint_type(
                        pt.name.as_deref(),
                        pt.point_type.as_deref(),
                        pt.action.as_deref(),
                    );

                    Some(ProcessedWaypoint {
                        steerpoint: (i + 1) as i32,
                        name: pt.name.clone().unwrap_or_else(|| format!("WP{}", i + 1)),
                        wp_type,
                        position: ProcessedCoordinates { lat, lon },
                        altitude_ft: alt_ft,
                        speed_ktas,
                    })
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
) -> Option<ProcessedThreat> {
    // Previously fell back to (0.0, 0.0), which silently placed unconvertible
    // threats in the Gulf of Guinea instead of reporting the failure.
    let (lat, lon) = match dcs_to_latlon(unit.x, unit.y, params) {
        Ok(coords) => coords,
        Err(e) => {
            eprintln!(
                "WARNING: dropping threat {:?} in group {:?} ({}): {}",
                unit.name, group_name, unit_type, e
            );
            return None;
        }
    };

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

    Some(ProcessedThreat {
        unit_type: unit_type.to_string(),
        group_name: group_name.to_string(),
        position: ProcessedCoordinates { lat, lon },
        system_id,
        system_name,
        confidence,
    })
}

/// Infer Phoenix waypoint type from DCS waypoint data
fn infer_waypoint_type(name: Option<&str>, point_type: Option<&str>, action: Option<&str>) -> String {
    let name_upper = name.unwrap_or("").to_uppercase();
    let action_upper = action.unwrap_or("").to_uppercase();

    // Match whole tokens, not substrings: "SLIP" is not an IP, "BEACH" is not a
    // bullseye. Split on anything non-alphanumeric so "IP ALPHA", "TGT-1" and
    // "IP/ALPHA" all tokenize the way a planner would read them.
    let tokens: Vec<&str> = name_upper
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .collect();
    let has = |t: &str| tokens.iter().any(|tok| *tok == t);
    // Numbered variants are common ("TGT1", "IP2"), so also accept a token that
    // is the keyword followed only by digits.
    let has_numbered = |t: &str| {
        tokens.iter().any(|tok| {
            tok.strip_prefix(t)
                .map(|rest| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()))
                .unwrap_or(false)
        })
    };

    // Check name patterns
    if has("IP") || has_numbered("IP") {
        return "ip".to_string();
    }
    if has("TGT") || has_numbered("TGT") || has("TARGET") || has_numbered("TARGET") {
        return "target".to_string();
    }
    if has("CAP") || has_numbered("CAP") {
        return "cap".to_string();
    }
    if has("MARSHAL") || has("HOLD") {
        return "marshal".to_string();
    }
    // Only explicit words imply a tanker waypoint. Tanker *callsigns* (ARCO,
    // TEXACO, SHELL) are deliberately excluded: they are also ordinary nav-fix
    // names, and real missions do use them that way — NTTR Red Flag routes a
    // strike package through a turnpoint named "ARCO" that is not an AAR track.
    if has("TANKER") || has("AAR") || has("REFUEL") || has("REFUELING") {
        return "tanker".to_string();
    }
    if has("BULLS") || has("BULLSEYE") || has("BE") {
        return "bullseye".to_string();
    }

    // Check DCS point type. DCS spells these several ways across versions and
    // export paths ("TakeOffParkingHot", "TakeOffParking", "Takeoff"), so
    // normalize before comparing rather than listing every literal.
    let type_norm = point_type
        .unwrap_or("")
        .to_uppercase()
        .replace(|c: char| !c.is_alphanumeric(), "");
    if type_norm == "LAND" || type_norm == "LANDING" {
        return "divert".to_string();
    }
    if type_norm.starts_with("TAKEOFF") {
        return "nav".to_string();
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

/// Calculate popup CCIP attack profile
#[tauri::command]
pub fn calculate_popup_ccip(
    state: State<AppState>,
    input: PopupCCIPInput,
) -> Result<calculators::PopupCCIPResult, String> {
    // Look up weapon from database
    let weapon = state
        .db
        .get_weapon_by_id(&input.weapon_id)
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| format!("Weapon not found: {}", input.weapon_id))?;

    // Convert to calculator's WeaponParams
    let weapon_params = calculators::WeaponParams {
        weight_lbs: weapon.weight_lbs,
        drag_index: weapon.drag_index.unwrap_or(0.027),
        min_release_alt_ft: weapon.min_release_alt_ft.unwrap_or(3000.0),
        frag_min_safe_alt_ft: weapon.frag_min_safe_alt_ft,
    };

    // Call existing calculator
    let result = calculators::calculate_popup_ccip(
        input.target_elevation_ft,
        input.run_in_altitude_agl,
        input.run_in_speed_ktas,
        input.pop_distance_nm,
        input.apex_altitude_agl,
        input.dive_angle_deg,
        &weapon_params,
    );

    Ok(result)
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

/// Save a kneeboard PNG (base64-encoded) to a file path
///
/// The frontend renders the card to a canvas and sends the PNG as a base64 string.
/// This command decodes and writes it to disk.
#[tauri::command]
pub fn save_kneeboard_png(path: String, base64_data: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

/// Detect the DCS "Saved Games" folder path
///
/// Windows: %USERPROFILE%\Saved Games\DCS
/// Mac/Linux: DCS not officially supported, returns None
#[tauri::command]
pub fn detect_dcs_folder() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::env;

        // Try standard location: %USERPROFILE%\Saved Games\DCS
        if let Ok(profile) = env::var("USERPROFILE") {
            let dcs_path = format!("{}\\Saved Games\\DCS", profile);
            if std::path::Path::new(&dcs_path).exists() {
                return Ok(Some(dcs_path));
            }
        }

        // Try legacy DCS.openbeta if main not found
        if let Ok(profile) = env::var("USERPROFILE") {
            let beta_path = format!("{}\\Saved Games\\DCS.openbeta", profile);
            if std::path::Path::new(&beta_path).exists() {
                return Ok(Some(beta_path));
            }
        }

        Ok(None)
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Mac/Linux: DCS not officially supported
        Ok(None)
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn infer(name: &str) -> String {
        infer_waypoint_type(Some(name), Some("Turning Point"), Some("Turning Point"))
    }

    #[test]
    fn infers_types_from_whole_tokens() {
        assert_eq!(infer("IP ALPHA"), "ip");
        assert_eq!(infer("IP"), "ip");
        assert_eq!(infer("IP2"), "ip");
        assert_eq!(infer("TGT WAREHOUSE"), "target");
        assert_eq!(infer("TGT1"), "target");
        assert_eq!(infer("TARGET"), "target");
        assert_eq!(infer("MARSHAL"), "marshal");
        assert_eq!(infer("BULLSEYE"), "bullseye");
        assert_eq!(infer("TANKER"), "tanker");
    }

    #[test]
    fn substrings_do_not_trigger_false_matches() {
        // Previously "SLIP"/"SHIP" matched IP and "BEACH" matched bullseye.
        assert_eq!(infer("SLIP"), "nav");
        assert_eq!(infer("SHIP"), "nav");
        assert_eq!(infer("BEACH"), "nav");
        assert_eq!(infer("ABERDEEN"), "nav");
        assert_eq!(infer("EGRESS"), "nav");
    }

    #[test]
    fn tanker_callsigns_are_not_tanker_waypoints() {
        // NTTR Red Flag routes the Viper package through a turnpoint named
        // "ARCO", which is a nav fix even though ARCO is also a tanker callsign.
        assert_eq!(infer("ARCO"), "nav");
        assert_eq!(infer("TEXACO"), "nav");
        assert_eq!(infer("SHELL"), "nav");
    }

    #[test]
    fn point_type_spellings_are_normalized() {
        assert_eq!(infer_waypoint_type(Some("LAND"), Some("Land"), Some("Landing")), "divert");
        // DCS exports this as "TakeOffParkingHot" — no spaces.
        assert_eq!(
            infer_waypoint_type(None, Some("TakeOffParkingHot"), Some("From Parking Area Hot")),
            "nav"
        );
        assert_eq!(infer_waypoint_type(None, Some("TakeOffParking"), None), "nav");
    }

    /// The real Viper 1 (Hot) route from NTTR_Training_RF_v13, in order.
    #[test]
    fn classifies_real_nttr_redflag_route() {
        let route = [
            ("", "TakeOffParkingHot", "nav"),
            ("", "Turning Point", "nav"),
            ("JUNNO", "Turning Point", "nav"),
            ("DREAM", "Turning Point", "nav"),
            ("MARSHAL", "Turning Point", "marshal"),
            ("MEZ", "Turning Point", "nav"),
            ("IP", "Turning Point", "ip"),
            ("TGT1", "Turning Point", "target"),
            ("TGT2", "Turning Point", "target"),
            ("EGRESS", "Turning Point", "nav"),
            ("ALAMO", "Turning Point", "nav"),
            ("ARCO", "Turning Point", "nav"),
            ("APEX", "Turning Point", "nav"),
            ("LAND", "Land", "divert"),
        ];
        for (name, point_type, expected) in route {
            assert_eq!(
                infer_waypoint_type(Some(name), Some(point_type), None),
                expected,
                "waypoint {name:?} ({point_type})"
            );
        }
    }

    /// The frontend's `Mission` interface is camelCase; this struct is the
    /// other end of that wire and is also the saved-file format. Pin both key
    /// spellings — without `rename_all` the first Save fails with
    /// `missing field 'flight_members'`, which is exactly the bug this guards.
    #[test]
    fn mission_files_round_trip_with_camel_case_keys() {
        let from_frontend = r#"{
            "id": "m1",
            "name": "Red Flag 24-1",
            "date": "2026-09-05",
            "theater": "nevada",
            "bullseye": { "lat": 36.2, "lon": -115.0 },
            "waypoints": [{ "id": "w1", "steerpoint": 1, "elevation_ft": 1870 }],
            "threats": [],
            "flightMembers": [{ "id": "f1", "callsign": "Viper 1-1" }],
            "attacks": [],
            "notes": "",
            "createdAt": "2026-09-05T00:00:00Z",
            "updatedAt": "2026-09-05T00:00:00Z"
        }"#;

        let mission: Mission = serde_json::from_str(from_frontend)
            .expect("the store's camelCase mission must deserialize");

        let path = std::env::temp_dir().join("phoenix_mission_round_trip.json");
        let path_str = path.to_string_lossy().to_string();

        save_mission(mission, path_str.clone()).expect("save");
        let on_disk = std::fs::read_to_string(&path).expect("read back");

        // The saved file is what a later Open reads, so its keys matter.
        assert!(on_disk.contains("\"flightMembers\""), "got: {on_disk}");
        assert!(on_disk.contains("\"createdAt\""), "got: {on_disk}");
        assert!(on_disk.contains("\"updatedAt\""), "got: {on_disk}");
        assert!(!on_disk.contains("flight_members"), "got: {on_disk}");

        let reloaded = load_mission(path_str).expect("load");
        assert_eq!(reloaded.name, "Red Flag 24-1");
        assert_eq!(reloaded.flight_members.len(), 1);
        // Nested shapes are `Value`, so they pass through untouched.
        assert_eq!(reloaded.waypoints[0]["elevation_ft"], 1870);

        std::fs::remove_file(&path).ok();
    }
}
