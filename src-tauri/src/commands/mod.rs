//! Tauri command handlers
//!
//! This module contains all the command handlers that are exposed to the frontend
//! via Tauri's IPC mechanism. The work behind most of them is in
//! `weaponeer_core`, which the web build runs too; what is desktop-only lives
//! here: files, folders, the link download, the playback's tiles, settings
//! and quitting.

use crate::link_fetch;
use crate::settings;
use crate::tiles;
use std::path::{Path, PathBuf};
use tauri::ipc::Response;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use weaponeer_core::mission::{mission_to_json, parse_saved_mission, Mission};
use weaponeer_core::parsers::ProcessedFragOrdersData;
use weaponeer_core::refdata::{reference, Aircraft, FuzeOption, ThreatSystem, Weapon};
use weaponeer_core::theaters::TheaterInfo;
use weaponeer_core::{import, profiles, theaters};

// ============================================================================
// Mission Commands
// ============================================================================

/// Refuse to write anything but the one file type a command exists for. The
/// frontend passes whatever path it has, and a command that writes any
/// extension is a way to drop a runnable file (a `.bat` in Startup) on disk.
fn require_extension(path: &str, extension: &str, what: &str) -> Result<(), String> {
    let matches = Path::new(path)
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
    let json = mission_to_json(&mission)?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// What `load_mission` says when the file is not there any more. The front
/// page's recent list matches this exact text (`MISSION_FILE_GONE` in
/// `src/lib/missionFile.ts`) to drop the dead entry — change both together.
pub const MISSION_FILE_GONE: &str = "That mission file has been moved or deleted.";

/// Load mission from file
#[tauri::command]
pub fn load_mission(path: String) -> Result<Mission, String> {
    let json = std::fs::read_to_string(&path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => MISSION_FILE_GONE.to_string(),
        _ => e.to_string(),
    })?;
    parse_saved_mission(&json)
}

/// The load box's size limit: the same number as the link download's, which
/// `LOAD_MAX_BYTES` in src/lib/landing/loadSniff.ts is checked to equal.
const LOAD_MAX_BYTES: u64 = weaponeer_core::fragorders_link::MAX_BODY_BYTES;

/// What `read_load_file` answers when it turns a file away unread. The load
/// box matches these exact words (`READ_REFUSALS` in
/// src/lib/landing/loadRouter.ts) and shows its own sentence for each, so
/// they are codes, not prose; a test keeps the two sides the same.
pub const LOAD_NOT_JSON: &str = "not-json";
pub const LOAD_NOT_A_FILE: &str = "not-a-file";
pub const LOAD_TOO_LARGE: &str = "too-large";

/// The bytes of a file for the load box, after every refusal that needs no
/// reading: the name must end in `.json`, the path must be a regular file (a
/// folder, a device or a pipe named `x.json` is never opened: opening a pipe
/// would wait for a writer for ever), and it must fit the size limit.
fn read_load_bytes(path: &str) -> Result<Vec<u8>, String> {
    let is_json = Path::new(path)
        .extension()
        .map(|e| e.eq_ignore_ascii_case("json"))
        .unwrap_or(false);
    if !is_json {
        return Err(LOAD_NOT_JSON.to_string());
    }
    let meta = std::fs::metadata(path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => MISSION_FILE_GONE.to_string(),
        _ => e.to_string(),
    })?;
    if !meta.is_file() {
        return Err(LOAD_NOT_A_FILE.to_string());
    }
    if meta.len() > LOAD_MAX_BYTES {
        return Err(LOAD_TOO_LARGE.to_string());
    }
    std::fs::read(path).map_err(|e| e.to_string())
}

/// A `.json` file the planner picked in the front page's Choose file dialog or
/// dropped on the window, whatever it holds: the load box tells a saved mission
/// from a FragOrders export, and a saved mission keeps its path (Save writes
/// back to it). Raw bytes, as the tile commands send them, not text: a
/// FragOrders export written by Windows PowerShell's `>` is UTF-16, and the
/// load box's one decoder reads it on both platforms. Reads only; nothing is
/// written. Off the main thread, so a slow disk never stalls the window.
#[tauri::command]
pub async fn read_load_file(path: String) -> Result<Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || read_load_bytes(&path))
        .await
        .map_err(|e| format!("Reading the file stopped unexpectedly: {e}"))??;
    Ok(Response::new(bytes))
}

// ============================================================================
// Delivery Profile Commands
// ============================================================================

/// The squadron's profile folder: `<app data>/profiles`.
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

/// Every `*.json` file in the squadron profile folder, read. A file that
/// cannot be read comes back with the reason, for the UI to report; no folder
/// yet is not an error.
fn read_user_profile_files(dir: &Path) -> Vec<profiles::UserFile> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
        .map(|path| profiles::UserFile {
            name: path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
            contents: std::fs::read_to_string(&path).map_err(|e| e.to_string()),
        })
        .collect()
}

/// Bundled profiles merged with the squadron's overrides. Unreadable user
/// files come back as warnings so the UI can say so.
#[tauri::command]
pub fn list_delivery_profiles(app: AppHandle) -> Result<profiles::ProfileLibrary, String> {
    let dir = profiles_dir(&app)?;
    profiles::load_all(read_user_profile_files(&dir))
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

/// List every DCS theater the app knows about (see `weaponeer_core::theaters`).
#[tauri::command]
pub fn list_theaters() -> Vec<TheaterInfo> {
    theaters::list_theaters()
}

// ============================================================================
// Reference Data Commands
// ============================================================================

/// Get all threat systems
#[tauri::command]
pub fn get_all_threats() -> Result<Vec<ThreatSystem>, String> {
    Ok(reference().get_all_threats())
}

/// Get threats filtered by type (SAM, AAA, MANPADS, SHORAD, EWR)
#[tauri::command]
pub fn get_threats_by_type(threat_type: String) -> Result<Vec<ThreatSystem>, String> {
    Ok(reference().get_threats_by_type(&threat_type))
}

/// Get all weapons
#[tauri::command]
pub fn get_all_weapons() -> Result<Vec<Weapon>, String> {
    Ok(reference().get_all_weapons())
}

/// Get weapons compatible with a specific aircraft
#[tauri::command]
pub fn get_weapons_for_aircraft(aircraft_id: String) -> Result<Vec<Weapon>, String> {
    Ok(reference().get_weapons_for_aircraft(&aircraft_id))
}

/// Get all aircraft
#[tauri::command]
pub fn get_all_aircraft() -> Result<Vec<Aircraft>, String> {
    Ok(reference().get_all_aircraft())
}

/// Get fuze options for a specific weapon
#[tauri::command]
pub fn get_fuze_options(weapon_id: String) -> Result<Vec<FuzeOption>, String> {
    Ok(reference().get_fuze_options(&weapon_id))
}

// ============================================================================
// Import Commands
// ============================================================================

/// Import FragOrders JSON: CLI output, or a saved public-link payload
/// (see `weaponeer_core::import::import_json`).
#[tauri::command]
pub fn parse_fragorders_json(json_str: String) -> Result<ProcessedFragOrdersData, String> {
    import::import_json(&json_str, reference())
}

/// Fetch a FragOrders public link and import what it carries.
///
/// The network work runs off the main thread; the import itself is the same
/// one a pasted link payload goes through.
#[tauri::command]
pub async fn fetch_fragorders_url(url: String) -> Result<ProcessedFragOrdersData, String> {
    let link = tauri::async_runtime::spawn_blocking(move || link_fetch::fetch(&url))
        .await
        .map_err(|e| format!("The download stopped unexpectedly: {e}"))??;
    import::import_link(link, reference())
}

// ============================================================================
// 3D Playback Tile Commands
// ============================================================================

/// One tile, from the cache or the network, off the main thread like the link
/// download. The key is checked before any path or address is built from it.
async fn tile_response(app: AppHandle, kind: tiles::TileKind, z: u32, x: u32, y: u32) -> Result<Response, String> {
    let key = tiles::TileKey::new(z, x, y)?;
    let root = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Cannot resolve app cache dir: {e}"))?;
    let bytes = tauri::async_runtime::spawn_blocking(move || tiles::get_tile(&root, kind, key, tiles::download))
        .await
        .map_err(|e| format!("The tile download stopped unexpectedly: {e}"))??;
    Ok(Response::new(bytes))
}

/// An OpenStreetMap tile's PNG bytes, as raw binary (an `ArrayBuffer` in JS),
/// not a JSON array of numbers. Fails with `"missing"`, `"offline"` (no
/// network and nothing cached), or a plain sentence.
#[tauri::command]
pub async fn get_map_tile(app: AppHandle, z: u32, x: u32, y: u32) -> Result<Response, String> {
    tile_response(app, tiles::TileKind::Map, z, x, y).await
}

/// A Terrarium tile decoded to 65536 little-endian f32 heights in metres
/// (256 x 256, row by row from the top-left), as raw binary. Same errors as
/// `get_map_tile`.
#[tauri::command]
pub async fn get_terrain_tile(app: AppHandle, z: u32, x: u32, y: u32) -> Result<Response, String> {
    tile_response(app, tiles::TileKind::Terrain, z, x, y).await
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

/// Every zip starts with a local file header.
const ZIP_SIGNATURE: &[u8] = b"PK\x03\x04";

/// Save a brief pack (`.zip` only), built by the frontend, from base64 bytes.
///
/// Like the PNG command: one file type, and the bytes must look like it, so
/// this cannot be used to drop some other file on disk.
#[tauri::command]
pub fn save_brief_pack(path: String, base64_data: String) -> Result<(), String> {
    use base64::Engine;
    require_extension(&path, "zip", "Brief packs")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    if !bytes.starts_with(ZIP_SIGNATURE) {
        return Err("Not a zip file".to_string());
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

/// Turn the kneeboard card's map layer on or off for good. Returns the
/// settings as now saved.
#[tauri::command]
pub fn set_kneeboard_map(app: AppHandle, on: bool) -> Result<settings::Settings, String> {
    let path = settings_path(&app)?;
    let next = settings::Settings { kneeboard_map: on, ..settings::read_settings(&path).settings };
    settings::write_settings(&path, &next)?;
    Ok(next)
}

/// Set how long the loading splash stays up when the app starts, in seconds
/// (kept between 0 and 10, in tenths). Returns the settings as now saved.
#[tauri::command]
pub fn set_splash_seconds(app: AppHandle, seconds: f64) -> Result<settings::Settings, String> {
    let path = settings_path(&app)?;
    let next = settings::Settings {
        splash_seconds: settings::clean_splash_seconds(seconds),
        ..settings::read_settings(&path).settings
    };
    settings::write_settings(&path, &next)?;
    Ok(next)
}

/// Put a mission file at the top of the front page's recent list. Returns the
/// settings as now saved.
#[tauri::command]
pub fn remember_recent_mission(app: AppHandle, path: String) -> Result<settings::Settings, String> {
    let file = settings_path(&app)?;
    let next = settings::with_recent_mission(settings::read_settings(&file).settings, &path)?;
    settings::write_settings(&file, &next)?;
    Ok(next)
}

/// Drop a mission file from the recent list. Returns the settings as now saved.
#[tauri::command]
pub fn forget_recent_mission(app: AppHandle, path: String) -> Result<settings::Settings, String> {
    let file = settings_path(&app)?;
    let next = settings::without_recent_mission(settings::read_settings(&file).settings, &path);
    settings::write_settings(&file, &next)?;
    Ok(next)
}

/// Whether a remembered folder is still there — a reinstalled or moved DCS
/// means asking again rather than recreating a dead path.
#[tauri::command]
pub fn folder_exists(path: String) -> bool {
    Path::new(&path).is_dir()
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
    use weaponeer_core::mission::{CardLighting, Coordinates};

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

    fn zip_bytes() -> Vec<u8> {
        [ZIP_SIGNATURE, b"rest of the archive"].concat()
    }

    #[test]
    fn a_brief_pack_saves_as_a_zip() {
        let path = scratch_dir("pack_ok").join("Op_brief_pack.ZIP");
        save_brief_pack(path.to_string_lossy().into_owned(), base64_of(&zip_bytes())).expect("save");
        assert_eq!(std::fs::read(&path).unwrap(), zip_bytes());
    }

    #[test]
    fn a_brief_pack_save_refuses_any_other_file_type() {
        let dir = scratch_dir("pack_ext");
        for name in ["startup.bat", "pack.zip.exe", "pack"] {
            let path = dir.join(name);
            let result = save_brief_pack(path.to_string_lossy().into_owned(), base64_of(&zip_bytes()));
            assert!(result.is_err(), "{name} was accepted");
            assert!(!path.exists(), "{name} was written");
        }
    }

    #[test]
    fn a_brief_pack_save_refuses_bytes_that_are_not_a_zip() {
        let path = scratch_dir("pack_bytes").join("pack.zip");
        let result = save_brief_pack(path.to_string_lossy().into_owned(), base64_of(b"@echo off\r\n"));
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
            strikes: vec![],
            card_lighting: CardLighting::Day,
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

    /// Save then Open gives back what was saved, keys and all (the key
    /// spellings themselves are pinned in `weaponeer_core::mission`).
    #[test]
    fn a_saved_mission_opens_again() {
        let path = scratch_dir("mission_round_trip").join("m.json");
        let mut mission = empty_mission();
        mission.strikes = vec![serde_json::json!({"id": "s1", "name": "Viper 1 strike"})];
        mission.card_lighting = CardLighting::Night;
        save_mission(mission, path.to_string_lossy().into_owned()).expect("save");
        let back = load_mission(path.to_string_lossy().into_owned()).expect("load");
        assert_eq!(back.name, "Op");
        assert_eq!(back.strikes[0]["name"], "Viper 1 strike");
        assert_eq!(back.card_lighting, CardLighting::Night);
    }

    #[test]
    fn opening_a_mission_file_that_is_gone_says_so_plainly() {
        let gone = scratch_dir("mission_gone").join("moved.json");
        // The front page matches this exact text to drop the dead entry.
        assert_eq!(load_mission(gone.to_string_lossy().into_owned()).unwrap_err(), MISSION_FILE_GONE);
        let frontend = include_str!("../../../src/lib/missionFile.ts");
        assert!(
            frontend.contains(&format!("MISSION_FILE_GONE = '{MISSION_FILE_GONE}'")),
            "src/lib/missionFile.ts must carry the same text"
        );
    }

    fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {
        read_load_bytes(&path.to_string_lossy())
    }

    // Red when: `if !is_json {` becomes `if false {`.
    // Seen: called `Result::unwrap_err()` on an `Ok` value: [101, 99, 104, 111]
    #[test]
    fn the_load_box_reads_a_json_file_and_nothing_else() {
        let dir = scratch_dir("read_load_file");
        let json = dir.join("Strike.JSON");
        std::fs::write(&json, "{\"a\":1}").unwrap();
        assert_eq!(read_bytes(&json).unwrap(), b"{\"a\":1}");
        let bat = dir.join("run.bat");
        std::fs::write(&bat, "echo").unwrap();
        assert_eq!(read_bytes(&bat).unwrap_err(), LOAD_NOT_JSON, "a .bat must be refused unread");
        assert_eq!(read_bytes(&dir.join("gone.json")).unwrap_err(), MISSION_FILE_GONE);
    }

    // Red when: the read becomes `std::fs::read_to_string(path).map(String::into_bytes)`.
    // Seen: called `Result::unwrap()` on an `Err` value: "stream did not contain valid UTF-8"
    #[test]
    fn the_load_box_gets_the_bytes_unchanged_even_utf16() {
        // What Windows PowerShell's `>` writes: a byte-order mark, then UTF-16LE.
        let mut utf16 = vec![0xFF, 0xFE];
        utf16.extend("{\"theatre\":\"Caucasus\",\"coalition\":{}}".encode_utf16().flat_map(u16::to_le_bytes));
        let path = scratch_dir("read_load_utf16").join("export.json");
        std::fs::write(&path, &utf16).unwrap();
        assert_eq!(read_bytes(&path).unwrap(), utf16);
    }

    // Red when: the `if !meta.is_file() {` refusal is deleted.
    // Seen: assertion `left == right` failed  left: "Is a directory (os error 21)"  right: "not-a-file"
    #[test]
    fn the_load_box_never_opens_a_folder_named_like_a_file() {
        let folder = scratch_dir("read_load_folder").join("x.json");
        std::fs::create_dir_all(&folder).unwrap();
        assert_eq!(read_bytes(&folder).unwrap_err(), LOAD_NOT_A_FILE);
    }

    // Red when: the `if meta.len() > LOAD_MAX_BYTES {` refusal is deleted.
    // Seen: assertion `left == right` failed: the whole file was read  left: None  right: Some("too-large")
    #[test]
    fn the_load_box_refuses_a_file_over_the_limit_unread() {
        let path = scratch_dir("read_load_large").join("huge.json");
        // Sparse, so the test writes almost nothing to disk.
        std::fs::File::create(&path).unwrap().set_len(LOAD_MAX_BYTES + 1).unwrap();
        let result = read_bytes(&path);
        assert_eq!(result.as_ref().err().map(String::as_str), Some(LOAD_TOO_LARGE), "the whole file was read");
        let at_limit = scratch_dir("read_load_limit").join("full.json");
        std::fs::File::create(&at_limit).unwrap().set_len(LOAD_MAX_BYTES).unwrap();
        assert_eq!(read_bytes(&at_limit).unwrap().len() as u64, LOAD_MAX_BYTES);
    }

    // Red when: a code here and its key in loadRouter.ts's READ_REFUSALS differ (`'too-large'` there spelt `'too-big'`).
    // Seen: panicked: src/lib/landing/loadRouter.ts must know the refusal too-large
    #[test]
    fn the_load_box_knows_every_refusal_the_read_command_gives() {
        let frontend = include_str!("../../../src/lib/landing/loadRouter.ts");
        for code in [LOAD_NOT_JSON, LOAD_NOT_A_FILE, LOAD_TOO_LARGE] {
            assert!(frontend.contains(&format!("['{code}', ")), "src/lib/landing/loadRouter.ts must know the refusal {code}");
        }
    }

    /// The squadron folder is read in full: every `.json`, readable or not,
    /// and nothing else.
    #[test]
    fn the_profile_folder_is_read_for_json_files_only() {
        let dir = scratch_dir("profiles");
        std::fs::write(dir.join("squadron.json"), "[]").unwrap();
        std::fs::write(dir.join("broken.json"), "{ not json").unwrap();
        std::fs::write(dir.join("README.txt"), profiles::USER_DIR_README).unwrap();
        let mut names: Vec<String> = read_user_profile_files(&dir).into_iter().map(|f| f.name).collect();
        names.sort();
        assert_eq!(names, vec!["broken.json", "squadron.json"]);

        let library = profiles::load_all(read_user_profile_files(&dir)).unwrap();
        assert_eq!(library.warnings.len(), 1, "the broken file is reported");
        assert!(read_user_profile_files(&dir.join("not_there")).is_empty(), "no folder is not an error");
    }
}
