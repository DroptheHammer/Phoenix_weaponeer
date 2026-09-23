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

**Last session:** 2026-09-22, late (Opus 5.5, user at the screen). **Released
and published v0.2.3.** It ships FragOrders link import, built the session
before (see the top of `docs/SESSION_HISTORY.md`). One version-bump commit, a
tag, and the session-notes commits, all pushed. No code changed. Gates at
release: **249 geo-checks**, **99 Rust tests + 1 ignored**, `npm run build`
clean.

| Commit | What |
|---|---|
| `e038278` | Bump version to 0.2.3, tagged `v0.2.3` |
| `292debf` | Session notes: v0.2.3 published |
| (next) | Session notes, archive of the link-import session |

### v0.2.3 release

- Release CI run `35822594387` passed on macOS, Windows and Linux. That was the
  first CI build of the new `ureq`/rustls dependency, and it built cleanly
  everywhere.
- All 7 assets are attached: `.dmg`, `.app.tar.gz`, `-setup.exe`, `.msi`,
  `.deb`, `.rpm`, `.AppImage`. **Published and marked Latest at the user's
  request.**
- The notes are plain-language. They point to the **From URL** tab and say
  that an empty threat list means the mission maker withheld the threats on
  purpose. I also wrote the user a Discord hype message for the squadron.
- **Sandbox note:** under the Bash sandbox, `git pull`/`push` (gh credential
  helper), `gh`, and `cargo` all have to run unsandboxed. Memory:
  `feedback-commands-that-dont-prompt`.

### START OF NEXT SESSION

1. Pick the next banked feature. **Live-geometry Customize** is
   half-planned in `~/.claude/plans/foamy-sauteeing-hejlsberg.md` (memory
   `project-live-geometry-customize`). The other candidate is **multi-aircraft
   coordinated strike together with shared custom IP** (memory
   `project-shared-custom-ip`). Ask.
2. If a `brew upgrade` brings back "library 'proj' not found", run
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
- Kola / Afghanistan / Channel projections; PDF export; loft geometry.
