//! Delivery profile library.
//!
//! A profile is a named, pre-weaponeered way of delivering a class of weapon
//! from a specific aircraft — "30° Dive CCIP", "DTOS 20°", "Manual dive,
//! 105 mils". The pilot picks one; the tool fills the attack in.
//!
//! Two sources, merged by `id` with the user's winning:
//! - **Bundled**: `resources/profiles/<aircraftId>.json`, embedded at compile
//!   time so there is no resource path to get wrong on any platform.
//! - **Squadron overrides**: `<app data>/profiles/*.json`, the same shape.
//!   This is how a pilot flips `verified` after flying a profile, or adds one.
//!
//! Every profile is validated on load. A bad bundled file fails the Rust test
//! suite; a bad user file is reported to the UI as a warning, never dropped
//! silently.
//!
//! Every altitude in `params` is ft AGL over the target.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

pub const GEOMETRIES: &[&str] = &["level", "dive", "popup", "loft"];
pub const DELIVERY_MODES: &[&str] = &["CCIP", "CCRP", "AUTO", "DTOS", "MAN", "LABS", "LADD", "VIS"];
pub const WEAPON_CLASSES: &[&str] = &["bomb_ld", "bomb_hd", "lgb", "jdam", "rocket", "gun", "cluster", "agm"];

/// Bundled profile files. Adding an aircraft means adding a line here and a
/// file next to the others; the tests check every entry.
pub const BUNDLED: &[(&str, &str)] = &[
    // Modern
    ("f16c", include_str!("../../resources/profiles/f16c.json")),
    ("f18c", include_str!("../../resources/profiles/f18c.json")),
    ("a10c", include_str!("../../resources/profiles/a10c.json")),
    ("f15e", include_str!("../../resources/profiles/f15e.json")),
    // Vietnam era — manual sights, dive toss, LABS
    ("f4e", include_str!("../../resources/profiles/f4e.json")),
    ("a4ec", include_str!("../../resources/profiles/a4ec.json")),
    ("f5e", include_str!("../../resources/profiles/f5e.json")),
    // 1980s
    ("f14", include_str!("../../resources/profiles/f14.json")),
    ("f1", include_str!("../../resources/profiles/f1.json")),
    ("av8b", include_str!("../../resources/profiles/av8b.json")),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SightSetting {
    #[serde(default)]
    pub depression_mils: Option<f64>,
    #[serde(default)]
    pub notes: Option<String>,
}

/// Mirrors `DeliveryProfile` in `src/types/profile.types.ts`.
///
/// `deny_unknown_fields` so a typo in a squadron file ("verfied") is an error
/// rather than a silently ignored key.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeliveryProfile {
    pub id: String,
    pub aircraft_id: String,
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    pub geometry: String,
    pub delivery_mode: String,
    pub weapon_classes: Vec<String>,
    /// Geometry-specific numbers; validated per geometry in `validate`
    pub params: Value,
    #[serde(default)]
    pub sight: Option<SightSetting>,
    #[serde(default)]
    pub procedure: Vec<String>,
    /// Weapon classes this is the go-to profile for; a subset of `weapon_classes`
    #[serde(default)]
    pub default_for: Vec<String>,
    pub source: String,
    pub verified: bool,
    #[serde(default)]
    pub verified_by: Option<String>,
    #[serde(default)]
    pub verified_on: Option<String>,
}

/// What the frontend receives.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileLibrary {
    pub profiles: Vec<DeliveryProfile>,
    /// User files that could not be read, with the reason
    pub warnings: Vec<String>,
}

fn num(params: &Value, key: &str) -> Result<f64, String> {
    params
        .get(key)
        .and_then(Value::as_f64)
        .filter(|v| v.is_finite())
        .ok_or_else(|| format!("params.{key} missing or not a number"))
}

fn opt_num(params: &Value, key: &str) -> Result<Option<f64>, String> {
    match params.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(_) => num(params, key).map(Some),
    }
}

impl DeliveryProfile {
    /// Structural and numeric sanity. Weapon-specific floors (min release
    /// altitude, frag) are applied when an attack is built, because a profile
    /// covers a class of weapons, not one weapon.
    pub fn validate(&self) -> Result<(), String> {
        let fail = |msg: String| Err(format!("profile '{}': {msg}", self.id));

        if !self.id.starts_with(&format!("{}.", self.aircraft_id)) {
            return fail(format!("id must start with '{}.'", self.aircraft_id));
        }
        if self.name.trim().is_empty() {
            return fail("name is empty".into());
        }
        if !GEOMETRIES.contains(&self.geometry.as_str()) {
            return fail(format!("unknown geometry '{}' (expected one of {GEOMETRIES:?})", self.geometry));
        }
        if !DELIVERY_MODES.contains(&self.delivery_mode.as_str()) {
            return fail(format!("unknown deliveryMode '{}' (expected one of {DELIVERY_MODES:?})", self.delivery_mode));
        }
        if self.weapon_classes.is_empty() {
            return fail("weaponClasses is empty".into());
        }
        for class in &self.weapon_classes {
            if !WEAPON_CLASSES.contains(&class.as_str()) {
                return fail(format!("unknown weapon class '{class}' (expected one of {WEAPON_CLASSES:?})"));
            }
        }
        for class in &self.default_for {
            if !self.weapon_classes.contains(class) {
                return fail(format!("defaultFor lists '{class}', which is not in weaponClasses"));
            }
        }
        if self.source.trim().is_empty() {
            return fail("source is empty — say where the numbers came from".into());
        }
        if self.verified && self.verified_by.is_none() {
            return fail("verified profiles must say who verified them (verifiedBy)".into());
        }
        if let Some(sight) = &self.sight {
            if let Some(mils) = sight.depression_mils {
                if !(0.0..=400.0).contains(&mils) {
                    return fail(format!("sight.depression_mils {mils} is not a plausible depression"));
                }
            }
        }

        let p = &self.params;
        let positive = |key: &str| -> Result<f64, String> {
            let v = num(p, key)?;
            if v <= 0.0 {
                return Err(format!("params.{key} must be positive, got {v}"));
            }
            Ok(v)
        };
        let dive_angle = |key: &str| -> Result<f64, String> {
            let v = num(p, key)?;
            if !(5.0..=75.0).contains(&v) {
                return Err(format!("params.{key} {v}° is outside 5–75°"));
            }
            Ok(v)
        };

        let result: Result<(), String> = (|| {
            match self.geometry.as_str() {
                "level" => {
                    positive("releaseAltitude_ft")?;
                    positive("releaseSpeed_ktas")?;
                }
                "dive" => {
                    let roll_in = positive("rollInAltitude_ft")?;
                    let release = positive("releaseAltitude_ft")?;
                    dive_angle("diveAngle_deg")?;
                    positive("releaseSpeed_ktas")?;
                    if roll_in <= release {
                        return Err(format!("roll-in {roll_in} ft is not above release {release} ft"));
                    }
                    if let Some(g) = opt_num(p, "pulloutG")? {
                        if !(1.0..=9.0).contains(&g) {
                            return Err(format!("params.pulloutG {g} is outside 1–9"));
                        }
                    }
                }
                "popup" => {
                    let run_in = num(p, "runInAltitude_ft")?;
                    let apex = positive("apexAltitude_ft")?;
                    positive("runInSpeed_ktas")?;
                    positive("popDistance_nm")?;
                    dive_angle("diveAngle_deg")?;
                    let hard_deck = num(p, "minAltitude_ft")?;
                    if run_in < 0.0 || hard_deck < 0.0 {
                        return Err("run-in and hard deck must not be negative".into());
                    }
                    if apex <= run_in {
                        return Err(format!("apex {apex} ft is not above run-in {run_in} ft"));
                    }
                }
                "loft" => {
                    num(p, "ingressAltitude_ft")?;
                    positive("ingressSpeed_ktas")?;
                    positive("pullUpDistance_nm")?;
                    let angle = num(p, "pullUpAngle_deg")?;
                    if !(10.0..=60.0).contains(&angle) {
                        return Err(format!("params.pullUpAngle_deg {angle}° is outside 10–60°"));
                    }
                    positive("releaseAltitude_ft")?;
                }
                _ => unreachable!("geometry checked above"),
            }
            Ok(())
        })();

        result.or_else(|msg| fail(msg))
    }
}

/// Parse and validate one JSON file's worth of profiles.
fn parse_file(label: &str, json: &str) -> Result<Vec<DeliveryProfile>, String> {
    let list: Vec<DeliveryProfile> =
        serde_json::from_str(json).map_err(|e| format!("{label}: {e}"))?;
    for profile in &list {
        profile.validate().map_err(|e| format!("{label}: {e}"))?;
    }
    Ok(list)
}

/// Every bundled profile. Fails if any file is malformed — the tests keep it that way.
pub fn bundled_profiles() -> Result<Vec<DeliveryProfile>, String> {
    let mut all = Vec::new();
    for (aircraft, json) in BUNDLED {
        let label = format!("bundled profiles/{aircraft}.json");
        let list = parse_file(&label, json)?;
        for profile in &list {
            if profile.aircraft_id != *aircraft {
                return Err(format!(
                    "{label}: profile '{}' says aircraftId '{}' but lives in the {aircraft} file",
                    profile.id, profile.aircraft_id
                ));
            }
        }
        all.extend(list);
    }
    Ok(all)
}

/// The squadron's own profiles. A file that cannot be read becomes a warning;
/// the rest still load.
pub fn user_profiles(dir: &Path) -> (Vec<DeliveryProfile>, Vec<String>) {
    let mut profiles = Vec::new();
    let mut warnings = Vec::new();

    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return (profiles, warnings), // no folder yet is not an error
    };

    let mut paths: Vec<_> = entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
        .collect();
    paths.sort();

    for path in paths {
        let label = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        match std::fs::read_to_string(&path) {
            Ok(json) => match parse_file(&label, &json) {
                Ok(list) => profiles.extend(list),
                Err(e) => warnings.push(e),
            },
            Err(e) => warnings.push(format!("{label}: {e}")),
        }
    }
    (profiles, warnings)
}

/// User profiles replace bundled ones with the same id; new ids are appended.
pub fn merge(bundled: Vec<DeliveryProfile>, user: Vec<DeliveryProfile>) -> Vec<DeliveryProfile> {
    let mut by_id: HashMap<String, usize> = HashMap::new();
    let mut merged = bundled;
    for (i, profile) in merged.iter().enumerate() {
        by_id.insert(profile.id.clone(), i);
    }
    for profile in user {
        match by_id.get(&profile.id) {
            Some(&i) => merged[i] = profile,
            None => {
                by_id.insert(profile.id.clone(), merged.len());
                merged.push(profile);
            }
        }
    }
    merged
}

/// The whole library as the frontend sees it.
pub fn load_all(user_dir: &Path) -> Result<ProfileLibrary, String> {
    let bundled = bundled_profiles()?;
    let (user, warnings) = user_profiles(user_dir);
    Ok(ProfileLibrary {
        profiles: merge(bundled, user),
        warnings,
    })
}

/// Written into the user profiles folder the first time it is created, so a
/// squadron member who opens it knows what the files are.
pub const USER_DIR_README: &str = "\
Phoenix Weaponeer — squadron delivery profiles

Any *.json file in this folder is loaded on startup and merged with the
bundled library. A profile here with the same \"id\" as a bundled one
REPLACES it — that is how you fix a number or mark one verified after
flying it:

  \"verified\": true, \"verifiedBy\": \"Callsign\", \"verifiedOn\": \"2026-09-05\"

Each file is a JSON array of profiles. Copy one out of the app's bundled
set as a starting point (see docs/REVAMP_PLAN.md in the project for the
field list). Every altitude is feet AGL over the target.

A file that cannot be read is reported in the app; nothing loads from it.
";

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn every_bundled_file_parses_and_validates() {
        let all = bundled_profiles().expect("bundled profiles must be valid");
        assert!(!all.is_empty());
        let mut ids = HashSet::new();
        for p in &all {
            assert!(ids.insert(p.id.clone()), "duplicate profile id {}", p.id);
            assert!(!p.verified, "{}: nothing ships verified until a pilot flies it", p.id);
        }
    }

    #[test]
    fn every_bundled_aircraft_exists_in_the_database() {
        let db = crate::db::Database::open_in_memory().expect("db");
        let known: HashSet<String> = db.get_all_aircraft().unwrap().into_iter().map(|a| a.id).collect();
        for (aircraft, _) in BUNDLED {
            assert!(known.contains(*aircraft), "no aircraft row with id '{aircraft}' — add it to the db seed");
        }
    }

    /// Auto-build picks "the default for this class"; two of them would make
    /// that pick arbitrary. And every class an aircraft's profiles mention
    /// should have one, or auto-build silently falls back to "whichever came
    /// first in the file".
    #[test]
    fn exactly_one_default_per_weapon_class_per_aircraft() {
        let all = bundled_profiles().unwrap();
        let mut defaults: HashMap<(String, String), String> = HashMap::new();
        let mut mentioned: HashSet<(String, String)> = HashSet::new();
        for p in &all {
            for class in &p.weapon_classes {
                mentioned.insert((p.aircraft_id.clone(), class.clone()));
            }
            for class in &p.default_for {
                let key = (p.aircraft_id.clone(), class.clone());
                if let Some(other) = defaults.insert(key, p.id.clone()) {
                    panic!("{} and {} are both default for {}/{}", other, p.id, p.aircraft_id, class);
                }
            }
        }
        for (aircraft, class) in &mentioned {
            assert!(
                defaults.contains_key(&(aircraft.clone(), class.clone())),
                "{aircraft} has profiles for {class} but none is defaultFor it"
            );
        }
    }

    #[test]
    fn user_override_replaces_bundled_by_id() {
        let bundled = bundled_profiles().unwrap();
        let mut edited = bundled[0].clone();
        edited.name = "Squadron edit".into();
        edited.verified = true;
        edited.verified_by = Some("Viper 1-1".into());

        let dir = std::env::temp_dir().join(format!("phoenix_profiles_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("squadron.json"), serde_json::to_string(&vec![edited.clone()]).unwrap()).unwrap();
        std::fs::write(dir.join("broken.json"), "{ not json").unwrap();

        let library = load_all(&dir).unwrap();
        std::fs::remove_dir_all(&dir).ok();

        assert_eq!(library.profiles.len(), bundled.len(), "an override must replace, not duplicate");
        let replaced = library.profiles.iter().find(|p| p.id == edited.id).unwrap();
        assert_eq!(replaced.name, "Squadron edit");
        assert!(replaced.verified);
        assert_eq!(library.warnings.len(), 1, "the broken file must be reported");
        assert!(library.warnings[0].starts_with("broken.json"));
    }

    #[test]
    fn typos_and_bad_numbers_are_rejected() {
        let base = serde_json::json!({
            "id": "f16c.test", "aircraftId": "f16c", "name": "T", "geometry": "dive",
            "deliveryMode": "CCIP", "weaponClasses": ["bomb_ld"],
            "params": { "rollInAltitude_ft": 8000, "diveAngle_deg": 30, "releaseAltitude_ft": 4500, "releaseSpeed_ktas": 450 },
            "source": "test", "verified": false
        });

        let mut typo = base.clone();
        typo["verfied"] = serde_json::json!(false);
        assert!(serde_json::from_value::<DeliveryProfile>(typo).is_err(), "unknown field must be rejected");

        let mut inverted = base.clone();
        inverted["params"]["rollInAltitude_ft"] = serde_json::json!(3000);
        let p: DeliveryProfile = serde_json::from_value(inverted).unwrap();
        assert!(p.validate().unwrap_err().contains("not above release"));

        let mut wrong_file = base.clone();
        wrong_file["weaponClasses"] = serde_json::json!(["dumb"]);
        let p: DeliveryProfile = serde_json::from_value(wrong_file).unwrap();
        assert!(p.validate().unwrap_err().contains("unknown weapon class"));

        let ok: DeliveryProfile = serde_json::from_value(base).unwrap();
        ok.validate().unwrap();
    }
}
