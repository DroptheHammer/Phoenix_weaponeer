//! DCS Attack Planner - Rust Backend
//!
//! This library provides the backend functionality for the DCS Attack Planner,
//! including file I/O, database access, .miz parsing, attack calculations, and
//! kneeboard rendering.

pub mod commands;
pub mod db;
pub mod exporters;
pub mod parsers;
pub mod profiles;

use db::Database;
use tauri::Manager;

/// Application state containing the database
pub struct AppState {
    pub db: Database,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Get the app data directory for the database
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");

            let db_path = app_data_dir.join("attack_planner.db");
            println!("Database path: {:?}", db_path);

            // Initialize database
            let db = Database::open(&db_path).expect("Failed to open database");

            // Store in app state
            app.manage(AppState { db });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Mission commands
            commands::new_mission,
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
            commands::parse_miz_file,
            commands::parse_fragorders_json,
            // Export commands
            commands::render_kneeboard,
            commands::export_to_dcs_kneeboard,
            commands::save_kneeboard_png,
            commands::detect_dcs_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
