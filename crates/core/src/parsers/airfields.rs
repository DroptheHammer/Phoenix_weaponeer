//! DCS airfield names, by theater and `airdromeId`.
//!
//! A route point that starts or ends at an airfield carries that airfield's
//! numeric id, numbered per map. The table in `airfields_data.rs` is generated
//! from pydcs, which reads ids, names and positions out of DCS itself. See
//! `scripts/gen-airfields.mjs` for the pinned commit, and re-run
//! `npm run gen-airfields` when a map gains airfields.
//!
//! Only Sinai and Nevada are checked against real missions (the fixture test
//! below). Iraq and Afghanistan have no pydcs table, so their points stay
//! unnamed.

use super::airfields_data::AIRFIELDS;

/// One airfield on one theater, with its DCS map position in metres.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Airfield {
    pub id: i64,
    pub name: &'static str,
    pub x: f64,
    pub y: f64,
}

/// The airfield `id` refers to on `theater` (our normalized theater name).
///
/// `None` for id 0 (DCS's "no airfield"), an unknown id, or a theater with no
/// table.
pub fn airfield(theater: &str, id: i64) -> Option<&'static Airfield> {
    if id <= 0 {
        return None;
    }
    theater_airfields(theater)?.iter().find(|a| a.id == id)
}

fn theater_airfields(theater: &str) -> Option<&'static [Airfield]> {
    AIRFIELDS
        .iter()
        .find(|(name, _)| *name == theater)
        .map(|(_, airfields)| *airfields)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parsers::{all_theater_params, parse_fragorders_json};

    #[test]
    fn lookups_that_have_no_answer_return_none() {
        assert_eq!(airfield("nevada", 0), None, "0 is DCS's 'no airfield'");
        assert_eq!(airfield("nevada", 9_999), None);
        assert_eq!(airfield("iraq", 1), None, "Iraq has no pydcs table");
        assert_eq!(airfield("not_a_map", 4), None);
    }

    #[test]
    fn known_ids_resolve_to_their_airfields() {
        assert_eq!(airfield("nevada", 4).map(|a| a.name), Some("Nellis"));
        assert_eq!(airfield("sinai", 50).map(|a| a.name), Some("Ramat David"));
    }

    /// Guards the generator's theater mapping: every map the app knows has a
    /// table except the two pydcs lacks, and no table is filed under a name
    /// the app would never look up.
    #[test]
    fn every_theater_but_iraq_and_afghanistan_has_a_table() {
        for params in all_theater_params() {
            let expected = !matches!(params.normalized_name, "iraq" | "afghanistan");
            let has_table = theater_airfields(params.normalized_name).is_some_and(|t| !t.is_empty());
            assert_eq!(has_table, expected, "table for {}", params.normalized_name);
        }
        for (name, _) in AIRFIELDS {
            assert!(
                all_theater_params().iter().any(|p| p.normalized_name == *name),
                "table filed under unknown theater {name:?}"
            );
        }
    }

    /// The check that caught "Ramon" being wrong, kept as a guard against a
    /// future regeneration mislabelling airfields: in real missions, every
    /// flight that starts at an airfield starts within 5 km of the table's
    /// position for that id, and that id is the nearest airfield.
    #[test]
    fn fixture_airfield_ids_sit_at_their_airfields() {
        let fixtures = [
            ("sinai_m01_v7", crate::private_fixture!("sinai_m01_v7.json"), "sinai"),
            ("nttr_redflag_viper1", crate::private_fixture!("nttr_redflag_viper1.json"), "nevada"),
        ];
        for (file, json, theater) in fixtures {
            let mission = parse_fragorders_json(json).expect("fixture parses");
            let table = theater_airfields(theater).expect("theater has a table");
            let mut checked = 0;

            for side in [&mission.coalition.blue, &mission.coalition.red].into_iter().flatten() {
                for country in &side.country {
                    for assets in [&country.plane, &country.helicopter].into_iter().flatten() {
                        for group in &assets.group {
                            let Some(point) = group.route.as_ref().and_then(|r| r.points.first()) else {
                                continue;
                            };
                            let Some(id) = point.airdrome_id.filter(|&id| id > 0) else {
                                continue;
                            };
                            let group_name = group.name.as_deref().unwrap_or("?");
                            let distance = |a: &Airfield| (a.x - point.x).hypot(a.y - point.y);

                            let named = airfield(theater, id)
                                .unwrap_or_else(|| panic!("{file} {group_name}: id {id} not in the table"));
                            let nearest = table
                                .iter()
                                .min_by(|a, b| distance(a).total_cmp(&distance(b)))
                                .expect("table is not empty");

                            assert!(
                                distance(named) < 5_000.0,
                                "{file} {group_name}: id {id} is {} but sits {:.0} m from it",
                                named.name,
                                distance(named)
                            );
                            assert_eq!(
                                nearest.id, id,
                                "{file} {group_name}: id {id} ({}) but nearest is {} ({})",
                                named.name, nearest.id, nearest.name
                            );
                            checked += 1;
                        }
                    }
                }
            }
            assert!(checked >= 6, "{file}: expected several airfield starts, checked {checked}");
        }
    }
}
