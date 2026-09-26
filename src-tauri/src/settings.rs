//! App settings: preferences that outlive a mission, kept in
//! `<app data>/settings.json`.
//!
//! First tenant: the DCS kneeboard folder for each aircraft type. The app never
//! decides that folder itself — DCS installs differ too much (a moved or
//! OneDrive-redirected Saved Games, `DCS.openbeta`, module folder names nobody
//! has checked against a real install). A detected path is only where the
//! folder picker opens; the folder the user picks is what gets remembered.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const SETTINGS_FILE: &str = "settings.json";

/// Everything the settings file holds. Every field needs `#[serde(default)]`,
/// or a settings file written before that field existed stops loading — and
/// its default must match `Default` below.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Aircraft id (`f16c`) → the DCS kneeboard folder the user chose for that type.
    #[serde(default)]
    pub kneeboard_folders: BTreeMap<String, String>,
    /// The grey map layer behind the kneeboard card's plan view. On unless the
    /// user turned it off.
    #[serde(default = "on")]
    pub kneeboard_map: bool,
    /// Mission files last opened or saved, newest first, for the front page.
    #[serde(default)]
    pub recent_missions: Vec<String>,
}

fn on() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Settings { kneeboard_folders: BTreeMap::new(), kneeboard_map: true, recent_missions: Vec::new() }
    }
}

/// How many recent missions the front page lists.
pub const MAX_RECENT_MISSIONS: usize = 8;

/// Put a mission file at the top of the recent list, once. Only an existing
/// `.json` file is taken: the list is offered back to `load_mission` later,
/// so it must never collect anything else.
pub fn with_recent_mission(mut settings: Settings, path: &str) -> Result<Settings, String> {
    let file = Path::new(path);
    let is_json = file.extension().is_some_and(|e| e.eq_ignore_ascii_case("json"));
    if !is_json || !file.is_file() {
        return Err(format!("{path} is not a mission file"));
    }
    settings.recent_missions.retain(|p| p != path);
    settings.recent_missions.insert(0, path.to_string());
    settings.recent_missions.truncate(MAX_RECENT_MISSIONS);
    Ok(settings)
}

/// Drop one mission file from the recent list.
pub fn without_recent_mission(mut settings: Settings, path: &str) -> Settings {
    settings.recent_missions.retain(|p| p != path);
    settings
}

/// Settings as loaded, plus why they are defaults when the file was unusable.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsLoad {
    pub settings: Settings,
    pub warning: Option<String>,
}

/// A missing file is simply defaults. An unreadable or damaged one is defaults
/// too — a bad settings file must never stop the app — but says so, and is
/// replaced by the next change the user makes.
pub fn read_settings(path: &Path) -> SettingsLoad {
    let (settings, warning) = match std::fs::read_to_string(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (Settings::default(), None),
        Err(e) => (Settings::default(), Some(format!("Cannot read {}: {e}", path.display()))),
        Ok(json) => match serde_json::from_str(&json) {
            Ok(settings) => (settings, None),
            Err(e) => (
                Settings::default(),
                Some(format!("{} is damaged ({e}); using defaults", path.display())),
            ),
        },
    };
    SettingsLoad { settings, warning }
}

/// Written to a temporary file and renamed into place, so a crash mid-write
/// cannot leave half a settings file behind.
pub fn write_settings(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create {}: {e}", parent.display()))?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("Cannot write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("Cannot replace {}: {e}", path.display()))
}

/// Remember (`Some`) or forget (`None`) one aircraft type's kneeboard folder.
/// A folder that is not an existing directory is refused, and nothing changes.
pub fn with_kneeboard_folder(
    mut settings: Settings,
    aircraft_id: &str,
    folder: Option<&str>,
) -> Result<Settings, String> {
    if aircraft_id.trim().is_empty() {
        return Err("No aircraft type given".to_string());
    }
    match folder {
        Some(folder) => {
            if !Path::new(folder).is_dir() {
                return Err(format!("{folder} is not a folder"));
            }
            settings.kneeboard_folders.insert(aircraft_id.to_string(), folder.to_string());
        }
        None => {
            settings.kneeboard_folders.remove(aircraft_id);
        }
    }
    Ok(settings)
}

/// The nearest folder that actually exists, walking up from `path`.
pub fn deepest_existing(path: &Path) -> Option<PathBuf> {
    path.ancestors().find(|p| p.is_dir()).map(Path::to_path_buf)
}

/// A database folder name is only trusted as one plain folder name.
fn plain_folder_name(name: &str) -> Option<&str> {
    let trimmed = name.trim();
    let plain = !trimmed.is_empty() && trimmed != "." && trimmed != ".." && !trimmed.contains(['/', '\\']);
    plain.then_some(trimmed)
}

/// Where the folder picker should open for an aircraft type: its folder under
/// `DCS` or `DCS.openbeta` when one exists, otherwise the nearest existing
/// parent of where it would be. A starting point only — the user confirms.
pub fn suggest_kneeboard_folder(saved_games: Option<&Path>, kneeboard_path: &str) -> Option<PathBuf> {
    let base = saved_games?;
    let sub = plain_folder_name(kneeboard_path);
    let under = |dcs: &str| {
        let kneeboard = base.join(dcs).join("Kneeboard");
        match sub {
            Some(sub) => kneeboard.join(sub),
            None => kneeboard,
        }
    };
    ["DCS", "DCS.openbeta"]
        .iter()
        .map(|dcs| under(dcs))
        .find(|p| p.is_dir())
        .or_else(|| deepest_existing(&under("DCS")))
}

/// DCS's usual Saved Games parent, as best we can tell without asking. On
/// Windows that is `%USERPROFILE%\Saved Games`; elsewhere DCS does not run, so
/// the picker just opens at home.
pub fn saved_games_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("USERPROFILE").map(|p| PathBuf::from(p).join("Saved Games"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh, empty scratch folder per test, so tests can run in parallel.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("phoenix_settings_{}_{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_missing_settings_file_is_defaults_without_a_warning() {
        let load = read_settings(&scratch("missing").join(SETTINGS_FILE));
        assert_eq!(load.settings, Settings::default());
        assert!(load.warning.is_none());
    }

    #[test]
    fn a_damaged_settings_file_loads_as_defaults_and_says_so() {
        let path = scratch("damaged").join(SETTINGS_FILE);
        std::fs::write(&path, "{ not json").unwrap();
        let load = read_settings(&path);
        assert_eq!(load.settings, Settings::default());
        assert!(load.warning.unwrap().contains("damaged"));
    }

    #[test]
    fn settings_round_trip_through_the_file_with_no_temp_file_left_behind() {
        let dir = scratch("round_trip");
        let path = dir.join(SETTINGS_FILE);
        let folder = scratch("round_trip_folder");
        let settings = with_kneeboard_folder(Settings::default(), "f16c", Some(folder.to_str().unwrap())).unwrap();
        write_settings(&path, &settings).unwrap();

        let on_disk = std::fs::read_to_string(&path).unwrap();
        assert!(on_disk.contains("\"kneeboardFolders\""), "camelCase on disk, got: {on_disk}");
        assert_eq!(read_settings(&path).settings, settings);
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn a_settings_file_from_an_older_or_newer_version_still_loads() {
        let path = scratch("versions").join(SETTINGS_FILE);
        std::fs::write(&path, r#"{ "someFutureSetting": true }"#).unwrap();
        let load = read_settings(&path);
        assert!(load.warning.is_none());
        assert!(load.settings.kneeboard_folders.is_empty());
    }

    #[test]
    fn the_card_map_is_on_unless_turned_off_even_for_an_older_settings_file() {
        assert!(Settings::default().kneeboard_map);

        let path = scratch("map_old_file").join(SETTINGS_FILE);
        std::fs::write(&path, r#"{ "kneeboardFolders": {} }"#).unwrap();
        assert!(read_settings(&path).settings.kneeboard_map, "a file from before the switch keeps the map");

        let off = Settings { kneeboard_map: false, ..Settings::default() };
        write_settings(&path, &off).unwrap();
        assert!(std::fs::read_to_string(&path).unwrap().contains("\"kneeboardMap\": false"));
        assert!(!read_settings(&path).settings.kneeboard_map);
    }

    /// A real `.json` file in a scratch folder, for the recent-missions tests.
    fn mission_file(dir: &Path, name: &str) -> String {
        let path = dir.join(name);
        std::fs::write(&path, "{}").unwrap();
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn a_recent_mission_goes_to_the_front_once_and_the_list_stays_short() {
        let dir = scratch("recent_order");
        let a = mission_file(&dir, "a.json");
        let b = mission_file(&dir, "b.json");

        let s = with_recent_mission(Settings::default(), &a).unwrap();
        let s = with_recent_mission(s, &b).unwrap();
        assert_eq!(s.recent_missions, vec![b.clone(), a.clone()]);

        // Opening `a` again moves it up rather than listing it twice.
        let s = with_recent_mission(s, &a).unwrap();
        assert_eq!(s.recent_missions, vec![a.clone(), b.clone()]);

        let mut s = s;
        for i in 0..MAX_RECENT_MISSIONS + 3 {
            s = with_recent_mission(s, &mission_file(&dir, &format!("m{i}.json"))).unwrap();
        }
        assert_eq!(s.recent_missions.len(), MAX_RECENT_MISSIONS);
        assert!(s.recent_missions[0].ends_with(&format!("m{}.json", MAX_RECENT_MISSIONS + 2)));
    }

    #[test]
    fn only_an_existing_mission_file_is_remembered_and_forgetting_removes_it() {
        let dir = scratch("recent_refuse");
        let a = mission_file(&dir, "a.json");
        let not_json = dir.join("notes.txt");
        std::fs::write(&not_json, "x").unwrap();

        assert!(with_recent_mission(Settings::default(), not_json.to_str().unwrap()).is_err());
        assert!(with_recent_mission(Settings::default(), &format!("{a}.gone.json")).is_err());
        assert!(with_recent_mission(Settings::default(), dir.to_str().unwrap()).is_err());

        let s = with_recent_mission(Settings::default(), &a).unwrap();
        assert!(without_recent_mission(s, &a).recent_missions.is_empty());
    }

    #[test]
    fn an_older_settings_file_has_no_recent_missions() {
        let path = scratch("recent_old_file").join(SETTINGS_FILE);
        std::fs::write(&path, r#"{ "kneeboardFolders": {} }"#).unwrap();
        let load = read_settings(&path);
        assert!(load.warning.is_none());
        assert!(load.settings.recent_missions.is_empty());
    }

    #[test]
    fn remembering_a_folder_needs_a_real_folder_and_forgetting_removes_it() {
        let folder = scratch("remember");
        let folder = folder.to_str().unwrap();
        let set = with_kneeboard_folder(Settings::default(), "f16c", Some(folder)).unwrap();
        assert_eq!(set.kneeboard_folders.get("f16c").map(String::as_str), Some(folder));

        let missing = format!("{folder}/does_not_exist");
        assert!(with_kneeboard_folder(set.clone(), "a10c", Some(&missing)).is_err());
        assert!(with_kneeboard_folder(set.clone(), "  ", Some(folder)).is_err());

        let forgotten = with_kneeboard_folder(set, "f16c", None).unwrap();
        assert!(forgotten.kneeboard_folders.is_empty());
    }

    #[test]
    fn the_picker_opens_at_the_aircraft_folder_when_dcs_already_has_one() {
        let saved = scratch("suggest_exact");
        let exact = saved.join("DCS").join("Kneeboard").join("F-16C");
        std::fs::create_dir_all(&exact).unwrap();
        assert_eq!(suggest_kneeboard_folder(Some(&saved), "F-16C"), Some(exact));
    }

    #[test]
    fn the_picker_finds_an_openbeta_folder_when_that_is_the_one_that_exists() {
        let saved = scratch("suggest_openbeta");
        let beta = saved.join("DCS.openbeta").join("Kneeboard").join("AV8BNA");
        std::fs::create_dir_all(&beta).unwrap();
        std::fs::create_dir_all(saved.join("DCS")).unwrap();
        assert_eq!(suggest_kneeboard_folder(Some(&saved), "AV8BNA"), Some(beta));
    }

    #[test]
    fn with_no_aircraft_folder_yet_the_picker_opens_at_the_nearest_parent() {
        let saved = scratch("suggest_parent");
        std::fs::create_dir_all(saved.join("DCS")).unwrap();
        assert_eq!(suggest_kneeboard_folder(Some(&saved), "F-14B"), Some(saved.join("DCS")));

        let bare = scratch("suggest_bare");
        assert_eq!(suggest_kneeboard_folder(Some(&bare), "F-14B"), Some(bare));
        assert_eq!(suggest_kneeboard_folder(None, "F-14B"), None);
    }

    #[test]
    fn a_folder_name_that_climbs_out_of_the_kneeboard_folder_is_ignored() {
        let saved = scratch("suggest_escape");
        let kneeboard = saved.join("DCS").join("Kneeboard");
        std::fs::create_dir_all(&kneeboard).unwrap();
        std::fs::create_dir_all(saved.join("DCS").join("Scripts")).unwrap();
        for hostile in ["../Scripts", "..", "a\\b", ""] {
            assert_eq!(suggest_kneeboard_folder(Some(&saved), hostile), Some(kneeboard.clone()), "{hostile:?}");
        }
    }
}
