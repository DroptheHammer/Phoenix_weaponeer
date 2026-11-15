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
it, and an impact with its frag. The roll, a bomb you can find and its
trace are built; the impact and the frag follow. He has since looked at
that build and asked for two more things (below): a bomb that falls on a
ballistic arc in a dive, which needs the planner's dive to change and so
his say; and lanes whose stripes explain themselves.** Nothing of 0.4.0 is
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
  user's look, below). **Stages 0 to 15 and ten stages from his looks
  (ATT-a, ATT-b, S10a, S10t, S10b, LN-k, BAL-0, BAL-a, BAL-b, S10d) are
  built, reviewed and pushed, tip `de735d7`** (2026-11-15 23:20 UTC).
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
  Impact turns the ring off); **a solid line follows each bomb down from
  the release and stays after it lands**, with the planner's dashed fall
  line still ahead of it; **a flash where each bomb lands, at its time
  over target, lasting as long to the eye at 16× as at 1×**; **a lane
  shows its amber stripes only while that jet's time is being set, and
  the warning under the lanes starts with a striped key**; **a dive bomb
  aims off past the target and falls in a true arc** (in the planner, on
  the card and in the 3D: `src/lib/diveAim.ts`; gun and rocket passes keep
  the straight sight line); **Chase turns to watch the bomb fall and land,
  holds on the burst 2.5 s, then swings back to the jet** (Show › "Watch
  the bomb land" turns it off; `src/lib/playbackScene/bombCam.ts`). The
  dev harness has a four-dive strike (`?fixture=dive4`). Gates at the
  tip: geo-check 1028/0, tsc, build with the bundle check, the web check,
  130 screenshot step lines (the reviewer's full run on S10d's commit); the
  Rust side is untouched since stage 15 (core 154, desktop 34 + 2 ignored
  there).
  **The screenshot run takes 12 to 25 minutes** (the 3D is drawn in
  software): run it alone, in the background, with a long limit. It used
  to die on a busy Mac when a click or a screenshot passed the browser
  driver's 30 s; each page now allows 120 s (`e90a8af`), and the full run
  passed on a loaded machine. Start-up JS is 2,770 bytes over the
  0.3.4 baseline (632,699); the build fails past 4,096 (634,025). The
  ceiling was raised twice, each time in a commit of its own: for the
  attack list's Play buttons (`7400208`) and for the dive's aim-off, which
  is planner code (`f3d1595`). No builder may raise it: a stage that would
  pass it stops and reports.
  The main Mac's checkout is on this branch. **A build run was in hand
  when these notes were written (2026-11-15 23:30 UTC): the card label fix
  (LBL), then the first three frag stages (FRG-0, FRG-a, FRG-b), all
  below**; a stage is
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
- **His look at the roll and the bomb's ring (the first "look 4" copy,
  2026-11-15), on a four-ship dive strike: two more things.**
  1. **"The bomb isnt following a ballistic trajectory it looks wierd
     falling in a striaght line. we have weights and speeds and all that
     stuff. I dont see why we arent doing this."** What was found: level
     and pop-up bombs already fall on a gravity arc with no drag, and the
     loft's on the planner's drag simulation. **The dive is the exception,
     and the cause is in the planner:** `calculateDiveGeometry`
     (`src/lib/attackGeometry.ts`) puts the roll-in and the release on a
     straight line at the dive angle through the target, with no aim-off,
     so a real bomb from that release point lands several hundred feet to
     2,000 ft short and the playback rides the card's straight line
     instead of showing a miss. The pop-up planner already has the aim-off
     (`planPopup`). **The fix gives the dive the same aim-off, which moves
     the roll-in point on dive maps and kneeboard cards** (release
     altitude, speed and dive angle stay; no other delivery's card
     changes). **That is his decision; he has been asked and told the
     recommendation is yes**, and that unless he says otherwise it is
     built on the playback branch as its own step, with nothing merged
     until he has seen a dive card before and after.
  2. **"why are the lines all hashed and caution taped again? in certain
     areas?"** (the lanes). The dashes are the planner's own dashed legs.
     The amber stripes on a lane are the times over target that would put
     that jet inside another's frag; with three wingmen 5 s behind the lead
     nearly every lane was striped end to end. They do not explain
     themselves. Told him the plan, his to veto: a lane's stripes show
     only while that jet's time is being set, and the footer's warning
     gets a striped key.
  3. **Frag is DCS's blast (decided).** He asked what "inside #1's ~35 s
     of frag" rests on. It is `fragClearTime_s` in `src/lib/strike.ts`:
     the time a fragment thrown up to the weapon row's frag min-safe
     altitude takes to fall back, rounded up to 5 s (30 s for a Mk-82,
     35 s for the Mk-84 family), compared with the gap between two jets'
     times over target. Time only: no position, no radius. That is a
     real-world spacing habit, not what DCS does. **His decision, in his
     words:** "the DCS rule... in DCS we dont have fallign fragments etc.
     its just the blast measured outwards from the bomb by a distance and
     occluded by terrain. For each bomb it will have its own radius etc so
     we need to make sure we scrape the game files or other things. Lets
     make it just instant when the bomb goes off to keep it simple". So:
     a conflict is another jet inside the bomb's radius of the burst, in
     3D, **at the instant it goes off**; **each bomb's radius comes from
     the game's files or another source that can be cited**, shown to him
     before it is committed; a weapon with no sourced number gets no test
     and says so. The director's ruling, told to him: terrain in the way
     is not credited (the app has no DCS terrain), so the test can warn
     where DCS would not, never the reverse. Still open: whether the old
     30/35 s rule stays as an off-by-default switch.
- **His rule for long sessions (2026-11-15): wind down before the plan's
  usage limit, never let runs die mid-way.** At 90% of the weekly limit:
  launch nothing new, let the stage in hand finish and be reviewed, push
  what is done, refresh these notes. At 95%: stop every run at once, save
  any half-built stage as a patch in the git-ignored working folder and
  put the tree back to the last commit, push, notes. At 98.5%: stop,
  patch, one notes commit, push, nothing else. **The figure is tracked
  on the main Mac since 2026-11-15:** a status line script writes the
  all-models weekly percentage to `~/.claude/rate-limits.json` (wired in
  the project's git-ignored `.claude/settings.local.json`, refreshed every
  5 minutes and after each reply; it makes no request and uses no tokens).
  Read that file before every launch, and keep a background watcher armed
  that exits when the figure reaches the next level (85, then 90, 95, 98).
  The per-model figure is not in the file: he reads it from `/usage`.
  Close to the weekly reset, winding down means holding new launches
  until the reset, not ending the day.
- **He answers from his phone when away from the Mac.** Keep messages to
  him short, send a push notification only when a decision of his blocks
  the work or a usage level is reached, and carry on with everything that
  does not need him.

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
     while it falls. **S10t (built)**: a solid trace behind the bomb that
     stays after the
     impact. **S10b**: a flash at the impact, timed so it shows at 16×.
     **S10c**: a ring at the weapon row's frag radius, true size, marked
     "(est.)". **S10d**: Chase looks at the bomb from release to impact and
     holds on the burst (From target is left alone). **Stage 19** (the frag
     cloud) is rewritten there and moved up. **S10c and 19 as written
     there are superseded by his frag decision: see the frag stages
     below.**
   - **Two stages from his look at the roll and the ring:** **LN-k** (the
     lanes' stripes show only while that jet's time is being set, with a
     striped key by the footer's warning; its whole spec is ruling 9.15.13
     of `BUILD_SPEC_S9.md`; one commit, so it can be backed out if he says
     to keep the stripes or drop them; **built**). **The ballistic dive**:
     its paper, `BUILD_SPEC_S11_BALLISTIC.md`, is written, reviewed and
     ruled on (**its section 11.8 is the director's rulings**). **The user
     said yes to it** after being shown what changes: for the F-16C 30°
     dive (8,000 / 4,500 ft, 450 kt) the release marker moves from 1.28 to
     0.94 nm, the roll-in from 2.3 to 1.9 nm, the roll-in turn from 42° to
     53°, the attack heading from 271 to 281, the egress heading from 001
     to 011, and a dashed aim line runs 0.34 nm past the target; the
     strike's push moves about 4 s; the A-10's 30° dive turns in 72°
     instead of 50°; **the A-10C, AV-8B and A-4E 45° dives get a 10° check
     turn instead of 20°, and old saves of those lose their offset leg on
     the map until re-opened and saved**; every old saved dive redraws.
     Level, pop-up, loft, gun and rocket cards do not change, and a check
     taken before the change holds that. Stages: **BAL-0** (that check,
     no behaviour change), **BAL-a** (the change, in the planner, the
     card and the playback), **BAL-b** (a four-dive fixture for the
     harness and two checks of the look). In the 3D the arc is plain in
     Chase and small in the default Home view (the whole fall is 30 to
     44 px long there). **Settled with him since:** **no aim-off number
     on any dive card** (a CCIP jet's pipper gives the aim point, the A-4E
     and F-4E have a computed release, and the manual jets set their sight
     in mils: do not offer it again); the dashed aim line on the map
     stays. **Old saved 45° dives of those three aircraft: he wants them
     repaired automatically, later** ("we arent opening a lot of old saved
     missions in the normal ops"): not in this build, a roadmap item, and
     the release notes say to open and save again any dive attack made
     before this version. **All three stages are built and pushed.** The
     F-16C 30° dive card, before and after, was sent to his phone
     (2026-11-15; copies in `Other Items/v040-work/b3/cards/`); he has not
     commented yet. **On the new card two labels land badly** (the
     "Release by" box sits far from REL and its leader crosses the attack
     line; the "→ STPT" edge note sits on the north arrow). Both are the
     card's label placer, older than the dive change. **Stage LBL fixes
     them** (ruling 11.8.12 of the ballistic paper is its whole spec: a
     label box takes the nearest clear spot on its side, not the first
     found, in `src/lib/labelLayout.ts`; the edge note keeps off the north
     arrow and the scale bar, in `src/lib/renderKneeboardCanvas.ts`). Its
     report carries cards before and after: look at each, then send him
     the fixed card.
   - **New work he asked for while settling that: the sight's mils must
     follow a customized attack.** Manual-dive cards print one fixed
     `SIGHT n mils` per profile today (an unsourced figure for a Mk-82 at
     the profile's own speed and height, in
     `src-tauri/resources/profiles/*.json`), and nothing recomputes it.
     His words: "It should change IF the pilot customizes the attack. It
     should look up the new MILs and make the alteration ... eitehr looked
     up or estimated based on the master operating tables for that jet."
     **The research is finished** (`SIGHT_MILS_DATA.md` in the same
     folder, sections 0 to 7). What it found: **none of the eight sight
     numbers on file traces to a table.** Whether the DCS F-5E drops like the real jet is not known (a few bombs dropped in the game would settle it). The Mirage F1 module manual covers only 10° and 20° dives with
     the SAMP-250. Nothing for the F-4E (its module has a bombing
     calculator in the game) or the A-4E-C's dives.  The
     paper's suggested order: first stop printing the fixed number once
     the attack is customized and give a box for the pilot's own figure;
     then a real lookup for the F-5E Mk-82; flagged estimates elsewhere.
     **No design paper is commissioned yet:** his answer on the
     squadron's own tables decides the main data source. Both this and
     the old-saves repair are open items in `ROADMAP.md` on the playback
     branch (`de735d7`).
   - **The frag stages, from his decision above.** Two more papers in the
     same folder: `BUILD_SPEC_S12_FRAG.md`, **written, reviewed, revised
     to his decision and ruled on by the director (its section 12.8)**,
     and `DCS_BLAST_DATA.md`, **finished**. The rulings: the blast test is
     the default; **the old 30/35 s spacing rule stays as a choice on the
     strike, off by default** (the director's call from the project's
     keep-every-knob habit; he has not been told yet and may veto: say it
     in one line when the frag stages are shown); no radius enters the
     data file until he says yes to the values; terrain gets no credit;
     the phone shows a note and cannot switch the rule. Stages: **FRG-0**
     (three new fields on the weapon row, all empty), **FRG-a** (the rule
     in the playback library, default still the old rule), **FRG-b** (the
     playback's footer, bar and lanes follow the rule; a `ridge` test
     fixture), **FRG-0b** (the approved radii enter; needs his yes),
     **FRG-c** (the strike editor and the flip of the default; may ship
     without the flip if he has not answered), then **S10c** and **19**
     as rewritten. What the papers found: over 150 measured
     strikes the old time rule warns in 110 and a distance test at the
     burst in none (in his four-ship dive at 5 s the nearest jet is 7,344
     ft from the lead's burst); **DCS's published weapon files hold no
     blast radius for any bomb, only an explosive mass**, and the one
     measured test in public (a helicopter, by eye) gives about 250 ft for
     the Mk-82 and Mk-83 and about 360 ft for the Mk-84; the research
     paper writes up a test he can fly himself. **Asked of him
     2026-11-15 22:40 UTC as one choice, not yet answered:** (1) the
     three tested bombs (Mk-82 250 ft, Mk-83 250 ft, Mk-84 360 ft) plus
     the five whose warhead in the game's files is the same (Mk-82 AIR,
     Mk-82 Snakeye and GBU-38 at 250; Mk-83 AIR at 250; GBU-31 at 360),
     the director's recommendation; (2) only the three tested; (3) none
     until he flies the test himself. The frag paper covers
     the test by distance at
     the burst in the planner and the playback, stages FRG-a onward, and
     **S10c and stage 19 rewritten: a ring at the tested radius at the
     burst, no cloud that lasts 35 s**. The owner's decision is
     ruling 9.15.14 of `BUILD_SPEC_S9.md`; where the frag paper still asks
     what he has already answered, that ruling is the answer. **S10c and
     19 are not to be built as the impact paper has them.**
   - **The order from here:** LBL, FRG-0, FRG-a, FRG-b (one run, in
     hand), then, on his yes to the radii, FRG-0b and FRG-c, then S10c
     and 19 as rewritten, then 16, 17, 18a, 18b, 20 (these do not wait
     for the frag stages and may run between). **Look 5 is built** (the
     flash, the dive's arc, Chase watching the bomb land); **he has not
     opened it yet**. He looks again after the frag test is in, then
     after 17 and 18b as before.
   - **Picking up a paper that was cut short:** a design or research run
     writes its file as it goes. If a paper in that folder has no "Review
     record" section at its end (the research paper: no section 7), it was
     not reviewed: read it as a draft and run the review and revise steps
     again (the scripts and run ids are in the memory notes).
   - **To tell him at those looks:** the drawn
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
   look 3 (above). **"Playback look 4.app" is built from `6f89063`:
   Apply, the roll, the new arrow, the bigger bomb with its ring, and the
   bomb's trace.** He looked at an earlier copy of it without the trace
   (his two points are above). **"Playback look 5.app" is built from
   `de735d7`: the flash where each bomb lands, the lane stripes that show
   only while a time is set, the dive bomb's arc and the new dive
   geometry, and Chase watching the bomb land.** He has not opened it
   yet. A build must not run while a stage is
   being built: both write `dist/`. The older questions below are still
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
- **Ask him one thing at a time and show the thing itself** (the card's
  row as it would print, the map before and after), in plain words: he
  could not follow two of three questions sent together.
- **The blast radii** (asked 2026-11-15, one choice of three, above):
  the next thing he owes an answer on. FRG-0b and the flip in FRG-c wait
  for it.
- **Then, one at a time, the sight (mils) questions:** whether his
  squadron has its own tables for the manual jets, to use before the
  public manuals (asked once, not answered); whether he can drop a few
  F-5E bombs at cells of the real table to see if the module follows it;
  whether he can pull the F-4E bombing calculator's readings, the A-4E-C
  kneeboard pages and the current Mirage F1 manual from his DCS install.
- **To tell him, not ask:** the old 30/35 s frag rule stays as an
  off-by-default choice on the strike (his to veto).
- **His view of the F-16C 30° dive card, before and after** (on his
  phone), and of the fixed card once LBL is built.
- **Whether the roll reads** at the arrow's size in look 4, or the arrow
  should be bigger. **Look 5 is waiting for him on the main Mac.**
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
