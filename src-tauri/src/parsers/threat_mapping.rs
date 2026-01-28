//! DCS threat unit mapping
//!
//! Maps DCS unit type names to normalized threat system identifiers
//! for database lookup.

use std::collections::HashMap;
use once_cell::sync::Lazy;

/// Mapping from DCS unit type patterns to normalized threat names
/// The key is a pattern that appears in the DCS unit type string
/// The value is the normalized name used in the database (dcs_unit_name field)
static DCS_THREAT_MAPPINGS: Lazy<HashMap<&'static str, &'static str>> = Lazy::new(|| {
    let mut m = HashMap::new();

    // S-300 variants
    m.insert("S-300PS", "S-300PS");
    m.insert("S-300", "S-300PS");

    // SA-11 Buk variants
    m.insert("Buk", "Buk");
    m.insert("SA-11", "Buk");
    m.insert("9A310M1", "Buk");

    // SA-6 Kub
    m.insert("Kub", "Kub");
    m.insert("SA-6", "Kub");
    m.insert("2P25", "Kub");

    // SA-10 (S-300) components
    m.insert("5P85", "S-300PS"); // Launcher

    // SA-2 Guideline
    m.insert("S-75", "S-75");
    m.insert("SA-2", "S-75");
    m.insert("5P73", "S-75");

    // SA-3 Goa
    m.insert("S-125", "S-125");
    m.insert("SA-3", "S-125");
    m.insert("5P73", "S-125");

    // SA-8 Osa/Gecko
    m.insert("Osa", "Osa");
    m.insert("SA-8", "Osa");
    m.insert("9A33", "Osa");

    // SA-15 Tor
    m.insert("Tor", "Tor");
    m.insert("SA-15", "Tor");
    m.insert("9A331", "Tor");

    // SA-19 Tunguska
    m.insert("Tunguska", "Tunguska");
    m.insert("SA-19", "Tunguska");
    m.insert("2S6", "Tunguska");

    // AAA - ZSU-23-4 Shilka
    m.insert("ZSU-23-4", "ZSU-23-4");
    m.insert("Shilka", "ZSU-23-4");

    // AAA - ZSU-57-2
    m.insert("ZSU-57-2", "ZSU-57-2");

    // AAA - S-60
    m.insert("S-60", "S-60");
    m.insert("S_60", "S-60");

    // MANPADS - Igla
    m.insert("Igla", "SA-18 Igla");
    m.insert("SA-18", "SA-18 Igla");
    m.insert("9K38", "SA-18 Igla");

    // MANPADS - Stinger
    m.insert("Stinger", "Stinger");
    m.insert("FIM-92", "Stinger");

    // EWR systems
    m.insert("1L13", "1L13");
    m.insert("55G6", "55G6");
    m.insert("Nebo", "55G6");

    // Gepard
    m.insert("Gepard", "Gepard");
    m.insert("Flakpanzer", "Gepard");

    // Roland
    m.insert("Roland", "Roland");

    // Hawk
    m.insert("Hawk", "Hawk");
    m.insert("MIM-23", "Hawk");

    // Patriot
    m.insert("Patriot", "Patriot");
    m.insert("MIM-104", "Patriot");

    // NASAMS
    m.insert("NASAMS", "NASAMS");

    // Rapier
    m.insert("Rapier", "Rapier");

    // SA-13 Strela (Gopher)
    m.insert("Strela-10", "Strela-10");
    m.insert("SA-13", "Strela-10");
    m.insert("9A35", "Strela-10");

    m
});

/// Categories of DCS units that are considered threats
static THREAT_CATEGORIES: &[&str] = &[
    // SAM systems (vehicle category)
    "SAM",
    "S-300",
    "S-200",
    "S-125",
    "S-75",
    "Buk",
    "Kub",
    "Tor",
    "Osa",
    "Tunguska",
    "Strela",
    "Igla",

    // Western SAMs
    "Hawk",
    "Patriot",
    "Roland",
    "Rapier",
    "NASAMS",
    "Chaparral",

    // AAA
    "ZSU",
    "Shilka",
    "S-60",
    "ZU-23",
    "Gepard",
    "Vulcan",
    "Flak",

    // EWR
    "1L13",
    "55G6",
    "Nebo",
    "P-19",
    "EWR",
    "Radar",
];

/// Normalize a DCS unit type name to our database format
///
/// # Arguments
/// * `dcs_unit_type` - The DCS unit type string (e.g., "SA-11_Buk_LN_9A310M1")
///
/// # Returns
/// The normalized name for database lookup, or None if not a recognized threat
pub fn normalize_dcs_unit_name(dcs_unit_type: &str) -> Option<&'static str> {
    // Try exact mapping first
    for (pattern, normalized) in DCS_THREAT_MAPPINGS.iter() {
        if dcs_unit_type.contains(pattern) {
            return Some(normalized);
        }
    }
    None
}

/// Check if a DCS unit type is a threat system
///
/// # Arguments
/// * `dcs_unit_type` - The DCS unit type string
///
/// # Returns
/// true if this unit is potentially a threat
pub fn is_threat_unit(dcs_unit_type: &str) -> bool {
    let upper = dcs_unit_type.to_uppercase();
    THREAT_CATEGORIES.iter().any(|cat| upper.contains(&cat.to_uppercase()))
}

/// Get threat unit info from a DCS unit type
///
/// # Returns
/// Tuple of (normalized_name, confidence_score)
/// confidence_score: 1.0 = exact match, 0.7 = pattern match, 0.4 = category match
pub fn get_threat_info(dcs_unit_type: &str) -> Option<(&'static str, f32)> {
    // Check for exact pattern match
    for (pattern, normalized) in DCS_THREAT_MAPPINGS.iter() {
        if dcs_unit_type.contains(pattern) {
            // Higher confidence for longer pattern matches
            let confidence = if dcs_unit_type.eq_ignore_ascii_case(pattern) {
                1.0
            } else if pattern.len() > 5 {
                0.9
            } else {
                0.7
            };
            return Some((normalized, confidence));
        }
    }

    // Check if it's at least in a threat category
    if is_threat_unit(dcs_unit_type) {
        // Try to extract a reasonable name
        // This is a fallback when we don't have an exact mapping
        return None; // Return None so caller knows we don't have a mapping
    }

    None
}

/// Extract all threat units from a list of unit types
///
/// # Arguments
/// * `unit_types` - Iterator of (unit_name, unit_type) pairs
///
/// # Returns
/// Vector of (unit_name, unit_type, normalized_name, confidence) tuples
pub fn extract_threats<'a, I>(unit_types: I) -> Vec<(String, String, Option<&'static str>, f32)>
where
    I: Iterator<Item = (&'a str, &'a str)>,
{
    unit_types
        .filter(|(_, unit_type)| is_threat_unit(unit_type))
        .map(|(name, unit_type)| {
            let (normalized, confidence) = get_threat_info(unit_type)
                .map(|(n, c)| (Some(n), c))
                .unwrap_or((None, 0.0));
            (name.to_string(), unit_type.to_string(), normalized, confidence)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_buk() {
        assert_eq!(normalize_dcs_unit_name("SA-11_Buk_LN_9A310M1"), Some("Buk"));
        assert_eq!(normalize_dcs_unit_name("Buk"), Some("Buk"));
    }

    #[test]
    fn test_normalize_s300() {
        assert_eq!(normalize_dcs_unit_name("S-300PS_5P85C_ln"), Some("S-300PS"));
        assert_eq!(normalize_dcs_unit_name("S-300"), Some("S-300PS"));
    }

    #[test]
    fn test_is_threat_unit() {
        assert!(is_threat_unit("SA-11_Buk_LN_9A310M1"));
        assert!(is_threat_unit("ZSU-23-4 Shilka"));
        assert!(is_threat_unit("S-300PS_5P85C_ln"));
        assert!(!is_threat_unit("T-72B"));
        assert!(!is_threat_unit("BTR-80"));
    }

    #[test]
    fn test_get_threat_info() {
        let (name, confidence) = get_threat_info("SA-11_Buk_LN_9A310M1").unwrap();
        assert_eq!(name, "Buk");
        assert!(confidence > 0.5);

        let (name, _) = get_threat_info("ZSU-23-4").unwrap();
        assert_eq!(name, "ZSU-23-4");
    }

    #[test]
    fn test_extract_threats() {
        let units = vec![
            ("SAM Site 1", "SA-11_Buk_LN_9A310M1"),
            ("Tank Platoon", "T-72B"),
            ("AAA Battery", "ZSU-23-4"),
        ];

        let threats = extract_threats(units.into_iter());
        assert_eq!(threats.len(), 2);
        assert!(threats.iter().any(|(_, t, _, _)| t.contains("Buk")));
        assert!(threats.iter().any(|(_, t, _, _)| t.contains("ZSU")));
    }
}
