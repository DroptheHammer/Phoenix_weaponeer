//! The browser's way into `weaponeer_core`.
//!
//! Every function mirrors a desktop Tauri command of the same name and
//! returns its answer as the same JSON text Tauri would send, so the
//! frontend's web backend (`src/lib/backend/web.ts`) only has to
//! `JSON.parse` it and both builds see identical data. An `Err` arrives in
//! JavaScript as a thrown string, as a failed Tauri `invoke` does.
//!
//! What the desktop does with files, folders and settings has no equivalent
//! here; the web backend does those with browser APIs.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use weaponeer_core::fragorders_link::{self, LinkPayload};
use weaponeer_core::refdata::reference;
use weaponeer_core::{import, mission, profiles, theaters};

fn json<T: Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|e| e.to_string())
}

// ---- Theaters, reference data, profiles --------------------------------

#[wasm_bindgen]
pub fn list_theaters() -> Result<String, String> {
    json(&theaters::list_theaters())
}

#[wasm_bindgen]
pub fn get_all_threats() -> Result<String, String> {
    json(&reference().get_all_threats())
}

#[wasm_bindgen]
pub fn get_threats_by_type(threat_type: &str) -> Result<String, String> {
    json(&reference().get_threats_by_type(threat_type))
}

#[wasm_bindgen]
pub fn get_all_weapons() -> Result<String, String> {
    json(&reference().get_all_weapons())
}

#[wasm_bindgen]
pub fn get_weapons_for_aircraft(aircraft_id: &str) -> Result<String, String> {
    json(&reference().get_weapons_for_aircraft(aircraft_id))
}

#[wasm_bindgen]
pub fn get_all_aircraft() -> Result<String, String> {
    json(&reference().get_all_aircraft())
}

#[wasm_bindgen]
pub fn get_fuze_options(weapon_id: &str) -> Result<String, String> {
    json(&reference().get_fuze_options(weapon_id))
}

/// A squadron profile file handed in from the browser.
#[derive(Deserialize)]
struct UserFileIn {
    name: String,
    contents: String,
}

/// The bundled profiles, merged with any squadron files the user loaded
/// (`user_files_json`: `[{ "name": "...", "contents": "..." }]`, or `[]`).
#[wasm_bindgen]
pub fn list_delivery_profiles(user_files_json: &str) -> Result<String, String> {
    let files: Vec<UserFileIn> =
        serde_json::from_str(user_files_json).map_err(|e| format!("profile files: {e}"))?;
    let files = files
        .into_iter()
        .map(|f| profiles::UserFile { name: f.name, contents: Ok(f.contents) })
        .collect();
    json(&profiles::load_all(files)?)
}

// ---- Missions ------------------------------------------------------------

/// Check an opened mission file and hand it back as the frontend expects it.
#[wasm_bindgen]
pub fn load_mission(json_text: &str) -> Result<String, String> {
    json(&mission::parse_saved_mission(json_text)?)
}

/// A mission as the saved file holds it, ready to download. Refuses anything
/// that would not open again.
#[wasm_bindgen]
pub fn save_mission(mission_json: &str) -> Result<String, String> {
    let parsed = mission::parse_saved_mission(mission_json)?;
    mission::mission_to_json(&parsed)
}

// ---- FragOrders import ---------------------------------------------------

/// Import FragOrders JSON: CLI output, or a saved public-link payload.
#[wasm_bindgen]
pub fn parse_fragorders_json(json_str: &str) -> Result<String, String> {
    json(&import::import_json(json_str, reference())?)
}

/// Step 1 of a link fetch: the manifest address for a pasted link, or why
/// the link is refused.
#[wasm_bindgen]
pub fn link_manifest_url(url: &str) -> Result<String, String> {
    Ok(fragorders_link::manifest_url(fragorders_link::link_id(url)?))
}

/// What a manifest says, once its bundle address has passed the checks.
#[derive(Serialize)]
struct ManifestOut {
    bundle_address: String,
    title: Option<String>,
    show_groups: Option<bool>,
}

/// Step 2: read the fetched manifest. The bundle address is only returned if
/// it is CloudFront over HTTPS.
#[wasm_bindgen]
pub fn link_read_manifest(manifest_json: &str) -> Result<String, String> {
    let manifest = fragorders_link::read_manifest(manifest_json)?;
    fragorders_link::check_bundle_address(&manifest.bundle_address)?;
    json(&ManifestOut {
        bundle_address: manifest.bundle_address,
        title: manifest.title,
        show_groups: manifest.show_groups,
    })
}

/// Step 3: import the fetched bundle, with what the manifest said.
#[wasm_bindgen]
pub fn link_import(
    url: &str,
    title: Option<String>,
    show_groups: Option<bool>,
    bundle_json: String,
) -> Result<String, String> {
    let id = fragorders_link::link_id(url)?;
    let payload = LinkPayload { link: fragorders_link::canonical_link(id), title, show_groups, bundle_json };
    json(&import::import_link(payload, reference())?)
}

/// The words for an HTTP status other than 200.
#[wasm_bindgen]
pub fn link_status_error(status: u16) -> Option<String> {
    fragorders_link::status_error(status)
}

/// The words for a fetch that never got an answer.
#[wasm_bindgen]
pub fn link_unreachable_error() -> String {
    fragorders_link::UNREACHABLE.to_string()
}

/// The words for an answer larger than any real mission.
#[wasm_bindgen]
pub fn link_too_large_error() -> String {
    fragorders_link::TOO_LARGE.to_string()
}

/// The largest answer a link fetch accepts, in bytes.
#[wasm_bindgen]
pub fn link_max_body_bytes() -> f64 {
    fragorders_link::MAX_BODY_BYTES as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The web answers are the desktop answers: the same core, serialized the
    /// same way Tauri does.
    #[test]
    fn answers_are_the_desktop_json() {
        let threats: serde_json::Value = serde_json::from_str(&get_all_threats().unwrap()).unwrap();
        assert_eq!(threats, serde_json::to_value(reference().get_all_threats()).unwrap());
        let theaters: serde_json::Value = serde_json::from_str(&list_theaters().unwrap()).unwrap();
        assert!(theaters.as_array().unwrap().iter().any(|t| t["id"] == "nevada"));
    }

    #[test]
    fn a_link_is_checked_before_anything_is_fetched() {
        assert!(link_manifest_url("https://fragorders.com/public_frag_order/ExampleLinkId0000001")
            .unwrap()
            .starts_with("https://firestore.googleapis.com/"));
        assert!(link_manifest_url("https://evil.example/public_frag_order/ExampleLinkId0000001").is_err());
        let bad = r#"{"fields": {"bundleAddress": {"stringValue": "https://evil.example/x.json"}}}"#;
        assert!(link_read_manifest(bad).is_err(), "a bundle off CloudFront is never followed");
    }

    #[test]
    fn missions_round_trip_and_squadron_profiles_merge() {
        let saved = r#"{"id":"m1","name":"T","date":"","theater":"nevada","bullseye":{"lat":0,"lon":0},
            "waypoints":[],"threats":[],"flightMembers":[],"attacks":[],"notes":"","createdAt":"","updatedAt":""}"#;
        let text = save_mission(saved).unwrap();
        assert!(text.contains("\"flightMembers\""));
        assert!(load_mission(&text).is_ok());
        assert!(save_mission(r#"{"name":"no id"}"#).is_err());

        let library: serde_json::Value = serde_json::from_str(
            &list_delivery_profiles(r#"[{"name":"broken.json","contents":"{"}]"#).unwrap(),
        )
        .unwrap();
        assert_eq!(library["warnings"].as_array().unwrap().len(), 1);
    }
}
