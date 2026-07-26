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

**Last session:** 2026-07-26

**Completed this session — Phase 3.5 Bugfix Sprint, ALL FOUR STAGES + verification**

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
- **Marker stacking:** `src/components/map/mapLayers.ts` (`MARKER_Z`). Leaflet
  orders markers by latitude by default, which is why this is explicit.
- **react-leaflet gotcha:** `interactive` and tooltip `direction` are applied
  only when a layer is created. Toggling them on an existing marker does
  nothing — include the changing value in the component `key` to force a
  remount.

**Next up (IN ORDER):**

1. **Projection support for every DCS map — START HERE.** The squadron flies all
   maps, but only Nevada and Caucasus have proj4 strings; the rest are rejected
   at import. Plan is written and approved (see below). `docs/THEATER_DATA_REQUEST.md`
   is ready to send to the FragOrders author at FragOrders.
   - **Blocked on the FragOrders author** only for the per-map data. Two things can proceed now:
     - `git pull` in `~/Projects/fragorders` — that clone is 6 months stale
       (last commit `69fe3f5`, 2026-01-26) and the newer `ui/src/lib/theater.ts`
       may already list every map, which would make the request moot. FragOrders
       handles all maps correctly in daily use, so the data exists somewhere;
       it is not in the Go/SQL/proto layers of the stale checkout.
     - **Build the derivation harness** (`src-tauri/src/bin/derive_projection.rs`).
       Not blocked at all — prove it against Caucasus and Nevada as controls.
   - **Method is already validated.** Given ground-truth (DCS x/y ↔ lat/lon)
     pairs and `k_0=0.9996`, the offsets fall out exactly:
     ```
     Nellis (36.235,-115.034) → raw tmerc @ lon_0=-117 → E=176674.252, N=4011806.003
     x_0 = dcs_y - E = -17321.7  - 176674.252  = -193995.95  (published -193996)
     y_0 = dcs_x - N = -398222.0 - 4011806.003 = -4410028.0  (published -4410028)
     ```
   - **Decided:** unverified projections import with a **visible warning** (UI
     banner + caution line on kneeboard cards), never silently trusted.
   - **Watch out:** we match the DCS `theatre` string exactly, so a wrong
     `dcs_name` means the map is rejected even with a perfect projection.
     `Sinai` and `SouthAtlantic`/`Falklands` are the least certain — the request
     doc asks the FragOrders author to confirm all of them.
   - **Known desync to fix as part of this:** Rust has 12 theaters,
     `src/types/mission.types.ts` has 9 (`marianas` and `afghanistan` cannot be
     represented in the frontend at all). Adding a map currently means editing
     three places. Plan is to make Rust the single source of truth via a
     `list_theaters` command. `bounds` in `src/data/theaters.ts` is dead data,
     never read anywhere.
2. **Phase 3.3 (Optional):** PDF export — multi-card print-friendly packages
3. **Phase 4 Polish:** additional aircraft (F/A-18, A-10), attack profiles
   (level CCRP, loft, dive bomb), or FragOrders URL import
4. **Testing:** verify kneeboard export on Windows with DCS installed
5. **Enhancement:** query aircraft kneeboard paths from the database instead of
   the hardcoded mapping

**Dev Setup Requirements:**
- macOS: `brew install proj cmake pkgconf`
- The `.cargo/config.toml` handles library path configuration automatically
- Run with `npm run tauri dev`, NOT `npm run dev` (plain Vite has no Tauri
  backend and throws `window.__TAURI_INTERNALS__` errors)
