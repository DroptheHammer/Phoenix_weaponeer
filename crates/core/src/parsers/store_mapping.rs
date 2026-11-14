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
//! The FragOrders CLI (a `.miz` read to JSON) writes the same pylons as DCS
//! CLSIDs instead, `{"CLSID": "{HB_F4E_MK-82_6x}"}`, with `"<CLEAN>"` for an empty
//! pylon. `loadout_from_pylons` looks each CLSID up in `clsid_data` (generated
//! from pydcs and the A-4E-C mod, see `scripts/gen-clsids.mjs`) to get the DCS
//! display name the link would have carried, then runs the names through the
//! same stages and the same merge as a link's. A CLSID the table does not have
//! is kept, unclassified, under the CLSID itself: its name is not known, so it
//! is neither guessed at nor dropped.
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
//! 2026-10-03), and the Mk-81, Mk-81 Snakeye, Mk-83, Mk-83 AIR, BR-250, BR-500,
//! BLU-107 Durandal, CBU-103, CBU-105, BL-755, CBU-1/A, CBU-2/A and CBU-2B/A
//! (added 2026-11-13). They load, and the planner says so on an attack that
//! uses one. The internal guns have no rule: a gun built into the jet is never
//! a pylon store.
//!
//! Counts. "X with N x ..." is N of what X holds (a TER of 3 Mk-82 is 3). So is
//! a count written right before the weapon's own name, "BRU-42 - 3 x Mk-20 ..."
//! or "2x CBU-52B ... (TER)", as two tokens ("3 x") or one ("3x"). A rocket pod
//! counts rockets, not pods ("pod - 7 x" is 7, and two such pods are 14). A
//! cluster bomb's own "202 x" comes after its name, is submunitions and is never
//! a count, so a bare "CBU-87 - 202 x CEM Cluster Bomb" is one bomb.
//!
//! Four more spellings of a count are read, each one a fixed shape taken from the
//! public pydcs store list and the A-4E-C mod's own file (about 1,800 DCS names;
//! no captured link uses any of them), and for a bomb, missile or cluster only
//! (`store_count` lists the order):
//!
//! - a trailing "* N": "GBU-12 * 2", "Mk-82 AIR * 6", "Mk 84*28";
//! - a bare number that opens the name, straight before the weapon: "2 Mk-81",
//!   "3 GBU-12", "2 GBU-38 */*";
//! - a bare number after the F-14's "MAK79" rack: "MAK79 3 Mk-82", "MAK79 2
//!   MK-20" (`COUNTING_RACKS`, the only rack read this way);
//! - a trailing "x N" after the weapon: "AUF2 GBU-12 x 2", "BAP-100 x 12".
//!
//! Every other bare number is a designation and is never a count: a rack's own
//! number ("BRU-42 Mk-82" is tokens `bru 42 mk 82`, and 42 is not a count), a
//! number before a rack ("TER-9A 3 Mk-82"), and an "x N" in the middle of a name
//! ("BLU-3B x 27, HE" is bomblets), so a name can never load a jet with weapons
//! it cannot hold. A store with no rule (unrecognised) is still counted only by
//! "with N x". Pylons that carry the same weapon merge into one line with the
//! summed quantity.

use serde_json::Value;

use super::clsid_data::CLSID_NAMES;
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

/// Whether a bomb is retarded. Only the unguided bomb rows carry one: the
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
    /// Bombs, missiles and cluster bombs: "with N x", an "N x" / "Nx" right
    /// before the weapon's own name, or one of the four bare forms in the module
    /// docs (a trailing "* N" or "x N", a leading number, "MAK79 N"); otherwise
    /// one.
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
    // Some DCS names spell it "SnakeEye" ("Mk-82 SnakeEye", "MAK79 3 Mk-82
    // SnakeEye"), one token that is not "snakeye". Without this rule, and the
    // spelling in HIGH_DRAG_TOKENS, those loaded as the low-drag Mk-82. The
    // Mirage F1 writes it "Snakeyes" ("AUF2 MK-82 Snakeyes x 2"), a third token.
    high_drag("Mk-82 SnakeEye", "mk82se"),
    high_drag("Mk-82 Snakeyes", "mk82se"),
    low_drag("Mk-84", "mk84"),
    // The Mk-81 and Mk-83 (added 2026-11-13). DCS: "Mk-81 - 250lb GP Bomb LD",
    // "Mk-81 Snakeye - 250lb GP Bomb HD" (the A-4E-C), "Mk-83 - 1000lb GP Bomb
    // LD", "Mk-83 AIR (BSU-85) - 1000 lb GP Chute Retarded Bomb HD". The F-4E,
    // F-14 and Harrier racks write a bare "Mk-83" and the retarded one
    // "Mk-83 AIR" or "Mk-83AIR", so the Mk-83 AIR is listed in both spellings,
    // as the Mk-82 AIR is. "Mk-83CT" is another bomb (a different token) and has
    // no row, so it stays unrecognised.
    low_drag("Mk-81", "mk81"),
    high_drag("Mk-81 Snakeye", "mk81se"),
    low_drag("Mk-83", "mk83"),
    high_drag("Mk-83 AIR", "mk83air"),
    high_drag("Mk-83AIR", "mk83air"),
    // The Mirage F1's low-drag bombs, DCS: "BR-250 - 250kg GP Bomb LD", "BR-500 -
    // 500kg GP Bomb LD".
    low_drag("BR-250", "br250"),
    low_drag("BR-500", "br500"),
    // The Durandal is parachute-retarded, so its row is a high-drag one. DCS:
    // "BLU-107/B Durandal - 219kg Concrete Piercing Chute Retarded Bomb
    // w/Booster", but also "BLU-107 - 440lb Anti-Runway Penetrator Bomb" and
    // "BLU-107 * 3", which say nothing of drag: a high-drag rule is never
    // blocked by a name that does not look high-drag (only the low-drag
    // rules are, by the drag guard).
    high_drag("BLU-107", "blu107"),
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
    // More cluster bombs (added 2026-11-13). DCS: "CBU-103 - 202 x CEM, CBU with
    // WCMD", "CBU-105 - 10 x SFW, CBU with WCMD", "BL-755 CBU - 450kg, 147
    // Frag/Pen bomblets". The CBU-103 and CBU-105 names carry the words "CEM",
    // "SFW" and "with" after the number, and a "202 x" or "10 x", none of which
    // is a rule or a count: only the designation picks the row. The dispenser
    // pods of the F-4E and A-4E-C are spelled "CBU-1/A pod - ...", "CBU-1A/A x
    // 27x19 ...", "CBU-2/A x 19x19 ...", "CBU-2A x 19x19 ..." and "CBU-2B/A x
    // 22x19 ...", so the CBU-1/A and CBU-2/A each have two rules (the slash
    // splits "1/A" into two tokens, "1A" is one). The three cannot shadow each
    // other: "cbu 2 a", "cbu 2a" and "cbu 2b a" are different token runs.
    rule("CBU-103", "cbu103"),
    rule("CBU-105", "cbu105"),
    rule("BL-755", "bl755"),
    rule("CBU-1/A", "cbu1a"),
    rule("CBU-1A", "cbu1a"),
    rule("CBU-2/A", "cbu2a"),
    rule("CBU-2A", "cbu2a"),
    rule("CBU-2B/A", "cbu2ba"),
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

/// Whole tokens that mark a bomb as retarded or high-drag. "air" is the AIR
/// retarding tail: on its own it is how DCS writes "Mk-84 AIR * 2", which has no
/// row and must not fall through to the slick Mk-84. Over every pydcs and A-4E-C
/// store name, adding it changed only those two names (2026-11-13).
const HIGH_DRAG_TOKENS: &[&str] =
    &["hd", "retarded", "ballute", "snakeye", "snakeeye", "snakeyes", "chute", "parachute", "air"];

/// Racks that write the number of stores they hold as a bare number straight
/// after their own designation, before the weapon: the F-14's "MAK79 3 Mk-82".
/// Only a rack listed here is read this way. Every other rack's number is its
/// designation ("BRU-42 Mk-82" is tokens `bru 42 mk 82`, and 42 is not a count),
/// and no real name is written "TER-9A 3 Mk-82", so a number there is not read.
/// Add a rack only on evidence from a real name list.
const COUNTING_RACKS: &[&str] = &["mak79"];

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
            Count::Stores => store_count(name, &toks, rule),
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
    merge_stores(store_names(payload).into_iter().map(Store::Named), db)
}

/// One pylon's store on its way into a loadout.
enum Store {
    /// A DCS display name: classified by the stages in the module docs.
    Named(String),
    /// A CLSID with no name on file. Kept as it is, one of it per pylon, and
    /// never classified: its letters say nothing a name's would, and a made-up
    /// reading could drop it (as an air-to-air missile) or load it (as a bomb).
    Unknown(String),
}

/// The merge shared by both imports: one line per weapon, in order of first
/// appearance, with the quantities of every pylon that carries it summed.
fn merge_stores(stores: impl IntoIterator<Item = Store>, db: &RefData) -> Vec<ImportedStore> {
    let mut loadout: Vec<ImportedStore> = Vec::new();
    for store in stores {
        let (weapon_id, name, quantity) = match store {
            Store::Unknown(clsid) => (None, clsid, 1),
            Store::Named(display) => match classify_store(&display) {
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
            },
        };
        match loadout.iter_mut().find(|line| line.weapon_id == weapon_id && line.name == name) {
            Some(line) => line.quantity = line.quantity.saturating_add(quantity),
            None => loadout.push(ImportedStore { weapon_id, name, quantity }),
        }
    }
    loadout
}

/// What the CLI writes for a pylon with nothing on it.
const EMPTY_PYLON: &str = "<CLEAN>";

/// The CLSID on each pylon of a CLI payload's `pylons`, in pylon order.
///
/// `pylons` is an array of `{"number"?, "CLSID", "settings"}` objects. Every
/// capture so far lists them in pylon order, so array order is used; the
/// `number` is there in some files and not in others, and a gap in it (1, 3,
/// 4) is only a pylon with nothing on it. A map keyed by pylon number is read
/// too, in numeric key order, in case the CLI writes one. An empty pylon
/// (`"<CLEAN>"`, a blank CLSID, an entry with none) is left out. A missing or
/// null `pylons`, and anything of another shape, gives an empty list and never
/// an error, for the reason `store_names` gives.
pub fn pylon_clsids(pylons: Option<&Value>) -> Vec<String> {
    let entries: Vec<&Value> = match pylons {
        Some(Value::Array(list)) => list.iter().collect(),
        Some(Value::Object(map)) => {
            let mut numbered: Vec<(u32, &Value)> =
                map.iter().filter_map(|(key, entry)| key.trim().parse().ok().map(|n| (n, entry))).collect();
            numbered.sort_by_key(|(number, _)| *number);
            numbered.into_iter().map(|(_, entry)| entry).collect()
        }
        _ => return Vec::new(),
    };
    entries
        .into_iter()
        .filter_map(|entry| entry.get("CLSID")?.as_str())
        .map(str::trim)
        .filter(|clsid| !clsid.is_empty() && !clsid.eq_ignore_ascii_case(EMPTY_PYLON))
        .map(str::to_string)
        .collect()
}

/// A CLSID without its braces: `{ABC}` and `ABC` are the same store.
fn unbraced(clsid: &str) -> &str {
    let clsid = clsid.strip_prefix('{').unwrap_or(clsid);
    clsid.strip_suffix('}').unwrap_or(clsid)
}

/// The DCS display name of a CLSID, or `None` when the table does not have it.
///
/// An exact match comes first. A CLSID that differs only in its braces or its
/// letter case (DCS files spell the same store both ways) is then matched on
/// that alone, and is taken only when every such entry gives one name: where
/// they disagree it is not known which store was meant, so it is not known.
pub fn clsid_name(clsid: &str) -> Option<&'static str> {
    lookup(CLSID_NAMES, clsid)
}

/// `clsid_name` over any table sorted by CLSID (the tests give it their own).
fn lookup(table: &'static [(&'static str, &'static str)], clsid: &str) -> Option<&'static str> {
    let clsid = clsid.trim();
    if let Ok(at) = table.binary_search_by(|(known, _)| (*known).cmp(clsid)) {
        return Some(table[at].1);
    }
    let wanted = unbraced(clsid);
    let mut names =
        table.iter().filter(|(known, _)| unbraced(known).eq_ignore_ascii_case(wanted)).map(|(_, name)| *name);
    let first = names.next()?;
    names.all(|name| name == first).then_some(first)
}

/// A CLI jet's loadout: every air-to-ground store on its pylons, one line per
/// weapon, built exactly as a link's is (`loadout_from_payload`) once each CLSID
/// has its DCS name. A CLSID with no name on file stays on the loadout, flagged
/// as a store the tool does not know, under the CLSID itself.
pub fn loadout_from_pylons(pylons: Option<&Value>, db: &RefData) -> Vec<ImportedStore> {
    let stores = pylon_clsids(pylons).into_iter().map(|clsid| match clsid_name(&clsid) {
        Some(name) => Store::Named(name.to_string()),
        None => Store::Unknown(clsid),
    });
    merge_stores(stores, db)
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
/// this is the first place `store_count` looks, never the first "N x" anywhere
/// in the name. The unrecognised path uses only this one.
fn with_count(toks: &[String]) -> Option<u32> {
    (0..toks.len()).filter(|&i| toks[i] == "with").find_map(|i| count_at(toks, i + 1))
}

/// A token as a count: a whole number, and not zero (a zero reads as no count).
fn positive(text: &str) -> Option<u32> {
    text.parse::<u32>().ok().filter(|n| *n > 0)
}

/// Where a token run first starts in `hay`.
fn run_start(hay: &[String], needle: &[String]) -> Option<usize> {
    if needle.is_empty() {
        return None;
    }
    hay.windows(needle.len()).position(|window| window == needle)
}

/// N in an "N x" or "Nx" that sits right before `toks[at]`: "BRU-42 - 3 x Mk-20",
/// "2x CBU-52B". This is the only place a bare number counts as a store count
/// next to its "x"; a number with no "x" is read only by `leading_bare_count` and
/// `rack_bare_count`, which each accept one fixed shape, never a rack's own
/// designation ("BRU-42 Mk-82").
fn count_before(toks: &[String], at: usize) -> Option<u32> {
    let before = toks.get(at.checked_sub(1)?)?;
    if before == "x" {
        return positive(toks.get(at.checked_sub(2)?)?);
    }
    positive(before.strip_suffix('x')?)
}

/// A bare number that is the whole of the name before the weapon: "2 Mk-81",
/// "3 GBU-12", "2 GBU-38 */*". The weapon's own name has to start at the second
/// token, so "100 gal. Drop Tank" (no rule) and "250 lb GP Mk.I" are never
/// read, and nothing that comes before a rack ("TER-9A 3 Mk-82") is.
fn leading_bare_count(toks: &[String], at: usize) -> Option<u32> {
    if at != 1 {
        return None;
    }
    positive(&toks[0])
}

/// A bare number after one of the `COUNTING_RACKS`: "MAK79 3 Mk-82". The rack is
/// the first token, the number is the second and the weapon's own name starts
/// the third.
fn rack_bare_count(toks: &[String], at: usize) -> Option<u32> {
    if at != 2 || !COUNTING_RACKS.contains(&toks[0].as_str()) {
        return None;
    }
    positive(&toks[1])
}

/// The number a name ends in, and the text before it with the blanks between
/// them dropped: "GBU-12 * 2" is (2, "GBU-12 *"). A number that is not a whole
/// positive count is not one, and neither is a name that ends in anything else.
/// This runs on the raw name, because the tokenizer drops a "*".
fn trailing_number(name: &str) -> Option<(u32, &str)> {
    let name = name.trim_end();
    let head = name.trim_end_matches(|c: char| c.is_ascii_digit());
    let count = positive(&name[head.len()..])?;
    Some((count, head.trim_end()))
}

/// N in a name that ends "* N": "GBU-12 * 2", "Mk-82 AIR * 6", "Mk 84*28".
fn trailing_star_count(name: &str) -> Option<u32> {
    let (count, head) = trailing_number(name)?;
    head.ends_with('*').then_some(count)
}

/// N in a name that ends "x N": "AUF2 GBU-12 x 2", "BAP-100 x 12". Only at the
/// very end, and only for an "x" that stands alone (not the end of "Mk-82x3").
/// An "x N" in the middle of a name ("BLU-3B x 27, HE", "SUU-25 x 8 LUU-2") is
/// a count of bomblets or flares, never of the store, and is not read.
fn trailing_x_count(name: &str) -> Option<u32> {
    let (count, head) = trailing_number(name)?;
    let before_x = head.strip_suffix(|c: char| c == 'x' || c == 'X')?;
    before_x.chars().next_back().map_or(true, |c| !c.is_alphanumeric()).then_some(count)
}

/// How many a bomb, missile or cluster store holds, or one when the name says
/// nothing. The forms, in the order they are tried (the first to give a count
/// wins, and no real name matches two):
///
/// 1. "X with N x ..." (`with_count`);
/// 2. an "N x" or "Nx" straight before the weapon's own name (`count_before`);
/// 3. a trailing "* N" ("GBU-12 * 2");
/// 4. a bare number that opens the name, straight before the weapon ("2 Mk-81");
/// 5. a bare number after a rack in `COUNTING_RACKS` ("MAK79 3 Mk-82");
/// 6. a trailing "x N" ("AUF2 GBU-12 x 2").
///
/// A cluster bomb's submunitions ("247 x HEAT Bomblets") come after the weapon's
/// name and are never read, and neither is any other number: a rack's own
/// designation ("BRU-42 Mk-82") stays at one.
fn store_count(name: &str, toks: &[String], rule: &StoreRule) -> u32 {
    let at = run_start(toks, &tokens(rule.pattern));
    with_count(toks)
        .or_else(|| at.and_then(|at| count_before(toks, at)))
        .or_else(|| trailing_star_count(name))
        .or_else(|| at.and_then(|at| leading_bare_count(toks, at)))
        .or_else(|| at.and_then(|at| rack_bare_count(toks, at)))
        .or_else(|| trailing_x_count(name))
        .unwrap_or(1)
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
            // DCS also spells it "SnakeEye"; that is the retarded bomb, never mk82.
            ("Mk-82 SnakeEye", weapon("mk82se", 1)),
            ("GDJ-II19 - 2 x Mk-82 SnakeEye", weapon("mk82se", 2)),
            ("MAK79 3 Mk-82 SnakeEye", weapon("mk82se", 3)),
            ("Mk-82 SnakeEye * 3", weapon("mk82se", 3)),
            // The Mirage F1 spells it "Snakeyes": still the retarded bomb, never mk82.
            ("AUF2 MK-82 Snakeyes x 2", weapon("mk82se", 2)),
            ("Mk-82 Snakeyes", weapon("mk82se", 1)),
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
            ("AUF2 ROCKEYE x 2", weapon("mk20", 2)),
            ("Mk-20 Rockeye * 3", weapon("mk20", 3)),
            ("MAK79 2 MK-20", weapon("mk20", 2)),
            ("MAK79 MK-20", weapon("mk20", 1)),
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
            ("AUF2 SAMP-250 HD x 2", weapon("samp250hd", 2)),
            ("AUF2 SAMP-250 x 2", weapon("samp250", 2)),
        ];
        for (name, expected) in cases {
            assert_eq!(classify_store(name), *expected, "{name:?}");
        }
    }

    /// Real DCS display names (the public pydcs weapons list, and the A-4E-C mod's
    /// own weapon file) for the bombs added 2026-11-13. A rack's count is "with
    /// N x", an "N x" / "Nx" straight before the weapon's name, or one of the bare
    /// forms ("MAK79 3 Mk-81", "2 Mk-81", "BLU-107 * 3"); a rack's own number
    /// ("CLB 30 - Mk-83") is not one.
    #[test]
    fn mk81_mk83_br_and_durandal_names_become_weapon_ids_and_counts() {
        let cases: &[(&str, StoreClass)] = &[
            // Mk-81, in each shape a rack gives its name. The F-14's "MAK79 N" and
            // a leading "N" are counts.
            ("Mk-81 - 250lb GP Bomb LD", weapon("mk81", 1)),
            ("3x Mk-81 - 250lb GP Bomb LD (TER)", weapon("mk81", 3)),
            ("6x Mk-81 - 250lb GP Bomb LD (MER)", weapon("mk81", 6)),
            ("BRU-42 with 3 x Mk-81 - 250lb GP Bombs LD", weapon("mk81", 3)),
            ("(Special Weapons Adapter) Mk-81 - 250lb GP Bomb LD", weapon("mk81", 1)),
            ("(Special Weapons Adapter) 2x Mk-81 - 250lb GP Bomb LD (TER)", weapon("mk81", 2)),
            ("MAK79 3 Mk-81", weapon("mk81", 3)),
            ("MAK79 4 Mk-81", weapon("mk81", 4)),
            ("2 Mk-81", weapon("mk81", 2)),
            // The A-4E-C writes the count as "N x" with spaces, and has a Snakeye.
            ("6 x Mk-81 - 250lb GP Bomb LD (MER)", weapon("mk81", 6)),
            ("Mk-81 Snakeye - 250lb GP Bomb HD", weapon("mk81se", 1)),
            ("6 x Mk-81 Snakeye - 250lb GP Bomb HD (MER)", weapon("mk81se", 6)),
            // Mk-83: the low-drag bomb in each rack, and the retarded one.
            ("Mk-83 - 1000lb GP Bomb LD", weapon("mk83", 1)),
            ("Mk-83", weapon("mk83", 1)),
            ("BRU-33 with 2 x Mk-83 - 1000lb GP Bomb LD", weapon("mk83", 2)),
            ("3x Mk-83 - 1000lb GP Bomb LD (MER) Ripple", weapon("mk83", 3)),
            ("MER2 with 2 x Mk-83 - 1000lb GP Bombs LD", weapon("mk83", 2)),
            ("CLB 30 - Mk-83 - 1000lb GP Bomb LD", weapon("mk83", 1)),
            ("MAK79 Mk-83", weapon("mk83", 1)),
            ("Mk-83 AIR (BSU-85) - 1000 lb GP Chute Retarded Bomb HD", weapon("mk83air", 1)),
            ("BRU-33 with 2 x Mk-83 AIR (BSU-85) - 1000 lb GP Chute Retarded Bomb HD", weapon("mk83air", 2)),
            ("Mk-83 AIR", weapon("mk83air", 1)),
            ("Mk-83AIR", weapon("mk83air", 1)),
            ("MAK79 3 Mk-83AIR", weapon("mk83air", 3)),
            ("MAK79 Mk-83AIR", weapon("mk83air", 1)),
            // "Mk-83CT" is another bomb, with no row: the token is "83ct", not "83".
            ("Mk-83CT", StoreClass::Unrecognised),
            // The French bombs.
            ("BR-250 - 250kg GP Bomb LD", weapon("br250", 1)),
            ("AUF 2 - 2 x BR-250 - 250kg GP Bomb LD", weapon("br250", 2)),
            ("CLB 4 - 4 x BR-250 - 250kg GP Bomb LD", weapon("br250", 4)),
            ("BR-500 - 500kg GP Bomb LD", weapon("br500", 1)),
            // The Durandal is the high-drag row, with or without a word of drag in
            // its name.
            (
                "BLU-107/B Durandal - 219kg Concrete Piercing Chute Retarded Bomb w/Booster",
                weapon("blu107", 1),
            ),
            (
                "AUF 2 - 2 x BLU-107/B Durandal - 219kg Concrete Piercing Chute Retarded Bomb w/Booster",
                weapon("blu107", 2),
            ),
            (
                "6x BLU-107/B Durandal - 219kg Concrete Piercing Chute Retarded Bomb w/Booster (MER)",
                weapon("blu107", 6),
            ),
            (
                "(Special Weapons Adapter) 3x BLU-107/B Durandal - 219kg Concrete Piercing Chute Retarded Bomb w/Booster (TER)",
                weapon("blu107", 3),
            ),
            ("BLU-107 - 440lb Anti-Runway Penetrator Bomb", weapon("blu107", 1)),
            ("MER6 with 6 x BLU-107 - 440lb Anti-Runway Penetrator Bombs", weapon("blu107", 6)),
            ("BLU-107 * 3", weapon("blu107", 3)),
            ("BLU-107 * 6", weapon("blu107", 6)),
        ];
        for (name, expected) in cases {
            assert_eq!(classify_store(name), *expected, "{name:?}");
        }
    }

    /// Real DCS display names for the cluster bombs added 2026-11-13. The
    /// submunition counts ("202 x", "10 x", "147", "27x19") and the words "CEM",
    /// "SFW" and "with" in a name are never a count and never another row: only
    /// the designation picks the row.
    #[test]
    fn cbu_103_cbu_105_bl_755_and_the_dispenser_pods_become_weapon_ids_and_counts() {
        let cases: &[(&str, StoreClass)] = &[
            // The WCMD bombs. "10 x SFW" is not a count and "SFW" is not a CBU-97;
            // "202 x CEM" is not a count and "CEM" is not a CBU-87.
            ("CBU-103 - 202 x CEM, CBU with WCMD", weapon("cbu103", 1)),
            ("CBU-105 - 10 x SFW, CBU with WCMD", weapon("cbu105", 1)),
            ("BRU-57 with 2 x CBU-103 - 202 x CEM, CBU with WCMD", weapon("cbu103", 2)),
            ("BRU-57 with 2 x CBU-105 - 10 x SFW, CBU with WCMD", weapon("cbu105", 2)),
            ("HSAB - 8 x CBU-103 - 202 x CEM, CBU with WCMD", weapon("cbu103", 8)),
            ("SECBM - 10 x CBU-105 - 10 x SFW, CBU with WCMD", weapon("cbu105", 10)),
            ("CBU-103 * 3", weapon("cbu103", 3)),
            ("CBU-105 * 3", weapon("cbu105", 3)),
            // The BL-755.
            ("BL-755 CBU - 450kg, 147 Frag/Pen bomblets", weapon("bl755", 1)),
            ("2 x BL-755 CBUs - 450kg, 147 Frag/Pen bomblets", weapon("bl755", 2)),
            ("3x BL-755 - 147 Frag/Pen bomblets (TER)", weapon("bl755", 3)),
            ("1x BL-755 - 147 Frag/Pen bomblets (TER)", weapon("bl755", 1)),
            // The F-4E's dispenser pods.
            ("CBU-1/A pod - 19 x tubes of Bomblets BLU-3B x 27, HE", weapon("cbu1a", 1)),
            ("CBU-2/A pod - 19 x tubes of Bomblets BLU-3B x 19, HE", weapon("cbu2a", 1)),
            ("CBU-2B/A pod - 19 x tubes of Bomblets BLU-3B x 22, HE", weapon("cbu2ba", 1)),
            ("2x CBU-1A/A x 27x19 (513) BLU-4B Bomblets, HE (MER)", weapon("cbu1a", 2)),
            ("2x CBU-2/A x 19x19 (361) BLU-3 Bomblets, HE (MER)", weapon("cbu2a", 2)),
            ("2x CBU-2B/A x 22x19 (418) BLU-3B Bomblets, HE (MER)", weapon("cbu2ba", 2)),
            ("1x CBU-2/A x 19x19 (361) BLU-3 Bomblets, HE (MER)", weapon("cbu2a", 1)),
            // The F-100 mod's spelling ("CBU-2A"), which the F-4E tables also use.
            ("CBU-2A x 19x19 (361) Bomblets - BLU-3 x 19, HE Bomblets, HE", weapon("cbu2a", 1)),
            ("CBU-1A x 27x19 (513) Bomblets - BLU-4B x 27, HE Bomblets, HE", weapon("cbu1a", 1)),
            ("CBU-2B/A x 22x19 (418) Bomblets - BLU-3B x 22, HE Bomblets, HE", weapon("cbu2ba", 1)),
            // The A-4E-C mod's own names: a bare dispenser, and a count in front of
            // the rack's.
            ("CBU-1A/A x 27x19 (513) BLU-4B Bomblets, HE", weapon("cbu1a", 1)),
            ("CBU-2/A x 19x19 (361) BLU-3 Bomblets, HE", weapon("cbu2a", 1)),
            ("CBU-2B/A x 22x19 (418) BLU-3B Bomblets, HE", weapon("cbu2ba", 1)),
            ("2 x CBU-1A/A x 27x19 (513) BLU-4B Bomblets, HE (TER)", weapon("cbu1a", 2)),
            ("2 x CBU-2/A x 19x19 (361) BLU-3 Bomblets, HE (TER)", weapon("cbu2a", 2)),
            ("2 x CBU-2B/A x 22x19 (418) BLU-3B Bomblets, HE (TER)", weapon("cbu2ba", 2)),
        ];
        for (name, expected) in cases {
            assert_eq!(classify_store(name), *expected, "{name:?}");
        }
    }

    /// A high-drag name must never land on one of the new low-drag rows. The Mk-81
    /// and Mk-83 have retarded variants of their own (the Snakeye, the AIR); a
    /// retarded name that fits none of them has no row, so it is unrecognised, as
    /// a retarded Mk-84 is. The low-drag names beside them still map.
    #[test]
    fn a_high_drag_name_never_lands_on_the_new_low_drag_bomb_rows() {
        for name in [
            "Mk-83 Retarded - 1000lb GP Bomb HD",
            "Mk-83 - 1000lb GP Chute Retarded Bomb HD",
            "Mk-81 - 250lb GP Bomb HD",
            "Mk-81 Retarded - 250lb GP Bomb HD",
            "BR-250 - 250kg GP Chute Retarded Bomb HD",
            "BR-500 Retarded",
        ] {
            assert_eq!(classify_store(name), StoreClass::Unrecognised, "{name:?}");
        }
        assert_eq!(classify_store("Mk-83 - 1000lb GP Bomb LD"), weapon("mk83", 1));
        assert_eq!(classify_store("Mk-81 - 250lb GP Bomb LD"), weapon("mk81", 1));
        assert_eq!(classify_store("BR-250 - 250kg GP Bomb LD"), weapon("br250", 1));
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

    /// "with N x" and an "N x" / "Nx" right before the weapon's own name are
    /// counts. A submunition count after the name is not, and neither is the
    /// first "N x" anywhere (the bare forms are in the tests below).
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

    /// Only the known bare forms are counts. A rack's own number is a
    /// designation, and a count of 42 from "BRU-42" would load a jet with weapons
    /// it cannot hold. The names before the line are still ones; the ones after
    /// it were pinned at one until 2026-11-13 and are counts now.
    #[test]
    fn only_the_known_bare_forms_are_counts_a_designation_is_never_one() {
        let cases: &[(&str, StoreClass)] = &[
            // Designations: a rack's own number, and a number that is not first.
            ("BRU-42 Mk-82 - 500lb GP Bomb LD", weapon("mk82", 1)),
            ("TER-9A 3 Mk-82 - 500lb GP Bomb LD", weapon("mk82", 1)),
            ("BRU-42 CBU-99 - 490lbs, 247 x HEAT Bomblets", weapon("cbu99", 1)),
            // Counts, by form: "MAK79 N", a leading number, a trailing "x N".
            ("MAK79 2 MK-20", weapon("mk20", 2)),
            ("2 Mk-82 - 500lb GP Bomb LD", weapon("mk82", 2)),
            ("Mk-82 x 3", weapon("mk82", 3)),
        ];
        for (name, expected) in cases {
            assert_eq!(classify_store(name), *expected, "{name:?}");
        }
    }

    /// Form 1: a name that ends "* N" (41 DCS names are written so; the star is
    /// dropped by the tokenizer, so this reads the raw name).
    #[test]
    fn a_trailing_star_number_is_a_count() {
        let cases: &[(&str, StoreClass)] = &[
            ("GBU-12 * 2", weapon("gbu12", 2)),
            ("GBU-12 * 4", weapon("gbu12", 4)),
            ("GBU-10 * 2", weapon("gbu10", 2)),
            ("GBU-38 * 3", weapon("gbu38", 3)),
            ("GBU-31(V)1/B * 2", weapon("gbu31", 2)),
            ("Mk-82 * 6", weapon("mk82", 6)),
            ("Mk-82 AIR * 6", weapon("mk82air", 6)),
            ("Mk-82 SnakeEye * 2", weapon("mk82se", 2)),
            ("Mk-84 * 2", weapon("mk84", 2)),
            ("CBU-87 * 3", weapon("cbu87", 3)),
            ("CBU-97 * 6", weapon("cbu97", 6)),
            ("Mk-20 Rockeye * 3", weapon("mk20", 3)),
            ("BLU-107 * 3", weapon("blu107", 3)),
            // No space before the number, and a big one.
            ("Mk 84*28", weapon("mk84", 28)),
            // Not counts: a name that ends in a number that is not "* N", a star
            // with no number, a zero, a number too big for a count, and a "* N"
            // that is not at the very end.
            ("Mk-83", weapon("mk83", 1)),
            ("GBU-31(V)3/B", weapon("gbu31", 1)),
            ("Mk-82 *", weapon("mk82", 1)),
            ("Mk-82 * 0", weapon("mk82", 1)),
            ("Mk-82 * 99999999999", weapon("mk82", 1)),
            ("Mk-82 * 3 - 500lb GP Bomb LD", weapon("mk82", 1)),
        ];
        for (name, expected) in cases {
            assert_eq!(classify_store(name), *expected, "{name:?}");
        }
    }

    /// Form 2: a bare number that opens the name and sits right before the
    /// weapon ("2 Mk-81", and the "2 GBU-12 */*" the BRU-42 writes). The weapon
    /// has to start at the second token.
    #[test]
    fn a_bare_number_that_opens_the_name_is_a_count() {
        let cases: &[(&str, StoreClass)] = &[
            ("2 Mk-81", weapon("mk81", 2)),
            ("3 Mk-81", weapon("mk81", 3)),
            ("2 Mk-82", weapon("mk82", 2)),
            ("3 Mk-83", weapon("mk83", 3)),
            ("3 GBU-12", weapon("gbu12", 3)),
            ("2 GBU-12 *-*", weapon("gbu12", 2)),
            ("2 GBU-38 */*", weapon("gbu38", 2)),
            ("2 CBU-99 *\\*", weapon("cbu99", 2)),
            ("2 MK-20", weapon("mk20", 2)),
            ("2 Mk-82 Snakeye *\\*", weapon("mk82se", 2)),
            ("2 Mk-82 SnakeEye", weapon("mk82se", 2)),
            ("2 Mk-82AIR", weapon("mk82air", 2)),
            ("3 Mk-82 AIR", weapon("mk82air", 3)),
            // Not counts: a zero; the weapon's name starting later than the
            // second token (a rack before it); and names with no rule, which this
            // form never reads ("12 AN-M64" is a known gap, not a decision).
            ("0 Mk-82", weapon("mk82", 1)),
            ("2 TER-9A Mk-82", weapon("mk82", 1)),
            ("100 gal. Drop Tank", StoreClass::Skipped(SkipReason::FuelTank)),
            ("12 AN-M64 - 500lb GP Bomb LD", StoreClass::Unrecognised),
        ];
        for (name, expected) in cases {
            assert_eq!(classify_store(name), *expected, "{name:?}");
        }
        let payload = json!(["12 AN-M64 - 500lb GP Bomb LD"]);
        assert_eq!(loadout_from_payload(Some(&payload), reference())[0].quantity, 1);
    }

    /// Form 3: the F-14's "MAK79 N <weapon>". The rack is on an explicit
    /// allow-list; any other rack's number is its designation.
    #[test]
    fn a_bare_number_after_the_mak79_rack_is_a_count() {
        let cases: &[(&str, StoreClass)] = &[
            ("MAK79 3 Mk-82", weapon("mk82", 3)),
            ("MAK79 4 Mk-82", weapon("mk82", 4)),
            ("MAK79 3 Mk-83", weapon("mk83", 3)),
            ("MAK79 2 MK-20", weapon("mk20", 2)),
            ("MAK79 2 CBU-99", weapon("cbu99", 2)),
            ("MAK79 4 Mk-82 SnakeEye", weapon("mk82se", 4)),
            ("MAK79 3 Mk-82AIR", weapon("mk82air", 3)),
            ("mak79 3 mk-82", weapon("mk82", 3)),
            // Not counts: no number, a zero, and the racks whose number is a
            // designation (BRU-42, CLB 30) or that nothing says is a count (TER-9A).
            ("MAK79 Mk-83", weapon("mk83", 1)),
            ("MAK79 0 Mk-82", weapon("mk82", 1)),
            ("BRU-42 Mk-82", weapon("mk82", 1)),
            ("BRU-42 3 Mk-82", weapon("mk82", 1)),
            ("CLB 30 - Mk-83 - 1000lb GP Bomb LD", weapon("mk83", 1)),
            ("TER-9A 3 Mk-82 - 500lb GP Bomb LD", weapon("mk82", 1)),
        ];
        for (name, expected) in cases {
            assert_eq!(classify_store(name), *expected, "{name:?}");
        }
    }

    /// Form 4: a name that ends "x N" after the weapon (the Mirage F1's AUF2).
    /// An "x N" in the middle of a name is bomblets or flares, never the store.
    #[test]
    fn a_trailing_x_number_is_a_count() {
        let cases: &[(&str, StoreClass)] = &[
            ("AUF2 GBU-12 x 2", weapon("gbu12", 2)),
            ("AUF2 MK-82 x 2", weapon("mk82", 2)),
            ("AUF2 MK-82 Air x 2", weapon("mk82air", 2)),
            ("AUF2 MK-82 Snakeyes x 2", weapon("mk82se", 2)),
            ("AUF2 ROCKEYE x 2", weapon("mk20", 2)),
            ("AUF2 BLG-66-AC x 2", weapon("blg66", 2)),
            ("AUF2 SAMP-250 x 2", weapon("samp250", 2)),
            ("AUF2 SAMP-250 HD x 2", weapon("samp250hd", 2)),
            ("Mk-82 x 3", weapon("mk82", 3)),
            ("Mk-82 X 3", weapon("mk82", 3)),
            ("Mk-82 x3", weapon("mk82", 3)),
            // Not counts: the bomblets in a dispenser's name, a zero, a bare "x",
            // and an "x N" that is not at the very end.
            ("CBU-1/A pod - 19 x tubes of Bomblets BLU-3B x 27, HE", weapon("cbu1a", 1)),
            ("CBU-87 - 202 x CEM Cluster Bomb", weapon("cbu87", 1)),
            ("Mk-82 x 0", weapon("mk82", 1)),
            ("Mk-82 x", weapon("mk82", 1)),
            ("Mk-82 x 3 - 500lb GP Bomb LD", weapon("mk82", 1)),
        ];
        for (name, expected) in cases {
            assert_eq!(classify_store(name), *expected, "{name:?}");
        }
        // The helpers on their own, for shapes no rule would match: an "x" that is
        // the end of another word is not a count marker, and a flare dispenser's
        // "x 8" is mid-name.
        assert_eq!(trailing_x_count("BAP-100 x 12"), Some(12));
        assert_eq!(trailing_x_count("FAB-100 x 4"), Some(4));
        assert_eq!(trailing_x_count("BAP-100x12"), None);
        assert_eq!(trailing_x_count("SUU-25 x 8 LUU-2"), None);
        assert_eq!(trailing_x_count("BLU-3B x 27, HE"), None);
    }

    /// The forms are tried in the order `store_count` lists them, and the two
    /// explicit rack counts come first: a bare number never overrides "with N x"
    /// or an "N x" before the weapon. Of the bare forms a leading number beats a
    /// trailing "x N" (no real name has both; this pins the order).
    #[test]
    fn an_explicit_rack_count_wins_over_a_bare_one() {
        let cases: &[(&str, StoreClass)] = &[
            ("TER-9A with 3 x Mk-82 - 500lb GP Bomb LD * 2", weapon("mk82", 3)),
            ("MAK79 4 x Mk-82 x 2", weapon("mk82", 4)),
            ("2 Mk-82 x 6", weapon("mk82", 2)),
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
            // The Mirage F1's "Snakeyes" is a drag word like "Snakeye": on a bomb
            // with no retarded row it must not fall through to the low-drag one.
            "AUF2 MK-84 Snakeyes x 2",
            // A bare "AIR" (the retarding tail) with no other drag word: there is
            // no Mk-84 AIR row, so these must not load as the slick Mk-84.
            "Mk-84 AIR * 2",
            "Mk-84 AIR TP * 2",
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
            // No row and no rule, now or planned: the F-4E's Shrike, in the three
            // shapes DCS writes it. (It was the BL-755 until that got a row on
            // 2026-11-13, and the Mk-20 Rockeye before that. When the Shrike gets
            // one, pick another store the tool has no row for.)
            "AGM-45A Shrike ARM (LAU-34)",
            "AGM-45B Shrike ARM",
            "LAU-118A - AGM-45A Shrike ARM",
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
            "AGM-45A Shrike ARM (LAU-34)",
            "GBU-12 - 500lb Laser Guided Bomb",
            "LAU-131 pod - 7 x 2.75 Hydra, UnGd Rkts M257, Para Illum",
            "AGM-45A Shrike ARM (LAU-34)",
        ]);
        let loadout = loadout_from_payload(Some(&payload), reference());
        let lines: Vec<(Option<&str>, &str, u32)> =
            loadout.iter().map(|l| (l.weapon_id.as_deref(), l.name.as_str(), l.quantity)).collect();
        assert_eq!(
            lines,
            vec![
                (Some("mk82"), "Mk-82 LDGP", 6),
                (Some("gbu12"), "GBU-12 Paveway II", 2),
                (None, "AGM-45A Shrike ARM (LAU-34)", 2),
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

    // ---- CLI pylons (CLSIDs) -------------------------------------------

    /// A loadout as (weapon id, name, quantity) lines.
    fn lines(loadout: &[ImportedStore]) -> Vec<(Option<&str>, &str, u32)> {
        loadout.iter().map(|l| (l.weapon_id.as_deref(), l.name.as_str(), l.quantity)).collect()
    }

    /// `lookup` binary-searches, so a table out of order loses entries silently,
    /// and a duplicate CLSID would answer with whichever copy the search hit.
    /// The generator sorts and de-duplicates; this is what keeps a hand edit or
    /// a bad regeneration from slipping through.
    #[test]
    fn the_clsid_table_is_sorted_by_clsid_with_no_duplicates() {
        assert!(CLSID_NAMES.len() > 2000, "the table is the pydcs list plus the A-4E-C mod's");
        for pair in CLSID_NAMES.windows(2) {
            assert!(pair[0].0 < pair[1].0, "{:?} must come before {:?}", pair[0].0, pair[1].0);
        }
        // No empty keys or names, and no CLI placeholder for an empty pylon.
        for (clsid, name) in CLSID_NAMES {
            assert!(!clsid.trim().is_empty() && !name.trim().is_empty(), "{clsid:?} -> {name:?}");
            assert!(!clsid.eq_ignore_ascii_case(EMPTY_PYLON), "an empty pylon is not a store");
        }
    }

    /// DCS spells its CLSIDs three ways: a GUID in braces, a readable name in
    /// braces, and a readable name with none. The A-4E-C names are rebuilt from
    /// the mod's Lua, and carry the counts the rack names do.
    #[test]
    fn a_clsid_in_each_of_dcs_spellings_gives_its_dcs_name() {
        let cases = [
            // A GUID.
            ("{DB769D48-67D7-42ED-A2BE-108D566C8B1E}", "GBU-12 - 500lb Laser Guided Bomb"),
            ("{BCE4E030-38E9-423E-98ED-24BE3DA87C32}", "Mk-82 - 500lb GP Bomb LD"),
            // A readable name, with and without braces.
            ("{HB_F4E_MK-82_6x}", "6x Mk-82 - 500lb GP Bomb LD (MER)"),
            ("{HB_F4E_CBU-87_MER_4x}", "4x CBU-87 - 202 x CEM Cluster Bomb (MER)"),
            ("LAU-115_2*LAU-127_AIM-120C", "LAU-115: 2 x LAU-127 - 2 x AIM-120C AMRAAM - Active Radar AAM"),
            ("{LAU_34_AGM_45A}", "AGM-45A Shrike ARM (LAU-34)"),
            // Built by the A-4E-C mod's Lua, not in pydcs.
            ("{Mk-82_TER_3_C}", "3 x Mk-82 - 500lb GP Bomb LD (TER)"),
            ("{Mk-81_MER_5_L}", "5 x Mk-81 - 250lb GP Bomb LD (MER)"),
            ("{C_A4E_AGM-45B_LAU34}", "AGM-45B Shrike ARM (LAU-34)"),
            ("{DFT-300gal}", "Fuel Tank 300 gallons"),
            ("{A4E-ASQ-T50-ON-ADAPTER}", "LAU-7 with AN/ASQ-T50 TCTS Pod - ACMI Pod"),
        ];
        for (clsid, name) in cases {
            assert_eq!(clsid_name(clsid), Some(name), "{clsid}");
        }
        for unknown in ["", "{NOT_A_REAL_STORE}", "<CLEAN>", "AIM-9Z"] {
            assert_eq!(clsid_name(unknown), None, "{unknown:?}");
        }
    }

    /// The same store written with other braces or other case still finds its
    /// name, but only through the exact match failing first.
    #[test]
    fn a_clsid_missing_its_braces_or_in_other_case_still_finds_its_name() {
        let guid = Some("AIM-120C AMRAAM - Active Radar AAM");
        assert_eq!(clsid_name("{40EF17B7-F508-45de-8566-6FFECC0C1AB8}"), guid);
        assert_eq!(clsid_name("40EF17B7-F508-45de-8566-6FFECC0C1AB8"), guid);
        assert_eq!(clsid_name("{40ef17b7-f508-45DE-8566-6ffecc0c1ab8}"), guid);
        assert_eq!(clsid_name("  {40EF17B7-F508-45de-8566-6FFECC0C1AB8}  "), guid);
        // A name the table keeps without braces is found with them, too.
        assert_eq!(clsid_name("{LAU-115_2*LAU-127_AIM-120C}"), clsid_name("LAU-115_2*LAU-127_AIM-120C"));
        assert!(clsid_name("LAU-115_2*LAU-127_AIM-120C").is_some());
        assert_eq!(clsid_name("hb_f4e_mk-82_6x"), Some("6x Mk-82 - 500lb GP Bomb LD (MER)"));
    }

    /// Where two table entries differ only in braces or case, an inexact CLSID
    /// is only matched when they agree on the name. Otherwise it is not known
    /// which was meant, so it is not known at all. The exact spelling always wins.
    #[test]
    fn a_clsid_that_two_entries_claim_with_different_names_is_unknown() {
        static TABLE: &[(&str, &str)] = &[
            ("AGREE", "Same name"),
            ("DISAGREE", "First name"),
            ("{AGREE}", "Same name"),
            ("{DISAGREE}", "Second name"),
            ("{ONLY}", "One name"),
        ];
        assert_eq!(lookup(TABLE, "agree"), Some("Same name"));
        assert_eq!(lookup(TABLE, "{Agree}"), Some("Same name"));
        assert_eq!(lookup(TABLE, "only"), Some("One name"));
        assert_eq!(lookup(TABLE, "disagree"), None, "two entries, two names");
        assert_eq!(lookup(TABLE, "{disagree}"), None);
        assert_eq!(lookup(TABLE, "DISAGREE"), Some("First name"), "an exact match is never in doubt");
        assert_eq!(lookup(TABLE, "{DISAGREE}"), Some("Second name"));
    }

    /// The shapes `pylons` takes, and what is not a store.
    #[test]
    fn pylon_clsids_reads_the_cli_array_in_pylon_order_and_leaves_out_empty_pylons() {
        let numbered = json!([
            { "number": 1, "CLSID": "{AAA}", "settings": {} },
            { "number": 3, "CLSID": "<CLEAN>", "settings": {} },
            { "number": 4, "CLSID": " {BBB} ", "settings": [] },
            { "number": 5, "CLSID": "", "settings": {} },
            { "number": 6, "settings": {} },
            { "number": 7, "CLSID": 12 },
            "{NOT_AN_OBJECT}",
            null,
            { "number": 9, "CLSID": "<clean>" },
            { "number": 10, "CLSID": "LAU-115_2*LAU-127_AIM-120C" }
        ]);
        assert_eq!(
            pylon_clsids(Some(&numbered)),
            vec!["{AAA}".to_string(), "{BBB}".to_string(), "LAU-115_2*LAU-127_AIM-120C".to_string()]
        );
        // No `number` at all: array order is the pylon order.
        let plain = json!([{ "CLSID": "{B}" }, { "CLSID": "{A}" }]);
        assert_eq!(pylon_clsids(Some(&plain)), vec!["{B}".to_string(), "{A}".to_string()]);
    }

    /// A map keyed by pylon number is read in numeric order ("10" after "2",
    /// not before it), and a key that is not a number is not a pylon.
    #[test]
    fn pylon_clsids_reads_a_map_keyed_by_pylon_number_in_numeric_order() {
        let map = json!({
            "10": { "CLSID": "{TEN}" },
            "2": { "CLSID": "{TWO}" },
            "1": { "CLSID": "<CLEAN>" },
            "x": { "CLSID": "{NOT_A_PYLON}" },
            "9": { "CLSID": "{NINE}" }
        });
        assert_eq!(pylon_clsids(Some(&map)), vec!["{TWO}".to_string(), "{NINE}".to_string(), "{TEN}".to_string()]);
    }

    /// Like `store_names`: a shape we did not expect costs the jet its loadout,
    /// never the import.
    #[test]
    fn pylons_that_are_not_a_list_give_no_stores_and_no_error() {
        assert!(pylon_clsids(None).is_empty(), "a missing payload");
        assert!(pylon_clsids(Some(&json!(null))).is_empty(), "pylons: null");
        assert!(pylon_clsids(Some(&json!([]))).is_empty(), "pylons: []");
        assert!(pylon_clsids(Some(&json!({}))).is_empty(), "pylons: {{}}");
        assert!(pylon_clsids(Some(&json!(12))).is_empty());
        assert!(pylon_clsids(Some(&json!("{AAA}"))).is_empty());
        assert!(pylon_clsids(Some(&json!(["{AAA}", 7]))).is_empty(), "link-style names are not CLI pylons");
        assert!(loadout_from_pylons(None, reference()).is_empty());
        assert!(loadout_from_pylons(Some(&json!(null)), reference()).is_empty());
        assert!(loadout_from_pylons(Some(&json!([{ "CLSID": "<CLEAN>" }])), reference()).is_empty());
    }

    /// The loadout is built by the same merge as a link's: one line per weapon,
    /// summed, in order of first appearance, under the reference row's name; air-
    /// to-air, tanks and pods dropped; a store with no row kept under its DCS name.
    #[test]
    fn a_cli_loadout_merges_pylons_the_way_a_links_does() {
        let pylons = json!([
            { "CLSID": "{40EF17B7-F508-45de-8566-6FFECC0C1AB8}" },
            { "CLSID": "{HB_F4E_MK-82_6x}" },
            { "CLSID": "{DB769D48-67D7-42ED-A2BE-108D566C8B1E}" },
            { "CLSID": "<CLEAN>" },
            { "CLSID": "{F376DBEE-4CAE-41BA-ADD9-B2910AC95DEC}" },
            { "CLSID": "{BCE4E030-38E9-423E-98ED-24BE3DA87C32}" },
            { "CLSID": "{LAU_34_AGM_45A}" },
            { "CLSID": "{DB769D48-67D7-42ED-A2BE-108D566C8B1E}" },
            { "CLSID": "{LAU_34_AGM_45A}" },
            { "CLSID": "{HB_ALQ-131_ON_ADAPTER_IN_AERO7}" }
        ]);
        let loadout = loadout_from_pylons(Some(&pylons), reference());
        assert_eq!(
            lines(&loadout),
            vec![
                (Some("mk82"), "Mk-82 LDGP", 7),
                (Some("gbu12"), "GBU-12 Paveway II", 2),
                (None, "AGM-45A Shrike ARM (LAU-34)", 2),
            ],
            "6 + 1 Mk-82 across two CLSID styles, the Shrike twice, and nothing for the AIM-120, tank and pod"
        );
    }

    /// The point of sharing the merge: a CLI jet and a link jet carrying the same
    /// stores arrive with the same loadout. Each CLSID gives its DCS name, and
    /// the link's names go through `loadout_from_payload`.
    #[test]
    fn a_cli_loadout_equals_the_links_for_the_same_stores() {
        let clsids = [
            "{DB769D48-67D7-42ED-A2BE-108D566C8B1E}",
            "{HB_F4E_MK-82_6x}",
            "{Mk-82_TER_3_C}",
            "{5335D97A-35A5-4643-9D9B-026C75961E52}",
            "{LAU_34_AGM_45A}",
            "{F376DBEE-4CAE-41BA-ADD9-B2910AC95DEC}",
            "{HB_F4E_AIM-7M}",
            "{C_A4E_AGM-45B_LAU34}",
            "{Mk-81_MER_5_L}",
            "{HB_F4E_CBU-87_MER_4x}",
        ];
        let cli = json!(clsids.iter().map(|c| json!({ "CLSID": c })).collect::<Vec<_>>());
        let link = json!(clsids.iter().map(|c| clsid_name(c).expect("a table CLSID")).collect::<Vec<_>>());
        let from_cli = loadout_from_pylons(Some(&cli), reference());
        assert_eq!(from_cli, loadout_from_payload(Some(&link), reference()));
        assert!(from_cli.len() >= 6, "the comparison is not an empty one: {from_cli:?}");
    }

    /// A CLSID the table does not have is never dropped and never guessed at. It
    /// is not classified, even when its letters look like a skipped store ("AIM")
    /// or a weapon ("MK-82"): a name made up from them could hide a bomb or load
    /// one that is not there. It stays on the loadout under the CLSID itself,
    /// merged with itself, and unflagged as a weapon row.
    #[test]
    fn an_unknown_clsid_stays_on_the_loadout_under_its_own_name_unclassified() {
        let pylons = json!([
            { "CLSID": "{NEW_MODULE_AIM-9Z}" },
            { "CLSID": "{NEW_MODULE_MK-82_PACK}" },
            { "CLSID": "{DB769D48-67D7-42ED-A2BE-108D566C8B1E}" },
            { "CLSID": "{NEW_MODULE_AIM-9Z}" },
            { "CLSID": "{NEW_MODULE_FUEL_TANK}" }
        ]);
        let loadout = loadout_from_pylons(Some(&pylons), reference());
        assert_eq!(
            lines(&loadout),
            vec![
                (None, "{NEW_MODULE_AIM-9Z}", 2),
                (None, "{NEW_MODULE_MK-82_PACK}", 1),
                (Some("gbu12"), "GBU-12 Paveway II", 1),
                (None, "{NEW_MODULE_FUEL_TANK}", 1),
            ]
        );
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
