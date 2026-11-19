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

## Sources (IMPORTANT — this repo is public)

The user's decision, 2026-11-17: **a real-world military document that
carries a distribution restriction, an export-control notice or a
classification marking is never a source here**, however public a scan of it
is. No number, no table, no figure worked out from one, no test fixture; and
it is not named in code, docs, notes or commit messages.

- **Fine:** the game's own files, the modules' own manuals, published guides
  (Chuck's Guides), and physics the planner works out itself.
- **A figure that such a manual holds may still be used when DCS's own
  documentation or a published guide prints it too** (the user, 2026-11-17,
  the more so for an aircraft 30 or more years old). Take it from the DCS
  document or the guide, check it there, and cite that.
- **Before using any other real-world document, look at its title page.** If
  its status is not known, treat it as restricted and ask the user.
- Anything read from such a document stays out of everything git tracks, and
  nothing is ever copied into the repo from working papers that hold it.

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

### STATE 2026-11-19 05:40 UTC

**0.4.0 "Polish and Playback" is being built on two branches; nothing of it
is on `main` except documents** (brief and decisions: `docs/V040_PLAN.md`;
rollback tag `pre-0.4.0`). Fable 5.2 directs, with Opus and Sonnet agents.
The five days of notes before this block are at the top of
`docs/SESSION_HISTORY.md`. The working papers are git-ignored and exist only
on the main Mac (`Other Items/v040-work/`); memory
`project-v040-polish-and-playback` has the run ids and paths.

**History was rewritten on 2026-11-18, with the user's yes** (text that
should never have been written was taken out of unreleased commits). **A
clone made before 2026-11-18 must be cloned again, never merged.** Releases
and their tags are untouched.

**Playback, `v040-playback-full`, pushed tip `df0670f`, all of it
reviewed.** A strike flies every jet in 3D over real terrain; times over
target are dragged on lanes and applied back; bombs fall, flash and show
their blast ring; a Notes list and a Side view; and the threats the planner
may see are drawn in 3D, switched on and off by system from Show, with
early-warning radars on demand. A jet inside an active envelope gets a white
ring round its arrow and a label line naming the threat; labels that would
cover each other slide clear, with a thin line back to their jet. geo-check
1,124; 215 screenshot steps; start-up JS 634,822 (ceiling 636,073).

**A small left-overs stage was being built when this was written** (updated
2026-11-19 09:50 UTC): one new commit on top of `df0670f`. Every target of a
strike sets the ground level, the sea stays flat beside a target that stands
below sea level, a place with no elevation data says so, and a few checks
are tightened. Its spec is the last bullet group of ruling 9.15 in the
working paper `Other Items/v040-work/b3/BUILD_SPEC_S9.md`. If the session
that ran it is gone, any commit on the main Mac past `df0670f` is not yet
reviewed: review it, or go back to `df0670f` and build it again from the
spec. After it comes the director's proof stage (the full screenshot run at
both sizes, the size budgets, a walk-through for the user).

**To show the user at the next playback look:** three-line labels on jets
inside an envelope and the slid labels with their thin lines (too busy?);
the white ring's size, which is a thick band close up in Chase; the capital
letters on the threat list's group headings.

**Redesign, `v040-shell`, tip `5e82e5d` (pushed).** Every stage is built and
reviewed: the design foundation (`docs/DESIGN_SYSTEM.md` there is the
guide), the front page with its load box and recent-mission cards, the
flight chooser, the header with its File menu, the Flight overview, the
planner's icon rail and floating side panel, the map's Legend as a small
corner button, the phone's bars, tabs and sheet, and a screenshot proof
(`scripts/shell-shots.cjs`). Working copy on the main Mac:
`.claude/worktrees/shell`. Still to do: move the branch onto the playback's
final tip (that push replaces the branch; the user has agreed), bring the
three size ceilings down to what is built and refresh the Budgets table in
`docs/DESIGN_SYSTEM.md` in the same commit, then build one combined app for
the user to look at. Nothing merges to `main` before he has looked.

**Sight figures (mils): designed, nothing built.** The user's three
decisions of 2026-11-18:
1. The app may carry the community kneeboard packs' figures.
2. Credits go in an About section of the app and in the read-me, **never on
   a kneeboard card**. The app has no About section, so one is to be built
   (the File menu, and the phone's Menu). A card prints only the number,
   with "(est.)" when the planner worked it out.
3. **A DCS module's own manual always outranks a third-party document.** The
   F-5E manual's own two bombing rows go in and win where they apply; a pack
   only fills what a manual leaves out. Only old editions of the F-5E and
   Mirage F1 manuals have been read: the user was asked to copy the current
   ones from the DCS folder into `Other Items/Reference Docs/`. A known
   snag: the F-5E manual's 30° row releases at 2,000 ft, and the app refuses
   a Mk-82 release under 3,000 ft (a seed floor with no source). That is its
   own question to the user, with a table.

The design paper is `Other Items/v040-work/b3/BUILD_SPEC_S18_SIGHT_TABLES.md`
(its last section holds the rulings). It is built last, on the redesign's
line, and only what he has said yes to.

**Waiting on the user, one question at a time, each showing the thing
itself:** the two current manuals; then the sight questions jet by jet; the
redesign's last look ("Shell look 4" in `Other Items/v040-builds/`) with its
open questions; how to credit the pop-up model's source; a small table of
weapon numbers that would change (a release floor and a speed warning among
them).

### START OF NEXT SESSION

1. `git pull origin main`. The main Mac's checkout is on
   `v040-playback-full`; leave it there for playback work.
2. `git status` in both working copies must be clean, and
   `git log origin/v040-playback-full..v040-playback-full` shows what is
   built but not yet reviewed: review it before anything else.
3. **Never `cd` into a subfolder**, and edit files only with Edit/Write
   (memory `feedback-commands-that-dont-prompt`). **`git push`, `gh`,
   `cargo`, `git worktree add/remove` and the headless browser run outside
   the Bash sandbox.** A command run outside it has a different `$TMPDIR`.
4. **Commits:** `TZ=UTC`, and credited with the `Co-Authored-By` line only.
   The session link is left out because this repo is public.
5. **Never run two browser-driven runs at once on the main Mac**; the full
   screenshot run takes about 17 minutes and runs alone.
6. **The session's scratch folder does not survive a restart**: the browser
   driver is installed again with `npm install --prefix <scratch>/pw
   --cache <scratch>/npm-cache playwright-core`.
7. **Usage:** read `~/.claude/rate-limits.json` before each launch and keep
   a watcher armed; at 90% of the weekly limit start nothing new, at 95%
   stop cleanly, at 98.5% stop at once (memory
   `feedback-usage-limit-wind-down`).
8. **Look-and-feel work goes in front of the user in the real app first.**
   Review every agent's diff and show each new check failing once. Agents
   can litter the repo root: check `git status` before committing.
9. **Still open from before 0.4.0:** the 0.3.3 loadout screens on the iPhone
   (ask only if the user has the phone); the CLI loadouts have never been
   looked at on screen; a real Android phone check
   (`docs/MOBILE_WEB_PLAN.md`); `docs/BUILD_SESSIONS_PLAN.md` is finished and
   can move to `docs/archive/`.
