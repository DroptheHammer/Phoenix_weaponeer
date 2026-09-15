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

### RELEASE CHECKLIST
**When the user says "release X.Y.Z" (or "ship" / "cut" / "launch" it), that
means the whole list below, through publishing.** The installers build on
their own the moment the tag is pushed; the user never has to ask for them
separately.

1. **Pull and check the tree is clean:** `git pull origin main`, `git status`.
2. **Run the gates:** `npm run geo-check`, `cargo test --manifest-path
   src-tauri/Cargo.toml`, `npm run build`. All must pass. Stop and report if not.
3. **Bump the version** in all three: `package.json`, `src-tauri/Cargo.toml`,
   `src-tauri/tauri.conf.json`, plus the two top `version` lines of
   `package-lock.json`. Then `cargo build` so `Cargo.lock` follows.
4. **Commit and push** "Bump version to X.Y.Z".
5. **Tag and push the tag:** `git tag vX.Y.Z && git push origin vX.Y.Z`. This
   starts release CI, which builds every installer (macOS, Windows, Linux).
6. **Watch CI** until all three platforms go green (`gh run watch`). If one
   fails, fix, and re-tag only after asking.
7. **Check the draft release** has every installer attached (`.dmg`,
   `-setup.exe`, `.msi`, `.deb`, `.rpm`, `.AppImage`, `.app.tar.gz`).
8. **Write release notes** on the draft in plain language, from the commits
   since the last tag.
9. **Ask the user, then publish** the draft and mark it Latest. Publishing is
   the only point that is public, so this is the one confirmation stop.
10. **Record it** in the Session Pickup Notes (version, CI run id, published).

### How the release build works

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

### Phase 5: The banked features (NEXT)
- [ ] **Live-geometry Customize** — sliders over a map that redraws as you
      drag. Reference: `Other Items/offset-leg-geometry.html` (git-ignored).
- [ ] **Multi-aircraft coordinated strike** — 1–4 aircraft on a joint strike,
      adjusted as a group or per aircraft. `split_deg` on `RunInSummary` is
      retained for this.
- [ ] **Shared custom IP across a flight's attacks** — let a custom IP set on
      one attack be picked by other attacks in the flight (so #2/#3 can fly
      the same IP as #1), instead of each attack only carrying its own. If the
      shared IP is deleted, every attack using it needs to fall back to Auto
      rather than break. Not designed yet — flagged 2026-09-13 while testing
      the per-attack custom IP feature (`src/lib/ipAnchor.ts`).

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
- **Threats the mission author hid are hidden in the planner only**
  (`src/lib/threatVisibility.ts`, 2026-09-14). Either DCS flag
  (`hiddenOnPlanner`, or `hidden` on the F10 map) keeps a threat off the map,
  the threat list, auto-build geometry and cards. Planners see only a
  "probable threats, location unknown" count. ⚙ Settings → Admin reveals each
  kind for the current session. The positions are still in the saved `.json`
  and the `.miz`, so this is honor-system. Sinai M01 hides its entire red
  laydown. Checked on screen by the user 2026-09-14. Memory:
  `project-hidden-threats-policy`.
- The old Rust stubs (`render_kneeboard`, `export_to_dcs_kneeboard`,
  `parse_miz_file`, `new_mission`, the `exporters` module, `MizParser`) and
  their crates (`mlua`, `zip`, `image`, `rusttype`) were removed 2026-09-14
  (review L2/L3). Cards render in the frontend; the only export command is
  `save_kneeboard_png`. `.miz` import goes through FragOrders CLI output.
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
- **Permissions run through the macOS Bash sandbox (auto-allow)**, configured in `.claude/settings.json`: commands inside the project run unprompted; outside folders need `/add-dir`, new sites prompt once per session. Use the Edit/Write/Read tools for files — never python/sed heredoc edits, `cd` prefixes, or loops/globs over outside folders (memory: `feedback-commands-that-dont-prompt`).
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

**Last session:** 2026-09-14, continued (Opus 5, user at the screen). **Three
commits, all pushed, plus this session-notes commit.** Gates: **246 geo-checks**
(was 232), **83 Rust tests** (was 75), `npm run build` clean, `cargo build`
**zero warnings**. Plan at `~/.claude/plans/ok-what-s-next-bubbly-moth.md`.
**Version is still 0.2.1.** Everything below is unreleased, on `main`.

| Commit | What |
|---|---|
| `a20b11d` | Sinai M01 V7 fixture test and README entry |
| `e0ad7fe` | Name unnamed airfield waypoints after their airfield |
| `3b8cfe1` | Hide threats the mission author hid |
| (next) | Session notes |

### Sinai V7 fixture

Same wire shape as V6. `sinai_m01_v7_fixture_imports` pins the content
changes: the new SA-13 (`Strela-10M3`) maps to `9K35 Strela-10`, and Spectre
numbers 0..4. The README lists the full V6→V7 diff.

### Airfield names for waypoint 0

- `RoutePoint` now reads `airdromeId`. An unnamed point tied to an airfield
  takes the airfield's name (Barak waypoint 0 reads **"Ramat David"**). The
  creator's own text always wins, and air starts (id 0) stay blank.
- The table in `src-tauri/src/parsers/airfields_data.rs` is **generated**:
  `npm run gen-airfields` (`scripts/gen-airfields.mjs`), from pydcs pinned at
  `55dc18a`. It covers 11 maps. **Iraq and Afghanistan are absent** (pydcs has
  no terrain for them), so their points stay unnamed.
- **Correction:** the old notes said Barak spawns at "Ramon". **Sinai airfield
  50 is Ramat David.** Every airfield start in both fixtures sits 0.2–3.4 km
  from its pydcs entry, and Barak's 89 NM first leg fits Ramat David, not
  Ramon. `fixture_airfield_ids_sit_at_their_airfields` now guards this for
  Sinai and Nevada. Other maps' ids are pydcs's word only.
- Missions saved earlier keep a blank waypoint 0 until re-imported.

### Hidden enemy threats

Rules are in memory `project-hidden-threats-policy`; don't reopen them. In
short: `hiddenOnPlanner` **or** `hidden` hides a threat from map, list,
auto-build and cards. Planners get a "Probable threats — location unknown"
count. ⚙ Settings → Admin has one session-only switch per flag, and a revealed
threat counts fully. **The user checked it on screen:** Sinai M01 import, both
switches, and relaunch resets them. The one gate is `useVisibleMission()`
(`src/hooks/`) → `src/lib/threatVisibility.ts`. Any new threat consumer must use
it.

**Break-tests (every new test shown to fail):**

| Test | Broken how | Result |
|---|---|---|
| V7 Strela / Spectre asserts | pointed at the V6 file (Strela removed to reach Spectre) | FAIL each |
| Barak "Ramat David", `known_ids_resolve…` | Ramon's name on Sinai id 50 | FAIL |
| NTTR `LAND` stays `LAND` | airfield name overrides the creator's | FAIL |
| `fixture_airfield_ids_sit_at_their_airfields` | Hatzor/Tel Nof ids swapped | FAIL (12.5 km off) |
| `a_hidden_duplicate_never_swallows…` | flags dropped from the dedupe key | FAIL |
| Sinai / NTTR hide-flag tests | group `hidden` not copied onto threats | FAIL both |
| geo-check visibility, probable, leak guard | reveal check inverted; `visibleMission` returns the raw mission | 8 FAIL; 2 FAIL |

**Not directly tested:** the BVR "stays blank" assert (the id-0 guard is
redundant, so no break shows it); the card-level leak (covered only through
`useVisibleMission` at the call site; the lib leak guard tests
`nearestThreatSide`).

### START OF NEXT SESSION

1. `main` has three user-facing changes since `v0.2.1`. Ask whether to cut
   **0.2.2** (bump the three version fields, tag, verify the draft release).
2. Then a banked feature, whichever the user picks: **Live-geometry
   Customize** (half-planned in `~/.claude/plans/foamy-sauteeing-hejlsberg.md`;
   memory `project-live-geometry-customize`), or **multi-aircraft coordinated
   strike together with shared custom IP** (memory `project-shared-custom-ip`).

### Adjacent, noted but not done

- The npm `uuid` advisory is left alone. It only affects v3/v5/v6, the app
  imports only `v4`, and the fix is a breaking jump to uuid 14.
- `Shell::open` is deprecated in favour of `tauri-plugin-opener`. It's only used
  by the button-less `reveal_profiles_dir`.
- `ARCHITECTURE.md` still sketches the removed stubs (`MizParser`,
  `render_kneeboard`, `mlua`). It's the original design doc, not the current
  code.
- `cargo audit` still shows 11 unmaintained/unsound warnings, all deep in
  Tauri's own dependency tree.
- Missions saved before `3569a5c` read one high until re-imported.
- DTC data (threat/target/nav points, beacons, loadouts) is reachable and unused.
- Red statics and planes are never scanned. Sinai V7 has 23 red statics and
  4 red planes; NTTR has 35 red planes. If they are added, they must carry the
  hide flags too.
- Kola / Afghanistan / Channel projections; PDF export; FragOrders URL import;
  loft geometry.
