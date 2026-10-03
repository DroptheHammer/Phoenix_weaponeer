# "Jets arrive loaded": loadout import and per-aircraft weapon lists

**Status:** designed and approved 2026-09-29, **built 2026-10-02** in four
slices (`97ac6a6`, `b19c625`, `187f3b5`, `f343a06`), unreleased, planned for
0.3.3. This was the roadmap's "Bomb and missile tables" and "Loadout from the
FragOrders pylons" work, built together. The text below is the design as
approved; where the build differs, "As built" at the end says how.

## Goal

After a FragOrders link import, each pilot's loadout holds the air-to-ground
stores the mission author loaded. Auto-build defaults to the weapon the jet
actually carries. Each aircraft is offered only the weapons it can carry, with
a "Show all weapons" switch kept, because a wrong entry must never block a
pilot (warn, don't block).

In the four captured links, 38 player jets carry air-to-ground stores and would
arrive loaded. Another 22 carry only air-to-air missiles, tanks and pods, and
correctly arrive with an empty loadout.

## What the code does today

- The link payload is `plannedGroups[].units[].payload`: a positional pylon
  array of DCS display names (e.g. `TER-9A with 3 x Mk-82 - 500lb GP Bomb LD`,
  `GBU-12 - 500lb Laser Guided Bomb`). It is dropped at parse time
  (`crates/core/src/parsers/tasking_state.rs`, `TaskingUnit`).
- Imports set `loadout: []` (`src/stores/missionStore.ts`).
- Auto-build already prefers the loadout (`loadoutWeapons` /
  `weaponChoicesFor` in `src/lib/autoBuildAttack.ts`), matching on the weapon's
  reference *name*.
- `offeredTo` (`src/lib/weaponClass.ts`) filters only guns and rockets by
  aircraft. Bombs and missiles are offered to every aircraft, the F-16C
  included. `LoadoutEditor` offers every store.
- `dcs_weapon_name` (`Mk_82`, `GBU_12`…) is filled on 18 weapon rows but
  unused. Its internal names tokenise differently from the display names in
  exactly the ambiguous cases, so leave it for the CLSID follow-up.

## Data flow

The mapping lives in the Rust core, beside the threat-name mapping and the
reference-data tests, where `private_fixture!` works:

1. `TaskingUnit.payload` is kept as raw `Option<Value>`, so a change in the
   payload's shape can never fail an import.
2. A new `crates/core/src/parsers/store_mapping.rs` (`classify_store`) turns
   the names into
   `ProcessedUnit.loadout: Vec<ImportedStore { weapon_id: Option, name, quantity }>`.
3. The existing IPC carries it, on desktop and web alike.
4. `missionStore.ts` fills `LoadoutItem { weaponType: name, quantity, weaponId? }`.
   `weaponType` stays the row name, so old saves and older app versions still
   match.

The CLI/`.miz` path (pylon CLSIDs) gets an empty loadout for now, as a
follow-up.

## Mapping rules

An ordered rule table matches whole tokens, reusing `tokens` / `contains_run`
from `threat_mapping.rs` (made `pub(crate)`).

- **Counts:**
  - "X with N x …" gives N (a TER of 3 Mk-82 is 3).
  - Rocket pods count rockets (2 × LAU-131 is 14).
  - Cluster bombs never multiply.
- **Order of checks:**
  - Skip words come first (Illum, Flare, Smoke, Phos). APKWS is forced
    unrecognised.
  - The most specific rule wins (Mk-82 AIR and Snakeye before Mk-82).
  - A drag guard makes a high-drag name that hits a low-drag row unrecognised.
  - Then the air-to-air, fuel-tank and pod skips.
  - Anything else is unrecognised, which is the safe direction.
- **What the user sees:**
  - Unrecognised air-to-ground stores show in amber, in the import preview and
    the roster.
  - Auto-build's "has no loadout" message names them.
  - Skipped stores show nowhere.

## Slices (each one shippable)

1. **Core, no UI change.**
   - Files: `tasking_state.rs`, `store_mapping.rs`, `fragorders.rs` (`loadout`
     on `ProcessedUnit`), `import.rs`, `fragorders.types.ts`.
   - Add a public synthetic fixture, `test-data/nevada_SYNTHETIC_loaded_jets.json`.
   - Leave `nevada_SYNTHETIC_link_payload.json` alone: `web-smoke.cjs` relies
     on its empty loadouts.
2. **Reference data v5.**
   - New rows `gbu16`, `agm65f`, `agm122` and `gau12`, holding only name,
     category and guidance. Weight is 0, every release and frag field null, and
     the source goes in `notes`. No invented numbers.
   - Per-aircraft rows for the other nine aircraft, per the table below.
   - The F-16C gains mk82air (and mk82se?), so filtering doesn't take away what
     it is offered today.
   - Add a "no frag data on file" note, as an editor check and a card caution,
     for a bomb with no frag floor. Today's floor is
     `Math.max(min_release ?? 0, frag ?? 0)` and the checks skip nulls, so the
     GBU-16 would otherwise be the first bomb planned with no floor and no
     warning.
3. **Jets arrive loaded (TS).**
   - `weaponId?` on `LoadoutItem`, and `missionStore` fills it on import.
   - `loadoutWeapons` matches by id first, then by name.
   - Carried order: bombs and strike missiles before anti-radiation missiles,
     rockets and gun pods, so a HARM + JSOW Hornet defaults to the JSOW (one
     tap to change).
   - `copyAttack.ts` checks the matched weapons, not `loadout?.length`.
   - `validateMission.ts` requires the loadout to be an array.
   - `strikeNearMe.ts` gives its default Mk-82 a `weaponId`.
   - The roster shows one store per line, with `min-w-0 break-words` for the
     phone.
4. **The filter and "Show all weapons".**
   - `offeredTo` and a new `storesMappedFor`: a mapped aircraft sees its own
     bombs and missiles, and an unmapped type (e.g. the AH-64D) sees everything.
   - Carried and current weapons are always offered.
   - A checkbox in `JetPanel`. `LoadoutEditor` gets `aircraftId`, the toggle,
     and a "(not in the weapon table)" option.

## Per-aircraft air-to-ground stores

✓ = fairly sure, ? = to verify. Check every "?" against published sources
(module manuals, Chuck's Guides) first. Only what is still unsure goes to the
user, to check in the DCS Mission Editor.

| Aircraft | ✓ | ? |
|---|---|---|
| f18c | mk82, mk82se, mk84, gbu10, gbu12, gbu16, gbu31, gbu38, agm65f, agm88c, agm154a/c | gbu24, agm65g |
| a10c | mk82, mk82air, mk84, gbu12, gbu38, cbu87, cbu97, agm65d/g/h/k | gbu10, gbu31 |
| f15e | mk82, mk82air, mk84, gbu10, gbu12, gbu24, gbu31, gbu38, cbu87, cbu97 | mk82se |
| f4e | mk82, mk82se, mk84 | mk82air, gbu10, gbu12, cbu87, agm65d |
| a4ec | mk82, mk82se | mk84, mk82air |
| f5e | mk82, mk82se | mk84 |
| f14 | mk82, mk82se, mk84, gbu10, gbu12, gbu16, gbu24 | mk82air |
| f1 | mk82 | mk82se, mk84 |
| av8b | mk82, mk82se, gbu12, gbu16, gbu38, agm65f, agm122, gau12 | mk82air |

## Tests (each with the break that must make it fail)

### Slice 1 (Rust)

| Test | Break that must make it fail |
|---|---|
| `store_names` from a payload | return empty |
| DCS name → id and quantity | count the first "N x" anywhere |
| HD vs LD, and `Mk-82Y`, stay unrecognised | drop the drag guard |
| Illumination Hydra skipped, HE Hydra counted | run the skip words after the rules |
| Every rule names a real row, and none shadows another | point a rule at a fake id |
| Malformed payloads still import | type the payload `Vec<Option<String>>` |
| The synthetic fixture arrives loaded | `Vec::new()` at import |
| **Private, all 4 links:** every store classified, skip reasons independently checked, exactly 38 loaded jets, none empty, the unrecognised set pinned | fall back to "pod"; drop unrecognised stores from the loadout |

### Slice 2

| Test | Break that must make it fail |
|---|---|
| The unrecognised set is now empty | remove the GBU-16 rule |
| The new rows carry no numbers | give gbu16 a min release |
| The F-16C keeps what it is offered today | drop f16c→mk82air |
| The 26 existing weapon names are pinned | rename "Mk-82 LDGP" |
| The no-frag note appears for gbu16 | skip it |

Also check that every store is carried by some aircraft, and that every
profile's weapon class is reachable on its aircraft, with the known cluster
gaps listed.

### Slices 3–4 (geo-check)

- Import fills the loadout.
- An id beats a stale name, and a legacy name still matches.
- The JSOW is picked before the HARM.
- A jet carrying only unrecognised stores gets a message naming them.
- Copy to… keeps the weapon.
- A bad loadout is rejected on open.
- A mapped Hornet gets no CBU-97 until "Show all", and never the GAU-8.
- An unmapped aircraft type sees everything.
- A carried-but-unmapped weapon is still offered.
- An old attack keeps its weapon.
- Against the real `reference.json`: the F-16 keeps Mk-82 AIR, and the A-10
  gets no HARM.

## What the user checks by eye

1. The remaining "?" rows.
2. The import preview and roster read clearly, on desktop and iPhone, with long
   loadouts.
3. In the attack editor, the weapon is pre-picked and "Show all weapons" is
   easy to find.

## As built (2026-10-02)

Where the build differs from the design above:

- **The "?" rows are settled**, from the module manuals and Chuck's Guides
  (2026-10-01). Confirmed and added: F/A-18C GBU-24; A-10C GBU-10 and GBU-31;
  F-15E Mk-82 Snakeye; F-4E Mk-82 AIR, GBU-10, GBU-12, CBU-87, AGM-65D (plus
  GBU-24 and AGM-65G, which its manual also lists); A-4E-C Mk-84; F-5E Mk-84;
  F-14 Mk-82 AIR; AV-8B Mk-82 AIR; Mirage F1 GBU-10, GBU-12, GBU-16. Left out:
  F/A-18C AGM-65G, A-4E-C Mk-82 AIR, Mirage F1 Mk-82 Snakeye and Mk-84 (the
  two Mirage ones rest on absence from the stores lists, not a published
  denial). The whole table is pinned by `what_each_aircraft_carries_is_pinned`
  in `crates/core/src/refdata.rs`. Item 1 of the eye checks is therefore closed.
- **There is no "v5" to bump.** The version number went with SQLite; v5 is a
  paragraph in the `refdata.rs` header. There are 30 weapon rows, not 26 plus
  four to pin separately, and all 30 names are pinned.
- **New aircraft rows use `station: 0, max_quantity: 1`**, the "not modelled"
  convention. Only the F-16C's original rows have real stations.
- **The "no data on file" note covers missiles too**: a bomb with no frag floor
  (GBU-16) or a missile with no minimum release (AGM-65F, AGM-122). It is a
  warning in the editor and an amber caution strip on the card, printed once.
- **`Mk-82Y` is unrecognised by fallthrough**, not by the drag guard: its token
  is `82y`, so no rule matches it at all.
- **Pylons carrying the same weapon merge** into one loadout line with the
  summed quantity.
- **Known gaps, pinned in `KNOWN_CLASS_GAPS`** (`crates/core/src/profiles.rs`):
  cluster on the F/A-18C, A-4E-C, F-5E, F-14, Mirage F1 and AV-8B, and
  high-drag on the Mirage F1. The Harrier carries the GAU-12 pod but has no
  strafe profile; picking it gives "No AV8B profile for gun yet".
- **Show all weapons** lists every bomb, missile and rocket. Guns stay with
  their own aircraft. The switch is not saved and is off each time an editor
  opens.
- **Copy to another aircraft type** follows the recipient's own list. A jet
  with no loadout keeps a bomb or missile the table doesn't list for it, with
  a note; a gun or rockets never transfer.
- **Opening a mission file checks the loadout**: a list of lines with a text
  name, a number quantity of zero or more, and an optional text weapon id.
- **Not run:** the browser smoke scripts (`scripts/web-smoke*.cjs`). They need
  the wasm toolchain and Playwright, which are not installed on the main Mac.
  The web build itself is checked by the Pages workflow on every push.

## Follow-up (2026-10-03): the cluster and SAMP rows

The seven gaps listed above are closed, and `KNOWN_CLASS_GAPS` is empty.

- **Nine name-only rows:** Mk-20 Rockeye, CBU-99, CBU-52B, BLG-66 Belouga,
  SAMP-125 LD, SAMP-250 LD, SAMP-400 LD, SAMP-250 HD and SAMP-400 HD. No
  numbers, like the GBU-16 row, so the "no data on file" caution applies.
- **Who carries what** comes from each DCS module's own pylon table, as
  published in the public pydcs library (`dcs/planes.py`), and for the A-4E-C
  from the community mod's aircraft file. That is a more direct source than
  the manuals for "does the module load it". The pairs are pinned by
  `what_each_aircraft_carries_is_pinned`.
- **A bomb's drag class comes from its name**, so the SAMP rows say `LD` or
  `HD`. The DCS names for the two share the same leading words and differ
  only at the far end, so the store rules pair a low-drag and a high-drag
  rule on one pattern, and the name's own drag words pick between them.
- **Rack counts:** a count straight before the weapon's name is read
  (`- 3 x Mk-20`, `2x CBU-52B`), alongside `with N x`. A cluster bomb's
  bomblet count comes after the name and is never read. A bare number is
  never a count, so the F-14's `MAK79 2 MK-20` loads as one.
- **The synthetic loaded-jets file** now has `Venom 1-3` carrying recognised
  Rockeyes and one BL-755, which has no row, so the "not in the weapon table"
  mark can still be seen.
- **Still no row:** Mk-81, Mk-83, CBU-103, CBU-105, BL-755, CBU-1/A, CBU-2/A,
  Durandal, BR-250 and BR-500 (on the roadmap).
