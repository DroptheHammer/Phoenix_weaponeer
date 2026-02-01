# DCS Attack Planner - Claude Code Instructions

## Session Management (IMPORTANT)

**When the user says they need to pause, leave, change devices, or end the session in ANY way:**

1. **Commit and push all changes to git** (no version tag, just save progress)
2. **Update this file** with "Session Pickup Notes" at the bottom - what was being worked on, what's next
3. **Remind the user** if they forget to do this before ending

This ensures work can be resumed from any device (Windows, Linux, macOS, iPhone) with full context.

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

### Phase 2: Core Planning ← IN PROGRESS
- [x] **Map view** - Leaflet map showing waypoints and threat envelopes
- [x] **Threat management** - Import from mission, add planning threats, visual distinction
- [x] **Map interaction** - Click-to-add threats, drag to reposition planning threats
- [x] **Coordinate conversion** - Accurate DCS to lat/lon using proj4 transformations
- [ ] **Attack profile calculator** - Popup CCIP parameters first
- [ ] **Flight roster management** - Assign pilots and loadouts

### Phase 3: Output
- [ ] Kneeboard card renderer (768x1024 PNG)
- [ ] Export to user-selected folder (with quick-pick for DCS kneeboard folder)
- [ ] PDF export option

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

**Last session:** 2026-02-01 (evening session)

**Completed this session:**
- ✅ **Created ROADMAP.md** - Comprehensive development roadmap document
  - Full breakdown of all 4 development phases
  - Current status tracking (Phase 2.1-2.4 complete)
  - Next milestone: Attack Profile Calculator (Phase 2.5)

**Project Status:**
- **Phase 1 (Foundation):** ✅ COMPLETE
- **Phase 2 (Core Planning):** 🔄 IN PROGRESS
  - ✅ Map visualization (2.1)
  - ✅ Threat management (2.2)
  - ✅ Map interaction (2.3)
  - ✅ Coordinate conversion with proj4 (2.4)
  - ❌ Attack profile calculator (2.5) - NEXT
  - ❌ Flight roster management (2.6)
- **Phase 3 (Output):** ❌ NOT STARTED
- **Phase 4 (Polish):** ❌ NOT STARTED

**Important Context from Previous Session:**
- Coordinate conversion fixed using proj4 with (y,x) ordering
- Waypoints display correctly on NTTR map
- Bullseye is tactical reference, NOT map center

**Next up:**
- Attack profile calculator (Popup CCIP parameters)
- Flight roster management

**Dev Setup Requirements:**
- macOS: `brew install proj cmake pkgconf`
- The `.cargo/config.toml` handles library path configuration automatically
