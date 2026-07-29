//! DCS coordinate conversion
//!
//! Converts DCS map coordinates (x/y in meters) to geographic coordinates (lat/lon).
//! Each DCS theater has a specific proj4 projection that must be used for accurate conversion.

use serde::{Deserialize, Serialize};
use proj::Proj;

/// Parameters for coordinate conversion for a specific theater
#[derive(Debug, Clone)]
pub struct TheaterCoordParams {
    /// Theater internal name as used in DCS.
    ///
    /// This is matched against the `theatre` field of an imported mission, so it
    /// must be byte-for-byte what DCS writes. A wrong value here rejects the map
    /// at import even when the projection below is perfect — which is exactly
    /// what happened to Sinai (`SinaiMap`, not `Sinai`).
    pub dcs_name: &'static str,
    /// Normalized name for Phoenix Weaponeer
    pub normalized_name: &'static str,
    /// Human-readable name shown in the UI
    pub display_name: &'static str,
    /// Proj4 projection string for coordinate conversion.
    /// Empty means the theater is known to DCS but cannot be converted yet.
    pub proj4_string: &'static str,
    /// (lat, lon) to centre the map on when a mission has nothing to frame
    pub default_center: (f64, f64),
    /// Whether the projection has been checked against something independent.
    ///
    /// `true` means either ground-truth landmarks (Caucasus, Nevada) or the
    /// bounds round-trip in `test_projections_reproduce_their_own_map_corners`.
    /// `false` means the string is believed correct but unconfirmed, and the UI
    /// must warn the planner rather than present the result as trustworthy.
    pub verified: bool,
}

/// All DCS theaters, with the proj4 projection used to convert their map grid.
///
/// Projection strings come from FragOrders (`docs/fragorders-response-maps.txt`).
/// Caucasus and Nevada additionally match our own ground-truth work exactly.
/// FragOrders writes `+k` for four of these; it is a PROJ alias for `+k_0` and
/// is normalized here so every string in this table reads the same way.
pub static THEATER_PARAMS: &[TheaterCoordParams] = &[
    TheaterCoordParams {
        dcs_name: "Caucasus",
        normalized_name: "caucasus",
        display_name: "Caucasus",
        proj4_string: "+proj=tmerc +lon_0=33 +k_0=0.9996 +x_0=-99517 +y_0=-4998115",
        default_center: (42.0, 44.0),
        verified: true,
    },
    TheaterCoordParams {
        dcs_name: "Nevada",
        normalized_name: "nevada",
        display_name: "Nevada (NTTR)",
        proj4_string: "+proj=tmerc +lon_0=-117 +k_0=0.9996 +x_0=-193996 +y_0=-4410028",
        default_center: (37.0, -116.0),
        verified: true,
    },
    TheaterCoordParams {
        dcs_name: "Syria",
        normalized_name: "syria",
        display_name: "Syria",
        proj4_string: "+proj=tmerc +lon_0=39 +k_0=0.9996 +x_0=282801 +y_0=-3879865",
        default_center: (35.0, 36.0),
        verified: true,
    },
    TheaterCoordParams {
        dcs_name: "PersianGulf",
        normalized_name: "persian_gulf",
        display_name: "Persian Gulf",
        proj4_string: "+proj=tmerc +lon_0=57 +k_0=0.9996 +x_0=75757 +y_0=-2894931",
        default_center: (26.0, 56.0),
        verified: true,
    },
    TheaterCoordParams {
        dcs_name: "Normandy",
        normalized_name: "normandy",
        display_name: "Normandy",
        // FragOrders carries float noise here (-195526.00000000204 /
        // -5484812.999999951); rounded, which moves a position by ~2 nanometres.
        proj4_string: "+proj=tmerc +lon_0=-3 +k_0=0.9996 +x_0=-195526 +y_0=-5484813",
        default_center: (49.0, -1.0),
        verified: true,
    },
    TheaterCoordParams {
        dcs_name: "MarianaIslands",
        normalized_name: "marianas",
        display_name: "Marianas",
        proj4_string: "+proj=tmerc +lon_0=147 +k_0=0.9996 +x_0=238418 +y_0=-1491840",
        default_center: (14.5, 145.0),
        verified: true,
    },
    TheaterCoordParams {
        // DCS calls the South Atlantic map "Falklands". There is no theater
        // named "SouthAtlantic" — an entry for it used to sit here and could
        // never have matched a real mission.
        dcs_name: "Falklands",
        normalized_name: "south_atlantic",
        display_name: "South Atlantic",
        proj4_string: "+proj=tmerc +lon_0=-57 +k_0=0.9996 +x_0=147640 +y_0=5815417",
        default_center: (-51.7, -59.0),
        verified: true,
    },
    TheaterCoordParams {
        dcs_name: "GermanyCW",
        normalized_name: "germany_cw",
        display_name: "Germany Cold War",
        proj4_string: "+proj=tmerc +lon_0=21 +k_0=0.9996 +x_0=35427.62 +y_0=-6061633.128",
        default_center: (51.0, 10.0),
        verified: true,
    },
    TheaterCoordParams {
        dcs_name: "Iraq",
        normalized_name: "iraq",
        display_name: "Iraq",
        proj4_string: "+proj=tmerc +lon_0=45 +k_0=0.9996 +x_0=72290 +y_0=-3680057",
        default_center: (33.0, 44.0),
        verified: true,
    },
    // ---- Believed correct, but unconfirmed ----
    // FragOrders ships hand-typed bounds for these three (integer lat/lons, and
    // in Sinai's case a plain lat/lon rectangle rather than projected map
    // corners), so the round-trip check that vouches for the nine above cannot
    // say anything about them either way.
    TheaterCoordParams {
        dcs_name: "SinaiMap",
        normalized_name: "sinai",
        display_name: "Sinai",
        proj4_string: "+proj=tmerc +lon_0=33 +k_0=0.9996 +x_0=169222 +y_0=-3325313",
        default_center: (30.0, 33.0),
        verified: false,
    },
    TheaterCoordParams {
        dcs_name: "Kola",
        normalized_name: "kola",
        display_name: "Kola Peninsula",
        proj4_string: "+proj=tmerc +lon_0=21 +k_0=0.9996 +x_0=-62702 +y_0=-7543625",
        default_center: (69.0, 33.0),
        verified: false,
    },
    TheaterCoordParams {
        dcs_name: "Afghanistan",
        normalized_name: "afghanistan",
        display_name: "Afghanistan",
        proj4_string: "+proj=tmerc +lon_0=63 +k_0=0.9996 +x_0=-300150 +y_0=-3759657",
        default_center: (34.0, 67.5),
        verified: false,
    },
    // ---- Known to DCS, still unusable ----
    TheaterCoordParams {
        // The only map FragOrders did not supply. Deriving it needs ground-truth
        // (DCS x/y <-> lat/lon) pairs read off the F10 map by someone who owns it.
        dcs_name: "TheChannel",
        normalized_name: "channel",
        display_name: "The Channel",
        proj4_string: "",
        default_center: (51.0, 1.0),
        verified: false,
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

/// Every theater the app knows about, usable or not.
///
/// This is the single source of truth for the theater list — the frontend gets
/// it via the `list_theaters` command rather than keeping its own copy.
pub fn all_theater_params() -> &'static [TheaterCoordParams] {
    THEATER_PARAMS
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
        assert!(supported.contains(&"Syria"));
        assert!(supported.contains(&"PersianGulf"));

        // Known to DCS, but no proj4 string — must not be advertised as usable,
        // because every conversion for it fails.
        assert!(!supported.contains(&"TheChannel"));

        for name in &supported {
            let params = get_theater_params(name).unwrap();
            assert!(!params.proj4_string.is_empty(), "{name} should have a projection");
        }
    }

    #[test]
    fn test_conversion_fails_loudly_without_a_projection() {
        let params = get_theater_params("TheChannel").expect("The Channel should be known");
        assert!(
            dcs_to_latlon(1000.0, 2000.0, params).is_err(),
            "a theater with no proj4 string must error, not return a bogus position"
        );
    }

    /// The DCS theater strings we match on, pinned.
    ///
    /// These are compared byte-for-byte against a mission's `theatre` field, so
    /// getting one wrong silently rejects that whole map at import. Both cases
    /// below were live bugs: Sinai was listed as `Sinai`, and a `SouthAtlantic`
    /// entry existed that DCS never writes.
    #[test]
    fn test_dcs_theater_names_match_what_dcs_writes() {
        assert!(get_theater_params("SinaiMap").is_some(), "Sinai is 'SinaiMap' in DCS");
        assert!(get_theater_params("Falklands").is_some(), "South Atlantic is 'Falklands'");
        assert!(
            get_theater_params("SouthAtlantic").is_none(),
            "'SouthAtlantic' is not a DCS theater and must not be matched"
        );

        let mut seen = std::collections::HashSet::new();
        for params in THEATER_PARAMS {
            assert!(
                seen.insert(params.dcs_name),
                "duplicate dcs_name {}",
                params.dcs_name
            );
            assert!(!params.display_name.is_empty(), "{} needs a display name", params.dcs_name);
        }
    }

    /// Cross-checks each projection against the map extent it came with.
    ///
    /// FragOrders publishes every theater's corner bounds as lat/lon. Those were
    /// generated by projecting the DCS map corners outward, and DCS map corners
    /// are round numbers — so projecting the bounds *back* has to land on
    /// multiples of 10 km. An `x_0`/`y_0` that was wrong, or a `+k` that PROJ
    /// silently ignored, would land somewhere arbitrary instead.
    ///
    /// Only the theaters whose published bounds are actually derived can be
    /// checked this way; Sinai, Kola and Afghanistan ship hand-typed integer
    /// lat/lons and are marked `verified: false` for exactly that reason.
    #[test]
    fn test_projections_reproduce_their_own_map_corners() {
        // (dcs_name, [(lat, lon); 4]) — corners as published by FragOrders.
        let bounds: &[(&str, [(f64, f64); 4])] = &[
            ("Caucasus", [(48.387663480938, 26.778743595881), (47.382221906262, 49.309787386754),
                          (38.865111406110, 47.142314272867), (39.608931903399, 27.637331401126)]),
            ("Nevada", [(39.801712624973, -119.99023110960), (39.737162541546, -112.11118674647),
                        (34.346907399159, -112.44599267994), (34.400025213159, -119.78488669575)]),
            ("Syria", [(37.470301761465, 29.480123666167), (37.814134114831, 42.148931009427),
                       (31.960960214436, 41.932899899137), (31.683960285685, 30.123622480902)]),
            ("PersianGulf", [(32.955527544002, 46.583433745255), (33.150981840679, 64.756585025318),
                             (21.869681127563, 63.997389263298), (21.749230188233, 47.594358099874)]),
            ("MarianaIslands", [(22.220143285088, 136.96126049266), (22.440812138080, 152.45174012340),
                                (10.739229846557, 152.12973515767), (10.637681299806, 137.54638410345)]),
            ("Falklands", [(-45.850907963742, -84.733179722768), (-48.278746783249, -41.444185881767),
                           (-56.442360340952, -38.172247338514), (-53.241290032056, -89.780310307149)]),
            ("Normandy", [(51.853053209954, -3.5005307234326), (51.668977027237, 3.5903264200692),
                          (48.182820700457, 3.1296001999935), (48.345555267203, -3.4652619527823)]),
            ("GermanyCW", [(59.416667059204, 0.78605025385029), (60.847630263092, 14.821474574334),
                           (49.215506254256, 16.393423859364), (48.276207845363, 5.6742887695796)]),
            ("Iraq", [(37.052110852583, 38.567371358039), (36.905227474756, 53.720441569620),
                      (24.489466197319, 52.660473282227), (24.578732351094, 39.353834118213)]),
        ];

        // Corners land on whole kilometres. Some sit on 10 km lines and some,
        // like Nevada's eastern edge at y=225000, only on 5 km — so 1 km is the
        // honest grid. It still discriminates hard: 72 corner values landing
        // within 5 m of a kilometre line by chance is a 1-in-10^144 event.
        const GRID: f64 = 1_000.0;
        const TOLERANCE_M: f64 = 5.0;

        for (name, corners) in bounds {
            let params = get_theater_params(name).unwrap_or_else(|| panic!("{name} missing"));
            assert!(params.verified, "{name} is cross-checked here, so mark it verified");

            for (lat, lon) in corners {
                let (x, y) = latlon_to_dcs(*lat, *lon, params).unwrap();
                for (axis, value) in [("x", x), ("y", y)] {
                    let off = (value - (value / GRID).round() * GRID).abs();
                    assert!(
                        off < TOLERANCE_M,
                        "{name} corner ({lat}, {lon}) -> {axis}={value:.1}, \
                         which is {off:.1} m off a 10 km grid line; projection is suspect"
                    );
                }
            }
        }
    }

    /// The three projections we could not cross-check must stay flagged, so the
    /// UI keeps warning about them until someone verifies them in DCS.
    #[test]
    fn test_unverified_theaters_are_flagged() {
        for name in ["SinaiMap", "Kola", "Afghanistan"] {
            let params = get_theater_params(name).unwrap();
            assert!(!params.proj4_string.is_empty(), "{name} should still be usable");
            assert!(!params.verified, "{name} has no independent confirmation yet");
        }
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
