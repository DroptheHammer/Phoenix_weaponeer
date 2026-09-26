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

/// List every DCS theater the app knows about.
///
/// `THEATER_PARAMS` in `coordinate_conversion.rs` is the single source of truth
/// for this. The frontend used to keep its own parallel copy of the list, which
/// drifted — it was missing three maps outright. Adding a map should mean
/// editing one table, not three.
pub fn list_theaters() -> Vec<TheaterInfo> {
    parsers::all_theater_params()
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
        .collect()
}
