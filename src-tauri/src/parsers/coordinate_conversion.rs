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

/// DCS names of the theaters that can actually be converted right now.
///
/// A theater listed in `THEATER_PARAMS` with an empty `proj4_string` is known
/// but not yet usable, so it is deliberately excluded here.
pub fn supported_theater_names() -> Vec<&'static str> {
    THEATER_PARAMS
        .iter()
        .filter(|p| !p.proj4_string.is_empty())
        .map(|p| p.dcs_name)
        .collect()
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
    fn test_supported_theaters_exclude_those_without_a_projection() {
        let supported = supported_theater_names();
        assert!(supported.contains(&"Nevada"));
        assert!(supported.contains(&"Caucasus"));

        // Known to DCS, but no proj4 string yet — must not be advertised as usable,
        // because every conversion for it fails.
        assert!(!supported.contains(&"Syria"));
        assert!(!supported.contains(&"PersianGulf"));

        for name in &supported {
            let params = get_theater_params(name).unwrap();
            assert!(!params.proj4_string.is_empty(), "{name} should have a projection");
        }
    }

    #[test]
    fn test_conversion_fails_loudly_without_a_projection() {
        let params = get_theater_params("Syria").expect("Syria should be a known theater");
        assert!(
            dcs_to_latlon(1000.0, 2000.0, params).is_err(),
            "a theater with no proj4 string must error, not return a bogus position"
        );
    }

    #[test]
    fn test_normalize_theater_name() {
        assert_eq!(normalize_theater_name("Nevada"), "nevada");
        assert_eq!(normalize_theater_name("PersianGulf"), "persian_gulf");
        assert_eq!(normalize_theater_name("Caucasus"), "caucasus");
        assert_eq!(normalize_theater_name("Unknown Map"), "unknown_map");
    }

    /// Ground-truth check against real-world landmarks.
    ///
    /// A range/validity check is not enough here: DCS `x` is the *northing* and
    /// `y` is the *easting*, so swapping them still yields perfectly valid
    /// coordinates — just several hundred km away. These waypoints come from the
    /// NTTR_Training_RF_v13 mission and are pinned to their real locations, which
    /// is the only thing that actually detects an axis or offset regression.
    #[test]
    fn test_dcs_to_latlon_nevada_landmarks() {
        let params = get_theater_params("Nevada").unwrap();

        // (dcs_x/northing, dcs_y/easting, expected lat, expected lon, what it is)
        let landmarks = [
            (-398_222.0, -17_321.7, 36.235, -115.034, "Nellis AFB"),
            (-399_114.0, -18_563.8, 36.22719, -115.04801, "Viper 1 takeoff (Nellis ramp)"),
            (-273_087.4, -31_442.0, 37.36496, -115.16433, "ALAMO (town of Alamo, NV)"),
            (-228_744.7, -134_384.0, 37.77695, -116.32308, "IP (Tonopah Test Range)"),
            (-239_390.1, -160_753.4, 37.68234, -116.62299, "TGT1 (Tonopah Test Range Airfield)"),
        ];

        for (x, y, want_lat, want_lon, what) in landmarks {
            let (lat, lon) = dcs_to_latlon(x, y, params).unwrap();
            assert!(
                (lat - want_lat).abs() < 0.01 && (lon - want_lon).abs() < 0.01,
                "{what}: got ({lat:.5}, {lon:.5}), want ({want_lat}, {want_lon})"
            );
        }
    }

    /// Guards the axis convention explicitly.
    ///
    /// `test_roundtrip_conversion` cannot catch this on its own — if both
    /// directions swapped axes consistently, a round trip would still succeed.
    #[test]
    fn test_dcs_axis_order_is_x_northing_y_easting() {
        let params = get_theater_params("Nevada").unwrap();

        // Increasing DCS x must move north; increasing DCS y must move east.
        let (base_lat, base_lon) = dcs_to_latlon(-398_222.0, -17_321.7, params).unwrap();
        let (north_lat, north_lon) = dcs_to_latlon(-388_222.0, -17_321.7, params).unwrap();
        let (east_lat, east_lon) = dcs_to_latlon(-398_222.0, -7_321.7, params).unwrap();

        assert!(north_lat > base_lat, "+x must increase latitude (move north)");
        assert!((north_lon - base_lon).abs() < 0.01, "+x must not shift longitude much");
        assert!(east_lon > base_lon, "+y must increase longitude (move east)");
        assert!((east_lat - base_lat).abs() < 0.01, "+y must not shift latitude much");
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
