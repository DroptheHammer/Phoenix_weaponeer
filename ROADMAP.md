# Phoenix Weaponeer — Roadmap

Cross-platform desktop planner for DCS World strike missions: import the
FragOrders brief, lay down threats, auto-build each jet's attack, and export
kneeboard cards.

**This is the one to-do list.** Keep it current when something ships or is
decided. The detail behind every line is in `docs/SESSION_HISTORY.md`
(newest-first). Finished plans and reviews are in `docs/archive/`.

**Last updated:** 2026-09-26

---

## Open

### Attacks and weapons
- [ ] **Loft geometry** (LABS, F-16 loft). The profiles ship hidden
      (`f16c.loft.std`, `f4e.loft.labs45`) until the geometry exists.
- [ ] **Bomb and missile tables for aircraft other than the F-16C.** Every
      aircraft sees every bomb. `aircraft_weapons` maps bombs for the F-16C
      only; guns and rockets are mapped per aircraft since v0.3.1.
- [ ] Sight settings for rockets on the manual-dive profiles. These cards
      show no sight number yet.
- [ ] **Loadout from the FragOrders pylons.** Imports set an empty loadout.
      Needs a DCS CLSID → weapon table.
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
- [ ] Copy and paste attacks between flight members.
- [ ] Undo and redo.
- [ ] "Open profiles folder" button (`reveal_profiles_dir` exists, no button).

### Output
- [ ] **One-click brief pack.** Part of the old revamp plan's M3 milestone:
      one zip laid out for Saved Games, with every pilot's PNGs and the
      mission file. Export All to Folder and Export to DCS cover most of it
      today.
- [ ] PDF export. Only if the squadron asks for it.

### Untested platforms
- [ ] Kneeboard export on Windows. The folder flow is only tested on macOS.
- [ ] Card fonts on Linux (review L8), and map tiles on WebView2 / WebKitGTK
      (review L9).

---

## In progress — v0.3.1

- [x] FragOrders `http://` share links accepted (GitHub issue #1)
- [x] Quit button in the header
- [x] Old planning docs archived; this roadmap rewritten
- [x] Strike jet order: the jet first on target stays the lead when the strike
      is reopened. This also fixed removing a jet after a pilot swap shifting
      every time over target by 30 s.
- [x] Card "Map background" switch remembered between launches
- [x] Recent missions on the front page
- [x] Strafe and rocket attacks can be chosen: named guns and rockets per
      aircraft (DB v4). A rocket pass no longer shows the Mk-82 sight setting.
- [ ] On-screen check by the user, then release

---

## Shipped

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
  (`src-tauri/src/fragorders_link.rs`).

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
