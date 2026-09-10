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
- **The Channel has no projection**, and Sinai / Kola / Afghanistan are
  `verified: false`. All four need ground-truth DCS x/y ↔ lat/lon pairs off the
  F10 map; the arithmetic is already validated.
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

## Reference Materials

- FragOrders: https://fragorders.com
- pydcs (Python DCS library): https://github.com/pydcs/dcs
- Tauri docs: https://tauri.app/v2/guides/
- DCS kneeboard modding: Community wiki resources

---

## Session Pickup Notes

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

Twelve rows (`SCHEMA_VERSION` 2 → 3). But the rows were the easy part. The
mapping table already **named eight systems with no database row** — Gepard,
Roland, Hawk, Patriot, NASAMS, Rapier, Strela-10, P-19 — which imported as
Unknown and were dropped. Two tables that must agree had silently drifted.
**`every_mapping_rule_resolves_to_a_database_row`** now makes that impossible.

Worse: `RPC_5N62V` (Square Pair — the set that actually shoots on an S-200
site) and `RLS_19J6` matched **neither a rule nor any pre-filter category**, so
`is_threat_unit` returned false and they never reached the planner at all.

**Trap worth remembering: `contains_run` matches WHOLE TOKENS.** `5N62` can
never fire against `RPC_5N62V`, which tokenises to `rpc`/`5n62v`. It is
`5N62V`.

Data policy, the user's call: fill only the five fields anything reads (name,
NATO designation, type, max range, max altitude), put the source in `notes`,
and leave speculative columns **NULL rather than invented**.

### TWO ITEMS THE USER CLOSED BY DECISION — do not reopen

- **Attack #1's egress preferring attack #2's run-in: CLOSED.** *"the existing
  logic is fine, default to egressing away from the nearest threat (sam or
  artillery etc)."*
- **Fuze-dependent release floors: CLOSED.** *"I'd rather just assume the bomb
  detonates on impact."* The conservative frag min-safe per weapon is always
  the floor; `arming_delay_sec` is carried for the card but never changes a
  release altitude. **The tool will not plan a true low-angle LALD** the way
  the manual does. Recorded in `docs/DELIVERY_PLANNING.md` with a do-not-reopen
  note. That file also wrongly said the Mk-82 frag min-safe was 4,500 ft; the
  seed says **3,000** (4,500 is the Mk-84). Corrected.

### THE LESSON OF THE SESSION — script it, do not ask him to eyeball it

Handed a four-item on-screen checklist, the user pushed back: *"For 2-3-4 why
am I eyeballing this? cant you script it?"* He was right — two items were
already covered by gates written an hour earlier, and the other two became
Rust tests in minutes:

- `a_stale_database_is_rebuilt_with_the_v3_threat_rows` stands up a v2-shaped
  database and proves the new rows reach an existing install. That is what the
  "rebuilding as v3" console line only *claimed*.
- `every_threat_unit_in_the_nttr_mission_resolves_to_a_row` asserts all 27
  threat unit types the real mission carries, in DCS's exact spelling.

**Ask him only for what genuinely cannot be scripted** — does the picture read
well, does the feel work. Everything else is a test.

### Also shipped: the cleanup pass

- **The Ingress/Egress toggles silently discarded customization** — both called
  `resetToProfile()`. New pure helpers in **`src/lib/attackFlank.ts`** apply the
  change instead, re-deriving the heading through `describeRunIn`. `applyEgress`
  also clears a typed `egressHeading_deg`, because `resolveEgressHeading`
  prefers it and the toggle would otherwise be a no-op.
- The adjustments list described auto-build only; withdrawn while customized.
- Three "override" `useState` values had setters that were never called. Now
  constants, which is what they always were.
- **Selection is live.** `MapView`'s `selectedAttackId` had been wired to
  `AttackProfileOverlay`'s highlight all along with nothing passing it. Clicking
  a row in either list now selects and flies to it. Selection lives in
  `uiStore`, never `missionStore` — clicking a row must not dirty the mission —
  and attack/threat selection are mutually exclusive.
- Knock-on the plan missed: **once a row is clickable, its own Edit/Remove/
  status controls need `stopPropagation`**, or clicking Remove also selects and
  flies to the thing being deleted.
- Legend moved bottom-left, out from under the side panel (`w-1/3`, right).

### Break-testing found a bad TEST, not bad code

Per the standing rule, all ten new checks were proven to fail first. One failed
for a real reason: a 25° check turn at 5.5 nm wants 2.3 nm abeam, but a 37°
dive from 9,200 ft rolls in at ~2.0 nm — the geometry never closed, so
`describeRunIn` returned nothing. **The fixture was wrong, not the code.** The
assertion is now stronger: the two flanks must be **mirror images about the
direct bearing** (left −30°, right +30°).

### Housekeeping

- `.claude/settings.json` gained an allow-list for read-only Bash (`grep`,
  `cat`, `head`, `tail`, `find`, `wc`, `git diff/status/log/show`) and **the
  `"model": "sonnet"` pin was removed** so the user's Opus default wins.
  `.claude/` is git-ignored, so this is local to the Mac only.
- **Never use `/tmp`** — `permissions.blockReadsOutsideWorkingDirectories`
  prompts on every access and an allow-rule does not override it. `Other Items/`
  is git-ignored and already a working directory; better still, hold a file's
  contents in a shell variable and restore in the same command.

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
   on `RunInSummary` exists for.

### Adjacent, noted but not done

- `render_kneeboard` and `export_to_dcs_kneeboard` in `commands/mod.rs` are
  unimplemented stubs returning errors. Not obviously dead — check callers
  before touching; the live export path is `save_kneeboard_png`.
- The Channel projection, and retiring the `verified: false` flags on Sinai,
  Kola and Afghanistan — both need ground-truth DCS x/y ↔ lat/lon pairs.
- PDF export; FragOrders URL import (blocked on API access); loft geometry;
  loadout from FragOrders pylons; aircraft kneeboard paths from the DB;
  verifying kneeboard export on Windows with DCS installed.

---

**Previous session:** 2026-09-08 → 09 (Opus 5, user at the screen). **The map
display filter is BUILT, eyeballed on all eight checks, committed and pushed**
(`62204f5`). Gates: `npm run build` clean, **109 geo-checks** (was 99), **46
Rust tests**. Plan at `~/.claude/plans/what-s-next-on-our-floofy-stardust.md`.

### The sonnet alias is FIXED — last session's fresh-shell fix worked

All three subagents this session reported **`claude-sonnet-5`** as the first
line of their report. The `~/.zshrc` change (both `ANTHROPIC_DEFAULT_*_MODEL`
exports commented out, backup `~/.zshrc.bak-20260908`) took effect once Claude
Code was restarted from a fresh shell. **Keep requiring the model ID as the
first line of every subagent report** — it costs nothing and it is the only
cheap proof. The user asked again this session that subagents run on sonnet;
pass `model: "sonnet"` explicitly, do not rely on the default.

### What shipped — the map display filter

The bottom-right map legend now doubles as the filter. A checkbox per row, plus
an **Attacks** section listing each flight (`Viper 1`) with its members
indented beneath (`Viper 1-1 · 2 attacks`). Threats split Mission/Planning;
Route toggles steerpoints and the route line. Panel collapses; a **Show all**
link shows only while something is hidden.

**The load-bearing design decision: filter at the five DRAW sites inside
`MapView`, NOT at the `App.tsx` prop boundary.** `MapController` re-fits the
camera whenever its `fitKey` (every waypoint/threat lat-lon, joined) changes,
so handing it filtered arrays makes **hiding the route yank the zoom**. Both
`MapController` and `FocusController` keep the full arrays, as do the attack
overlay's IP/target waypoint lookups — otherwise hiding the route would erase
every attack. This was caught in exploration, before any code was written.

State is a new **`src/stores/uiStore.ts`**, deliberately not `missionStore`
(which serialises to disk and drives `isDirty`) — a view control must never
mark the mission dirty. It stores what is **HIDDEN, not what is visible**, so
anything newly added is visible by default; the inverse would make a new attack
invisible until explicitly added.

Nothing hides silently: the Attacks rail button reads `Attacks (4 · 1 hidden)`,
list rows carry a dimmed "hidden on map" tag, and `setFocusAttackId` un-hides
an attack's pilot on save. **The kneeboard card is deliberately unfiltered** —
the card is what gets flown.

New: `flightGroupOf` in `src/lib/callsign.ts` (`'Viper 1-1' → 'Viper 1'`).
There is no flight entity in the data model; the group is implicit in the
callsign string. The banked multi-ship strike feature will want this too.

### Reviewing the subagent caught two things — FOURTH session running

Gates were green and the report was clean. Still:

1. **The flight tri-state box toggled the wrong way.** With a flight
   half-hidden, clicking it hid *the rest*. Clicking a partly-filled box should
   give back what is missing, not take away what is left. Now `anyHidden ?
   show all : hide all`.
2. **The threat filter had no check at all** — three of the four user-requested
   scopes covered, threats not. Added, plus two pinning the tri-state.

All three added checks were **proven to fail** first. Break 2 is the good one:
reverting `toggleFlight` to the subagent's original `allHidden` logic fails
exactly the new check. **Keep doing this** — it is the fourth session running
it has found something.

### The subagent was RIGHT to push back on the spec

The plan told it to prove the `flightGroupOf` check by "dropping the anchor".
It refused, correctly: `.match()` without `/g` always tries position 0 first,
so removing `^` is a no-op for every realistic input and that break could never
fail. It broke the `\s\d+` grouping constraint instead and added
`flightGroupOf('Renegade-2') === 'Renegade-2'`, which only that constraint
protects. **A subagent disputing a break-test on those grounds is doing the job
right.**

### Then the card: threat rings are OUTLINE ONLY now (`2d7535d`) — NOT EYEBALLED

Eyeball item 8 (export a card for a hidden pilot) passed, but the comparison
exposed a **pre-existing** bug. On the CBU-97 laydown on STPT 9 all four SAMs
reach the target, and the filled rings washed the entire plan view pink with
the attack invisible underneath; on the Mk-84 dive on STPT 8 every ring is
outside its max range so nothing draws at all.

The user chose **outline only, no fill**. The ring edge is the part a pilot can
fly to — it says where the run-in crosses in. Dropping the fill also fixes the
worst case for free: a ring big enough to swallow the frame (the SA-10's 47 nm
against a 1 nm picture) now draws nothing instead of tinting everything, and
the THREATS IN AREA table already reports being inside it in bold red.

**The live map keeps its filled rings on purpose** — there the fill is how
coverage reads while planning and you can pan away from it. The card is the one
flown at kneeboard size.

**This has NO automated gate.** The canvas renderer is not reachable from
`geo-check`. It is committed unverified — eyeball it first thing.

### UNRESOLVED — a red arc over the card header

In the user's screenshot of the STPT 9 card a red arc crosses the **header**,
above the plan view, and the whole card looks pink-cast. **I could not account
for it and did not fix it.** The plan view is clipped to its own box
(`renderKneeboardCanvas.ts:292-295`), nothing draws above it, and the preview
canvas has no transparency. Three candidates, undistinguished:

1. The screenshot is the **on-screen preview** with the map showing through — a
   panel-styling bug, not a card bug.
2. The exported PNG really has it, and the clip reading is wrong somewhere.
3. A screenshot artefact.

The outline change may have made it moot if it was a ring. **Ask the user to
export that card into `Other Items/` and read the actual PNG** — that separates
all three in one step. Do not guess at a fix without it.

Note the red *text* in the threat table is NOT a bug: all four threats there
are inside their max range, so they print bold dark red by design. On STPT 8
all four are outside and print black.

### START OF NEXT SESSION

1. **Eyeball the outline-only threat rings** — export the STPT 9 CBU-97 card
   and the STPT 8 Mk-84 card. Committed but unverified, and ungateable.
2. **Get the exported PNG for the red-arc mystery above** before touching it.
3. The queue, in the user's order: Reference DB v3 (rebuild fresh, bumps
   `PRAGMA user_version` to 3); attack #1's egress preferring attack #2's
   run-in; fuze-dependent release floors; dead-code removal.
   **Dead code is confirmed dead and is a clean chain** — nothing imports
   `src/hooks/useAttackCalculator.ts`, which is the only caller of the
   `calculate_popup_ccip` Tauri command → `calculators::calculate_popup_ccip`
   → its 3 Rust tests. Removing the hook lets the whole chain go. Also the
   unused `once_cell` in Cargo.toml.
4. The two banked features **after a clean/compact** — live-geometry Customize
   (sliders + map redrawing as you drag, like
   `Other Items/offset-leg-geometry.html`) and multi-aircraft coordinated
   strike, built together.

### Adjacent, noted but not done

- `MapView` declares `selectedAttackId` (`:30`) wired all the way to
  `AttackProfileOverlay`'s highlight styling, but `App.tsx` never passes it.
  **Dead plumbing that is the ready-made hook** for the queued "select a threat
  or attack in the list → highlight it and fly to it" idea.
- The legend sits bottom-right, so an open side panel covers it. The user was
  shown this and did not ask for a change; moving it bottom-left is a one-line
  fix if it grates.

---

**Previous session:** 2026-09-08 (late, Opus 5, user at the screen). **The level
offset leg is BUILT, eyeballed on all eight checks, committed and pushed**
(`9d30046`). Gates: `npm run build` clean, **99 geo-checks** (was 81), **46
Rust tests**. Plan at `~/.claude/plans/ok-let-s-plan-for-wise-lantern.md`.

### READ THIS FIRST — the `sonnet` alias was silently Sonnet 4.5

The subagent loop broke this session and it was not the agent's fault.
`~/.zshrc` exported `ANTHROPIC_DEFAULT_OPUS_MODEL` and
`ANTHROPIC_DEFAULT_SONNET_MODEL` (added for "opusplan"), pinning both
unversioned aliases to 4.5-era builds. The Agent tool accepts **only**
unversioned aliases, so `model: "sonnet"` — exactly what these notes told
the agent to pass — resolved to `claude-sonnet-4-5-20250929`. `/model opus`
would have done the same.

**Both lines are now commented out** (backup `~/.zshrc.bak-20260908`), so the
aliases resolve to current. **It only takes effect in a Claude Code started
from a fresh shell** — if this session is a continuation, subagents are still
on the old build. The user's rule, in his words: *"we plan on opus (whatever
the latest version is at the time, I don't want us tied to some old default,
if I say /model opus I mean it). And we execute with sub agents on /model
sonnet where the sonnet needs to always be the latest version."*

**Cheap proof, use it every time:** grep the agent's own transcript —
`grep -o '"model":"[^"]*"' <task output file> | sort -u`. Do not read that
file whole; it will blow up context. Also require the agent to state its model
ID as the first line of its report.

Because of this the Sonnet agent was killed part-way and **Opus finished the
build directly**. That satisfies the rule (Opus 5 or Sonnet 5), and is the
fallback whenever the alias cannot be trusted.

### What shipped — the level offset leg

Auto-build took the action point range as input and let the leg fall out of
the trigonometry, so a high JDAM's time-of-fall ate it. Measured before the
change on the real NTTR case: **leg 2.04 nm (0.29 × J), axis 5.6° off, an 11°
azimuth split** — a pair inside one fire-control cone.

**Inverted:** the leg is specified as a multiple of the run-in (join) range
and the action point falls out of it.

```
sin φ = ratio · sin θ        AO = θ + φ        R = J · sin(AO) / sin θ
```

`J` cancels out of `sin φ`, so the split depends only on the ratio and the
check turn — which is why the multiple is the right knob, and why the leg
rescales itself when release altitude changes. Defaults **1.5 ×, 30° check
turn** → leg 10.7 nm, axis 48.6° off, 97° split, angle-off 78.6°.

**The 30° check turn is load-bearing, not cosmetic** — at 20° the 1.5 × leg
wants a 16.1 nm action point, which does not fit the 15.3 nm STPT 7→8 leg.

**Correction to the previous notes: the hard limit is NOT 2 ×.** The leg goes
tangent to the run-in ring at **cot θ (1.732 × at 30°)**, where angle-off is
exactly 90°. Past that it dips inside the ring and turns back outward — the
BEM's "indirect" attack — and the old `asin(abeam / J)` returns the wrong
root. 2 × is only where `sin φ` saturates; it is past tangency and not a
flyable leg. Auto-build caps itself at cot θ; Customize reaches 1.95 × with
warnings, which is why the leg length is **threaded through**
`joinPointOnLeg` via `ActionPointInput.legLength_nm` rather than re-solved.

### Decisions the user made this session

- **Customize keeps both knobs, linked** (his call, against the tidier
  single-knob option, to honour "never remove a knob"). Typing the **leg**
  makes it authoritative and it rescales with altitude; typing the **action
  point** clears the ratio and pins the miles.
- **Auto-build caps at 90° angle-off; Customize can push past with warnings.**
  Warn, do not block.
- **The 2-ship split is NOT printed anywhere.** It was built, he saw it, and
  had it removed: *"the 2 ship split would be obvious when eyeballed… they
  will be confused if plotting a solo attack."* The hint now reads only
  `Leg 10.7 nm (91 s) · axis 49° off the line`. **`split_deg` is still
  computed and carried on `RunInSummary`** — keep it, the banked multi-ship
  feature wants it.

### Also fixed, found while reviewing (not in the spec)

- **Stale action point.** The stored `actionRange_nm` goes stale the moment
  release altitude is edited, so a fresh leg plus a stale action point drew a
  picture that did not close. `actionOf`, the ACTION marker label and the
  card's side view all derive it live now.
- The Action point input never cleared the ratio — half of "linked" missing.
- The non-closing fallback was convoluted; capping at `cot θ` up front
  subsumes it, since `cot θ < 1/sin θ` always.

**Known approximation:** the run-in start lands ~55 m inside J, because the
triangle is solved with flat trig then plotted on a sphere. 0.4% of the
run-in range, below the precision of the release model (already "schematic").
The geo-checks use a 0.1 nm tolerance rather than pretending it is exact.

### The gates were proven able to fail

Per the standing rule. Ignoring the threaded leg length breaks 2 checks;
reverting to the old action-point-driven behaviour breaks 7, the headline one
reading `2.1 nm = 0.3 x J` — the exact pre-change baseline. **Keep doing
this**; it is the third session running that it caught something.

### START OF NEXT SESSION

1. **Restart from a fresh shell** so the model aliases are current, and spot
   check a subagent's model ID before trusting it with real work.
2. The queue, in the user's order: map display filter; Reference DB v3
   (rebuild fresh, bumps `PRAGMA user_version` to 3); attack #1's egress
   preferring attack #2's run-in; fuze-dependent release floors; dead-code
   removal (`src/hooks/useAttackCalculator.ts`, Rust `calculate_popup_ccip`,
   unused `once_cell`).
3. The two banked features **after a clean/compact** — live-geometry Customize
   (sliders + map redrawing as you drag, like
   `Other Items/offset-leg-geometry.html`) and multi-aircraft coordinated
   strike. They want building together; splitting a formation across a SAM's
   cone is a formation-level decision, and that is where the retained
   `split_deg` earns its keep.

---

**Previous session:** 2026-09-08 (evening, Opus 5, user at the screen). Same loop
as the afternoon — **Opus specs, a Sonnet subagent builds, the user eyeballs,
Opus commits only after a pass.** Plan still at
`~/.claude/plans/so-let-s-plan-how-parsed-waffle.md`.

**Everything below is committed and pushed** (`15218c9`). Gates: `npm run build`
clean, **81 geometry checks** (was 72), **46 Rust tests**.

### The afternoon's six changes are now ALL eyeballed

Items 2-6 from the previous checklist passed: IP tag reads AGL on dive and MSL
on level; it pins to the frame edge correctly on diagonals; it moves to the real
IP when you zoom out to it; it prints on the exported card. One real defect
found and fixed, plus one wording call:

1. **Labels crowded again at extreme zoom-out** — at mission scale the whole
   attack picture shrinks to a clump a few pixels across, so every callout
   wanted the same spot. **Fixed:** below a legibility threshold each attack now
   draws **one tag naming it** ("Viper 1-1 · TGT1", on the target) instead of its
   callouts, egress tags and IP tag. Per attack, measured on `pictureFitPoints`,
   so a large attack keeps full detail while a distant one collapses.
   `labelsAreLegible` / `pixelSpan` / `LEGIBLE_SPAN_PX` in `labelLayout.ts`.
2. **The "Action point set to 9 nm — needs room to roll out…" adjustment is
   gone.** The user's call, and it was provably redundant: the hint under the
   Ingress toggle (`AttackEditor.tsx:215`) already prints both the action range
   and the join range. Every other adjustment was kept — they report an override
   you cannot otherwise see.

### The level offset-leg design is SETTLED — build it next

This was the queued design conversation and it is done. **The user chose an
offset leg of 1.5 × the run-in (join) range, check turn staying 30°.**

The insight that unlocked it: the number that matters is **not** lateral
displacement, it is the **azimuth split between two attackers as the defending
SAM sees it**. A fire-control radar has roughly a 30-40° cone, so a 2-ship must
arrive far enough apart that the defender is forced to choose one. Today's
geometry gives a **12° split** — both jets inside one cone. The user's second
reason: the higher the release, the earlier you want off the direct line,
because time nose-on to the SAM is what gives it its best kinematic range.

The cause: the solver takes the **action point range** as input and lets the leg
fall out of the trigonometry, so a high JDAM's time-of-fall eats the whole leg.
**Invert it** — specify the leg, derive the action point:

```
sin φ = L·sin θ / J          φ = axis displacement, J = join range, θ = check turn
R     = J·sin(θ + φ) / sin θ                    R = action point range
split = 2φ         angle-off = θ + φ            (BEM: >90° = "indirect")
```

Express the leg as a **multiple of J**, not fixed miles — it then scales itself
and "higher = turn earlier" falls out for free. **Hard limit: leg = 2 × J puts
you abeam, pair nose-to-nose over the target** — deconfliction problem, not a
tactic. On the real NTTR STPT 7→8 leg (15.3 nm) the 1.5× action point at 13.9 nm
only just fits, landing almost on the IP; a tighter route must pull it in and
say so plainly.

The BEM has no level-delivery or azimuth-split standard — checked. This is an
invented tactic anchored on the manual's own angle-off ladder (2 × climb angle =
40/60/80°, in `docs/DELIVERY_PLANNING.md`).

**`Other Items/offset-leg-geometry.html`** is the scratch page this was settled
on — real NTTR waypoints, the app's own proj4 string, live sliders. Git-ignored.
**Do not delete it**; it is now the reference for the feature below.

### TWO MAJOR FEATURES BANKED (user: not this session)

1. **Rebuild Customize as live map + sliders**, exactly like that scratch page —
   geometry redrawing as you drag, readouts and warnings underneath. User: *"Why
   doesn't our customize menu look like this and update in real time like this?
   It's way easier than the current customize menu."*
2. **Multi-aircraft coordinated strike setup** — 1-4 aircraft planned against a
   joint strike, adjusted **as a group or per aircraft**, watch it line up before
   publishing.

These two want building together: splitting a formation across a SAM's cone is
inherently a formation-level decision. Likely M2, after a clean/compact.

### Subagent lesson — THIRD session running

The subagent's new geo-check could not fail. Its hand-made profile had no
`aircraftId`/`geometry`/`weaponClasses` and its weapon no `category`, so
`autoBuildAttack` bailed at its early return and never reached the geometry;
the check passed whether the message existed or not. Rewritten against the
**real `f16c.level.ccrp.jdam` profile** from `src-tauri/resources/profiles/`, a
real-shaped GBU-31 row and the actual 15.3 nm leg, and it now asserts
`actionRange` comes out **9 nm** — proof the branch ran. Verified to FAIL with
the message restored.

**Standing rule: a new test must be shown to fail against a broken
implementation before it is believed.** And **user requirement: subagents doing
key work run on Sonnet 5 or Opus 5, never Sonnet 4.5** — the Agent tool exposes
only unversioned aliases, so pass `model` explicitly and have the agent report
its own model ID.

### START OF NEXT SESSION

1. **Build the level offset leg** to the settled design above — the maths, the
   limit, and the "route too short" message. `autoBuildAttack.ts` /
   `attackGeometry.ts`.
2. Then the remaining queue: map display filter, Reference DB v3 (rebuild
   fresh, bumps `PRAGMA user_version` to 3), attack #1's egress preferring
   attack #2's run-in, fuze-dependent release floors, dead-code removal.
3. The two banked features above, after a clean/compact.

---

**Previous session:** 2026-09-08 (afternoon, Opus 5, user at the screen). New way
of working this session, and it should continue: **Opus writes a spec, a Sonnet
subagent implements it, the user eyeballs it in the running app, Opus commits
only after the user passes it.** The plan lives at
`~/.claude/plans/so-let-s-plan-how-parsed-waffle.md`. Two things about that
loop the user assumed otherwise: there is **no Sonnet chat window** (subagents
are headless; all conversation stays in the main window, Opus relays the
checklist), and **a subagent cannot be the eyeball** (it can't see the GUI —
its job ends at green gates plus a written checklist).

**Everything below is committed and pushed.** Gates all green at commit time:
`npm run build` clean, **72 geometry checks** (was 55), **46 Rust tests**.

### What was built — SIX changes, only the first is user-verified

1. **Map reframe-on-save — FIXED and confirmed on screen by the user.** The
   root cause in the old notes was WRONG (it blamed the React effect not
   re-firing on the same attack id; `onFocused()` clears `focusAttackId` to
   null after each fit, so that never happens). The real cause: the card's
   `drawPlanView` deliberately excludes `route`-style lines from its fit —
   "fit the attack, not the transit" — while the map's `FocusController` fitted
   **every** picture point including the route line back to the IP. With an IP
   12 nm out the map framed 12 nm instead of 4.5. Fixed by extracting the
   card's rule into **`pictureFitPoints()` in `src/lib/attackPicture.ts`**, now
   used by both. Same precedent as `labelLayout.ts` last session.
2. **The Attacks side panel now closes itself after Save/Update** (not Cancel).
   The user's own idea, after his screenshots proved the reframe was already
   correct and the panel was simply covering the right third of it. Wired with
   an explicit `onSaved` prop (App → AttackList → AttackEditor) — deliberately
   NOT an effect on `focusAttackId`, whose clear/set ordering is fragile.
3. **Labels whose point is off-screen are no longer drawn** — they used to be
   clamped to the frame edge and rendered clipped mid-word.
4. **Leader lines stop at the marker's edge, not its centre** — a line to the
   centre struck through the letters on the disc. Shared `leaderLine()` in
   `labelLayout.ts`; the kneeboard card had the identical bug.
5. **Label collision fix for multiple attacks.** The near-field search (4 sides
   x 6 gaps x 5 shifts) was fully blocked when two attacks cluster, so it gave
   up and overlapped. Widened the ladder and added a full-frame sweep for the
   nearest clear spot, reached by a leader line.
6. **The IP tag now exists on dive and level attacks, not just pop-up** — the
   user's point: every attack starts from an initial point, and that's where
   the pilot opens the kneeboard and starts flying. Dive prints its ingress
   altitude **AGL**, level prints its release altitude **MSL**. Only emitted
   when a real IP waypoint exists. Because the IP is now almost always outside
   the frame, its tag is **pinned to the frame edge the run-in enters through**
   (`edgeCrossing()` in `labelLayout.ts`), on the map AND the card.

### START OF NEXT SESSION — the eyeball checklist (items 2-6 are UNVERIFIED)

Run `npm run tauri dev`, import `test-data/nttr_redflag_viper1.json`, group
Viper 1 (Hot). Items 1-8 of the last checklist passed already (panel closes on
save, stays open on cancel, Customize re-save reframes, second attack on TGT2,
GBU-31 level, pan-away-and-save, map/card framing agree). Still to check:

1. Three or four attacks plotted at once: **no label box on top of another.**
2. A single attack alone: labels stay **snug** beside their markers, nothing
   flung to the edge unnecessarily. (This is what the sweep-guard fix protects.)
3. Dive attack shows an IP tag reading "...ft AGL"; level shows "...ft MSL".
4. The IP tag sits against the frame edge where the dashed run-in enters, fully
   readable. **Try run-ins from several different directions** — the first
   implementation of this was broken on every diagonal.
5. Zoom out until the IP steerpoint is on screen — the tag moves to the real IP.
6. **Export a kneeboard card for a dive and a level attack — the IP tag must be
   on the card.** That's the one that gets flown.
7. Still pinned from earlier: does the level CCRP adjustment message read
   sensibly on its own? "Action point set to 9 nm — needs room to roll out of
   the check turn before the run-in starts 7.1 nm from the target."

### Lessons about driving the Sonnet subagent (this cost real time — read it)

**Review the subagent's work; do not trust its "all gates green" report.** Four
separate defects got through green gates this session:
- It hand-rolled great-circle math in `geo-check.ts` — CLAUDE.md explicitly
  forbids a fifth copy. Replaced with `calculateDestination`.
- It dropped the `label.leader` gate on the card's leader line, which would
  have drawn a stray 2-6px stub alongside the pointer nub.
- Its full-frame sweep guard read `best.score > 0`, but score always includes
  `gap * 2` (min 36), so the sweep would have run for **every** label on the
  normal path and scattered snug labels. Now guarded by a `clear` boolean.
  While fixing it, found a **pre-existing** bug its widening made far worse: a
  zero-overlap candidate found far out could lose on score to an overlapping
  one close in, and `break outer` then locked in the overlap. A clear spot now
  wins unconditionally.
- **`edgeCrossing` was broken in ~78% of geometries** — 3,139 of 4,006
  fuzz-tested cases returned `undefined` and 703 more returned the wrong point.
  Its own test passed because it only tested a run-in from due west. Rewritten
  as Liang-Barsky, verified against a brute-force reference (0 mismatches over
  4,006 cases), and the weak test replaced with eight directional ones.

**The generalisable lesson: check that a new test would actually FAIL against a
broken implementation.** Two of the four defects above shipped green precisely
because the test only exercised the easy case.

### Open items (unchanged from this morning, still queued in this order)

- **Level attack run-in is too short/predictable** — AP to run-in-start barely
  ~2 nm on a 20k CCRP JDAM. Needs a longer offset leg flown *after* the check
  turn, not just a further-out action point. Design pass on
  `autoBuildAttack.ts` / `attackGeometry.ts`; the user will want to talk this
  one through before code.
- **Map needs a multi-select display filter** for which flights/attacks are
  drawn. User deferred as complex; likely M2.
- **Reference DB v3** — SA-5 site, SA-13s, ZU-23 trucks and a P-19 EWR row.
  **User decided to REBUILD this fresh**, not recover the rolled-back Traycer
  commit `580e40c`. Bumps `PRAGMA user_version` to 3.
- Attack #1's egress should prefer a break toward attack #2's run-in.
- Fuze-dependent release floors (Mk-82 at 2,000 ft only with a 4 s delay fuze).
- Loadout from FragOrders pylons (plan §3); loft geometry (LABS, F-16 loft).
- Dead code: `src/hooks/useAttackCalculator.ts`, the Rust
  `calculate_popup_ccip`, and the unused `once_cell` in Cargo.toml.
- M2 (map-first rail, threat palette, drag handles, exposure colouring), and
  the queued idea: selecting a threat in the list highlights and flies to it.

---


**Previous session:** 2026-09-08 (with the user at the screen, on Claude Sonnet
5/Haiku 4.5 rather than Opus — sessions were kept shorter on purpose). Written
for a fresh agent of any model. Read `docs/REVAMP_PLAN.md` (the approved plan
and its dated updates) and `docs/DELIVERY_PLANNING.md` (the F-16 handbook
method the pop-up is built on) before touching attack geometry.

**Everything below is committed and pushed.** Gates: `npm run build` clean,
**46 Rust tests**, **55 geometry checks** — unchanged counts from last
session; nothing today touched geometry math or the Rust side.

**How to run:** `npm run tauri dev`. Closing the app window kills the whole
dev process; relaunch it. Import `test-data/nttr_redflag_viper1.json`, group
Viper 1 (Hot).

### What happened today

1. **Checked whether a rolled-back Traycer session (last night, Opus 4.5) did
   any damage. It didn't.** Git forensics (reflog on `main` and on
   `origin/main`): the Traycer session made two commits after the last
   Claude-Code commit (`580e40c` DB v3 threat rows, `8b49732` straight-in
   action-point option), both **local only** — `origin/main`'s reflog shows
   no push after `a0bb57d`, so GitHub was never touched. The user's own
   `git reset` back to `a0bb57d` left the working tree byte-identical to that
   commit. The two Traycer commits still exist as unreachable objects (not
   yet garbage-collected) — recoverable by hash if their content is ever
   wanted; `580e40c`'s DB v3 work in particular matches a still-open item
   below. Nothing was cherry-picked; this was inspection only.
2. **Last session's work (action-point run-in, handbook pop-up, picture
   kneeboard) was eyeballed in the running app for the first time**, via the
   checklist this file already had queued. Dive card v2, chained attacks, and
   the pop-up 20° chip (map + card) all passed clean. Customize controls
   work. Level CCRP 20k surfaced real problems (next point).
3. **Three bugs found during that pass were fixed and gated the same
   session:**
   - The dev-note-sounding adjustment message — `"Action point moved out
     4.5 → 9 nm: ..."` required knowing an internal default to parse. Reworded
     in `src/lib/autoBuildAttack.ts` to `"Action point set to 9 nm — needs
     room to roll out of the check turn before the run-in starts 7.1 nm from
     the target"` — self-contained.
   - **Label collisions on the live map.** The map overlay placed every
     marker's tooltip at a *fixed* pixel offset with no collision awareness —
     unlike the kneeboard card, which already had a proper greedy
     layout-with-leader-lines algorithm (`layoutLabels`, previously private to
     `renderKneeboardCanvas.ts`). Extracted that algorithm into a new shared
     `src/lib/labelLayout.ts`; built `src/components/map/AttackLabelLayer.tsx`
     to project every visible attack's markers into map pixels and run the
     same layout, recomputed live on pan/zoom; `MapView.tsx` renders the
     result as one collision-aware overlay (boxes + SVG leader lines).
     `AttackProfileOverlay.tsx` no longer renders its own per-marker
     `Tooltip`/`divIcon` labels — markers (the colored circles) only.
   - Map not reframing after an attack edit — added `focusAttackId` to
     `missionStore`, set by the attack editor's Save; a new `FocusController`
     in `MapView.tsx` fits the map to the saved attack's full picture once,
     then clears it. **This fix turned out to be incomplete — see the bug
     found on re-test, next.**
4. **Re-testing those fixes surfaced a new bug: the map reframe is
   inconsistent, not fixed.** On at least one edit-and-Save the map was left
   at a wide, mission-scale zoom (threat rings filling the screen, the attack
   a speck) instead of the tight AP-to-egress frame seen on other saves — the
   kneeboard card's plan view frames reliably every time; the live map does
   not yet. **Explicitly logged rather than root-caused live** — the user
   asked for this as a tracked feature item, not an in-session fix. Full
   write-up with a likely-but-unverified cause is in Open Items below —
   **that's where to start next session.**
5. **Two feature requests were explicitly deferred by the user** (not bugs —
   "put a pin in this" / "save this for another time") and logged in Open
   Items: the level-attack run-in is too short/predictable and needs a longer
   offset leg after the check turn; the map needs a multi-select filter for
   which flights/attacks are drawn once several are plotted at once.
6. Label-collision quality, multi-attack label collisions, and the reworded
   adjustment message all **looked fine in this session's testing but are
   pinned for a clean re-check** once the reframe bug is fixed — the user
   found it hard to judge them while the map was jumping around.

### START OF NEXT SESSION

1. **Fix the map reframe-on-save bug first** — see the Open Items entry for
   the suspected (unverified) cause and the reliability bar to match
   (`renderKneeboardCanvas.ts`'s `drawPlanView`, which frames every time).
2. Re-verify, now that the map should hold still: label collisions
   (single-attack and multi-attack), and the "Action point set to…" wording.
3. Then resume the still-open queue from before: level-attack run-in length,
   the map display filter, Reference DB v3, fuze-dependent release floors.

### Open items (not started)

- **Map reframe-on-save is inconsistent** (flagged 2026-09-08 — "let's log
  this as a feature update," not a live fix). `FocusController` in
  `MapView.tsx` (added this session) is supposed to fit the map to the
  just-saved attack every time, the way the kneeboard card's plan view
  reliably frames AP…TGT — but on at least one edit-and-Update it left the
  map at a wide, mission-scale zoom instead (SA-5 rings filling the screen,
  the attack a speck near the bottom), rather than the tight AP-to-egress
  frame seen on other saves. Happens on both a brand-new attack and an
  update to an existing one (customize or default-profile change) — not
  isolated to one path. Likely cause worth checking first: `focusAttackId`
  going from one attack's id straight to the *same* id again (edit-save the
  same attack twice) is not a change React's effect-dependency check sees,
  so the effect may silently no-op — but this needs real investigation, not
  a guess-fix. **The kneeboard's plan-view framing (`renderKneeboardCanvas.ts`
  `drawPlanView`, fit-to-picture-points) is the reliability bar to match.**
  Re-verify once fixed: the label-collision layer and multi-attack labels
  (both looked fine in isolation but were hard to judge with the map jumping
  around), and the reworded "Action point set to…" adjustment message —
  all three are pinned for re-check after this lands, not separately broken.
- **Level attack run-in is too short/predictable** (flagged 2026-09-08, user
  explicitly deferred — "put a pin in this"). Eyeballing a level CCRP JDAM
  from 20k showed AP-to-run-in-start barely ~2 nm apart even after the
  auto-adjust — an easy pattern to read from the target's perspective. The
  missing piece: extend the time flown *after* the AP check turn (a longer
  offset leg before the run-in join), not just push the action point out.
  Needs its own design pass on the level-profile geometry in
  `autoBuildAttack.ts`/`attackGeometry.ts` — not a quick tweak.
- **Map needs a multi-select display filter** (flagged 2026-09-08, user
  explicitly deferred as complex — "save this for another time"). With
  several aircraft's attacks plotted at once the map gets cluttered; want to
  choose which flights/attacks are drawn. Likely M2 territory (rail +
  filter), not a standalone fix.
- Attack #1's egress should prefer a break toward attack #2's run-in when a
  follow-on attack exists (user hinted; today egress is only threat-aware).
- Fuze-dependent release floors (the handbook releases Mk-82 at 2,000 ft only
  with a 4 s delay fuze; the tool has one frag min-safe per weapon).
- Reference DB v3: the NTTR mission carries an **SA-5 site**, SA-13s and
  ZU-23 trucks the tool cannot show (no rows); add rows + a P-19 EWR row.
  (Note: a rolled-back Traycer commit, `580e40c`, already did this work —
  still recoverable by hash if it's worth reviewing rather than redoing.)
- Loadout from FragOrders pylons (plan §3); loft geometry (LABS, F-16 loft).
- Dead code: `src/hooks/useAttackCalculator.ts` and the Rust
  `calculate_popup_ccip` calculator (old pop-up model); `once_cell` in
  Cargo.toml is unused.
- M2 (map-first rail, threat palette, drag handles, exposure colouring) — and
  the queued idea: selecting a threat in the list highlights and flies to it.

---

**Previous session:** 2026-09-07 (all day, with the user at the screen).

**Everything below is committed and pushed.** Gates: `npm run build` clean,
**46 Rust tests** (`cd src-tauri && cargo test`), and **55 geometry checks**
(`npm run geo-check` — a plain esbuild+node script, no test framework; it
reproduces the handbook's worked example and the action-point geometry).

**How to run:** `npm run tauri dev`. Closing the app window kills the whole
dev process (Vite + cargo watcher); relaunch it. Import
`test-data/nttr_redflag_viper1.json`, group Viper 1 (Hot). Any edit under
`src-tauri/` (including `resources/profiles/*.json`, which are compiled in)
rebuilds and restarts the app and wipes the imported mission.

### What was built today

1. **Import fixes** (`src-tauri/src/parsers/threat_mapping.rs`, `commands/mod.rs`):
   DCS unit names are matched on whole tokens, most-specific rule wins (a
   Tor 9A331 was importing as an SA-8 because "9A33" is a substring). Threat
   dedup is per system per site (a Tor with a ZSU-57-2 and Iglas inside 150 m
   used to collapse to one). The P-19 search radar no longer claims a site as
   SA-3, so the two SA-2 sites read S-75. **Seen on screen by the user** (13
   threats, Tor card).
2. **Run-in anchored on the route — the action point.** Every visual attack
   flies the previous-steerpoint→target leg to the **action point** (4.5 nm,
   the handbook's number), makes a round **check turn** left/right (the
   *Ingress* toggle picks the flank, default away from the nearest threat),
   runs up the offset leg, and joins the attack: **roll-in** (dive),
   **pull-down point / PDP** (pop-up), run-in start (level). The attack
   heading is whatever closes that geometry. Egress is drawn from the
   *release* point as a turn onto the egress heading, never through the
   target. A straight-in heading (±5° of the leg) only *warns*. Code:
   `src/lib/attackGeometry.ts`, `src/lib/runIn.ts` (one description for the
   editor hint, card and auto-build), `src/lib/autoBuildAttack.ts`,
   `src/components/attacks/forms/ActionPointFields.tsx` (Customize control on
   all three forms). **Seen on screen** for the dive; not yet for pop-up/level.
3. **Pop-up on the handbook.** Library pop-up profiles store dive angle,
   release floor, speed, tracking time, G (`resources/profiles/*.json`,
   "Pop-up 20°" on five aircraft); apex, pull-down altitude, climb angle,
   pop distance, MAP and aim-off are derived (`src/lib/popupPlanning.ts`).
   The check turn defaults to what the handbook's angle-off guide implies,
   rounded to 5°; the pull-down turn is solved so the arc lands at the MAP.
   **Not yet seen on screen.**
4. **The card is the map.** No text procedure or switchology on the kneeboard.
   `src/lib/attackPicture.ts` builds the attack picture once (lines by stage,
   markers by point, the white labels' words); the map overlay
   (`AttackProfileOverlay.tsx`) and the card (`renderKneeboardCanvas.ts`) both
   draw it — north-up plan view with threat rings plus a side view. Labels are
   laid out with collision avoidance and leader lines; zoom fits AP…TGT. The
   header reads "Viper 1-1 — 30° Dive CCIP, Mk-84 attack on STPT 8 (TGT1)".
   The user saw v1 (labels overlapped); **v2 layout not yet seen.**
5. **Chained attacks** flow in from the previous steerpoint (a second bomb on
   STPT 9 runs in from STPT 8), not from the route's IP. `inferIp` in
   `autoBuildAttack.ts` is now "the waypoint before the target", full stop.
   **Not yet seen on screen.**
6. Wording: release altitude is a floor everywhere — "pickle before",
   "release by", never "at". Basic path shows two equal toggles, Ingress and
   Egress; degrees and headings live in Customize.

### Design rules the user has stated (keep them)

- **Never remove a knob from Customize.** Defaults hide complexity; they do
  not remove control. Warn, do not block.
- **Kneeboard = pictures**, same visual language as the planner map, no
  cockpit switchology, max zoom with AP and TGT in frame (cards are small in
  DCS).
- **"Ingress from the left"** = turn left off the direct line at the action
  point, run up the target's left flank, final turn *right* onto it.
- The user is an aviation geek, not a developer: explain in aviation terms.
- `Other Items/` at the repo root is a git-ignored drop zone for screenshots
  and exports the user wants read.

### START OF NEXT SESSION — eyeball, in this order

1. Kneeboards → the dive card (v2): AP and TGT in frame, no label collisions.
2. Add a second attack on the next target for the same pilot: the AP must
   sit on the leg from the *previous target*.
3. Pop-up 20° chip: map shows AP, POP, PDP, TRK, REL, TGT with the orange
   pull-down arc; card side view shows climb, apex star, pull-down, hard deck.
4. Customize on each form: Action point / Check turn / Ingress from; the
   attack heading updates; a 40° check turn at 4.5 nm is refused for the dive.
5. Level CCRP 20k: the action point is pushed out to ~9 nm with an
   adjustment message — the user has not said whether that is right for JDAM.

---

**Previous session:** 2026-09-05 → 06 (late night)

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

**M1 (profile library + auto-build) is BUILT — see below for what is and is
not committed.** Work continued into the early hours of 2026-09-06.

**Everything is committed and pushed** (the tools came back at the end of
the session — the user installed full Xcode; `git` and `cargo` work again).
Ignore the older references below to an "uncommitted" tree; the safety
tarball in `Other Items/` is now redundant and can be deleted.

**START OF NEXT SESSION: eyeball M1 in the running app** — it is built and
gated but has never been seen on screen. `npm run tauri dev`, then:
1. Import `test-data/nttr_redflag_viper1.json`, group Viper 1 (Hot). First
   launch prints "Reference database is v1, rebuilding as v2" — expected.
2. Attacks → Add Attack. Pick TGT1, Viper 1-1, then Mk-82 LDGP (the pilots
   have no loadout yet, so the weapon list is every A/G store). Expect the
   "30° Dive CCIP" chip selected, heading from the IP, egress away from the
   SA-11 site, the key-numbers line, and an ESTIMATED badge. Save.
3. The map should draw ROLL / REL / TGT and the egress line; Kneeboards
   should show the dive card with an amber ESTIMATED strip and the profile's
   setup lines as step ①.
4. Try a GBU-31: expect "Level CCRP 20k (JDAM)" by default, with the
   pop-up and dive chips still offered.
5. Customize → change a number → see "edited from …" and the reset link.
6. Flight → give a pilot an F-4E and a Mk-82: expect "30° Manual Dive" with
   105 mils on the card.

What M1 delivers (all `npm run build` clean; Rust tests last green at 37
before the seed files were added — the ten-file library has been validated
by a Python mirror of the same rules, but `cargo test` must confirm):
- `src-tauri/src/profiles/mod.rs` + `resources/profiles/*.json`: 62 profiles
  for F-16C, F/A-18C, A-10C II, F-15E, F-4E, A-4E-C, F-5E, F-14, Mirage F1,
  AV-8B. All ESTIMATED. `defaultFor: [classes]` per profile; exactly one
  default per (aircraft, weapon class) — a test enforces it. Squadron
  overrides in `<app data>/profiles/*.json` (README written on first use).
- **Smart weapons are listed on the visual profiles** (dive CCIP, DTOS,
  pop-up) — the user was explicit: level CCRP for every LGB/JDAM is
  predictable and exploitable; DTOS over a ridge with a JDAM is a real
  tactic. Level CCRP/AUTO is the *default* for lgb/jdam, not the only option.
- `src/lib/autoBuildAttack.ts`: target + attacker + weapon → complete attack
  from the aircraft's default profile; heading from the IP (nearest `ip`
  waypoint before the target, else the previous one); egress away from the
  nearest threat; release floored at max(weapon min release, frag min-safe)
  with every adjustment reported; never returns an error-level check. Pure —
  scratch-tested against the saved Sinai mission.
- `AttackEditor.tsx` rewritten around it: Target / Attacker / Weapon (from
  the loadout when one exists) → profile chips → heading + Left/Right → key
  numbers line → **Customize** (fuze, mode, quantity, then `DiveForm` /
  `LevelForm` / the existing `PopupCCIPForm`). No Calculate button; Save is
  gated only on problems and error-level checks.
- Level and dive on the map (`DiveOverlay`, `LevelOverlay`) and the card
  (mode-keyed steps: MAN prints the sight mils, DTOS says designate-pull;
  the profile's own setup lines are step ①; ESTIMATED prints as an amber
  strip).
- `attackChecks` now gates weapon class against the profile's list instead
  of guessing from guidance.
- Reference DB has `PRAGMA user_version` (v2): a stale DB is dropped and
  rebuilt from seed — that is how the six new aircraft rows reach an
  existing install. First launch after this prints "rebuilding as v2".

**Not done in M1 (deliberate):** loadout from FragOrders pylons (§3 of the
plan — needs a CLSID→weapon table; today every imported pilot has an empty
loadout and the editor offers every A/G store instead); loft geometry (LABS
and F-16 loft profiles ship hidden); nothing verified in-app yet — the dev
app could not run without the linker. **Eyeball M1 in the app before
anything else next session**: import NTTR, Attacks → Add, pick TGT1 + Viper
1-1 + Mk-82 → expect "30° Dive CCIP" selected, heading from the IP, egress
away from the SA-11, and a card with the ESTIMATED strip.

**~~Rust replica to keep in sync~~ — RETIRED 2026-09-09.** The whole
`src-tauri/src/calculators/` module is deleted; `popupReleaseAltitude_ft` in
`autoBuildAttack.ts` is now the only implementation. Nothing to mirror.

**Pending commit message (Phases B + C + seeds):** "M1: level and dive on
map and card; auto-build editor; 62-profile library for ten aircraft" — the
three commit-message drafts are in the session transcript; the substance is
the bullets above.

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
