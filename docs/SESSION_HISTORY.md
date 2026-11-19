# Session History Archive

Full session-by-session pickup notes for the DCS Attack Planner, archived here so `CLAUDE.md` stays short. Sessions are newest-first. `CLAUDE.md`'s own "Session Pickup Notes" section should hold only the current/latest session — when a session ends, move the outgoing notes here (prepend, since this file is newest-first) rather than letting them pile up in CLAUDE.md. Durable lessons and decisions that should shape future sessions regardless of when they happened belong in the memory system, not just here — check `~/.claude/projects/-Users-<user>-Projects-Phoenix-Weaponeer/memory/MEMORY.md` before assuming something here is the only record of it.

**Session:** 2026-11-19 UTC (Fable 5.2 on the main Mac): the last day of the
0.4.0 build, ending with the release. Moved here whole from `CLAUDE.md` when
0.4.0 was published (2026-11-19 20:50 UTC). Read it top to bottom as it was
written: the UPDATE paragraphs near the top are later than the "STATE 05:40"
text under them, and where they disagree the later one is right. After it
was written the sight fix was put off to 0.4.1, the icon and splash were
merged, and 0.4.0 was released; the pickup notes in `CLAUDE.md` say so.

### STATE 2026-11-19 05:40 UTC

**UPDATE 2026-11-19 19:30 UTC: what this block says below about two
branches and a second working copy is history.** The user looked at the
combined app and approved the look. The redesign, the playback and the About
dialog are merged to `main` (`5204fff`). The main Mac's checkout is on
`main`, and the working copy `.claude/worktrees/shell` is removed. The
branches `v040-shell` and `v040-playback-full` still exist on GitHub and are
no longer needed. New work goes on `main`, or on a short branch when it
changes what a card prints (the user looks first).

**The user's decisions of 2026-11-19:**
- **Work far lighter.** In force: the director writes the code itself, with
  no agent teams; new checks only where a wrong number could reach a card,
  or a hidden threat or private data could leak; the slow browser runs once,
  before the release; the size ceilings sit about 5% above the build; notes
  once per session; small choices of wording and layout are made and
  reported, not asked. Memory `feedback-work-lighter`.
- **The sight figures are a known issue in 0.4.0 and are fixed in 0.4.1**
  (his decision, 20:08 UTC, after seeing the built fix and its table of
  default moves). 0.4.0 ships with the sight line exactly as 0.3.4 prints
  it. The branch `v040-sight` is NOT merged for 0.4.0. The roadmap says so,
  and the 0.4.0 release notes must list it as a known issue.
- **No current F-5E manual is to hand:** when the sight fix goes in, the
  F-5E rests on the community pack and the planner's estimates, and the
  check against the current manual is pinned on the roadmap. Do not ask him
  for the manual again.
- **Icon and splash: approved by him and on `main`** (`ca1f7ab`, 20:09 UTC).
  His pictures are `ICON.jpeg` and `Splash.jpeg` in
  `Other Items/Artwork/v040/`. The icon set, the Mac tile, the tab icon, a
  splash in `index.html` that goes when loading ends (`src/lib/splash.ts`),
  `docs/ARTWORK.md`, and a metadata check on every picture
  (`scripts/art-check.ts`). The phone's offline-cache ceiling is 2,400,000.
  Windows and Linux get the navy square: a see-through emblem needs the same
  picture on white. **The splash stays up for a time set in Settings** (his
  spec, 20:13 UTC: default 2 seconds, any tenth from 0 to 10): ⚙ Settings →
  Loading splash; `splash_seconds` in `settings.rs`, `splashSeconds` in the
  browser's storage; the hold is in `src/lib/splash.ts`. The browser check
  scripts start the app with it at 0 (`scripts/no-splash.cjs`).
- **The once-before-release browser checks were run on 2026-11-19** (about
  20:13 to 20:35 UTC): the redesign's screenshot check 126 passes, the
  playback's 215 steps, and the five phone smoke scripts plus the main one
  at phone size, all clean; then the screenshot check and the smoke scripts
  again on the build with the splash setting. The smoke scripts need
  `require('playwright')`: a three-line shim over `playwright-core` in the
  scratch folder, run with `NODE_PATH`. Rust: core 160, desktop 40 and 2
  ignored. **0.4.0 is ready for "release 0.4.0"**: the release checklist's
  own gates, the privacy scan and the release notes are still to do then
  (known issue to list: the manual sight figures, fix in 0.4.1; and "open
  and save again any dive attack made before this version").
- **Ultracode, his policy:** never silently ignore it. If it is on and a job
  is better done directly, say so and ask him to turn it off; suggest it for
  several parallel builds (memory `feedback-work-lighter`).

**The sight fix for 0.4.1 is built on the branch `v040-sight` (pushed, three
commits on top of `main` as it stood at 19:33 UTC on 2026-11-19).** A build
of it is `Other Items/v040-builds/Sight look 1.app`. On the branch: the
tables' data (`crates/core/data/sight_tables.json`), the lookup
(`src/lib/sightTables.ts`, `airspeed.ts`), what prints
(`src/lib/sightSetting.ts`), the card's SIGHT line, the editor's key line
and a box under Customize for the pilot's own figure, the four sources in
About and the read-me, and a "Manual sight" section in
`docs/DELIVERY_PLANNING.md`. The eight fixed numbers are out of the bundled
profiles. geo-check 1,436, cargo core 160, both builds pass.
- **Not built, and his decision, to be put to him again for 0.4.1:** moving
  the default dives onto the tables' own settings. Without it most default
  cards say `SIGHT — no figure (outside table)`, and over a high target
  (Nevada) all of them do, because the defaults are in true airspeed and the
  tables in gauge speed. He was shown one before-and-after table and chose
  to put the whole fix off. The moves as recommended: F-5E 30° dive to release 5,000 ft at 450 on the gauge
  (118); F-5E 45° to 5,000 ft at 500 (49); F-5E Snakeyes start as the 500 ft
  laydown (185); A-4E-C 30° to 3,000 ft at 450 (40) and 45° to 4,000 ft at
  400 (40); a new Mirage F1 20° dive, 3,000 ft at 420 (185); the F-4E dives
  stay. A moved default needs a release speed held on the gauge
  (`releaseSpeed_kias` on the profile, turned into true airspeed at the
  target's height), rocket profiles that keep today's numbers, and the
  card's release label showing the gauge speed.
- **Left out and to be pinned on the roadmap at the merge:** the notice on
  opening an old save, the F-4E's own bombing calculator, the F-5E test
  drops.
- **Before it merges:** raise `baselineBytes` in `scripts/bundle-budget.json`
  to the built figure (start-up JS grew about 23 KB, the tables' data), run
  `scripts/shell-shots.cjs` once (its About check counts the list's
  entries), and add the roadmap's "Unreleased" entry.

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

**Playback, `v040-playback-full`, pushed tip `3e6f35a`, all of it
reviewed** (updated 2026-11-19 12:40 UTC). A strike flies every jet in 3D
over real terrain; times over target are dragged on lanes and applied back;
bombs fall, flash and show their blast ring; a Notes list and a Side view;
and the threats the planner may see are drawn in 3D, switched on and off by
system from Show, with early-warning radars on demand. A jet inside an
active envelope gets a white ring round its arrow and a label line naming
the threat; labels that would cover each other slide clear, with a thin line
back to their jet. The last commit: every target of a strike sets the ground
level, the sea stays flat beside a target that stands below sea level, and a
place with no elevation data says so. geo-check 1,128; 215 screenshot steps;
start-up JS 634,822 (ceiling 636,073).

**Redesign, `v040-shell`, pushed tip `0d43b0c`: the whole of 0.4.0 so far
in one branch** (updated 2026-11-19 13:50 UTC). It sits on top of the
playback's tip (the push of 2026-11-19 replaced the branch, as the user had
agreed), so it holds both the redesign and the playback. Every stage is
built and reviewed: the design foundation (`docs/DESIGN_SYSTEM.md` there is
the guide), the front page with its load box and recent-mission cards, the
flight chooser, the header with its File menu, the Flight overview, the
planner's icon rail and floating side panel, the map's Legend as a small
corner button, the phone's bars, tabs and sheet, a screenshot proof
(`scripts/shell-shots.cjs`), and an About dialog (last row of the File menu
and of the phone's Menu: version, licence, credits; the credits are data in
`src/components/about/credits.ts`). The size ceilings follow what is built.
On the tip: geo-check 1,425; the shell's screenshot run 126 checks and the
playback's 215 steps, all passing; cargo core 160, desktop 39 and 2 ignored.
Working copy on the main Mac: `.claude/worktrees/shell`. New work goes on
this branch.

**The About dialog's credits today:** the map data, the elevation data
(desktop only: the phone draws no heights, and the credit's words are the
size check's proof that the playback has not leaked into the phone build),
the two fonts, pydcs, Chuck's Guides. Left out on purpose: the pop-up
model's source (an open question to the user) and the sight sources (they
come with the sight figures). Two more may be owed and wait for the same
credits question: the A-4E-C community mod and the modules' own manuals.

**The user has a combined app to look at:** `Combined look 2.app` in
`Other Items/v040-builds/` on the main Mac, built from `9c2ec5b` (look 1 is
the same without About). **Nothing merges to `main` before he has looked.**
Asked of him first: whether the three-line labels and the white ring on a
jet inside an envelope are too busy. Still to show him there: the slid
labels with their thin lines; the white ring's size, which is a thick band
close up in Chase; the capital letters on the threat list's group headings;
the About dialog's wording; and the questions left open at "Shell look 4".
The list of judgement questions is §9.13 of the working paper
`Other Items/v040-work/b3/BUILD_SPEC_S9.md`.

**The pace, raised by the user on 2026-11-19:** the last stages took far
longer than earlier features. The cause was the process (agent teams with
repeated review rounds, the 17-minute screenshot run repeated per agent, a
deliberate break for every new check), not the 3D. A lighter way of working
was proposed to him and was waiting for his answer when this was written:
one builder per change, the director reads the diff and runs the fast
checks, one full screenshot run per batch, deliberate breaks only for checks
that guard hidden threats, numbers on a card and saved mission data, and the
full treatment only for the hidden-threat rule and the release. The About
dialog was built that way (the builder still showed each new check failing
once): 36 minutes of builder and about 15 of the director's.

**The sight groundwork was not started**, though it shows nothing: its
lookup must rank a module manual's table above a pack's, and how far a
manual's two printed points displace the pack's cells is still open until
the current F-5E manual is read.

**The phone web build needs its wasm file made fresh before any size figure
is trusted.** The tool that makes it (`wasm-bindgen`) is not installed on
the main Mac, and the generated wasm files there (git-ignored) can be older
than the Rust core. On 2026-11-19 that hid a real miss: built fresh, the
offline cache stood over a ceiling set from the old file (corrected in
`0d43b0c`; the whole `npm run build:web` and the shell's screenshot run pass
on the fresh build). The tool was put in the session's scratch folder, which
does not survive a restart: `cargo install wasm-bindgen-cli --version
0.2.129 --locked --root <scratch>/wasm-tools`, then run the build with that
folder's `bin` on the PATH. Do it again before 0.4.0 merges to `main`. The
`web-smoke*.cjs` scripts have not been run on 0.4.0 yet; they belong to the
release checks.

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
itself:** whether to work the lighter way; the look at the combined app; the
two current manuals; then the sight questions jet by jet; how to credit the
pop-up model's source; a small table of weapon numbers that would change (a
release floor and a speed warning among them).

### START OF NEXT SESSION

1. `git pull origin main`. The main Mac's checkout is on `main`.
2. `git status` must be clean; `git branch` shows any short branch with
   work the user has not looked at yet.
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

**Sessions:** 2026-11-14 to 2026-11-18 UTC (Fable 5.2 directing on the main
Mac; the 0.4.0 build). These notes piled up in `CLAUDE.md` over one long
session and were moved here whole on 2026-11-19, newest block first. Commit
hashes quoted in the older blocks are from before the 2026-11-18 history
rewrite.

### PAUSED 2026-11-18 09:45 UTC: READ THIS FIRST

The user had to log out, so the one running build was stopped cleanly, right
after its builder committed. **Where this block and anything below it
disagree, this block is right.** Both working copies are clean and
everything reviewed is pushed.

**Playback, `v040-playback-full`, pushed tip `02ba085`.** New since the
block below: the first half of the threat list, reviewed over two rounds.
Play hands the 3D view only the threats the planner may see (one the
mission's author hid never crosses unless it is revealed in Settings), and
the Notes list explains the threat symbols. geo-check 1,118; 200 screenshot
steps; start-up JS 634,822 (ceiling 636,073).

**One commit is on the main Mac only and NOT reviewed: `1904cc8`**, the
second half of the threat list (threats drawn in 3D, switched on and off by
system from Show, early-warning radars on demand). Do first: an independent
review of that one commit, with every new check seen failing once; fix what
it finds; then push. The review should hold it to three things the first
half's review left for it: the dev fixture's early-warning radar sits where
check TM4 has it; the screenshot check for a hidden threat's name can go
red; no build ships with the first half but not the second. Then the
director's proof stage and four small left-overs.

**Redesign, `v040-shell`, tip `5e82e5d` (pushed).** The last tidy stage is
in and reviewed (phone only: the tab bar, the sideways Layers panel, the Add
buttons, the Menu from the keyboard). No stage is open. Still to do: move
the branch onto the playback's final tip, bring the three ceilings down to
what is built and refresh the Budgets table in `docs/DESIGN_SYSTEM.md` in
the same commit, then build one combined app for the user to look at.

**Sight figures: three decisions from the user on 2026-11-18; nothing is
built.**
1. The app may carry the community kneeboard packs' figures.
2. Credits go in an About section of the app and in the read-me, **never on
   a kneeboard card**. The app has no About section, so one is to be built
   (opened from the File menu and from the phone's Menu). A card prints only
   the number, with "(est.)" when the planner worked it out.
3. **A DCS module's own manual always outranks a third-party document.** So
   the F-5E manual's own two bombing rows go in and win where they apply,
   and a pack only fills what a manual leaves out. Only old editions of the
   F-5E and Mirage F1 manuals have been read: the user was asked to copy the
   current ones from the DCS folder into `Other Items/Reference Docs/`. The
   question about moving the F-5E's default dives is withdrawn until they
   are read. A known snag: the F-5E manual's 30° row releases at 2,000 ft,
   and the app refuses a Mk-82 release under 3,000 ft (a seed floor with no
   source). That is its own question to the user, with a table.

The design paper's last two rulings (18.8.8 and 18.8.9) hold the detail.

**Waiting on the user, one at a time:** the two manuals; then the sight
questions jet by jet; the redesign's last look ("Shell look 4"); the two
"Sources" decisions in the block below.

**Owed by the next session:** these notes have piled up over a five-day
session. Move everything under this block to the top of
`docs/SESSION_HISTORY.md` and leave one short set of notes here, as "END OF
SESSION" above says.

### STATE 2026-11-18 07:45 UTC (superseded by the block above where they differ)

Work resumed on 2026-11-17 and was running. **Where this block and anything
below it disagree, this block is right.** Memory
(`project-v040-polish-and-playback`, `project-no-restricted-military-sources`,
`project-sight-mils-follow-customize`) has the detail and the run ids.

**History was rewritten on 2026-11-18, with the user's yes.** Two-day-old
notes and roadmap text that should never have been written were taken out of
the unreleased history of `main` and both work branches; only that text
changed, in the old commits that held it. Every commit hash on those three
lines from 2026-11-15 on is new, so **a clone made before 2026-11-18 must be
cloned again, never merged**, and hashes quoted in the older blocks below
are the old ones. Releases and their tags are untouched.

**Playback, `v040-playback-full`, tip `43a5920` (pushed).** On top of the
review fixes and the user's look ("good" to looks 6 and 7): a folded Notes
list under the picture (what the 3D assumed and could not show) and a Side
view button (the card's own side view of the watched jet, with the jet and
then its bomb moving on it), both reviewed, then a small ceiling raise.
geo-check 1,104; 200 screenshot steps; start-up JS 634,559 (ceiling
636,073). Running when this was written, in the main working copy: the
threat list in two stages (threats on and off by system; early-warning
radars on demand). Then the director's proof stage and a new look.

**Redesign, `v040-shell`, tip `cb8969d` (pushed). Every stage is built and
reviewed.** Working copy: `.claude/worktrees/shell`. In order: the design
foundation (`docs/DESIGN_SYSTEM.md` is the guide, now with a Shell section),
the front page with its load box and recent-mission cards, the flight
chooser, the header with its File menu, the Flight overview every load lands
on, the planner's icon rail with count badges and floating side panel, the
map's Legend as a small button in its bottom-left corner that is shut at
start (the user's own request), the phone's navy bars, icon tabs and sheet,
three small dialogs, and a screenshot proof (`scripts/shell-shots.cjs`).
Start-up JS 671,302 (ceiling 675,830); stylesheet 74,617 (76,695); offline
cache 1,756,154 (1,764,068). "Shell look 4" in `Other Items/v040-builds/` is
the whole redesign; the user has not looked at it yet.

Still to do on it: when the playback's threat list is in, move the branch
onto the playback's final tip (the director's job, checked commit by commit;
that push replaces the branch again), one last tidy stage of six small
left-overs (listed at the end of the redesign's working paper), bring the
three ceilings down to what is built, and put the whole thing in front of
the user before anything merges to `main`.

**Sources.** The user ruled that a real-world military manual carrying a
distribution restriction or an export-control notice is never a source here
(section "Sources" above), unless DCS's own documentation or a published
guide prints the same figure. An audit of every real-world document the
project cites is done (`Other Items/v040-work/sources-audit/`), the marked
ones are no longer named anywhere, and the history is clean (above). Still
needing the user's word: how to credit the pop-up model's source, and a
small table of weapon numbers that would change (a release floor and a
speed warning among them).

**Sight mils: designed, not built, waiting on the user.** He stopped a table
of mostly calculated figures: a known document's figure comes first, and the
planner's calculation only fills in between. He then supplied community
kneeboard packs made from test drops in the game. The design is redone on
them and reviewed (`Other Items/v040-work/b3/BUILD_SPEC_S18_SIGHT_TABLES.md`,
rulings in its last section; the S13 and S17 papers are no longer specs):
on a setting a document prints, the card prints that figure; between printed
settings, a figure worked from them and marked "est."; further out, "no
figure", and the pilot types their own. Today's eight fixed numbers trace to
no document and several are far off. He has the whole table and one
question: may the app carry the packs' figures, with credit? Then, one per
message: new attacks moved onto the documents' own settings, jet by jet
(F-5E dives, F-5E Snakeye laydown, A-4E-C dives, a new Mirage F1 20° dive),
and two offers (read the F-4E's in-game bombing calculator at six points;
fly a short F-5E test drop). It is built last, on top of the redesign, and
only what he has said yes to.

**Waiting on the user, one at a time:** the sight-figure questions above;
the two "Sources" decisions; two picture questions on the redesign (the look
of a main button that cannot be pressed; the playback's lettering); the
redesign's last look ("Shell look 4") with its open questions.

**Two build tracks share one Mac:** never run two browser-driven runs at
once. Each run is told to wait until no headless browser is running.

### PAUSED 2026-11-16 15:40 UTC (superseded by the block above)

The user had to move, so every run was stopped cleanly. **Where this block and
the older notes below disagree, this block is right.** Both working copies
were clean at the stop and everything built is pushed.

**`v040-playback-full`, tip `1bd89a1` (pushed).** On top of the notes below:
- Brought in from the side branches, each reviewed: hidden threats (`b5e7fc1`),
  the card labels (`a252a60`), the bomb's grey dashed line with the rule that
  only a jet in the planner's colours draws it (`51f10b9`; 183 screenshot
  steps). The five side branches and their working copies are deleted.
- Review fix REV-a (`e152a37`): reviewed and passed. **The director has not
  read its diff himself yet.**
- Review fix REV-b (`1bd89a1`): committed with its four gates green, **but the
  full screenshot run did not finish (it timed out twice on a loaded machine)
  and its third review was cut off by the pause. Do first: run
  `scripts/playback-shots.cjs` alone, then an independent review of that one
  commit.** REV-c (ground below sea level) is not started.
- Resume: the build script with run id `wf_dc972794-f25` (memory has the path
  and the arguments). Then build "Playback look 6.app" and show it.
- geo-check 1,087; start-up JS 634,537 (ceiling 635,049, so 512 bytes of room).

**`v040-shell`, tip `0b780db` (pushed): THE REDESIGN IS BEING BUILT.** A new
branch in a working copy of its own (`.claude/worktrees/shell` on the main
Mac, with its own `node_modules` and `src/generated/`), cut from `b5e7fc1`.
- The three build specs are written, reviewed and ruled on:
  `Other Items/v040-work/a2/BUILD_SPEC_R2.md` (section A2.8 holds rulings G1
  to G11 for all three), `a3/BUILD_SPEC_UI.md` (A3.8, at the end of the
  file), `a4/BUILD_SPEC.md` (A4.8).
- Built, in order: the front page's data layer, with every count of hidden
  threats taken out of it (`def0f7e`); the two fonts (`1bad96c`); colours and
  sizes as named values (`1993e23`); **the new lettering** (`de9a059`); the
  director's ceiling raise to 640,616 (`4e083b5`); **dark scrollbars,
  drop-downs and checkboxes, equal-width digits** (`1f0ebf4`); the shared
  button and icons (`9b2dc5b`); panel, card, chip and tabs (`a2f176b`);
  **the new dialog look** (`0b780db`).
- All reviewed and passed except the last: **the dialog look's second review
  was cut off by the pause: re-run it.** Then bring the ceiling down to the
  built figure plus 512 (it measured 639,092), move the branch onto the
  playback branch's tip, run the proof stage (S8) and build the first
  redesign copy for the user.
- One point the dialog review raised for the director, not ruled yet: with two
  dialogs open one Escape closes both, and focus is neither held inside a
  dialog nor returned to what opened it. It was so before the redesign.
- Resume: the redesign's build script (memory has the path; it takes a list
  of stages). The run that was stopped is `wf_caf0fb30-36b`.
- **Do not run the redesign's browser reviews while the playback's screenshot
  run is going:** that is what made the screenshot run time out.

**Sight mils: nothing built, and the data source is re-opened.** The user
decided on 2026-11-17 that a real-world military manual which carries a
distribution restriction or an export-control notice is never a source for
this public project: no number, no table, no figure worked from one, and it
is not named. The design in
`Other Items/v040-work/b3/BUILD_SPEC_S13_SIGHT_MILS.md` was written round
such a manual and is being redone on the game's own public documents (the
module's manual, a published guide) and the planner's own calculation.

**Waiting on the user, in this order, one at a time:** look 6 when it is
built (with the three calls he can overrule: only the watched jet draws a
bomb line; the blast ring shows through hills; the old spacing rule kept as a
choice); what the check of every other real-world source in the project
finds; the redesign's picture questions at its two looks.


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
  user's look, below). **Stages 0 to 15, stage 19 and eighteen stages from
  his looks (ATT-a, ATT-b, S10a, S10t, S10b, LN-k, BAL-0, BAL-a, BAL-b,
  S10d, LBL, FRG-0, FRG-a, FRG-b, FRG-0b, FRG-c, S10c, S10e) are built,
  reviewed and pushed, tip `0b30d05`** (2026-11-16 06:00 UTC).
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
  dev harness has a four-dive strike (`?fixture=dive4`). **On the
  kneeboard card a label box now sits at the nearest clear spot beside
  its marker, and the "→ STPT" edge note keeps off the north arrow.**
  **The frag warning now works by blast distance, and is switched on**:
  eight weapon rows carry a sourced blast radius (below), the strike
  editor and the playback warn only when a jet is inside a bomb's radius
  at the moment it goes off, every number is marked "(est.)", and the old
  30/35 s spacing rule is a "Warn by" choice on each strike, off unless
  picked (the phone shows a note and cannot switch). **A ring is drawn
  where each bomb lands at that bomb's blast radius**, with "blast radius
  250 ft (est.)" beside it; **an amber chip over the picture names a jet
  caught inside a blast**, at any speed; **the planner's words and the
  jets' labels keep off the bomb Chase is following and off the view's
  own buttons.** Gates at the
  tip: geo-check 1069/0, tsc, build with the bundle check, the web check,
  169 screenshot step passes (the reviewer's full run on S10e's commit),
  core 158 and desktop 34 + 2 ignored Rust tests (run at FRG-c).
  **The screenshot run takes 12 to 25 minutes** (the 3D is drawn in
  software): run it alone, in the background, with a long limit. It used
  to die on a busy Mac when a click or a screenshot passed the browser
  driver's 30 s; each page now allows 120 s (`e90a8af`), and the full run
  passed on a loaded machine. Start-up JS is 4,703 bytes over the
  0.3.4 baseline (634,632); the build fails past 5,120 (635,049). The
  ceiling was raised three times, each time in a commit of its own: for
  the attack list's Play buttons (`7400208`), for the dive's aim-off
  (`f3d1595`) and for the card's label placement (`c1ee4e3`); the last
  two are planner code. No builder may raise it: a stage that would
  pass it stops and reports.
  The main Mac's checkout is on this branch. **A build run of six stages
  was in hand when these notes were written (2026-11-16 06:05 UTC):
  MRG-HT, MRG-LBL2, S10u (three finished side branches brought in, next
  bullet), then REV-a, REV-b, REV-c (the fixes from a review of the whole
  branch, below). Their spec is section 14.8 of
  `BUILD_SPEC_S14_REVIEW.md` in the working folder**; a stage is
  one commit, and anything not pushed is not reviewed yet.
- **Three side branches, each finished, independently reviewed and
  pushed, waiting to be brought onto the playback branch by that run**
  (on the main Mac each is a second working copy under
  `.claude/worktrees/`; remove the copies and the branches once their
  content is on the playback branch):
  - `v040-hidden-threats` (`a5fea3c`): with nothing revealed in Settings
    the app says nothing about threats the mission author hid (below).
  - `v040-card-labels-2` (`7f60b8a`): the card's IP box points at its
    moved edge note; the side view's labels sit nearest their markers.
  - `v040-bombline-dashes` (`7b3bf38`): the bomb's line, as the user
    settled it over four looks (below). `v040-bombline-draft` and
    `v040-bombline-thin` are earlier looks of it, to delete.
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
     card's label placer, older than the dive change. **Stage LBL fixed
     them and is pushed** (ruling 11.8.12 of the ballistic paper is its
     spec, with what the director accepted and what he left for later at
     its end: a label box takes the nearest clear spot on its side, in
     `src/lib/labelLayout.ts`; the edge note keeps off the north arrow,
     the scale bar and the markers, in `src/lib/renderKneeboardCanvas.ts`;
     the side view keeps the old search). **The fixed card was sent to his
     phone**; every moved card, before and after, is in
     `Other Items/v040-work/b3/cards/lbl/`. Left for a follow-up: the IP
     box's leader still ends where the route leaves the frame, not at the
     moved note.
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
     numbers on file traces to a table.** Whether the DCS F-5E drops like
     the real jet is not known (a few bombs dropped in the game would
     settle it). The Mirage F1 module manual covers only 10° and 20°
     dives with the SAMP-250. Nothing for the F-4E (its module has a
     bombing calculator in the game) or the A-4E-C's dives. The paper's
     suggested order: first stop printing the fixed number once the
     attack is customized and give a box for the pilot's own figure; then
     a real lookup for the F-5E Mk-82; flagged estimates elsewhere.
     **He answered (2026-11-16): the squadron has no tables of its own;
     use public sources.** Papers in the working folder:
     `BUILD_SPEC_S13_SIGHT_MILS.md` (the design: the figure is worked out
     when shown and never stored; the pilot can type his own) and
     `DCS_BOMB_BALLISTICS.md` (what the game's own files say about each
     bomb's drag: the rule is not public; a reading of it fits recorded
     drops; slick bombs are within about 4% of our vacuum range,
     **retarded bombs are 32 to 46% shorter than our vacuum range**,
     which also affects today's laydown and low-angle high-drag
     attacks). **On 2026-11-17 he ruled out the real jet's weapons
     manual as a source** (the block at the head of these notes says
     why), so the design's data is being redone. Both this and the
     old-saves repair are open items in `ROADMAP.md` on the playback
     branch.
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
     paper writes up a test he can fly himself. **He chose
     (2026-11-16): "For blast radius do option 1."** Eight weapon rows
     get a radius, each marked "(est.)" and sourced as a community test:
     the three tested bombs (Mk-82 250 ft, Mk-83 250 ft, Mk-84 360 ft)
     and the five whose warhead in the game's files is the same (Mk-82
     AIR, Mk-82 Snakeye and GBU-38 at 250; Mk-83 AIR at 250; GBU-31 at
     360). Every other weapon says it has no blast radius on file and is
     not checked; his own DCS test can replace the numbers later. The
     table and the notes wording are in the frag paper's ruling 12.8.3.
     The frag paper covers
     the test by distance at
     the burst in the planner and the playback, stages FRG-a onward, and
     **S10c and stage 19 rewritten: a ring at the tested radius at the
     burst, no cloud that lasts 35 s**. The owner's decision is
     ruling 9.15.14 of `BUILD_SPEC_S9.md`; where the frag paper still asks
     what he has already answered, that ruling is the answer. **S10c and
     19 are not to be built as the impact paper has them.**
   - **His look at look 5, by video (2026-11-16).** He was away, so an
     85 s recording of the four-dive strike was made from the dev harness
     and sent to his phone (how: below). "That helps a lot" and "The rest
     looks pretty solid." **One change asked: the bomb's line.** "The
     bomb leaving the jet should start the line behind it as the bomb
     falls. But shouldn't appear before the bomb is dropped." The
     director's reading: the bomb's line is only the solid trace behind
     it from the release; the planned fall is no longer drawn as a dashed
     line before the release or ahead of the bomb. **He then settled its
     look in the real app, over three more rounds of app copies (he came
     home; no more recordings unless he asks):** "rather than a really
     thick solid line I think some sort of a lighter or dashed line might
     be better"; then "the dashed line but i want the dashes spread out
     more and dimmer. grey dashes maybe or black dashes"; then, of the
     grey copy, "I like the grey lines best but it's still drawing the
     line in front of the bomb.. remember the line follows the bomb but
     doesnt come ahead. check every attack type for this". What he saw
     there was an earlier jet's finished line left on the ground along
     the same attack path. **So the rule is: a bomb's only line is grey
     dashes (4 px on, 12 off, thin, no dark edge) from the release point
     to the bomb while it is in the air; nothing before the release,
     ahead of the bomb or after it lands, in every attack type.** Built
     and proven on `v040-bombline-dashes`: a check over every profile and
     weapon class (638 builds), and an independent hunt through 132
     pictures that found no counter-example. **One call of the
     director's to tell him at the next look (his to veto): only the jet
     being watched draws its bomb's line** (all jets with Show › Attack
     colours › All jets), because a lead's still-falling bomb drew
     dashes from beside the wingman's release point before the wingman
     had dropped. The app copies he compared are "Playback look 5A" to
     "5F" in `Other Items/v040-builds/`; 5F is the last.
   - **Two faults the recording showed are fixed (stage S10e):** words
     and labels now keep off the bomb Chase is following and off the
     view's own buttons.
   - **A review of the whole branch (2026-11-16), which he agreed to:**
     five reviewers, each finding then attacked by a second agent; twelve
     findings stand, none a crash or a loss of data. The director's
     rulings and the spec of the fixes are in `BUILD_SPEC_S14_REVIEW.md`.
     The ones that matter: an old saved 45° dive of the A-10C, AV-8B or
     A-4E printed an action point on its card that its picture no longer
     draws (the card will leave it out and say to open and save the
     attack; repairing the save itself is still the item he deferred); a
     flipped or re-anchored gun or rocket dive stored a heading about 17°
     off what the map draws; ground below sea level was drawn flat; From
     target could spin when a jet flew over its target. **On the
     roadmap, not built:** tidying the map-tile cache on disk; the card's
     push time, which counts the bomb's fall as a ground distance (about
     1.6 s early on the F-16 30° dive; with the loft's push time he
     parked).
   - **Recording a look for his phone.** The scripts are in the session's
     scratch folder (they do not survive a reboot; the method does): make
     a clean copy of the commit, serve the dev harness with Vite on its
     own port and cache folder, open `?fixture=dive4` in headless
     Chromium, pause, and for each video frame seek the clock, wait until
     the scene has drawn, and take a screenshot (every picture is a pure
     function of the clock's time and speed, so stepping gives what
     playing gives; real-time capture is useless at the 10 frames a
     second the software renderer manages). Cameras and menu choices are
     set with the page's own buttons. Encode with ffmpeg to H.264,
     yuv420p, 30 fps, faststart; captions go in a bar under the picture.
     Tell him it is the test page: flat test ground, two developer
     notices, and a Play button that reads "Play". The videos are in
     `Other Items/v040-builds/recordings/`.
   - **The order from here:** the run in hand (MRG-HT, MRG-LBL2, S10u,
     REV-a, REV-b, REV-c), then **build "Playback look 6.app" and tell
     him what is in it** (the frag warning by blast radius, the blast
     ring, the chip, the grey bomb line, the label fixes, hidden threats
     silent, the card labels, the review fixes) **and the three calls he
     can veto** (only the watched jet draws a bomb line; the blast ring
     is drawn through hills and over arrows; the old spacing rule kept as
     a choice), then 16, 17, 18a, 18b, 20. He looks again after 17 and
     18b as before.
   - **Working copies and agents: two lessons of this session.** (1) A
     command given as `npm --prefix <copy> exec -c '…'` runs in the
     shell's folder, not in the copy: give absolute paths (`vite build
     <copy> --config <copy>/vite.config.web.ts`); `npm --prefix <copy>
     run <script>` is fine; a second working copy has no
     `src/generated/` (git-ignored): copy it across for a web build. (2)
     An agent run launched while a message the user sent mid-turn was
     still unanswered took that message for its task: open each brief by
     saying whose task it is.
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
   geometry, and Chase watching the bomb land.** He saw it as a
   recording, then compared copies 5A to 5F for the bomb's line. A build
   of the main copy must not run while a stage is being built there: both
   write `dist/`; a side copy can be built at any time with
   `CARGO_TARGET_DIR` pointed at the main copy's `src-tauri/target`. The
   older questions below are still open. **To show him a page, name the
   local file and its folder: he cannot open claude.ai artifact links
   from Claude Code.**
3. **THE REDESIGN IS UNBLOCKED: his verdict on the second-round mockup
   (2026-11-16).** The mockups are `efb2.html` (desktop) and
   `efb2-phone.html` (iPhone) in `Other Items/v040-mockups/` (brief
   `BRIEF-V2.md`, facts `v2-facts.md`). His words. Of the planner screen,
   with a picture of the Legend panel floating beside the rail: "the
   legend on the planner is kind out near the middle and taking
   real-estate. other than that i'm ok with the design there for now."
   Of the Flight overview: "near threats have a waypoint and it shows the
   threats actually near that waypoint or covering that waypoint. have
   the map zoom to that area to show the threats. Rest is OK for now. we
   can always re-design later." Of the phone: "for phone, all good". The
   director's reading, told to him: **(1) the Legend is closed by default,
   one small button at the map's bottom-left corner, opening as a compact
   panel anchored there; (2) the overview's near-threats block is about
   one waypoint (the target by default) and the overview's map is framed
   on that waypoint and those threats.**
4. **The redesign's build specs were being written when these notes were
   written** (three writers, each reviewed and revised): the design
   foundation brought up to round 2 and the newer code
   (`Other Items/v040-work/a2/BUILD_SPEC_R2.md`, a delta on the existing
   prototyped `a2/BUILD_SPEC.md`), the front page with the import flow
   and the Flight overview (`a3/BUILD_SPEC_UI.md`, on the data layer
   already built as `v040-landing-data`), and the app shell with the
   legend (`a4/BUILD_SPEC.md`). A spec with no review record (its section
   x.7) was cut short. **The director rules on each (section x.8), then
   builds on a new branch `v040-shell` cut from the playback branch's
   tip, in a working copy of its own**; the first stages change nothing
   he sees; a copy goes in front of him in the real app before anything
   merges; the start-up size ceiling is the director's to raise, stage by
   stage.

**Waiting on the user:**
- **Ask him one thing at a time and show the thing itself** (the card's
  row as it would print, the map before and after), in plain words: he
  could not follow two of three questions sent together.
- **Nothing blocks the builds.** In the order to raise them:
- **Look 6**, when it is built, with the three calls he can veto (above).
- **The sight (mils) questions**, one at a time, once the design is
  redone on game-side sources: a short test in the DCS F-5E to learn how
  the module's bombs fall; whether the profiles' 450 kt is true or
  indicated; what the Mirage F1 manual in his install prints; readings
  off the F-4E's bombing calculator; what the A-4E-C and F-4E should
  show.
- **Whether to make retarded bombs fall by the game-data reading** (as an
  estimate), since today's vacuum range is 32 to 46% long for a Snakeye:
  told to him as a finding; he has not said when.
- **Told to him, his to veto:** the old 30/35 s frag rule stays as an
  off-by-default choice on the strike.
- **His view of the F-16C 30° dive card**: before, after and with the
  labels fixed, all on his phone; no comment yet.
- **Whether the roll reads** at the arrow's size, or the arrow should be
  bigger.
- **Hidden threats: DECIDED (2026-11-16, "Yes approved").** With nothing
  revealed in Settings › Admin the app says nothing about threats the
  mission author hid: the "Probable Threats — location unknown" block,
  the import preview's lines, the counts beside the Admin switches and
  the hidden count in an import's saved note are all gone, and a mission
  with everything hidden reads like one with none. Built on
  `v040-hidden-threats`; **the "Known Issues" paragraph above still
  describes the old count until that branch's edit of it reaches
  `main`.**
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

**Session:** 2026-11-14 UTC (Opus 5.5 on the main Mac). **v0.3.4
released and published, marked Latest** (2026-11-14T08:56Z):
https://github.com/DroptheHammer/Phoenix_weaponeer/releases/tag/v0.3.4.
It carries build Sessions 1–5: loft/LABS, 13 more bombs plus the cluster
and SAMP rows, bare-number rack counts, CLI/.miz loadouts, sourced weapon
numbers.
- Privacy scan clean (known false positives only; binaries and commit
  metadata clean). Gates: geo-check 718/0, core 154, desktop 24 + 1
  ignored, `npm run build`.
- Version bump `efd96fe`, tag `v0.3.4`. Release CI run **43576856227**
  green on all three platforms; all seven installers attached.
- Web app (GitHub Pages) publish run **43578151796** green (build and
  deploy). It was the first publish on the Node 24 actions
  (upload-pages-artifact@v5, deploy-pages@v5), and they worked. The live site
  was redeployed at 08:58 UTC.
- Release notes list known gaps: the Mk-82/Mk-84 seed floors versus the
  Dash-34 (roadmap audit), no F-4E gyro angle, no Harrier strafe.
- ROADMAP: "Unreleased" became "v0.3.4 — 2026-11-14", with loft added.
- Left open for later sessions: the 0.3.3 loadout screens on the iPhone; the
  CLI loadouts have never been looked at on screen; a real Android phone
  check (`docs/MOBILE_WEB_PLAN.md`); `docs/BUILD_SESSIONS_PLAN.md` is
  finished and can move to `docs/archive/`.

---

**Session:** 2026-11-13/14 UTC (Opus 5.5 orchestrating on the main Mac,
Sonnet 5.5 builders). **Session 5 (loft) shipped to `main`: all five planned
build sessions are done. Nothing released. `main` was v0.3.3 plus Sessions
1–5, unreleased (released as v0.3.4 the next session).** Gates at the last
code commit (`27908a6`): geo-check 718/0, core 154, desktop 24 + 1 ignored,
`npm run build`. Pages run 43576259468 green on `c97d8da`.

**What was built** (sources and decisions: `docs/DELIVERY_PLANNING.md`,
"Loft and LABS"; memory `project-loft-geometry`):
- `e33e899` **The sourced loft model** (`src/lib/loftPlanning.ts`): a 4 G pull
  built over 2 s, the climb trading speed for height, release at the loft
  angle, and the bomb with one drag constant fitted to the public USAF F-4
  weapons delivery manual's loft table (T.O. 1F-4C-34-1-1 Fig 5-9, M117).
  All 13 rows are geo-check tests (range within 0.6%, range peak at 42°);
  Heatblur's DCS Mk-82 example lands within 1%. A vacuum bomb lands 10–24%
  long, so lofts can't use the pop-up's. Pull-up range and release
  altitude are derived; the profiles' old unsourced numbers are gone.
- `27908a6` **Picture, side view, editor (`LoftForm.tsx`), card, checks and
  strikes.** The F-4E pull-up timer is in the card header ("TIMER nn.n s · set
  before IP"), from the live IP. `c97d8da`: roadmap and plan updated.
- **Decided by the user:** a loft runs straight from the IP (custom IP picks
  another axis; no straight-in warning); lofts skip the release floors and
  get a **warning** inside 0.5 nm of the target at bomb impact, plus one when
  the IP is inside the pull-up range.
- **On screen, checked by the user, no issues:** F-16 loft map picture, side
  view, editor knobs, F-4E LABS card header.
- **New on the roadmap (optional):** smooth side-view bomb arc; per-weapon
  drag; the F-4E gyro (pitch) angle, about 6–8° above the planned
  flight-path angle. `docs/BUILD_SESSIONS_PLAN.md` is finished and can move
  to `docs/archive/`.
- Lesson: research agents can litter the repo root (this session left four
  copies of the F-16 handbook's text there). Check `git status` before
  committing.

---

**Session:** 2026-11-13 UTC (Opus 5.5 orchestrating on the main Mac,
Sonnet 5.5 builders). **Four of the five planned build sessions shipped to
`main`; nothing released. `main` is v0.3.3 plus all of it, unreleased.**
Gates at the last commit (`2490b84`): geo-check 618/0, core 153, desktop
24 + 1 ignored, `npm run build`. Pages runs green through `0532f23`
(`2490b84` was still running at the end — check it).

**What was built** (plans and status in `docs/BUILD_SESSIONS_PLAN.md`):
- `1c64857` **Session 1, 13 more bomb rows** (Mk-81 and Snakeye, Mk-83 and
  AIR, BR-250, BR-500, BLU-107 Durandal, CBU-103, CBU-105, BL-755, CBU-1/A,
  CBU-2/A, CBU-2B/A), carriage from pydcs `5ddcc63` and the A-4E-C mod.
  **The Durandal is offered level profiles only** (user's call:
  `LEVEL_ONLY_WEAPON_IDS` in `src/lib/weaponClass.ts`, pinned in Rust and
  geo-check), because the F1/F-15E high-drag default is a dive. "Mk-82
  SnakeEye" now loads as the Snakeye. The tests' "no row" example is now the
  AGM-45 Shrike.
- `9428a2d` **Session 2, bare-number rack counts:** trailing `* N`, a leading
  `N`, `MAK79 N`, a trailing `x N`. Checked over all 1,847 pydcs/A-4E-C names
  (86 changed, all reviewed). The F1's "Snakeyes" and "Mk-84 AIR * 2" no
  longer load as slick bombs.
- `0532f23` **Session 3, CLI/.miz loadouts:** `scripts/gen-clsids.mjs`
  generates `crates/core/src/parsers/clsid_data.rs` (2,290 CLSID → name,
  pydcs `5ddcc63` + A-4E-C mod `34c1ef4`, ~30 KB gzipped in the web app). The
  private NTTR CLI file's F-4Es arrive with Mk-82/CBU-87 + Shrikes.
- `2490b84` **Session 4, weapon numbers,** every value approved by the user
  in a table and cited in `notes`: weights for all 26 formerly name-only rows;
  **Mk-83 frag floor 1,300 ft** (public USAF F-4 Dash-34); Durandal
  250 ft / 620 KCAS; CBU-105 200–20,000 ft / 650 kt; CBU-103 max 40,000 ft.
  The 1,380 ft Rockeye ceiling was **rejected**: a floor blocks saving
  (memory `project-weapon-number-sources`).

**On-screen checks:** cluster/SAMP rows and real-link loadouts passed on the
desktop. Session 1's new rows were simulated against the app's own code (the
user asked for that instead of looking) and the Durandal dive problem was
found that way. The CLI loadouts have not been looked at on screen. **iPhone
loadout check pinned** (no phone to hand).

**Decided, don't re-raise:** target "Elev" is the waypoint's altitude, by
design; authors zero target waypoints (memory
`project-target-elevation-from-zeroed-waypoints`).

**New on the roadmap:** rocket-pod import gaps (illumination Hydras load as
HE, colon-style rack names count pods, ORO-57K); counts glued to the name
(`2xGBU-12`); floors for the 22 bomb/cluster rows still without one; **audit
the seed rows** (public Dash-34 gives Mk-82 ~1,100 ft and Mk-84 ~1,700 ft
level release vs the seed's 3,000/4,500).

*Next-session list at the time:* build Session 5 (loft) — done 2026-11-14,
see above; the 0.3.3 iPhone loadout check; releasing 0.3.4; a real Android
phone check; never `cd` into a subfolder; `git push`/`gh` outside the
sandbox; look-and-feel in the real app first; "simulate" means running the
app's own functions on real data.

---

**Session:** 2026-10-03 UTC (Opus 5.5 orchestrating on the main Mac,
Sonnet 5.5 builders). **Nothing released. `main` is v0.3.3 plus the cluster
and SAMP bombs, unreleased.** Gates at the last code commit: geo-check 585,
core 130, desktop 24 + 1 ignored, `npm run build`; Pages run 37099334769
green.

**The user's on-screen checks:**
- **0.3.3 loadout screens passed on the desktop**, with
  `test-data/nevada_SYNTHETIC_loaded_jets.json`: the import preview's Loadouts
  list, the roster, the pre-picked weapon and Show all weapons. Still open:
  long loadouts from a real link, and the iPhone.
- **The 0.3.2 in-use check is closed.** The iPhone carousel at 3×, the larger
  card text, the amber SIGHT header, the Copy menu and the waypoint list were
  all reported fine.

**What was built:**
- `9bc1aad` **Nine name-only weapon rows:** Mk-20 Rockeye, CBU-99, CBU-52B,
  BLG-66 Belouga, SAMP-125/250/400 LD and SAMP-250/400 HD, mapped to the
  aircraft that carry them. `KNOWN_CLASS_GAPS` (`crates/core/src/profiles.rs`)
  is now empty: every aircraft carries a weapon for each of its profiles. No
  numbers were invented, so these carry the "no data on file" caution.
  Carriage came from the DCS pylon tables in the public pydcs library and the
  A-4E-C mod's aircraft file (memory `reference-pydcs-weapon-tables`).
- `9523a09` **Link import knows those stores and counts racks.** A count
  straight before the weapon's name (`- 3 x Mk-20`, `2x CBU-52B`) is read,
  for every bomb and missile. A bare number never is, so the F-14's
  `MAK79 2 MK-20` loads as one. The low-drag and high-drag SAMP rules share a
  pattern and the name's drag words pick between them
  (`crates/core/src/parsers/store_mapping.rs`).
- The synthetic loaded-jets file changed: Venom 1-3's Rockeyes are a known
  weapon, and it carries one BL-755, which has no row.
- `docs/LOADOUT_IMPORT_PLAN.md` has a "Follow-up (2026-10-03)" section.

**Not run:** `scripts/web-smoke.cjs` and `web-smoke-cards.cjs` (no wasm
toolchain or Playwright on the main Mac, by the user's choice).

**Session:** 2026-10-02/03 UTC (Opus 5.5 orchestrating on the main Mac,
Sonnet 5.5 builders). **v0.3.3 released and published as Latest** on
2026-10-03: "Jets arrive loaded" and the white-flash fix. Release run
37096299835 (all 3 platforms, all 7 installers), web app published by Pages
run 37096813977. Privacy scan clean (known false positives only). Rollback tag
`pre-loadout-import` marks the tree before the loadout work. After the
release, `9c37c10` moved both workflows to actions that run on Node 24
(checkout/setup-node v7, upload-pages-artifact/deploy-pages v5) and the
release build to Node 22. A throwaway tag `v0.3.3-test1` (run 37097265237)
built all 7 installers with no Node 20 warning, and was deleted. The web
app's upload and publish steps only run on a release, so they are first
exercised at the next one (or a hand-started "Run workflow").

**What was built** (gates at the last commit: geo-check 585, core 126,
desktop 24 + 1 ignored, `npm run build`; Pages run 36973465158 green):
- `bb2cfa5` **White flash fixed.** The user confirmed a plain 0.3.2 build
  flashed too, so it was never the icon. Dark window colour in
  `tauri.conf.json` plus an inline dark `html` background in `index.html`.
  The user checked it in the Mac app.
- `97ac6a6` **Slice 1:** a link import keeps each jet's store names and maps
  them to weapons (`crates/core/src/parsers/store_mapping.rs`). 38 jets in the
  four private links arrive loaded, as the design predicted.
- `b19c625` **Slice 2:** bomb and missile lists for all ten aircraft (130
  `aircraft_weapons` rows), four name-only weapon rows (GBU-16, AGM-65F,
  AGM-122, GAU-12 pod) and a "no data on file" caution for them.
- `187f3b5` **Slice 3:** the import fills each pilot's loadout
  (`LoadoutItem.weaponId`), auto-build picks a carried weapon, the import
  preview and roster show the stores.
- `f343a06` **Slice 4:** each aircraft is offered its own weapons, with a
  **Show all weapons** checkbox in the attack editor and the loadout editor.
- The design doc has an "As built" section: `docs/LOADOUT_IMPORT_PLAN.md`.

**Released before the user reported on screen:** the Loadouts list in the
import preview, the roster's store lines, the pre-picked weapon, and the Show
all weapons checkbox. (The user checked them on the desktop in the next
session, 2026-10-03, and all passed.)

**Not run:** `scripts/web-smoke.cjs` and `web-smoke-cards.cjs`. They need the
wasm toolchain and Playwright, which the user declined to install on the main
Mac. A read of both says the new weapon list does not change what they pick.

**0.3.2 in use at that point:** the user had reported 3× cards in DCS and the
Lighting dropdown as fine (2026-10-01). The iPhone carousel at 3×, the amber
SIGHT header, the Copy menu and the waypoint list were still open (all
reported fine in the next session).

---

**Session:** 2026-09-30 UTC, late (Opus 5.5 orchestrating on the main Mac,
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

**The white flash was not diagnosed** in that session (it was fixed in the
next one, 2026-10-02, `bb2cfa5`: it was never the icon). What was known then:
- `b2785a1` changed only icon files, the browser-tab icon link and the phone
  icon paths. Nothing in it touches how the window opens.
- The window had no background colour set, and the page's dark background
  came from the CSS file. So any build could show white before the first
  paint, and a freshly built app starts slower than an installed one.
- The splash build had set the window background dark and painted dark from
  the first HTML. The user saw that build just before, and reported no flash.

**Still open from the 0.3.2 release at that point:** 3× cards in DCS, the
iPhone carousel at 3×, the Lighting dropdown, the header sight, the Copy menu,
the waypoint list.

---

**Session:** 2026-09-30 UTC (Opus 5.5 orchestrating on the main Mac,
Sonnet 5.5 builders). **v0.3.2 released and published as Latest**:
release run 36817925144 (all 3 platforms, all 7 installers), web app published
by Pages run 36818732172. Privacy scan clean (known false positives only).

**What went into 0.3.2 this session** (all gates green at the tag: geo-check
479, core 102, desktop 24 + 1 ignored, `npm run build`):
- `6029078` **Larger card text**, by squadron vote: every font +2 px, the
  layout grown to fit, "→ STPT"/"#1" on plates, ROLL fits its disc, the
  elevation in whole feet. The mockup page that won the vote is in
  `Other Items/card-themes/large-text/`. Memory `project-card-text-size`.
- `5461b91` **Night (N5a) and NVG (G5a) themes** in `src/lib/cardTheme.ts`.
  geo-check enforces the family rules and AA contrast in protan and deutan
  vision (`src/lib/cardContrast.ts`). The margins are thin on purpose.
- `7809d8e` **Lighting dropdown** (Day / Night / NVG) on the Cards panel,
  desktop and phone, saved with the mission as `cardLighting`. In Rust it is an
  enum where an unknown value loads as Day. Memory `project-night-nvg-kneeboards`.
- `4bca21d` **Cards export at 3×, 2304×3072.** The user found 1× soft in DCS.
  The layout stays in 768×1024 units under one transform. The map is one zoom
  level finer, never two. Still lossless PNG, 1–2.5 MB per card.

**Not yet verified, and worth asking the user about:**
- How DCS shows a 2304×3072 card. It was built without a DCS test, by choice.
- iPhone memory in the cards carousel at 3×.
- The attack editor's side view in the phone's 150 px strip.
- The user ran the release without reporting the on-screen check item by item:
  the Lighting dropdown, the header sight, the Copy menu, the waypoint list.
  Ask whether anything looked off.

**Process notes:**
- I `cd`'d once into `Other Items/.../png`. The harness made a `.claude/.cc-writes`
  folder there (empty; removed).
- No project "run" skill exists. Building the phone web app locally needs the
  wasm toolchain, which the user declined to install this session.

---

**Session:** 2026-09-29 UTC, later (Opus 5.5 orchestrating on the main Mac,
with Sonnet 5.5 builders and Opus 5.5 agents for the audit and the palette
design). Nothing was released. **0.3.2 then waited for the squadron's vote on
the Night and NVG cards** (it came in on 2026-09-30: N5a and G5a).

**Pushed to `main`, all gates green:** geo-check 402, core 100, desktop 24
(+1 ignored), `npm run build`, and Pages runs 36586140247 and 36599807219.
- `048bd5f` **The sight setting fix.** No manual-dive card had printed its
  sight mils in any release since 0.2.0: Rust `SightSetting` had
  `rename_all = "camelCase"` and silently dropped `depression_mils`. It is now
  snake_case, with `deny_unknown_fields` and an alias. New Rust tests go
  through the real loader, and all four fail when the bug is put back.
- `d4c4a6a` **The user's three changes** after the on-screen check (all four
  quick wins passed):
  - the sight moved into the card header after the delivery mode ("· SIGHT
    100 mils · set before IP", in amber) and into the editor's key numbers;
  - Copy to… became a compact **Copy** button with a pop-up menu;
  - imported waypoints are fixed: no delete, and the store has no waypoint
    actions at all.
- `0a3d260` **Card theme groundwork.** Every card colour comes from a
  `CardTheme` (`src/lib/cardTheme.ts`). `DAY_THEME` draws byte for byte as
  before, pinned by draw-call hashes in geo-check. Dark themes tint the map
  tiles with blend modes, with a wash as a fallback.
- **Checked but not committed:**
  - A throwaway installer run, `v0.3.2-test1` (run 36532321132), passed on all
    three platforms. All 7 installers came out, about half 0.3.1's size. The
    draft and the tag are deleted.
  - The privacy scan came back clean (known false positives only).

**Night and NVG cards:**
- **Round 1 was superseded.** N1–N3 and G1–G3, each in flavours a and b. The
  user then asked for WCAG 2.1 AA, and relaxed it to "closer to the standard",
  with colour-blind squad members the real concern (memory
  `project-card-accessibility-cvd`). The audit scored Day 67%, G1 and G2 about
  90%, N1 about 78% and N3 about 5%.
- **Round 2** had four palettes: **N4** (N1 brought up to the standard), **N5**
  (the dimmest red a red-blind pilot can read), **G4** (G1 brought up to the
  standard) and **G5** (the dimmest green). Each came as **a** (today's attack
  colours) and **b** (the family colour, stages told apart by dash and width).
  99% of checks passed; the only failures were two labels printed across a line.
- **The squad vote package** is in `Other Items/card-themes/squad-upload/`
  (page, test zip, `discord-post.md` with two Sesh `/poll` commands).
- **Exploration files, main Mac only,** in git-ignored `Other Items/card-themes/`:
  `src/themes-aa.ts`, `wcag.sh` + `src/wcag.ts`, `png-aa/`, `wcag/`,
  `wcag-aa-verify/`, and the `poll/` page and zip pipeline.
- **Decided:** the Day card's colours stay as they are. Accessibility for Day is
  parked for a far-future UI/UX overhaul (`ROADMAP.md`).

**Designed, not built:** "Jets arrive loaded" for 0.3.3
(`docs/LOADOUT_IMPORT_PLAN.md`).

**Process notes:** two builders slipped with `cd` (no stray `.claude` folder);
one `git push` failed with no reason given and the retry went through.

**Next steps as written then:** get the vote result; build the two winners,
the Day/Night/NVG dropdown saved with the mission, the contrast and family-rule
tests, and the three small fixes ("→ STPT 2"/"#1" across a line, elevation
rounding, ROLL past its disc); user on-screen check; release 0.3.2; then
"Jets arrive loaded".

---

**Session:** 2026-09-29 UTC, early (Sonnet 5.5, main Mac). Read-only research on
every open `ROADMAP.md` item, then the four quick, low-risk wins were built.
They are on `main` and **unreleased**:
- **Open profiles folder** button in ⚙ Settings (desktop only).
- **Undo / redo** for mission edits: ⌘/Ctrl+Z, ⇧⌘/Ctrl+Z or Ctrl+Y. History lives
  in `missionStore` (`src/lib/missionHistory.ts`); typing in one field is one step;
  50 steps; undoing back to the saved mission clears the unsaved dot. Ignored in a
  text box or while a dialog (the attack editor) is open.
- **📦 Brief Pack (.zip)** on the Cards panel: `Kneeboard/<DCS folder>/…png`, the
  mission file (hidden threats left out, like the cards) and a README. The zip is a
  small stored-only writer, `src/lib/zip.ts`, **not `fflate`** (PNGs don't compress,
  and it avoids a dependency). Desktop command `save_brief_pack` is locked to `.zip`.
- **Copy to…** on each attack in the Attack Plan (`src/lib/copyAttack.ts`): a plain
  attack for the other pilot. Same aircraft type keeps hand edits; another type is
  rebuilt by auto-build and keeps the target, IP, flank and weapon.
- **Checks:** geo-check passes (new undo, brief-pack and copy cases; mutation-tested
  where it mattered), core 96, desktop 24, `npm run build`. **Not run:**
  `npm run build:web` (the phone build), and **nothing was checked on screen.**
- **Still to check on screen (user):** the Settings button opens the folder; edit a
  waypoint then ⌘Z / ⇧⌘Z; export a Brief Pack, unzip it, check the layout; copy an
  attack to an F-16 wingman and to a different-type jet. (All four passed in the
  next session.)
- **Gaps left on purpose:** no undo/redo toolbar buttons (so none on the phone);
  the Brief Pack button is not on the phone layout; strikes are not copied as a group.
- **Release decision: not cutting 0.3.2 yet.** The user wants more features folded
  in first, so hold the release until then. `release.yml` lost its sqlite step and
  hasn't run since; before or at the next release, consider a throwaway
  `vX.Y.Z-test1` tag run (draft only, delete it after; memory
  `project-cross-platform-installer-ci-fixed`).
- **Roadmap corrections found while researching** (also fixed in `ROADMAP.md`):
  rocket sight numbers are missing only for the F-4E manual-dive profiles (the A-4E,
  Mirage F1 and F-5E carry Mk-82 sight values, and auto-build applies them to bombs
  only, on purpose); the FragOrders link already carries loadout store *names*, so
  only the CLI/.miz path needs a CLSID table; the weapon-table work and the
  loadout import depend on each other.
- **Process slip:** I once rewrote `missionStore.ts` with a Python script, which
  broke it (reverted, redone with Edit), and appended two test blocks with `cat >>`.
  Use Edit/Write only (memory `feedback-commands-that-dont-prompt`).
- The 2026-09-26 notes (phone web app live, the desktop click-through, the privacy
  restamp) are just below. The phone web app is LIVE at
  https://dropthehammer.github.io/Phoenix_weaponeer/ and follows the desktop app
  (memory `project-phone-web-app-pages`). Still open: a real Android phone check.

Its "start of next session" list: pull (re-clone anything older than
2026-09-23); check the Pages run; what's next from `ROADMAP.md` cross-checked
against the code (weapon-data cluster, loft, map-first, the projections that need
the maps); candidates for the next release were undo/redo buttons and a Brief Pack
button for the phone layout; never `cd` into a subfolder.

---

**Session:** 2026-09-26 UTC, afternoon (Opus 5.5, main Mac). It brought the
cloud session's phone web app work home and checked it. The cloud session's notes
are just below.
**The phone web app is LIVE: https://dropthehammer.github.io/Phoenix_weaponeer/**
**It now follows the desktop app** (memory `project-phone-web-app-pages`):
- every push to `main` builds it as a check;
- publishing a release publishes it;
- "Run workflow" publishes a fix in between.

The `github-pages` environment was changed to allow `v*` tags to deploy.

- **Privacy:**
  - The full-history scan is clean. Only the known false positives remain.
  - The two phone PR merges (#2, #3) were stamped with the user's local time zone.
    The user chose to restamp them. Those commits and the two between them were
    rebuilt to UTC, with trees identical and the cloud commits' IDs and signatures
    kept. `main` was force-pushed and is now `cad16ff`.
  - PR #2/#3 pages may still link the old IDs.
  - The local privacy scan now flags non-UTC dates.
- **Checks on this Mac, with the private missions present:**
  - geo-check: 320 passed.
  - Rust tests: core 96 and desktop 21 (+1 ignored) passed, with zero private-fixture
    skips.
  - `npm run build` is clean.
- **Pure-Rust projection vs the old PROJ library:** the largest difference is
  0.02 mm across all 12 projected theaters, 2,401 points each. The throwaway check
  lived in the scratchpad and is not in the repo.
- **Cleanup:**
  - All seven `claude/mobile-app-distribution-*` branches were deleted from GitHub.
  - Memory was updated with the Pages, cloud-limits and option-branch lessons.
  - The obsolete proj-brew memory was dropped.
- **Desktop click-through: PASSED.** The user checked it on screen on 2026-09-26, running
  `npm run tauri dev` after the `crates/core` move. The list was:
  - open a recent mission;
  - import a FragOrders link;
  - check that threats show and hidden ones stay hidden;
  - build an attack and open Customize;
  - check a multi-ship strike;
  - export cards to the DCS folder;
  - open Settings.

  **The desktop app was clear for the next release.** `npm ci` was also run on this Mac.
- **Still open then:**
  - A real Android phone check. The iPhone check on the live site PASSED (user,
    2026-09-26), and so did a FragOrders link import on the live site. It works
    straight from the browser, so **no Cloudflare proxy is needed**.
  - Optional: `brew uninstall proj cmake pkgconf`. They're no longer needed.
- **No v0.3.2 for now** (the user agreed). Nothing desktop users would notice had
  changed since 0.3.1, so the next release waits for a real desktop change.
  `release.yml` lost its sqlite step and hadn't run since. Before or at the next
  release, consider a throwaway `vX.Y.Z-test1` tag run: draft only, delete it after
  (memory `project-cross-platform-installer-ci-fixed`).

**Session:** 2026-09-26 UTC, midday (Opus 5.5, cloud session; the user
went overnight, then worked from their phone only).
**The phone web app is LIVE: https://dropthehammer.github.io/Phoenix_weaponeer/**

- **What was built** (the plan and a full handoff log are in `docs/MOBILE_WEB_PLAN.md`):
  - Pure-Rust transverse Mercator in place of PROJ.
  - The `crates/core` and `crates/wasm` split, with SQLite replaced by built-in reference data.
  - The `@platform` layer, choosing desktop or web.
  - The phone UI: map, bottom tabs and sheet, crosshair picking, the phone attack
    editor, the cards carousel, Share all, kneeboard mode, autosave with My missions.
  - "Strike near me", a GPS Easter egg that is web only.
  - `pages.yml`, plus a privacy check on the published files.
- **Overnight decisions:** 3 options were built per decision on branches, then
  walked through with the user on a plain-language page. The picks were **1A 2B 3A**:
  - Strike near me stays phone/web only.
  - The Cards tab opens at full height.
  - The sideways attack editor shows the map beside the settings.
- **Shipped:**
  - PR #2 merged into `main`, first as `cceebab`. It was restamped to UTC as `e3325b6`
    in the next session.
  - The user set Pages Source to GitHub Actions and started `pages.yml` from their phone.
  - Run 36255418555 was green. The site is public.
- **Republishing the site:** merge to `main`, then Actions → "Web app (GitHub
  Pages)" → Run workflow. It is started by hand only; whether to publish on each
  release tag is undecided. A desktop release does NOT update the site.
- **What this cloud session could not do:** start a workflow (403), delete remote
  branches (403), open github.io or the FragOrders CloudFront host, or reach the Mac
  memory folder.
- **Left open:** a real-iPhone check, a FragOrders link import from the live site
  (CloudFront CORS), a desktop click-through, and the six leftover option branches.

**Session:** 2026-09-26 UTC, morning (Opus 5.5, user at the screen).
**Released v0.3.1** — first outside bug report fixed, plus a to-do sweep.

- **GitHub issue #1** (from an outside user): the FragOrders share button
  gives `http://` links and the importer took only `https://`. Fixed in
  `fragorders_link.rs` (only the id is used; every fetch stays HTTPS);
  checked on screen by the user with several links. The issue closed itself
  on push. A reply pointing at v0.3.1 was posted on the issue with the
  user's approval.
- **Shipped in 0.3.1:**
  - Quit button in the header.
  - **Strike lead = jet first on target**: `strikeMembers` sorts by TOT
    offset, then flight position. The test found a worse bug too: after a
    pilot swap, removing a jet shifted every TOT by 30 s.
  - Card "Map background" switch remembered (`settings.json` `kneeboardMap`,
    default on).
  - Recent missions on the front page (last 8; `settings.json`
    `recentMissions`; `load_mission` says "moved or deleted" — that exact
    text is shared with `missionFile.ts` and pinned by a Rust test).
  - **Strafe and rockets reachable** — DB v4: 4 guns + 4 rocket types,
    names checked by the user, mapped per aircraft in `aircraft_weapons`
    (`Weapon.carried_by`); picker `weaponChoicesFor`; rocket passes drop the
    Mk-82 sight; cards say "Fire by" / "gun/rocket attack". New Rust test:
    every weapon class a profile needs has a weapon.
- **Docs:** `ROADMAP.md` rewritten as the ONE to-do list (open / in progress /
  shipped by release / decided-not-doing). BUGFIX_PLAN, REVIEW_0.2.1,
  REVAMP_PLAN, ARCHITECTURE moved to `docs/archive/`. 14 unused root scripts
  deleted. Decided: wingman tracks stay clipped on the card (memory
  `closed-decisions-do-not-reopen`).
- **Release:** gates 312 geo-checks / 106 Rust tests / build clean; privacy
  scan clean (known false positives only); bump `5dbd2c6`, tag `v0.3.1`,
  CI run 36221932870 green on all three; 7 installers; Mac/Linux/`.msi`
  unpacked and scanned clean. Published as Latest 2026-09-26 06:02 UTC;
  logged-out download 200.
- **Not done:** the user did not confirm the full on-screen checklist for
  recent missions / map switch / jet order / strafe before asking to
  release. If a squadron member reports a problem there, start there.

---

**Last session:** 2026-09-23 → 24 UTC (Opus 5.5, user at the screen).
**Released v0.3.0.** No code changes beyond the version bump.

- **Pre-release checks:** gates passed (301 geo-checks; 100 Rust tests +
  1 ignored; `npm run build` clean, with the private fixtures present).
  A full-history privacy scan came back clean: every git object, commit
  metadata (DroptheHammer / Claude / GitHub only, all UTC), and PNG and icon
  metadata. The scripts are in git-ignored `Other Items/privacy-scan/`
  (memory `reference-privacy-scan-scripts`). They hold the strings they
  search for, so never commit them.
- **Release:** bump commit `c56c227`, tag `v0.3.0`, CI run 35939977522 green
  on all three platforms. All 7 installers are attached. This was the first
  release built from the public repo, and Actions worked with no setup. The
  unpacked Mac, Linux and `.msi` installers scanned clean. Harmless hits:
  `/Users/runner` (the CI machine), PROJ's "Hammer–Aitoff" projection, and
  third-party library credits. Published as Latest on 2026-09-24 01:08 UTC;
  a logged-out download returns 200.

Its "start of next session" list: pull / re-clone on other machines; the user
still has to delete the throwaway repos `-discard2` / `-discard3`; the two
multi-ship rough edges (jet re-sort, wingman tracks vs. card frame — both
settled in the 2026-09-26 session); loft and PDF unbuilt; Channel, Kola,
Afghanistan and Windows export unverified.

**Last session:** 2026-09-23, evening (Opus 5.5, user at the screen). **No
feature work: made the project public and scrubbed it of personal data.** An
end user had reported a 404 on the v0.2.3 download: the repo was private.

What changed:

- **License:** PolyForm Strict 1.0.0, copyright "DroptheHammer" (`LICENSE`,
  new `README.md`, license fields in `package.json`, `Cargo.toml` and the
  installer config). Free for noncommercial use and for reading the source;
  no commercial use, modification or redistribution without permission.
- **Repo split:** the original private repo is now
  `DroptheHammer/Phoenix_weaponeer-archive` (full, unscrubbed history, stays
  private). `DroptheHammer/Phoenix_weaponeer` is a fresh **public** repo made
  from a rewritten history. Releases v0.2.0–v0.2.3 were copied into it, with
  all installers. **Every clone made before 2026-09-23 must be re-cloned.**
- **Removed from all history:** the FragOrders author's correspondence (the
  theater table they sent, our requests to them), real mission files, the four
  real FragOrders link ids (replaced with `ExampleLinkId000000N`), the Mac
  username, a PDF whose metadata carried the user's real name, and every
  mention of the FragOrders author's name. All commit time zones were set to
  UTC.
- **Tests:** real missions moved to git-ignored `test-data/private/`, loaded by
  `private_fixture!` (`src-tauri/src/lib.rs`), which skips when the file is
  missing. The live-link test reads `PHOENIX_LIVE_LINK` /
  `PHOENIX_LIVE_NEON_LINK`. Gates: **301 geo-checks**, **100 Rust tests +
  1 ignored**, `npm run build` clean, both with and without the private files.
- **Audited clean:** every stored object, commit metadata, image metadata, the
  unpacked v0.2.x installers, and the GitHub account's public footprint.
  The rules are in the Privacy section at the top of this file.

### START OF NEXT SESSION

1. `git pull origin main`. On any machine other than the main Mac, **delete
   the old clone and clone fresh** first. Copy `test-data/private/` over from
   the main Mac to run the full test suite.
2. **The user still has to delete** the private throwaway repos
   `Phoenix_weaponeer-discard2` and `Phoenix_weaponeer-discard3` (earlier
   scrub attempts; the token lacks `delete_repo`). Keep `-archive`.
3. ~~Release v0.3.0~~ **Done 2026-09-24 (UTC): v0.3.0 published as Latest**
   (Phase 5: live Customize, multi-ship strikes). Bump commit `c56c227`, CI
   run 35939977522 green on all three platforms, all 7 installers attached,
   logged-out download checked. First release from the public repo. The
   full-history privacy scan and the installer scan both ran clean
   beforehand (scripts in git-ignored `Other Items/privacy-scan/`).
4. Still open from the Phase 5 session (details in `docs/SESSION_HISTORY.md`):
   changing a jet's attacker doesn't re-sort the jets, and wingman tracks on
   the card don't widen its frame.

---

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

---


**Last session:** 2026-09-22, late (Opus 5.5, user at the screen). **Released
and published v0.2.3.** It ships FragOrders link import, built the session
before (see below). One version-bump commit, a tag, and the session-notes
commits, all pushed. No code changed. Gates at release: **249 geo-checks**,
**99 Rust tests + 1 ignored**, `npm run build` clean.

| Commit | What |
|---|---|
| `e038278` | Bump version to 0.2.3, tagged `v0.2.3` |
| `292debf` | Session notes: v0.2.3 published |
| `8b43672` | Session notes, archive of the link-import session |

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

---

**Session:** 2026-09-22 (Opus 5.5, user at the screen). **Built
FragOrders URL import.** Two commits plus a session-notes commit (`d4ad394`),
all pushed. Gates: **249 geo-checks** (was 246), **99 Rust tests + 1 ignored
live test** (was 83), `npm run build` clean, `cargo build` zero warnings. Plan
at `~/.claude/plans/what-s-next-on-our-elegant-mango.md`. Released as v0.2.3
the next session.

| Commit | What |
|---|---|
| `1cdaee0` | Saved the 2026-09-15 evening work: link fixtures, shelved request to the FragOrders author, CLAUDE.md trim |
| `fbe807c` | Import a mission from a FragOrders public link |
| `d4ad394` | Session notes |

### FragOrders URL import

- **The user's decision:** import what the public link carries, and that's it.
  Author- or publisher-withheld units are intended to be missing. The FragOrders author
  endpoint request was never sent and is shelved. Memory:
  `project-fragorders-publish-varies`.
- **How the link resolves** (`src-tauri/src/fragorders_link.rs`):
  1. Firestore `PublishManifests/{id}` gives the bundle address, the title and
     `showGroups`.
  2. The CloudFront bundle gives the `TaskingState` JSON.
  The fetch is https only, never follows redirects, and only takes a bundle
  from `*.cloudfront.net`. It uses `ureq` with rustls, running in Rust, so the
  CSP and the capabilities list are unchanged.
- **Parser:** `parsers/tasking_state.rs`. The **Paste JSON** tab now accepts
  either shape.
- **Import:** `process_tasking_state` in `commands/mod.rs`. It shares
  `convert_route` with the CLI import. FragOrders fills unnamed points with
  their own number ("0"); those are blanked so the airfield-name fallback still
  works.
- **Theater aliases:** each theater entry has a `fragorders_names` list
  (`SINAI`, `PG`, `MARIANAS`, `SOUTH_ATLANTIC`, `GERMANY_COLD_WAR`,
  `Normandy2`). FragOrders' Channel name is unknown.
- **Empty laydown:** the result gets a blue *notice*, not a warning. The
  wording is specific when `showGroups` is off.
- **Mission notes** record the frag order's title and link
  (`src/lib/importNotes.ts`).
- **Parity test:** Sinai M01 V7 imports identically from the link and the CLI
  for every flight. The CLI's "Uzi11 1-1" and the link's "Uzi11" both render as
  "Uzi 1-1" via `formatCallsign`.
- **Checked on screen by the user** with the Neon Mirror and Arctic Fury links.
- **Live test:** `cargo test -- --ignored` hits the real service (NTTR_DTC,
  Neon Mirror).

### Build note

Homebrew upgraded `proj` from 9.8.1 to 9.9.0 on 2026-09-15, and the cached
`proj-sys` build still linked the old Cellar path ("library 'proj' not found").
Fixed with `cargo clean -p proj-sys`. If that error returns after a
`brew upgrade`, do the same.

### START OF NEXT SESSION (as written then)

1. Release v0.2.3 when the user says so.
2. Then pick the next banked feature: live-geometry Customize, or multi-aircraft
   coordinated strike together with shared custom IP. Ask.

The "Adjacent, noted but not done" list from this session carried forward
unchanged into the next session's notes.

---

**Last session:** 2026-09-15 (Opus 5, user at the screen). **Released and
published v0.2.2.** Two commits and a tag, all pushed, plus this session-notes
commit. Gates at release: **246 geo-checks**, **83 Rust tests**, `npm run build`
clean, `cargo build` zero warnings. No code changed this session.

*(Added 2026-09-22: a later session that evening investigated FragOrders public
links. It captured four link payloads into `test-data/private/fragorders-links/` and
drafted a request to the FragOrders author (never sent; kept out of the repo). None of it was committed or
written into these notes until `1cdaee0` on 2026-09-22.)*

| Commit | What |
|---|---|
| `a84c32a` | Bump version to 0.2.2; add release checklist — tagged `v0.2.2` |
| `2d431cd` | Session notes: v0.2.2 published |
| `c9afd6e` | Session notes |

### v0.2.2 release

- Ships the three changes from 2026-09-14 (hidden threats, airfield names on
  waypoint 0, Sinai V7 fixture). Notes on the release are plain-language and
  cover only the two user-visible changes.
- CI run `35025480810` green on macOS, Windows and Linux. All seven assets
  attached: `.dmg`, `.app.tar.gz`, `-setup.exe`, `.msi`, `.deb`, `.rpm`,
  `.AppImage`. **Published and marked Latest at the user's request.**
- A draft release's URL reads `releases/tag/untagged-…` until published. That's
  normal, not a broken tag.

### Release checklist (new)

- The user asked for one word that covers the whole release, installers
  included, with step-by-step rules like the end-of-session ones. It's now the
  **RELEASE CHECKLIST** at the top of "Release Process" in CLAUDE.md. Memory:
  `feedback-release-means-full-checklist`. "Release / ship / cut / launch
  X.Y.Z" runs it end to end. **The only stop is asking before publishing.**
- **Found while releasing:** `package-lock.json` also carries the version (its
  two top `version` lines). The old three-file list missed it. It's in the
  checklist now.

### START OF NEXT SESSION

1. The user was asked which banked feature comes next and hasn't answered:
   **Live-geometry Customize** (half-planned in
   `~/.claude/plans/foamy-sauteeing-hejlsberg.md`; memory
   `project-live-geometry-customize`), or **multi-aircraft coordinated strike
   together with shared custom IP** (memory `project-shared-custom-ip`). Ask.
   *(2026-09-22: the user picked FragOrders URL import instead.)*

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

---

**Last session:** 2026-09-14, continued (Opus 5, user at the screen). **Three
commits, all pushed, plus this session-notes commit.** Gates: **246 geo-checks**
(was 232), **83 Rust tests** (was 75), `npm run build` clean, `cargo build`
**zero warnings**. Plan at `~/.claude/plans/ok-what-s-next-bubbly-moth.md`.
**Version is still 0.2.1.** Everything below is unreleased, on `main`.
(Released as v0.2.2 the next day, 2026-09-15.)

| Commit | What |
|---|---|
| `a20b11d` | Sinai M01 V7 fixture test and README entry |
| `e0ad7fe` | Name unnamed airfield waypoints after their airfield |
| `3b8cfe1` | Hide threats the mission author hid |
| `b281df3` | Session notes |

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

---

**Last session:** 2026-09-14 (Opus 5, user at the screen). **Two commits and
a tag, all pushed, plus this session-notes commit.** Gates: **232 geo-checks**
(was 224), **75 Rust tests** (74 − 1 dead stub test + 2 new), `npm run build`
clean, `cargo build` **zero warnings**, `cargo audit` **0 vulnerabilities**.
Plan at `~/.claude/plans/what-s-next-in-this-structured-crystal.md`.
**Version is 0.2.1, tagged.**

| Commit | What |
|---|---|
| `2bf0a95` | Close the 0.2.1 review: M8, L1–L7, Cmd+Q verified |
| `f4609cb` | Bump version to 0.2.1 — tagged `v0.2.1` |
| (next) | Session notes |

### 0.2.1 review closed — `docs/REVIEW_0.2.1.md` status table is current

- **M4 Cmd+Q guard: tested in the real app by the user.** Discard, Save, Dock →
  Quit, and a clean quit all behave.
- **M8 (NaN from a cleared Customize field): confirmed, then fixed.**
  `runAttackChecks` flags any non-finite profile number as an error, so Save is
  blocked. `DiveForm`/`LevelForm` send a cleared optional field back to Auto,
  keep the last value for a cleared required field, and re-derive a cleared
  heading. The pop-up form and action-point fields already had guards.
- **L1** Windows-safe "Saved:" filename. **L2/L3** removed `mlua`, `zip`,
  `image`, `rusttype`, `uuid`, `thiserror`, the `exporters` module,
  `MizParser`, the four stub commands and `chrono_now`. **L4** dropped
  `shell:allow-open`. **L5** `npm audit fix`; `cargo-audit` installed;
  compatible `cargo update`s for `bytes`, `time`, `tar` and `plist`
  (→ `quick-xml` 0.41) cleared all 6 Rust advisories. **L6** a database
  failure at launch shows an error dialog and quits. **L7** CI actions pinned
  to commit SHAs.
- **Found along the way:** last session's `exit_app` was inserted between
  `reveal_profiles_dir` and its doc comment, so `#[allow(deprecated)]` landed
  on the wrong function. Moved back, and the warning is gone.
  `reveal_profiles_dir` has **no frontend caller**. The user chose to keep it
  for a future "Open profiles folder" button.
- **Not seen on screen, by the user's choice:** the L6 error dialog (it would
  mean locking the real database). **Still open:** L8 and L9, which need a
  Linux or Windows machine.

**Break-tests (every new test shown to fail):**

| Test | Broken how | Result |
|---|---|---|
| 6 × `attackChecks: … = NaN is an error` | today's code, before the fix | FAIL, no checks returned |
| `a_blocked_app_data_folder_is_reported_with_its_path` | path stripped from the message | FAIL |
| `an_unopenable_database_is_reported_with_its_path` | path stripped | **passed anyway**, because SQLite's own error text already names the file. Rewritten to `starts_with` our own wording, then FAIL |

### Release

`v0.2.1` tagged at `f4609cb`. This is the first release run with the
SHA-pinned `tauri-action` / `rust-toolchain`. **CI passed on all three
platforms** (run `34933050169`). The **draft** release has
`Phoenix.Weaponeer_0.2.1_aarch64.dmg`, `_x64-setup.exe`, `_x64_en-US.msi`,
`_amd64.deb`, `-1.x86_64.rpm`, `_amd64.AppImage` and the macOS `.app.tar.gz`.
**Published 2026-09-15 at the user's request**, marked Latest.

### START OF NEXT SESSION

1. `v0.2.1` is released and published. Nothing is pending on it.
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
- `test-data/private/sinai_m01_v7.json` has no README entry or import test yet.
- Missions saved before `3569a5c` read one high until re-imported.
- `airdromeId` is dropped at deserialization, so waypoint 0 can't be named after
  its airfield.
- DTC data (threat/target/nav points, beacons, loadouts) is reachable and unused.
- Red statics and planes are never scanned.
- Kola / Afghanistan / Channel projections; PDF export; FragOrders URL import;
  loft geometry.

---

**Last session:** 2026-09-13 → 14 (Sonnet 5, user at the screen). **One
commit so far, plus this session-notes commit, both to be pushed.** Rust
tests steady at **74**; `npm run build` clean, `cargo build`/`cargo test`
clean. Plan at `~/.claude/plans/what-s-the-testing-plan-cozy-falcon.md`.
**Version is still 0.2.0** — not bumped, not tagged.

| Commit | What |
|---|---|
| `90f3f9d` | Custom IP for attacks, plus three bugs found and fixed while testing it |
| `690220b` | Session notes |

### Custom IP for attacks — shipped and tested

Attacks can now get their Initial Point from a draggable/typed custom map
point (radial + distance off target, or drop a pin), not just Auto (prior
waypoint) or a chosen waypoint. Resolver logic is `src/lib/ipAnchor.ts`;
UI is a 3-way Auto/Waypoint/Custom toggle in `AttackEditor.tsx` plus a
draggable `CustomIpMarker.tsx`. Every consumer — the map overlay, the attack
label layer, `autoBuildAttack`, the kneeboard card, and `validateMission`'s
shared-mission gate — reads through the same anchor. The user tested the
whole feature by hand (toggle, place-on-map, drag, radial/distance typing,
mode switching, labels, kneeboard rendering, multiple attacks at once) and it
all passed.

**Banked while testing it, not built:** letting a custom IP set on one attack
be reused by others in the flight, cascading to Auto if deleted. See
`project-shared-custom-ip` and the new Phase 5 bullet below.

### Three bugs found during that testing pass, all fixed

1. **Customize panel showed only common fields, missing the profile-specific
   form, until the triangle was toggled twice.** Root cause:
   `resetToProfile()` (called on every delivery-mode switch) cleared
   `customized` but left `showCustomize` on — breaking the invariant that the
   two always move together everywhere else in `AttackEditor.tsx`. A first
   attempted fix (re-sync on `attack?.id` change) was **correctly rejected by
   the user as not actually fixing their repro** before the real cause was
   found — worth remembering that a plausible-looking fix still needs to be
   checked against the user's exact repro, not just "it typechecks."
2. **Exported kneeboard filenames for an unnamed target waypoint ended in a
   bare trailing underscore** (`Uzi_1-2_.png`) — `kneeboardFilename()` had no
   fallback when `targetName` is blank, which is common (see
   `project-waypoints-are-free-text`). Now falls back to the steerpoint:
   `Uzi_1-2_STPT2.png`.
3. **Cmd+Q / Dock Quit on macOS bypassed the unsaved-changes guard entirely**
   — confirmed by the user, then fixed rather than left as the documented
   limitation. It's an app-level `RunEvent::ExitRequested` in Tauri, not a
   window-level close, so the existing `onCloseRequested` listener never saw
   it. `src-tauri/src/lib.rs` now intercepts it (only when
   `code.is_none()`, i.e. user-initiated) and emits a `quit-requested` event;
   `App.tsx` reuses the same `UnsavedChangesDialog`; a new `exit_app` Rust
   command (carries an explicit code, so the handler doesn't re-intercept its
   own exit) actually terminates. **Not yet re-tested** — needs the real
   Tauri app (`npm run tauri dev` or a build), not just Vite.

### Part 2 (carryover security/UX checks from last session) — all run

CSP (planner map, kneeboard map layer, PNG export), the hostile mission file,
old save files, the window close guard (✕ button), and duplicate kneeboard
filenames all passed. **Windows was explicitly waived by the user** —
"almost all of these are just copies... trust that tauri is doing its cross
platform job... raise a windows issue later" — see
`feedback-windows-testing-not-required-every-time` in memory. Genuinely
Windows-only surface (the folder-picker start point, WebView2 tile CORS) is
still unverified, not passed; treat a future Windows report as new, not a
reopened item.

### 0.2.1 review — `docs/REVIEW_0.2.1.md` (status table at the top) — unchanged this session

Still open: **M8** (NaN from a cleared Customize field — plausible, write the
test first) and **L1–L9** (dead `mlua`/`zip`/`image`/`rusttype` and stub
commands, unused `shell:allow-open`, `npm audit fix`, setup `expect` panics,
CI action pinning, Linux fonts, `cargo-audit` not installed). Memory:
`project-security-posture`.

### START OF NEXT SESSION

1. **Re-test the Cmd+Q fix** in the real Tauri app (dirty mission → Cmd+Q →
   expect the Unsaved Changes dialog; try both Discard and Save from it).
2. Settle M8 and the Lows above. Then bump **0.2.0 → 0.2.1** in
   `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, and
   commit. **Ask before tagging `v0.2.1`** — the tag starts release CI.
3. Then the banked features, in whatever order the user prefers:
   **Live-geometry Customize** (half-planned in
   `~/.claude/plans/foamy-sauteeing-hejlsberg.md`; memory
   `project-live-geometry-customize`), **multi-aircraft coordinated strike**,
   and **shared custom IP across a flight's attacks** (memory
   `project-shared-custom-ip` — naturally adjacent to multi-aircraft strike,
   worth designing together).

### Adjacent, noted but not done

- `test-data/private/sinai_m01_v7.json` has no README entry or import test yet.
- Missions saved before `3569a5c` read one high until re-imported.
- `airdromeId` is dropped at deserialization, so waypoint 0 can't be named after
  its airfield.
- DTC data (threat/target/nav points, beacons, loadouts) is reachable and unused.
- Red statics and planes are never scanned.
- Kola / Afghanistan / Channel projections; PDF export; FragOrders URL import;
  loft geometry.

---

**Last session:** 2026-09-12 → 13 (Opus 5, user at the screen). **Two commits,
pushed.** Gates moved **156 → 189 geo-checks** and **60 → 74 Rust tests**;
`npm run build` clean, `cargo build` zero warnings. Plan at
`~/.claude/plans/i-need-to-plan-transient-breeze.md`. **Version is still 0.2.0**
— not bumped, not tagged.

| Commit | What |
|---|---|
| `fea03ad` | Kneeboard map layer, per-aircraft DCS folders, and the 0.2.1 security sweep |
| `72f934a` | Session notes; adds `test-data/private/sinai_m01_v7.json` (user-supplied, no test yet) |

### Grey map under the card's north-up picture

`src/lib/kneeboardBasemap.ts` holds the pure tile maths and the loader.
`planViewTransform` was pulled out of `drawPlanView` so alignment is testable:
tiles land within ~0.5 px of the card's projection across the whole box. Drawing
is two passes (`renderKneeboardCardWithMap`): draw with cached tiles, fetch the
missing ones (8 s cap), draw again. Each export gets its own canvas.
**Gotchas:** without `img.crossOrigin = 'anonymous'` every export throws
(tainted canvas); greyscale is a `getImageData` loop because `ctx.filter` is
missing from older WebKit. The wash is **0.20**, chosen from renders at Ramon AB
(0.45 hid the runway, a contrast boost was too busy).

**Reusable technique:** esbuild-bundle a TS harness into a `file://` page, then
`"Google Chrome" --headless=new --virtual-time-budget=30000 --screenshot=…`.
That renders real cards (and proves the PNG encode) without the Tauri app.

### DCS kneeboard folders are user-chosen (user correction)

The folder is never assumed. The first export per aircraft type opens the picker
at a best guess (`settings::suggest_kneeboard_folder`), and the choice is saved in
`<app data>/settings.json`. **⚙ Settings** has Choose…/Reset per type; the
kneeboard panel shows each type's folder with Reset. `detect_dcs_folder` and the
hard-coded 4-aircraft map are gone. The user wants Settings to become the home for
preferences that matter; the "Map background" toggle still lives in `uiStore` and
is not persisted. Memory: `project-dcs-kneeboard-folder-is-user-guided`.

### 0.2.1 review — `docs/REVIEW_0.2.1.md` (status table at the top)

**Fixed:**
- **H1:** shared mission file → script → write any file. Fixed by the
  `validateMission` gate and `escapeHtml` in the divIcon strings.
- **M0:** CSP turned on.
- **M1:** save commands locked to `.json` / `.png`.
- **M2, M3, M7:** via the per-aircraft folders.
- **M4:** window close guard.
- **M5:** error boundary.
- **M6:** filename collisions.

Memory: `project-security-posture`. **Open:** M8 (NaN from a cleared Customize
field — plausible, write the test first) and L1–L9: dead `mlua`/`zip`/`image`/
`rusttype` and stub commands, unused `shell:allow-open`, `npm audit fix`, setup
`expect` panics, CI action pinning, Linux fonts, `cargo-audit` not installed.

### Not yet verified by the user (as of 2026-09-13, before further testing)

The user tested the map layer and the Settings/export flow on Mac.
Multi-aircraft export can't be exercised: imports are per flight, one type.
**Still untested at the time this was written** — the list given at the end of
that session (see the 2026-09-13 entry above for what actually happened when
these were run):
1. **CSP**, the most likely breakage: planner tiles, marker styling, the card
   map, and exports. Unstyled markers → `style-src`; missing tiles → `img-src`.
2. `Other Items/hostile_mission_TEST.json` must be refused, and the title must
   not become HACKED.
3. The user's real older saves still open under `validateMission`.
4. Close guard. macOS Cmd+Q may bypass it.
5. Duplicate card names export as `_2`.

**Windows had not run any of this session's work:** picker start point, tile
CORS on WebView2, CSP. (Still true as of 2026-09-13 — see above.)

### Adjacent, noted but not done (as of 2026-09-13)

- `test-data/private/sinai_m01_v7.json` has no README entry or import test yet.
- Missions saved before `3569a5c` read one high until re-imported.
- `airdromeId` is dropped at deserialization, so waypoint 0 can't be named after
  its airfield.
- DTC data (threat/target/nav points, beacons, loadouts) is reachable and unused.
- Red statics and planes are never scanned.
- Kola / Afghanistan / Channel projections; PDF export; FragOrders URL import;
  loft geometry.

**Last session:** 2026-09-12 (Opus 5, user at the screen). **One commit.**
Gates moved **152 → 156 geo-checks** and **58 → 60 Rust tests**;
`npm run build` clean, `cargo build` zero warnings. Plan at
`~/.claude/plans/we-ve-got-a-problem-glittery-rose.md`.

| Commit | What |
|---|---|
| `3569a5c` | Number waypoints from 0, so the ramp stops eating steerpoint 1 |

### Every steerpoint we printed was one too high

The user spotted it against FragOrders: on Sinai M01 V6 the tool called Barak's
676 ft point **waypoint 2**, FragOrders calls it **Waypoint 1**. The importer
numbered `route.points` from 1 and skipped nothing, so point `[0]` — the parking
spawn at Ramon, alt 31 m = the 102 ft we showed — became steerpoint 1 and pushed
the route up by one. That included every `STPT n` on the kneeboard card, which is
what the pilot dials into the jet.

Waypoints are now numbered by **raw 0-based route-point index**, unconditionally.
The spawn point is waypoint 0 and carries a new `departure` type; it stays listed,
drawn, and offered in the target/IP pickers (type is a hint, never a gate).
`buildKneeboardCard` needed no edit — it already printed `STPT ${wp.steerpoint}`
and simply became correct. Full rationale in memory:
`project-waypoint-numbering-is-zero-based` — **the short version is "never add 1".**

### The FragOrders web bundle is a readable reference now

The git 404s, but fragorders.com serves `/public_frag_order.<hash>.js` (hash in
the page HTML, `.js.map` published too). Grepping it settled both halves of the
question outright, which is why this needed no guessing:

- `each(route.points, (pt, idx) => push({...pt, number: idx}))` — 0-based, with a
  guard that sorted index N must carry number N.
- The DTC generator does `if (0 === r) continue; push({Sequence: r, …})` under
  `SteerpointStart: 1` — so the ramp never becomes a steerpoint in the jet, and
  **cockpit STPT n = waypoint n**. There is no planner/cockpit offset.
- It also reads the group's departure `airdromeId` off the `TakeOffParking` point.

**Gotcha:** the page is a Firebase SPA — `curl` of the URL returns a 1 KB shell.
Fetch the bundle, not the page. In memory: `reference-fragorders-cli`.

`barak_numbering_matches_fragorders` pins waypoint 1 to **N 31° 14.4023′
E 34° 39.5637′**, read off the FragOrders map popup — so it guards the numbering
*and* independently re-confirms the Sinai projection against an outside source.

### START OF NEXT SESSION

1. **The two banked features are still the whole queue.**
2. **Live-geometry Customize** — half-planned in
   `~/.claude/plans/foamy-sauteeing-hejlsberg.md`. The recompute is *already*
   live; `MapView` is prop-driven and a second `MapContainer` is safe. Design
   reference: `Other Items/offset-leg-geometry.html`. **Two questions before
   code:** where the map sits (the editor is a centred modal today), and whether
   knobs become sliders, slider+number pairs, or stay number boxes — bounded by
   *never remove a knob*. **There are 35: 3 common, 12 dive, 9 level, 14
   pop-up** — plus the shared IP selector. **Gotcha:** `MapView` reads
   `useUiStore`'s display filters directly (`:257-259`), so an embedded editor
   map would inherit whatever the main map is hiding; the editor must show the
   truth. **Second gotcha:** `MapController` re-fits on `fitKey` changes — fit
   once on open and hold.
3. Then **multi-aircraft coordinated strike**, which `split_deg` on
   `RunInSummary` is retained for. See memory: `project-live-geometry-customize`.

### Adjacent, noted but not done

- **Missions saved before `3569a5c` read one high** until re-imported. Attacks
  reference waypoints by uuid so nothing breaks. No migration was written: an old
  save is indistinguishable from a new one.
- **`airdromeId` is still dropped at deserialization** (`RoutePoint`,
  `src-tauri/src/parsers/fragorders.rs`). FragOrders uses it to name the departure
  field; carrying it would let waypoint 0 read "Ramon AB" instead of `WP0`, but it
  needs an airdrome-id table we do not have.
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

`test-data/private/sinai_m01_v6.json` is the new reference fixture (theater `SinaiMap`,
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

---

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

Run `npm run tauri dev`, import `test-data/private/nttr_redflag_viper1.json`, group
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
dev process; relaunch it. Import `test-data/private/nttr_redflag_viper1.json`, group
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
`test-data/private/nttr_redflag_viper1.json`, group Viper 1 (Hot). Any edit under
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
1. Import `test-data/private/nttr_redflag_viper1.json`, group Viper 1 (Hot). First
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

The FragOrders author answered the data request with FragOrders' theater table (kept out of the repo).
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
Nevada. **Use `test-data/private/nttr_redflag_viper1.json`** (real FragOrders export,
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
the data request to the FragOrders author (kept out of the repo) and item 1 under "Next
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
