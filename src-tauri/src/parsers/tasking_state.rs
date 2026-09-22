//! FragOrders public-link payload parser
//!
//! A public FragOrders link (`fragorders.com/public_frag_order/{id}`) resolves
//! to the web app's published `TaskingState`: the mission already flattened,
//! with `plannedGroups[]` and `opforVehicles[]` instead of the raw DCS
//! `coalition.*.country[]` tree the CLI writes. Positions are the same DCS x/y.
//!
//! Only the fields the import uses are read; everything else is ignored. The
//! payload is whatever the mission's publisher chose to share. Author-hidden
//! groups are usually stripped before we see them, and that is intended.
//! Fixtures and the publish options behind each are in
//! `test-data/fragorders-links/`.

use serde::Deserialize;

use super::fragorders::{
    deserialize_null_as_empty_vec, deserialize_null_as_zero, Bullseye, Callsign, RoutePoint,
    StringOrInt,
};

/// The published mission, as a public link serves it.
#[derive(Debug, Clone, Deserialize)]
pub struct TaskingState {
    /// FragOrders' theater enum (`SINAI`, `PG`, `SYRIA`), not DCS's string.
    /// `get_theater_params` resolves both.
    #[serde(default)]
    pub theater: Option<String>,
    #[serde(default)]
    pub bullseye: Option<Bullseye>,
    /// Required: this key is what makes a payload a `TaskingState`, so a CLI
    /// file fed in here fails instead of importing as an empty mission.
    #[serde(rename = "plannedGroups", deserialize_with = "deserialize_null_as_empty_vec")]
    pub planned_groups: Vec<TaskingGroup>,
    /// Red ground units. Empty when the publisher left them out, or when the
    /// mission's author hid them in DCS; the two look the same from here.
    #[serde(rename = "opforVehicles", default, deserialize_with = "deserialize_null_as_empty_vec")]
    pub opfor_vehicles: Vec<TaskingGroup>,
}

/// A group: a flight in `plannedGroups`, a SAM site in `opforVehicles`.
#[derive(Debug, Clone, Deserialize)]
pub struct TaskingGroup {
    #[serde(default)]
    pub name: Option<String>,
    /// `plane`, `helicopter`, `vehicle`, `static`, `ship`.
    #[serde(default)]
    pub category: Option<String>,
    #[serde(rename = "isPlayer", default)]
    pub is_player: Option<bool>,
    /// The author hid this group on the F10 map.
    #[serde(default)]
    pub hidden: Option<bool>,
    /// The author hid this group on the mission planner.
    #[serde(rename = "hiddenOnPlanner", default)]
    pub hidden_on_planner: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_null_as_empty_vec")]
    pub units: Vec<TaskingUnit>,
    /// Same fields and names as a DCS route point, so the CLI's `RoutePoint`
    /// reads them directly.
    #[serde(default, deserialize_with = "deserialize_null_as_empty_vec")]
    pub waypoints: Vec<RoutePoint>,
}

/// One unit. `payload` here is a list of store names, not the DCS pylon table,
/// which is why this is not the CLI's `Unit`.
#[derive(Debug, Clone, Deserialize)]
pub struct TaskingUnit {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "type", default)]
    pub unit_type: Option<String>,
    /// A plain string here ("Viper21"); `Callsign` accepts that as `Simple`.
    #[serde(default)]
    pub callsign: Option<Callsign>,
    #[serde(rename = "tailNumber", default)]
    pub tail_number: Option<StringOrInt>,
    #[serde(default, deserialize_with = "deserialize_null_as_zero")]
    pub x: f64,
    #[serde(default, deserialize_with = "deserialize_null_as_zero")]
    pub y: f64,
}

impl TaskingGroup {
    /// A flight a squadron member could fly: flagged as a player group, and an
    /// aircraft rather than a ground or naval group.
    pub fn is_player_flight(&self) -> bool {
        let flyable = matches!(self.category.as_deref(), Some("plane") | Some("helicopter"));
        flyable && self.is_player.unwrap_or(false)
    }
}

/// Parse a public-link payload.
pub fn parse_tasking_state(json_str: &str) -> Result<TaskingState, serde_json::Error> {
    serde_json::from_str(json_str)
}

/// Does this text look like a public-link payload rather than CLI output?
///
/// The link payload has `plannedGroups` at the top and no `coalition`; the CLI
/// output is the other way round. Checked on the parsed top level, never by
/// searching the text, since a group could be named anything.
pub fn looks_like_tasking_state(json_str: &str) -> bool {
    match serde_json::from_str::<serde_json::Value>(json_str) {
        Ok(serde_json::Value::Object(top)) => {
            top.contains_key("plannedGroups") && !top.contains_key("coalition")
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_minimal_payload_parses_and_ignores_unknown_keys() {
        let json = r#"{
            "theater": "SINAI",
            "time": "1994-06-28T07:30:00.000Z",
            "weather": null,
            "bullseye": {"x": 1000, "y": 2000},
            "plannedGroups": [{
                "name": "Barak", "category": "plane", "isPlayer": true,
                "units": [{"name": "Barak-1", "type": "F-16C_50", "callsign": "Springfield11",
                           "tailNumber": "014", "x": 1, "y": 2, "payload": ["AIM-120C", null]}],
                "waypoints": [{"number": 0, "name": "0", "type": "TakeOffParking", "x": 1, "y": 2,
                               "alt": 31, "speed": 138.9, "airdromeId": null, "formation_template": ""}]
            }],
            "opforVehicles": null
        }"#;
        let ts = parse_tasking_state(json).expect("should parse");
        assert_eq!(ts.theater.as_deref(), Some("SINAI"));
        assert_eq!(ts.planned_groups.len(), 1);
        assert!(ts.planned_groups[0].is_player_flight());
        assert_eq!(ts.planned_groups[0].waypoints.len(), 1);
        assert!(ts.opfor_vehicles.is_empty(), "null opforVehicles reads as none");
        let unit = &ts.planned_groups[0].units[0];
        assert_eq!(unit.callsign.as_ref().unwrap().to_string_representation(), "Springfield11");
        assert_eq!(unit.tail_number.as_ref().unwrap().as_string(), "014");
    }

    #[test]
    fn a_cli_export_is_not_a_tasking_state() {
        let cli = include_str!("../../../test-data/sinai_m01_v7.json");
        assert!(!looks_like_tasking_state(cli));
        assert!(
            parse_tasking_state(cli).is_err(),
            "CLI output has no plannedGroups and must not parse as an empty link payload"
        );
    }

    #[test]
    fn every_captured_link_payload_is_recognised() {
        for json in [
            include_str!("../../../test-data/fragorders-links/kola_arcticfury_threats-visible.json"),
            include_str!("../../../test-data/fragorders-links/nttr_dtc_threats-visible.json"),
            include_str!("../../../test-data/fragorders-links/sinai_m01v7_all-red-hidden-in-miz.json"),
            include_str!("../../../test-data/fragorders-links/syria_neonmirror_showgroups-off.json"),
        ] {
            assert!(looks_like_tasking_state(json));
            parse_tasking_state(json).expect("captured payload should parse");
        }
    }

    #[test]
    fn only_flyable_player_groups_count_as_flights() {
        let group = |category: &str, is_player: Option<bool>| TaskingGroup {
            name: None,
            category: Some(category.to_string()),
            is_player,
            hidden: None,
            hidden_on_planner: None,
            units: vec![],
            waypoints: vec![],
        };
        assert!(group("plane", Some(true)).is_player_flight());
        assert!(group("helicopter", Some(true)).is_player_flight());
        assert!(!group("plane", Some(false)).is_player_flight());
        assert!(!group("plane", None).is_player_flight());
        assert!(!group("vehicle", Some(true)).is_player_flight());
    }
}
