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

**Last session:** 2026-07-12

**Completed this session:**
- ✅ **Bug Scan + Bugfix Plan (Phase 3.5 created)**
  - Ran a full codebase bug scan after user reported "weird movement around waypoints" on the map
  - Found 7 bugs (2 critical) — root cause of the map bug: NaN heading from cleared form input poisons attack overlay geometry; overlay also ignores saved profile values entirely
  - Wrote `docs/BUGFIX_PLAN.md`: 4 staged fixes with per-task verification and stage gates, designed for Sonnet 4.5/4.6 execution one task at a time
  - **Next session: execute Stage 1 of docs/BUGFIX_PLAN.md**
  - All 19 Rust tests pass; coordinate conversion verified healthy
- ✅ **Phase 3: Export System Completion** 
  - **Improved batch export UX:** Replaced awkward save-file workaround with proper folder picker using `open({ directory: true })`
  - **DCS folder auto-detection (Windows):** Added `detect_dcs_folder` Rust command that detects `%USERPROFILE%\Saved Games\DCS` or `DCS.openbeta` on Windows
  - **Quick export to DCS:** New "🎯 Export All to DCS Folder" button that auto-detects DCS kneeboard path and exports directly, with graceful fallback to folder picker if DCS not found
  - **Cross-platform support:** Mac/Linux users get folder picker (DCS not officially supported on these platforms)
  - **Files modified:**
    - `src-tauri/src/commands/mod.rs` — added `detect_dcs_folder` command with Windows path detection
    - `src-tauri/src/lib.rs` — registered new command in invoke handler
    - `src/lib/dcsExport.ts` — new utility module with `getDcsKneeboardPath()` and `getAircraftKneeboardPath()` helpers
    - `src/components/kneeboard/KneeboardPreview.tsx` — added `handleExportToDCS()`, updated button UI with three export options
  - **Three export workflows:**
    1. Export Selected — save single card with filename picker (unchanged)
    2. Export All to Folder — batch export with proper folder picker (improved)
    3. Export All to DCS Folder — auto-detect DCS path and batch export (new)

**Previous session:** 2026-03-29

**Completed previous session:**
- ✅ **Project Documentation Sync**
  - Updated ROADMAP.md to reflect Phase 2 complete, Phase 3 in progress
  - Updated CLAUDE.md Development Phases section to match actual status
  - Removed token usage HP bar requirement from instructions
  - Added .gitignore rules for PNG/JPG in src-tauri/ (kneeboard exports)
  - All project status documents now in sync

**Previous session:** 2026-02-16

**Completed previous session:**
- ✅ **Kneeboard Card Generation (Phase 3 start)**
  - `src/lib/buildKneeboardCard.ts` — assembles `KneeboardCard` from mission data: finds pilot, target WP, weapon, fuze, nearby threats (bearing/distance), generates numbered steps and diagram data
  - `src/lib/renderKneeboardCanvas.ts` — draws 768×1024 DCS-format PNG on HTML Canvas:
    - Header (dark navy): callsign, target name, profile type, date
    - Target section: name, coordinates (DD MM'SS"), elevation
    - Weapon section: compact "2× Mk-82 | Pair | M905" + min-safe-alt warning
    - Threats section: compact rows with BRG/DIST/MAX RNG, red highlight if inside engagement range
    - Attack diagram: side-profile altitude view (IP → POP → ★apex → ATK → TGT → egress arrow) with scaled altitude lines, hard deck, release alt
    - Step-by-step procedure: 5 numbered steps for popup CCIP (check-in, pop, roll-in, release, egress) written for amateurs
  - `src/components/kneeboard/KneeboardPreview.tsx` — full UI: attack selector dropdown, live canvas preview (half-scale), "Export Selected" (native save dialog) and "Export All" (picks folder) buttons
  - `save_kneeboard_png` Rust command — decodes base64 PNG, writes to path (with dir creation)
  - Added `tauri-plugin-dialog` for native save file picker (`dialog:allow-save` in capabilities)
  - `src/types/kneeboard.types.ts` — added `KneeboardStep`, `KneeboardDiagramData`, wired into `KneeboardAttackSection`

**Project Status:**
- **Phase 1 (Foundation):** ✅ COMPLETE
- **Phase 2 (Core Planning):** ✅ COMPLETE
  - ✅ Map visualization, Threat management, Map interaction, Coordinate conversion
  - ✅ Popup CCIP attack calculator
  - ✅ Flight roster + loadout management
- **Phase 3 (Output):** ✅ MOSTLY COMPLETE
  - ✅ Kneeboard canvas renderer (Feb 2026)
  - ✅ PNG export with folder picker (Jul 2026)
  - ✅ DCS folder auto-detection and quick export (Jul 2026)
  - ❌ PDF export (optional, not started)
- **Phase 4 (Polish):** ❌ NOT STARTED

**Important Technical Notes:**
- Attack geometry uses law of cosines for offset turn calculations
- Modal components render via React Portal to document.body (z-index 2000)
- Popup CCIP validated geometry: POP 4nm → ATK 2.14nm @ 7500ft → 20° dive
- **DCS callsign format:** DCS stores callsigns as `{name="Viper12", 1=1, 2=1}`. `src/lib/callsign.ts` normalises to "Viper 1-2" at import and display time.
- **Loadout stores weapon name string** (e.g. "Mk-82 LDGP") — matched against `weapon.name` from DB when filtering attack editor.
- **Modal background color:** use `bg-dcs-navy` — `bg-dcs-panel` is not defined in tailwind.config.js and renders transparent.
- **Kneeboard export:** Three workflows: (1) Export Selected - single card with filename picker, (2) Export All to Folder - batch with folder picker, (3) Export All to DCS - auto-detects `%USERPROFILE%\Saved Games\DCS\Kneeboard\{aircraft}\` on Windows
- **DCS path detection:** `detect_dcs_folder` command checks standard DCS and DCS.openbeta paths on Windows, returns None on Mac/Linux
- **Known pre-existing TS errors:** `AttackEditor.tsx`, `PopupCCIPForm.tsx` have unused var warnings and a `offsetDirection` field mismatch with `PopupCCIPProfile` type — pre-existing, not blocking.
- **Kneeboard diagram:** side-profile (altitude vs distance), not top-down map. ATK X position computed from `rollInAltitude / tan(diveAngle)` in nm.

**Next up (IN ORDER):**
1. **Phase 3.5 Bugfix Sprint — START HERE:** Execute `docs/BUGFIX_PLAN.md` stage by stage. Fixes the "weird movement around waypoints" bug (NaN heading → broken overlay geometry) plus 6 other bugs found in the 2026-07-12 code scan. Plan is written for Sonnet 4.5/4.6 execution: one small task at a time, each with its own verification, stage gates between stages.
2. **Phase 3.3 (Optional):** PDF export — multi-card PDF generation for print-friendly briefing packages
3. **Phase 4 Polish:** Additional aircraft (F/A-18, A-10), attack profiles (level CCRP, loft, dive bomb), or FragOrders URL import
4. **Testing:** Verify kneeboard export on Windows machine with DCS installed
5. **Enhancement:** Query aircraft kneeboard paths from database instead of hardcoded mapping

**Bug scan findings (2026-07-12, full detail in docs/BUGFIX_PLAN.md):**
- NaN heading from cleared input poisons attack overlay geometry (`PopupCCIPForm` → `attackGeometry.ts` `??` doesn't catch NaN)
- `AttackProfileOverlay` uses hardcoded `getRecommendedParams()` test data, ignores saved profile values
- Rust: failed threat coordinate conversion lands threats at (0,0); waypoints silently dropped
- `infer_waypoint_type` substring matching too loose ("SLIP"→ip, "BEACH"→bullseye)
- react-leaflet `interactive` prop is creation-time only — placement mode toggle doesn't propagate
- Reminder: run the app with `npm run tauri dev`, NOT `npm run dev` (plain Vite has no Tauri backend)

**Dev Setup Requirements:**
- macOS: `brew install proj cmake pkgconf`
- The `.cargo/config.toml` handles library path configuration automatically
