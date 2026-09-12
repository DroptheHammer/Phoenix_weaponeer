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

**Last session:** 2026-09-09 (Opus 5, user at the screen). **Four commits, all
eyeballed where it mattered, all pushed.** Gates moved **109 → 132 geo-checks**
and **46 → 48 Rust tests**; `npm run build` clean, `cargo build` zero warnings.
Plans at `~/.claude/plans/what-s-next-on-the-mighty-pumpkin.md` and
`~/.claude/plans/foamy-sauteeing-hejlsberg.md`.

| Commit | What |
|---|---|
| `763b905` | Threat rings stroke only what is inside the diagram box |
| `df4d4c9` | Reference DB v3 — 12 rows + the rule↔row invariant test |
| `7974d60` | Dead pop-up calculator chain removed (−380 lines) |
| `10b01c8` | Cleanup pass — editor defects, list selection, last dead commands |

### The red arc was REAL, and the diagnosis is worth keeping

Last session committed the outline-only threat rings unverified. The rings
themselves passed. But the red arc over the header was **in the exported PNG**,
not a screenshot artefact — and the method that found it is the reusable part:
read the PNG with PIL, filter for the ring colour, fit a circle to the pixels.
It came out **centre (238, 1192), radius 1009 px, residual 0.06 px** — a
perfect circle, so a stroked ring, centred **454 px below** a plan-view box
whose bottom is y=738 (the 1 nm scale bar measures `scale` px wide at
`box.y + box.h - 14`, which is how you recover the frame from a PNG).

**The clip was set and every save/restore balanced. The canvas stroked the
circle through it anyway.** Rather than work out which canvas builds honour a
clip for a path far larger than the surface, `visibleArcSpans` in
**`src/lib/arcClip.ts`** now computes the angular spans genuinely inside the
box and only those are stroked. A frame entirely inside a huge ring draws
nothing — correct, and what the bold red table row is for.

Found alongside it: the card built **six** threats, the table printed **four**,
and the plan view drew rings for **all six**. The escaping arc belonged to an
SA-11 that was never named on the card. Both now read `CARD_THREAT_ROWS`.

### Reference DB v3 — the drift was the real bug

Twelve rows (`SCHEMA_VERSION` 2 → 3). The mapping table already **named eight
systems with no database row** — Gepard, Roland, Hawk, Patriot, NASAMS, Rapier,
Strela-10, P-19 — which imported as Unknown and were dropped.
**`every_mapping_rule_resolves_to_a_database_row`** now makes that impossible.
Worse: `RPC_5N62V` (Square Pair — the set that actually shoots on an S-200
site) and `RLS_19J6` matched **neither a rule nor any pre-filter category** and
never reached the planner at all. Data policy and the whole-token-matching trap
are in memory: `project-threat-db-data-policy`.

### Two items the user CLOSED by decision this session — see memory

Attack #1's egress preferring attack #2's run-in, and fuze-dependent release
floors, are both settled — do not reopen either. Full context (including the
user's own words and the Mk-82/Mk-84 frag min-safe correction) is in memory:
`closed-decisions-do-not-reopen`.

### THE LESSON OF THE SESSION — script it, do not ask him to eyeball it

Already captured in memory (`feedback-script-it-dont-ask-him-to-eyeball`) and
reinforced again this session: handed a four-item on-screen checklist, the user
pushed back — two items were already covered by gates, the other two became
Rust tests (`a_stale_database_is_rebuilt_with_the_v3_threat_rows`,
`every_threat_unit_in_the_nttr_mission_resolves_to_a_row`) in minutes. Ask him
only for what genuinely cannot be scripted.

### Also shipped: the cleanup pass

- **The Ingress/Egress toggles silently discarded customization** — both called
  `resetToProfile()`. New pure helpers in **`src/lib/attackFlank.ts`** apply the
  change instead, re-deriving the heading through `describeRunIn`.
- **Selection is live.** `MapView`'s `selectedAttackId` had been wired to
  `AttackProfileOverlay`'s highlight all along with nothing passing it. Clicking
  a row in either list now selects and flies to it. Selection lives in
  `uiStore`, never `missionStore` — clicking a row must not dirty the mission —
  and attack/threat selection are mutually exclusive. Row-level Edit/Remove
  controls needed `stopPropagation` once rows became clickable.
- Legend moved bottom-left, out from under the side panel (`w-1/3`, right).

### Housekeeping

- `.claude/settings.json` gained an allow-list for read-only Bash (`grep`,
  `cat`, `head`, `tail`, `find`, `wc`, `git diff/status/log/show`) and **the
  `"model": "sonnet"` pin was removed** so the user's Opus default wins.
  `.claude/` is git-ignored, so this is local to the Mac only.

### START OF NEXT SESSION

1. **The queue is empty apart from the two banked features.** Everything else
   is done or closed by the user's decision.
2. **Live-geometry Customize** — half-planned already in
   `~/.claude/plans/foamy-sauteeing-hejlsberg.md`. Exploration established: the
   recompute is *already* live (`autoBuildAttack` re-runs per keystroke via a
   `useMemo`; `buildAttackPicture` and the geometry functions are pure and
   cheap enough per slider tick), `MapView` is fully prop-driven and a second
   `MapContainer` is safe. Design reference: `Other Items/offset-leg-geometry.html`.
   **Two questions must be answered before code:** where the map sits (the
   editor is a centred modal today) and whether knobs become sliders,
   slider+number pairs, or stay as number boxes — bounded by *never remove a
   knob*. **There are 35: 3 common, 12 dive, 9 level, 14 pop-up.**
   **Gotcha:** `MapView` reads `useUiStore`'s display filters directly
   (`:257-259`), so an embedded editor map would inherit whatever the main map
   is hiding. The editor must show the truth.
   **Second gotcha:** `MapController` re-fits on `fitKey` changes — a live
   editor's picture changes constantly, so fit once on open and hold.
3. Then **multi-aircraft coordinated strike**, which the retained `split_deg`
   on `RunInSummary` exists for. See memory: `project-live-geometry-customize`.

### Adjacent, noted but not done

- `render_kneeboard` and `export_to_dcs_kneeboard` in `commands/mod.rs` are
  unimplemented stubs returning errors. Not obviously dead — check callers
  before touching; the live export path is `save_kneeboard_png`.
- The Channel projection, and retiring the `verified: false` flags on Kola and
  Afghanistan — both need ground-truth DCS x/y ↔ lat/lon pairs. Sinai was
  cleared this way on 2026-09-11.
- PDF export; FragOrders URL import (blocked on API access); loft geometry;
  loadout from FragOrders pylons; aircraft kneeboard paths from the DB;
  verifying kneeboard export on Windows with DCS installed.
