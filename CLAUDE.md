# DCS Attack Planner - Claude Code Instructions

## Session Management (IMPORTANT)

### START OF SESSION
**When beginning work, ALWAYS:**
1. **Pull latest from GitHub:** `git pull origin main`
2. This ensures you're working from the cloud golden master on any device

### END OF SESSION
**When the user says they need to pause, leave, change devices, or end the session in ANY way:**

1. **Commit and push all changes to git** (no version tag, just save progress)
2. **Replace** the "Session Pickup Notes" section at the bottom of this file with fresh notes for the session that just ended — what was being worked on, what's next. **Replace, don't append** — before overwriting, move the outgoing notes to the top of `docs/SESSION_HISTORY.md` (that file is newest-first) so nothing is lost. Keep only the current session's notes in CLAUDE.md itself.
3. If anything from the session is a durable lesson or decision that should shape *any future* session (not just the next one) — a closed design question, a "don't do X" correction, a standing project policy — add or update an entry in the memory system (`~/.claude/projects/-Users-<user>-Projects-Phoenix-Weaponeer/memory/`) rather than relying on it surviving only in the history archive.
4. **Push the updated CLAUDE.md and docs/SESSION_HISTORY.md** to GitHub
5. **Remind the user** if they forget to do this before ending

This workflow ensures GitHub is always the source of truth and work can be resumed from any device (Windows, Linux, macOS, iPhone) with full context, and keeps CLAUDE.md itself from growing without bound.

## Project Overview

A cross-platform desktop application for planning F-16 (and other aircraft) attack runs against defended targets in DCS World. The tool helps squadron members plan tactical attacks, weaponeer targets, and generate pilot briefing cards (kneeboards).

## Core Workflow

1. **Import mission data** from FragOrders (via .miz file, Tacview XML, or URL scraping) or manual entry
2. **Define threat laydown** at target areas (SAMs, AAA, MANPADS)
3. **Plan attack geometry** per flight member (popup, level, loft, dive bomb, etc.)
4. **Select weapons and delivery parameters**
5. **Generate kneeboard cards** in DCS-compatible format (768x1024 PNG)

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

Homebrew's own `pkg-config` (installed via the `pkgconf` package above) already
defaults its search path to `/opt/homebrew/lib/pkgconfig`, so `proj` is found
automatically with no `PKG_CONFIG_PATH` export needed. `src-tauri/.cargo/config.toml`
only adds a linker search path, and only for the `aarch64-apple-darwin` target —
it never applies to Linux/Windows builds — those compile `proj`'s bundled PROJ
source via CMake instead (see the release CI section below).

## Release Process

`.github/workflows/release.yml` builds installers for all three platforms on
every `v*` tag push (macOS: `.dmg`, Windows: NSIS `.exe`, Linux: `.deb`/`.rpm`/
`.AppImage`) via `tauri-apps/tauri-action`, and attaches them to a **draft**
GitHub Release — publish it manually once the artifacts are verified. All
three platforms build `proj`'s bundled PROJ source via CMake rather than
linking a system library, since no CI runner has `libproj` preinstalled; this
only works because `proj-sys` ≥0.25 bundles PROJ ≥9.4.0, whose
`cmake_minimum_required` floor modern CMake still accepts (PROJ 9.2.1, bundled
by older `proj-sys`, does not — that mismatch is what silently broke macOS and
Windows CI until 2026-09-12, see `docs/SESSION_HISTORY.md`).

**Before tagging a release**, bump the version number in all three of:
- `package.json` (`version`)
- `src-tauri/Cargo.toml` (`[package] version`)
- `src-tauri/tauri.conf.json` (`version`)

then commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`. There's no sync
script — these three fields are kept in sync by hand, on purpose (release
cadence is low; see `docs/INSTALLING.md` for user-facing install notes,
including the unsigned-binary SmartScreen/Gatekeeper workarounds).

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
- [x] Export to DCS — per-aircraft kneeboard folders, user-chosen once and remembered (⚙ Settings)
- [ ] PDF export option (optional)

### Phase 4: Polish
- [x] Additional aircraft modules — 62 delivery profiles across ten aircraft
- [x] Level CCRP and dive bomb geometry
- [ ] Loft geometry (LABS, F-16 loft) — profiles ship hidden, geometry unbuilt
- [ ] FragOrders URL import (when API access provided)

### Phase 5: The two banked features (NEXT)
- [ ] **Live-geometry Customize** — sliders over a map that redraws as you
      drag. Reference: `Other Items/offset-leg-geometry.html` (git-ignored).
- [ ] **Multi-aircraft coordinated strike** — 1–4 aircraft on a joint strike,
      adjusted as a group or per aircraft. `split_deg` on `RunInSummary` is
      retained for this.

## Known Issues / Future Testing

- **DO NOT re-open, both closed by the user 2026-09-09:** attack #1's egress
  preferring attack #2's run-in (existing threat-aware logic stands), and
  fuze-dependent release floors (the tool assumes impact detonation — see
  `docs/DELIVERY_PLANNING.md`).
- **The Channel has no projection**, and Kola / Afghanistan are
  `verified: false`. All three need ground-truth DCS x/y ↔ lat/lon pairs off the
  F10 map; the arithmetic is already validated. **Sinai is done** (2026-09-11) —
  use the same method: pick single-unit groups out of a mission so the x/y comes
  from the `.miz` and only lat/lon is read on screen. See the Sinai section of
  `test-data/README.md`; do not use parked aircraft as ground truth.
- **Kneeboard export to DCS has never run on Windows.** The folder is
  user-chosen once per aircraft type and remembered (⚙ Settings,
  `src-tauri/src/settings.rs`) — never auto-assumed. The picker's best-guess
  start point and the remembered-folder flow are untested on Windows, the only
  platform DCS runs on.
- `render_kneeboard` and `export_to_dcs_kneeboard` are unimplemented stubs
  returning errors. Check callers before assuming they are dead; the live
  export path is `save_kneeboard_png`.
- [x] **Coordinate conversion** — ✅ FIXED, and cleared of suspicion twice
  since. proj4 Transverse Mercator per theater, pinned by landmark and
  axis-order tests. **Read the warning in the 2026-07-26 notes below before
  suspecting it a third time.**

## Important Context

- **Primary users:** DCS squadron members planning Saturday missions
- **Data source:** FragOrders.com provides mission briefs, waypoints, threat info
- **Output goal:** Kneeboard cards that fit DCS format with employment parameters
- **Aircraft focus:** F-16C initially, expandable to F/A-18C, A-10C II
- **`Other Items/`** at the repo root is a git-ignored drop zone for screenshots, exported cards, and scratch reference pages the user wants read (e.g. `offset-leg-geometry.html`, a design reference — do not delete it). Never commit it.
- **Durable lessons and decisions belong in the memory system**, not just in session notes — see `~/.claude/projects/-Users-<user>-Projects-Phoenix-Weaponeer/memory/MEMORY.md`.

## Reference Materials

- FragOrders: https://fragorders.com
- pydcs (Python DCS library): https://github.com/pydcs/dcs
- Tauri docs: https://tauri.app/v2/guides/
- DCS kneeboard modding: Community wiki resources

---

## Session Pickup Notes

**This section holds only the current/latest session's notes.** The full
history is in `docs/SESSION_HISTORY.md` (newest-first) — check there for
anything older than the notes below. Durable lessons and decisions live in
the memory system (`~/.claude/projects/-Users-<user>-Projects-Phoenix-Weaponeer/memory/MEMORY.md`),
not here — this section is a snapshot for resuming work, not a journal.

**Last session:** 2026-09-12 → 13 (Opus 5, user at the screen). **Two commits,
pushed.** Gates moved **156 → 189 geo-checks** and **60 → 74 Rust tests**;
`npm run build` clean, `cargo build` zero warnings. Plan at
`~/.claude/plans/i-need-to-plan-transient-breeze.md`. **Version is still 0.2.0**
— not bumped, not tagged.

| Commit | What |
|---|---|
| `fea03ad` | Kneeboard map layer, per-aircraft DCS folders, and the 0.2.1 security sweep |
| (next) | Session notes; adds `test-data/sinai_m01_v7.json` (user-supplied, no test yet) |

### Grey map under the card's north-up picture

`src/lib/kneeboardBasemap.ts` holds the pure tile maths and the loader.
`planViewTransform` was pulled out of `drawPlanView` so alignment is testable:
tiles land within ~0.5 px of the card's projection across the whole box. Drawing
is two passes (`renderKneeboardCardWithMap`): draw with cached tiles, fetch the
missing ones (8 s cap), draw again. Each export gets its own canvas.
**Gotchas:** without `img.crossOrigin = 'anonymous'` every export throws
(tainted canvas); greyscale is a `getImageData` loop because `ctx.filter` is
missing from older WebKit. The wash is **0.20**, chosen from renders at Ramon AB
(0.45 hid the runway, a contrast boost was too busy).

**Reusable technique:** esbuild-bundle a TS harness into a `file://` page, then
`"Google Chrome" --headless=new --virtual-time-budget=30000 --screenshot=…`.
That renders real cards (and proves the PNG encode) without the Tauri app.

### DCS kneeboard folders are user-chosen (user correction)

The folder is never assumed. The first export per aircraft type opens the picker
at a best guess (`settings::suggest_kneeboard_folder`), and the choice is saved in
`<app data>/settings.json`. **⚙ Settings** has Choose…/Reset per type; the
kneeboard panel shows each type's folder with Reset. `detect_dcs_folder` and the
hard-coded 4-aircraft map are gone. The user wants Settings to become the home for
preferences that matter; the "Map background" toggle still lives in `uiStore` and
is not persisted. Memory: `project-dcs-kneeboard-folder-is-user-guided`.

### 0.2.1 review — `docs/REVIEW_0.2.1.md` (status table at the top)

**Fixed:**
- **H1:** shared mission file → script → write any file. Fixed by the
  `validateMission` gate and `escapeHtml` in the divIcon strings.
- **M0:** CSP turned on.
- **M1:** save commands locked to `.json` / `.png`.
- **M2, M3, M7:** via the per-aircraft folders.
- **M4:** window close guard.
- **M5:** error boundary.
- **M6:** filename collisions.

Memory: `project-security-posture`. **Open:** M8 (NaN from a cleared Customize
field — plausible, write the test first) and L1–L9: dead `mlua`/`zip`/`image`/
`rusttype` and stub commands, unused `shell:allow-open`, `npm audit fix`, setup
`expect` panics, CI action pinning, Linux fonts, `cargo-audit` not installed.

### Not yet verified by the user

The user tested the map layer and the Settings/export flow on Mac.
Multi-aircraft export can't be exercised: imports are per flight, one type.
**Still untested** — the list given at the end of the session:
1. **CSP**, the most likely breakage: planner tiles, marker styling, the card
   map, and exports. Unstyled markers → `style-src`; missing tiles → `img-src`.
2. `Other Items/hostile_mission_TEST.json` must be refused, and the title must
   not become HACKED.
3. The user's real older saves still open under `validateMission`.
4. Close guard. macOS Cmd+Q may bypass it.
5. Duplicate card names export as `_2`.

**Windows has not run any of this session's work:** picker start point, tile
CORS on WebView2, CSP.

### START OF NEXT SESSION

1. **Ask whether the test list above passed**; fix what didn't.
2. Settle the remaining review items (M8, Lows). Then bump **0.2.0 → 0.2.1** in
   `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, and
   commit. **Ask before tagging `v0.2.1`** — the tag starts release CI.
3. Then the banked features: **Live-geometry Customize** (half-planned in
   `~/.claude/plans/foamy-sauteeing-hejlsberg.md`; `MapView` reads `useUiStore`
   display filters directly, and `MapController` re-fits on `fitKey`) and
   **multi-aircraft coordinated strike**. Memory: `project-live-geometry-customize`.

### Adjacent, noted but not done

- `test-data/sinai_m01_v7.json` has no README entry or import test yet.
- Missions saved before `3569a5c` read one high until re-imported.
- `airdromeId` is dropped at deserialization, so waypoint 0 can't be named after
  its airfield.
- DTC data (threat/target/nav points, beacons, loadouts) is reachable and unused.
- Red statics and planes are never scanned.
- Kola / Afghanistan / Channel projections; PDF export; FragOrders URL import;
  loft geometry.
