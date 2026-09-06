# DCS Attack Planner - Full Development Roadmap

## Overview
Cross-platform desktop app for planning F-16 attack missions in DCS World.

**Core Workflow:** Import mission → Define threats → Plan attacks → Generate kneeboards

---

## Phase 1: Foundation ✅ COMPLETE

### 1.1 Project Setup ✅
- [x] Initialize Tauri + React + TypeScript project
- [x] Configure Vite build system
- [x] Set up Tailwind CSS

### 1.2 Data Layer ✅
- [x] SQLite integration with bundled databases
- [x] Threat system database (SAMs, AAA, MANPADS)
- [x] Weapon database (bombs, guided munitions)
- [x] Basic data models (Mission, Waypoint, ThreatInstance)

### 1.3 Import Pipeline ✅
- [x] FragOrders JSON import (file-based)
- [x] Parse waypoints, threats, bullseye
- [x] Theater detection (Nevada, Caucasus, etc.)

### 1.4 Infrastructure ✅
- [x] GitHub Actions for cross-platform releases
- [x] Zustand state management
- [x] Basic UI shell with tab navigation

---

## Phase 2: Core Planning ✅ COMPLETE

### 2.1 Map Visualization ✅
- [x] Leaflet map integration
- [x] Waypoint markers with steerpoint labels
- [x] Threat envelope rings (range circles)
- [x] Bullseye marker
- [x] Theater-appropriate map tiles

### 2.2 Threat Management ✅
- [x] Display mission threats (from import)
- [x] Add planning threats (user-added, visually distinct)
- [x] Threat picker from database
- [x] Delete threats

### 2.3 Map Interaction ✅
- [x] Click-to-add threats at location
- [x] Drag to reposition planning threats
- [x] Mission threats locked (not draggable)

### 2.4 Coordinate Conversion ✅
- [x] Proj4 integration for accurate transformations
- [x] Nevada (NTTR) projection support
- [x] Caucasus projection support
- [x] Correct (y,x) coordinate ordering

### 2.5 Attack Profile Calculator ✅
- [x] Attack profile data model
- [x] Popup CCIP calculator
  - [x] Run-in parameters (altitude, speed, heading)
  - [x] Pop distance and climb angle
  - [x] Apex altitude
  - [x] Dive angle and release altitude
  - [x] Egress direction
- [x] Attack profile UI component
- [x] Link attacks to target waypoints
- [x] Calculate/display attack geometry on map

### 2.6 Flight Roster Management ✅
- [x] Flight member data model
- [x] Add/edit flight members (1-4 per flight)
- [x] Assign callsigns and positions
- [x] Aircraft selection (F-16C initially)
- [x] Loadout editor (simple weapon type + quantity)
- [x] Assign attacks to flight members

---

## Phase 3: Output ✅ MOSTLY COMPLETE (PDF export outstanding)

### 3.1 Kneeboard Card Renderer ✅
- [x] 768x1024 pixel canvas
- [x] Layout engine with sections:
  - [x] Header (callsign, date, target)
  - [x] Target info (coords, elevation, description)
  - [x] Threats (nearby SAMs with bearing/range)
  - [x] Attack profile diagram (side-view altitude profile)
  - [x] Weapon settings (fuze, release mode)
  - [x] Step-by-step procedures
- [x] Font rendering (readable at cockpit distance)
- [x] PNG export

### 3.2 Export System ✅
- [x] Native file picker for output location
- [x] Export selected attack card
- [x] Batch export with proper folder picker (improved UX)
- [x] DCS kneeboard folder auto-detection (Windows)
- [x] Quick export to DCS with graceful fallback

### 3.3 PDF Export (Optional) ❌ NOT STARTED
- [ ] Multi-card PDF generation
- [ ] Print-friendly layout

---

## Phase 3.5: Bugfix Sprint ✅ COMPLETE (2026-07-26)

Prompted by "weird movement around the waypoints" on the map. Full detail in
`docs/BUGFIX_PLAN.md`; all four stages implemented, both gates green, and every
fix verified by hand in the running app against the real NTTR Red Flag mission.

### 3.5.1 Attack Geometry ✅
- [x] Clearing the heading field stored `NaN`, which propagated into every
      overlay point — the reported bug
- [x] Overlay drew hardcoded reference params and ignored the saved profile, so
      editing pop distance or apex changed nothing on the map
- [x] Egress label always read "Defend right" regardless of the drawn line

### 3.5.2 Map ✅
- [x] Map framed a hardcoded theater coordinate instead of the imported mission
- [x] Placement-mode clicks were swallowed by markers (`interactive` is applied
      only at layer creation in react-leaflet)
- [x] Explicit marker stacking order — navigation and attack symbols always
      above threats, rather than Leaflet's default latitude ordering

### 3.5.3 Import Robustness ✅
- [x] Failed threat conversions placed threats at (0,0); now dropped and logged
- [x] Silently dropped waypoints and trigger zones now logged
- [x] A known theater with no proj4 string used to pass the theater check and
      then fail every conversion, reporting success with an empty mission; now
      rejected up front
- [x] Waypoint type inference matched bare substrings ("SLIP" → IP) and treated
      tanker callsigns as tanker waypoints (the real Viper route has a nav
      turnpoint named ARCO)

### 3.5.4 Attack Editor ✅
- [x] Saving a hand-edited profile was impossible — only presets triggered the
      required calculation, and presets overwrite the edited values
- [x] Disabled Save now explains what is missing; calculation errors are shown
- [x] Portal-rendered modals inherited near-black text on a navy panel

### 3.5.5 Test Data & Regression Cover ✅
- [x] Real FragOrders export promoted to `test-data/nttr_redflag_viper1.json`
- [x] `test_fragorders.json` marked as synthetic — its coordinates land 300+ km
      off the NTTR map, and it caused two separate false hunts for a
      coordinate-conversion bug that never existed
- [x] Coordinate conversion pinned by ground-truth landmark tests and an
      explicit axis-order test (a round-trip test cannot detect an axis swap)

---

## Phase 3.6: Theater Projection Support ✅ COMPLETE (2026-07-29)

Only Nevada and Caucasus had proj4 projections, so every other map was rejected
at import. The FragOrders author supplied FragOrders' full theater table
(`docs/fragorders-response-maps.txt`), taking coverage from 2 maps to 12 of 13.

### 3.6.1 Projections ✅
- [x] 10 new proj4 strings: Syria, Persian Gulf, Normandy, Marianas, Falklands,
      Sinai, Kola, Afghanistan, plus two maps we did not previously list at all
      (Germany Cold War, Iraq)
- [x] Caucasus and Nevada confirmed identical to our own ground-truth strings —
      no adjustment needed on either verified map
- [x] `+k` normalized to `+k_0` (PROJ alias FragOrders uses on four theaters)
- [x] Normandy's float noise rounded (`-195526.00000000204` → `-195526`)

### 3.6.2 DCS Name Corrections ✅
- [x] Sinai is `SinaiMap` in DCS, not `Sinai` — would have rejected every Sinai
      mission regardless of the projection
- [x] Removed `SouthAtlantic`, which DCS never writes; the map is `Falklands`

### 3.6.3 Single Source of Truth ✅
- [x] `THEATER_PARAMS` (Rust) is now authoritative; frontend reads it via a new
      `list_theaters` command instead of keeping a parallel hard-coded list
- [x] Deleted `src/data/theaters.ts` — its 9-theater list had drifted from
      Rust's 12, and its `bounds` field was dead data read by nothing
- [x] `Theater` is no longer a union of string literals that had to be edited
      in lockstep

### 3.6.4 Unverified Projections ✅
- [x] Nine projections cross-checked by re-projecting each theater's published
      corner bounds — they land on whole kilometres, which a wrong offset would
      not (`test_projections_reproduce_their_own_map_corners`)
- [x] Sinai, Kola and Afghanistan ship hand-typed bounds and cannot be checked
      this way; flagged `verified: false` and warned about in the UI, both in
      the import preview and as a banner over the map
- [x] No weak check invented for the unverifiable three — a round-trip test
      would pass regardless and repeat the false-confidence mistake that cost
      two sessions on coordinate conversion

### 3.6.6 Verified in-app ✅ (2026-09-05)
- [x] Import works with the theater list arriving asynchronously from
      `list_theaters` rather than a hard-coded frontend table
- [x] The amber unverified-projection warning shows in the import preview and as
      a banner over the map, exercised on Sinai via
      `test-data/sinai_SYNTHETIC_banner_check.json`

### 3.6.5 Still Outstanding ❌
- [ ] **The Channel** — the only map FragOrders did not supply. Needs
      ground-truth (DCS x/y ↔ lat/lon) pairs read off the F10 map by someone
      who owns it, then the offsets fall out arithmetically.
- [ ] Verify Sinai, Kola and Afghanistan against a real mission in DCS

---

## Phase 4: Polish ❌ NOT STARTED

### 4.1 Enhanced Import
- [ ] FragOrders URL scraping (when API access available)
- [ ] .miz file parser (direct DCS mission import)
- [ ] Tacview XML import

### 4.2 Additional Aircraft
- [ ] F/A-18C Hornet
  - Weapon compatibility
  - Delivery modes (AUTO, CCIP, CCRP)
- [ ] A-10C II Warthog
  - GAU-8 gun runs
  - Extended weapon database

### 4.3 Additional Attack Profiles
- [ ] Level CCRP (GPS/laser guided)
- [ ] Loft CCRP (standoff delivery)
- [ ] Dive bomb (high-angle CCIP)
- [ ] Strafing runs

### 4.4 Mission Planning Enhancements
- [ ] Threat exposure calculator
- [ ] Ingress/egress route optimization
- [ ] Time-on-target planning
- [ ] Weather considerations

### 4.5 Quality of Life
- [x] Mission save/load to JSON files ✅ (2026-09-05)
  - [x] Open / Save / Save As in the app header, native pickers
  - [x] Dirty indicator and an unsaved-changes guard on New/Import/Open/Close
  - [x] Cmd/Ctrl+S
- [ ] Recently used missions list
- [ ] Copy/paste attacks between flight members
- [ ] Undo/redo for planning changes

---

## Phase 5: Revamp 🚧 IN PROGRESS (started 2026-09-05)

Full plan, decisions and the user's design principles: `docs/REVAMP_PLAN.md`.
Rollback point: tag `v0.1-pre-revamp` / branch `pre-revamp` at `13067c1`.

### M0 — Card trust fixes ✅ (2026-09-05, reviewed in-app)
- [x] Egress heading "undefined°" — one shared resolver for map and card;
      wording is "Egress RIGHT"
- [x] Weapon sanity checks (they had been silently dead — reading fields the
      DB never returns): weapon vs delivery, release vs weapon minimum and frag
      min-safe, speed limits, hard deck vs release, roll-in vs release. Shown in
      the editor, printed on the card
- [x] Release altitude never defaults below the weapon (floor = max(min
      release, frag min-safe)); editable field that defaults to the floor
- [x] Unverified-map caution strip on the card
- [x] Step list no longer runs under the footer
- [x] Hard deck is AGL everywhere; the duplicate hard-deck input is gone

### M1 — Profile library + auto-build 🚧 BUILT, NOT YET VERIFIED IN-APP (2026-09-06)
- [x] `DeliveryProfile` model; bundled per-aircraft JSON + user override folder;
      validated on load, tested
- [x] Auto-build: target → attacker → weapon → complete, alert-free attack;
      Customize reveals the numbers
- [x] Level and dive geometry, overlay, card (CCIP / manual-with-mils / DTOS /
      CCRP-AUTO step text; ESTIMATED strip; profile setup lines)
- [x] Weapon classes (derived in TS — no schema change)
- [ ] Loadout from FragOrders pylons (needs a CLSID → weapon table)
- [x] Seed profiles for F-16C, F/A-18C, A-10C II, F-4E, A-4E-C, F-5E, F-14,
      Mirage F1, AV-8B, F-15E — 62 profiles, all ESTIMATED until a pilot verifies
- [ ] Loft geometry (LABS / F-16 loft profiles ship hidden until then)
- [ ] Eyeball in the running app

### M2 — Map-first, hands-on ❌
- [ ] Rail by job (Targets / Threats / Flight / Cards) with a readiness line
- [ ] Threat palette: drag chips onto the map
- [ ] Attack handles on the overlay; exposure colouring inside SAM rings

### M3 — Send to flight ❌
- [ ] One-click brief pack: per-pilot PNGs, zip laid out for Saved Games,
      mission file

---

## Current Status

**Last Updated:** 2026-09-05

**Completed:**
- Phase 5 M0: card trust fixes (2026-09-05)
- Phase 4.5: Mission save/load UI (2026-09-05)
- Phase 1: Foundation (all sections)
- Phase 2: Core Planning (all sections 2.1-2.6)
- Phase 3: Output (sections 3.1-3.2 complete, 3.3 optional not started)
- Phase 3.5: Bugfix Sprint (all four stages, verified in-app)
- Phase 3.6: Theater Projection Support (12 of 13 maps)

**Next Up:**
- **Phase 5 M1 — profile library + auto-build** (`docs/REVAMP_PLAN.md`)
- Then M2 (map-first) and M3 (send to flight); PDF export only if asked

---

## Session Notes

**2026-07-12:** Phase 3.2 Export System completed. Added proper folder picker for batch export, DCS folder auto-detection on Windows, and quick export button with graceful fallback. Export UX significantly improved.

**2026-03-29:** Roadmap updated to reflect completion of Phase 2 and progress on Phase 3. Kneeboard card generation and export system now fully functional.

**2026-02-16:** Completed kneeboard card renderer with canvas-based PNG generation, attack profile diagrams, and native file export dialogs.

**2026-02-01:** Fixed coordinate conversion - waypoints now display correctly on NTTR map using proj4 transformations with correct (y,x) coordinate ordering.
