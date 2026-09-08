//! DCS threat unit mapping
//!
//! Maps a DCS unit type name (the `type` field of a unit in a mission file,
//! e.g. "SA-11 Buk LN 9A310M1" or "Tor 9A331") to the `dcs_unit_name` key of
//! a row in the bundled threat database.
//!
//! Matching is done on whole tokens, never on raw substrings. A unit name and
//! every rule pattern are reduced to the same canonical form first: lower-case,
//! split on anything that is not a letter or digit. A rule matches when its
//! tokens appear as a contiguous run inside the unit's tokens. So the SA-8
//! rule `9A33` matches "Osa 9A33 ln" but can never match the SA-15's
//! "Tor 9A331", and the rule `ZSU-57-2` matches DCS's "ZSU_57_2" even though
//! the separators differ.
//!
//! When several rules match, the most specific wins: more tokens first, then
//! more characters, then position in the table. The table is a plain ordered
//! slice, so the answer is the same on every launch.
//!
//! History: the first implementation walked a `HashMap` with `str::contains`.
//! Hash-map iteration order is randomised per process, and `9A33` is a
//! substring of `9A331`, so the NTTR mission's Tor imported as an SA-8 on some
//! launches and an SA-15 on others. The token rule and the fixed order are
//! both deliberate; keep them.

/// (pattern, normalized) rules. `normalized` is the `dcs_unit_name` of a
/// threat_systems row in the reference database.
///
/// Patterns are written the way DCS spells them where a DCS name is known;
/// separators do not matter for matching (see module docs) but keeping the
/// DCS spelling makes the table greppable against a mission file.
static DCS_THREAT_RULES: &[(&str, &str)] = &[
    // SA-10 / S-300PS. Every S-300 unit name in DCS starts with "S-300PS".
    ("S-300PS", "S-300PS"),
    ("S-300", "S-300PS"),
    ("5P85C", "S-300PS"), // launcher
    ("5P85D", "S-300PS"), // launcher
    // SA-11 Buk
    ("Buk", "Buk"),
    ("SA-11", "Buk"),
    ("9A310M1", "Buk"), // launcher
    ("9S18M1", "Buk"),  // search radar
    ("9S470M1", "Buk"), // command post
    // SA-6 Kub
    ("Kub", "Kub"),
    ("SA-6", "Kub"),
    ("2P25", "Kub"), // launcher
    ("1S91", "Kub"), // Straight Flush radar
    // SA-2 Guideline. DCS spells the launcher "S_75M_Volhov" and the Fan Song
    // "SNR_75V"; neither contains "S-75" as a token.
    ("S-75", "S-75"),
    ("SA-2", "S-75"),
    ("S_75M_Volhov", "S-75"),
    ("Volhov", "S-75"),
    ("SNR_75V", "S-75"),
    // SA-3 Goa. DCS: "5p73 s-125 ln", "snr s-125 tr".
    ("S-125", "S-125"),
    ("SA-3", "S-125"),
    ("5P73", "S-125"),
    // P-19 Flat Face search radar. DCS names it "p-19 s-125 sr", but the SA-2
    // template uses the same radar, so on its own it must not claim an SA-3
    // site: the NTTR mission's two SA-2 sites imported as SA-3 because of it.
    // The five-token DCS name outranks the two-token "S-125" rule above. There
    // is no P-19 database row yet, so it imports as Unknown and the frontend
    // drops it; an EWR row for it is the right follow-up.
    ("p-19 s-125 sr", "P-19"),
    // SA-8 Osa / Gecko. DCS: "Osa 9A33 ln".
    ("Osa", "Osa"),
    ("SA-8", "Osa"),
    ("9A33", "Osa"),
    // SA-15 Tor / Gauntlet. DCS: "Tor 9A331".
    ("Tor", "Tor"),
    ("SA-15", "Tor"),
    ("9A331", "Tor"),
    // SA-19 Tunguska. DCS: "2S6 Tunguska".
    ("Tunguska", "Tunguska"),
    ("SA-19", "Tunguska"),
    ("2S6", "Tunguska"),
    // AAA
    ("ZSU-23-4", "ZSU-23-4"),
    ("Shilka", "ZSU-23-4"),
    ("ZSU_57_2", "ZSU-57-2"), // DCS spelling
    ("ZSU-57-2", "ZSU-57-2"),
    ("S-60", "S-60"), // DCS: "S-60_Type59_Artillery"
    // MANPADS. DCS: "SA-18 Igla manpad", "SA-18 Igla-S manpad", "... comm".
    ("Igla", "SA-18 Igla"),
    ("SA-18", "SA-18 Igla"),
    ("9K38", "SA-18 Igla"),
    ("Stinger", "Stinger"),
    ("FIM-92", "Stinger"),
    // EWR. DCS: "1L13 EWR", "55G6 EWR".
    ("1L13", "1L13"),
    ("55G6", "55G6"),
    ("Nebo", "55G6"),
    // Western and other systems. Recognised so the import can name them; the
    // reference database has no rows for these yet, so they import as Unknown.
    ("Gepard", "Gepard"),
    ("Flakpanzer", "Gepard"),
    ("Roland", "Roland"),
    ("Hawk", "Hawk"),
    ("MIM-23", "Hawk"),
    ("Patriot", "Patriot"),
    ("MIM-104", "Patriot"),
    ("NASAMS", "NASAMS"),
    ("Rapier", "Rapier"),
    ("Strela-10", "Strela-10"),
    ("Strela-10M3", "Strela-10"), // DCS spelling
    ("SA-13", "Strela-10"),
    ("9A35", "Strela-10"),
];

/// Coarse pre-filter: unit type names that might be a threat at all. Anything
/// passing this but failing `get_threat_info` is imported with Unknown
/// confidence so the planner can see it and decide.
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

/// Canonical token form: lower-case, split on anything that is not a letter or
/// a digit. "SA-11 Buk LN 9A310M1", "SA-11_Buk_LN_9A310M1" and
/// "sa-11 buk ln 9a310m1" all reduce to the same list.
fn tokens(name: &str) -> Vec<String> {
    name.split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_lowercase())
        .collect()
}

/// True when `needle` appears as a contiguous run of whole tokens in `hay`.
fn contains_run(hay: &[String], needle: &[String]) -> bool {
    !needle.is_empty() && hay.windows(needle.len()).any(|window| window == needle)
}

/// The rule that best describes a unit type, if any.
///
/// Returns `(pattern, normalized, exact)` where `exact` means the unit name is
/// the pattern and nothing else.
fn best_rule(dcs_unit_type: &str) -> Option<(&'static str, &'static str, bool)> {
    let unit = tokens(dcs_unit_type);
    if unit.is_empty() {
        return None;
    }

    let mut best: Option<((usize, usize), &'static str, &'static str)> = None;
    for (pattern, normalized) in DCS_THREAT_RULES {
        let needle = tokens(pattern);
        if !contains_run(&unit, &needle) {
            continue;
        }
        // Specificity: token count, then character count. Strict `>` keeps the
        // earlier table entry on a tie, so the order is fully determined.
        let key = (needle.len(), pattern.len());
        if best.map_or(true, |(best_key, _, _)| key > best_key) {
            best = Some((key, pattern, normalized));
        }
    }

    best.map(|(_, pattern, normalized)| {
        let exact = tokens(pattern) == unit;
        (pattern, normalized, exact)
    })
}

/// Normalize a DCS unit type name to our database format
///
/// # Arguments
/// * `dcs_unit_type` - The DCS unit type string (e.g., "SA-11 Buk LN 9A310M1")
///
/// # Returns
/// The normalized name for database lookup, or None if not a recognized threat
pub fn normalize_dcs_unit_name(dcs_unit_type: &str) -> Option<&'static str> {
    best_rule(dcs_unit_type).map(|(_, normalized, _)| normalized)
}

/// Check if a DCS unit type is a threat system
///
/// # Arguments
/// * `dcs_unit_type` - The DCS unit type string
///
/// # Returns
/// true if this unit is potentially a threat
pub fn is_threat_unit(dcs_unit_type: &str) -> bool {
    // Anything the rule table knows is a threat by definition. The category
    // list is a coarse widening for units we recognise as air defence but have
    // no rule for; it used to be the only gate, which is why "SNR_75V" and
    // "S_75M_Volhov" (no "S-75" substring) never reached the rules at all.
    if best_rule(dcs_unit_type).is_some() {
        return true;
    }
    let upper = dcs_unit_type.to_uppercase();
    THREAT_CATEGORIES.iter().any(|cat| upper.contains(&cat.to_uppercase()))
}

/// Get threat unit info from a DCS unit type
///
/// # Returns
/// Tuple of (normalized_name, confidence_score)
/// confidence_score: 1.0 = the name is exactly a known pattern,
/// 0.9 = matched a specific (long) pattern, 0.7 = matched a short pattern
pub fn get_threat_info(dcs_unit_type: &str) -> Option<(&'static str, f32)> {
    let (pattern, normalized, exact) = best_rule(dcs_unit_type)?;
    let confidence = if exact {
        1.0
    } else if pattern.len() > 5 {
        0.9
    } else {
        0.7
    };
    Some((normalized, confidence))
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

    /// The bug that prompted the rewrite: "9A33" (SA-8 launcher) is a
    /// substring of "9A331" (SA-15), and a substring match picked whichever
    /// the hash map yielded first.
    #[test]
    fn tor_9a331_is_an_sa15_never_an_sa8() {
        assert_eq!(normalize_dcs_unit_name("Tor 9A331"), Some("Tor"));
        assert_eq!(normalize_dcs_unit_name("Osa 9A33 ln"), Some("Osa"));
        // A bare designation that is a prefix of a longer one must not match.
        assert_eq!(normalize_dcs_unit_name("9A3310"), None);
    }

    /// Feeding each pattern to the matcher must yield its own rule. This
    /// catches a future entry whose pattern is swallowed by another rule, and
    /// a duplicate pattern that points at a different system.
    #[test]
    fn no_rule_hijacks_another_rules_pattern() {
        for (pattern, expected) in DCS_THREAT_RULES {
            assert_eq!(
                normalize_dcs_unit_name(pattern),
                Some(*expected),
                "pattern {pattern:?} did not resolve to its own rule"
            );
        }
    }

    /// Every SAM and AAA unit type name in test-data/nttr_redflag_viper1.json,
    /// spelled exactly as DCS writes it.
    #[test]
    fn real_nttr_unit_names_resolve() {
        let cases = [
            ("SA-11 Buk CC 9S470M1", "Buk"),
            ("SA-11 Buk LN 9A310M1", "Buk"),
            ("SA-11 Buk SR 9S18M1", "Buk"),
            ("Kub 1S91 str", "Kub"),
            ("Kub 2P25 ln", "Kub"),
            ("S-300PS 40B6M tr", "S-300PS"),
            ("S-300PS 40B6MD sr", "S-300PS"),
            ("S-300PS 54K6 cp", "S-300PS"),
            ("S-300PS 5P85C ln", "S-300PS"),
            ("S-300PS 5P85D ln", "S-300PS"),
            ("S-300PS 64H6E sr", "S-300PS"),
            ("SA-18 Igla-S comm", "SA-18 Igla"),
            ("SA-18 Igla-S manpad", "SA-18 Igla"),
            ("Tor 9A331", "Tor"),
            ("ZSU-23-4 Shilka", "ZSU-23-4"),
            ("ZSU_57_2", "ZSU-57-2"),
            ("SNR_75V", "S-75"),
            ("S_75M_Volhov", "S-75"),
            ("snr s-125 tr", "S-125"),
            ("5p73 s-125 ln", "S-125"),
            // Shared search radar: identifies neither SA-2 nor SA-3 on its own.
            ("p-19 s-125 sr", "P-19"),
        ];
        for (unit, expected) in cases {
            assert_eq!(normalize_dcs_unit_name(unit), Some(expected), "unit {unit:?}");
        }
    }

    #[test]
    fn matching_ignores_case_and_separators() {
        assert_eq!(normalize_dcs_unit_name("tor 9a331"), Some("Tor"));
        assert_eq!(normalize_dcs_unit_name("TOR_9A331"), Some("Tor"));
        assert_eq!(normalize_dcs_unit_name("5p73 s-125 ln"), Some("S-125"));
        assert_eq!(normalize_dcs_unit_name("S_75M_Volhov"), Some("S-75"));
        assert_eq!(normalize_dcs_unit_name("S-60_Type59_Artillery"), Some("S-60"));
    }

    #[test]
    fn a_pattern_inside_a_longer_word_does_not_match() {
        // "tor" inside "Predator", "osa" inside "Rosario"
        assert_eq!(normalize_dcs_unit_name("Predator TrojanSpirit"), None);
        assert_eq!(normalize_dcs_unit_name("Rosario"), None);
        assert_eq!(normalize_dcs_unit_name("T-72B"), None);
    }

    /// The pre-filter must accept every unit the rule table can name. Before
    /// this, the SA-2's Fan Song and Volhov launchers failed the category
    /// substring test and the whole site was identified off its P-19 as SA-3.
    #[test]
    fn pre_filter_accepts_every_rule_pattern() {
        for (pattern, _) in DCS_THREAT_RULES {
            assert!(is_threat_unit(pattern), "pre-filter rejected {pattern:?}");
        }
        assert!(is_threat_unit("SNR_75V"));
        assert!(is_threat_unit("S_75M_Volhov"));
        assert!(is_threat_unit("ZSU_57_2"));
    }

    /// The real "Interdiction SA2" group from the NTTR mission, in file order.
    #[test]
    fn an_sa2_site_is_identified_as_s75_not_by_its_p19() {
        let group = [
            ("SA3-3-1", "SNR_75V"),
            ("SA3-3-2", "S_75M_Volhov"),
            ("SA3-3-3", "S_75M_Volhov"),
            ("SA3-3-8", "SKP-11"),
            ("SA3-3-9", "p-19 s-125 sr"),
            ("SA3-3-10", "ATZ-10"),
            ("SA3-3-11", "Ural-375"),
        ];
        let threats = extract_threats(group.into_iter());
        let systems: Vec<Option<&str>> = threats.iter().map(|(_, _, n, _)| *n).collect();
        assert!(systems.contains(&Some("S-75")), "got {systems:?}");
        assert!(!systems.contains(&Some("S-125")), "P-19 claimed an SA-3: {systems:?}");
        // Support trucks are not threats.
        assert!(!threats.iter().any(|(_, t, _, _)| t == "ATZ-10" || t == "Ural-375" || t == "SKP-11"));
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

        let (name, confidence) = get_threat_info("ZSU-23-4").unwrap();
        assert_eq!(name, "ZSU-23-4");
        assert_eq!(confidence, 1.0, "an exact name is full confidence");
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
