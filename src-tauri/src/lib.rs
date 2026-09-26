//! DCS Attack Planner - Rust Backend
//!
//! The planning logic itself — FragOrders import with coordinate conversion,
//! the threat/weapon/aircraft reference data, the delivery profile library and
//! the saved-mission format — is `weaponeer_core` (`crates/core`), shared with
//! the web build. This crate is the desktop shell around it: files and
//! folders, the FragOrders link download, settings, and the app's lifecycle.
//! Kneeboard cards are rendered in the frontend; the backend only writes the PNG.

pub mod commands;
pub mod link_fetch;
pub mod settings;

use tauri::{Emitter, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // Mission commands
            commands::save_mission,
            commands::load_mission,
            // Theater commands
            commands::list_theaters,
            // Delivery profile library
            commands::list_delivery_profiles,
            commands::reveal_profiles_dir,
            // Reference data commands
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
            commands::remember_recent_mission,
            commands::forget_recent_mission,
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
