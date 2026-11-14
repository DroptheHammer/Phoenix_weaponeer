# Build sessions plan (planned 2026-11-13)

**Status (2026-11-13, end of day):** Sessions 1–4 are built and on `main`
(unreleased): `1c64857`, `9428a2d`, `0532f23`, `2490b84`. Decisions taken
along the way are in each commit, `ROADMAP.md` and the memory system. Two
that bear on Session 5:
- **A floor blocks saving.** A release below `frag_min_safe_alt_ft` or
  `min_release_alt_ft` is an error, and `canSave` is false on any error. Say
  so whenever a loft floor or check is proposed.
- **Level-only weapons** (`LEVEL_ONLY_WEAPON_IDS` in `src/lib/weaponClass.ts`,
  today just the Durandal) are filtered in `autoBuildAttack`'s candidate list.
  A loft profile must not be offered to them.

**Session 5 (loft) is built too** (2026-11-14, on `main`, unreleased):
`e33e899` (the sourced model) and `27908a6` (picture, editor, card, checks),
checked on screen by the user. All five sessions are done; this plan is
finished and can move to `docs/archive/`.

Five roadmap build candidates, one session each. Each section is meant to be
picked up cold at the start of its session. Recommended order: 1 → 2 → 3 → 4
→ 5. Sessions 1 and 2 are small and touch the same file (`store_mapping.rs`),
so they can share a session. Session 3 benefits from 1, because more stores
will be known. Session 5 is the big one.

**Standing rules for every session**

- Opus orchestrates and Sonnet builds. Read every diff, and prove each new test
  can fail.
- **No invented numbers.** A weapon field is filled only with a cited source,
  and the source goes in `notes`.
- The repo is public: name no missions or people. Captured missions stay in
  `test-data/private/`.
- Gates at the end: `npm run geo-check`, both cargo test suites,
  `npm run build`, and a green "Web app (GitHub Pages)" run.
- Look-and-feel goes in front of the user in `npm run tauri dev` before it is
  committed.

---

## Session 1: Rows for the bombs that have none

**Goal:** name-only rows for Mk-81, Mk-83, CBU-103, CBU-105, BL-755, CBU-1/A,
CBU-2/A, BLU-107 Durandal, BR-250 and BR-500, carried by the right aircraft.
Link import then recognises them.

**Pattern to repeat:** commits `9bc1aad` (rows) and `9523a09` (import rules).

- `crates/core/data/reference.json`:
  - a `weapons` row each: `weight_lbs: 0`, every number and
    `dcs_weapon_name` null, and `notes` containing "Name only";
  - an `aircraft_weapons` row per carrier, with
    `station: 0, max_quantity: 1`.
- Carriage is sourced from the pydcs pylon tables (`dcs/planes.py`), and for
  the A-4E-C from the community mod's `A-4E-C.lua`. `raw.githubusercontent.com`
  needs allowing once per session.
- `crates/core/src/refdata.rs`:
  - add the new ids to `the_name_only_rows_carry_no_numbers`;
  - rename `the_thirty_nine_weapon_names_are_pinned_by_id` for the new count,
    and add the names;
  - update `what_each_aircraft_carries_is_pinned`;
  - check `every_weapon_row_is_carried_by_at_least_one_aircraft`;
  - update the header's provenance paragraph.
- `crates/core/src/parsers/store_mapping.rs` `STORE_RULES`:
  - `low_drag`/`high_drag` for the unguided bombs (Mk-81, Mk-83, BR-250,
    BR-500);
  - `rule` for the CBUs;
  - real DCS names in a cases test, like
    `cluster_and_samp_names_become_weapon_ids_and_counts`.

**Decisions to take in the session**

- **Durandal's class.** It is parachute-retarded. Either `bomb_unguided` with
  high-drag naming, so `weaponClassOf` (`src/lib/weaponClass.ts`) and
  `weapon_is_of_class` (`profiles.rs`) class it as HD, or another category.
  Ask the user.
- **BL-755 is the tests' example of a store with no row.** Pick a new unrowed
  example and update:
  - `store_mapping.rs`: `anything_unknown_is_unrecognised_rather_than_skipped`
    and the payload merge test;
  - `import.rs`: `a_link_with_loaded_jets_imports_each_jets_air_to_ground_stores`;
  - `test-data/nevada_SYNTHETIC_loaded_jets.json` (Venom 1-3);
  - `test-data/README.md`;
  - `docs/LOADOUT_IMPORT_PLAN.md`;
  - the CLAUDE.md notes.
- If a new row opens a class gap, `KNOWN_CLASS_GAPS` (`profiles.rs`) and its
  test will say so.

**On screen (user):** Venom 1-3's new "not in the weapon table" example, and a
Mk-83 or CBU-103 offered to an F-16C.

---

## Session 2: Rack counts written as a bare number

**Goal:** read the count in `MAK79 2 MK-20`, `Mk-20 Rockeye * 3`,
`AUF2 ROCKEYE x 2` and the like, without ever turning a rack designation
(BRU-42, `TER-9A 3`) into a count.

**Facts**

- No captured link has a bare-count name. Every real one uses `with N x`, or
  the count sits inside a rocket pod's name. These forms come from pydcs and
  Heatblur-style names, so other squadrons' missions will have them before
  ours do.
- Today the count comes from `classify_store`, then `with_count`, then
  `count_before_weapon`, then defaults to 1 (`store_mapping.rs`). The
  tokenizer drops `*`.

**Approach (narrow, evidence-driven)**

1. Pull every store display name from pydcs `weapons_data.py`, plus the
   A-4E-C lua, into a scratch list. Don't commit it.
2. Find every name with a bare or trailing count, and group them by form.
   Expected forms:
   - a leading rack token plus a number (`MAK79 N`);
   - a trailing `* N`;
   - a trailing `x N` after the weapon name.
3. Add explicit forms only, each one listed in a doc comment. Run the whole
   pydcs list through the old code and the new. **Every name whose count
   changes goes in a review table, and every one must be right.** That diff is
   the session's real test.
4. Flip today's pinning tests on purpose:
   - `a_bare_number_before_the_weapon_is_never_a_count`;
   - the count-of-one expectations in
     `cluster_and_samp_names_become_weapon_ids_and_counts`.

   Keep the BRU-42, `TER-9A 3` and lone-`2 Mk-82` cases at one.

The trailing `Mk-82 x 3` is pinned at one today. Whether it becomes a count is
decided from the evidence in step 2.

**On screen:** nothing new to look at. The tests cover it.

---

## Session 3: Loadouts from a CLI/.miz import

**Goal:** the CLI import fills each jet's loadout, as the link import does.

**Facts**

- `process_player_group` in `crates/core/src/import.rs` sets
  `loadout: Vec::new()` and takes no `db`. The link path calls
  `store_mapping::loadout_from_payload(payload, db)`, which reads DCS display
  names.
- CLI pylons live at `units[k].payload.pylons`: an array, sometimes `null`, of
  `{number?, CLSID, settings}`. `number` is not always there, so use array
  order. `"<CLEAN>"` means an empty pylon. CLSIDs come in two styles: GUIDs
  and readable names.
- Among the private captures, only the NTTR CLI file has player pylons (22
  distinct CLSIDs). The Sinai CLI files' player units have `pylons: []`.
- No CLSID data is in the repo. `dcs_weapon_name` (filled on 21 rows) is not
  used by import.

**Approach**

1. **A generated CLSID → display-name table.**
   - Follow the pattern of `scripts/gen-airfields.mjs` →
     `parsers/airfields_data.rs`, pinned to one pydcs commit.
   - Keep only stores whose name the existing rules classify, and add the
     A-4E-C lua stores.
   - No hand-typed CLSIDs: the generator is the source, and its pinned commit
     goes in the header.
2. Feed the names through the existing rules:
   - add a CLI entry beside `loadout_from_payload` that maps CLSID → name,
     then reuses the merge and count logic;
   - an unknown CLSID becomes an unrecognised line under the CLSID itself,
     never dropped.
3. Thread `db` into `process_player_group` and both of its call sites, and
   update the `ProcessedUnit.loadout` doc.
4. Keep `the_two_payload_shapes_are_not_confused` passing.
5. Tests:
   - a synthetic public CLI fixture with GUID and named CLSIDs, `<CLEAN>`,
     null pylons and a rack;
   - a `private_fixture!` test on the NTTR CLI file, which skips when the file
     is absent, asserting every player CLSID is placed or skipped for a
     reason.
6. Leave `dcs_weapon_name` alone unless the generator needs it. If it is
   filled, relax the refdata.rs test that says "the internal name is for the
   CLSID follow-up", on purpose.

**On screen (user):** import the NTTR CLI JSON and look at the Loadouts list
and the roster.

---

## Session 4: Numbers for the name-only rows

**Goal:** fill release and frag numbers for the 13 name-only rows (GBU-16,
AGM-65F, AGM-122, GAU-12, Mk-20, CBU-99, CBU-52B, BLG-66 and the five SAMP),
plus Session 1's rows, **only where a source exists**.

**Facts**

- The "no data on file" caution keys on one field per class (`noDataNote` in
  `src/lib/attackChecks.ts`):
  - bombs and clusters: `frag_min_safe_alt_ft`;
  - AGMs: `min_release_alt_ft`;
  - guns and rockets: never.

  Every other limit check is skipped on its own when its field is null.
- The rows that already have numbers (`mk82`, `gbu12`, `cbu87`, …) cite no
  source. They came from the old SQLite seed.

**Approach**

1. **Agree the acceptable sources with the user first.** Candidates:
   - DCS's own weights, from pydcs `weapons_data.py`;
   - the module manuals and Chuck's Guides;
   - published real-world frag and fuze tables.

   Ask whether a weight-only fill is worth doing, since weight alone doesn't
   clear the caution.
2. Research per row (a research agent can fan out). Build a table of row,
   field, value and source quote. **Show the table to the user before any
   value lands.**
3. Write the agreed values, with their sources, in `notes`.
   - Remove the filled rows from `the_name_only_rows_carry_no_numbers`.
   - Pin their new values in a test.
   - Update geo-check's no-caution cases (around line 1376).
4. Optional, if the user wants: give the old seed rows the same source audit.

**On screen (user):** an attack with a newly numbered weapon. The caution
should be gone and the release floor enforced.

---

## Session 5: Loft geometry (F-16 loft, F-4E LABS)

**Goal:** draw, check and print loft attacks, then un-hide `f16c.loft.std`
(`src-tauri/resources/profiles/f16c.json`) and `f4e.loft.labs45` (`f4e.json`).

**Facts**

- **What hides them:** only `SUPPORTED_GEOMETRIES`
  (`src/types/profile.types.ts`), which is used in `profileStore.ts`
  `matches()` and in the `autoBuildAttack.ts` candidate filter. Rust already
  validates the loft params (`profiles.rs`).
- **What's missing:** `LoftCCRPProfile` exists (`attack.types.ts`), but these
  return nothing for loft today:
  - `buildAttackPicture` and `buildSideProfile` (`attackPicture.ts`);
  - `customizeKnobs.ts`;
  - the `JetPanel` form;
  - `describeRunIn`;
  - `attackFlank`.

  The card has a loft label and egress line, but no diagram.
- **The pop-up is the template, end to end:**
  - `popupPlanning.ts` (`planPopup`/`applyPopupPlan`);
  - `attackGeometry.ts` (`calculatePopupGeometry`);
  - `attackPicture.ts` (`popupPicture` and the popup side view);
  - `PopupCCIPForm.tsx`;
  - geo-check: the handbook worked example near the top, and the knob tests
    with a `geometryType` map that skips loft.

**Approach**

1. **Geometry from a source first.**
   - Write a loft section in `docs/DELIVERY_PLANNING.md`: ingress, pull-up
     point, climb angle, release, toss range and escape. Base it on the BEM
     (LAT, §5.8, already cited) and the Heatblur F-4E LABS material.
   - Settle a sourced toss-range model the way `bombRangeVacuum_ft` does for
     the pop-up, with a handbook worked example as the first geo-check test.
   - Mark everything ESTIMATED.
2. **Plan, geometry, picture and side view:**
   - `loftPlanning.ts` (plan and apply);
   - `calculateLoftGeometry`;
   - `loftPicture`, using markers from the existing vocabulary (the pull-up
     point, `REL`, `TGT`, egress);
   - a loft side-view branch: low run-in, pull, release, the bomb's arc to
     the target, escape.
3. **Editor:** `LoftForm.tsx` plus `KNOB_RANGES.loft_ccrp`. Keep every knob.
4. **Checks, card and run-in:**
   - `runAttackChecks`: the release floor, and frag clearance against the
     escape;
   - the card's diagram and header. A before-the-IP number, such as a LABS
     timer, goes in the header, never on a picture label;
   - `describeRunIn`.
5. Last: add `'loft'` to `SUPPORTED_GEOMETRIES`, and add loft to geo-check's
   `geometryType` map.
6. **Look-and-feel options on branches:** put the map picture and side view in
   front of the user in the real app before polishing.

This may take more than one sitting. The first one ends at sourced geometry,
with the picture shown on screen.

**On screen (user):** an F-16 loft and an F-4E LABS attack, in the editor and
on an exported card.
