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
use crate::profiles;
use crate::settings;
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

// ============================================================================
// Mission Commands
// ============================================================================

/// Refuse to write anything but the one file type a command exists for. The
/// frontend passes whatever path it has, and a command that writes any
/// extension is a way to drop a runnable file (a `.bat` in Startup) on disk.
fn require_extension(path: &str, extension: &str, what: &str) -> Result<(), String> {
    let matches = std::path::Path::new(path)
        .extension()
        .map(|e| e.eq_ignore_ascii_case(extension))
        .unwrap_or(false);
    if matches {
        Ok(())
    } else {
        Err(format!("{what} can only be saved as .{extension} files, not {path}"))
    }
}

/// Save mission to file (`.json` only)
#[tauri::command]
pub fn save_mission(mission: Mission, path: String) -> Result<(), String> {
    require_extension(&path, "json", "Missions")?;
    let json = serde_json::to_string_pretty(&mission).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// Load mission from file
#[tauri::command]
pub fn load_mission(path: String) -> Result<Mission, String> {
    let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    parse_saved_mission(&json)
}

/// A saved mission and a FragOrders export are both `.json`, both land in the
/// same file picker, and both live in `test-data/` — so Open on the wrong one is
/// an easy mistake. Serde reports it as `missing field \`id\` at line 25917
/// column 1`, which says nothing about what actually went wrong. Name it.
fn parse_saved_mission(json: &str) -> Result<Mission, String> {
    match serde_json::from_str::<Mission>(json) {
        Ok(mission) => Ok(mission),
        Err(e) => {
            if looks_like_fragorders_export(json) {
                Err("This is a FragOrders export, not a saved mission. \
                     Use Import rather than Open to bring it in."
                    .to_string())
            } else {
                Err(format!("Not a Phoenix Weaponeer mission file: {e}"))
            }
        }
    }
}

/// The raw DCS mission table FragOrders emits: a top-level `coalition`, and no
/// `id` of our own. Checked only on the error path, so the extra parse costs
/// nothing in the normal case.
fn looks_like_fragorders_export(json: &str) -> bool {
    serde_json::from_str::<Value>(json)
        .ok()
        .and_then(|v| v.as_object().map(|o| o.contains_key("coalition") && !o.contains_key("id")))
        .unwrap_or(false)
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

/// Actually terminates the app, after the frontend's unsaved-changes check
/// (if any) has run. Carries an exit code, so `lib.rs`'s `ExitRequested`
/// handler can tell this apart from a user-initiated Cmd+Q / Dock Quit and
/// let it through instead of intercepting it again.
#[tauri::command]
pub fn exit_app(app: AppHandle) {
    app.exit(0);
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
    process_fragorders_json(&json_str, &state.db)
}

/// The whole import, minus Tauri. Split out so tests can drive it against a
/// real fixture and an in-memory database instead of a `State<AppState>`.
pub fn process_fragorders_json(
    json_str: &str,
    db: &db::Database,
) -> Result<ProcessedFragOrdersData, String> {
    // Parse the JSON
    let mission = parsers::parse_fragorders_json(json_str)
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

    // Anything dropped below goes in here and is returned to the UI. Previously
    // these were `eprintln!` only, so a partial import looked like a clean one.
    let mut warnings: Vec<String> = Vec::new();

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
                        if let Some(processed) = process_player_group(group, theater_params, &mut warnings) {
                            player_groups.push(processed);
                        }
                    }
                }
            }
            // Check helicopters
            if let Some(helis) = &country.helicopter {
                for group in &helis.group {
                    if group.has_player() {
                        if let Some(processed) = process_player_group(group, theater_params, &mut warnings) {
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
                    // The author's hide flags are per group, so every threat in
                    // the group carries them. `hiddenOnMFD` is not used.
                    let hidden_on_planner = group.hidden_on_planner.unwrap_or(false);
                    let hidden_on_map = group.hidden.unwrap_or(false);
                    for unit in &group.units {
                        if let Some(unit_type) = &unit.unit_type {
                            if parsers::is_threat_unit(unit_type) {
                                if let Some(mut threat) = process_threat_unit(
                                    &group_name,
                                    unit,
                                    unit_type,
                                    theater_params,
                                    db,
                                    &mut warnings,
                                ) {
                                    threat.hidden_on_planner = hidden_on_planner;
                                    threat.hidden_on_map = hidden_on_map;
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
                Err(e) => warnings.push(format!("Dropped trigger zone {:?}: {}", name, e)),
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
        warnings,
    })
}

/// A waypoint's name: the mission creator's text verbatim when there is any;
/// otherwise the airfield the point is tied to (a ramp start is waypoint 0 at
/// "Ramat David", not a blank); otherwise what the file says, as before.
///
/// The airfield name comes from the file's own `airdromeId`, not from our
/// inference, so it is safe to show as a name.
fn waypoint_name(pt: &parsers::fragorders::RoutePoint, index: usize, theater: &str) -> String {
    let has_creator_name = pt.name.as_deref().is_some_and(|n| !n.trim().is_empty());
    if !has_creator_name {
        if let Some(field) = pt.airdrome_id.and_then(|id| parsers::airfields::airfield(theater, id)) {
            return field.name.to_string();
        }
    }
    pt.name.clone().unwrap_or_else(|| format!("WP{}", index))
}

/// Process a player group into the output format
fn process_player_group(
    group: &parsers::fragorders::Group,
    params: &parsers::TheaterCoordParams,
    warnings: &mut Vec<String>,
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
                            warnings.push(format!(
                                "Dropped waypoint {} ({}) in flight {:?}: {}",
                                i,
                                pt.name.as_deref().unwrap_or("unnamed"),
                                name,
                                e
                            ));
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
                        // The raw 0-based route-point index, which is what
                        // FragOrders publishes and what the jet ends up with.
                        // Route point 0 is where the aircraft spawns — a ramp,
                        // a runway, or a point in the air — so it is waypoint 0
                        // and the first turnpoint is waypoint 1. Numbering it
                        // from 1 made every steerpoint the planner showed, and
                        // every `STPT n` on the kneeboard card, one too high.
                        //
                        // `i` is the pre-filter `enumerate` index deliberately:
                        // a dropped (unprojectable) point leaves a gap rather
                        // than renumbering the survivors out from under the
                        // planner. See docs/BUGFIX_PLAN.md.
                        steerpoint: i as i32,
                        name: waypoint_name(pt, i, params.normalized_name),
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
    warnings: &mut Vec<String>,
) -> Option<ProcessedThreat> {
    // Previously fell back to (0.0, 0.0), which silently placed unconvertible
    // threats in the Gulf of Guinea instead of reporting the failure.
    let (lat, lon) = match dcs_to_latlon(unit.x, unit.y, params) {
        Ok(coords) => coords,
        Err(e) => {
            warnings.push(format!(
                "Dropped threat {} in group {:?} ({}): {}",
                unit_type,
                group_name,
                unit.name.as_deref().unwrap_or("unnamed"),
                e
            ));
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
        // Set by the caller, from the group's flags.
        hidden_on_planner: false,
        hidden_on_map: false,
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
        // Where the jet starts, not a place you fly to. FragOrders keeps it on
        // the map (it draws the first leg from the field) but excludes it from
        // the DTC, so it is never a steerpoint in the cockpit.
        return "departure".to_string();
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

/// Collapse a site's many units into one marker per weapon system.
///
/// A Buk battery is one search radar, one command post and four launchers
/// spread over a few hundred metres; the planner wants one Buk, not six. So
/// units of the *same* system within ~500 m of one already kept are dropped.
///
/// Units of a *different* system at the same spot are kept. Sites routinely
/// mix systems: the NTTR mission's SA15 compound is a Tor with a ZSU-57-2 and
/// three Igla teams inside 150 m of it, and each is a different envelope a
/// low-level attacker has to respect. Position-only dedup used to drop all of
/// them because the Tor happened to be listed first.
fn deduplicate_threats(threats: Vec<ProcessedThreat>) -> Vec<ProcessedThreat> {
    let mut result: Vec<ProcessedThreat> = Vec::new();
    let threshold = 0.005; // ~500m in degrees

    for threat in threats {
        let dominated = result.iter().any(|existing| {
            let same_system = existing.system_id == threat.system_id;
            // A hidden duplicate must never swallow a visible threat, or the
            // reverse: the survivor's flags decide who gets to see the site.
            let same_hiding = existing.hidden_on_planner == threat.hidden_on_planner
                && existing.hidden_on_map == threat.hidden_on_map;
            let lat_diff = (existing.position.lat - threat.position.lat).abs();
            let lon_diff = (existing.position.lon - threat.position.lon).abs();
            same_system && same_hiding && lat_diff < threshold && lon_diff < threshold
        });

        if !dominated {
            result.push(threat);
        }
    }

    result
}

// ============================================================================
// Export Commands
// ============================================================================

/// The eight bytes every PNG file starts with.
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

/// Save a kneeboard PNG (base64-encoded) to a file path
///
/// The frontend renders the card to a canvas and sends the PNG as a base64
/// string. Only a `.png` path, and only bytes that are a PNG, are written —
/// this must not be a general "write these bytes anywhere" command.
///
/// Folders are not created: every caller writes into a folder the user picked,
/// so a missing folder is an error to report, not a path to invent.
#[tauri::command]
pub fn save_kneeboard_png(path: String, base64_data: String) -> Result<(), String> {
    use base64::Engine;
    require_extension(&path, "png", "Kneeboard cards")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Err("Not a PNG image".to_string());
    }
    std::fs::write(&path, bytes).map_err(|e| format!("Cannot write {path}: {e}"))
}

// ============================================================================
// Settings Commands
// ============================================================================

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?
        .join(settings::SETTINGS_FILE))
}

/// The saved settings. A damaged file comes back as defaults with a warning.
#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<settings::SettingsLoad, String> {
    Ok(settings::read_settings(&settings_path(&app)?))
}

/// Remember (`folder`) or forget (`null`) the DCS kneeboard folder for one
/// aircraft type. Returns the settings as now saved.
#[tauri::command]
pub fn set_kneeboard_folder(
    app: AppHandle,
    aircraft_id: String,
    folder: Option<String>,
) -> Result<settings::Settings, String> {
    let path = settings_path(&app)?;
    let current = settings::read_settings(&path).settings;
    let next = settings::with_kneeboard_folder(current, &aircraft_id, folder.as_deref())?;
    settings::write_settings(&path, &next)?;
    Ok(next)
}

/// Whether a remembered folder is still there — a reinstalled or moved DCS
/// means asking again rather than recreating a dead path.
#[tauri::command]
pub fn folder_exists(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

/// Where the folder picker should open for an aircraft type (see `settings`).
#[tauri::command]
pub fn suggest_kneeboard_folder(kneeboard_path: String) -> Option<String> {
    settings::suggest_kneeboard_folder(settings::saved_games_dir().as_deref(), &kneeboard_path)
        .map(|p| p.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh, empty scratch folder per test.
    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("phoenix_cmd_{}_{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn base64_of(bytes: &[u8]) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    fn png_bytes() -> Vec<u8> {
        [PNG_SIGNATURE, b"rest of the image"].concat()
    }

    #[test]
    fn a_kneeboard_card_saves_as_a_png_whatever_the_extension_case() {
        let path = scratch_dir("png_ok").join("Viper_1-1_TGT.PNG");
        save_kneeboard_png(path.to_string_lossy().into_owned(), base64_of(&png_bytes())).expect("save");
        assert_eq!(std::fs::read(&path).unwrap(), png_bytes());
    }

    #[test]
    fn a_kneeboard_save_refuses_any_other_file_type() {
        let dir = scratch_dir("png_ext");
        for name in ["startup.bat", "card.png.exe", "card"] {
            let path = dir.join(name);
            let result = save_kneeboard_png(path.to_string_lossy().into_owned(), base64_of(&png_bytes()));
            assert!(result.is_err(), "{name} was accepted");
            assert!(!path.exists(), "{name} was written");
        }
    }

    #[test]
    fn a_kneeboard_save_refuses_bytes_that_are_not_a_png() {
        let path = scratch_dir("png_bytes").join("card.png");
        let result = save_kneeboard_png(path.to_string_lossy().into_owned(), base64_of(b"@echo off\r\n"));
        assert!(result.is_err());
        assert!(!path.exists());
    }

    #[test]
    fn a_kneeboard_save_does_not_invent_folders() {
        let missing = scratch_dir("png_folder").join("not_there");
        let result = save_kneeboard_png(missing.join("card.png").to_string_lossy().into_owned(), base64_of(&png_bytes()));
        assert!(result.is_err());
        assert!(!missing.exists());
    }

    fn empty_mission() -> Mission {
        Mission {
            id: "m1".to_string(),
            name: "Op".to_string(),
            date: String::new(),
            theater: "nevada".to_string(),
            bullseye: Coordinates { lat: 0.0, lon: 0.0 },
            waypoints: vec![],
            threats: vec![],
            flight_members: vec![],
            attacks: vec![],
            notes: String::new(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn a_mission_saves_only_as_json() {
        let dir = scratch_dir("mission_ext");
        let mission = empty_mission();
        let bad = dir.join("mission.bat");
        assert!(save_mission(mission.clone(), bad.to_string_lossy().into_owned()).is_err());
        assert!(!bad.exists());
        let good = dir.join("mission.JSON");
        save_mission(mission, good.to_string_lossy().into_owned()).expect("json saves");
        assert!(good.exists());
    }

    fn threat(system_id: Option<&str>, unit_type: &str, lat: f64, lon: f64) -> ProcessedThreat {
        ProcessedThreat {
            unit_type: unit_type.to_string(),
            group_name: "SA15".to_string(),
            position: ProcessedCoordinates { lat, lon },
            system_id: system_id.map(str::to_string),
            system_name: system_id.map(str::to_string),
            confidence: ThreatMatchConfidence::High,
            hidden_on_planner: false,
            hidden_on_map: false,
        }
    }

    #[test]
    fn dedup_collapses_one_systems_units_but_keeps_colocated_different_systems() {
        // 0.001 deg is ~100 m: the SA15 compound's spacing.
        let site = vec![
            threat(Some("sa15"), "Tor 9A331", 37.149, -116.797),
            threat(Some("zsu57"), "ZSU_57_2", 37.150, -116.797),
            threat(Some("sa18"), "SA-18 Igla-S manpad", 37.150, -116.798),
            threat(Some("sa18"), "SA-18 Igla-S manpad", 37.151, -116.798),
            threat(Some("sa18"), "SA-18 Igla-S comm", 37.150, -116.797),
        ];
        let kept = deduplicate_threats(site);
        let ids: Vec<Option<&str>> = kept.iter().map(|t| t.system_id.as_deref()).collect();
        assert_eq!(ids, vec![Some("sa15"), Some("zsu57"), Some("sa18")]);
    }

    #[test]
    fn dedup_keeps_the_same_system_when_sites_are_far_apart() {
        let two_sites = vec![
            threat(Some("sa11"), "SA-11 Buk SR 9S18M1", 37.45, -117.20),
            threat(Some("sa11"), "SA-11 Buk LN 9A310M1", 37.452, -117.201), // same site
            threat(Some("sa11"), "SA-11 Buk SR 9S18M1", 37.15, -116.81),   // 20 nm away
        ];
        assert_eq!(deduplicate_threats(two_sites).len(), 2);
    }

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
            "departure"
        );
        assert_eq!(infer_waypoint_type(None, Some("TakeOffParking"), None), "departure");
        assert_eq!(infer_waypoint_type(None, Some("TakeOffGround"), None), "departure");
        assert_eq!(infer_waypoint_type(Some("DEPART"), Some("TakeOff"), Some("From Runway")), "departure");
    }

    /// The real Viper 1 (Hot) route from NTTR_Training_RF_v13, in order.
    #[test]
    fn classifies_real_nttr_redflag_route() {
        let route = [
            ("", "TakeOffParkingHot", "departure"),
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

    // ---- Real-fixture import tests -------------------------------------
    //
    // Until these existed no test loaded a fixture at all: the closest,
    // `classifies_real_nttr_redflag_route`, transcribed the route as tuples.
    // That is how `RoutePoint.eta` sat renamed to `"ETA"` against real data
    // that writes `"eta"` without anything noticing.

    /// The original NTTR test mission must keep importing exactly as it did.
    /// This is the regression guard for every future FragOrders schema change.
    #[test]
    fn nttr_fixture_imports_unchanged() {
        let json = include_str!("../../../test-data/nttr_redflag_viper1.json");
        let db = db::Database::open_in_memory().expect("db");
        let data = process_fragorders_json(json, &db).expect("NTTR fixture must import");

        assert_eq!(data.theater, "nevada");
        assert!(data.projection_verified, "Nevada is a verified projection");
        assert!(data.warnings.is_empty(), "unexpected warnings: {:?}", data.warnings);

        let viper1 = data
            .player_groups
            .iter()
            .find(|g| g.name.starts_with("Viper 1"))
            .expect("Viper 1 must be offered for import");
        assert_eq!(viper1.waypoints.len(), 14, "Viper 1 flies 14 waypoints");

        // Pinned to real geography, per test-data/README.md.
        let takeoff = &viper1.waypoints[0];
        assert_eq!(takeoff.steerpoint, 0, "the ramp is waypoint 0, not 1");
        assert_eq!(takeoff.wp_type, "departure", "the ramp is not a nav waypoint");
        assert!(
            (takeoff.position.lat - 36.227).abs() < 0.01
                && (takeoff.position.lon - (-115.048)).abs() < 0.01,
            "waypoint 0 should be the Nellis ramp, got {:?}",
            takeoff.position
        );
        let tgt1 = &viper1.waypoints[7];
        assert_eq!(tgt1.steerpoint, 7, "TGT1 is waypoint 7, not 8");
        assert!(
            (tgt1.position.lat - 37.682).abs() < 0.01
                && (tgt1.position.lon - (-116.623)).abs() < 0.01,
            "waypoint 7 should be TGT1 at Tonopah, got {:?}",
            tgt1.position
        );
        // Numbering is the raw route-point index, with gaps only where a point
        // was dropped. Nothing was dropped here, so it runs 0..13.
        let stps: Vec<i32> = viper1.waypoints.iter().map(|w| w.steerpoint).collect();
        assert_eq!(stps, (0..14).collect::<Vec<i32>>());

        // The unnamed ramp start takes its airfield's name (airdromeId 4). The
        // landing point is tied to the same airfield but the creator named it,
        // and the creator's text always wins.
        assert_eq!(viper1.waypoints[0].name, "Nellis");
        assert_eq!(viper1.waypoints[13].name, "LAND");

        assert!(!data.threats.is_empty(), "NTTR carries a red laydown");
    }

    /// The mission from the rebuilt FragOrders CLI (commit a3c1ff1316dd,
    /// 2026-09-06). Same wire shape as the January export, so it must import
    /// through the same path with nothing dropped.
    #[test]
    fn sinai_m01_v6_fixture_imports() {
        let json = include_str!("../../../test-data/sinai_m01_v6.json");
        let db = db::Database::open_in_memory().expect("db");
        let data = process_fragorders_json(json, &db).expect("Sinai fixture must import");

        assert_eq!(data.theater, "sinai");
        assert!(
            data.projection_verified,
            "Sinai was pinned by F10 pairs; the amber banner must not fire"
        );
        assert!(
            data.warnings.is_empty(),
            "nothing should be dropped: {:?}",
            data.warnings
        );

        // Eight client flights: Mustang, Lance, Spectre, Hawg, Archer, Saber,
        // Barak, Ari.
        assert_eq!(data.player_groups.len(), 8, "eight client flights");
        for name in ["Mustang", "Spectre", "Barak", "Ari", "Hawg", "Archer"] {
            assert!(
                data.player_groups.iter().any(|g| g.name == name),
                "{name} missing from {:?}",
                data.player_groups.iter().map(|g| &g.name).collect::<Vec<_>>()
            );
        }

        // The red laydown is the point of the mission: SA-2, SA-6, SA-8, SA-11,
        // Shilkas and an EWR are all present in the raw file.
        assert!(
            data.threats.len() >= 10,
            "expected a real threat laydown, got {}",
            data.threats.len()
        );
        assert!(
            data.threats.iter().all(|t| t.system_id.is_some()),
            "unmapped threats: {:?}",
            data.threats
                .iter()
                .filter(|t| t.system_id.is_none())
                .map(|t| &t.unit_type)
                .collect::<Vec<_>>()
        );

        // The whole DB v3 chain, exercised end to end on a mission that did not
        // exist when those rows were written. `55G6 Nebo` and `P-19 Danube` are
        // two of the twelve rows v3 added; before it they imported as Unknown
        // and were dropped on the floor.
        let systems: Vec<&str> = data
            .threats
            .iter()
            .filter_map(|t| t.system_name.as_deref())
            .collect();
        for want in [
            "S-75 Dvina",
            "2K12 Kub",
            "9K33 Osa",
            "9K37 Buk",
            "ZSU-23-4 Shilka",
            "55G6 Nebo",
            "P-19 Danube",
        ] {
            assert!(
                systems.contains(&want),
                "{want} missing from the Sinai laydown: {systems:?}"
            );
        }
    }

    /// The re-saved M01 (V7). Same wire shape as V6; the changes are content —
    /// six new red groups including an SA-13, one fewer MiG flight, and a fifth
    /// route point on Spectre — so it must import through the same path with
    /// nothing dropped and the new SHORAD mapped.
    #[test]
    fn sinai_m01_v7_fixture_imports() {
        let json = include_str!("../../../test-data/sinai_m01_v7.json");
        let db = db::Database::open_in_memory().expect("db");
        let data = process_fragorders_json(json, &db).expect("Sinai V7 fixture must import");

        assert_eq!(data.theater, "sinai");
        assert!(data.projection_verified, "Sinai is verified; no amber banner");
        assert!(
            data.warnings.is_empty(),
            "nothing should be dropped: {:?}",
            data.warnings
        );
        assert_eq!(data.player_groups.len(), 8, "the same eight client flights as V6");

        assert!(
            data.threats.iter().all(|t| t.system_id.is_some()),
            "unmapped threats: {:?}",
            data.threats
                .iter()
                .filter(|t| t.system_id.is_none())
                .map(|t| &t.unit_type)
                .collect::<Vec<_>>()
        );
        let systems: Vec<&str> = data
            .threats
            .iter()
            .filter_map(|t| t.system_name.as_deref())
            .collect();
        // V6's laydown, plus the `Strela-10M3` group V7 added.
        for want in [
            "S-75 Dvina",
            "2K12 Kub",
            "9K33 Osa",
            "9K37 Buk",
            "ZSU-23-4 Shilka",
            "55G6 Nebo",
            "P-19 Danube",
            "9K35 Strela-10",
        ] {
            assert!(
                systems.contains(&want),
                "{want} missing from the V7 laydown: {systems:?}"
            );
        }

        // Spectre gained a route point in V7: waypoints 0..4, where V6 had 0..3.
        let spectre = data
            .player_groups
            .iter()
            .find(|g| g.name == "Spectre")
            .expect("Spectre must be offered for import");
        let stps: Vec<i32> = spectre.waypoints.iter().map(|w| w.steerpoint).collect();
        assert_eq!(stps, vec![0, 1, 2, 3, 4], "Spectre numbers 0..4 in V7");
    }

    /// Sinai M01's author hid every red ground group, with all three DCS flags
    /// set. Every threat must carry both flags we read, so the planner shows
    /// the laydown only as probable threats.
    #[test]
    fn sinai_v7_threats_carry_the_authors_hide_flags() {
        let json = include_str!("../../../test-data/sinai_m01_v7.json");
        let db = db::Database::open_in_memory().expect("db");
        let data = process_fragorders_json(json, &db).expect("Sinai V7 fixture must import");

        assert!(!data.threats.is_empty());
        let unflagged: Vec<&str> = data
            .threats
            .iter()
            .filter(|t| !(t.hidden_on_planner && t.hidden_on_map))
            .map(|t| t.group_name.as_str())
            .collect();
        assert!(unflagged.is_empty(), "every Sinai threat is hidden both ways: {unflagged:?}");
    }

    /// NTTR predates `hiddenOnPlanner`: its groups write only `hidden`. The
    /// SA-2 site the author hid carries the map flag and nothing else, and
    /// groups left visible carry neither.
    #[test]
    fn nttr_hidden_sa2_carries_only_the_map_flag() {
        let json = include_str!("../../../test-data/nttr_redflag_viper1.json");
        let db = db::Database::open_in_memory().expect("db");
        let data = process_fragorders_json(json, &db).expect("NTTR fixture must import");

        let sa2: Vec<&ProcessedThreat> =
            data.threats.iter().filter(|t| t.group_name == "Interdiction SA2").collect();
        assert!(!sa2.is_empty(), "the hidden SA-2 site must still import");
        assert!(
            sa2.iter().all(|t| t.hidden_on_map && !t.hidden_on_planner),
            "the SA-2 site is hidden on the map only"
        );
        assert!(
            data.threats.iter().any(|t| !t.hidden_on_map && !t.hidden_on_planner),
            "groups the author left visible stay visible"
        );
    }

    #[test]
    fn a_hidden_duplicate_never_swallows_a_visible_threat() {
        let threat = |hidden: bool| ProcessedThreat {
            unit_type: "Kub 2P25 ln".into(),
            group_name: "SAM site".into(),
            position: ProcessedCoordinates { lat: 30.0, lon: 34.0 },
            system_id: Some("sa6".into()),
            system_name: Some("2K12 Kub".into()),
            confidence: ThreatMatchConfidence::High,
            hidden_on_planner: hidden,
            hidden_on_map: hidden,
        };
        let kept = deduplicate_threats(vec![threat(true), threat(false), threat(false)]);
        assert_eq!(kept.len(), 2, "one hidden and one visible launcher survive, not one of either");
        assert!(kept.iter().any(|t| !t.hidden_on_map), "the visible site must survive");
    }

    /// The bug that prompted all of this: Barak's route was numbered 1..5, so
    /// every steerpoint the planner showed — and every `STPT n` on the
    /// kneeboard card — was one higher than what the squadron reads on
    /// FragOrders and what the pilot dials into the jet.
    ///
    /// FragOrders numbers route points by raw 0-based index (its own bundle:
    /// `push({...pt, number: idx})`, guarded by a sequence check that requires
    /// sorted index N to carry number N), and its DTC generator skips number 0
    /// and writes `Sequence: r` from `SteerpointStart: 1`. So the ramp is
    /// waypoint 0 and is never loaded into the jet, and cockpit STPT n is
    /// FragOrders waypoint n.
    #[test]
    fn barak_numbering_matches_fragorders() {
        let json = include_str!("../../../test-data/sinai_m01_v6.json");
        let db = db::Database::open_in_memory().expect("db");
        let data = process_fragorders_json(json, &db).expect("Sinai fixture must import");

        let barak = data
            .player_groups
            .iter()
            .find(|g| g.name == "Barak")
            .expect("Barak must be offered for import");

        let stps: Vec<i32> = barak.waypoints.iter().map(|w| w.steerpoint).collect();
        assert_eq!(stps, vec![0, 1, 2, 3, 4], "Barak numbers 0..4, not 1..5");

        // Point 0 is `TakeOffParking` / `From Parking Area` at Ramat David
        // (airdromeId 50), alt 31 m — the ramp elevation, not a flyable
        // altitude. It is unnamed in the file, so it takes the airfield's name.
        let ramp = &barak.waypoints[0];
        assert_eq!(ramp.wp_type, "departure");
        assert_eq!(ramp.name, "Ramat David");
        assert!(
            (ramp.altitude_ft - 102.0).abs() < 1.0,
            "ramp should be ~102 ft, got {}",
            ramp.altitude_ft
        );

        // Ground truth read straight off the FragOrders map popup for this
        // mission: "Barak Waypoint 1 — 676 MSL", N 31 14.4023 E 34 39.5637.
        // This pins the numbering and the Sinai projection to the same source.
        let wp1 = &barak.waypoints[1];
        assert_eq!(wp1.steerpoint, 1);
        assert_eq!(wp1.wp_type, "nav");
        assert!(
            (wp1.altitude_ft - 676.0).abs() < 1.0,
            "FragOrders calls the 676 ft point Waypoint 1, got {} ft",
            wp1.altitude_ft
        );
        assert!(
            (wp1.position.lat - 31.240_038).abs() < 0.001
                && (wp1.position.lon - 34.659_395).abs() < 0.001,
            "waypoint 1 must land where FragOrders puts it, got {:?}",
            wp1.position
        );

        let alts: Vec<i64> = barak
            .waypoints
            .iter()
            .map(|w| w.altitude_ft.round() as i64)
            .collect();
        assert_eq!(alts, vec![102, 676, 423, 374, 374]);
    }

    /// Numbering is the raw route-point index, unconditionally — there is no
    /// "detect a takeoff point and shift" branch, because FragOrders has none
    /// either. A flight that spawns airborne has a real, flyable waypoint 0.
    #[test]
    fn air_start_flights_also_number_from_zero() {
        let json = include_str!("../../../test-data/nttr_redflag_viper1.json");
        let db = db::Database::open_in_memory().expect("db");
        let data = process_fragorders_json(json, &db).expect("NTTR fixture must import");

        let bvr = data
            .player_groups
            .iter()
            .find(|g| g.name == "BVR Vipers 1")
            .expect("the air-start BVR flight must be offered for import");

        let first = &bvr.waypoints[0];
        assert_eq!(first.steerpoint, 0, "air starts number from 0 as well");
        assert_eq!(first.name, "", "an air start has no airfield (airdromeId 0), so it stays unnamed");
        assert_ne!(
            first.wp_type, "departure",
            "a plain Turning Point is not a departure point, whatever its index"
        );
        assert!(
            first.altitude_ft > 24_000.0,
            "this flight spawns at 25,000 ft, got {}",
            first.altitude_ft
        );
    }

    /// Opening a FragOrders export instead of importing it used to surface
    /// serde's `missing field `id` at line 25917 column 1`, which names neither
    /// the file nor the fix. Both are .json and both sit in test-data/.
    #[test]
    fn opening_a_fragorders_export_says_to_import_it_instead() {
        let json = include_str!("../../../test-data/sinai_m01_v6.json");
        let err = parse_saved_mission(json).expect_err("a FragOrders export is not a saved mission");
        assert!(
            err.contains("FragOrders export") && err.contains("Import"),
            "the error must name the mistake and the fix, got: {err}"
        );
        assert!(!err.contains("missing field"), "raw serde text should not reach the user: {err}");
    }

    /// A genuinely corrupt mission file must still report the parse error
    /// rather than being mislabelled as a FragOrders export.
    #[test]
    fn a_broken_mission_file_still_reports_the_parse_error() {
        let err = parse_saved_mission(r#"{"name":"no id here"}"#)
            .expect_err("missing id is still an error");
        assert!(err.contains("Not a Phoenix Weaponeer mission file"), "got: {err}");
    }

    /// And a real saved mission still loads.
    #[test]
    fn a_saved_mission_still_parses() {
        let json = r#"{
            "id":"m1","name":"Test","date":"2026-09-11","theater":"sinai",
            "bullseye":{"lat":31.0,"lon":34.0},
            "waypoints":[],"threats":[],"flightMembers":[],"attacks":[],
            "notes":"","createdAt":"2026-09-11T00:00:00Z","updatedAt":"2026-09-11T00:00:00Z"
        }"#;
        assert_eq!(parse_saved_mission(json).expect("should parse").id, "m1");
    }
}
