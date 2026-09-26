//! The DCS theaters as the frontend sees them.

use crate::mission::Coordinates;
use crate::parsers;
use serde::{Deserialize, Serialize};

/// A DCS theater as advertised to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TheaterInfo {
    /// Theater name as DCS writes it (e.g. "SinaiMap")
    pub dcs_name: String,
    /// Stable id used throughout the app (e.g. "sinai")
    pub id: String,
    /// Human-readable name for the UI
    pub display_name: String,
    /// Whether missions on this map can be imported at all
    pub supported: bool,
    /// Whether the projection has been independently confirmed
    pub verified: bool,
    /// (lat, lon) to centre the map on when there is nothing to frame
    pub default_center: Coordinates,
}

/// The id of the "Strike near me" pseudo-theater: a mission planned on real
/// places anywhere in the world (the phone's GPS picks the target), which no
/// DCS map covers. Planning works in lat/lon already, so all it needs is a
/// name; the frontend shows a "can't be flown in DCS" banner for it.
pub const REAL_WORLD_ID: &str = "real_world";

/// List every DCS theater the app knows about, then the real-world pseudo-theater.
///
/// `THEATER_PARAMS` in `coordinate_conversion.rs` is the single source of truth
/// for the DCS maps. The frontend used to keep its own parallel copy of the list,
/// which drifted — it was missing three maps outright. Adding a map should mean
/// editing one table, not three.
pub fn list_theaters() -> Vec<TheaterInfo> {
    let mut list: Vec<TheaterInfo> = parsers::all_theater_params()
        .iter()
        .map(|p| TheaterInfo {
            dcs_name: p.dcs_name.to_string(),
            id: p.normalized_name.to_string(),
            display_name: p.display_name.to_string(),
            supported: !p.proj4_string.is_empty(),
            verified: p.verified,
            default_center: Coordinates {
                lat: p.default_center.0,
                lon: p.default_center.1,
            },
        })
        .collect();

    // Not in THEATER_PARAMS on purpose: nothing may ever import onto it, and
    // an empty `dcs_name` matches no mission's `theatre`.
    list.push(TheaterInfo {
        dcs_name: String::new(),
        id: REAL_WORLD_ID.to_string(),
        display_name: "Real world (not a DCS map)".to_string(),
        // Nothing to import: a real-world mission is made in the app.
        supported: false,
        // Positions are real lat/lon, not converted from a DCS grid.
        verified: true,
        // Never used: a real-world mission always has its target to frame.
        default_center: Coordinates { lat: 0.0, lon: 0.0 },
    });
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_real_world_is_listed_but_nothing_imports_onto_it() {
        let list = list_theaters();
        let real = list.iter().find(|t| t.id == REAL_WORLD_ID).expect("listed");
        assert!(!real.supported && real.verified);
        assert!(parsers::get_theater_params(REAL_WORLD_ID).is_none(), "no DCS name resolves to it");
        assert!(parsers::get_theater_params(&real.dcs_name).is_none());
        let ids: std::collections::HashSet<&str> = list.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids.len(), list.len(), "ids are unique");
    }
}
