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
- **Kneeboard export to DCS has never run on Windows.** `detect_dcs_folder`
  returns `None` on Mac/Linux, so the auto-export path is untested on the only
  platform it targets.
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

**Last session:** 2026-09-12 (Opus 5, user at the screen). **One commit.**
Gates moved **152 → 156 geo-checks** and **58 → 60 Rust tests**;
`npm run build` clean, `cargo build` zero warnings. Plan at
`~/.claude/plans/we-ve-got-a-problem-glittery-rose.md`.

| Commit | What |
|---|---|
| `3569a5c` | Number waypoints from 0, so the ramp stops eating steerpoint 1 |

### Every steerpoint we printed was one too high

The user spotted it against FragOrders: on Sinai M01 V6 the tool called Barak's
676 ft point **waypoint 2**, FragOrders calls it **Waypoint 1**. The importer
numbered `route.points` from 1 and skipped nothing, so point `[0]` — the parking
spawn at Ramon, alt 31 m = the 102 ft we showed — became steerpoint 1 and pushed
the route up by one. That included every `STPT n` on the kneeboard card, which is
what the pilot dials into the jet.

Waypoints are now numbered by **raw 0-based route-point index**, unconditionally.
The spawn point is waypoint 0 and carries a new `departure` type; it stays listed,
drawn, and offered in the target/IP pickers (type is a hint, never a gate).
`buildKneeboardCard` needed no edit — it already printed `STPT ${wp.steerpoint}`
and simply became correct. Full rationale in memory:
`project-waypoint-numbering-is-zero-based` — **the short version is "never add 1".**

### The FragOrders web bundle is a readable reference now

The git 404s, but fragorders.com serves `/public_frag_order.<hash>.js` (hash in
the page HTML, `.js.map` published too). Grepping it settled both halves of the
question outright, which is why this needed no guessing:

- `each(route.points, (pt, idx) => push({...pt, number: idx}))` — 0-based, with a
  guard that sorted index N must carry number N.
- The DTC generator does `if (0 === r) continue; push({Sequence: r, …})` under
  `SteerpointStart: 1` — so the ramp never becomes a steerpoint in the jet, and
  **cockpit STPT n = waypoint n**. There is no planner/cockpit offset.
- It also reads the group's departure `airdromeId` off the `TakeOffParking` point.

**Gotcha:** the page is a Firebase SPA — `curl` of the URL returns a 1 KB shell.
Fetch the bundle, not the page. In memory: `reference-fragorders-cli`.

`barak_numbering_matches_fragorders` pins waypoint 1 to **N 31° 14.4023′
E 34° 39.5637′**, read off the FragOrders map popup — so it guards the numbering
*and* independently re-confirms the Sinai projection against an outside source.

### START OF NEXT SESSION

1. **The two banked features are still the whole queue.**
2. **Live-geometry Customize** — half-planned in
   `~/.claude/plans/foamy-sauteeing-hejlsberg.md`. The recompute is *already*
   live; `MapView` is prop-driven and a second `MapContainer` is safe. Design
   reference: `Other Items/offset-leg-geometry.html`. **Two questions before
   code:** where the map sits (the editor is a centred modal today), and whether
   knobs become sliders, slider+number pairs, or stay number boxes — bounded by
   *never remove a knob*. **There are 35: 3 common, 12 dive, 9 level, 14
   pop-up** — plus the shared IP selector. **Gotcha:** `MapView` reads
   `useUiStore`'s display filters directly (`:257-259`), so an embedded editor
   map would inherit whatever the main map is hiding; the editor must show the
   truth. **Second gotcha:** `MapController` re-fits on `fitKey` changes — fit
   once on open and hold.
3. Then **multi-aircraft coordinated strike**, which `split_deg` on
   `RunInSummary` is retained for. See memory: `project-live-geometry-customize`.

### Adjacent, noted but not done

- **Missions saved before `3569a5c` read one high** until re-imported. Attacks
  reference waypoints by uuid so nothing breaks. No migration was written: an old
  save is indistinguishable from a new one.
- **`airdromeId` is still dropped at deserialization** (`RoutePoint`,
  `src-tauri/src/parsers/fragorders.rs`). FragOrders uses it to name the departure
  field; carrying it would let waypoint 0 read "Ramon AB" instead of `WP0`, but it
  needs an airdrome-id table we do not have.
- **DTC data is now reachable and unused.** `M01 V6.miz` ships
  `DTC/Op Sentinel Watch M01 F18.dtc`, and the new FragOrders parser exposes
  `ThreatPoints`, `JDAMTargets`, `NavPoints` and FLOT/FAOR `GeoLines` —
  pre-built threat and target data we currently get nowhere. Also available:
  TACAN/ICLS beacons, `startTime`/`TheaterUTCOffset` for TOT, and real pylon
  loadouts (`CLSID`) to fill the hard-coded `loadout: []` in `missionStore.ts`.
- Red **statics** (23 in this mission — ammo depots, tanks, warehouses) and red
  **planes** are still never scanned; only `country.vehicle` is. The `static`
  key binds correctly now, so the data is there.
- Kola / Afghanistan / The Channel projections; PDF export; FragOrders URL
  import (blocked on API access); loft geometry; aircraft kneeboard paths from
  the DB; verifying kneeboard export on Windows with DCS installed.
