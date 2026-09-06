# DCS Attack Planner - Claude Code Instructions

## Session Management (IMPORTANT)

### START OF SESSION
**When beginning work, ALWAYS:**
1. **Pull latest from GitHub:** `git pull origin main`
2. This ensures you're working from the cloud golden master on any device

### END OF SESSION
**When the user says they need to pause, leave, change devices, or end the session in ANY way:**

1. **Commit and push all changes to git** (no version tag, just save progress)
2. **Update this file** with "Session Pickup Notes" at the bottom - what was being worked on, what's next
3. **Push the updated CLAUDE.md** to GitHub
4. **Remind the user** if they forget to do this before ending

This workflow ensures GitHub is always the source of truth and work can be resumed from any device (Windows, Linux, macOS, iPhone) with full context.

## Project Overview

A cross-platform desktop application for planning F-16 (and other aircraft) attack runs against defended targets in DCS World. The tool helps squadron members plan tactical attacks, weaponeer targets, and generate pilot briefing cards (kneeboards).

## Core Workflow

1. **Import mission data** from FragOrders (via .miz file, Tacview XML, or URL scraping) or manual entry
2. **Define threat laydown** at target areas (SAMs, AAA, MANPADS)
3. **Plan attack geometry** per flight member (popup, level, loft, dive bomb, etc.)
4. **Select weapons and delivery parameters**
5. **Generate kneeboard cards** in DCS-compatible format (768x1024 PNG)

## Tech Stack

- **Framework:** Tauri 2.x (Rust backend + web frontend)
- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS
- **State Management:** Zustand
- **Map:** Leaflet with React-Leaflet
- **Data Storage:** 
  - SQLite (bundled threat/weapon databases)
  - JSON files (user mission plans)
- **PDF/Image Generation:** Rust libraries (printpdf, image crate)

## Project Structure

```
attack-planner/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── mission/        # Mission management
│   │   ├── waypoints/      # Waypoint editor
│   │   ├── threats/        # Threat placement
│   │   ├── attacks/        # Attack planning
│   │   ├── flights/        # Flight roster
│   │   ├── map/            # Map view
│   │   └── kneeboard/      # Briefing card preview
│   ├── stores/             # Zustand state stores
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility functions
│   ├── types/              # TypeScript types
│   └── data/               # Static data (coordinate formats, etc.)
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri command handlers
│   │   ├── db/             # SQLite database access
│   │   ├── parsers/        # .miz file parser, Tacview XML parser
│   │   ├── calculators/    # Attack profile calculations
│   │   └── exporters/      # Kneeboard PNG, PDF generation
│   └── resources/          # Bundled databases
├── docs/                   # Documentation
│   └── ARCHITECTURE.md     # Detailed technical specification
└── CLAUDE.md               # This file
```

## Coding Conventions

### TypeScript/React
- Use functional components with hooks
- Define interfaces for all data structures in `src/types/`
- Use Zustand for global state (mission data, UI state)
- Prefer `const` and arrow functions
- Use descriptive variable names (no single letters except loop indices)

### Rust
- Use `Result<T, E>` for fallible operations
- Implement `serde::Serialize` and `serde::Deserialize` for data structures
- Use `thiserror` for custom error types
- Document public functions with `///` doc comments

### File Naming
- React components: PascalCase (`AttackCard.tsx`)
- Utilities/hooks: camelCase (`useAttackCalculator.ts`)
- Types: PascalCase with `.types.ts` suffix (`Mission.types.ts`)
- Rust modules: snake_case (`attack_calculator.rs`)

## Key Data Models

See `docs/ARCHITECTURE.md` for full schemas. Summary:

- **Mission** - Container for all planning data
- **Waypoint** - Steerpoint with coordinates, elevation, type
- **ThreatSystem** - SAM/AAA definition with engagement envelope
- **ThreatInstance** - Placed threat on the map
- **Aircraft** - Aircraft type with loadout options and delivery modes
- **FlightMember** - Pilot in the flight with assigned loadout
- **AttackProfile** - Attack parameters (type, altitudes, headings, weapon settings)
- **KneeboardCard** - Generated briefing card data

## Development Setup (macOS)

The project requires system libraries for coordinate projection. On macOS, install via Homebrew:

```bash
brew install proj cmake pkgconf
```

The `.cargo/config.toml` file in `src-tauri/` is configured to find these libraries automatically.

## DCS Kneeboard Format

- **Dimensions:** 768 x 1024 pixels (3:4 portrait)
- **Format:** PNG or JPG
- **Location:** `Saved Games/DCS/Kneeboard/{aircraft}/{filename}.png`
- **Design:** Dense but readable, dark text on light background

## Development Phases

### Phase 1: Foundation ✅ COMPLETE
- [x] Initialize Tauri + React + TypeScript project
- [x] Set up SQLite with threat and weapon databases
- [x] FragOrders JSON import (CLI or paste/file)
- [x] Basic waypoint data structures
- [x] GitHub Actions for cross-platform releases

### Phase 2: Core Planning ✅ COMPLETE
- [x] **Map view** - Leaflet map showing waypoints and threat envelopes
- [x] **Threat management** - Import from mission, add planning threats, visual distinction
- [x] **Map interaction** - Click-to-add threats, drag to reposition planning threats
- [x] **Coordinate conversion** - Accurate DCS to lat/lon using proj4 transformations
- [x] **Attack profile calculator** - Popup CCIP with geometry visualization
- [x] **Flight roster management** - Assign pilots and loadouts

### Phase 3: Output ✅ MOSTLY COMPLETE
- [x] Kneeboard card renderer (768x1024 PNG)
- [x] Export single card to user-selected location
- [x] Batch export with proper folder picker
- [x] DCS folder auto-detection and quick export
- [ ] PDF export option (optional)

### Phase 4: Polish
- [ ] FragOrders URL import (when API access provided)
- [ ] Additional aircraft modules (F/A-18, A-10)
- [ ] Additional attack profiles (level, loft, dive bomb)

## Known Issues / Future Testing

- [x] **Coordinate conversion** - ✅ FIXED - Now uses proper proj4 Transverse Mercator projections from FragOrders project
  - Replaced simple lat/lon calculation with accurate proj4 transformations
  - Added `proj` Rust crate with system library dependencies
  - Updated test data with realistic NTTR coordinates
  - Waypoints now appear in correct Nevada locations

## Important Context

- **Primary users:** DCS squadron members planning Saturday missions
- **Data source:** FragOrders.com provides mission briefs, waypoints, threat info
- **Output goal:** Kneeboard cards that fit DCS format with employment parameters
- **Aircraft focus:** F-16C initially, expandable to F/A-18C, A-10C II

## Reference Materials

- FragOrders: https://fragorders.com
- pydcs (Python DCS library): https://github.com/pydcs/dcs
- Tauri docs: https://tauri.app/v2/guides/
- DCS kneeboard modding: Community wiki resources

---

## Session Pickup Notes

**Last session:** 2026-09-05 (afternoon)

**The revamp has started. Read `docs/REVAMP_PLAN.md` first — it is the
approved plan and the order of work (M0 → M1 → M2 → M3).**

**Why:** the user came back after time away and said the tool feels clunky,
has one attack style, and casual squadron pilots need to *want* to use it in a
few-minute flight-lead briefing slot. The squadron flies 1960s–modern aircraft,
a different one each weekend; the reason a planner exists is that legacy
strike aircraft need real delivery guidance (manual dive with mils, DTOS,
LABS). Design decisions and the user's own words are in the plan's Context.

**Rollback point exists — `v0.1-pre-revamp`.** Tag and branch `pre-revamp`,
both on GitHub at `13067c1` (last commit before any revamp work). Recipes:
- Look around: `git checkout v0.1-pre-revamp` (detached) or `git switch pre-revamp`
- One old file back: `git checkout v0.1-pre-revamp -- path/to/file`
- Undo the revamp on `main` while keeping history: `git revert` the commits
  after `13067c1`. Only with the user's explicit say-so: `git reset --hard
  v0.1-pre-revamp` and force-push.
Nothing in the plan deletes or moves that tag.

**M0 (card trust fixes) is DONE and reviewed in-app by the user** — commits
`1b33ee0` and the follow-up after it. Gates: `npm run build` clean, **32 Rust
tests** pass.
- Egress heading no longer prints "undefined°"; `resolveEgressHeading` in
  `src/lib/attackGeometry.ts` is the one rule the map overlay and the card
  share. Wording is **"Egress RIGHT"**, per the user — not "Break".
- **Weapon sanity checks were dead.** The editor read camelCase fields
  (`minReleaseAlt_ft`, `fragPattern`) that the database never returns, so it
  always showed a green tick. `src/lib/attackChecks.ts` is now the single
  place for these; results show in the editor and print as red ⚠ lines on
  the card. `src/lib/attackValidation.ts` read the same phantom fields, had no
  importers, and is gone.
- **The runtime weapon shape is `DbWeapon`** (`src/types/weapon.types.ts`,
  snake_case, exactly the Rust struct). The camelCase `Weapon` type is a
  legacy model nothing at runtime matches; do not read weapon limits through it.
- **Release altitude never defaults below the weapon.** Rust
  `calculate_release_altitude` floors at max(min release alt, frag min-safe);
  the popup form's release altitude is an editable field defaulting to that.
  The user's rule: the tool puts the minimum in; only warn if a person lowers
  it. (The form's "Min Release Altitude" input had been bound to the hard-deck
  field — same field as "Hard Deck" further down.)
- A guided weapon on a visual pass is a *caution*, not an error — the user
  confirmed a JDAM off a pop-up is legitimate.
- Unverified-map caution now prints on the card (amber strip under the
  header, fail warn-open). The step list tightens spacing instead of running
  under the footer. Hard deck is AGL everywhere.

**Conventions added this session:**
- `Other Items/` at the repo root is a **git-ignored drop-zone**: the user
  puts exported cards / saved missions there so Claude can `Read` them
  (reads outside the project are blocked). Never commit it.
- The user is not a developer (see memory). Explain in aviation terms.

**Next up: M1 — profile library + auto-build**, per `docs/REVAMP_PLAN.md`
§M1. Suggested order: §1 data model + §2 loading (Rust `list_delivery_profiles`
with `include_str!` bundles + `profileStore`), then §4 auto-build and §5 the
editor redesign, then §6 level/dive geometry and card, then §7 seed data
(ESTIMATED, 10 aircraft). §3 (weapon classes, loadout from FragOrders pylons)
can slot in wherever it unblocks. Every profile ships `verified: false`.

---

**Earlier session (2026-09-05, morning):** Phase 3.6 verified in-app, and Mission Save/Open built

Gates: `npm run build` clean, **31 Rust tests** pass (was 30).

**Phase 3.6 is confirmed on screen.** The Sinai unverified-projection warning
appears in both places it should, and imports still work now that the theater
list arrives asynchronously from `list_theaters`.

**A planner can now keep their work.** Open / Save / Save As live in the app
header with a dirty indicator, Cmd/Ctrl+S, and a Save/Discard/Cancel guard in
front of anything that would replace the mission (New, Import, Open, Close).

**Two landmines were sitting in the way, both found before writing any UI:**

1. **The Rust `Mission` struct had no `#[serde(rename_all = "camelCase")]`.**
   Its fields are `flight_members`/`created_at`; the frontend's are
   `flightMembers`/`createdAt`. The first Save would have died with `missing
   field 'flight_members'`. Fixed, and pinned by
   `mission_files_round_trip_with_camel_case_keys`, which asserts the *on-disk*
   key spellings — those are the contract a later Open depends on.
   **Any field added to Rust `Mission` from now on needs `#[serde(default)]`,
   or every previously saved mission stops loading.**
2. **`capabilities/default.json` granted `dialog:allow-save` but not
   `dialog:allow-open`** — while `KneeboardPreview.tsx` has been calling
   `open()` for the batch folder picker all along. **"Export All to Folder" has
   been broken this entire time** and nobody had exercised it. Fixed as a side
   effect; confirmed working by a folder export in this session.

**Verified by hand, and cross-checked against the files it produced** — the
saved missions on disk carry camelCase keys, and the Sinai save round-tripped a
complete attack with its nested profile (climb angle, apex, roll-in altitude),
which proves the `Vec<Value>` passthrough for every array. Kneeboard export
(single file and folder) both worked.

**Not verified:** the Save/Discard/Cancel guard and Escape-to-close. Worth two
minutes next session.

**New in the codebase:**
- `src/lib/missionFile.ts` — the only place that talks to `save_mission` /
  `load_mission`. `save_mission` appends no extension, so this layer adds
  `.json` itself.
- `src/components/common/Modal.tsx` — the first shared modal. Four components
  (`AttackEditor`, `LoadoutEditor`, `FlightMemberEditor`, `ThreatList`) still
  hand-roll the same portal markup; folding them in is mechanical and was
  deliberately left for its own commit so it would not bury this one.
- `src/components/mission/UnsavedChangesDialog.tsx`
- `test-data/sinai_SYNTHETIC_banner_check.json` — **UI check only.** Its
  coordinates were generated *from* the Sinai projection they are meant to test,
  so round-tripping them proves nothing. Deliberately not turned into a test;
  that is the same false confidence `test_fragorders.json` cost two sessions.

**Import is reachable again.** The Import button existed only on the no-mission
landing screen, so once a mission was loaded there was no way back to it. It is
in the header toolbar now.

**Next up:** see the numbered list at the bottom of the previous session's
notes — items 3 (The Channel projection), 4 (kneeboard caution line for
unverified maps) and Phase 3.3 (PDF export) are the live ones. Items 1 and 2 are
done.

---

**Previous session:** 2026-07-29

**Completed this session — Phase 3.6, theater projections for 12 of 13 maps**

The FragOrders author answered the data request. His table is in `docs/fragorders-response-maps.txt`.
Gates: `npm run build` clean, **30 Rust tests** pass (was 27).

**His Caucasus and Nevada strings are identical to ours, character for
character.** That is the headline: the two maps we had independently verified
against ground truth needed no adjustment, and that agreement is what vouches
for the other ten.

**How the new projections were checked.** FragOrders publishes each theater's
corner bounds as lat/lon, generated by projecting the DCS map corners outward.
Projecting those bounds *back* has to land on whole kilometres, because DCS map
corners are round numbers. Nine theaters do, to within 5 m — pinned by
`test_projections_reproduce_their_own_map_corners`. A wrong `x_0`/`y_0` would
land somewhere arbitrary. This also proved PROJ honours `+k` as an alias for
`+k_0` (if it were ignored, k would default to 1.0 and throw far corners off by
~400 m); normalized to `+k_0` anyway.

**Sinai, Kola and Afghanistan cannot be checked that way** — they ship
hand-typed integer lat/lons rather than derived corners. They are marked
`verified: false`, warned about in the import preview *and* as a banner over the
map. **Deliberately did not invent a weaker test for them.** A round-trip test
would pass regardless of correctness — that is precisely the false confidence
that cost two sessions on coordinate conversion. No check is more honest than a
fake one.

**Two DCS name bugs found via the FragOrders author's `mizName` field — both would have rejected
a map outright even with a perfect projection:**
- Sinai is **`SinaiMap`** in DCS, not `Sinai`. We had it wrong.
- There is no `SouthAtlantic` theater; DCS writes **`Falklands`**. We had both,
  and the `SouthAtlantic` entry could never have matched anything.

**The Channel is the only map still unsupported** — the FragOrders author's table omits it.
Needs ground-truth (DCS x/y ↔ lat/lon) pairs off the F10 map from someone who
owns it; the offsets then fall out arithmetically (see the Nellis worked example
further down).

**Theater list is now single-source.** `THEATER_PARAMS` in Rust is authoritative
and reaches the frontend through a new `list_theaters` command
(`src/stores/theaterStore.ts`). Deleted `src/data/theaters.ts` — its 9-theater
list had drifted from Rust's 12, and its `bounds` field was dead data. `Theater`
is no longer a literal union that had to be edited in lockstep.

**Verification status: the app builds, launches and runs clean, but the banner
and a non-Nevada import have NOT been eyeballed yet.** Do that first next
session — this project's history is that only running the app finds the real
bugs.

---

**Previous session:** 2026-07-26 — Phase 3.5 Bugfix Sprint, ALL FOUR STAGES + verification

All of `docs/BUGFIX_PLAN.md` is done and checked off. Gates: `npm run build`
passes with **zero TS errors** (was 24 pre-existing) and **27 Rust tests** pass.
Every fix was verified by hand in the running app against the real mission.

Commits (all pushed): `0992772` Stage 1 · `debb9d8` map framing · `b3b2352`
waypoint inference + coordinate ground truth · `8810c96` Stage 2 · `4a94439`
Stage 3 · `06540df` Stage 4 · `60962e5` UI fixes from manual verification.

**The reported bug had three separate causes, all fixed:**
1. Clearing the Heading field stored `parseFloat('') = NaN`, which passed the
   `??` fallback in `attackGeometry.ts` and made every overlay point invalid.
2. `AttackProfileOverlay` drew hardcoded `getRecommendedParams()` values and
   ignored the saved profile, so editing pop distance or apex did nothing.
3. The map framed a hardcoded theater coordinate, never the imported mission.

**READ THIS BEFORE TOUCHING COORDINATE CONVERSION — it is not broken.**
It has now been suspected and cleared twice, costing two sessions. Verified
against ground truth: Nellis round-trips to 5 decimals, and ALAMO converts to
37.36496/-115.16433 versus the real town at 37.3644/-115.1633. The axis
convention is **DCS x = northing, y = easting**, and `dcs_to_latlon` passing
`(y, x)` to proj is correct. It is now pinned by landmark tests plus an
explicit axis-order test in `coordinate_conversion.rs`. Note a round-trip test
can NEVER catch an axis swap, since swapping both directions still round-trips
— that weak test is what gave false confidence.

The actual culprit both times was **`test-data/test_fragorders.json`**: it is
synthetic, and its waypoints land 300+ km outside the NTTR map in eastern
Nevada. **Use `test-data/nttr_redflag_viper1.json`** (real FragOrders export,
group `Viper 1 (Hot)`, 14 waypoints) for anything involving map positions. See
`test-data/README.md`.

**Corrections to what BUGFIX_PLAN.md originally prescribed** (found by testing
against the real mission rather than the synthetic fixture):
- Task 3.3 said to leave tanker names alone because "they're distinctive". They
  are not — the real Viper route has a plain nav turnpoint named **ARCO**, which
  is also a tanker callsign in that same mission. Word-boundary matching alone
  would not have caught it. Only `TANKER`/`AAR`/`REFUEL` imply a tanker now.
- Task 2.4's "unused imports only" was actually a superseded `MapView` API,
  which cascaded into `App.tsx`.
- Task 4.1 covered only `MapView`'s markers; `AttackProfileOverlay` had six more
  with no `interactive` prop at all, sitting right on the attack axis.
- Added Task 3.4 (not in the plan): a theater can be *known* and still have no
  projection. `get_theater_params` succeeds for Syria, PersianGulf, Sinai and
  six others, but all have an empty `proj4_string`, so import passed its check
  then failed every conversion and reported success with an empty mission.

**Serious pre-existing bug found only by running the app:** there was **no
Calculate button**. `canSave` required a calculation result, but the only thing
that produced one was clicking a preset — and presets overwrite pop distance,
apex and dive angle. So a planner typing their own numbers got a permanently
greyed-out Save and no way forward; hand-edited profiles were unsaveable.

**Marker stacking is now explicit** (`src/components/map/mapLayers.ts`).
Leaflet stacks markers by latitude by default, so a threat could hide a
steerpoint depending purely on which was further south. Order is now attack
points (POP/ATK/TGT) > waypoints > bullseye > info labels > threats. Per squadron
requirement: navigation and attack symbols must always be on top, so a symbol
under the nose is never ambiguous.

**Also this session — planned projection support for all DCS maps.** See
`docs/THEATER_DATA_REQUEST.md` (ready to send to the FragOrders author) and item 1 under "Next
up" below. Not started in code.

**Manual verification — all five checks passed in-app:**
1. Import frames the whole Nellis–Tonopah route; ARCO renders as nav
2. Clearing Heading falls back to the true IP→TGT1 bearing (248°)
3. Edited apex (5000ft) reaches the map — previously ignored
4. Egress `left` flips the green line AND the label ("Defend left, Exit 158°")
5. Placement-mode clicks land on top of existing markers

**Git:** the auth problem is fixed. The stored token had expired, so several
previous sessions committed locally but never reached GitHub — the remote was
months stale. Re-authenticated with `gh auth login` after clearing the keychain
entry; all 12 commits are pushed and `main` is in sync. **At session end, check
`git status` shows `## main...origin/main` with nothing after it** — that is the
"everything is backed up" signal. `[ahead N]` means the push did not happen.

**Important Technical Notes (carried forward — these describe how the code works):**
- Attack geometry uses law of cosines for offset turn calculations
- Modal components render via React Portal to `document.body` (z-index 2000).
  Because they mount outside the App container they do NOT inherit its
  `text-white`; each modal sets its own. See `src/index.css`.
- Popup CCIP reference geometry: POP 4nm → ATK 2.14nm @ 7500ft → 20° dive
- **DCS callsign format:** DCS stores callsigns as `{name="Viper12", 1=1, 2=1}`.
  `src/lib/callsign.ts` normalises to "Viper 1-2" at import and display time.
- **Loadout stores the weapon name string** (e.g. "Mk-82 LDGP"), matched against
  `weapon.name` from the DB when filtering the attack editor.
- **Modal background:** use `bg-dcs-navy`. `bg-dcs-panel` is not defined in
  `tailwind.config.js` and renders transparent.
- **Kneeboard export:** three workflows — (1) Export Selected, single card with
  filename picker; (2) Export All to Folder, batch with folder picker;
  (3) Export All to DCS, auto-detects
  `%USERPROFILE%\\Saved Games\\DCS\\Kneeboard\\{aircraft}\\` on Windows.
  `detect_dcs_folder` returns None on Mac/Linux.
- **Kneeboard diagram** is a side-profile (altitude vs distance), not a top-down
  map. ATK X position comes from `rollInAltitude / tan(diveAngle)` in nm.
- **Geo math lives in `src/lib/coordinates.ts`** — `calculateBearing`,
  `calculateDistance`, `calculateDestination`. There were four duplicate
  implementations before Stage 4; do not add a fifth. `attackGeometry.ts`
  re-exports `calculateDestination` as `calculatePointAtDistance`.
- **Theaters have ONE source of truth:** `THEATER_PARAMS` in
  `src-tauri/src/parsers/coordinate_conversion.rs`. Adding or fixing a map means
  editing that table and nothing else — the frontend fetches it at startup via
  the `list_theaters` command into `src/stores/theaterStore.ts`. `Theater` is a
  plain `string`, deliberately not a literal union; a union is what let the two
  lists drift apart before. `dcs_name` is matched byte-for-byte against a
  mission's `theatre` field, so a typo there silently rejects that entire map.
- **Marker stacking:** `src/components/map/mapLayers.ts` (`MARKER_Z`). Leaflet
  orders markers by latitude by default, which is why this is explicit.
- **react-leaflet gotcha:** `interactive` and tooltip `direction` are applied
  only when a layer is created. Toggling them on an existing marker does
  nothing — include the changing value in the component `key` to force a
  remount.

**Next up (IN ORDER):**

1. **Eyeball the Phase 3.6 work in the running app — START HERE.** It is built
   and tested but not visually verified. Two checks: (a) import the real NTTR
   mission and confirm nothing regressed, since the theater list now arrives
   asynchronously from `list_theaters` rather than being hard-coded; (b) get a
   mission on Sinai, Kola or Afghanistan and confirm the amber unverified banner
   appears over the map and in the import preview.

2. **Mission save/load has no UI.** `save_mission` and `load_mission` are fully
   implemented in `src-tauri/src/commands/mod.rs:123` and registered in
   `lib.rs`, but **nothing in `src/` invokes either one.** A planner can import
   a mission, spend an hour placing threats and building attack profiles, and
   has no way to save it. ROADMAP lists this under 4.5 as not started; only the
   UI half is actually missing. `missionStore` already has `loadMission(mission,
   filePath?)` and a `setFilePath` action waiting for it.

3. **The Channel projection.** The one map the FragOrders author's table omits. Needs
   ground-truth (DCS x/y ↔ lat/lon) pairs read off the F10 map by someone who
   owns it. The arithmetic is already validated — given a pair and
   `k_0=0.9996`, the offsets fall out exactly:
   ```
   Nellis (36.235,-115.034) → raw tmerc @ lon_0=-117 → E=176674.252, N=4011806.003
   x_0 = dcs_y - E = -17321.7  - 176674.252  = -193995.95  (published -193996)
   y_0 = dcs_x - N = -398222.0 - 4011806.003 = -4410028.0  (published -4410028)
   ```
   Same method retires the `verified: false` flags on Sinai, Kola, Afghanistan.

4. **Kneeboard caution line for unverified maps.** The UI warns on screen; the
   printed card does not. A card flown off the tablet should carry the same
   caveat. (Original decision was "UI banner + caution line on kneeboard cards";
   only the banner is built.)

5. **Phase 3.3 (Optional):** PDF export — multi-card print-friendly packages
6. **Phase 4 Polish:** additional aircraft (F/A-18, A-10), attack profiles
   (level CCRP, loft, dive bomb), or FragOrders URL import
7. **Testing:** verify kneeboard export on Windows with DCS installed
8. **Enhancement:** query aircraft kneeboard paths from the database instead of
   the hardcoded mapping

**Dev Setup Requirements:**
- macOS: `brew install proj cmake pkgconf`
- The `.cargo/config.toml` handles library path configuration automatically
- Run with `npm run tauri dev`, NOT `npm run dev` (plain Vite has no Tauri
  backend and throws `window.__TAURI_INTERNALS__` errors)
