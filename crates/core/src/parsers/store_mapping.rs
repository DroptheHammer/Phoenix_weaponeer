//! DCS store mapping
//!
//! A FragOrders link carries each jet's pylons as DCS store display names, one
//! per pylon, null where a pylon is empty: "TER-9A with 3 x Mk-82 - 500lb GP
//! Bomb LD", "GBU-12 - 500lb Laser Guided Bomb", "Fuel tank 300 gal". This turns
//! them into the air-to-ground weapons the planner knows (a row id in
//! `data/reference.json`) with a count, the way `threat_mapping` turns unit types
//! into threat systems. A rule here names its weapon row directly; the threat
//! table goes through a name lookup instead.
//!
//! Matching reuses the threat mapper's whole-token form (lower-case, split on
//! anything that is not a letter or digit, a rule matches a contiguous run of
//! tokens), so the Mk-82 rule can never match "Mk-82Y" and the GBU-12 rule can
//! never match a GBU-120.
//!
//! A store goes through these stages, in this order, and the order matters:
//!
//! 1. **Skip words** (Illum, Flare, Smoke, Phos). They come before the rules
//!    because an illumination rocket is a Hydra to the rule table, and loading
//!    it as one would tell a pilot he has HE rockets.
//! 2. **APKWS** is forced unrecognised. It rides in a Hydra pod, so it would
//!    otherwise match the Hydra rule, and it is a guided weapon that the Hydra
//!    row does not describe.
//! 3. **The most specific rule wins**: more tokens first, then more characters,
//!    then table order (the same measure as `threat_mapping`). That is how
//!    "Mk-82 AIR" and "Mk-82 Snakeye" beat plain "Mk-82". The SAMP bombs need
//!    one more step: the low-drag and high-drag names share the tokens "SAMP
//!    250" and tell themselves apart by an "HD" at the far end, so no amount of
//!    specificity can separate them. Each has a rule with the same pattern,
//!    and when two rules tie on tokens and characters the one whose drag agrees
//!    with the name wins. A true tie (neither agrees, or a repeated pattern)
//!    still goes to the earlier entry.
//! 4. **The drag guard.** A high-drag name that landed on a low-drag row (a
//!    retarded Mk-84 on the Mk-84 LDGP row, or a made-up high-drag SAMP-125,
//!    which has no row of its own) becomes unrecognised, because the planner
//!    would plan a low-level release the bomb can't fly.
//! 5. **Air-to-air missiles, fuel tanks and sensor or ECM pods** are skipped:
//!    they are not what a pilot plans an attack with, and they show nowhere.
//! 6. **Anything else is unrecognised.** That is the safe direction: an
//!    unrecognised store is kept on the loadout under its DCS name and flagged,
//!    so the pilot sees a weapon the tool doesn't know instead of nothing, and
//!    nothing is guessed. A skipped store is dropped, so every skip list is kept
//!    to what is certainly not an attack weapon.
//!
//! The GBU-16, AGM-65F, AGM-122 and the GAU-12 gun pod have rows that hold only
//! a name, a class and a guidance type (reference DB v5), and so do the Mk-20
//! Rockeye, CBU-99, CBU-52B, BLG-66 Belouga and the five SAMP bombs (added
//! 2026-10-03). They load, and the planner says so on an attack that uses one.
//! The internal guns have no rule: a gun built into the jet is never a pylon
//! store.
//!
//! Counts. "X with N x ..." is N of what X holds (a TER of 3 Mk-82 is 3). So is
//! a count written right before the weapon's own name, "BRU-42 - 3 x Mk-20 ..."
//! or "2x CBU-52B ... (TER)", as two tokens ("3 x") or one ("3x"). A rocket pod
//! counts rockets, not pods ("pod - 7 x" is 7, and two such pods are 14). A
//! cluster bomb's own "202 x" comes after its name, is submunitions and is never
//! a count, so a bare "CBU-87 - 202 x CEM Cluster Bomb" is one bomb. A bare
//! number is never a count either: the Heatblur-style names ("MAK79 2 MK-20")
//! and a rack's own number ("BRU-42 Mk-82") stay at one, because there is no
//! telling a count from a designation. Pylons that carry the same weapon merge
//! into one line with the summed quantity.

use serde_json::Value;

use super::fragorders::ImportedStore;
use super::threat_mapping::{contains_run, tokens};
use crate::refdata::RefData;

/// Why a store is left off the loadout.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkipReason {
    /// Illumination, flares, smoke and white phosphorus: they light or mark a
    /// target rather than hit it.
    Marker,
    AirToAir,
    FuelTank,
    /// A targeting, navigation or ECM pod.
    SensorPod,
}

/// What a DCS store name is, as far as the planner is concerned.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoreClass {
    /// A weapon the reference data knows, and how many of it the store holds.
    Weapon { id: &'static str, quantity: u32 },
    /// An air-to-ground store we have no row for. Kept, and flagged.
    Unrecognised,
    /// Not an attack weapon at all. Dropped.
    Skipped(SkipReason),
}

/// Whether a bomb is retarded. Only the unguided Mk-8x rows carry one: the
/// guard compares the name's drag against the row the name landed on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Drag {
    Low,
    High,
    NotApplicable,
}

/// How a rule turns its store name into a quantity.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Count {
    /// Bombs, missiles and cluster bombs: "with N x", or an "N x" / "Nx" right
    /// before the weapon's own name, otherwise one.
    Stores,
    /// Rockets: pods times rockets per pod.
    Rockets,
}

struct StoreRule {
    /// Written the way DCS spells it where a DCS name is known; separators and
    /// case do not matter (see module docs).
    pattern: &'static str,
    /// A `weapons` row id in `data/reference.json`.
    id: &'static str,
    drag: Drag,
    count: Count,
}

const fn rule(pattern: &'static str, id: &'static str) -> StoreRule {
    StoreRule { pattern, id, drag: Drag::NotApplicable, count: Count::Stores }
}
const fn low_drag(pattern: &'static str, id: &'static str) -> StoreRule {
    StoreRule { pattern, id, drag: Drag::Low, count: Count::Stores }
}
const fn high_drag(pattern: &'static str, id: &'static str) -> StoreRule {
    StoreRule { pattern, id, drag: Drag::High, count: Count::Stores }
}
const fn rockets(pattern: &'static str, id: &'static str) -> StoreRule {
    StoreRule { pattern, id, drag: Drag::NotApplicable, count: Count::Rockets }
}

/// Every rule names a row in `data/reference.json`, and each pattern must
/// resolve to its own row; `every_rule_names_a_real_reference_row_and_none_shadows_another`
/// keeps both true.
///
/// The internal guns (GAU-8, M39, DEFA 553, Mk 12) have no rule, since they are
/// never a pylon store. The one gun row with a rule is the Harrier's GAU-12 pod.
static STORE_RULES: &[StoreRule] = &[
    // Unguided bombs. DCS: "Mk-82 - 500lb GP Bomb LD", "Mk-82 AIR Ballute -
    // 500lb GP Bomb HD", "Mk-82 Snakeye - 500lb GP Bomb HD", "Mk-84 - 2000lb GP
    // Bomb LD". The retarded Mk-82 is spelled "Mk-82AIR" in some DCS names;
    // both spellings are listed.
    low_drag("Mk-82", "mk82"),
    high_drag("Mk-82 AIR", "mk82air"),
    high_drag("Mk-82AIR", "mk82air"),
    high_drag("Mk-82 Snakeye", "mk82se"),
    low_drag("Mk-84", "mk84"),
    // Laser-guided bombs. DCS: "GBU-12 - 500lb Laser Guided Bomb", "GBU-24
    // Paveway III - 2000lb Laser Guided Bomb"; some modules write a bare "GBU-24".
    rule("GBU-10", "gbu10"),
    rule("GBU-12", "gbu12"),
    rule("GBU-16", "gbu16"),
    rule("GBU-24", "gbu24"),
    // GPS bombs.
    rule("GBU-31", "gbu31"),
    rule("GBU-38", "gbu38"),
    // Cluster bombs. Their own "202 x" is submunitions: see the module docs.
    // DCS: "Mk-20 Rockeye - 490lbs CBU, 247 x HEAT Bomblets", "CBU-99 - 490lbs,
    // 247 x HEAT Bomblets", "CBU-52B - 220 x HE/Frag bomblets", "BLG-66 Belouga
    // AC - CBU, 151 x HEAT Bomblets". The F-14 writes a bare "Mk-20", and some
    // legacy names ("AUF2 ROCKEYE x 2") have no "Mk-20" at all, so the Rockeye
    // has two rules.
    rule("CBU-87", "cbu87"),
    rule("CBU-97", "cbu97"),
    rule("Mk-20", "mk20"),
    rule("Rockeye", "mk20"),
    rule("CBU-99", "cbu99"),
    rule("CBU-52B", "cbu52b"),
    rule("BLG-66", "blg66"),
    // The French SAMP bombs. DCS: "SAMP-250 - 250 kg GP Bomb LD", "SAMP-250 - 250
    // kg GP Chute Retarded Bomb HD". There is no high-drag SAMP-125. A low and a
    // high rule share each 250 and 400 pattern: only the "HD" at the far end of
    // the name tells them apart, so a tie goes to the rule whose drag agrees with
    // the name (see `best_rule`).
    low_drag("SAMP-125", "samp125"),
    low_drag("SAMP-250", "samp250"),
    high_drag("SAMP-250", "samp250hd"),
    low_drag("SAMP-400", "samp400"),
    high_drag("SAMP-400", "samp400hd"),
    // Air-to-ground missiles. DCS: "LAU-117 with AGM-65D - Maverick D (IIR
    // ASM)", "AGM-88C HARM - High Speed Anti-Radiation Missile".
    rule("AGM-65D", "agm65d"),
    rule("AGM-65F", "agm65f"),
    rule("AGM-65G", "agm65g"),
    rule("AGM-65H", "agm65h"),
    rule("AGM-65K", "agm65k"),
    rule("AGM-88C", "agm88c"),
    rule("AGM-122", "agm122"),
    rule("AGM-154A", "agm154a"),
    rule("AGM-154C", "agm154c"),
    // A gun pod, DCS: "GAU 12 Gunpod". It is a store of one, though its row is a gun.
    rule("GAU-12", "gau12"),
    // Rockets, by the rocket's name in the pod's: "LAU-131 pod - 7 x 2.75
    // Hydra, UnGd Rkts M151, HE", "LAU-10 pod - 4 x 127 mm ZUNI, ...".
    rockets("Hydra", "hydra70"),
    rockets("FFAR", "ffar275"),
    rockets("ZUNI", "zuni"),
    rockets("SNEB", "sneb68"),
];

/// Word stems of things that light or mark a target. A stem rather than a whole
/// token, so "Illumination", "Flares" and "Phosphorus" count as well.
const MARKER_STEMS: &[&str] = &["illum", "flare", "smoke", "phos"];

/// Guided rocket kits. They ride in Hydra pods, so the Hydra rule would match.
const FORCED_UNRECOGNISED: &[&str] = &["apkws", "agr"];

/// Whole tokens that make a store an air-to-air missile: "AIM-9M ...", "... AAM",
/// "AIM-120B AMRAAM", "LAU-138 AIM-9M", and the French and British ones.
const AIR_TO_AIR_TOKENS: &[&str] =
    &["aim", "aam", "amraam", "sidewinder", "sparrow", "phoenix", "magic", "mica", "asraam", "meteor", "python"];

/// Whole tokens that make a store a fuel tank: "Fuel tank 300 gal", "FPU-8A
/// Fuel Tank 330 gallons".
const FUEL_TANK_TOKENS: &[&str] = &["fuel", "droptank", "ptb"];

/// Whole tokens that make a store a sensor, navigation or ECM pod. Not a bare
/// "pod": a rocket pod we have no rule for must stay visible.
const SENSOR_POD_TOKENS: &[&str] =
    &["litening", "lantirn", "sniper", "atflir", "tgp", "hts", "alq", "ecm", "acmi", "tcts", "tald"];

/// Whole tokens that mark a bomb as retarded or high-drag.
const HIGH_DRAG_TOKENS: &[&str] = &["hd", "retarded", "ballute", "snakeye", "chute", "parachute"];

/// The pylon names a payload carries: its non-null strings, in order.
///
/// A missing payload, and anything that is not an array of names (an object, a
/// number, nested arrays, all nulls) gives an empty list and never an error: a
/// payload in a shape we did not expect must cost the jet its loadout, not the
/// import. A blank string, or a non-string inside the array, is skipped too.
pub fn store_names(payload: Option<&Value>) -> Vec<String> {
    let Some(Value::Array(pylons)) = payload else {
        return Vec::new();
    };
    pylons
        .iter()
        .filter_map(|pylon| pylon.as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect()
}

/// What one DCS store name is. See the module docs for the stages and why they
/// run in this order.
pub fn classify_store(name: &str) -> StoreClass {
    let toks = tokens(name);
    let has_token = |words: &[&str]| toks.iter().any(|t| words.contains(&t.as_str()));

    if toks.iter().any(|t| MARKER_STEMS.iter().any(|stem| t.starts_with(stem))) {
        return StoreClass::Skipped(SkipReason::Marker);
    }
    if has_token(FORCED_UNRECOGNISED) {
        return StoreClass::Unrecognised;
    }
    if let Some(rule) = best_rule(&toks) {
        // A high-drag name on a low-drag row. ("Mk-82Y" never gets here: "82y"
        // is not the token "82", so no rule matches it at all.)
        if rule.drag == Drag::Low && looks_high_drag(&toks) {
            return StoreClass::Unrecognised;
        }
        let quantity = match rule.count {
            Count::Stores => with_count(&toks).or_else(|| count_before_weapon(&toks, rule)).unwrap_or(1),
            Count::Rockets => rocket_quantity(&toks),
        };
        return StoreClass::Weapon { id: rule.id, quantity };
    }
    if has_token(AIR_TO_AIR_TOKENS) {
        return StoreClass::Skipped(SkipReason::AirToAir);
    }
    if has_token(FUEL_TANK_TOKENS) || (has_token(&["tank"]) && toks.iter().any(|t| t.starts_with("gal"))) {
        return StoreClass::Skipped(SkipReason::FuelTank);
    }
    if has_token(SENSOR_POD_TOKENS) || contains_run(&toks, &tokens("Targeting Pod")) {
        return StoreClass::Skipped(SkipReason::SensorPod);
    }
    StoreClass::Unrecognised
}

/// A payload's loadout: every air-to-ground store, one line per weapon.
///
/// Stores that are skipped (air-to-air, tanks, pods, markers) are dropped. A
/// store we have no row for stays, with `weapon_id: None` and its DCS display
/// name. Pylons carrying the same weapon merge into one line with the summed
/// quantity, in order of first appearance. A recognised line is named by its
/// reference row, so the name matches what the planner's weapon list shows.
pub fn loadout_from_payload(payload: Option<&Value>, db: &RefData) -> Vec<ImportedStore> {
    let mut loadout: Vec<ImportedStore> = Vec::new();
    for display in store_names(payload) {
        let (weapon_id, name, quantity) = match classify_store(&display) {
            StoreClass::Skipped(_) => continue,
            StoreClass::Weapon { id, quantity } => match db.get_weapon_by_id(id) {
                Some(weapon) => (Some(weapon.id), weapon.name, quantity),
                // A rule naming a row that is not there (a test keeps that from
                // shipping): keep the store rather than lose it.
                None => (None, display, quantity),
            },
            StoreClass::Unrecognised => {
                let quantity = with_count(&tokens(&display)).unwrap_or(1);
                (None, display, quantity)
            }
        };
        match loadout.iter_mut().find(|line| line.weapon_id == weapon_id && line.name == name) {
            Some(line) => line.quantity = line.quantity.saturating_add(quantity),
            None => loadout.push(ImportedStore { weapon_id, name, quantity }),
        }
    }
    loadout
}

/// The rule that best describes a store name, if any: the most tokens, then the
/// most characters, then (on an exact tie) the rule whose drag agrees with the
/// name, then the earlier table entry.
///
/// The drag step is for names whose only difference is an "HD" far from the
/// weapon (the SAMP bombs), which no amount of specificity can tell apart. A
/// rule with no drag never agrees, so every other tie is still the earlier entry.
fn best_rule(toks: &[String]) -> Option<&'static StoreRule> {
    let high = looks_high_drag(toks);
    let agrees = |rule: &StoreRule| (rule.drag == Drag::High && high) || (rule.drag == Drag::Low && !high);
    let mut best: Option<((usize, usize), &'static StoreRule)> = None;
    for rule in STORE_RULES {
        let needle = tokens(rule.pattern);
        if !contains_run(toks, &needle) {
            continue;
        }
        // Strict `>` keeps the earlier entry on a tie, so the answer is fixed.
        let key = (needle.len(), rule.pattern.len());
        let wins = match best {
            None => true,
            Some((best_key, held)) => key > best_key || (key == best_key && agrees(rule) && !agrees(held)),
        };
        if wins {
            best = Some((key, rule));
        }
    }
    best.map(|(_, rule)| rule)
}

fn looks_high_drag(toks: &[String]) -> bool {
    toks.iter().any(|t| HIGH_DRAG_TOKENS.contains(&t.as_str())) || contains_run(toks, &tokens("High Drag"))
}

/// `toks[at]` is a count and the next token is the "x" after it: "3 x".
fn count_at(toks: &[String], at: usize) -> Option<u32> {
    let count = toks.get(at)?.parse::<u32>().ok().filter(|n| *n > 0)?;
    (toks.get(at + 1).map(String::as_str) == Some("x")).then_some(count)
}

/// N in "X with N x ...": what a rack or launcher holds. For a bomb or missile
/// this and `count_before_weapon` are the only counts, never the first "N x"
/// anywhere in the name. The unrecognised path uses only this one.
fn with_count(toks: &[String]) -> Option<u32> {
    (0..toks.len()).filter(|&i| toks[i] == "with").find_map(|i| count_at(toks, i + 1))
}

/// Where a token run first starts in `hay`.
fn run_start(hay: &[String], needle: &[String]) -> Option<usize> {
    if needle.is_empty() {
        return None;
    }
    hay.windows(needle.len()).position(|window| window == needle)
}

/// N in an "N x" or "Nx" that sits right before `toks[at]`: "BRU-42 - 3 x Mk-20",
/// "2x CBU-52B". A bare number ("MAK79 2 MK-20", "BRU-42 Mk-82") is never a
/// count, since there is no telling it from a designation.
fn count_before(toks: &[String], at: usize) -> Option<u32> {
    let positive = |text: &str| text.parse::<u32>().ok().filter(|n| *n > 0);
    let before = toks.get(at.checked_sub(1)?)?;
    if before == "x" {
        return positive(toks.get(at.checked_sub(2)?)?);
    }
    positive(before.strip_suffix('x')?)
}

/// The count written right before the weapon's own name, as the rule found it.
/// A cluster bomb's submunitions ("247 x HEAT Bomblets") come after the name, so
/// they are never read.
fn count_before_weapon(toks: &[String], rule: &StoreRule) -> Option<u32> {
    count_before(toks, run_start(toks, &tokens(rule.pattern))?)
}

/// Rockets in a pod store: pods times rockets per pod. Every "N x" in the name
/// is read in order. One written as "with N x ..." or leading the name ("2 x
/// LAU-131 ...") counts pods, and the next one is the rockets in each. With no
/// pod count the first one is the rockets in the single pod. With no rocket
/// count at all it falls back to the pod count, or one.
fn rocket_quantity(toks: &[String]) -> u32 {
    let counts: Vec<(usize, u32)> = (0..toks.len()).filter_map(|i| count_at(toks, i).map(|n| (i, n))).collect();
    let counts_pods = |at: usize| at == 0 || toks[at - 1] == "with";
    match counts.as_slice() {
        [(at, pods), (_, per_pod), ..] if counts_pods(*at) => pods.saturating_mul(*per_pod),
        [(at, pods)] if counts_pods(*at) => *pods,
        [(_, per_pod), ..] => *per_pod,
        [] => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::refdata::reference;
    use serde_json::json;

    fn weapon(id: &'static str, quantity: u32) -> StoreClass {
        StoreClass::Weapon { id, quantity }
    }

    #[test]
    fn store_names_lists_the_non_null_strings_of_a_pylon_array() {
        let payload = json!([null, "AIM-9M Sidewinder IR AAM", null, "GBU-12 - 500lb Laser Guided Bomb"]);
        assert_eq!(
            store_names(Some(&payload)),
            vec!["AIM-9M Sidewinder IR AAM".to_string(), "GBU-12 - 500lb Laser Guided Bomb".to_string()]
        );
        // A blank name and a non-string inside the array are not stores.
        let odd = json!(["  ", 7, null, " Fuel tank 300 gal "]);
        assert_eq!(store_names(Some(&odd)), vec!["Fuel tank 300 gal".to_string()]);
    }

    #[test]
    fn a_payload_that_is_not_a_list_of_names_gives_no_stores_and_no_error() {
        assert!(store_names(None).is_empty(), "a missing payload");
        assert!(store_names(Some(&json!(null))).is_empty());
        assert!(store_names(Some(&json!({ "pylons": ["GBU-12"] }))).is_empty(), "an object");
        assert!(store_names(Some(&json!(12))).is_empty(), "a number");
        assert!(store_names(Some(&json!("GBU-12"))).is_empty(), "a bare string");
        assert!(store_names(Some(&json!([["GBU-12"], [null]]))).is_empty(), "nested arrays");
        assert!(store_names(Some(&json!([null, null, null]))).is_empty(), "all nulls");
        assert!(store_names(Some(&json!([]))).is_empty(), "an empty array");
    }

    #[test]
    fn dcs_store_names_become_weapon_ids_and_counts() {
        let cases: &[(&str, StoreClass)] = &[
            // "X with N x ..." is N.
            ("TER-9A with 3 x Mk-82 - 500lb GP Bomb LD", weapon("mk82", 3)),
            ("Mk-82 - 500lb GP Bomb LD", weapon("mk82", 1)),
            ("Mk-84 - 2000lb GP Bomb LD", weapon("mk84", 1)),
            ("Mk-82 AIR Ballute - 500lb GP Bomb HD", weapon("mk82air", 1)),
            ("Mk-82AIR - 500lb GP Bomb HD", weapon("mk82air", 1)),
            ("Mk-82 Snakeye - 500lb GP Bomb HD", weapon("mk82se", 1)),
            ("BRU-33 with 2 x Mk-82 Snakeye - 500lb GP Bomb HD", weapon("mk82se", 2)),
            ("GBU-12 - 500lb Laser Guided Bomb", weapon("gbu12", 1)),
            ("GBU-16", weapon("gbu16", 1)),
            ("GBU-10 - 2000lb Laser Guided Bomb", weapon("gbu10", 1)),
            ("GBU-24 Paveway III - 2000lb Laser Guided Bomb", weapon("gbu24", 1)),
            ("GBU-24", weapon("gbu24", 1)),
            ("GBU-31 - 2000lb GPS Guided Bomb", weapon("gbu31", 1)),
            ("GBU-38 - 500lb JDAM GPS Guided Bomb", weapon("gbu38", 1)),
            ("LAU-117 with AGM-65D - Maverick D (IIR ASM)", weapon("agm65d", 1)),
            ("LAU-88 with 3 x AGM-65D - Maverick D (IIR ASM)", weapon("agm65d", 3)),
            ("LAU-117 with AGM-65F - Maverick F (IIR ASM)", weapon("agm65f", 1)),
            ("AGM-65G - Maverick G (IIR ASM, Lg Whd)", weapon("agm65g", 1)),
            ("LAU-117 with AGM-65H - Maverick H (CCD Imp ASM)", weapon("agm65h", 1)),
            ("AGM-65K - Maverick K (CCD Imp ASM)", weapon("agm65k", 1)),
            ("AGM-88C HARM - High Speed Anti-Radiation Missile", weapon("agm88c", 1)),
            ("AGM-122 Sidearm", weapon("agm122", 1)),
            ("AGM-154A - JSOW CEB (CBU-type)", weapon("agm154a", 1)),
            ("AGM-154C - JSOW Unitary BROACH", weapon("agm154c", 1)),
            // A gun pod is a store of one, under either spelling of its name.
            ("GAU 12 Gunpod", weapon("gau12", 1)),
            ("GAU-12", weapon("gau12", 1)),
            // A cluster bomb's own "N x" is submunitions, never a count. The
            // first "N x" anywhere in the name is 202 and 10 here.
            ("CBU-87 - 202 x CEM Cluster Bomb", weapon("cbu87", 1)),
            ("CBU-97 - 10 x SFW Cluster Bomb", weapon("cbu97", 1)),
            ("TER-9A with 3 x CBU-87 - 202 x CEM Cluster Bomb", weapon("cbu87", 3)),
            // Rocket pods count rockets. 2 x LAU-131 is 14, however it is written.
            ("LAU-131 pod - 7 x 2.75 Hydra, UnGd Rkts M151, HE", weapon("hydra70", 7)),
            ("M261 pod - 19 x 2.75 Hydra, UnGd Rkts M151, HE", weapon("hydra70", 19)),
            ("2 x LAU-131 pod - 7 x 2.75 Hydra, UnGd Rkts M151, HE", weapon("hydra70", 14)),
            ("BRU-42 with 3 x LAU-131 pods - 7 x 2.75 Hydra, UnGd Rkts M151, HE", weapon("hydra70", 21)),
            ("LAU-10 pod - 4 x 127 mm ZUNI, UnGd Rkts Mk71, HE/FRAG", weapon("zuni", 4)),
            ("LAU-3 pod - 19 x 2.75 FFAR, UnGd Rkts Mk1, HE", weapon("ffar275", 19)),
        ];
        for (name, expected) in cases {
            assert_eq!(classify_store(name), *expected, "{name:?}");
        }
    }

    /// Real DCS display names (from the public pydcs weapons list) for the cluster
    /// bombs and the SAMP bombs. A submunition count ("247 x") comes after the
    /// weapon's name and is never a rack count.
    #[test]
    fn cluster_and_samp_names_become_weapon_ids_and_counts() {
        let cases: &[(&str, StoreClass)] = &[
            // The Rockeye, in each shape a rack gives its name.
            ("Mk-20 Rockeye - 490lbs CBU, 247 x HEAT Bomblets", weapon("mk20", 1)),
            ("BRU-33 with 2 x Mk-20 Rockeye - 490lbs CBU, 247 x HEAT Bomblets", weapon("mk20", 2)),
            ("MER6 with 6 x Mk-20 Rockeye - 490lbs CBUs, 247 x HEAT Bomblets", weapon("mk20", 6)),
            ("BRU-42 - 3 x Mk-20 Rockeye - 490lbs CBU, 247 x HEAT Bomblets", weapon("mk20", 3)),
            ("2x Mk-20 Rockeye - 490lbs CBU, 247 x HEAT Bomblets (TER)", weapon("mk20", 2)),
            // The F-14 writes it short, and some legacy names spell it differently.
            ("Mk-20", weapon("mk20", 1)),
            ("AUF2 ROCKEYE x 2", weapon("mk20", 1)),
            ("Mk-20 Rockeye * 3", weapon("mk20", 1)),
            ("MAK79 2 MK-20", weapon("mk20", 1)),
            // The others.
            ("CBU-99 - 490lbs, 247 x HEAT Bomblets", weapon("cbu99", 1)),
            ("CBU-99", weapon("cbu99", 1)),
            ("BRU-33 with 2 x CBU-99 - 490lbs, 247 x HEAT Bomblets", weapon("cbu99", 2)),
            ("CBU-52B - 220 x HE/Frag bomblets", weapon("cbu52b", 1)),
            ("3x CBU-52B - 220 x HE/Frag bomblets (MER)", weapon("cbu52b", 3)),
            ("(Special Weapons Adapter) 2x CBU-52B - 220 x HE/Frag bomblets (TER)", weapon("cbu52b", 2)),
            ("BLG-66 Belouga AC - CBU, 151 x HEAT Bomblets", weapon("blg66", 1)),
            ("BLG-66 Belouga EG - CBU, 151 x HE/Frag Bomblets", weapon("blg66", 1)),
            ("AUF 2 - 2 x BLG-66 Belouga AC - CBU, 151 x HEAT Bomblets", weapon("blg66", 2)),
            // The SAMP bombs: the "HD" at the far end picks the high-drag row.
            ("SAMP-125 - 125 kg GP Bomb LD", weapon("samp125", 1)),
            ("SAMP-250 - 250 kg GP Bomb LD", weapon("samp250", 1)),
            ("SAMP-400 - 400 kg GP Bomb LD", weapon("samp400", 1)),
            ("SAMP-250 - 250 kg GP Chute Retarded Bomb HD", weapon("samp250hd", 1)),
            ("SAMP-400 - 400 kg GP Chute Retarded Bomb HD", weapon("samp400hd", 1)),
            ("AUF 2 - 2 x SAMP-125 - 125 kg GP Bomb LD", weapon("samp125", 2)),
            ("CLB 4 - 4 x SAMP-250 - 250 kg GP Chute Retarded Bomb HD", weapon("samp250hd", 4)),
            ("CLB 4 - 4 x SAMP-400 - 400 kg GP Bomb LD", weapon("samp400", 4)),
            ("2x SAMP-250 - 250KG GP Bomb LD (TER)", weapon("samp250", 2)),
            ("1x SAMP-250 - 250KG GP Chute Retarded Bomb HD (TER)", weapon("samp250hd", 1)),
            ("AUF2 SAMP-250 HD x 2", weapon("samp250hd", 1)),
        ];
        for (name, expected) in cases {
            assert_eq!(classify_store(name), *expected, "{name:?}");
        }
    }

    /// The SAMP-250 and SAMP-400 names share their tokens across the low and high
    /// rows, so the choice is the drag of the whole name. There is no high-drag
    /// SAMP-125 row: a name for one falls to the drag guard, never to the low row.
    #[test]
    fn a_samp_name_picks_the_row_of_its_own_drag() {
        let cases: &[(&str, StoreClass)] = &[
            ("SAMP-250", weapon("samp250", 1)),
            ("SAMP-250 HD", weapon("samp250hd", 1)),
            ("SAMP-250 Retarded", weapon("samp250hd", 1)),
            ("SAMP-400", weapon("samp400", 1)),
            ("SAMP-400 HD", weapon("samp400hd", 1)),
            ("SAMP-125 - 125 kg GP Chute Retarded Bomb HD", StoreClass::Unrecognised),
            ("SAMP-125 HD", StoreClass::Unrecognised),
        ];
        for (name, expected) in cases {
            assert_eq!(classify_store(name), *expected, "{name:?}");
        }
    }

    /// A count is "with N x" or an "N x" / "Nx" right before the weapon's own name.
    /// Nothing else is: not a submunition count after the name, not the first "N x"
    /// anywhere, and never a bare number.
    #[test]
    fn a_rack_count_is_read_only_where_it_sits_before_the_weapons_own_name() {
        let cases: &[(&str, StoreClass)] = &[
            // The form works for an older weapon too, in both spellings.
            ("3x Mk-82 - 500lb GP Bomb LD (TER)", weapon("mk82", 3)),
            ("BRU-42 - 3 x Mk-82 - 500lb GP Bomb LD", weapon("mk82", 3)),
            // "with N x" still works.
            ("TER-9A with 3 x Mk-82 - 500lb GP Bomb LD", weapon("mk82", 3)),
            // Submunitions come after the name, with and without a rack count.
            ("CBU-99 - 490lbs, 247 x HEAT Bomblets", weapon("cbu99", 1)),
            ("CBU-87 - 202 x CEM Cluster Bomb", weapon("cbu87", 1)),
            ("2x CBU-52B - 220 x HE/Frag bomblets (TER)", weapon("cbu52b", 2)),
            ("BRU-42 - 3 x BLG-66 Belouga AC - CBU, 151 x HEAT Bomblets", weapon("blg66", 3)),
            // A lone "x" or a zero is not a count.
            ("x Mk-82 - 500lb GP Bomb LD", weapon("mk82", 1)),
            ("0x Mk-82 - 500lb GP Bomb LD", weapon("mk82", 1)),
            ("0 x Mk-82 - 500lb GP Bomb LD", weapon("mk82", 1)),
        ];
        for (name, expected) in cases {
            assert_eq!(classify_store(name), *expected, "{name:?}");
        }
    }

    /// A bare number is a designation, never a count: the Heatblur-style names
    /// carry the rack's number or a pylon's before the weapon, and a count of 42
    /// from "BRU-42" would load a jet with weapons it cannot hold.
    #[test]
    fn a_bare_number_before_the_weapon_is_never_a_count() {
        let cases: &[(&str, StoreClass)] = &[
            ("MAK79 2 MK-20", weapon("mk20", 1)),
            ("BRU-42 Mk-82 - 500lb GP Bomb LD", weapon("mk82", 1)),
            ("TER-9A 3 Mk-82 - 500lb GP Bomb LD", weapon("mk82", 1)),
            ("2 Mk-82 - 500lb GP Bomb LD", weapon("mk82", 1)),
            ("BRU-42 CBU-99 - 490lbs, 247 x HEAT Bomblets", weapon("cbu99", 1)),
            ("Mk-82 x 3", weapon("mk82", 1)),
        ];
        for (name, expected) in cases {
            assert_eq!(classify_store(name), *expected, "{name:?}");
        }
    }

    #[test]
    fn matching_ignores_case_and_separators() {
        assert_eq!(classify_store("ter-9a WITH 3 X mk_82 - 500lb gp bomb ld"), weapon("mk82", 3));
        assert_eq!(classify_store("gbu 12"), weapon("gbu12", 1));
    }

    /// The more specific rule wins whatever its place in the table: the Mk-82
    /// AIR and Snakeye names also contain the plain Mk-82 tokens.
    #[test]
    fn the_most_specific_rule_wins() {
        for (name, id) in [
            ("Mk-82 AIR Ballute - 500lb GP Bomb HD", "mk82air"),
            ("Mk-82 Snakeye - 500lb GP Bomb HD", "mk82se"),
            ("Mk-82 - 500lb GP Bomb LD", "mk82"),
        ] {
            assert!(
                matches!(classify_store(name), StoreClass::Weapon { id: got, .. } if got == id),
                "{name:?} should be {id}, got {:?}",
                classify_store(name)
            );
        }
    }

    /// Low-drag rows must never be loaded from a high-drag name: the planner
    /// would hand a retarded bomb a low-drag release. Mk-82Y has no row at all.
    #[test]
    fn a_high_drag_name_never_lands_on_a_low_drag_row() {
        for name in [
            // No high-drag Mk-84 row exists, so these would land on the LDGP row.
            "Mk-84 AIR Ballute - 2000lb GP Bomb HD",
            "Mk-84 Retarded - 2000lb GP Bomb HD",
            "Mk-82 - 500lb GP Bomb HD",
            "TER-9A with 3 x Mk-82 - 500lb GP Chute Retarded HD",
            // Its own designation: the token is "82y", not "82".
            "Mk-82Y - 500lb GP Chute Retarded HD",
        ] {
            assert_eq!(classify_store(name), StoreClass::Unrecognised, "{name:?}");
        }
        // The low-drag names beside them still map.
        assert_eq!(classify_store("Mk-84 - 2000lb GP Bomb LD"), weapon("mk84", 1));
        assert_eq!(classify_store("Mk-82 - 500lb GP Bomb LD"), weapon("mk82", 1));
    }

    /// An illumination rocket is a Hydra to the rule table, so the skip words
    /// have to run first.
    #[test]
    fn an_illumination_hydra_is_skipped_and_an_he_hydra_is_counted() {
        assert_eq!(
            classify_store("LAU-131 pod - 7 x 2.75 Hydra, UnGd Rkts M257, Para Illum"),
            StoreClass::Skipped(SkipReason::Marker)
        );
        assert_eq!(
            classify_store("LAU-131 pod - 7 x 2.75 Hydra, UnGd Rkts M156, Wht Phos"),
            StoreClass::Skipped(SkipReason::Marker)
        );
        assert_eq!(
            classify_store("LAU-131 pod - 7 x 2.75 Hydra, UnGd Rkts M151, HE"),
            weapon("hydra70", 7)
        );
        for name in ["Smokewinder - red", "Flares", "Mk-45 Parachute Flare", "Illumination rocket"] {
            assert_eq!(classify_store(name), StoreClass::Skipped(SkipReason::Marker), "{name:?}");
        }
    }

    #[test]
    fn apkws_is_never_loaded_as_a_plain_hydra() {
        assert_eq!(
            classify_store("LAU-131 pod - 7 x 2.75 Hydra, APKWS M151, HE"),
            StoreClass::Unrecognised
        );
        assert_eq!(classify_store("LAU-131 pod - 7 x AGR-20A APKWS"), StoreClass::Unrecognised);
    }

    #[test]
    fn air_to_air_fuel_and_sensor_pods_are_skipped_with_their_reason() {
        let skipped: &[(&str, SkipReason)] = &[
            ("AIM-9M Sidewinder IR AAM", SkipReason::AirToAir),
            ("AIM-7MH", SkipReason::AirToAir),
            ("AIM-120C-5 AMRAAM - Active Rdr AAM", SkipReason::AirToAir),
            ("LAU-138 AIM-9M", SkipReason::AirToAir),
            ("LAU-115 with 1 x LAU-127 AIM-120B AMRAAM - Active Rdr AAM", SkipReason::AirToAir),
            ("Fuel tank 300 gal", SkipReason::FuelTank),
            ("FPU-8A Fuel Tank 330 gallons", SkipReason::FuelTank),
            ("Tank 275 gal", SkipReason::FuelTank),
            ("AN/AAQ-28 LITENING - Targeting Pod", SkipReason::SensorPod),
            ("LANTIRN Targeting Pod", SkipReason::SensorPod),
            ("AN/ALQ-184 ECM Pod", SkipReason::SensorPod),
        ];
        for (name, reason) in skipped {
            assert_eq!(classify_store(name), StoreClass::Skipped(*reason), "{name:?}");
        }
    }

    /// The safe direction: a store we cannot place is kept and flagged, never
    /// guessed and never dropped.
    #[test]
    fn anything_unknown_is_unrecognised_rather_than_skipped() {
        for name in [
            // No row and no rule, now or planned.
            "BL-755 CBU - 450kg, 147 Frag/Pen bomblets",
            "Some Future Bomb",
            // A pod with an unknown payload must not be taken for a sensor pod.
            "B-8M1 pod - 20 x S-8KOM",
            "",
        ] {
            assert_eq!(classify_store(name), StoreClass::Unrecognised, "{name:?}");
        }
    }

    /// The rule table and `data/reference.json` are two files that have to
    /// agree, and a rule pointing at a row that is not there would load nothing.
    /// Feeding each pattern back in must also give its own row: that catches a
    /// pattern another rule swallows and a duplicate pattern aimed elsewhere.
    ///
    /// A high-drag rule that shares its pattern with a low-drag one (the SAMP
    /// bombs) cannot answer to the bare pattern, since a bare pattern looks low
    /// drag and the low rule is meant to win it. It is fed the pattern plus " HD"
    /// instead, the word that makes the name high-drag. A repeated pattern aimed
    /// at the wrong row still fails: two low rules, or two high ones, share the
    /// same input, and the earlier one takes it.
    #[test]
    fn every_rule_names_a_real_reference_row_and_none_shadows_another() {
        for rule in STORE_RULES {
            let row = reference()
                .get_weapon_by_id(rule.id)
                .unwrap_or_else(|| panic!("rule {:?} names {:?}, which is not a weapons row", rule.pattern, rule.id));
            // The rule's shape has to agree with the row it points at.
            match rule.count {
                Count::Rockets => assert_eq!(row.category, "rocket", "{:?} counts rockets", rule.pattern),
                Count::Stores => {
                    let stores =
                        ["bomb_unguided", "bomb_guided", "bomb_gps", "cluster", "missile_agm", "standoff", "gun"];
                    assert!(
                        stores.contains(&row.category.as_str()),
                        "{:?} counts stores but its row is a {}",
                        rule.pattern,
                        row.category
                    );
                    // A gun is only a store as a pod. A rule for a gun built into
                    // the jet would load an internal gun as if it hung on a pylon.
                    if row.category == "gun" {
                        assert_eq!(row.id, "gau12", "{:?} names an internal gun", rule.pattern);
                    }
                }
            }
            assert_eq!(
                rule.drag != Drag::NotApplicable,
                row.category == "bomb_unguided",
                "{:?}: only the unguided bombs carry a drag",
                rule.pattern
            );
            let paired_with_low =
                rule.drag == Drag::High && STORE_RULES.iter().any(|o| o.drag == Drag::Low && o.pattern == rule.pattern);
            let fed = if paired_with_low { format!("{} HD", rule.pattern) } else { rule.pattern.to_string() };
            assert_eq!(
                classify_store(&fed),
                StoreClass::Weapon { id: rule.id, quantity: 1 },
                "pattern {:?} (fed as {fed:?}) did not resolve to its own rule",
                rule.pattern
            );
        }
    }

    #[test]
    fn a_loadout_merges_pylons_and_keeps_what_we_cannot_place() {
        let payload = json!([
            "AIM-9M Sidewinder IR AAM",
            "TER-9A with 3 x Mk-82 - 500lb GP Bomb LD",
            "GBU-12 - 500lb Laser Guided Bomb",
            null,
            "Fuel tank 370 gal",
            "TER-9A with 3 x Mk-82 - 500lb GP Bomb LD",
            "BL-755 CBU - 450kg, 147 Frag/Pen bomblets",
            "GBU-12 - 500lb Laser Guided Bomb",
            "LAU-131 pod - 7 x 2.75 Hydra, UnGd Rkts M257, Para Illum",
            "BL-755 CBU - 450kg, 147 Frag/Pen bomblets",
        ]);
        let loadout = loadout_from_payload(Some(&payload), reference());
        let lines: Vec<(Option<&str>, &str, u32)> =
            loadout.iter().map(|l| (l.weapon_id.as_deref(), l.name.as_str(), l.quantity)).collect();
        assert_eq!(
            lines,
            vec![
                (Some("mk82"), "Mk-82 LDGP", 6),
                (Some("gbu12"), "GBU-12 Paveway II", 2),
                (None, "BL-755 CBU - 450kg, 147 Frag/Pen bomblets", 2),
            ],
            "first appearance order, summed quantity, row names, the unrecognised store kept under its DCS name"
        );
    }

    #[test]
    fn a_jet_with_no_air_to_ground_store_has_no_loadout() {
        let payload = json!(["AIM-9M Sidewinder IR AAM", null, "Fuel tank 370 gal", "AN/AAQ-28 LITENING - Targeting Pod"]);
        assert!(loadout_from_payload(Some(&payload), reference()).is_empty());
        assert!(loadout_from_payload(None, reference()).is_empty());
    }

    // ---- Real links ----------------------------------------------------
    //
    // Each of the four captured public links, through the real import. The
    // macros (lib.rs) skip the test when a file is absent. Failures name an
    // aircraft type and a DCS store name, never a mission, a unit or a pilot.

    macro_rules! all_links {
        () => {
            [
                crate::link_sinai_v7!(),
                crate::link_neon_mirror!(),
                crate::link_arctic_fury!(),
                crate::link_nttr_dtc!(),
            ]
        };
    }

    /// Whether a store is not an attack weapon, decided by eye and written the
    /// other way round on purpose: lower-case substrings of the whole name, no
    /// tokens, no rule table. The classifier is checked against this, so the
    /// check does not call the classifier's own logic twice.
    fn skipped_by_eye(name: &str) -> Option<SkipReason> {
        let n = name.to_lowercase();
        if ["illum", "flare", "smoke", "phos"].iter().any(|w| n.contains(w)) {
            Some(SkipReason::Marker)
        } else if n.contains("aim-") {
            Some(SkipReason::AirToAir)
        } else if n.contains("fuel tank") {
            Some(SkipReason::FuelTank)
        } else if n.contains("targeting pod") {
            Some(SkipReason::SensorPod)
        } else {
            None
        }
    }

    /// Every air-to-ground store the four captured links carry has a rule. Until
    /// the GBU-16, AGM-65F, AGM-122 and GAU-12 rows went in (reference DB v5) four
    /// names did not, and this test pinned them; the set is now empty, so a store
    /// that no rule places is a failure that names it.
    #[test]
    fn every_store_in_the_four_captured_links_is_placed_or_skipped_for_a_reason() {
        use crate::parsers::tasking_state::parse_tasking_state;
        use std::collections::BTreeSet;

        let mut seen: BTreeSet<String> = BTreeSet::new();
        let mut unrecognised: BTreeSet<String> = BTreeSet::new();
        for json in all_links!() {
            let state = parse_tasking_state(json).expect("captured link parses");
            for group in state.planned_groups.iter().filter(|g| g.is_player_flight()) {
                for unit in &group.units {
                    for name in store_names(unit.payload.as_ref()) {
                        seen.insert(name.clone());
                        let class = classify_store(&name);
                        let aircraft = unit.unit_type.as_deref().unwrap_or("?");
                        match skipped_by_eye(&name) {
                            Some(reason) => assert_eq!(
                                class,
                                StoreClass::Skipped(reason),
                                "{aircraft} carries {name:?}, which is skipped by eye"
                            ),
                            None => match class {
                                StoreClass::Skipped(reason) => {
                                    panic!("{aircraft} carries {name:?}, skipped as {reason:?} but not skipped by eye")
                                }
                                StoreClass::Weapon { id, quantity } => {
                                    assert!(reference().get_weapon_by_id(id).is_some(), "{name:?} -> {id}");
                                    assert!(quantity >= 1, "{name:?} counts none");
                                }
                                StoreClass::Unrecognised => {
                                    unrecognised.insert(name.clone());
                                }
                            },
                        }
                    }
                }
            }
        }
        assert!(!seen.is_empty(), "the captured links carry stores");
        assert!(unrecognised.is_empty(), "air-to-ground stores in the captured links that no rule places: {unrecognised:?}");
    }

    /// The design expects 38 jets to arrive loaded across the four links, 22
    /// more to carry only air-to-air missiles, tanks and pods, and the rest to
    /// carry nothing. A loaded jet never ends with an empty loadout, even when
    /// everything it carries is unrecognised.
    #[test]
    fn thirty_eight_jets_in_the_four_captured_links_arrive_loaded() {
        use crate::import::process_tasking_state;
        use crate::parsers::tasking_state::parse_tasking_state;

        let (mut jets, mut loaded, mut only_skipped, mut no_stores) = (0, 0, 0, 0);
        for json in all_links!() {
            let state = parse_tasking_state(json).expect("captured link parses");
            let data = process_tasking_state(json, reference()).expect("captured link imports");
            let flights = state.planned_groups.iter().filter(|g| g.is_player_flight() && !g.units.is_empty());
            assert_eq!(flights.clone().count(), data.player_groups.len());
            for (group, imported) in flights.zip(&data.player_groups) {
                assert_eq!(group.units.len(), imported.units.len());
                for (unit, jet) in group.units.iter().zip(&imported.units) {
                    jets += 1;
                    let aircraft = unit.unit_type.as_deref().unwrap_or("?");
                    let names = store_names(unit.payload.as_ref());
                    if names.is_empty() {
                        no_stores += 1;
                        assert!(jet.loadout.is_empty(), "{aircraft} carries nothing");
                    } else if names.iter().all(|n| skipped_by_eye(n).is_some()) {
                        only_skipped += 1;
                        assert!(jet.loadout.is_empty(), "{aircraft} carries only air-to-air, tanks and pods: {names:?}");
                    } else {
                        loaded += 1;
                        assert!(!jet.loadout.is_empty(), "{aircraft} carries {names:?} and arrived with nothing");
                        for line in &jet.loadout {
                            assert!(line.quantity >= 1, "{aircraft}: {line:?}");
                            match &line.weapon_id {
                                Some(id) => {
                                    let row = reference().get_weapon_by_id(id).expect("a recognised store has a row");
                                    assert_eq!(line.name, row.name);
                                }
                                None => panic!("{aircraft} arrived with a store no rule places: {line:?}"),
                            }
                        }
                    }
                }
            }
        }
        assert_eq!(jets, loaded + only_skipped + no_stores);
        assert_eq!((jets, loaded, only_skipped, no_stores), (133, 38, 22, 73));
    }
}
