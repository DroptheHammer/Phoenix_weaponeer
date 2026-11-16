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
//!   GAU-12/U rows held a name, a class and a guidance type only when added:
//!   weight 0 and every release and frag field null, with `notes` saying so (the
//!   last bullet below says what they carry now). The planner
//!   flags an attack that uses a bomb with no frag floor or a missile with no
//!   minimum release (`runAttackChecks`), since nothing else would stop it
//!   releasing too low.
//! - **Cluster bombs and the SAMP bombs** (added 2026-10-03) are the stores the
//!   v5 lists left without a row: the Mk-20 Rockeye, CBU-99, CBU-52B and BLG-66
//!   Belouga, and the SAMP-125, -250 and -400 low-drag bombs and the -250 and
//!   -400 high-drag ones. Like the GBU-16 row they held a name, a class and a
//!   guidance type only when added (weight 0, every release and frag field null,
//!   `notes` saying so; see the last bullet), and their `aircraft_weapons` rows
//!   use station 0 and a quantity
//!   of 1. A bomb's class comes from its name (`weaponClassOf`), so the whole
//!   word "HD" in a SAMP name is what makes it high-drag. Who carries what comes
//!   from each DCS module's own pylon table as published in the public pydcs
//!   library (`dcs/planes.py`), and for the A-4E-C from the community mod's
//!   aircraft definition, checked 2026-10-03.
//! - **The bombs the pylon tables carry that still had no row** (added
//!   2026-11-13): the Mk-81 and Mk-81 Snakeye, Mk-83 and Mk-83 AIR, BR-250 and
//!   BR-500, the BLU-107 Durandal, the CBU-103 and CBU-105, the BL-755, and the
//!   CBU-1/A, CBU-2/A and CBU-2B/A. Same shape as the rows above: a name, a
//!   class and a guidance type, weight 0, every number null, `notes` saying
//!   "Name only" (when added; see the last bullet), station 0 and a quantity of
//!   1. The CBU-103 and CBU-105 ride a
//!   WCMD tail kit, which is an inertial (INS) kit and not a seeker, so their
//!   guidance is none. The Durandal is a parachute-retarded bomb with a
//!   booster, so it is filed as a high-drag bomb and its name says "retarded"
//!   (`weaponClassOf` and the Rust `weapon_is_of_class` both read that word).
//!   Who carries what is read from the same public pydcs pylon tables
//!   (`dcs/planes.py` at commit 5ddcc63a2dcd661e16b14f7aa43219b93044855d,
//!   release 1.0.0), and for the A-4E-C from the community mod's aircraft file
//!   (`A-4E-C/A-4E-C.lua`) and its weapon definitions
//!   (`A-4E-C/Weapons/A4E_Weapons.lua`). The BL-755 is an F-4E store, not an
//!   A-4E-C one.
//! - **Numbers for the name-only rows** (added 2026-11-13, each approved by the
//!   user, each with its source in the row's `notes`). The 26 rows above held a
//!   name and nothing else; they now carry a weight, and a few carry more:
//!   - *Weight:* DCS's own value from the public pydcs library's
//!     `dcs/weapons_data.py` at commit 5ddcc63a2dcd661e16b14f7aa43219b93044855d
//!     (kg, converted to lb and rounded), except the Mk-81 Snakeye (250 lb, the
//!     A-4E-C mod's `A4E_Weapons.lua` at 34c1ef4: `mass = 250 * POUNDS_TO_KG`) and
//!     the AGM-65F (669 lb, the missile alone: USN training system plan
//!     N88-NTSP-A-50-8501B/D, "Weight (Prelaunch) 669.0 pounds", via
//!     globalsecurity.org; DCS lists it only with its LAU-117 launcher).
//!   - *A frag floor, which is what clears the "no data on file" caution:* the
//!     Mk-83 alone, 1,300 ft (USAF T.O. 1F-4C-34-1-1, F-4C/D/E Aircrew Weapons
//!     Delivery Manual, Fig 6-14 sheet 2, level delivery, low drag, worst row at
//!     360 KTAS, contact burst; it is a level-release figure). The Mk-20 Rockeye
//!     and CBU-99 get none: T.O. 1-1M-34 Fig 6-1 gives 1,380 ft as the maximum
//!     fragment altitude of an intact Rockeye cluster at sea level, which was
//!     considered as a floor and rejected on 2026-11-13, because a release below
//!     a floor is an error that blocks saving and it would block a normal 500 ft
//!     laydown. The figure is in their `notes` for reference only.
//!   - *Envelope extras, which do not clear the caution* (the floor the caution
//!     keys on is still empty): BLU-107 minimum release 250 ft and maximum
//!     release speed 620 (T.O. 1-1M-34 Sec I, "level delivery at 250 feet AGL and
//!     for release speeds up to 620 KCAS"); CBU-105 200 to 20,000 ft and 650 kt
//!     and CBU-103 40,000 ft (globalsecurity.org's CBU-105 page; the 200 to
//!     20,000 ft and 650 kt are stated there for the CBU-97, before the WCMD kit).
//!   Every other field is still null, and no row has `dcs_weapon_name`. A bomb or
//!   cluster with no frag floor, and a missile with no minimum release, still get
//!   the "no data on file" caution; their `notes` say so in the same words.
//!   The GBU-16 gets a weight only (borrowing the Mk-83's floor was declined).
//! - **Blast radius** (the three `blast_radius_*` fields, added 2026-11-15): the
//!   distance from a burst within which DCS damages an aircraft, what that
//!   distance means (`any_damage` or `destroyed`), and where it comes from.
//!   A row is empty until a source is cited, and a radius never goes in
//!   without its meaning, its source kind and a sentence in `notes` that names
//!   the source (tests below). Eight rows carry one since 2026-11-16, all from
//!   one community test (a helicopter, judged by eye, DCS version not stated):
//!   the Mk-82, Mk-83 and Mk-84 it measured, and the five whose warhead is the
//!   same one in the game's files. A key missing from the data file reads as
//!   `None`, so a row only needs the keys once it has a value. The older
//!   `frag_*_radius_ft` seed numbers cite no source and are not what a blast
//!   test should read.

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
    /// The distance from a burst within which DCS damages an aircraft, in feet.
    /// Null unless a source is cited (eight rows so far): the frag radii above
    /// cite none, so they are not a stand-in for it.
    pub blast_radius_ft: Option<f64>,
    /// What that distance is: `any_damage` (past it a bomb of this kind did no
    /// visible damage) or `destroyed` (past it, it did not destroy the target).
    pub blast_radius_meaning: Option<String>,
    /// Where it comes from: `game_data`, `developer`, `scripting_doc`,
    /// `community_measurement`, `owner_test` or `estimate`. The row's `notes`
    /// says the same in words, with the address and what was seen.
    pub blast_radius_source: Option<String>,
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

    /// The 26 rows that were name-only until 2026-11-13 (the four from reference
    /// DB v5, the nine cluster and SAMP rows added 2026-10-03, and the thirteen
    /// bomb rows added 2026-11-13), and what each carries now. Every number in
    /// the table came from a source the user approved, and that source is in the
    /// row's `notes` (the last column is a marker that must still be there). A
    /// number that is not in `extras` must still be null: the planner must not be
    /// handed an invented one. Reworded, this is the test to change on purpose.
    ///
    /// `extras` are the non-null fields besides the weight, by field name.
    #[test]
    fn the_sourced_numbers_of_the_formerly_name_only_rows_are_pinned_by_id() {
        const PYDCS: &str = "pydcs weapons_data.py 5ddcc63";
        // (id, category, guidance, weight_lbs, extras, a source marker the notes must carry)
        let rows: &[(&str, &str, &str, f64, &[(&str, f64)], &str)] = &[
            ("gbu16", "bomb_guided", "laser", 1131.0, &[], PYDCS),
            ("agm65f", "missile_agm", "ir", 669.0, &[], "N88-NTSP-A-50-8501B/D"),
            ("agm122", "missile_agm", "radar", 194.0, &[], PYDCS),
            ("gau12", "gun", "none", 626.0, &[], PYDCS),
            ("mk20", "cluster", "none", 489.0, &[], PYDCS),
            ("cbu99", "cluster", "none", 489.0, &[], PYDCS),
            ("cbu52b", "cluster", "none", 539.0, &[], PYDCS),
            ("blg66", "cluster", "none", 661.0, &[], PYDCS),
            ("samp125", "bomb_unguided", "none", 265.0, &[], PYDCS),
            ("samp250", "bomb_unguided", "none", 540.0, &[], PYDCS),
            ("samp400", "bomb_unguided", "none", 794.0, &[], PYDCS),
            ("samp250hd", "bomb_unguided", "none", 593.0, &[], PYDCS),
            ("samp400hd", "bomb_unguided", "none", 871.0, &[], PYDCS),
            ("mk81", "bomb_unguided", "none", 260.0, &[], PYDCS),
            ("mk81se", "bomb_unguided", "none", 250.0, &[], "A4E_Weapons.lua 34c1ef4"),
            ("mk83", "bomb_unguided", "none", 1001.0, &[("frag_min_safe_alt_ft", 1300.0)], "T.O. 1F-4C-34-1-1"),
            ("mk83air", "bomb_unguided", "none", 1050.0, &[], PYDCS),
            ("br250", "bomb_unguided", "none", 551.0, &[], PYDCS),
            ("br500", "bomb_unguided", "none", 1102.0, &[], PYDCS),
            (
                "blu107",
                "bomb_unguided",
                "none",
                483.0,
                &[("min_release_alt_ft", 250.0), ("max_release_speed_ktas", 620.0)],
                "T.O. 1-1M-34 Sec I p.1-39",
            ),
            ("cbu103", "cluster", "none", 948.0, &[("max_release_alt_ft", 40000.0)], "globalsecurity.org/military/systems/munitions/cbu-105.htm"),
            (
                "cbu105",
                "cluster",
                "none",
                919.0,
                &[("min_release_alt_ft", 200.0), ("max_release_alt_ft", 20000.0), ("max_release_speed_ktas", 650.0)],
                "globalsecurity.org/military/systems/munitions/cbu-105.htm",
            ),
            ("bl755", "cluster", "none", 582.0, &[], PYDCS),
            ("cbu1a", "cluster", "none", 726.0, &[], PYDCS),
            ("cbu2a", "cluster", "none", 746.0, &[], PYDCS),
            ("cbu2ba", "cluster", "none", 844.0, &[], PYDCS),
        ];
        assert_eq!(rows.len(), 26, "the table is the 26 formerly name-only rows");
        for (id, category, guidance, weight, extras, source) in rows {
            let w = reference().get_weapon_by_id(id).unwrap_or_else(|| panic!("no weapon row {id}"));
            assert_eq!((w.category.as_str(), w.guidance.as_str()), (*category, *guidance), "{id}");
            assert_eq!(w.weight_lbs, *weight, "{id}: weight");
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
                let expected = extras.iter().find(|(f, _)| *f == field).map(|(_, v)| *v);
                assert_eq!(value, expected, "{id}.{field}: only the sourced numbers may be filled in");
            }
            // Every extra named in the table is a real field (a typo would otherwise be ignored).
            for (field, _) in *extras {
                assert!(numbers.iter().any(|(f, _)| f == field), "{id}: {field} is not a weapon field");
            }
            assert_eq!(w.dcs_weapon_name, None, "{id}: the internal name is for the CLSID follow-up");
            let notes = w.notes.as_deref().unwrap_or("");
            assert!(notes.contains("Weight:"), "{id}: notes must say where the weight comes from, not {notes:?}");
            assert!(notes.contains(source), "{id}: notes must cite {source}, not {notes:?}");
            assert!(!notes.contains("Name only"), "{id}: it is no longer a name-only row: {notes:?}");
        }
    }

    /// The "no data on file" caution keys on one field per class
    /// (`noDataNote` in `src/lib/attackChecks.ts`): a bomb or cluster needs
    /// `frag_min_safe_alt_ft`, a missile needs `min_release_alt_ft`, a gun never
    /// has one. The rows below still have no such figure, so the field must stay
    /// null (the caution stays) and the row's `notes` must say so in the
    /// planner's own words. The one row that did get a frag floor, the Mk-83, is
    /// the other half: the field is filled and the notes carry no "on file" claim.
    /// The Mk-20 Rockeye and CBU-99 are in the first group on purpose: a 1,380 ft
    /// fragment ceiling was considered as their floor and rejected on 2026-11-13,
    /// since a release below a floor is an error that blocks saving and it would
    /// block a normal 500 ft laydown. (`scripts/geo-check.ts` pins that laydown.)
    #[test]
    fn rows_without_a_caution_clearing_number_keep_it_null_and_say_so() {
        let bombs_without_floor = [
            "gbu16", "mk20", "cbu99", "cbu52b", "blg66", "samp125", "samp250", "samp400", "samp250hd", "samp400hd", "mk81", "mk81se",
            "mk83air", "br250", "br500", "blu107", "cbu103", "cbu105", "bl755", "cbu1a", "cbu2a", "cbu2ba",
        ];
        for id in bombs_without_floor {
            let w = reference().get_weapon_by_id(id).unwrap_or_else(|| panic!("no weapon row {id}"));
            assert_eq!(w.frag_min_safe_alt_ft, None, "{id}: a frag floor here would clear the caution; it needs a source first");
            let notes = w.notes.as_deref().unwrap_or("");
            assert!(notes.contains("No frag data on file"), "{id}: notes must say there is no frag data, not {notes:?}");
        }
        for id in ["agm65f", "agm122"] {
            let w = reference().get_weapon_by_id(id).unwrap_or_else(|| panic!("no weapon row {id}"));
            assert_eq!(w.min_release_alt_ft, None, "{id}: a minimum release here would clear the caution; it needs a source first");
            let notes = w.notes.as_deref().unwrap_or("");
            assert!(notes.contains("No release data on file"), "{id}: notes must say there is no release data, not {notes:?}");
        }
        // A gun has no caution to keep, but still has no release or frag figure.
        let gau12 = reference().get_weapon_by_id("gau12").unwrap();
        assert_eq!((gau12.min_release_alt_ft, gau12.frag_min_safe_alt_ft), (None, None));
        assert!(gau12.notes.as_deref().unwrap_or("").contains("No release or frag data on file"));

        let mk83 = reference().get_weapon_by_id("mk83").unwrap();
        assert_eq!(mk83.frag_min_safe_alt_ft, Some(1300.0));
        let notes = mk83.notes.as_deref().unwrap_or("");
        assert!(notes.contains("Frag min-safe"), "mk83: notes must say where the floor comes from, not {notes:?}");
        assert!(!notes.contains("on file"), "mk83: it has its floor, so it must not claim there is no data: {notes:?}");

        // The Rockeye and CBU-99 keep the 1,380 ft figure in their notes for reference, and say it is not a floor.
        for id in ["mk20", "cbu99"] {
            let notes = reference().get_weapon_by_id(id).unwrap().notes.unwrap_or_default();
            assert!(notes.contains("1,380 ft") && notes.contains("not used as a floor"), "{id}: {notes:?}");
        }
    }

    /// What a blast radius may mean, and the words each source kind must leave in
    /// a row's notes (compared in lower case). The notes carry the address and
    /// what was seen; these words are only the proof that a source is named.
    const BLAST_MEANINGS: [&str; 2] = ["any_damage", "destroyed"];
    const BLAST_SOURCES: [(&str, &str); 6] = [
        ("game_data", "game data"),
        ("developer", "developer"),
        ("scripting_doc", "scripting"),
        ("community_measurement", "community"),
        ("owner_test", "own test"),
        ("estimate", "estimate"),
    ];

    /// The rows that carry a blast radius on purpose. A value goes into
    /// `reference.json` only after it has been shown with its source and
    /// approved, so this list changes in the same edit. Eight rows are
    /// approved (2026-11-16): the three bombs the community test named, and five
    /// rows whose warhead is the same one in the game's files.
    const APPROVED_BLAST_IDS: &[&str] = &["gbu31", "gbu38", "mk82", "mk82air", "mk82se", "mk83", "mk83air", "mk84"];

    /// The approved figures: id, feet, what the figure means, the bomb the
    /// community test actually named, and whether the row only takes that
    /// bomb's figure because its warhead is the same one in the game's files
    /// (true for five rows; the three bombs the test measured are false).
    const APPROVED_BLAST_FIGURES: &[(&str, f64, &str, &str, bool)] = &[
        ("mk82", 250.0, "any_damage", "Mk-82", false),
        ("mk83", 250.0, "any_damage", "Mk-83", false),
        ("mk84", 360.0, "destroyed", "Mk-84", false),
        ("mk82air", 250.0, "any_damage", "Mk-82", true),
        ("mk82se", 250.0, "any_damage", "Mk-82", true),
        ("gbu38", 250.0, "any_damage", "Mk-82", true),
        ("mk83air", 250.0, "any_damage", "Mk-83", true),
        ("gbu31", 360.0, "destroyed", "Mk-84", true),
    ];

    /// A weapon row built the way the data file writes it: `extra` is more JSON
    /// keys. Anything left out reads as `None`, as it does for every real row.
    fn weapon_from(extra: &str) -> Weapon {
        let json = format!(r#"{{"id":"x","name":"X","category":"bomb_unguided","weight_lbs":500.0,"guidance":"none"{extra}}}"#);
        serde_json::from_str(&json).unwrap_or_else(|e| panic!("{json}: {e}"))
    }

    /// Why a row's blast fields are wrong, or `None` when they are fine: all
    /// three or none, a radius above zero, a known meaning and source kind, and
    /// notes that say "blast radius" and name the source.
    fn blast_problem(w: &Weapon) -> Option<String> {
        let Some(radius) = w.blast_radius_ft else {
            return match (&w.blast_radius_meaning, &w.blast_radius_source) {
                (None, None) => None,
                _ => Some("a meaning or a source with no radius".to_string()),
            };
        };
        if !radius.is_finite() || radius <= 0.0 {
            return Some(format!("the radius {radius} is not a number of feet above zero"));
        }
        let Some(meaning) = w.blast_radius_meaning.as_deref() else {
            return Some("a radius with no meaning".to_string());
        };
        if !BLAST_MEANINGS.contains(&meaning) {
            return Some(format!("unknown meaning {meaning:?}"));
        }
        let Some(source) = w.blast_radius_source.as_deref() else {
            return Some("a radius with no source".to_string());
        };
        let Some((_, words)) = BLAST_SOURCES.iter().find(|(kind, _)| *kind == source) else {
            return Some(format!("unknown source {source:?}"));
        };
        let notes = w.notes.as_deref().unwrap_or("").to_ascii_lowercase();
        if !notes.contains("blast radius") || !notes.contains(*words) {
            return Some(format!("the notes must say \"blast radius\" and name the source ({words:?}), not {notes:?}"));
        }
        None
    }

    /// The blast fields are read off the row under their own names, and a row
    /// without the keys (every row in the data file today) is "no radius" and goes
    /// out as null: the TypeScript row type reads these snake_case names as they
    /// are.
    #[test]
    fn the_blast_fields_read_and_write_under_their_own_names() {
        let w = weapon_from(r#","blast_radius_ft":250.0,"blast_radius_meaning":"any_damage","blast_radius_source":"community_measurement""#);
        assert_eq!(w.blast_radius_ft, Some(250.0));
        assert_eq!(w.blast_radius_meaning.as_deref(), Some("any_damage"));
        assert_eq!(w.blast_radius_source.as_deref(), Some("community_measurement"));
        let out = serde_json::to_value(&w).unwrap();
        assert_eq!(out["blast_radius_ft"], 250.0);
        assert_eq!(out["blast_radius_meaning"], "any_damage");
        assert_eq!(out["blast_radius_source"], "community_measurement");

        let bare = weapon_from("");
        assert_eq!((bare.blast_radius_ft, bare.blast_radius_meaning.as_deref(), bare.blast_radius_source.as_deref()), (None, None, None));
        let out = serde_json::to_value(&bare).unwrap();
        for key in ["blast_radius_ft", "blast_radius_meaning", "blast_radius_source"] {
            assert_eq!(out.get(key), Some(&serde_json::Value::Null), "{key} must go out as null, not be left out");
        }
    }

    /// The rule that "a radius has its source", shown to be able to fail: each
    /// hand-built row below breaks it one way and must be caught, and the two
    /// that are fine must not be.
    #[test]
    fn a_blast_radius_without_its_source_is_caught() {
        const NOTES: &str = r#","notes":"Blast radius 250 ft: a community test, judged by eye.""#;
        const ALL: &str = r#","blast_radius_ft":250.0,"blast_radius_meaning":"any_damage","blast_radius_source":"community_measurement""#;
        let fine = [
            ("radius, meaning, source and notes", format!("{ALL}{NOTES}")),
            ("no radius at all", String::new()),
            // The old seed numbers are a different thing: a row with only those has no blast radius.
            ("only the old seed radii", r#","frag_effective_radius_ft":400.0,"frag_lethal_radius_ft":150.0"#.to_string()),
        ];
        for (what, extra) in &fine {
            assert_eq!(blast_problem(&weapon_from(extra)), None, "{what}");
        }
        let broken = [
            ("no source", format!(r#","blast_radius_ft":250.0,"blast_radius_meaning":"any_damage"{NOTES}"#)),
            ("a null source", format!(r#","blast_radius_ft":250.0,"blast_radius_meaning":"any_damage","blast_radius_source":null{NOTES}"#)),
            ("an unknown source", format!(r#","blast_radius_ft":250.0,"blast_radius_meaning":"any_damage","blast_radius_source":"hunch"{NOTES}"#)),
            ("no meaning", format!(r#","blast_radius_ft":250.0,"blast_radius_source":"community_measurement"{NOTES}"#)),
            ("an unknown meaning", format!(r#","blast_radius_ft":250.0,"blast_radius_meaning":"lethal","blast_radius_source":"community_measurement"{NOTES}"#)),
            ("a radius of zero", format!(r#","blast_radius_ft":0.0,"blast_radius_meaning":"any_damage","blast_radius_source":"community_measurement"{NOTES}"#)),
            ("a negative radius", format!(r#","blast_radius_ft":-5.0,"blast_radius_meaning":"any_damage","blast_radius_source":"community_measurement"{NOTES}"#)),
            ("no notes", ALL.to_string()),
            ("notes that do not name the source", format!(r#"{ALL},"notes":"Blast radius 250 ft.""#)),
            ("notes that do not say what the number is", format!(r#"{ALL},"notes":"A community test.""#)),
            ("a meaning with no radius", r#","blast_radius_meaning":"any_damage""#.to_string()),
            ("a source with no radius", r#","blast_radius_source":"community_measurement""#.to_string()),
        ];
        for (what, extra) in &broken {
            assert!(blast_problem(&weapon_from(extra)).is_some(), "{what} was not caught");
        }
    }

    /// Every real row's blast fields follow that rule, and the rows that carry a
    /// radius are exactly the approved ones (`APPROVED_BLAST_IDS`), so no other
    /// may appear until someone has approved the value with its source and says
    /// so here.
    #[test]
    fn every_blast_radius_in_the_table_has_its_source_and_is_approved() {
        let mut with_radius: Vec<String> = Vec::new();
        for w in reference().get_all_weapons() {
            if let Some(problem) = blast_problem(&w) {
                panic!("{} ({}): {problem}", w.id, w.name);
            }
            if w.blast_radius_ft.is_some() {
                with_radius.push(w.id);
            }
        }
        with_radius.sort();
        let mut approved: Vec<String> = APPROVED_BLAST_IDS.iter().map(|id| id.to_string()).collect();
        approved.sort();
        assert_eq!(with_radius, approved, "a blast radius was added or removed: change the approved list on purpose, after the value was approved");
    }

    /// The approved figures, row by row: the feet, what they mean, the community
    /// source, and a notes sentence that says what they rest on (the public
    /// article by title and date, a helicopter judged by eye, no DCS version, not
    /// a game figure, and what the test saw). The five rows that take another
    /// bomb's figure say so and name that bomb; the three it measured do not
    /// claim a likeness. The Mk-83 row must still carry no "on file" claim.
    ///
    /// Each of these was seen to fail (2026-11-16): the Mk-84's radius changed to
    /// 365.0 in the data file ("mk84: feet, left Some(365.0), right Some(360.0)"),
    /// the Mk-82 AIR's notes without the same-warhead sentence, "on file" put on
    /// the end of the Mk-83's notes, the Snakeye's three fields taken out, and
    /// `gbu31` taken out of `APPROVED_BLAST_IDS` (this test and the one above
    /// both fail on the list).
    #[test]
    fn the_approved_blast_radii_are_pinned_with_what_they_rest_on() {
        let mut ids: Vec<&str> = APPROVED_BLAST_FIGURES.iter().map(|f| f.0).collect();
        ids.sort();
        assert_eq!(ids, APPROVED_BLAST_IDS, "the figures table and the approved list name different rows");
        for (id, feet, meaning, bomb, inherited) in APPROVED_BLAST_FIGURES {
            let w = reference().get_weapon_by_id(id).unwrap_or_else(|| panic!("no weapon row {id}"));
            assert_eq!(w.blast_radius_ft, Some(*feet), "{id}: feet");
            assert_eq!(w.blast_radius_meaning.as_deref(), Some(*meaning), "{id}: meaning");
            assert_eq!(w.blast_radius_source.as_deref(), Some("community_measurement"), "{id}: source");
            let notes = w.notes.as_deref().unwrap_or("");
            for phrase in ["Anatomy of explosions", "flyandwire.com", "2026-07-11", "a helicopter, judged by eye, DCS version not stated, not a game figure"] {
                assert!(notes.contains(phrase), "{id}: notes must say {phrase:?}, not {notes:?}");
            }
            let saw = match *bomb {
                "Mk-82" => "minor damage at 240 ft and none at 250 ft",
                "Mk-83" => "limited damage at 240 ft and none at 250 ft",
                "Mk-84" => "destroyed at 350 ft and not at 365 ft",
                other => panic!("{id}: the test named no {other}"),
            };
            assert!(notes.contains(saw), "{id}: notes must say what the test saw ({saw:?}), not {notes:?}");
            let same_warhead = format!("same warhead as the {bomb} in the game's files; the test named the {bomb} only");
            assert_eq!(notes.contains(&same_warhead), *inherited, "{id}: notes {} {same_warhead:?}", if *inherited { "must say" } else { "must not say" });
        }
        let mk83 = reference().get_weapon_by_id("mk83").unwrap();
        assert!(!mk83.notes.as_deref().unwrap_or("").contains("on file"), "mk83 has its numbers, so its notes make no \"on file\" claim");
    }

    /// Saved missions and the planner's loadout match a weapon on its name, so a
    /// reworded row would quietly orphan every attack that used it. Pinned by id,
    /// all 52 rows. The SAMP names are deliberate too: a bomb's drag class comes
    /// from its name, so the whole word "HD" is what makes a SAMP high-drag, and
    /// so do "AIR", "Snakeye" and "retarded" for the Mk-83 AIR, the Mk-81 Snakeye
    /// and the Durandal.
    #[test]
    fn the_fifty_two_weapon_names_are_pinned_by_id() {
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
            ("mk20", "Mk-20 Rockeye"),
            ("cbu99", "CBU-99"),
            ("cbu52b", "CBU-52B"),
            ("blg66", "BLG-66 Belouga"),
            ("samp125", "SAMP-125 LD"),
            ("samp250", "SAMP-250 LD"),
            ("samp400", "SAMP-400 LD"),
            ("samp250hd", "SAMP-250 HD"),
            ("samp400hd", "SAMP-400 HD"),
            ("mk81", "Mk-81 LDGP"),
            ("mk81se", "Mk-81 Snakeye"),
            ("mk83", "Mk-83 LDGP"),
            ("mk83air", "Mk-83 AIR"),
            ("br250", "BR-250 LD"),
            ("br500", "BR-500 LD"),
            ("blu107", "BLU-107 Durandal (retarded)"),
            ("cbu103", "CBU-103 CEM"),
            ("cbu105", "CBU-105 SFW"),
            ("bl755", "BL-755"),
            ("cbu1a", "CBU-1/A"),
            ("cbu2a", "CBU-2/A"),
            ("cbu2ba", "CBU-2B/A"),
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
    ///
    /// The cluster stores and the SAMP bombs were added on 2026-10-03 from each
    /// DCS module's own pylon table as published in the public pydcs library
    /// (`dcs/planes.py`), and for the A-4E-C from the community mod's aircraft
    /// definition. They are what gives the F/A-18C, A-4E-C, F-5E, F-14, Mirage F1
    /// and AV-8B a cluster weapon of their own, and the Mirage F1 a high-drag bomb.
    ///
    /// The Mk-81, Mk-83, BR-250, BR-500, Durandal, CBU-103, CBU-105, BL-755 and
    /// the CBU-1/A, CBU-2/A and CBU-2B/A were added on 2026-11-13 from the same
    /// pydcs tables (`dcs/planes.py` at commit
    /// 5ddcc63a2dcd661e16b14f7aa43219b93044855d) and the A-4E-C mod's files.
    /// Each pair was checked against a store name in the module's own table: the
    /// F-4E carries the CBU-1/A as well as the CBU-2/A and CBU-2B/A, and the
    /// BL-755 is an F-4E store, not the A-4E-C's.
    #[test]
    fn what_each_aircraft_carries_is_pinned() {
        let table: &[(&str, &[&str])] = &[
            (
                "f16c",
                &[
                    "mk82", "mk82air", "mk82se", "mk84", "gbu10", "gbu12", "gbu24", "gbu31", "gbu38", "cbu87", "cbu97",
                    "cbu103", "cbu105", "agm65d", "agm65g", "agm65h", "agm65k", "agm88c", "agm154a", "agm154c",
                ],
            ),
            (
                "f18c",
                &[
                    "mk82", "mk82se", "mk83", "mk83air", "mk84", "gbu10", "gbu12", "gbu16", "gbu24", "gbu31", "gbu38",
                    "mk20", "cbu99", "agm65f", "agm88c", "agm154a", "agm154c",
                ],
            ),
            (
                "a10c",
                &[
                    "mk82", "mk82air", "mk84", "gbu10", "gbu12", "gbu31", "gbu38", "cbu87", "cbu97", "cbu103", "cbu105",
                    "agm65d", "agm65g", "agm65h", "agm65k", "gau8", "hydra70",
                ],
            ),
            (
                "f15e",
                &[
                    "mk82", "mk82air", "mk82se", "mk84", "blu107", "gbu10", "gbu12", "gbu24", "gbu31", "gbu38", "cbu87",
                    "cbu97", "mk20",
                ],
            ),
            (
                "f4e",
                &[
                    "mk81", "mk82", "mk82air", "mk82se", "mk83", "mk84", "blu107", "gbu10", "gbu12", "gbu24", "cbu87",
                    "mk20", "cbu52b", "bl755", "cbu1a", "cbu2a", "cbu2ba", "samp250", "samp250hd", "agm65d", "agm65g",
                    "hydra70", "ffar275", "zuni",
                ],
            ),
            (
                "a4ec",
                &[
                    "mk81", "mk81se", "mk82", "mk82se", "mk83", "mk84", "mk20", "cbu1a", "cbu2a", "cbu2ba", "mk12gun",
                    "ffar275", "zuni",
                ],
            ),
            ("f5e", &["mk82", "mk82se", "mk83", "mk84", "cbu52b", "m39", "hydra70"]),
            (
                "f14",
                &[
                    "mk81", "mk82", "mk82air", "mk82se", "mk83", "mk83air", "mk84", "gbu10", "gbu12", "gbu16", "gbu24",
                    "mk20", "cbu99",
                ],
            ),
            (
                "f1",
                &[
                    "mk82", "mk83", "br250", "br500", "blu107", "gbu10", "gbu12", "gbu16", "blg66", "samp125", "samp250",
                    "samp400", "samp250hd", "samp400hd", "defa553", "sneb68",
                ],
            ),
            (
                "av8b",
                &[
                    "mk81", "mk82", "mk82air", "mk82se", "mk83", "gbu12", "gbu16", "gbu38", "mk20", "cbu99", "agm65f",
                    "agm122", "gau12",
                ],
            ),
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
