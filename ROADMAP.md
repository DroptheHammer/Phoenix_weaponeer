# Phoenix Weaponeer — Roadmap

Cross-platform desktop planner for DCS World strike missions: import the
FragOrders brief, lay down threats, auto-build each jet's attack, and export
kneeboard cards.

**This is the one to-do list.** Keep it current when something ships or is
decided. The detail behind every line is in `docs/SESSION_HISTORY.md`
(newest-first). Finished plans and reviews are in `docs/archive/`.

**Last updated:** 2026-11-15

---

## Open

### Attacks and weapons
The five bold build items below each have a session plan in
`docs/BUILD_SESSIONS_PLAN.md` (planned 2026-11-13). Order: rows (1), rack
counts (2), CLI loadouts (3), numbers (4), loft (5).

- [x] **Loft geometry** (F-16 Loft 30°, F-4E LABS 45°) — 2026-11-14,
      Session 5, released in v0.3.4. Checked on screen by the user (map,
      side view, editor, LABS card). Model and sources in
      `docs/DELIVERY_PLANNING.md`, "Loft and LABS": the USAF F-4 weapons
      delivery manual's loft table (Fig 5-9) is a geo-check test, row by row.
      Decided: a loft runs straight from the IP; no release floors, instead a
      warning inside 0.5 nm of the target at impact; the F-4E pull-up timer
      goes in the card header.
  - [ ] *Smooth bomb arc in the side view* (optional): drawn today as short
        straight pieces through hidden points; a `path` on `SideSegment`
        drawn as a polyline would be cleaner.
  - [ ] *Per-weapon drag, for every bomb* (widened 2026-11-15 from lofts
        only): the loft uses one drag constant (an M117's, which lands
        Heatblur's Mk-82 within 1%) for every bomb, and the level, pop-up and
        dive bombs fall in a vacuum. A cluster or high-drag store flies
        shorter than either. Needs a sourced table per store. With it: an
        optional aim-off override on a dive profile, so a retarded bomb's dive
        (the F-16C LALD 10°) can carry the figure the pilot's own tables give;
        until then its vacuum aim-off overstates the range, and the profile's
        ESTIMATED strip is the only warning.
  - [ ] *F-4E gyro angle*: LABS sets a pitch angle, about 6–8° above the
        flight-path angle the tool plans on (Fig 5-9: 36.9° for a 30°
        release). No gyro setting is printed.
- [ ] **Repair old saved dives when they load** (wanted by the user
      2026-11-15, later, not now: old saves are rarely opened in normal ops).
      Since the ballistic dive, the A-10C, AV-8B and A-4E 45° profiles build
      with a 10° check turn. An attack of those saved before it, with the old
      20° turn, loses its offset leg and action point on the map until it is
      opened in the editor and saved. The repair would draw the cut check turn
      at load instead, so the old save keeps its leg without being re-saved.
- [x] **Numbers for the twenty-six name-only rows** (2026-11-13, Session 4,
      released in v0.3.4). Each number was approved one by one and its
      source is in the row's `notes` (and `docs/DELIVERY_PLANNING.md`, "Weapon
      numbers (2026-11-13)").
  - *Weight, all 26:* DCS's own, from the public pydcs library, except the
    Mk-81 Snakeye (the A-4E-C mod's file) and the AGM-65F (the Navy training
    system plan, the missile alone).
  - *Frag floor, which clears the "no data on file" caution and is enforced:*
    the Mk-83 alone, 1,300 ft (USAF Dash-34, F-4C/D/E manual, a level-release
    figure). The Mk-20 Rockeye and CBU-99 get none: T.O. 1-1M-34's 1,380 ft
    maximum fragment altitude was considered as their floor and rejected,
    because a release below a floor is an error that blocks saving, and it
    would block a normal 500 ft laydown. The figure is in their notes only.
  - *Envelope extras, which keep the caution:* BLU-107 minimum release 250 ft
    and 620 kt (T.O. 1-1M-34; Heatblur's F-4E manual advises about 500 ft);
    CBU-105 200 to 20,000 ft and 650 kt and CBU-103 40,000 ft
    (globalsecurity.org; the CBU-105's are the CBU-97's, before the WCMD kit).
- [ ] **Release and frag floors for the rows still without one** (only where a
      public source exists). Still no frag min-safe, so their attacks and
      cards carry the "no data on file" caution: GBU-16 (weight only, by
      choice), Mk-20 Rockeye and CBU-99 (see above), CBU-52B, BLG-66 Belouga,
      the five SAMPs, Mk-81 and its Snakeye, Mk-83 AIR, BR-250, BR-500,
      BLU-107 Durandal, CBU-103, CBU-105, BL-755, CBU-1/A, CBU-2/A and
      CBU-2B/A (22 bomb and cluster rows). Still no
      minimum release: AGM-65F and AGM-122. The GAU-12 pod has a weight and
      needs nothing more (a gun never has the caution).
- [ ] **Audit the seed rows' numbers.** The rows that came from the old
      SQLite seed (Mk-82, Mk-84, GBU-12 and so on) cite no source. The public
      USAF Dash-34 safe-escape tables disagree with two of them: T.O.
      1F-4C-34-1-1 Fig 6-14 (level release, 360 KTAS) gives the Mk-82 about
      1,100 ft and the Mk-84 about 1,700 ft, where the seed rows say 3,000 and
      4,500. T.O. 1-1M-34 Fig 6-1 gives the maximum fragment altitude at sea
      level as 2,050 ft for the Mk-82 and 2,750 ft for the Mk-84. Nothing is
      changed yet: decide row by row whether to re-source them (a lower floor
      lets auto-build plan lower releases). **The radii are in the audit too:**
      `frag_lethal_radius_ft` (15 rows) and `frag_effective_radius_ft` (18 rows)
      cite no source either, and the public manuals give heights, not a lateral
      blast radius. The blast test reads neither of them: it reads the
      separate `blast_radius_ft` field, which has a meaning and a source kind
      beside it. Eight rows carry one (approved 2026-11-16, from one community
      test; see `docs/DELIVERY_PLANNING.md`); every other row stays empty until
      a value has been shown with its source and approved.
- [x] **Bombs the modules carry that still had no row** (2026-11-13,
      Session 1, released in v0.3.4). Thirteen name-only rows from the DCS
      pylon tables: Mk-81, Mk-81 Snakeye, Mk-83, Mk-83 AIR, BR-250, BR-500,
      BLU-107 Durandal, CBU-103, CBU-105, BL-755, CBU-1/A, CBU-2/A and
      CBU-2B/A. The Snakeye, the AIR and the Durandal (parachute-retarded; the
      user chose high-drag) are high-drag bombs. The BL-755 is an F-4E store,
      not the A-4E-C's, and the F-4E carries the CBU-1/A too. A link import
      now loads each of them. The store with no row in the tests and in the
      synthetic file is now the AGM-45 Shrike.
- [x] **Rack counts written as a bare number** (2026-11-13, Session 2,
      released in v0.3.4). Four shapes taken from the DCS name lists are read:
      a trailing `* N`, a leading `N` before the weapon, `MAK79 N`, and a
      trailing `x N`. A rack's own number (the 42 in BRU-42) is still never a
      count. Stores with no row are still counted only by `with N x`. Over
      all 1,847 pydcs and A-4E-C store names, 86 counts changed and every one
      was checked. Two drag spellings were fixed on the way: the F1's
      `MK-82 Snakeyes` loads as the Snakeye, and `Mk-84 AIR * 2` (no row) is
      no longer taken for the slick Mk-84.
- [ ] Sight settings for rockets on the manual-dive profiles. Rocket cards show
      no sight number, on purpose: the A-4E, F-4E, Mirage F1 and F-5E profiles
      carry Mk-82 values that auto-build applies to bombs only. Needs
      per-rocket numbers from the manuals.
- [ ] **A manual sight's mils follow a customized attack** (wanted by the
      user 2026-11-15). Today each manual-dive profile carries one fixed sight
      number, printed in the card header, and nothing changes it when the
      pilot changes the speed, the release height, the dive angle or the bomb.
      It should be looked up from the aircraft's own depression tables, or
      estimated and flagged. What a search of public sources found
      (2026-11-15): none of the eight numbers on file traces to a table. For
      the F-5E, the user has ruled the real jet's weapons manual out as a
      source (it carries a distribution restriction), and the DCS module's own
      manual prints two bomb sight settings, neither near the planner's two
      F-5E profiles. The Mirage F1 module manual covers only 10° and 20°
      dives with the SAMP-250. Nothing was found for the F-4E (its module has
      a bombing calculator in the game) or for the A-4E-C's dives. So the
      F-5E's figure will be the planner's own calculation from the bomb's
      fall, marked as an estimate, with a box for the pilot's own number, and
      a short test flight in the game is the way to check it.
- [x] **Loadout from a CLI/.miz import** (2026-11-13, Session 3,
      released in v0.3.4). The CLI writes pylons as DCS CLSIDs; a generated table
      (`scripts/gen-clsids.mjs` → `crates/core/src/parsers/clsid_data.rs`, from
      pydcs and the A-4E-C mod, both pinned) names each one, and the names go
      through the same rules and merge as a link's. A CLSID the table does not
      have is kept under the CLSID itself. Checked: the captured NTTR mission's
      F-4Es arrive with their Mk-82, CBU-87 and Shrikes; every CLSID on its
      player jets is named. Not yet checked on screen.
- [ ] Store names the link import does not place yet. Russian and Chinese
      air-to-air missiles, and pods outside the skip list, show as "not in
      the weapon table" where they should be dropped. Rockets are mapped for
      five aircraft only; the others have not been checked.
- [ ] **Rocket-pod import gaps** (found 2026-11-13 scanning every DCS store
      name; none is in a captured link yet):
  - Illumination and smoke rockets load as HE. Hydra names ending `M257 IL`,
    `M156 SM` or `M274 TP-SM`, and the SNEB IL/SM ones, slip past the marker
    skip.
  - Rocket counts on rack names: `BRU-42: 2 x LAU-131 - 7 x …` reads 2, not
    14 (41 names). `2x LAU-10 pod - 4 x …` reads 4, not 8.
    `2 LAU-10 - 4 ZUNI MK 71` reads 1.
  - `ORO-57K - S-5M1 HE-FRAG FFAR x 8` loads as one 2.75" FFAR. It is eight
    57 mm S-5s, which have no row.
  - A count written glued to the name, `2xGBU-12 - 500lb Laser Guided Bomb`
    (two pydcs names) is not read: the tokenizer makes `2xgbu` one token, so
    it is unrecognised. `2xAGM-114K` (the OH-58D) has no row and counts one.
  - Since Session 3 a CLI import reaches all of these through the CLSID table,
    which holds every one of those names.
- [ ] **Pilot verification of the 62 seed profiles.** All are ESTIMATED; none
      is `verified: true` yet.
- [ ] Weather. It is parsed at import but not used.

### Maps
- [ ] **The Channel** has no projection. It needs DCS x/y ↔ lat/lon pairs read
      off the F10 map.
- [ ] **Kola and Afghanistan** are `verified: false`. Use the same method as
      Sinai: single-unit groups from a `.miz` (see `test-data/README.md`).
- [ ] Airfield names on Iraq and Afghanistan waypoints.
- [ ] Offline map tiles. The card and map use the online OpenStreetMap server.

### Import
- [ ] Direct `.miz` import, without the FragOrders CLI.
- [ ] Tacview import.
- [ ] Red statics and red aircraft. Only red vehicles are imported as threats.

### Planning screen
- [ ] **Map-first layout.** Part of the old revamp plan's M2 milestone: a rail
      by job with a readiness line, a threat palette you drag onto the map,
      drag handles on the attack (only the IP drags today), and exposure
      shading inside SAM rings.

### Far future (pinned, not scheduled)
- [ ] **A full UI/UX overhaul,** with Day card accessibility folded in. The
      2026-09-29 contrast audit asks for three things:
  - a dash pattern and width for each attack stage, so green-blind pilots can
    tell attack from egress;
  - attack colours that stand out on the light map (the yellow climb line is
    1.2:1);
  - dark letters on the light marker discs.

  The findings and the audit tool are in the git-ignored
  `Other Items/card-themes/wcag/` on the main Mac.

### Output
- [ ] PDF export. Only if the squadron asks for it.

### Untested platforms
- [ ] Kneeboard export on Windows. The folder flow is only tested on macOS.
- [ ] Card fonts on Linux (review L8), and map tiles on WebView2 / WebKitGTK
      (review L9).

---

## In progress

- [ ] **Phone web app on a real Android phone.** The iPhone has been checked;
      an Android phone hasn't yet. In Chrome: Add to Home Screen, offline
      launch, the share sheet, screen wake lock, GPS for "Strike near me",
      crosshair precision.
- [ ] **On-screen check of "Jets arrive loaded"** (0.3.3). The user checked
      the desktop app on 2026-10-03 with
      `test-data/nevada_SYNTHETIC_loaded_jets.json`, and all four passed: the
      import preview's **Loadouts** list, the Flight roster, the weapon
      already picked on a new attack, and **Show all weapons**. Still open:
  - [x] The Loadouts list with a real link (2026-11-13). No captured link has
        a long loadout: the longest is the Syria capture's AV-8B flight, three
        lines, and it reads cleanly. The synthetic file's four-line jet is
        longer than any real one.
  - [ ] The same screens on the iPhone (pinned until the user has the phone).
- [x] **On-screen check of the cluster and SAMP rows** (released in v0.3.4),
      2026-11-13, in a build from source: the synthetic file's Venom 1-3 shows
      Rockeye as known and BL-755 as "not in the weapon table", and an F/A-18C
      attack offers Mk-20 Rockeye and CBU-99.

The in-use check of 0.3.2 is closed: the user reported every item as fine
(3× cards in DCS and the Lighting dropdown on 2026-10-01; the iPhone carousel
at 3×, the larger card text, the amber SIGHT header, the Copy menu and the
waypoint list on 2026-10-03).

---

## Shipped

### Unreleased (0.4.0 branch)
- **New lettering and dialogs** (2026-11-17, the first part of the 0.4.0
  redesign). The app's text is set in Figtree and its monospace text in
  JetBrains Mono, both bundled, so they work offline. Scrollbars, drop-downs
  and checkboxes are dark, digits line up, and a sky ring shows on keyboard
  focus. Every dialog has a dark backdrop, a rounded frame and a header that
  stays put with an icon close button; Escape closes only the dialog on top,
  Tab stays inside it, and focus goes back to what opened it. The map, its
  legend and labels, the kneeboard cards and the 3D playback look as before,
  proven by before-and-after screenshots. The shared building blocks the next
  screens use are described in `docs/DESIGN_SYSTEM.md`.
- **Hidden threats are not mentioned** (2026-11-16, the user's decision). With
  nothing switched on in ⚙ Settings → Admin, the planner says nothing about
  threats the mission author hid: the threat list's "Probable Threats —
  location unknown" block and the import preview's "probable threats" line
  and "hidden by the mission author" count are gone, every total counts only
  what is shown, and the Admin switches no longer say how many the mission
  holds. A revealed threat shows exactly as before. The note a new import
  saves ("Threats detected: N"), which goes into the mission file and the
  brief pack, counts only the threats nobody hid; missions saved before keep
  their old note. Import warnings and a rejected file's error message no
  longer name or number a hidden threat either.
- **The frag warning follows DCS** (2026-11-16, the user's decision of
  2026-11-15). A strike is now warned when another jet is inside a bomb's
  blast radius at the moment it goes off, in 3D, distance only, with a radius
  per weapon from a cited source (eight bombs so far; a weapon with none is
  named as not checked). The strike editor's strip and the 3D playback run the
  same check on the same lines. The old 30 to 35 s spacing rule is still there
  as "Warn by: Spacing in time (real-world habit)" on the strike strip, saved
  with the strike; the phone reads the choice and says the blast check is made
  in the desktop app. Release floors and the cards are unchanged. Details in
  `docs/DELIVERY_PLANNING.md`, "Frag warning".
  - **For the release notes:** "The strike editor's frag warning now follows
    DCS: it checks each bomb's blast radius when it goes off, using a radius
    per weapon (eight weapons have one so far, from a community test); the
    old 30 to 35 second spacing rule is still there as a choice on the
    strike."
- **Ballistic dive (aim-off)** (2026-11-15, the user's call after seeing what
  would move on the F-16 30° dive card): a bomb released in a dive falls under
  the line of the dive, so a dive pointed straight at the target dropped short
  of it (about 640 m on the F-16 30° dive). Dive attacks now aim off, as
  pop-ups do (`src/lib/diveAim.ts`, the pop-up's own vacuum formula): the
  release sits where a bomb released at the stated altitude, speed and dive
  angle lands on the target, and a dashed aim line runs on past the target. On
  the F-16 30° dive the release moves from 1.28 to 0.94 nm out, the roll-in
  from 2.3 to 1.9 nm, the roll-in turn grows from 42° to 53° and the attack
  heading turns about 10° wider (up to 22° on the shallower and slower
  profiles). In the 3D playback a dive's bomb now falls in an arc. The A-10C,
  AV-8B and A-4E 45° profiles now build with a 10° check turn so their offset
  leg still closes. Gun and rocket passes, and level, pop-up and loft attacks,
  are unchanged. No dive card gets an aim-off row, on any aircraft: the user
  decided against it (2026-11-15; see "Decided — not doing").
  - **For the release notes:** open and save again any dive attack made
    before this version, and re-export its card. A saved A-10C, AV-8B or A-4E
    45° dive made with the old 20° turn loses its offset leg and action point
    on the map until it is opened in the editor and
    saved; opened, a standard attack is rebuilt with the 10° turn, and a
    customized one keeps its 20° and the editor says it does not close until
    the turn is lowered.
  - Its card prints what its picture draws (2026-11-16, from the review of
    the playback branch): no Action Point or Approach HDG row, the roll-in
    with the turn the map flies there, and one caution line, "⚠ The offset
    leg no longer reaches the roll-in — open this attack in the editor and
    save it". Until then the card still listed the old action point.

### v0.3.4 — 2026-11-14
- **Loft attacks** (2026-11-14): F-16 Loft 30 and F-4E LABS 45 offered again,
  fitted to the USAF F-4 Dash-34 loft table (every row a geo-check test).
  Map picture, side view, editor knobs, the F-4E pull-up timer in the card
  header, a 0.5 nm impact-standoff warning instead of release floors, and
  strike support.
- **Cluster bombs for the jets that had none, and the Mirage F1's own
  bombs** (2026-10-03). Nine new weapons, by name only: Mk-20 Rockeye
  (F/A-18C, F-14, AV-8B, A-4E-C, F-4E, F-15E), CBU-99 (F/A-18C, F-14,
  AV-8B), CBU-52B (F-5E, F-4E), BLG-66 Belouga (Mirage F1), and the SAMP-125,
  -250 and -400 bombs, with high-drag SAMP-250 and -400 (Mirage F1; the
  SAMP-250s also on the F-4E). Every aircraft now carries a weapon for each
  of its delivery profiles. No release or frag numbers were invented, so
  their attacks and cards carry the "no data on file" caution.
- **A link import knows these stores and counts racks of them.** A count
  written straight before the weapon's name (`BRU-42 - 3 x Mk-20 …`,
  `2x CBU-52B … (TER)`) is now read, for every bomb and missile.
- **Thirteen more bombs, by name only** (2026-11-13): Mk-81 and its Snakeye,
  Mk-83 and its AIR, BR-250, BR-500, BLU-107 Durandal, CBU-103, CBU-105,
  BL-755, CBU-1/A, CBU-2/A and CBU-2B/A, each carried by the aircraft whose
  DCS pylon table loads it. No release or frag numbers were invented, so
  their attacks and cards carry the "no data on file" caution. A link import
  loads them.
- **The Durandal is laid down, never dived** (2026-11-13, the user's call).
  Its attacks are offered level profiles only, so on the Mirage F1 and F-15E
  (whose high-drag default is a 30° dive) it builds the 500 ft laydown. Other
  high-drag bombs keep their defaults (`LEVEL_ONLY_WEAPON_IDS`,
  `src/lib/weaponClass.ts`).
- **Fix: "Mk-82 SnakeEye" loads as the retarded Mk-82 Snakeye** (2026-11-13).
  DCS spells it that way in some store names, and they used to load as the
  low-drag Mk-82, so the attack was planned for a slick bomb. The Mirage F1's
  "Snakeyes" is the same fix.
- **Rack counts written as a bare number are read** (2026-11-13). The F-14's
  `MAK79 3 Mk-82`, a leading `2 Mk-81`, a trailing `GBU-12 * 2` and the Mirage
  F1's `AUF2 GBU-12 x 2` load as the right number of bombs, not one. A rack's
  own number (`BRU-42 Mk-82`) is never a count.
- **A CLI/.miz import fills each jet's loadout** (2026-11-13). The FragOrders
  CLI writes a jet's pylons as DCS CLSIDs (`{HB_F4E_MK-82_6x}`), which the
  import now turns into DCS store names with a table generated from the public
  pydcs list and the A-4E-C mod, then loads exactly as it loads a link's. An
  empty pylon (`<CLEAN>`) is nothing, air-to-air, tanks and pods are dropped,
  and a CLSID with no name on file stays on the loadout under the CLSID,
  marked "not in the weapon table". Regenerate with `npm run gen-clsids`.
- **Weights for the 26 name-only weapons, and a frag floor for the Mk-83**
  (2026-11-13). Every one of them now has a sourced weight (the loadout
  picker shows it, "(489 lbs)"). The Mk-83 has a 1,300 ft frag floor, so its
  attacks and cards lose the "no data on file" caution, print "MIN SAFE", and
  auto-build enforces the floor (every Mk-83 dive and pop-up profile already
  released above it, so no release moves). The BLU-107, CBU-105 and CBU-103
  have release limits too (none moves a release), and keep the caution. The
  Rockeye and CBU-99 keep it as well: a 1,380 ft fragment ceiling was
  considered as their floor and rejected, because a floor blocks saving the
  normal 500 ft laydown. Sources are in each row's `notes`.

### v0.3.3 — 2026-10-03
- **Jets arrive loaded.** After a FragOrders link import each pilot's loadout
  holds the air-to-ground stores the mission author loaded. Auto-build starts
  on a weapon the jet carries: bombs and strike missiles first, then
  anti-radiation missiles, rockets and gun pods. The import preview lists each
  jet's stores and the roster shows one store per line. A store the weapon
  table doesn't know is kept and marked "not in the weapon table". A CLI/.miz
  import still arrives empty.
- **Each aircraft is offered its own weapons.** All ten aircraft have a bomb
  and missile list, checked against the module manuals and Chuck's Guides. A
  **Show all weapons** checkbox under the weapon list lifts the filter, and a
  jet's carried weapons and an attack's current weapon are always listed.
- **Four new weapons, by name only:** GBU-16, AGM-65F, AGM-122 and the GAU-12
  gun pod. No release or frag numbers were invented, so their attacks and
  cards carry a "no data on file" caution.
- **The window opens dark.** Every launch used to show a white frame before
  the first paint (checked by the user in the Mac app).
- Design and build notes: `docs/LOADOUT_IMPORT_PLAN.md`.

### v0.3.2 — 2026-09-30
- **Night and NVG kneeboard cards.** A **Lighting** dropdown on the Cards panel
  (desktop and phone) picks Day, Night or NVG for the whole mission, and is
  saved with it; Day stays the default. Night is the squadron's pick N5a
  (dimmest red), NVG is G5a (dimmest green), both with today's attack colours.
  geo-check holds each to its red or green rule and to WCAG AA contrast in
  normal and colour-blind vision.
- **Larger card text.** Every piece of text on the card is two sizes larger
  (squadron vote, 2026-09-30), with the rows, strips and marker discs grown to
  fit. "→ STPT 2" and the wingman "#1" now sit on a plate instead of across a
  line, ROLL fits its disc, and the target elevation prints in whole feet.
- **Sharper cards.** Cards export at 3× — 2304×3072, the same 3:4 layout — so
  text stays crisp when DCS stretches the kneeboard on a big monitor or in VR.
  Still lossless PNG, about 1–2.5 MB each; the map uses one zoom level finer.
- **Manual-dive cards show the sight setting** (e.g. `SIGHT 100 mils`) for the
  A-4E, F-4E, F-5E and Mirage F1. It was dropped as the profiles loaded, in
  every release since 0.2.0; a Rust test now covers the loader. It sits in the
  card header after the delivery mode ("set before IP"), not at the roll-in,
  and leads the attack editor's key numbers.
- Under the hood: every colour on the card comes from a theme, and each
  theme's drawing is pinned by draw-call hashes in geo-check.
- **Waypoints are fixed.** The route is the mission author's: the waypoint
  list lost its delete button, and nothing in the app can add, edit, delete
  or move a waypoint. Custom IPs still drag.
- **⚙ Settings → Squadron profiles → Open profiles folder** (desktop).
- **Undo and redo** for mission edits: ⌘/Ctrl+Z, and ⇧⌘/Ctrl+Z or Ctrl+Y to redo.
  Keystrokes in one field are one step; 50 steps; the attack editor's draft is
  outside it. No toolbar buttons yet, so the phone has no way to undo.
- **Brief Pack (.zip)** button on the Cards panel: one zip with every pilot's
  cards under `Kneeboard/<DCS aircraft folder>/`, the mission file (without
  author-hidden threats) and a README. Desktop asks where to save; the web app
  downloads it. Not on the phone layout yet.
- **Copy** on each attack in the Attack Plan: a small button, like Edit, that
  opens a menu of the other pilots, and copies the attack to one as a
  plain attack. The same aircraft type keeps hand edits; another type is rebuilt
  by auto-build (its own profile and sight number) and keeps the target, IP,
  flank and weapon. Coordinated strikes are not copied as a group.

### Phone web app — live 2026-09-26 (not a desktop release)
- **The full planner on iPhone and Android**, at
  https://dropthehammer.github.io/Phoenix_weaponeer/:
  - a phone layout;
  - autosave and My missions;
  - kneeboard mode;
  - Share all;
  - "Strike near me".

  The plan and handoff log are in `docs/MOBILE_WEB_PLAN.md`.
- **It follows the desktop app.** Every push to `main` builds it as a check, and
  publishing a release publishes it.
- **Pure-Rust map math in place of PROJ**, and no SQLite. It matches PROJ to 0.02 mm
  on every theater, and the shared engine now lives in `crates/core`.
- **Checked by the user on screen:**
  - the desktop click-through;
  - the live site on an iPhone;
  - a FragOrders link import on the live site, which works straight from the
    browser, so no proxy is needed.

### v0.3.1 — 2026-09-26
- FragOrders `http://` share links accepted (GitHub issue #1).
- **Strafe and rocket attacks** can be chosen: named guns and rockets per
  aircraft (DB v4). A rocket pass no longer shows the Mk-82 sight setting.
- **Strike lead is the jet first on target.** This also fixed removing a jet
  after a pilot swap shifting every time over target by 30 s.
- Recent missions on the front page.
- Card "Map background" switch remembered between launches.
- Quit button in the header.
- Old planning docs archived; this roadmap rewritten as the single list.

### v0.3.0 — 2026-09-24
- **Live-geometry Customize:** full-screen editor with a slider and number box
  for every setting, beside a live map and side view.
- **Multi-ship coordinated strike:**
  - Group and per-jet tabs.
  - Mirrored split, with time-on-target spacing, frag clear time and IP push
    time.
  - One shared IP for the whole flight.
  - Faint wingman tracks on each card.
- Repo made public under PolyForm Strict.

### v0.2.3 — 2026-09-23
- **FragOrders public-link import:** paste the link and the mission loads
  (now `crates/core/src/fragorders_link.rs`).

### v0.2.2 — 2026-09-15
- **Threats the mission author hid** stay off the map, the geometry and the
  cards. ⚙ Settings → Admin can reveal them for the current session.
- Unnamed airfield waypoints are named after their airfield.

### v0.2.1 — 2026-09-15
- **⚙ Settings, with a kneeboard folder chosen per aircraft type.** This
  replaced the guessed DCS folder.
- Grey map layer behind each card.
- **Custom IP:** drag it on the map. ⌘Q is guarded against unsaved work.
- 0.2.1 security and cross-platform review closed:
  - CSP turned on.
  - Shared mission files are validated before they load.
  - Save commands only write `.json` or `.png`.
  - An error screen replaces a crash.

### v0.2.0 — 2026-09-12
- **Revamp M0:** fixes to what the card showed:
  - Egress wording.
  - Weapon sanity checks.
  - Release-altitude floors.
  - A warning strip on cards for unverified maps.
- **Revamp M1:** a profile library (62 seed profiles across 10 aircraft) and
  auto-build: pick target, attacker and weapon, and the attack builds itself.
- **Level CCRP / AUTO and dive (CCIP, manual with mils, DTOS).** Level
  attacks use an offset leg (1.5× run-in, 30° check turn).
- **Handbook pop-up from an action point:**
  - The card is now pictures: north-up plan view plus a side view, with no
    step list.
  - Chained attacks.
- **Map:**
  - Labels that don't collide.
  - Selecting in a list highlights on the map, and the reverse.
  - Display filter.
  - Threat rings drawn as outlines only.
  - Threat database v3.
- Any waypoint can be the target or the IP. Waypoint numbers match the
  cockpit STPT, with waypoint 0 as the spawn point.
- The rebuilt FragOrders CLI export is supported, and the **Sinai projection
  is verified**.
- Installers build on macOS, Windows and Linux (release CI fixed).

### Before the revamp (v0.1.x, 2026-01 → 2026-09-05)
- Tauri + React foundation, SQLite reference data, and FragOrders JSON import.
- Leaflet map, threat rings, adding and dragging planning threats, and proj4
  coordinate conversion.
- Pop-up CCIP calculator, flight roster and loadouts.
- 768×1024 kneeboard card renderer, PNG export and batch export.
- Bugfix sprint (2026-07-26, `docs/archive/BUGFIX_PLAN.md`).
- Theater projections for 12 of 13 maps (2026-07-29).
- Mission save and load: Open, Save and Save As, the unsaved-changes guard,
  and ⌘/Ctrl+S.

---

## Decided — not doing

Settled with the user. Don't reopen these without asking.
- Attack #1's egress preferring attack #2's run-in: the threat-aware egress
  stays (2026-09-09).
- Fuze-dependent release floors: the tool assumes impact detonation
  (2026-09-09, `docs/DELIVERY_PLANNING.md`).
- A step-by-step text checklist on the card: the card is the map (2026-09-07).
- Wingman tracks on a card stay cut off at the frame, which stays on this
  jet's attack (2026-09-26).
- Clock times for time on target: offsets from the lead only (2026-09-23).
- A shared IP outside a strike: the strike covers the flight case
  (2026-09-23).
- Rust attack calculators (deleted 2026-09-09) and a `weapon_class` DB column
  (derived in TypeScript instead).
- Changing the Day card's or the planner's colours for accessibility
  (2026-09-29). The contrast audit found Day passes 67% of WCAG 2.1 AA checks,
  and its red attack and green egress lines merge for green-blind pilots.
  The user keeps today's colours anyway, because users know them. This is
  parked for a far-future UI/UX overhaul, not closed. The accessibility
  targets apply to the new Night and NVG cards.
- Deleting or editing imported waypoints: the route is the mission author's
  and stays fixed (2026-09-29, memory `project-imported-waypoints-are-fixed`).
- An aim-off row on a dive card, on any aircraft (2026-11-15). A CCIP jet's
  pipper already gives the aim point, the A-4E and F-4E compute the release,
  and a manual jet sets its sight from the mils in the card header (from its
  SOP). The dashed aim line stays on the map.
