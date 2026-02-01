//! DCS coordinate conversion
//!
//! Converts DCS map coordinates (x/y in meters) to geographic coordinates (lat/lon).
//! Each DCS theater has a specific proj4 projection that must be used for accurate conversion.

use serde::{Deserialize, Serialize};
use proj::Proj;

/// Parameters for coordinate conversion for a specific theater
#[derive(Debug, Clone)]
pub struct TheaterCoordParams {
    /// Theater internal name as used in DCS
    pub dcs_name: &'static str,
    /// Normalized name for Phoenix Weaponeer
    pub normalized_name: &'static str,
    /// Proj4 projection string for coordinate conversion
    pub proj4_string: &'static str,
}

/// All supported DCS theaters with their proj4 projection strings
/// Nevada and Caucasus strings are from FragOrders (verified accurate)
/// Other theaters may need proj4 strings added when available
pub static THEATER_PARAMS: &[TheaterCoordParams] = &[
    TheaterCoordParams {
        dcs_name: "Caucasus",
        normalized_name: "caucasus",
        proj4_string: "+proj=tmerc +lon_0=33 +k_0=0.9996 +x_0=-99517 +y_0=-4998115",
    },
    TheaterCoordParams {
        dcs_name: "Nevada",
        normalized_name: "nevada",
        proj4_string: "+proj=tmerc +lon_0=-117 +k_0=0.9996 +x_0=-193996 +y_0=-4410028",
    },
    TheaterCoordParams {
        dcs_name: "Syria",
        normalized_name: "syria",
        proj4_string: "", // TODO: Add proj4 string when available
    },
    TheaterCoordParams {
        dcs_name: "PersianGulf",
        normalized_name: "persian_gulf",
        proj4_string: "", // TODO: Add proj4 string when available
    },
    TheaterCoordParams {
        dcs_name: "Normandy",
        normalized_name: "normandy",
        proj4_string: "", // TODO: Add proj4 string when available
    },
    TheaterCoordParams {
        dcs_name: "TheChannel",
        normalized_name: "channel",
        proj4_string: "", // TODO: Add proj4 string when available
    },
    TheaterCoordParams {
        dcs_name: "SouthAtlantic",
        normalized_name: "south_atlantic",
        proj4_string: "", // TODO: Add proj4 string when available
    },
    TheaterCoordParams {
        dcs_name: "Falklands",
        normalized_name: "south_atlantic",
        proj4_string: "", // TODO: Add proj4 string when available
    },
    TheaterCoordParams {
        dcs_name: "Sinai",
        normalized_name: "sinai",
        proj4_string: "", // TODO: Add proj4 string when available
    },
    TheaterCoordParams {
        dcs_name: "MarianaIslands",
        normalized_name: "marianas",
        proj4_string: "", // TODO: Add proj4 string when available
    },
    TheaterCoordParams {
        dcs_name: "Kola",
        normalized_name: "kola",
        proj4_string: "", // TODO: Add proj4 string when available
    },
    TheaterCoordParams {
        dcs_name: "Afghanistan",
        normalized_name: "afghanistan",
        proj4_string: "", // TODO: Add proj4 string when available
    },
];

/// Get theater parameters by DCS theater name
pub fn get_theater_params(theater_name: &str) -> Option<&'static TheaterCoordParams> {
    THEATER_PARAMS
        .iter()
        .find(|p| p.dcs_name.eq_ignore_ascii_case(theater_name))
}

/// Get theater parameters by normalized name
pub fn get_theater_params_by_normalized(normalized_name: &str) -> Option<&'static TheaterCoordParams> {
    THEATER_PARAMS
        .iter()
        .find(|p| p.normalized_name.eq_ignore_ascii_case(normalized_name))
}

/// Normalize theater name from DCS format to Phoenix format
pub fn normalize_theater_name(dcs_theater: &str) -> String {
    match get_theater_params(dcs_theater) {
        Some(params) => params.normalized_name.to_string(),
        None => dcs_theater.to_lowercase().replace(' ', "_"),
    }
}

/// Convert DCS map coordinates to lat/lon using proj4 projection
///
/// DCS uses a local Cartesian coordinate system where:
/// - x increases to the East
/// - y increases to the North
///
/// # Arguments
/// * `x` - DCS x coordinate (meters)
/// * `y` - DCS y coordinate (meters)
/// * `params` - Theater-specific coordinate parameters with proj4 string
///
/// # Returns
/// (latitude, longitude) tuple in decimal degrees, or error if projection fails
pub fn dcs_to_latlon(x: f64, y: f64, params: &TheaterCoordParams) -> Result<(f64, f64), String> {
    if params.proj4_string.is_empty() {
        return Err(format!("No proj4 string available for theater {}", params.dcs_name));
    }

    // Create transformation from theater projection to WGS84
    let from_crs = params.proj4_string;
    let to_crs = "EPSG:4326"; // WGS84 lat/lon

    let proj = Proj::new_known_crs(from_crs, to_crs, None)
        .map_err(|e| format!("Failed to create projection: {}", e))?;

    // FragOrders passes [y, x] to proj4.inverse()
    // Match their order: pass (y, x) instead of (x, y)
    let (lon, lat) = proj.convert((y, x))
        .map_err(|e| format!("Failed to convert coordinates: {}", e))?;

    // Result is in degrees (lon, lat)
    Ok((lat, lon))
}

/// Convert lat/lon to DCS map coordinates using proj4 projection
///
/// # Arguments
/// * `lat` - Latitude in decimal degrees
/// * `lon` - Longitude in decimal degrees
/// * `params` - Theater-specific coordinate parameters with proj4 string
///
/// # Returns
/// (x, y) tuple in meters, or error if projection fails
pub fn latlon_to_dcs(lat: f64, lon: f64, params: &TheaterCoordParams) -> Result<(f64, f64), String> {
    if params.proj4_string.is_empty() {
        return Err(format!("No proj4 string available for theater {}", params.dcs_name));
    }

    // Create transformation from WGS84 to theater projection
    let from_crs = "EPSG:4326"; // WGS84 lat/lon
    let to_crs = params.proj4_string;

    let proj = Proj::new_known_crs(from_crs, to_crs, None)
        .map_err(|e| format!("Failed to create projection: {}", e))?;

    // FragOrders gets [y, x] from proj4([lon, lat])
    // proj.convert returns projected coords, interpret as (y, x) to match FragOrders
    let (y, x) = proj.convert((lon, lat))
        .map_err(|e| format!("Failed to convert coordinates: {}", e))?;

    // Return (x, y) in DCS order
    Ok((x, y))
}

/// Lat/lon coordinate structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatLon {
    pub lat: f64,
    pub lon: f64,
}

impl LatLon {
    pub fn new(lat: f64, lon: f64) -> Self {
        Self { lat, lon }
    }
}

/// Convert meters to feet
pub fn meters_to_feet(meters: f64) -> f64 {
    meters * 3.28084
}

/// Convert feet to meters
pub fn feet_to_meters(feet: f64) -> f64 {
    feet / 3.28084
}

/// Convert meters per second to knots (KTAS)
pub fn mps_to_ktas(mps: f64) -> f64 {
    mps * 1.94384
}

/// Convert knots to meters per second
pub fn ktas_to_mps(ktas: f64) -> f64 {
    ktas / 1.94384
}

/// Convert meters to nautical miles
pub fn meters_to_nm(meters: f64) -> f64 {
    meters / 1852.0
}

/// Convert nautical miles to meters
pub fn nm_to_meters(nm: f64) -> f64 {
    nm * 1852.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_theater_params() {
        let params = get_theater_params("Nevada").expect("Nevada should exist");
        assert_eq!(params.normalized_name, "nevada");

        let params = get_theater_params("PersianGulf").expect("Persian Gulf should exist");
        assert_eq!(params.normalized_name, "persian_gulf");
    }

    #[test]
    fn test_normalize_theater_name() {
        assert_eq!(normalize_theater_name("Nevada"), "nevada");
        assert_eq!(normalize_theater_name("PersianGulf"), "persian_gulf");
        assert_eq!(normalize_theater_name("Caucasus"), "caucasus");
        assert_eq!(normalize_theater_name("Unknown Map"), "unknown_map");
    }

    #[test]
    fn test_dcs_to_latlon_nevada() {
        let params = get_theater_params("Nevada").unwrap();

        // Test a known location in Nevada (Nellis AFB area)
        // Using coordinates from test_fragorders.json that are verified to work correctly
        let (lat, lon) = dcs_to_latlon(65500.0, 10100.0, params).unwrap();

        // Basic sanity check - should be valid Earth coordinates
        assert!(lat.abs() <= 90.0, "Latitude should be valid (-90 to 90)");
        assert!(lon.abs() <= 180.0, "Longitude should be valid (-180 to 180)");

        // Verify conversion succeeded (coordinates are not zero/default)
        assert!(lat != 0.0 || lon != 0.0, "Coordinates should not be origin");
    }

    #[test]
    fn test_roundtrip_conversion() {
        let params = get_theater_params("Nevada").unwrap();

        let original_lat = 36.145;
        let original_lon = -115.767;

        let (x, y) = latlon_to_dcs(original_lat, original_lon, params).unwrap();
        let (lat, lon) = dcs_to_latlon(x, y, params).unwrap();

        assert!((lat - original_lat).abs() < 0.0001);
        assert!((lon - original_lon).abs() < 0.0001);
    }

    #[test]
    fn test_unit_conversions() {
        assert!((meters_to_feet(1000.0) - 3280.84).abs() < 0.01);
        assert!((feet_to_meters(3280.84) - 1000.0).abs() < 0.01);
        assert!((mps_to_ktas(100.0) - 194.384).abs() < 0.01);
        assert!((meters_to_nm(1852.0) - 1.0).abs() < 0.001);
    }
}
