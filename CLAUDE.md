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

**Last session:** 2026-09-11 (Opus 5, user at the screen). **Three commits, all
pushed.** Gates moved **132 → 152 geo-checks** and **48 → 58 Rust tests**;
`npm run build` clean, `cargo build` zero warnings. Plan at
`~/.claude/plans/ok-what-s-next-in-synthetic-cloud.md`.

| Commit | What |
|---|---|
| `0217859` | New FragOrders export supported; Sinai projection verified |
| `2bfb7c6` | Any waypoint can be a target, and any waypoint can be the IP |
| `f984f39` | Open on a FragOrders export now says to use Import |

### The new FragOrders is a CLI, and the format did not change

The FragOrders author's rebuild is **`cmd/cli`** (cobra, commit `a3c1ff1316dd`, 2026-09-06),
not an application to open. `fragorders parse mission.miz > mission.json` —
the same workflow as before. `inspect` gives a readable timing/groups/DTC
summary. **`parse` still emits the raw DCS mission table**, identical top-level
keys plus a new `startTime`. Everything in the changelog is *more decoding*, not
a new schema.

**The fragorders git cannot be refreshed** — `FragOrders/fragorders` 404s to the
user's authenticated `gh`. The local checkout is frozen at Jan 26. Mine a new
binary with `go version -m` and `strings` instead. In memory:
`reference-fragorders-cli`.

`test-data/sinai_m01_v6.json` is the new reference fixture (theater `SinaiMap`,
86 groups, 8 client flights, 34 threats all resolving to DB rows). The old NTTR
fixture is now covered by a test too — before this session **no test loaded any
fixture at all**, which is how `RoutePoint.eta` sat renamed to `"ETA"` against
real data that writes `"eta"`.

### Sinai is verified — and the near-miss is the lesson

Four single-unit `EW-*` radars from `M01 V6.miz`, spanning 700 km × 440 km,
read off the F10 map. **All four agreed to 27 m**; residuals uniformly positive
(+19 m N, +22 m E) because the ME truncates seconds. No correction needed.

**The trap:** projecting *parked aircraft* against published airfield reference
points first showed a convincing **−1.36 km northward bias (sd 0.45)** — mean
three times the scatter. That was the ramp-to-datum offset, not a projection
error. Applying it would have broken a projection already right to 27 m. Method
and warning are in memory: `project-verifying-theater-projections`. Kola,
Afghanistan and The Channel remain.

### Waypoint type is a hint, never a gate

The Sinai mission was **unplannable**: the Target dropdown filtered on
`wp.type === 'target'`, and M01 V6 names **none** of its 55 route points, so
everything imported as `nav`. Any waypoint can now be a target, and any waypoint
can be the IP — including one later in the route.

Behind the IP work was a real defect: `autoBuildAttack` always called `inferIp`
and never read a chosen `ipWaypointId`, so on pop-up a picked IP moved the drawn
line while the computed run-in disagreed. `resolveIp` fixes that; one selector
now serves all three profile types. Watch two things if you touch this:
`resetToProfile` must clear the override, and `autoBuildAttack` *writes* the
resolved IP onto every profile, so a stored id is not evidence of a choice —
that is what `initialIpOverride` is for. In memory:
`project-waypoints-are-free-text`.

### START OF NEXT SESSION

1. **The two banked features are still the whole queue.**
2. **Live-geometry Customize** — half-planned in
   `~/.claude/plans/foamy-sauteeing-hejlsberg.md`. The recompute is *already*
   live; `MapView` is prop-driven and a second `MapContainer` is safe. Design
   reference: `Other Items/offset-leg-geometry.html`. **Two questions before
   code:** where the map sits (the editor is a centred modal today), and whether
   knobs become sliders, slider+number pairs, or stay number boxes — bounded by
   *never remove a knob*. **There are 35: 3 common, 12 dive, 9 level, 14
   pop-up** — plus the new shared IP selector. **Gotcha:** `MapView` reads
   `useUiStore`'s display filters directly (`:257-259`), so an embedded editor
   map would inherit whatever the main map is hiding; the editor must show the
   truth. **Second gotcha:** `MapController` re-fits on `fitKey` changes — fit
   once on open and hold.
3. Then **multi-aircraft coordinated strike**, which `split_deg` on
   `RunInSummary` is retained for. See memory: `project-live-geometry-customize`.

### Adjacent, noted but not done

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
