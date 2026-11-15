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


**Last session:** 2026-11-14/15 UTC (Fable 5.2 directing on the main Mac,
with Opus and Sonnet agents). **0.4.0 "Polish and Playback" is under way.
The playback is built through stage 15 (a strike flies every jet, a jet's
time over target can be dragged while it plays, and Apply writes the times
back). The user has looked at stage 13 and asked for three things: jets
that roll as a pilot would fly them, a bomb you can see with a trace behind
it, and an impact with its frag. The roll and a bomb you can find are
built; the trace was being built when these notes were written; the impact
and the frag follow.** Nothing of 0.4.0 is
on `main`
except documents. The brief, the user's decisions and
each gate's outcome are in `docs/V040_PLAN.md`.

**Branches, all pushed** (rollback tag `pre-0.4.0` on `main`):
- `v040-playback`, tip `e429ced`: the playback maths (`src/lib/playback/`),
  three.js 0.187, map and terrain tiles through Rust with a disk cache
  (`src-tauri/src/tiles.rs`), and the first 3D cut: a "▶ Play" button beside
  Cancel in the attack editor flies one jet over real terrain
  (`src/lib/playbackScene/`, `src/components/playback/`). Gates there:
  geo-check 901/0, tsc, build with the bundle check, the web check, core 154,
  desktop 34 + 2 ignored. Headless checks: `scripts/playback-shots.cjs`.
- `v040-playback-full`, cut from `v040-playback`: **the full playback, being
  built stage by stage** (stages 0 to 20, plus the stages added from the
  user's look, below). **Stages 0 to 15 and the first three stages from his
  look (ATT-a, ATT-b, S10a) are built, reviewed and pushed, tip `e90a8af`.**
  What the playback does now:
  opens following the jet 10 s before the first action; Orbit, Top-down,
  Chase, From target and Home view; speeds 1× to 16×; the planner's colours
  on the 3D path, the trail and the bomb's fall; a lane under the time bar
  in the same colours with lettered chips; the red TGT disc with the
  target's name; lettered discs on posts at each action point with the
  planner's own words coming up 3 s before and going 2 s after; a label
  beside each jet with altitude and speed; a Show menu (Labels, Action
  points: Off / As they come / Always, Attack colours: Watched jet / All
  jets, Whole run-in). **Play in the attack editor flies every jet of the
  strike** at the times the sliders hold: the jet being edited wears the
  planner's colours and the cameras follow it; the others fly thinner, in
  their seat colours, with small discs. A jet that is not ready keeps its
  seat and is not flown. **Every jet has its own lane under the time bar,
  and the button beside a lane picks the jet to watch** (colours, Chase and
  From target follow it). **A jet's time over target is moved on its lane**
  (drag the diamond, the arrow keys, or type the seconds; seat #1 is held
  still): the frag and cone warnings under the lanes, amber stripes on the
  time bar and on each lane, and the 3D all follow as it moves, and Reset
  puts the times back. **Apply writes the times back:** from the attack
  editor into the strike's sliders ("Apply to strike"; saving the strike
  keeps them), and from the attack list into the saved plan ("Apply to
  plan", one Undo step each). **The attack list has a small Play button**
  on a strike's header and on a lone attack's row. A line under the footer
  says what an Apply did and which jets the cards will number differently.
  The plan is handed to the 3D view without its threats until the threat
  stages, so a hidden threat cannot reach it. Gates at stage 15:
  geo-check 975/0, tsc, build with the bundle check, the web check, 94
  screenshot checks at two window sizes, core 154, desktop 34 + 2 ignored.
  **Since stage 15: the jets roll** with the lift the drawn path needs
  (about 70° in a check turn, nearly inverted over the top of a pop-up,
  wings level at the release, never faster than 240° a second;
  `src/lib/playback/attitude.ts`; the path, the bomb and every time are
  unchanged to the last bit); **the arrow shows a roll** (a tall fin,
  raised wings, a darker underside); **the falling bomb is 14 px with an
  outline and has a ring round it** that pulses at the release (Show ›
  Impact turns the ring off). Gates at the tip: geo-check 995/0, tsc, build
  with the bundle check, the web check, 106 screenshot checks; the Rust
  side is untouched since stage 15 (core 154, desktop 34 + 2 ignored
  there).
  **The screenshot run takes 12 to 25 minutes** (the 3D is drawn in
  software): run it alone, in the background, with a long limit. It used
  to die on a busy Mac when a click or a screenshot passed the browser
  driver's 30 s; each page now allows 120 s (`e90a8af`), and the full run
  passed on a loaded machine. Start-up JS is 2,304 bytes over the
  0.3.4 baseline; the build fails past 3,072, a ceiling a fix round raised
  from 1,536 for the attack list's Play buttons and the director accepted
  (commit `7400208`). No stage may raise it again without stopping to ask.
  The main Mac's checkout is on this branch. **The bomb's trace (S10t,
  below) was building when these notes were written**; a stage is
  one commit, and anything not pushed is not reviewed yet.
- `v040-landing-data`, one commit `3127c41` on an older `main`: the front
  page's data layer (`src/lib/landing/`, 143 checks). Nothing in the app
  uses it yet. Both branches append to the end of `scripts/geo-check.ts`, so
  expect a small conflict there.

**The user's decisions this session** (details in `docs/V040_PLAN.md`):
- **Design: the EFB draft is the base, not the final pick.** He saw its
  iPhone version ("looks good for now"), then said he wants parts of the
  other drafts too, and gave a first round of notes (in `docs/V040_PLAN.md`,
  A1): keep the Cockpit draft's per-jet loadout cards (stores listed
  vertically, quantities in their own colour); the "mission summary" is
  really about the flight and needs a better name; a full-width but slim
  header; no waypoint or lat/long tables on that screen; a threat block that
  still fits a mission with 10-15 systems and hundreds of units. **Do not
  build or spec the new UI until he has agreed a mockup.**
- **Terrain gate passed** in the real Mac app (72 frames a second, Retina).
  He wants: playback that opens following the jet and **starts 10 seconds
  before the first action** instead of flying the whole run-in; speeds 1× to
  16×; the planner's colour code on the 3D path and on the timeline; the
  target drawn as the planner draws it; action-point markers with the
  planner's own instructions (off, as they come, or always); threat
  envelopes switched from a menu by system, early-warning radars included.
- Windows is accepted untested. The loft card's "push IP (est)" lateness is
  parked on the roadmap. Don't re-raise either.
- Not answered, so the design's defaults stand: Reset after Apply goes back
  to the applied times; closing playback with unapplied times discards them.
- **His look at stage 13 (2026-11-15): "it seems alright, we should
  continue", and three things to change.**
  1. **Colours:** he asked whether the kneeboard's phase colours match the
     timeline and the planes exactly. They do, and nothing needs building:
     one table (`LINE_STYLE`, `MARKER_COLOR` in `src/lib/attackPicture.ts`)
     feeds the planner's map, the Day card, the timeline and the 3D path,
     and a pixel count on the screenshots found each colour exact in both.
     By design the arrow itself is the seat colour, and the jets not watched
     are seat-coloured unless Show › Attack colours › All jets.
  2. **Roll:** the jets "barely roll and look like they are flying mostly
     with yaw inputs". Cause: the bank was worked out from the sideways turn
     alone, so a pull in the vertical gave none.
  3. **Bomb, impact, frag:** "I also cant see any sort of bomb being
     dropped, it's explosion or any sort of blast radius or frag", and
     later "i'd like the bomb to have a line it falls down as well … trace
     behind it so we can see the path of the bomb".
  Asked of him, defaults in force: the arrow keeps its seat colour; no G
  figure on the label unless he asks.

**Where the work stands.** The working papers are git-ignored and exist only
on the main Mac (`Other Items/`):
1. **Full playback build.** The binding spec is two files in
   `Other Items/v040-work/b3/`: `BUILD_SPEC.md` (sections 0-8) and
   `BUILD_SPEC_S9.md` (section 9: the user's feedback as build rules, the
   stage table, the director's rulings in 9.15, which also record what each
   built stage settled; it overrides the rest). Each stage is built by one
   agent, reviewed by a second that makes every new check fail once, then
   read by the director, who fixes the review's notes, runs every gate and
   the Rust tests, and pushes.
   **Stages added from his look at stage 13** have a design paper each in
   the same folder, written, independently reviewed and revised:
   `BUILD_SPEC_S10_ATTITUDE.md` and `BUILD_SPEC_S10_IMPACT.md`. **Section
   10.8 of each is the director's rulings and overrides the rest of that
   paper**; `BUILD_SPEC_S9.md` ruling 9.15.12 lists the stages and the
   order:
   - **ATT-a (built)**: the roll comes from the lift the path needs
     (measured: a check turn about 70°, a pop-up's pull-down about 150°, a
     dive's roll-in about 117°, a loft's escape about 158°), never faster
     than 240° a second, wings level at the release. The path, the release,
     the bomb and the impact do not move. It was the one stage allowed to
     edit `src/lib/playback/`. **ATT-b (built)**: a taller fin, raised wings
     and a darker underside so a roll can be read. The arrow is still 28 px
     long: in the director's own Chase pictures the roll is right and clear
     when enlarged, and small at normal size, so **ask him at the look
     whether the roll reads**; a bigger arrow (the paper's option O7) is the
     next step if not. **ATT-c** (a G figure on the label) is on hold until
     he asks.
   - **S10a (built)**: a bigger bomb with an outline and a ring round it
     while it falls. **S10t**: a solid trace behind the bomb that stays after the
     impact. **S10b**: a flash at the impact, timed so it shows at 16×.
     **S10c**: a ring at the weapon row's frag radius, true size, marked
     "(est.)". **S10d**: Chase looks at the bomb from release to impact and
     holds on the burst (From target is left alone). **Stage 19** (the frag
     cloud) is rewritten there and moved up.
   - **The order from here:** S10t, S10b, S10c, S10d,
     19, then 16, 17, 18a, 18b, 20. **The user looks after S10t** (Apply,
     the roll, the bomb and its trace: "look 4") **and after 19** (the
     flash, the ring, the bomb camera, the frag: "look 5"), then after 17
     and 18b as before.
   - **To tell him at those looks:** the frag radius and frag height come
     from the old weapon rows with no source on file (the roadmap already
     lists them for audit), so they are drawn marked "(est.)". And the drawn
     path asks for more G than the card in two places (about 5.7 G against
     3.5 G through a pop-up's pull-down, and a spike for about a second
     after every release, which the roll ignores): both come from how the
     playback rounds the planner's path, and flying the path itself at
     believable G would move it off the planner's picture, which is his
     call.
2. **The user's looks use a frozen copy of the app**, not the project
   folder, because the folder is mid-build between stages: after a
   look-point is pushed, `npm run tauri build -- --bundles app`, then copy
   the `.app` into `Other Items/v040-builds/` under a plain name. **"Playback
   look 1.app" there is stage 8** (`409a787`, one jet), **"Playback look
   2.app" is stage 11** (`06088e6`, the whole strike) **and "Playback look
   3.app" is stage 13** (`3da9085`, lanes, a jet to watch, times that can
   be moved). Each holds everything the one before does. He has looked at
   look 3 (above). **"Playback look 4.app" exists, built from `e90a8af`:
   Apply, the roll, the new arrow, the bigger bomb and its ring. It has no
   trace yet: build it again under the same name once S10t is pushed**, so
   look 4 is what was promised (a build must not run while a stage is
   being built: both write `dist/`). The older questions below are still
   open.
3. **Second-round mockup of the EFB draft**, desktop and iPhone, is finished
   and was shown to him as private pages (the links are in the memory
   system, never in the repo). Sources: `Other Items/v040-mockups/efb2.html`
   and `efb2-phone.html`, brief `BRIEF-V2.md`, facts `v2-facts.md`, checker
   `check-efb2.cjs`. It shows a slim full-width header, the screen renamed
   "Flight overview", per-jet loadout cards, no waypoint tables, a
   fixed-size threat block, and a flight chooser for missions with many
   flights. **His verdict is still to come.**
4. **The EFB design-foundation spec is on hold** until he agrees a mockup
   (`Other Items/v040-work/a2/`: two finished maps of the app's styles and
   the EFB draft's system are still good; the `BUILD_SPEC.md` draft there is
   EFB-only and will need redoing).

**Waiting on the user:**
- **Hidden threats.** He said "the hidden threats we dont tell to users
  unless they went into settings and allow it", but the planner today shows
  a "Probable Threats — location unknown" count by system
  (`ThreatList.tsx`) and the import preview lists them by type
  (`FragOrdersPreview.tsx`). Asked: remove both, or leave them? Until he
  answers, the new overview screen says nothing about hidden threats, the
  existing lines stay, and the playback builds its count line behind one
  constant so either answer is a one-line change.
- **Questions still open from his looks at the playback.** Things to ask
  him: whether "first action" means the first planner marker after
  the IP (the reading the build uses) or the IP itself; the dark casing
  under the coloured path; how the dashed route reads far from the camera
  in Chase; the tall posts close to the eye in From target; the two IP
  chips on the lane with Whole run-in on (the card's push time, dashed, and
  the 3D crossing, filled); three sets of words at most at once; and, with
  a strike, whether the other jets read clearly enough in their seat
  colours (thin, no outline, small discs) and whether seat #4's amber is
  too close to the climb's yellow; and, with the times now movable,
  whether the amber stripes on each lane (the times that would put that
  jet inside another's frag) help or clutter, and whether dragging a time
  feels right (the time bar holds its scale while the diamond is held and
  re-fits when it is let go).
- His verdict on the second-round mockup, and what else he wants from the
  other drafts.
- The icon and splash images (prompts in `docs/V040_PLAN.md`, Track D; picks
  go in `Other Items/Artwork/v040/`).

### START OF NEXT SESSION

1. `git pull origin main`. The main Mac's checkout is on
   `v040-playback-full`; leave it there for playback work.
2. **Pick the playback build up at the first stage that is not pushed**
   (`git log origin/v040-playback-full`; `git status` there must be clean
   first: an unpushed stage commit still needs its review, and uncommitted
   edits are a half-built stage to throw away and rebuild). If the same
   Claude Code session is still open on the main Mac, resume the build run
   there: it keeps its finished steps. Memory
   `project-v040-polish-and-playback` has the full state, the run ids and
   the private mockup links.
3. **Order after that:** carry the playback build on in the order given
   above (the bomb's trace, the impact and the frag before the notes, the
   side view and the threats), with a frozen app copy at each look-point;
   take his notes from each look and from the mockup.
   The new UI is built only after he agrees a mockup. Merge to `main` only
   after he has seen each in the real app.
4. **Still open from before 0.4.0:** the 0.3.3 loadout screens on the iPhone
   (ask only if the user has the phone); the CLI loadouts have never been
   looked at on screen; a real Android phone check
   (`docs/MOBILE_WEB_PLAN.md`); `docs/BUILD_SESSIONS_PLAN.md` is finished and
   can move to `docs/archive/`.
5. **Never `cd` into a subfolder**, and edit files only with Edit/Write (memory
   `feedback-commands-that-dont-prompt`). **`git push`, `gh`, `cargo`,
   `git worktree add/remove` and the headless browser run outside the Bash
   sandbox.** A command run outside it has a different `$TMPDIR`: don't
   write a log there and read it back inside.
6. **Commits:** `TZ=UTC`, and credited with the `Co-Authored-By` line only.
   The session link is left out because this repo is public.
7. **Look-and-feel work goes in front of the user in the real app first.**
   Review every agent's diff and show each new check failing once.
8. **Agents can litter the repo root** (one left a screenshot there this
   session). Check `git status` before committing.
