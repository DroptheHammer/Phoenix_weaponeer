//! FragOrders JSON parser
//!
//! Handles parsing of JSON output from FragOrders CLI tool.
//! The JSON structure mirrors the DCS mission file format.

use serde::{Deserialize, Serialize};

/// Root mission structure from FragOrders JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FragOrdersMission {
    /// Theater name - supports both "theatre" (UK) and "theater" (US) spellings
    #[serde(alias = "theatre")]
    pub theater: Option<String>,
    pub coalition: Coalition,
    #[serde(default)]
    pub triggers: Option<Triggers>,
    #[serde(default)]
    pub weather: Option<serde_json::Value>,
}

/// Coalition container
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Coalition {
    #[serde(default)]
    pub blue: Option<CoalitionSide>,
    #[serde(default)]
    pub red: Option<CoalitionSide>,
    #[serde(default)]
    pub neutrals: Option<CoalitionSide>,
}

/// One side of the coalition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoalitionSide {
    #[serde(default)]
    pub bullseye: Option<Bullseye>,
    #[serde(default)]
    pub nav_points: Option<Vec<NavPoint>>,
    #[serde(default)]
    pub country: Vec<Country>,
}

/// Bullseye position in DCS coordinates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bullseye {
    pub x: f64,
    pub y: f64,
}

/// Navigation point
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavPoint {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub name: Option<String>,
}

/// Country containing assets
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Country {
    #[serde(default)]
    pub id: i32,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub plane: Option<Assets>,
    #[serde(default)]
    pub helicopter: Option<Assets>,
    #[serde(default)]
    pub vehicle: Option<Assets>,
    #[serde(default)]
    pub ship: Option<Assets>,
    #[serde(default)]
    pub static_: Option<Assets>,
}

/// Container for groups of a specific asset type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assets {
    /// Group can be null, an empty array, or an array of groups
    #[serde(default, deserialize_with = "deserialize_null_as_empty_vec")]
    pub group: Vec<Group>,
}

/// Custom deserializer that treats null as an empty Vec
fn deserialize_null_as_empty_vec<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    let opt: Option<Vec<T>> = Option::deserialize(deserializer)?;
    Ok(opt.unwrap_or_default())
}

/// A group of units (aircraft flight, vehicle convoy, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "groupId", default)]
    pub group_id: Option<i32>,
    #[serde(default)]
    pub units: Vec<Unit>,
    #[serde(default)]
    pub route: Option<Route>,
    #[serde(default)]
    pub task: Option<String>,
    #[serde(default)]
    pub frequency: Option<f64>,
    #[serde(default)]
    pub modulation: Option<i32>,
}

/// Individual unit within a group
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Unit {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "unitId", default)]
    pub unit_id: Option<i32>,
    #[serde(rename = "type", default)]
    pub unit_type: Option<String>,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub alt: Option<f64>,
    #[serde(default)]
    pub heading: Option<f64>,
    #[serde(default)]
    pub skill: Option<String>,
    #[serde(default)]
    pub callsign: Option<Callsign>,
    #[serde(default)]
    pub onboard_num: Option<StringOrInt>,
    #[serde(default)]
    pub payload: Option<Payload>,
}

/// Value that can be either a string or integer in JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum StringOrInt {
    String(String),
    Int(i64),
}

impl StringOrInt {
    pub fn as_string(&self) -> String {
        match self {
            StringOrInt::String(s) => s.clone(),
            StringOrInt::Int(i) => i.to_string(),
        }
    }
}

/// Unit callsign (can be structured or simple string)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Callsign {
    Structured {
        #[serde(default)]
        name: Option<String>,
        #[serde(rename = "1", default)]
        flight: Option<i32>,
        #[serde(rename = "2", default)]
        element: Option<i32>,
        #[serde(rename = "3", default)]
        position: Option<i32>,
    },
    Simple(String),
    Number(i32),
}

impl Callsign {
    pub fn to_string_representation(&self) -> String {
        match self {
            Callsign::Structured { name, flight, element, .. } => {
                let n = name.as_deref().unwrap_or("Unknown");
                let f = flight.unwrap_or(1);
                let e = element.unwrap_or(1);
                format!("{} {}-{}", n, f, e)
            }
            Callsign::Simple(s) => s.clone(),
            Callsign::Number(n) => n.to_string(),
        }
    }
}

/// Aircraft payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payload {
    /// Pylons can be either an array or a map in different DCS versions
    #[serde(default)]
    pub pylons: Option<serde_json::Value>,
    #[serde(default)]
    pub fuel: Option<f64>,
    #[serde(default)]
    pub flare: Option<i32>,
    #[serde(default)]
    pub chaff: Option<i32>,
    #[serde(default)]
    pub gun: Option<i32>,
}

/// Route containing waypoints
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Route {
    #[serde(default)]
    pub points: Vec<RoutePoint>,
}

/// A single point in a route (waypoint)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutePoint {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "type", default)]
    pub point_type: Option<String>,
    #[serde(default)]
    pub action: Option<String>,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub alt: Option<f64>,
    #[serde(rename = "alt_type", default)]
    pub alt_type: Option<String>,
    #[serde(default)]
    pub speed: Option<f64>,
    #[serde(rename = "ETA", default)]
    pub eta: Option<f64>,
    #[serde(rename = "ETA_locked", default)]
    pub eta_locked: Option<bool>,
    #[serde(default)]
    pub task: Option<serde_json::Value>,
}

/// Triggers container
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Triggers {
    #[serde(default)]
    pub zones: Vec<TriggerZone>,
}

/// Trigger zone definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerZone {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "zoneId", default)]
    pub zone_id: Option<i32>,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub radius: f64,
    #[serde(default)]
    pub color: Option<Vec<f64>>,
    #[serde(default)]
    pub properties: Option<Vec<ZoneProperty>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoneProperty {
    #[serde(default)]
    pub key: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
}

// ============================================================================
// Processed output types (sent to frontend)
// ============================================================================

/// Processed mission data ready for frontend consumption
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedFragOrdersData {
    pub theater: String,
    pub bullseye: ProcessedCoordinates,
    pub player_groups: Vec<ProcessedPlayerGroup>,
    pub threats: Vec<ProcessedThreat>,
    pub trigger_zones: Vec<ProcessedTriggerZone>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedCoordinates {
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedPlayerGroup {
    pub name: String,
    pub callsign: String,
    pub aircraft_type: String,
    pub units: Vec<ProcessedUnit>,
    pub waypoints: Vec<ProcessedWaypoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedUnit {
    pub name: String,
    pub callsign: String,
    pub onboard_num: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedWaypoint {
    pub steerpoint: i32,
    pub name: String,
    pub wp_type: String,
    pub position: ProcessedCoordinates,
    pub altitude_ft: f64,
    pub speed_ktas: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedThreat {
    pub unit_type: String,
    pub group_name: String,
    pub position: ProcessedCoordinates,
    pub system_id: Option<String>,
    pub system_name: Option<String>,
    pub confidence: ThreatMatchConfidence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ThreatMatchConfidence {
    High,    // Exact match on dcs_unit_name
    Medium,  // Partial match or normalized match
    Low,     // Fuzzy match
    Unknown, // No match found
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedTriggerZone {
    pub name: String,
    pub center: ProcessedCoordinates,
    pub radius_m: f64,
}

// ============================================================================
// Helper functions
// ============================================================================

impl Unit {
    /// Check if this unit is player-controllable
    pub fn is_player(&self) -> bool {
        match &self.skill {
            Some(skill) => skill == "Client" || skill == "Player",
            None => false,
        }
    }
}

impl Group {
    /// Check if this group contains any player-controllable units
    pub fn has_player(&self) -> bool {
        self.units.iter().any(|u| u.is_player())
    }

    /// Get the first player unit (lead)
    pub fn first_player_unit(&self) -> Option<&Unit> {
        self.units.iter().find(|u| u.is_player())
    }
}

/// Parse FragOrders JSON string into mission structure
pub fn parse_fragorders_json(json_str: &str) -> Result<FragOrdersMission, serde_json::Error> {
    serde_json::from_str(json_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_minimal_mission() {
        let json = r#"{
            "theatre": "Nevada",
            "coalition": {
                "blue": {
                    "bullseye": {"x": 100000, "y": 200000},
                    "country": []
                }
            }
        }"#;

        let mission = parse_fragorders_json(json).expect("Failed to parse");
        assert_eq!(mission.theater.as_deref(), Some("Nevada"));
    }

    #[test]
    fn test_unit_is_player() {
        let player_unit = Unit {
            name: Some("Pilot1".to_string()),
            unit_id: Some(1),
            unit_type: Some("F-16C_50".to_string()),
            x: 0.0,
            y: 0.0,
            alt: None,
            heading: None,
            skill: Some("Client".to_string()),
            callsign: None,
            onboard_num: None,
            payload: None,
        };
        assert!(player_unit.is_player());

        let ai_unit = Unit {
            skill: Some("High".to_string()),
            ..player_unit.clone()
        };
        assert!(!ai_unit.is_player());
    }
}
