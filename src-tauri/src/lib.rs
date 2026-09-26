//! DCS Attack Planner - Rust Backend
//!
//! This library provides the backend functionality for the DCS Attack Planner:
//! mission file I/O, the threat/weapon/aircraft database, FragOrders import with
//! coordinate conversion (from CLI output or a public link), the delivery profile library, and settings. Kneeboard
//! cards are rendered in the frontend; the backend only writes the PNG.

/// Loads a real-mission fixture from `test-data/private/`, which is git-ignored:
/// squadron missions and captured FragOrders links stay off the public repo.
/// When the file isn't there, the calling test prints a note and passes.
#[cfg(test)]
#[macro_export]
macro_rules! private_fixture {
    ($name:literal) => {
        match std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../test-data/private/",
            $name
        )) {
            Ok(json) => &*Box::leak(json.into_boxed_str()),
            Err(_) => {
                eprintln!("skipped: test-data/private/{} is not present", $name);
                return;
            }
        }
    };
}

pub mod commands;
pub mod db;
pub mod fragorders_link;
pub mod parsers;
pub mod profiles;
pub mod settings;

use db::Database;
use std::path::Path;
use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

/// Application state containing the database
pub struct AppState {
    pub db: Database,
}

/// Create the app data folder if needed and open the database in it, or say
/// in plain words — with the path — why not.
fn open_database_in(dir: &Path) -> Result<Database, String> {
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("Cannot create the app data folder {}: {e}", dir.display()))?;
    let db_path = dir.join("attack_planner.db");
    println!("Database path: {:?}", db_path);
    Database::open(&db_path).map_err(|e| format!("Cannot open the database {}: {e}", db_path.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let opened = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Cannot find the app data folder: {e}"))
                .and_then(|dir| open_database_in(&dir));

            match opened {
                Ok(db) => {
                    app.manage(AppState { db });
                }
                Err(message) => {
                    // A locked, unwritable or corrupt database used to be a
                    // silent crash at launch. Say why, then quit. `show`, not
                    // `blocking_show`: setup runs on the main thread, where a
                    // blocking dialog would freeze before the event loop starts.
                    // `exit(1)` carries a code, so the quit guard lets it through.
                    eprintln!("{message}");
                    let handle = app.handle().clone();
                    app.dialog()
                        .message(format!("{message}\n\nPhoenix Weaponeer will now quit."))
                        .title("Phoenix Weaponeer can't start")
                        .kind(MessageDialogKind::Error)
                        .show(move |_| handle.exit(1));
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Mission commands
            commands::save_mission,
            commands::load_mission,
            // Theater commands
            commands::list_theaters,
            // Delivery profile library
            commands::list_delivery_profiles,
            commands::reveal_profiles_dir,
            // Database commands
            commands::get_all_threats,
            commands::get_threats_by_type,
            commands::get_all_weapons,
            commands::get_weapons_for_aircraft,
            commands::get_all_aircraft,
            commands::get_fuze_options,
            // Import commands
            commands::parse_fragorders_json,
            commands::fetch_fragorders_url,
            // Export commands
            commands::save_kneeboard_png,
            // Settings
            commands::get_settings,
            commands::set_kneeboard_folder,
            commands::set_kneeboard_map,
            commands::folder_exists,
            commands::suggest_kneeboard_folder,
            commands::exit_app,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // The window-level close guard (`onCloseRequested` in App.tsx)
            // never sees a macOS Cmd+Q / Dock "Quit" — that's an app-level
            // exit request, not a window close. `code` distinguishes the
            // two: `None` means the OS/user asked to quit, so hold it and
            // let the frontend run its own unsaved-changes check; `Some(_)`
            // means our own `exit_app` command asked, so let it through or
            // this would loop forever calling exit_app and re-intercepting it.
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                    let _ = app_handle.emit("quit-requested", ());
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_blocked_app_data_folder_is_reported_with_its_path() {
        // A plain file sitting where the folder's parent should be.
        let blocker = std::env::temp_dir().join(format!("phoenix_lib_{}_blocker", std::process::id()));
        std::fs::write(&blocker, b"not a folder").unwrap();
        let dir = blocker.join("data");
        let err = open_database_in(&dir).err().expect("a file in the way must fail");
        let _ = std::fs::remove_file(&blocker);
        assert!(err.contains(&dir.display().to_string()), "{err}");
    }

    #[test]
    fn an_unopenable_database_is_reported_with_its_path() {
        // A folder sitting where the database file should be.
        let dir = std::env::temp_dir().join(format!("phoenix_lib_{}_dbdir", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("attack_planner.db")).unwrap();
        let db_path = dir.join("attack_planner.db");
        let err = open_database_in(&dir).err().expect("a folder in place of the database must fail");
        let _ = std::fs::remove_dir_all(&dir);
        // SQLite's own error text may already name the file, so check that our
        // message leads with the full path rather than that the name appears.
        assert!(err.starts_with(&format!("Cannot open the database {}", db_path.display())), "{err}");
    }
}
