# Phoenix Weaponeer — Roadmap

Cross-platform desktop planner for DCS World strike missions: import the
FragOrders brief, lay down threats, auto-build each jet's attack, and export
kneeboard cards.

**This is the one to-do list.** Keep it current when something ships or is
decided. The detail behind every line is in `docs/SESSION_HISTORY.md`
(newest-first). Finished plans and reviews are in `docs/archive/`.

**Last updated:** 2026-10-03

---

## Open

### Attacks and weapons
- [ ] **Loft geometry** (LABS, F-16 loft). The profiles ship hidden
      (`f16c.loft.std`, `f4e.loft.labs45`) until the geometry exists.
- [ ] **Cluster and high-drag rows the other aircraft actually carry.** The
      only cluster rows are the CBU-87 and CBU-97. The F/A-18C, F-14, AV-8B
      and A-4E-C carry Rockeye, the F-5E the CBU-52 and the Mirage F1 the
      Belouga, so those six have cluster profiles and no cluster weapon of
      their own ("Show all weapons" reaches the CBU-87). The Mirage F1 also
      has no high-drag bomb: its SAMP bombs have no row. The gaps are pinned
      in `crates/core/src/profiles.rs` (`KNOWN_CLASS_GAPS`).
- [ ] **Release and frag numbers for the four name-only rows** (GBU-16,
      AGM-65F, AGM-122, GAU-12 pod). Until then their attacks and cards carry
      a "no data on file" caution and no floor is enforced.
- [ ] Sight settings for rockets on the manual-dive profiles. Rocket cards show
      no sight number, on purpose: the A-4E, F-4E, Mirage F1 and F-5E profiles
      carry Mk-82 values that auto-build applies to bombs only. Needs
      per-rocket numbers from the manuals.
- [ ] **Loadout from a CLI/.miz import.** A FragOrders link import fills the
      loadout (see Unreleased). The CLI/.miz path carries DCS CLSIDs, needs a
      CLSID → weapon table, and still arrives with an empty loadout.
- [ ] Store names the link import does not place yet. Russian and Chinese
      air-to-air missiles, and pods outside the skip list, show as "not in
      the weapon table" where they should be dropped. Rockets are mapped for
      five aircraft only; the others have not been checked.
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
  - [ ] The Loadouts list and the roster with long loadouts (a real link,
        such as the Syria capture in `test-data/private/fragorders-links/`).
  - [ ] The same screens on the iPhone.

The in-use check of 0.3.2 is closed: the user reported every item as fine
(3× cards in DCS and the Lighting dropdown on 2026-10-01; the iPhone carousel
at 3×, the larger card text, the amber SIGHT header, the Copy menu and the
waypoint list on 2026-10-03).

---

## Shipped

### Unreleased (on `main`, next desktop release)
- Nothing yet.

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
