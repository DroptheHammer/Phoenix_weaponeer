# Phoenix Weaponeer revamp — M0 → M1 → M2 → M3

## Context

The tool was built for a specific Saturday moment: after the PowerPoint brief and
the group FragOrders review, flights break out into Discord channels, and a
**strike flight lead** spends a few minutes turning the FragOrders brief into
per-pilot kneeboard cards, then posts them to the flight. The squadron flies a
wide range of aircraft (1960s → modern, a different one each weekend, ~70%
mil-sim), and the reason a planner is needed at all is that **1960s–80s strike
aircraft need real delivery guidance** — manual dive with sight depression,
dive toss, LABS — that pilots don't carry in their heads.

What exists does the hard plumbing well (import, accurate positions on 12 maps,
map with threat rings and attack geometry, a good-looking card, export into
DCS, save/load). What it gets wrong is the *shape* of the work:

- **It asks the pilot to be the weaponeer.** One profile (popup CCIP — the
  rarest attack in casual DCS), reached through a four-step modal ending in ~15
  numeric fields. The tool knows nothing; the user supplies everything. The
  card I inspected shows the consequence: a **GBU-31 JDAM in a pop-up dive**,
  a release at 3,500 ft under a 4,500 ft min-safe with no complaint, and
  "EGRESS RIGHT **undefined°**" printed twice.
- **Five floating buttons, no path.** "I need to find ATTACK before I can add
  one." Adding a threat is four clicks through a modal.
- **The output stops on the lead's disk.** No pack, no send step.

**Decisions taken with the user (2026-09-05):**
- Order: **M0 trust fixes → M1 profile library → M2 map-first → M3 send to
  flight.** Define what an attack *is* before adding handles to it, so the map
  handles manipulate a profile's few free parameters instead of 15 fields.
- **Auto-build is the default experience.** Pick target, attacker, weapon → the
  tool fills a complete attack from a preset, guarantees no alerts (raises a
  release altitude that would trip min-safe, etc.), and shows only the big
  decisions: heading, left/right egress, the key numbers. A **Customize**
  button reveals the rest.
- Aircraft seed: **F-16C, F/A-18C, A-10C II · F-4E, A-4E-C, F-5E · F-14A/B,
  Mirage F1, AV-8B, F-15E.** Red-side aircraft later.
- **Numbers ship as ESTIMATED.** Every profile carries `source` and
  `verified: false`; the card prints "ESTIMATED — verify in DCS" until a pilot
  flies it and the flag is flipped. Same honesty model as the map projections.
- FragOrders URL import waits for the FragOrders author; nothing here depends on it.
- The Extract Plan's *schema* idea (fixed common fields + flexible per-aircraft
  params) is adopted — as human-editable JSON files, not PostgreSQL. The PDF
  extraction pipeline is out of scope.

**Sizing (sessions):** M0 ≈ 1 · M1 ≈ 3–5 (half of it is data) · M2 ≈ 3–4 ·
M3 ≈ 1–2. Every milestone leaves the app usable and demo-able.

---

## Step 0 — Snapshot before anything changes

The user wants a rollback point before the revamp starts. Current state is
commit `13067c1` on `main`, clean and in sync with GitHub.

1. Annotated tag **`v0.1-pre-revamp`** at `13067c1` ("Last commit before the
   profile-library / map-first revamp") — tags are the permanent, immutable
   marker.
2. Branch **`pre-revamp`** at the same commit — visible in GitHub's branch
   list, trivially checkoutable, and safe from `main` moving on.
3. Push both: `git push origin v0.1-pre-revamp pre-revamp`, then confirm on
   GitHub (`gh api repos/:owner/:repo/git/refs/tags/v0.1-pre-revamp`).
4. Record the rollback recipe in CLAUDE.md's pickup notes so a future session
   knows it exists:
   - Look around: `git checkout v0.1-pre-revamp` (detached), or `git switch
     pre-revamp`.
   - Full rollback of `main`: `git revert` the revamp commits (keeps history),
     or — only if the user says so — `git reset --hard v0.1-pre-revamp` +
     force-push.
   - Cherry-pick a single old file: `git checkout v0.1-pre-revamp -- path`.

Nothing in later milestones deletes or rewrites this tag.

## M0 — Trust fixes (next session)

Small, and none of it should be shown to the squadron un-fixed.

1. **Egress heading "undefined°".** The overlay already derives an egress
   heading (it draws the green line and labels "Exit 158°"); the card prints
   the raw, often-unset `profile.egressHeading_deg` at
   `src/lib/buildKneeboardCard.ts:128,199,263,296`. Add a single
   `resolveEgressHeading(profile, attackHeading)` in
   `src/lib/attackGeometry.ts`, use it in both the overlay and the card, and
   default the form field to it.
2. **Unverified-map caution on the card.** `buildKneeboardCard` gets the
   `verified` flag via `getTheaterInfo(mission.theater)`
   (`src/stores/theaterStore.ts:52`, non-reactive, fail *warn-open*), sets
   `header.caution`; `renderKneeboardCanvas.ts` draws a 20 px amber strip
   under the header (add an amber pair to the palette `C` — red already means
   danger on this card).
3. **Card layout budget.** Worst-case popup card (5 steps × 3 lines, 5 threats,
   min-safe line) already runs 16 px under the footer at y = 998. Make
   `drawSteps` measure first and use compact spacing (gap 6→2, line 19→17)
   only when it would overflow. Needed anyway before M1 adds lines.
4. **Sanity warnings from data that already exists.** `weapons` has
   `min_release_alt_ft`, `max/min_release_speed_ktas`, `frag_min_safe_alt_ft`,
   `guidance`. New `src/lib/attackChecks.ts` returns `{ level: 'error'|'warn',
   text }[]` for: release below weapon min release alt; unguided release below
   frag min-safe; speed outside limits; guided weapon (`guidance != none`) on a
   CCIP/popup profile. Shown in the editor's existing `missingRequirements`
   area and as red ⚠ lines on the card. (M1's auto-build then guarantees these
   are empty by construction.)

**Verify:** gates green; NTTR import → card shows a real egress heading; Sinai
fixture card shows the amber strip; hand-build a JDAM pop-up and see the
warning.

---

## M1 — Profile library + auto-build (the core)

### 1. Data model — `DeliveryProfile`

`src/types/profile.types.ts` (TS) and a matching Rust struct with
`#[serde(rename_all = "camelCase")]`:

```
id            "f16c.bomb_ld.lald10"
aircraftId    "f16c"                      ← matches aircraft.id in the DB
name          "LALD 10°"                  summary "Low-angle low-drag, 500 ft release"
geometry      "level" | "dive" | "popup" | "loft"
deliveryMode  "CCIP" | "CCRP" | "AUTO" | "DTOS" | "MAN" | "LABS" | "LADD" | "VIS"
weaponClasses ["bomb_ld", "bomb_hd", "lgb", "jdam", "rocket", "gun", "cluster", "agm"]
params        geometry-specific numbers (diveAngle_deg, rollInAltitude_ft,
              releaseAltitude_ft, releaseSpeed_ktas, runInAltitude_ft,
              popDistance_nm, apexAltitude_ft, pullUpDistance_nm …)
sight?        { depression_mils, notes }   ← manual deliveries (F-4E, A-4, F-5, F1)
procedure?    ["WRCS: DIRECT, sight 85 mils", "Master arm ON"]  aircraft-specific step lines
default?      true                          ← preferred profile for that class
source        "476th vFG Battle Book" / "Chuck's Guide F-4E" / "community practice"
verified      false   verifiedBy? verifiedOn?
```

**Geometry is the unifying idea:** one `dive` geometry serves CCIP, manual
(mils) and DTOS; one `level` geometry serves CCRP/AUTO/JDAM/LGB; `popup`
exists; `loft` (LABS, F-16 loft) is deferred — its profiles ship in the files
but are hidden until the geometry lands (M1b).

### 2. Where profiles live

- Bundled: `src-tauri/resources/profiles/<aircraftId>.json`, one file per
  aircraft, embedded with `include_str!` (no resource-path issues; the DB seed
  is already in-code). No `bundle.resources` config needed.
- Squadron overrides: `<app_data_dir>/profiles/*.json` (same dir as the DB,
  `src-tauri/src/lib.rs:28`); same shape, matching `id` replaces the bundled
  entry. A "Open profiles folder" button (shell plugin, already installed) so
  a pilot can flip `verified` after flying one.
- Rust `list_delivery_profiles` command → `Vec<DeliveryProfile>`, following
  `list_theaters` (`src-tauri/src/commands/mod.rs:175`). Frontend
  `src/stores/profileStore.ts` following `theaterStore.ts`.
- **Rust test:** every bundled file parses; every `geometry`, `deliveryMode`,
  `weaponClass` is a known value; every `aircraftId` exists in the aircraft
  seed; every profile's own numbers pass `attackChecks` (release ≥ min release
  alt, roll-in above release, etc.). This is what catches a seed typo.

### 3. Weapon classes and loadout from import

- Weapons need a class. Add `weapon_class` to the `weapons` table seed
  (`src-tauri/src/db/mod.rs:125,222`) — derive from `category` + `guidance`
  where possible, set explicitly for LD vs HD (Mk-82 LDGP → `bomb_ld`,
  Mk-82 AIR/Snakeye → `bomb_hd`).
- **Loadout from FragOrders.** `Payload.pylons` is parsed
  (`src-tauri/src/parsers/fragorders.rs:191`) and dropped; every flight member
  gets `loadout: []` (`src/stores/missionStore.ts:183`). Add `dcs_clsid` to
  the weapons seed for the weapons we carry, map pylon CLSIDs at import, list
  unmapped stores as "unknown" in the preview. Fallback when nothing maps: the
  weapon picker filtered by `aircraft_weapons`.

### 4. Auto-build — `src/lib/autoBuildAttack.ts`

Pure function: `(mission, targetWaypointId, attackerId, profiles, weapons,
threatSystems, overrides?) → { attack, adjustments[], warnings[] }`.

1. Attacker → `aircraftId`; weapon = first A/G store in the loadout (or
   `overrides.weaponId`).
2. Weapon class → candidate profiles for that aircraft; pick `default: true`,
   else first.
3. IP = nearest waypoint typed `ip` preceding the target in steerpoint order,
   else the previous waypoint. Heading = `calculateBearing(IP, TGT)`
   (`src/lib/coordinates.ts` — do not add a fifth bearing implementation).
4. Egress side = away from the nearest threat to the attack axis (cross-track
   sign); right if no threats. Hard deck = target elevation + squadron
   default (500 ft AGL) unless the profile says otherwise.
5. Run `attackChecks`; if a default would trip one, **adjust upward to the
   limit** and record it ("release raised 3,500 → 4,500 ft: frag min-safe").
   Auto-build never returns an error-level check.

### 5. Editor redesign — replace the four-step modal

`AttackEditor.tsx` becomes a panel (right sidebar, opened from a target):

```
Target  TGT1 ▾      Attacker  Viper 1-1 (F-16C) ▾      Weapon  2× Mk-82 LDGP ▾
Profile  [LALD 10° ✓] [30° Dive CCIP] [45° HAHD] [Pop-up 4 nm]      ESTIMATED
Heading  248° (auto from IP)   Egress  ◀ LEFT  RIGHT ▶
Roll-in 8,000 ft · Release 4,500 ft @ 450 kt · 30° dive · Min-safe 4,500 ft
Adjusted: release raised to 4,500 ft (frag min-safe)
▸ Customize                                                        [Save attack]
```

- Every change re-runs auto-build; **no Calculate button** and no
  `calcResult` gate on Save (`AttackEditor.tsx:119-130`). `canSave` = no
  error-level checks.
- **Customize** expands the existing `PopupCCIPForm` (now one of three forms:
  `LevelForm`, `DiveForm`, `PopupCCIPForm`) pre-filled from the profile;
  edits mark the attack "customized from <profile>".
- Rust `calculate_popup_ccip` stays for popup-derived values (climb angle,
  roll-in, time to release). Level and dive need no calculator — the profile
  *is* the numbers; `attackChecks` validates them.

### 6. Geometry, overlay, card for the two new types

- `src/lib/attackGeometry.ts`: add `calculateLevelGeometry` (run-in from IP
  along heading, release point at computed release range, egress) and
  `calculateDiveGeometry` (roll-in point at ground range
  `rollInAlt / tan(dive)`, release point at `releaseAlt / tan(dive)`, egress).
  Pure, cheap — they run on every drag in M2.
- `AttackProfileOverlay.tsx` draws by `geometry`; `MARKER_Z` unchanged.
- `buildKneeboardCard.ts` / `renderKneeboardCanvas.ts`: level and dive
  side-profile diagrams; step text keyed by `deliveryMode` — CCIP ("pipper
  on target"), MAN ("sight 85 mils, release 4,500 ft AGL @ 450 KIAS"), DTOS
  ("designate, pull, release on cue"), CCRP/AUTO ("release cue"); profile
  `procedure` lines merged in; ESTIMATED badge in the header; ⚠ lines from
  `attackChecks` (should be none on auto-built attacks).

### 7. Seed profiles (all `verified: false`, `source` noted)

Roughly 3–6 per aircraft, bombs first:

- **F-16C** Mk-82 LALD 10° / 30° dive CCIP / 45° HAHD / pop-up 4 nm
  (existing); GBU-12 CCRP level; JDAM CCRP level.
- **F/A-18C** Mk-82 30° / 45° CCIP; GBU-12 AUTO level; JDAM AUTO level.
- **A-10C II** Mk-82 30° / 45° CCIP; GBU-12 CCRP; gun strafe 30° (`gun`,
  dive geometry, release = open-fire slant range).
- **F-4E** Mk-82 30° / 45° manual dive with mils; DTOS 30°; Snakeye laydown
  level 500 ft; LABS loft (file only until M1b).
- **A-4E-C** Mk-82 30° / 45° manual dive (mils); CP-741 30°; Snakeye laydown.
- **F-5E** Mk-82 30° / 45° manual dive (mils).
- **F-14A/B** Mk-82 30° / 45° CCIP; GBU-12 LANTIRN level.
- **Mirage F1** Mk-82 30° / 45° manual dive (depression table values).
- **AV-8B** Mk-82 30° CCIP; GBU-12 AUTO level.
- **F-15E** GBU-12 CCRP level; JDAM level; Mk-82 30° CCIP.

**Verify M1:** gates green (profile tests included); import NTTR → select
TGT1 → auto-build in **three picks** with zero warnings and a card in the
preview; F-4E manual dive card shows mils; JDAM cannot be paired with a dive
profile; edit a bundled number in the override folder and see it win.

---

## M2 — Map-first, hands-on (outline; detailed plan when M1 lands)

- **Rail organised by the job** replacing the five toggles in `App.tsx`:
  **Targets** (each target with its attacks as chips and "+ Attack" inline),
  **Threats**, **Flight**, **Cards**; a readiness line ("2 targets · 1 without
  an attack · 4 cards ready").
- **Threat palette:** chips for common systems dragged onto the map (HTML5
  drag → `map.containerPointToLatLng` on drop). Two motions instead of four
  clicks; click a placed marker to change type or remove. Reuses the existing
  drag-end → store pattern (`MapView.tsx:194`).
- **Attack handles** on the overlay: run-in end (rotates heading = bearing
  from target), roll-in/pop point (distance along the axis), egress arrow
  (click to flip). Local state during drag, commit on `dragend`; card updates
  on commit. Geometry is TS and cheap; the popup Rust calc runs on commit only.
- **Exposure colouring:** sample points along each run-in segment against
  threat rings (`calculateDistance`); segments inside a ring draw red. The
  "playing with the heading around a SAM" loop.

## M3 — Send to flight (outline)

- One button: per-pilot PNGs (Discord shows them inline), a zip laid out as
  `Kneeboard/<aircraft>/<callsign>_<tgt>.png` ready to drop into Saved Games,
  the mission `.json`, and a one-line README. Reuses the three export flows in
  `KneeboardPreview.tsx`; adds a `zip` crate on the Rust side.
- PDF pack (Phase 3.3) only if the squadron asks.

---

## Files touched in M0 + M1

| Area | Files |
|---|---|
| Card fixes | `src/lib/buildKneeboardCard.ts`, `src/lib/renderKneeboardCanvas.ts`, `src/types/kneeboard.types.ts` |
| Checks | **new** `src/lib/attackChecks.ts` |
| Geometry | `src/lib/attackGeometry.ts` (egress resolver, level + dive geometry) |
| Profiles | **new** `src/types/profile.types.ts`, `src/stores/profileStore.ts`, `src-tauri/resources/profiles/*.json`, Rust `list_delivery_profiles` + struct + tests in `src-tauri/src/commands/mod.rs` |
| Auto-build | **new** `src/lib/autoBuildAttack.ts` |
| Editor | `src/components/attacks/AttackEditor.tsx`, `forms/PopupCCIPForm.tsx`, **new** `forms/LevelForm.tsx`, `forms/DiveForm.tsx` |
| Overlay | `src/components/map/AttackProfileOverlay.tsx` |
| DB / import | `src-tauri/src/db/mod.rs` (weapon_class, dcs_clsid), `src-tauri/src/commands/mod.rs` (pylon → loadout), `src/stores/missionStore.ts` |
| Types | `src/types/attack.types.ts` (`deliveryMode`, `sourceProfileId`, `sightDepression_mils`) |

## Gates (every session)

- `npm run build` — zero TS errors
- `cd src-tauri && cargo test` — all green (31 today; profile tests add more)
- Manual checks listed under each milestone, in `npm run tauri dev`
- Commit + push; `git status` shows `## main...origin/main` with nothing after

## What I'll need from you along the way

- Pilots to fly a profile and tell me "verified" (or the corrected number) —
  that's the only way ESTIMATED goes away.
- Squadron defaults to encode: hard deck (I'm assuming 500 ft AGL), minimum
  speeds, anything your SOPs fix.
- Which loadouts the strike flights actually carry, so the CLSID mapping
  covers the real stores first.

## Deferred / out of scope

- Loft geometry (LABS, F-16 loft) — M1b, after level and dive.
- Red-side aircraft profiles; F-15E WSO-specific procedures.
- PDF pack; FragOrders URL import; .miz / Tacview import.
- Folding the four hand-rolled modals onto `Modal.tsx` (mechanical; own commit).
- Offline map tiles (the map is OpenStreetMap online today).
