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

There's no version-sync script — the version fields in checklist step 3 are
kept in sync by hand, on purpose (release cadence is low). See
`docs/INSTALLING.md` for user-facing install notes, including the
unsigned-binary SmartScreen/Gatekeeper workarounds.

## DCS Kneeboard Format

- **Dimensions:** 768 x 1024 pixels (3:4 portrait)
- **Format:** PNG or JPG
- **Location:** `Saved Games/DCS/Kneeboard/{aircraft}/{filename}.png`
- **Design:** Dense but readable, dark text on light background

## Development Phases

Phases 1–3 (foundation, core planning, output) and most of Phase 4 are done —
history is in git and `docs/SESSION_HISTORY.md`. Still open from them:

- [ ] PDF export option (optional)
- [ ] Loft geometry (LABS, F-16 loft) — profiles ship hidden, geometry unbuilt
- [x] FragOrders URL import — built 2026-09-22 on the public link as it is
      (`src-tauri/src/fragorders_link.rs`); no endpoint or key coming

### Phase 5: The banked features (NEXT)
- [x] **Live-geometry Customize** — built 2026-09-22: full-screen editor,
      slider + number box per knob (`src/lib/customizeKnobs.ts`), live
      `AttackPreviewMap` + side view. Reference was
      `Other Items/offset-leg-geometry.html` (git-ignored).
- [x] **Multi-aircraft coordinated strike** — built 2026-09-23: `Strike`
      (`src/lib/strike.ts`, `strikeDraft.ts`), Group + per-jet tabs in the
      editor, mirrored split, TOT spacing, faint wingmen on the card. Rollback
      tag `pre-multiship`. Tactics and estimates: `docs/DELIVERY_PLANNING.md`.
- [x] **Shared custom IP across a flight's attacks** — folded into the strike:
      the strike owns one IP, written through to every jet; clearing it drops
      every jet back to Auto.

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
- [x] **Coordinate conversion** — ✅ FIXED, and cleared of suspicion twice
  since. proj4 Transverse Mercator per theater, pinned by landmark and
  axis-order tests. **Read the warning in the 2026-07-26 notes in
  `docs/SESSION_HISTORY.md` before suspecting it a third time.**

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

**Last session:** 2026-09-22 → 23 (Opus 5.5, user at the screen). **Built
all of Phase 5**: live-geometry Customize, then multi-ship coordinated strikes
with a shared IP. The user checked both on screen ("badass", "seems to work
well"). Both are committed and pushed; **neither is released yet**. Gates at
the end: **301 geo-checks** (was 249), **100 Rust tests + 1 ignored**,
`npm run build` clean.

| Commit | What |
|---|---|
| `8c1f969` | Live-geometry Customize: sliders beside a live map and side view |
| `6d486f4` | Multi-ship coordinated strikes with a shared IP |
| (next) | Session notes |

Tag **`pre-multiship`** (on GitHub) sits just before `6d486f4`, as the
rollback point.

### Live-geometry Customize (`8c1f969`)

- **Layout:** the attack editor is now nearly full screen. Controls are on
  the left; on the right is `AttackPreviewMap` (its own small map, not a
  second `MapView`, framed once then held), then a run-in readout strip, then
  a live `SideProfileView` drawn with the card's own `drawSideProfile`.
- **Controls:** every number is a `SliderField` (slider + number box, with an
  Auto chip for optional fields). Ranges live in `src/lib/customizeKnobs.ts`,
  and geo-check holds them to the 12/9/13 knob counts and to the library's
  values. All 37 knobs are kept.
- **Behaviour changes:**
  - Customize freezes auto-build on the first edit, not on opening.
  - The custom IP is placed and dragged on the editor's own map, so
    `uiStore.ipDraft` is gone.
- **Bug fixed (`moveIp` / `reanchorProfile` in `attackFlank.ts`):** moving the
  IP on a customized attack left the *stored* heading stale. The picture was
  always right, because it re-solves from the live IP. The card's Attack HDG,
  Ingress HDG and egress heading, and the straight-in check, were wrong.

### Multi-ship strike (`6d486f4`)

- **Data:** `Strike` (`src/types/strike.types.ts`) lives in
  `mission.strikes`, with Rust `#[serde(default)]` and a round-trip test.
  Each attack gets `strikeId` and `totOffset_s`.
- **Logic:**
  - `src/lib/strike.ts`: shared IP via `applyStrikeIp`, cascades, group
    edits, frag clear time, the split readout, and the card info.
  - `src/lib/strikeDraft.ts`: the editor's Group operations.
  - `src/lib/attackDraft.ts`: one jet's editor state, as pure data.
- **UI:**
  - The editor has a Group tab plus one tab per jet (`JetPanel`,
    `GroupPanel`, `JetStrip`, `IpPicker`).
  - The attack list shows a strike block with Edit and Ungroup.
  - The main map draws one IP marker per strike.
  - The card draws the other jets faint and adds a blue strike line.
- **Decisions (the user's):**
  - mirror flanks (#2 opposite; #3 and #4 repeat the pair);
  - one target per strike, but any jet can pick its own;
  - TOT offsets from the lead only, no clock times;
  - the card shows wingmen faint.
- **Estimates, labelled "est.":** frag clear time is `2·√(2h/g)` rounded up
  to 5 s; IP push time is path length ÷ speed. See the "Coordinated strikes"
  section of `docs/DELIVERY_PLANNING.md`.
- **Also fixed:** the main-map custom IP drag now re-derives the stored
  headings, and deleting an attack renumbers the rest.

### START OF NEXT SESSION

1. `git pull origin main`.
2. **Probably release v0.3.0.** Both features are squadron-visible and
   untested outside this Mac. Ask first; "release" means the full checklist
   above.
3. Things the user may notice on the next test:
   - Changing a jet's attacker on its tab doesn't re-sort the jets. On
     reopen, `strikeMembers` sorts by flight position, so the lead could
     change.
   - The wingman tracks on the card don't widen the frame; this jet keeps the
     space, and the others are cut off at the edge.
4. If a `brew upgrade` brings back "library 'proj' not found", run
   `cargo clean -p proj-sys` (memory `project-proj-brew-upgrade-breaks-link`).

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
- **Link payloads could verify Kola.** The `airbases` on a link carry both DCS
  X/Z *and* Lat/Lon. The Arctic Fury fixture is on Kola, so it could give the
  ground-truth pairs Kola needs without reading the F10 map. Not done.
- The link import also skips things it could use: the per-flight
  FP/HA/ST/IP points (`navTargetPoints`), tankers and AWACS
  (`supportAssets`), and loadouts (`payload` as store names).
- A shared IP for attacks *not* in a strike was not built (the strike covers
  the flight case).
- Kola / Afghanistan / Channel projections; PDF export; loft geometry.
