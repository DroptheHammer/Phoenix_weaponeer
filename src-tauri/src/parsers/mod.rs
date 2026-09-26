//! File parsers module
//!
//! Handles the FragOrders import: DCS coordinate conversion per theater, the
//! FragOrders mission JSON (CLI output, or the payload a public link serves),
//! and mapping DCS unit names onto threat systems.

pub mod airfields;
mod airfields_data;
pub mod coordinate_conversion;
pub mod fragorders;
pub mod tasking_state;
pub mod threat_mapping;
pub mod tmerc;

pub use coordinate_conversion::{
    all_theater_params, dcs_to_latlon, get_theater_params, meters_to_feet, mps_to_ktas,
    normalize_theater_name, supported_theater_names, TheaterCoordParams,
};
pub use fragorders::{
    parse_fragorders_json, FragOrdersMission, ProcessedCoordinates, ProcessedFragOrdersData,
    ProcessedPlayerGroup, ProcessedThreat, ProcessedTriggerZone, ProcessedUnit, ProcessedWaypoint,
    ThreatMatchConfidence,
};
pub use threat_mapping::{get_threat_info, is_threat_unit, normalize_dcs_unit_name};
