//! The saved-mission format.

use serde::{Deserialize, Serialize};
use serde_json::Value;

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
    /// Coordinated multi-ship strikes (2026-09-23). Defaulted so earlier saves still load.
    #[serde(default)]
    pub strikes: Vec<Value>,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Coordinates {
    pub lat: f64,
    pub lon: f64,
}

/// A saved mission and a FragOrders export are both `.json`, both land in the
/// same file picker, and both live in `test-data/` — so Open on the wrong one is
/// an easy mistake. Serde reports it as `missing field \`id\` at line 25917
/// column 1`, which says nothing about what actually went wrong. Name it.
pub fn parse_saved_mission(json: &str) -> Result<Mission, String> {
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

/// A mission as the saved file holds it: pretty JSON with camelCase keys.
pub fn mission_to_json(mission: &Mission) -> Result<String, String> {
    serde_json::to_string_pretty(mission).map_err(|e| e.to_string())
}

/// The raw DCS mission table FragOrders emits: a top-level `coalition`, and no
/// `id` of our own. Checked only on the error path, so the extra parse costs
/// nothing in the normal case.
pub(crate) fn looks_like_fragorders_export(json: &str) -> bool {
    serde_json::from_str::<Value>(json)
        .ok()
        .and_then(|v| v.as_object().map(|o| o.contains_key("coalition") && !o.contains_key("id")))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let on_disk = mission_to_json(&mission).expect("serialize");

        // The saved file is what a later Open reads, so its keys matter.
        assert!(on_disk.contains("\"flightMembers\""), "got: {on_disk}");
        assert!(on_disk.contains("\"createdAt\""), "got: {on_disk}");
        assert!(on_disk.contains("\"updatedAt\""), "got: {on_disk}");
        assert!(!on_disk.contains("flight_members"), "got: {on_disk}");

        let reloaded = parse_saved_mission(&on_disk).expect("load");
        assert_eq!(reloaded.name, "Red Flag 24-1");
        assert_eq!(reloaded.flight_members.len(), 1);
        // Nested shapes are `Value`, so they pass through untouched.
        assert_eq!(reloaded.waypoints[0]["elevation_ft"], 1870);
    }

    /// Opening a FragOrders export instead of importing it used to surface
    /// serde's `missing field `id` at line 25917 column 1`, which names neither
    /// the file nor the fix. Both are .json and both sit in test-data/.
    #[test]
    fn opening_a_fragorders_export_says_to_import_it_instead() {
        let json = crate::private_fixture!("sinai_m01_v6.json");
        let err = parse_saved_mission(json).expect_err("a FragOrders export is not a saved mission");
        assert!(
            err.contains("FragOrders export") && err.contains("Import"),
            "the error must name the mistake and the fix, got: {err}"
        );
        assert!(!err.contains("missing field"), "raw serde text should not reach the user: {err}");
    }

    /// The same mistake, without the private fixture: the shape alone decides.
    #[test]
    fn a_bare_dcs_mission_table_is_named_as_an_export() {
        let err = parse_saved_mission(r#"{"coalition": {}, "theatre": "Nevada"}"#).unwrap_err();
        assert!(err.contains("FragOrders export"), "{err}");
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

    /// A save from before strikes existed has no `strikes` key and must load
    /// with none; a save with strikes must write them back out. Without
    /// `#[serde(default)]` the first fails, and without the field at all serde
    /// silently drops the second.
    #[test]
    fn strikes_default_when_absent_and_survive_a_round_trip() {
        let old = r#"{
            "id":"m1","name":"Test","date":"2026-09-11","theater":"nevada",
            "bullseye":{"lat":31.0,"lon":34.0},
            "waypoints":[],"threats":[],"flightMembers":[],"attacks":[],
            "notes":"","createdAt":"x","updatedAt":"x"
        }"#;
        assert!(parse_saved_mission(old).expect("old save loads").strikes.is_empty());

        let with_strike = old.replace(
            r#""attacks":[],"#,
            r#""attacks":[],"strikes":[{"id":"s1","name":"Viper 1 strike","ip":{},"spacing_s":30}],"#,
        );
        let mission = parse_saved_mission(&with_strike).expect("save with a strike loads");
        assert_eq!(mission.strikes.len(), 1);
        let back = parse_saved_mission(&mission_to_json(&mission).unwrap()).expect("reload");
        assert_eq!(back.strikes[0]["name"], "Viper 1 strike");
    }
}
