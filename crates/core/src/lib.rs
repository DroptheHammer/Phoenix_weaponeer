//! Phoenix Weaponeer's platform-free core.
//!
//! Everything here is pure computation over data passed in: the FragOrders
//! import with DCS coordinate conversion, the reference data (threats,
//! weapons, aircraft), the delivery profile library, the saved-mission format
//! and the checks on a FragOrders public link. No file system, network or
//! C library, so the desktop app (`src-tauri`) and the browser build
//! (`crates/wasm`) run exactly the same code.

/// Loads a real-mission fixture from `test-data/private/`, which is git-ignored:
/// squadron missions and captured FragOrders links stay off the public repo.
/// When the file isn't there, the calling test prints a note and passes.
#[cfg(test)]
#[macro_export]
macro_rules! private_fixture {
    ($name:literal) => {
        match std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../test-data/private/",
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

pub mod fragorders_link;
pub mod import;
pub mod mission;
pub mod parsers;
pub mod profiles;
pub mod refdata;
pub mod theaters;
