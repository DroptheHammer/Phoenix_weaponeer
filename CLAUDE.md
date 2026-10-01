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

## Privacy (IMPORTANT — this repo is public)

Everything committed here — files, history, commit messages, file metadata —
is readable by anyone, forever. Before every commit, check that it carries
**no personal data about the user or any other person**.

- **The user:** no real name, username, email, machine name, location or time
  zone. Copyright and credit say "DroptheHammer" only. Commit with
  `TZ=UTC git commit …` (all history is UTC).
- **Other people** — correspondents, contributors, squadron members, mission
  authors, anyone the user talks to: never by name or handle. Refer to them
  by role ("the FragOrders author", "a squadron member", "the mission
  author"). Their messages, code and files never go in the repo; keep them in
  `Other Items/` (git-ignored). This applies to session notes and commit
  messages too.
- **Published sources are the exception:** a public guide or manual keeps its
  normal citation, author credit included (Chuck's Guides, the Falcon BMS
  pop-up attack manual).
- **Their data:** real missions and captured FragOrders links go in
  git-ignored `test-data/private/` (tests load them with `private_fixture!`
  and skip when absent). Never hardcode a real FragOrders link id, not even
  split or partial.
- **Binaries:** never commit a PDF, image or document without checking and
  stripping its metadata. Text searches skip binaries; a PDF's Author field
  once leaked the user's real name.
- **When in doubt, leave it out and ask.** A leak can only be fixed by
  rewriting history and replacing the repo.

## Project Overview

A cross-platform desktop application for planning F-16 (and other aircraft) attack runs against defended targets in DCS World. The tool helps squadron members plan tactical attacks, weaponeer targets, and generate pilot briefing cards (kneeboards).

## Core Workflow

1. **Import mission data** from FragOrders (a public link, or the JSON the FragOrders CLI makes from a `.miz`) or manual entry
2. **Define threat laydown** at target areas (SAMs, AAA, MANPADS)
3. **Plan attack geometry** per flight member (popup, level, loft, dive bomb, etc.)
4. **Select weapons and delivery parameters**
5. **Generate kneeboard cards** in DCS-compatible format (3:4 PNG, 2304x3072)

## Development Setup (macOS)

Rust (rustup) and Node are all you need. Coordinate projection is pure Rust
(`crates/core/src/parsers/tmerc.rs`) since 2026-09-26. The PROJ C++ library, and
the `brew install proj cmake pkgconf` it needed, are gone, and so is the old
`src-tauri/.cargo/config.toml` linker path. On a Mac that still has them,
they're harmless and can be uninstalled.

## Release Process

### RELEASE CHECKLIST
**When the user says "release X.Y.Z" (or "ship" / "cut" / "launch" it), that
means the whole list below, through publishing.** The installers build on
their own the moment the tag is pushed; the user never has to ask for them
separately.

1. **Pull and check the tree is clean:** `git pull origin main`, `git status`.
2. **Run the gates:** `npm run geo-check`, `cargo test --manifest-path
   crates/core/Cargo.toml`, `cargo test --manifest-path src-tauri/Cargo.toml`,
   `npm run build`. All must pass, and so must the latest "Web app (GitHub
   Pages)" build on `main` (`gh run list --workflow pages.yml -L 3`). Stop
   and report if not. (The shared Rust
   core lives in `crates/core` since 2026-09-26; `src-tauri` is the desktop shell.)
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
11. **The phone web app follows on its own.** Publishing the release in step 9
    starts `pages.yml`, which rebuilds and publishes the site, so one approval
    covers both. Watch that "Web app (GitHub Pages)" run until it's green, and
    record its run id with step 10. The user decided this 2026-09-26.
    - Every push to `main` also builds the web app without publishing. A red
      "Web app" run on `main` means a change broke the phone version: fix it
      before releasing.
    - Between releases, a hand-started "Run workflow" publishes a fix.
    - Locally, `npm run build:web` needs `rustup target add wasm32-unknown-unknown`
      and `cargo install wasm-bindgen-cli --version 0.2.129 --locked`.

### How the release build works

`.github/workflows/release.yml` builds installers for all three platforms on
every `v*` tag push (macOS: `.dmg`, Windows: NSIS `.exe`, Linux: `.deb`/`.rpm`/
`.AppImage`) via `tauri-apps/tauri-action`, and attaches them to a **draft**
GitHub Release — publish it manually once the artifacts are verified. There
are no C++ dependencies to build. Until 2026-09-26, every platform compiled
the PROJ library from source with CMake, which silently broke macOS and
Windows CI until 2026-09-12 (see `docs/SESSION_HISTORY.md`). The pure-Rust
projection in `parsers/tmerc.rs` removed that.

There's no version-sync script — the version fields in checklist step 3 are
kept in sync by hand, on purpose (release cadence is low). See
`docs/INSTALLING.md` for user-facing install notes, including the
unsigned-binary SmartScreen/Gatekeeper workarounds.

## DCS Kneeboard Format

- **Dimensions:** laid out at 768 x 1024 (3:4 portrait), exported at 3× —
  2304 x 3072 — since 2026-09-30, because DCS scales the image to the
  kneeboard window and 1× looked soft on large monitors and in VR
  (`KNEEBOARD_SCALE` in `renderKneeboardCanvas.ts`)
- **Format:** PNG (lossless; never JPG)
- **Location:** `Saved Games/DCS/Kneeboard/{aircraft}/{filename}.png`
- **Design:** Dense but readable, dark text on light background

## Development Phases

**`ROADMAP.md` is the single to-do list** (open / in progress / shipped by
release / decided-not-doing) — update it when something ships or is decided.
Finished plans and reviews live in `docs/archive/`. Summary of the phases:

Phases 1–3 (foundation, core planning, output) and most of Phase 4 are done —
history is in git and `docs/SESSION_HISTORY.md`. Still open from them:

- [ ] PDF export option (optional)
- [ ] Loft geometry (LABS, F-16 loft) — profiles ship hidden, geometry unbuilt
- [x] FragOrders URL import — built 2026-09-22 on the public link as it is
      (`crates/core/src/fragorders_link.rs`, fetch in `src-tauri/src/link_fetch.rs`);
      no endpoint or key coming

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
- **Aircraft:** 10 with delivery profiles (F-16C, F/A-18C, A-10C II, F-15E, F-4E, A-4E-C, F-5E, F-14, Mirage F1, AV-8B); the F-16C is the most complete
- **`Other Items/`** at the repo root is a git-ignored drop zone for screenshots, exported cards, and scratch reference pages the user wants read (e.g. `offset-leg-geometry.html`, a design reference — do not delete it). Never commit it. Private correspondence with the FragOrders author lives in `Other Items/fragorders-author-private/`.
- **This repo is public** — see "Privacy" at the top. The full unscrubbed history is the private repo `DroptheHammer/Phoenix_weaponeer-archive`; this repo's history was rewritten on 2026-09-23, so **any clone older than that must be re-cloned, never merged** (a `git pull` there fails with "unrelated histories" — that's the signal). Commit hashes quoted in notes from before that date refer to the archive's history.
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


**Last session:** 2026-09-30 UTC, late (Opus 5.5 orchestrating on the main Mac,
Sonnet 5.5 builders). **Nothing shipped. `main` carries the v0.3.2 app
unchanged**: an artwork attempt was built, then rolled back at the user's
request. Only these notes differ from the released tree.

**What happened:**
- The user supplied a splash picture and a phoenix app icon (AI-generated, in
  git-ignored `Other Items/Artwork/`).
- **A start-up splash was built and removed.** The user picked a style from a
  preview page (`Other Items/splash-options/`), saw it in the real Mac app,
  and turned it down. It was never committed. Do not propose one again.
- **The icon was committed, then reverted.** `b2785a1` put the phoenix icon on
  every platform (Pages run 36826214513, green). The user then reported a
  white flash while the app loads and asked to go back to 0.3.2. `3ae5398`
  reverts it; the tree is identical to `7bd266a` (Pages run 36826601626).
- **The artwork is parked, not closed.** If the icon comes back,
  `git show b2785a1` has the whole icon set and a `docs/ARTWORK.md` with the
  commands. Memory `project-app-artwork-splash-icon`.

**The white flash was not diagnosed.** What is known:
- `b2785a1` changed only icon files, the browser-tab icon link and the phone
  icon paths. Nothing in it touches how the window opens.
- The window has no background colour set, and the page's dark background
  comes from the CSS file. So any build can show white before the first
  paint, and a freshly built app starts slower than an installed one.
- The splash build had set the window background dark and painted dark from
  the first HTML. The user saw that build just before, and reported no flash.
- Not checked on screen by anyone: whether a plain 0.3.2 build flashes too.
  The local bundle in `src-tauri/target/` was rebuilt from the reverted tree
  for that comparison.

**Still open from the 0.3.2 release** (see "In progress" in `ROADMAP.md`): 3×
cards in DCS, the iPhone carousel at 3×, the Lighting dropdown, the header
sight, the Copy menu, the waypoint list.

### START OF NEXT SESSION

1. `git pull origin main`.
2. **Ask whether the white flash shows on plain 0.3.2.** If it does, the
   candidate fix is `"backgroundColor": "#1a1a2e"` on the window in
   `tauri.conf.json` plus an inline dark `html` background in `index.html`.
   On macOS that colour reaches the window only, not the web view, so it
   needs the user's eyes, in the real app, before anything else is built on it.
3. **Ask about 0.3.2 in use:** 3× cards in DCS (monitor and VR), Night/NVG in
   the cockpit, and the phone carousel. If the carousel is slow, show smaller
   images there and share the full-size ones.
4. **"Jets arrive loaded"** for 0.3.3 (`docs/LOADOUT_IMPORT_PLAN.md`).
5. **Phone web app:** a real Android phone check is still open
   (`docs/MOBILE_WEB_PLAN.md`). Merge PRs from the Mac with `TZ=UTC`, never with
   GitHub's phone button.
6. **Never `cd` into a subfolder.** It once made the harness drop a `.claude`
   folder that broke geo-check (memory `feedback-commands-that-dont-prompt`).
7. **Look-and-feel work goes in front of the user in the real app first**,
   before it is polished, documented or committed.
