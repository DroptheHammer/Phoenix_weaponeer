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

/// The four captured public-link payloads (see
/// `test-data/private/fragorders-links/README.md` for the publish options behind
/// each). Like `private_fixture!`, each skips the calling test when its file is
/// absent. They live here so every module's tests can use them.
#[cfg(test)]
#[macro_export]
macro_rules! link_sinai_v7 {
    () => {
        $crate::private_fixture!("fragorders-links/sinai_m01v7_all-red-hidden-in-miz.json")
    };
}
#[cfg(test)]
#[macro_export]
macro_rules! link_neon_mirror {
    () => {
        $crate::private_fixture!("fragorders-links/syria_neonmirror_showgroups-off.json")
    };
}
#[cfg(test)]
#[macro_export]
macro_rules! link_arctic_fury {
    () => {
        $crate::private_fixture!("fragorders-links/kola_arcticfury_threats-visible.json")
    };
}
#[cfg(test)]
#[macro_export]
macro_rules! link_nttr_dtc {
    () => {
        $crate::private_fixture!("fragorders-links/nttr_dtc_threats-visible.json")
    };
}

pub mod fragorders_link;
pub mod import;
pub mod mission;
pub mod parsers;
pub mod profiles;
pub mod refdata;
pub mod theaters;
