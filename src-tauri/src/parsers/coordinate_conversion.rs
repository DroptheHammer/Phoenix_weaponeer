//! DCS coordinate conversion
//!
//! Converts DCS map coordinates (x/y in meters) to geographic coordinates (lat/lon).
//! Each DCS theater has a specific origin and projection that must be accounted for.

use serde::{Deserialize, Serialize};

/// Parameters for coordinate conversion for a specific theater
#[derive(Debug, Clone)]
pub struct TheaterCoordParams {
    /// Theater internal name as used in DCS
    pub dcs_name: &'static str,
    /// Normalized name for Phoenix Weaponeer
    pub normalized_name: &'static str,
    /// Latitude of the map origin (degrees)
    pub lat_origin: f64,
    /// Longitude of the map origin (degrees)
    pub lon_origin: f64,
    /// Meters per degree latitude at this theater's location
    pub meters_per_deg_lat: f64,
    /// Meters per degree longitude at this theater's location
    pub meters_per_deg_lon: f64,
}

/// All supported DCS theaters
pub static THEATER_PARAMS: &[TheaterCoordParams] = &[
    TheaterCoordParams {
        dcs_name: "Caucasus",
        normalized_name: "caucasus",
        lat_origin: 42.355691,
        lon_origin: 43.323853,
        meters_per_deg_lat: 111132.0,
        meters_per_deg_lon: 82294.0,
    },
    TheaterCoordParams {
        dcs_name: "Nevada",
        normalized_name: "nevada",
        lat_origin: 36.145,
        lon_origin: -115.767,
        meters_per_deg_lat: 110946.0,
        meters_per_deg_lon: 89430.0,
    },
    TheaterCoordParams {
        dcs_name: "Syria",
        normalized_name: "syria",
        lat_origin: 35.156,
        lon_origin: 35.873,
        meters_per_deg_lat: 110879.0,
        meters_per_deg_lon: 90780.0,
    },
    TheaterCoordParams {
        dcs_name: "PersianGulf",
        normalized_name: "persian_gulf",
        lat_origin: 26.304,
        lon_origin: 56.378,
        meters_per_deg_lat: 110630.0,
        meters_per_deg_lon: 99144.0,
    },
    TheaterCoordParams {
        dcs_name: "Normandy",
        normalized_name: "normandy",
        lat_origin: 49.183,
        lon_origin: -0.373,
        meters_per_deg_lat: 111229.0,
        meters_per_deg_lon: 72623.0,
    },
    TheaterCoordParams {
        dcs_name: "TheChannel",
        normalized_name: "channel",
        lat_origin: 50.968,
        lon_origin: 1.882,
        meters_per_deg_lat: 111273.0,
        meters_per_deg_lon: 70089.0,
    },
    TheaterCoordParams {
        dcs_name: "SouthAtlantic",
        normalized_name: "south_atlantic",
        lat_origin: -51.7,
        lon_origin: -59.0,
        meters_per_deg_lat: 111319.0,
        meters_per_deg_lon: 68853.0,
    },
    TheaterCoordParams {
        dcs_name: "Falklands",
        normalized_name: "south_atlantic",
        lat_origin: -51.7,
        lon_origin: -59.0,
        meters_per_deg_lat: 111319.0,
        meters_per_deg_lon: 68853.0,
    },
    TheaterCoordParams {
        dcs_name: "Sinai",
        normalized_name: "sinai",
        lat_origin: 29.5,
        lon_origin: 32.5,
        meters_per_deg_lat: 110780.0,
        meters_per_deg_lon: 96486.0,
    },
    TheaterCoordParams {
        dcs_name: "MarianaIslands",
        normalized_name: "marianas",
        lat_origin: 15.0,
        lon_origin: 145.75,
        meters_per_deg_lat: 110574.0,
        meters_per_deg_lon: 106820.0,
    },
    TheaterCoordParams {
        dcs_name: "Kola",
        normalized_name: "kola",
        lat_origin: 69.0,
        lon_origin: 33.0,
        meters_per_deg_lat: 111415.0,
        meters_per_deg_lon: 39852.0,
    },
    TheaterCoordParams {
        dcs_name: "Afghanistan",
        normalized_name: "afghanistan",
        lat_origin: 33.0,
        lon_origin: 68.0,
        meters_per_deg_lat: 110852.0,
        meters_per_deg_lon: 92874.0,
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

/// Convert DCS map coordinates to lat/lon
///
/// DCS uses a local Cartesian coordinate system where:
/// - x increases to the East
/// - y increases to the North (sometimes labeled z in some contexts)
///
/// # Arguments
/// * `x` - DCS x coordinate (meters, positive = East)
/// * `y` - DCS y coordinate (meters, positive = North)
/// * `params` - Theater-specific coordinate parameters
///
/// # Returns
/// (latitude, longitude) tuple in decimal degrees
pub fn dcs_to_latlon(x: f64, y: f64, params: &TheaterCoordParams) -> (f64, f64) {
    // DCS y-axis is North-South (latitude)
    // DCS x-axis is East-West (longitude)
    let lat = params.lat_origin + (y / params.meters_per_deg_lat);
    let lon = params.lon_origin + (x / params.meters_per_deg_lon);
    (lat, lon)
}

/// Convert lat/lon to DCS map coordinates
///
/// # Arguments
/// * `lat` - Latitude in decimal degrees
/// * `lon` - Longitude in decimal degrees
/// * `params` - Theater-specific coordinate parameters
///
/// # Returns
/// (x, y) tuple in meters
pub fn latlon_to_dcs(lat: f64, lon: f64, params: &TheaterCoordParams) -> (f64, f64) {
    let y = (lat - params.lat_origin) * params.meters_per_deg_lat;
    let x = (lon - params.lon_origin) * params.meters_per_deg_lon;
    (x, y)
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

        // Origin should map to origin lat/lon
        let (lat, lon) = dcs_to_latlon(0.0, 0.0, params);
        assert!((lat - 36.145).abs() < 0.001);
        assert!((lon - (-115.767)).abs() < 0.001);
    }

    #[test]
    fn test_roundtrip_conversion() {
        let params = get_theater_params("Syria").unwrap();

        let original_lat = 35.5;
        let original_lon = 36.0;

        let (x, y) = latlon_to_dcs(original_lat, original_lon, params);
        let (lat, lon) = dcs_to_latlon(x, y, params);

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
