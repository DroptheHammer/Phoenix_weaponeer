//! Reference data: threat systems, weapons, fuzes, aircraft, and which
//! aircraft carries which weapon.
//!
//! This is read-only data that ships with the app, so it lives in
//! `data/reference.json`, embedded at compile time, rather than in a database.
//! Until 2026-09-26 it was seeded into SQLite on first launch; the JSON was
//! dumped from that seed, and the queries below keep the SQL orderings, so
//! the frontend sees exactly what it saw before.
//!
//! Provenance, carried over from the old seed:
//! - **Threat ranges** are DCS in-game performance, which is what a DCS planner
//!   needs; real-world figures differ by variant and source. Rows added in
//!   reference DB v3 (SA-5, SA-13, Hawk, Patriot, NASAMS, Roland, Rapier,
//!   Chaparral, ZU-23, Gepard, Vulcan, P-19) fill only the fields anything
//!   reads: name, NATO designation, type, max range and max altitude.
//!   Speculative columns stay null rather than invented, so no number reads as
//!   fact when it is a guess.
//! - **Guns and rockets** (reference DB v4) carry a name and a class only.
//!   Every release, speed and frag field is null, so the delivery profile's own
//!   numbers stand, and weight 0 means "not tracked". Their
//!   `aircraft_weapons` rows use station 0, meaning "not modelled"; the row
//!   only says the aircraft carries it.
//! - **Aircraft ids** must match `normalizeAircraftType` in
//!   `src/stores/missionStore.ts` and the `aircraftId` in each
//!   `src-tauri/resources/profiles/*.json`.
//! - **Bombs and missiles** (reference DB v5) are mapped to all ten aircraft.
//!   Only the F-16C's original rows have station numbers; every row added in v5
//!   uses station 0 and a quantity of 1, like the guns and rockets, so it only
//!   says the aircraft carries the weapon. Each list was checked against the
//!   module manuals and Chuck's Guides (2026-10-01) and leaves out what the DCS
//!   module does not carry: the F/A-18C's AGM-65G, the A-4E-C's Mk-82 AIR and the
//!   Mirage F1's Mk-82 Snakeye and Mk-84. The GBU-16, AGM-65F, AGM-122 and
//!   GAU-12/U rows hold a name, a class and a guidance type only: weight 0 and
//!   every release and frag field null, with `notes` saying so. The planner
//!   flags an attack that uses a bomb with no frag floor or a missile with no
//!   minimum release (`runAttackChecks`), since nothing else would stop it
//!   releasing too low.

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// Threat system
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ThreatSystem {
    pub id: String,
    pub name: String,
    pub nato_designation: Option<String>,
    pub threat_type: String,
    pub max_range_nm: f64,
    pub min_range_nm: f64,
    pub max_altitude_ft: f64,
    pub min_altitude_ft: f64,
    pub optimal_altitude_ft: Option<f64>,
    pub missile_speed_mach: Option<f64>,
    pub reload_time_sec: Option<f64>,
    pub simultaneous_engagements: Option<i32>,
    pub reaction_time_sec: Option<f64>,
    pub radar_info: Option<String>,
    pub gun_info: Option<String>,
    pub dcs_unit_name: Option<String>,
    pub notes: Option<String>,
}

/// Weapon
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Weapon {
    pub id: String,
    pub name: String,
    pub category: String,
    pub weight_lbs: f64,
    pub drag_index: Option<f64>,
    pub guidance: String,
    pub min_release_alt_ft: Option<f64>,
    pub max_release_alt_ft: Option<f64>,
    pub min_release_speed_ktas: Option<f64>,
    pub max_release_speed_ktas: Option<f64>,
    pub frag_lethal_radius_ft: Option<f64>,
    pub frag_effective_radius_ft: Option<f64>,
    pub frag_min_safe_alt_ft: Option<f64>,
    pub dcs_weapon_name: Option<String>,
    pub notes: Option<String>,
    /// Aircraft ids mapped to this weapon in `aircraft_weapons`. The picker
    /// uses it for guns and rockets, which only their own aircraft carry.
    /// Derived at load time, never stored.
    #[serde(default)]
    pub carried_by: Vec<String>,
}

/// Fuze option
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FuzeOption {
    pub id: String,
    pub weapon_id: String,
    pub name: String,
    pub fuze_type: String,
    pub arming_delay_sec: Option<f64>,
    pub burst_height_ft: Option<f64>,
}

/// Aircraft
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Aircraft {
    pub id: String,
    pub name: String,
    pub dcs_module_name: String,
    pub max_speed_ktas: f64,
    pub stall_speed_ktas: f64,
    pub max_g: f64,
    pub service_ceiling_ft: f64,
    pub kneeboard_path: String,
}

/// One aircraft/weapon/station row.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AircraftWeapon {
    pub aircraft_id: String,
    pub weapon_id: String,
    pub station: i64,
    pub max_quantity: Option<i64>,
}

/// The whole reference set, as `data/reference.json` holds it.
#[derive(Debug, Clone, Deserialize)]
pub struct RefData {
    threat_systems: Vec<ThreatSystem>,
    weapons: Vec<Weapon>,
    fuze_options: Vec<FuzeOption>,
    aircraft: Vec<Aircraft>,
    aircraft_weapons: Vec<AircraftWeapon>,
}

/// The reference data that ships with the app, parsed once.
pub fn reference() -> &'static RefData {
    static DATA: OnceLock<RefData> = OnceLock::new();
    DATA.get_or_init(|| {
        RefData::from_json(include_str!("../data/reference.json"))
            .expect("the bundled reference data is valid (a test checks it)")
    })
}

/// Case-insensitive ASCII, as SQLite's `COLLATE NOCASE` compared.
fn contains_ignore_case(haystack: &str, needle: &str) -> bool {
    haystack.to_ascii_lowercase().contains(&needle.to_ascii_lowercase())
}

impl RefData {
    /// Parse the reference set and fill in each weapon's `carried_by`.
    pub fn from_json(json: &str) -> Result<Self, String> {
        let mut data: RefData = serde_json::from_str(json).map_err(|e| format!("reference data: {e}"))?;
        for weapon in &mut data.weapons {
            let mut carried_by: Vec<String> = Vec::new();
            for row in data.aircraft_weapons.iter().filter(|r| r.weapon_id == weapon.id) {
                if !carried_by.contains(&row.aircraft_id) {
                    carried_by.push(row.aircraft_id.clone());
                }
            }
            // Sorted, as SQLite's GROUP_CONCAT(DISTINCT ...) returned them.
            carried_by.sort();
            weapon.carried_by = carried_by;
        }
        Ok(data)
    }

    /// All threat systems, by type then name.
    pub fn get_all_threats(&self) -> Vec<ThreatSystem> {
        let mut threats = self.threat_systems.clone();
        threats.sort_by(|a, b| (&a.threat_type, &a.name).cmp(&(&b.threat_type, &b.name)));
        threats
    }

    /// Threats of one type (SAM, AAA, MANPADS, SHORAD, EWR), by name.
    pub fn get_threats_by_type(&self, threat_type: &str) -> Vec<ThreatSystem> {
        let mut threats: Vec<ThreatSystem> =
            self.threat_systems.iter().filter(|t| t.threat_type == threat_type).cloned().collect();
        threats.sort_by(|a, b| a.name.cmp(&b.name));
        threats
    }

    pub fn get_threat_by_id(&self, id: &str) -> Option<ThreatSystem> {
        self.threat_systems.iter().find(|t| t.id == id).cloned()
    }

    /// The threat system whose `dcs_unit_name` is this normalized DCS name
    /// (see `parsers::threat_mapping`), ignoring case.
    pub fn get_threat_by_dcs_name(&self, dcs_name: &str) -> Option<ThreatSystem> {
        self.threat_systems
            .iter()
            .find(|t| t.dcs_unit_name.as_deref().is_some_and(|n| n.eq_ignore_ascii_case(dcs_name)))
            .cloned()
    }

    /// Threats whose DCS name, name or NATO designation contains the term,
    /// ignoring case, by name. For fuzzy matching when an exact match fails.
    pub fn search_threats_by_dcs_name(&self, search_term: &str) -> Vec<ThreatSystem> {
        let hit = |field: &Option<String>| field.as_deref().is_some_and(|f| contains_ignore_case(f, search_term));
        let mut threats: Vec<ThreatSystem> = self
            .threat_systems
            .iter()
            .filter(|t| hit(&t.dcs_unit_name) || contains_ignore_case(&t.name, search_term) || hit(&t.nato_designation))
            .cloned()
            .collect();
        threats.sort_by(|a, b| a.name.cmp(&b.name));
        threats
    }

    /// All weapons, by category then name.
    pub fn get_all_weapons(&self) -> Vec<Weapon> {
        let mut weapons = self.weapons.clone();
        weapons.sort_by(|a, b| (&a.category, &a.name).cmp(&(&b.category, &b.name)));
        weapons
    }

    pub fn get_weapon_by_id(&self, id: &str) -> Option<Weapon> {
        self.weapons.iter().find(|w| w.id == id).cloned()
    }

    /// Weapons mapped to one aircraft, by category then name.
    pub fn get_weapons_for_aircraft(&self, aircraft_id: &str) -> Vec<Weapon> {
        let mut weapons: Vec<Weapon> =
            self.weapons.iter().filter(|w| w.carried_by.iter().any(|a| a == aircraft_id)).cloned().collect();
        weapons.sort_by(|a, b| (&a.category, &a.name).cmp(&(&b.category, &b.name)));
        weapons
    }

    /// Fuze options for one weapon, by name.
    pub fn get_fuze_options(&self, weapon_id: &str) -> Vec<FuzeOption> {
        let mut fuzes: Vec<FuzeOption> =
            self.fuze_options.iter().filter(|f| f.weapon_id == weapon_id).cloned().collect();
        fuzes.sort_by(|a, b| a.name.cmp(&b.name));
        fuzes
    }

    /// All aircraft, by name.
    pub fn get_all_aircraft(&self) -> Vec<Aircraft> {
        let mut aircraft = self.aircraft.clone();
        aircraft.sort_by(|a, b| a.name.cmp(&b.name));
        aircraft
    }

    pub fn get_aircraft_by_id(&self, id: &str) -> Option<Aircraft> {
        self.aircraft.iter().find(|a| a.id == id).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn the_bundled_data_parses_and_every_row_links_up() {
        let data = RefData::from_json(include_str!("../data/reference.json")).expect("must parse");
        assert!(!data.threat_systems.is_empty(), "Threats should be present");
        assert!(!data.weapons.is_empty(), "Weapons should be present");
        assert!(!data.aircraft.is_empty(), "Aircraft should be present");

        // What the SQL primary and foreign keys used to promise.
        let unique = |ids: Vec<&str>, what: &str| {
            let mut seen = HashSet::new();
            for id in ids {
                assert!(seen.insert(id), "duplicate {what} id {id}");
            }
        };
        unique(data.threat_systems.iter().map(|t| t.id.as_str()).collect(), "threat");
        unique(data.weapons.iter().map(|w| w.id.as_str()).collect(), "weapon");
        unique(data.fuze_options.iter().map(|f| f.id.as_str()).collect(), "fuze");
        unique(data.aircraft.iter().map(|a| a.id.as_str()).collect(), "aircraft");
        for fuze in &data.fuze_options {
            assert!(data.get_weapon_by_id(&fuze.weapon_id).is_some(), "fuze {} names no weapon", fuze.id);
        }
        for row in &data.aircraft_weapons {
            assert!(data.get_aircraft_by_id(&row.aircraft_id).is_some(), "{row:?} names no aircraft");
            assert!(data.get_weapon_by_id(&row.weapon_id).is_some(), "{row:?} names no weapon");
        }
    }

    #[test]
    fn test_get_weapons_for_f16() {
        let weapons = reference().get_weapons_for_aircraft("f16c");
        assert!(!weapons.is_empty(), "F-16 should have weapons");
        assert!(reference().get_weapons_for_aircraft("no such jet").is_empty());
    }

    #[test]
    fn guns_and_rockets_say_who_carries_them() {
        let gau8 = reference().get_weapon_by_id("gau8").unwrap();
        assert_eq!(gau8.carried_by, vec!["a10c"]);
        let hydra = reference().get_weapon_by_id("hydra70").unwrap();
        assert_eq!(hydra.carried_by, vec!["a10c", "f4e", "f5e"], "sorted");
    }

    /// Four rows (reference DB v5) are name-only: the planner has no release or
    /// frag figure for them and must not be handed an invented one. A number here
    /// would also stop the "no data on file" note from firing on an attack.
    #[test]
    fn the_four_name_only_rows_carry_no_numbers() {
        let rows = [
            ("gbu16", "bomb_guided", "laser"),
            ("agm65f", "missile_agm", "ir"),
            ("agm122", "missile_agm", "radar"),
            ("gau12", "gun", "none"),
        ];
        for (id, category, guidance) in rows {
            let w = reference().get_weapon_by_id(id).unwrap_or_else(|| panic!("no weapon row {id}"));
            assert_eq!((w.category.as_str(), w.guidance.as_str()), (category, guidance), "{id}");
            assert_eq!(w.weight_lbs, 0.0, "{id}: weight 0 means not tracked");
            let numbers = [
                ("drag_index", w.drag_index),
                ("min_release_alt_ft", w.min_release_alt_ft),
                ("max_release_alt_ft", w.max_release_alt_ft),
                ("min_release_speed_ktas", w.min_release_speed_ktas),
                ("max_release_speed_ktas", w.max_release_speed_ktas),
                ("frag_lethal_radius_ft", w.frag_lethal_radius_ft),
                ("frag_effective_radius_ft", w.frag_effective_radius_ft),
                ("frag_min_safe_alt_ft", w.frag_min_safe_alt_ft),
            ];
            for (field, value) in numbers {
                assert_eq!(value, None, "{id}.{field} is a number; this row is name-only");
            }
            assert_eq!(w.dcs_weapon_name, None, "{id}: the internal name is for the CLSID follow-up");
            let notes = w.notes.as_deref().unwrap_or("");
            assert!(notes.contains("Name only"), "{id}: notes must say the row is name-only, not {notes:?}");
        }
    }

    /// Saved missions and the planner's loadout match a weapon on its name, so a
    /// reworded row would quietly orphan every attack that used it. Pinned by id.
    #[test]
    fn the_thirty_weapon_names_are_pinned_by_id() {
        let expected: &[(&str, &str)] = &[
            ("mk82", "Mk-82 LDGP"),
            ("mk82air", "Mk-82 AIR"),
            ("mk82se", "Mk-82 Snakeye"),
            ("mk84", "Mk-84 LDGP"),
            ("gbu10", "GBU-10 Paveway II"),
            ("gbu12", "GBU-12 Paveway II"),
            ("gbu16", "GBU-16 Paveway II"),
            ("gbu24", "GBU-24 Paveway III"),
            ("gbu31", "GBU-31 JDAM"),
            ("gbu38", "GBU-38 JDAM"),
            ("cbu87", "CBU-87 CEM"),
            ("cbu97", "CBU-97 SFW"),
            ("agm65d", "AGM-65D Maverick"),
            ("agm65f", "AGM-65F Maverick"),
            ("agm65g", "AGM-65G Maverick"),
            ("agm65h", "AGM-65H Maverick"),
            ("agm65k", "AGM-65K Maverick"),
            ("agm88c", "AGM-88C HARM"),
            ("agm122", "AGM-122 Sidearm"),
            ("agm154a", "AGM-154A JSOW"),
            ("agm154c", "AGM-154C JSOW"),
            ("gau8", "GAU-8/A 30 mm"),
            ("gau12", "GAU-12/U 25 mm"),
            ("mk12gun", "Mk 12 20 mm"),
            ("defa553", "DEFA 553 30 mm"),
            ("m39", "M39A2 20 mm"),
            ("hydra70", "Hydra 70 2.75\" rockets"),
            ("ffar275", "2.75\" FFAR rockets (LAU-3/A)"),
            ("zuni", "Zuni 5\" rockets (LAU-10)"),
            ("sneb68", "SNEB 68 mm rockets"),
        ];
        let mut have: Vec<(String, String)> = reference().get_all_weapons().into_iter().map(|w| (w.id, w.name)).collect();
        have.sort();
        let mut want: Vec<(String, String)> = expected.iter().map(|(id, name)| (id.to_string(), name.to_string())).collect();
        want.sort();
        assert_eq!(have, want, "a weapon was added, removed or renamed: update this list on purpose");
    }

    /// A row nobody carries is never offered, never loaded from a link and
    /// invisible to the picker's filter.
    #[test]
    fn every_weapon_row_is_carried_by_at_least_one_aircraft() {
        for w in reference().get_all_weapons() {
            assert!(!w.carried_by.is_empty(), "{} ({}) is carried by no aircraft", w.id, w.name);
        }
    }

    /// What the F-16C is offered today, before the picker filters bombs and
    /// missiles by aircraft: all 18 bomb and missile rows that existed before
    /// reference DB v5. The filter must not take any of them away, the Mk-82 AIR
    /// and Snakeye included (the F-16C had no row for those two until v5).
    #[test]
    fn the_f16c_keeps_every_bomb_and_missile_it_is_offered_today() {
        let offered_before = [
            "mk82", "mk82air", "mk82se", "mk84", "gbu10", "gbu12", "gbu24", "gbu31", "gbu38", "cbu87", "cbu97",
            "agm65d", "agm65g", "agm65h", "agm65k", "agm88c", "agm154a", "agm154c",
        ];
        let carried: Vec<String> = reference().get_weapons_for_aircraft("f16c").into_iter().map(|w| w.id).collect();
        for id in offered_before {
            assert!(carried.iter().any(|c| c == id), "the F-16C no longer carries {id}");
        }
    }

    /// Which aircraft carries what, whole, for all ten. Bombs, missiles and the
    /// Harrier's gun pod were checked against the module manuals and Chuck's
    /// Guides on 2026-10-01; the guns and rockets were already there. Left out on
    /// purpose, because the DCS module does not carry them: the F/A-18C's AGM-65G,
    /// the A-4E-C's Mk-82 AIR, the Mirage F1's Mk-82 Snakeye and Mk-84.
    #[test]
    fn what_each_aircraft_carries_is_pinned() {
        let table: &[(&str, &[&str])] = &[
            (
                "f16c",
                &[
                    "mk82", "mk82air", "mk82se", "mk84", "gbu10", "gbu12", "gbu24", "gbu31", "gbu38", "cbu87", "cbu97",
                    "agm65d", "agm65g", "agm65h", "agm65k", "agm88c", "agm154a", "agm154c",
                ],
            ),
            (
                "f18c",
                &[
                    "mk82", "mk82se", "mk84", "gbu10", "gbu12", "gbu16", "gbu24", "gbu31", "gbu38", "agm65f", "agm88c",
                    "agm154a", "agm154c",
                ],
            ),
            (
                "a10c",
                &[
                    "mk82", "mk82air", "mk84", "gbu10", "gbu12", "gbu31", "gbu38", "cbu87", "cbu97", "agm65d", "agm65g",
                    "agm65h", "agm65k", "gau8", "hydra70",
                ],
            ),
            (
                "f15e",
                &["mk82", "mk82air", "mk82se", "mk84", "gbu10", "gbu12", "gbu24", "gbu31", "gbu38", "cbu87", "cbu97"],
            ),
            (
                "f4e",
                &[
                    "mk82", "mk82air", "mk82se", "mk84", "gbu10", "gbu12", "gbu24", "cbu87", "agm65d", "agm65g", "hydra70",
                    "ffar275", "zuni",
                ],
            ),
            ("a4ec", &["mk82", "mk82se", "mk84", "mk12gun", "ffar275", "zuni"]),
            ("f5e", &["mk82", "mk82se", "mk84", "m39", "hydra70"]),
            ("f14", &["mk82", "mk82air", "mk82se", "mk84", "gbu10", "gbu12", "gbu16", "gbu24"]),
            ("f1", &["mk82", "gbu10", "gbu12", "gbu16", "defa553", "sneb68"]),
            ("av8b", &["mk82", "mk82air", "mk82se", "gbu12", "gbu16", "gbu38", "agm65f", "agm122", "gau12"]),
        ];
        let aircraft: HashSet<String> = reference().get_all_aircraft().into_iter().map(|a| a.id).collect();
        let pinned: HashSet<String> = table.iter().map(|(id, _)| id.to_string()).collect();
        assert_eq!(aircraft, pinned, "an aircraft is missing from this table, or the table names one that is gone");
        for (aircraft_id, ids) in table {
            let mut carried: Vec<String> =
                reference().get_weapons_for_aircraft(aircraft_id).into_iter().map(|w| w.id).collect();
            carried.sort();
            let mut want: Vec<String> = ids.iter().map(|s| s.to_string()).collect();
            want.sort();
            assert_eq!(carried, want, "{aircraft_id} carries a different set of weapons than pinned");
        }
    }

    #[test]
    fn queries_keep_the_old_sql_orderings() {
        let all = reference().get_all_threats();
        let keys: Vec<(&str, &str)> = all.iter().map(|t| (t.threat_type.as_str(), t.name.as_str())).collect();
        assert!(keys.windows(2).all(|w| w[0] <= w[1]), "threats sort by (type, name)");
        let weapons = reference().get_all_weapons();
        let keys: Vec<(&str, &str)> = weapons.iter().map(|w| (w.category.as_str(), w.name.as_str())).collect();
        assert!(keys.windows(2).all(|w| w[0] <= w[1]), "weapons sort by (category, name)");
        let aircraft = reference().get_all_aircraft();
        assert!(aircraft.windows(2).all(|w| w[0].name <= w[1].name), "aircraft sort by name");
    }

    #[test]
    fn test_get_threat_by_dcs_name() {
        // Exact match
        let threat = reference().get_threat_by_dcs_name("Buk").expect("Should find Buk by dcs_unit_name");
        assert_eq!(threat.id, "sa11");

        // Case insensitivity
        assert!(reference().get_threat_by_dcs_name("buk").is_some(), "Should find buk case-insensitively");
        assert!(reference().get_threat_by_dcs_name("Bu").is_none(), "exact, not a prefix");
    }

    /// The reference data and the DCS unit-name rules are two tables that
    /// have to agree, and they had silently drifted: eight systems (Gepard,
    /// Roland, Hawk, Patriot, NASAMS, Rapier, Strela-10, P-19) were named by
    /// the rules with no row here, so they imported as Unknown and the frontend
    /// dropped them. Discipline did not prevent that. This does.
    #[test]
    fn every_mapping_rule_resolves_to_a_reference_row() {
        let missing: Vec<&str> = crate::parsers::threat_mapping::DCS_THREAT_RULES
            .iter()
            .filter(|(_, normalized)| reference().get_threat_by_dcs_name(normalized).is_none())
            .map(|(pattern, _)| *pattern)
            .collect();
        assert!(
            missing.is_empty(),
            "these DCS_THREAT_RULES patterns name a system with no threat_systems row: {missing:?}"
        );
    }

    /// Every ground unit the real NTTR Red Flag mission carries that is a
    /// threat, in DCS's exact spelling, must reach a named row. Before DB v3
    /// the S-200 site, the Strela-10s, the ZU-23 trucks and the P-19s all fell
    /// out here -- and `RPC_5N62V`, the Square Pair that does the shooting, was
    /// not even flagged as a threat.
    #[test]
    fn every_threat_unit_in_the_nttr_mission_resolves_to_a_row() {
        use crate::parsers::threat_mapping::normalize_dcs_unit_name;
        let units = [
            "S_75M_Volhov", "SNR_75V",
            "5p73 s-125 ln", "snr s-125 tr", "p-19 s-125 sr",
            "Kub 2P25 ln", "Kub 1S91 str",
            "S-300PS 5P85D ln", "S-300PS 5P85C ln", "S-300PS 40B6M tr",
            "S-300PS 40B6MD sr", "S-300PS 64H6E sr", "S-300PS 54K6 cp",
            "SA-11 Buk LN 9A310M1", "SA-11 Buk SR 9S18M1", "SA-11 Buk CC 9S470M1",
            "Tor 9A331",
            "S-200_Launcher", "RPC_5N62V", "RLS_19J6",
            "Strela-10M3",
            "Ural-375 ZU-23", "Ural-375 ZU-23 Insurgent",
            "ZSU-23-4 Shilka", "ZSU_57_2",
            "SA-18 Igla-S manpad", "SA-18 Igla-S comm",
        ];
        let unresolved: Vec<&str> = units
            .into_iter()
            .filter(|unit| normalize_dcs_unit_name(unit).and_then(|n| reference().get_threat_by_dcs_name(n)).is_none())
            .collect();
        assert!(
            unresolved.is_empty(),
            "these real NTTR threat units do not reach a reference row: {unresolved:?}"
        );
    }

    #[test]
    fn test_search_threats_by_dcs_name() {
        // Search by partial name
        assert!(!reference().search_threats_by_dcs_name("SA-").is_empty(), "Should find threats with SA- prefix");
        // Search by partial NATO designation
        assert!(!reference().search_threats_by_dcs_name("guideline").is_empty(), "Should find SA-2 Guideline");
    }
}
