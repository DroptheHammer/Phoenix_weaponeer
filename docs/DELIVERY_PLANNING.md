# Delivery planning reference — pop-up and dive deliveries

What public F-16 documentation says a pop-up attack is, how it is planned,
and what that implies for the profile library. Written 2026-09-07 after the
question "isn't this in the docs?" — it was not. It is now.

## Sources

1. **Korean Air Force Basic Employment Manual, Volume 5 (F-16C), 1 October
   2005**, §5.14 "Pop-Up Deliveries" (pp. 5-78 … 5-82), §5.16.4 repositioning
   (5-91 … 5-92), **§5.17 "Pop-Up Formulas"** with a worked example (5-92 …
   5-97), §5.6 computed visual bombing, §5.8 tactical considerations (dive
   bomb, HADB, LAT). Unclassified. A direct derivative of the USAF
   **MCH 11-F16 Volume 5, "F-16 Combat Aircraft Fundamentals"**.
   http://falcon.blu3wolf.com/Docs/Basic-Employment-Manual-F-16C-RoKAF.pdf
   (11 MB; text-searchable. Page numbers below are PDF pages; printed pages
   are 5-nn.)
2. **MCH 11-F16 Vol 5** itself, mirrored by FAS:
   https://man.fas.org/dod-101/sys/ac/docs/16v5.pdf — the diagram the user
   pasted ("PUP · pop-to-pull-down distance · angle off · pull-down point ·
   apex · track point · release · AOD · MAP") is its Figure. The mirror sits
   behind a bot check; the BEM above carries the same text and formulas.
3. **"Pop-up Attack Manual" v4.7, Cars "Falcas" Burgers** (Falcon BMS
   community; cites MCH 11-F16 Vol 5 as its reference). Image-only PDF, but a
   clean worked example and the Type I / Type II distinction below.
   https://www.e-haf.org/PublicFTP/BIBLIO8HKH/POPUP/PopupAttack_4_745.6/Pop-up%20Attack%204_72%20Manual.pdf

## Definitions (BEM §5.14.2–5.14.3, p. 395–397)

- **Approach heading** — flown during the wings-level pull-up and climb.
- **Attack heading / attack axis** — flown during the wings-level attack.
- **Angle-off** — the difference between approach and attack heading.
  - *Direct pop-up*: angle-off < 15°. *Offset pop-up*: > 15°.
    *Indirect pop-up*: > 90°.
- **IP** — steerpoint where the last leg begins, normally 10–20 NM out.
- **Action point / range** — where you take the offset for an offset pop-up.
- **Pop point (PUP)** — where the climb is initiated.
- **Climb angle** — angle of climb after the pop.
- **Pop-to-pull-down distance** — PUP to pull-down point; "predictable for a
  specific set of delivery parameters".
- **Pull-down point (PDP)** — transition from climb to dive.
- **Apex** — highest altitude in the profile ("normally achieved about
  halfway through the pull-down").
- **Track point** — roll-out, wings level, tracking begins.
  **Tracking time** — wings-level time from roll-out to release.
- **MAP (Minimum Attack Perimeter)** — circle round the target at the
  distance where roll-out and tracking begin. **MAP distance** = bomb range
  + horizontal tracking distance.
- **AOD (Aim-Off Distance)** — ground distance at 12 o'clock beyond the
  target where the nose points during tracking.
- **Release altitude** — AGL. The tool treats it as a floor ("release by").

Two ways to arrive at the PUP (Falcas Type I / Type II, matching BEM
§5.17.1.6): **Type I** — run in at the target, turn off by the offset angle
at the action point, then pop; **Type II** — run in already on the offset
track from the IP and just pop. The tool draws Type II: the IP → PUP → PDP
line is straight and the angle-off is the turn at the apex.

## The formulas (BEM §5.17, p. 410; all altitudes ft AGL, speeds KTAS)

```
GS (zero wind)                = TAS × cos(dive angle)
Horizontal tracking distance  = GS × 1.69 × tracking time
Vertical tracking distance    = TAS × 1.69 × tracking time × sin(dive angle)
MAP distance                  = bomb range + horizontal tracking distance
Track altitude                = pickle altitude + vertical tracking distance
AOD                           = release altitude / tan(dive angle) − bomb range
Horizontal turn radius        = (TAS × 1.69)² / (G × 32.2)

Climb angle                   = dive angle + 5°   for dive angles ≤ 15°
Climb angle                   = dive angle + 10°  for dive angles > 15°   (†)
Angle off                     = 2 × climb angle

Apex altitude      (3–3.5 G)  = track altitude + dive angle × 50
Apex altitude    (4.5–5 G)    = track altitude + dive angle × 37.5
Pull-down altitude (3–3.5 G)  = apex altitude − climb angle × 50
Pull-down altitude (4.5–5 G)  = apex altitude − climb angle × 37.5
Pop-to-pull-down distance     = apex altitude × 60 / climb angle          (ft)
```

(†) The BEM prints "less than 15 degrees" on both climb-angle lines — a
typo. The worked example (15° → 20° climb) and Falcas's 30° dive → 40° climb
fix the second line as "greater than 15°".

Also from §5.14: pop normally at > 450 KCAS; 3–4 G wings-level pull to the
climb angle; unloaded roll toward the target at the pull-down altitude, 3–5 G
pull-down to the dive angle. **Abort** if the actual dive angle exceeds the
plan by more than 5°, or below 350 KCAS (300 above 10,000 ft AGL). Typical
offset pop-up approach course is 15–90° off the attack heading; LAHD (10–15°)
is planned 15–45° off at ~480 KCAS with 3–5 s of tracking; LALD (10–20°)
15–90° off, "optimum angle is approximately 2 × climb angle".

Bomb range comes from ballistics tables the tool does not have. A vacuum
(no-drag) trajectory from release lands within ~1.5% of the table for the
low-drag example below and is what the tool should use for the ESTIMATED
picture; drag makes the real range slightly shorter.

## Worked example (BEM §5.17.1, p. 411–413) and our check

15° LALD, 6 × Mk-82 LDGP with 4 s fuze delay, release **2,000 ft AGL** at
**520 KTAS**, bomb range 5,138 ft (tables), 5 s tracking, 3–3.5 G.

| Quantity | BEM | Our formula run |
|---|---|---|
| Ground speed | 502 kt | 502 |
| Horizontal tracking distance | 4,242 ft | 4,242 |
| MAP distance | 9,380 ft | 9,444 (vacuum bomb range 5,202) |
| AOD | 2,326 ft | 2,262 |
| Vertical tracking distance | 1,137 ft | 1,137 |
| Track altitude | 3,137 ft | 3,136 |
| Apex | ≈ 3,900 ft | 3,900 |
| Pull-down altitude | 2,900 ft | 2,900 |
| Climb angle / angle-off | 20° / 40° | 20° / 40° |
| Pop-to-pull-down | 11,700 ft | 11,700 |
| Turn radius (3.5 G) | 6,853 ft | 6,853 |

Action point for the offset turn: 4.5 NM from the target (BEM's choice so
the same plan works from any IP).

## What this gives for the F-16 library (5 s tracking, 3.5 G, vacuum range)

Release altitudes are the Mk-82 floors the tool already applies.

| Delivery | Dive | Release by | TAS | Climb | Angle-off | Track alt | Apex | Pull-down | Pop→PD | MAP | AOD | PDP from TGT | PUP from TGT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LALD 15° | 15° | 2,000 | 500 | 20° | 40° | 3,100 | 3,800 | 2,800 | 1.9 nm | 1.5 nm | 2,360 ft | 2.2 nm | 3.9 nm |
| Pop 20° | 20° | 3,500 | 480 | 30° | 60° | 4,900 | 5,900 | 4,400 | 1.9 nm | 1.7 nm | 3,170 ft | 2.6 nm | 4.1 nm |
| Pop 30° | 30° | 4,500 | 450 | 40° | 80° | 6,400 | 7,900 | 5,900 | 2.0 nm | 1.5 nm | 2,090 ft | 2.4 nm | 3.7 nm |
| Pop 45° | 45° | 6,500 | 450 | 55° | 110° | 9,200 | 11,400 | 8,700 | 2.1 nm | 1.3 nm | 1,430 ft | 2.4 nm | 3.4 nm |

"PDP" and "PUP from TGT" are ranges from the exact ground track (the pull-down
is an arc of the turn radius through the angle-off, the climb leg runs back
along the approach heading); the familiar "pop at 4 nm" falls out of the
formulas rather than being an input. A 45° pop is an *indirect* pop-up by the
BEM's own definition (angle-off > 90°); 45° is normally flown as dive bomb
from a medium-altitude perch instead.

**The old seed "Pop-up 4 nm" (20° dive, 7,500 ft apex reached 2.14 nm from
the target) does not close**: the line from that apex to the target is 30°,
not 20°. The 7,500 ft apex belongs to a 30° pop releasing by ~4,500 ft. The
2.14 nm / 7,500 ft pair came from an early in-DCS test of a 30° profile.

## Dive bomb, HADB, LAT (BEM §5.8, p. 365–367)

- **Dive bomb (DB)** is 30° or steeper. LALD/LAHD are anything under 30°.
  "Roll-in altitude is achieved through a pop-up, fly-up, or medium-altitude
  ingress." So the library's *30° Dive CCIP from 8,000 ft* is a DB flown from a
  medium-altitude ingress — legitimate, and the manual's stated disadvantage
  applies: exposure to MANPADS and AAA increases significantly.
- **HADB** (high-altitude dive bomb): medium/high altitude, preferably 30° or
  steeper; the manual's HUD picture is a 45° dive at ~11,000 ft, 450 kt —
  the library's *45° HAHD from 12,000 ft* is this. Recoveries stay above
  small arms / light AAA; exposure to SAMs increases; free-fall accuracy and
  CBU patterns get worse.
- **LAT** (low-altitude toss) — the standoff option under a SAM umbrella;
  the library's hidden *Loft 30°* profile is this and is not drawn yet.
- **Dive recovery** (§5.6.4): plan to release at or above the MRA or abort;
  recovery must clear the frag envelope, the ground, and a premature burst.
- **CCIP technique** (§5.6.5): roll out with the bomb-fall line through the
  target and the planned Initial Aim-off Angle; the example is a 20° LALD
  with IAA 3.6°. Do not let the FPM fall below the planned dive angle in the
  roll-in.

## The ground track the tool draws (settled 2026-09-07, late)

Type I, anchored on the route — the handbook's own example. Fly the IP→target
leg to the **action point** (4.5 nm by default), make a round **check turn**
left or right (the *Ingress* toggle picks the flank), run up the offset leg,
and join the attack: **roll-in** for a dive, **pull-down point** for a pop-up,
run-in start for a level pass. The final turn onto the target and the attack
heading are whatever closes that geometry; the numbers the pilot briefs —
range, turn, climb — stay round. Egress is drawn from the release point, a
turn onto the egress heading, never through the target.

For the pop-up the check turn defaults to the value the handbook's angle-off
guide (2 × climb) implies at the action range, rounded to 5° (25° for the 20°
pop; the manual's own 15° LALD example gives 17°, i.e. 15). The pull-down turn
is then solved so the arc lands wings level at the MAP.

## What the tool took from this (built 2026-09-07 evening)

Items 1, 2 and 4 below are implemented: `src/lib/popupPlanning.ts` carries
the formulas, `applyPopupPlan` fills every derived field of a saved pop-up,
`calculatePopupGeometry` places PUP / PDP / TRK / AOD and the pull-down arc on
the ground, and the card and map read the same plan. Item 3 (fuze-dependent
release floors) was considered and deliberately closed — see the note there.

## What the tool should take from this

1. **A pop-up is defined by dive angle and release altitude** (plus speed,
   tracking time and G from the profile). Apex, pull-down altitude, climb
   angle, angle-off, pop distance, MAP and AOD are *derived*. The library
   should stop storing `popDistance_nm` / `apexAltitude_ft` as independent
   truths.
2. **Doctrinal angle-off is 2 × climb angle** — 40° for a 15° LALD, 60° for a
   20° pop, 80° for a 30° pop. The tool uses this as its default (it used to
   default to a flat 30°).
   Both stay adjustable; the straight-in warning fires inside ±5° either way.
3. **Release floors drive everything upward.** The BEM example releases
   Mk-82s at 2,000 ft only because of a 4 s fuze delay. The tool's single
   frag min-safe per weapon (3,000 ft for Mk-82, 4,500 for Mk-84) pushes a
   "low-angle" 15° pop to a 6,300 ft apex.

   **DECIDED 2026-09-09, and closed: the tool assumes the bomb detonates on
   impact.** Fuze-dependent safe-escape floors were considered and dropped —
   the user's call. The conservative frag min-safe per weapon is therefore
   always the floor, `fuze_options.arming_delay_sec` is carried for the card
   but never changes a release altitude, and the tool will not plan a true
   low-angle LALD the way the manual does. That is the safe direction and it
   is deliberate. **Do not reopen this without asking.**
4. The map should mark **PUP, pull-down point, track point (MAP) and AOD**;
   the card should print tracking time and AOD.

## Coordinated strikes (built 2026-09-23)

Two to four jets of the flight on one attack, planned together
(`src/lib/strike.ts`, `src/lib/strikeDraft.ts`). None of this is from the BEM.
It is squadron practice, built on the level offset leg (see the
`project-level-offset-leg-decision` memory note). Every number below is a
planning default the planner can change, and the timing figures print as
estimates.

- **The split.** The lead runs in on the side away from the nearest threat
  (the same rule a single attack uses). #2 mirrors it: the same check turn and
  leg, on the other flank. A 4-ship is two such pairs, so #3 flies the lead's
  side and #4 flies #2's. For a level 1.5 × leg at a 30° check turn, the pair
  arrives **97°** apart in azimuth. That is the `split_deg` (2φ) the offset
  leg was sized for.
- **Grading the split.** The split is measured as the angle between two jets'
  attack axes at the target. A fire-control radar has roughly a **40° cone**:
  ≥ 55° is shown green, 40–55° amber, and under 40° red ("inside one cone").
- **Timing.** Each jet has a time-over-target offset from the lead. The
  default is `(n − 1) × spacing`, with spacing starting at 30 s. There are no
  clock times, only offsets.
- **Frag clear time (ESTIMATED).** This is how long a jet's bombs keep the air
  over the target dangerous. The model is fragments thrown up to the weapon's
  frag min-safe height and falling back, in vacuum: `2·√(2h/g)`, rounded up to
  5 s. That gives 20 s at 1,500 ft, 30 s for a Mk-82 (3,000 ft) and 35 s for a
  Mk-84 (4,500 ft). Spacing below it is warned, never blocked. The warning
  says so when the two jets are also within 15° of the same axis.
- **IP push time (ESTIMATED).** This is when a jet leaves the IP, relative to
  the lead's TOT. It is the drawn path length from the IP to the bomb's impact
  divided by the attack speed. It has no allowance for turns or acceleration.
- **The shared IP.** The strike owns one IP (Auto, a waypoint, or a custom
  point) and writes it through to every jet with `moveIp`, headings and all.
  Clearing it puts every jet back on Auto: each runs in from the waypoint
  before its own target.
- **Group edits.** A number changed on the Group tab is copied to every jet
  flying the same delivery. Each jet then re-derives its own headings on its
  own flank. Side, headings, IP and egress are never copied.

## Weapon numbers (2026-11-13)

Where the weapon table's numbers come from, for the 26 rows that were name-only
until now. Each value was approved one by one; the row's `notes` in
`crates/core/data/reference.json` carry the same sources. Nothing here was
invented: a row with no source for a floor still has none, and its attacks and
cards still carry the "no data on file" caution.

- **Weights, all 26.** DCS's own value from the public pydcs library
  (`dcs/weapons_data.py` at commit `5ddcc63a2dcd661e16b14f7aa43219b93044855d`),
  kg converted to lb and rounded: Mk-81 260, Mk-83 1,001, Mk-83 AIR 1,050,
  GBU-16 1,131, BLU-107 483 (the BLU-107/B Durandal entry; pydcs also lists a
  lighter 185 kg "BLU-107 440lb" entry), CBU-52B 539, CBU-103 948, CBU-105 919,
  BL-755 582, CBU-1/A 726, CBU-2/A 746, CBU-2B/A 844, Mk-20 489, CBU-99 489,
  BLG-66 661, SAMP-125 265, SAMP-250 540, SAMP-250 HD 593, SAMP-400 794,
  SAMP-400 HD 871, BR-250 551, BR-500 1,102, AGM-122 194 (the AGM-122A entry,
  88 kg), GAU-12/U 626 (the Equalizer gunpod, 283.9 kg). Two come from
  elsewhere: the **Mk-81 Snakeye, 250 lb**, from the A-4E-C community mod's
  `A4E_Weapons.lua` at commit `34c1ef439581234ee24d4bde2e13a54999ebaa5a`
  (`mass = 250 * POUNDS_TO_KG`); and the **AGM-65F, 669 lb**, the missile alone
  (USN training system plan N88-NTSP-A-50-8501B/D, AGM-65F, "Weight (Prelaunch)
  669.0 pounds", via globalsecurity.org). DCS lists the AGM-65F only with its
  LAU-117 launcher (360 kg), so the Navy figure is the missile's.
- **A frag floor (this clears the caution, and auto-build enforces it): the
  Mk-83 only, 1,300 ft.** USAF T.O. 1F-4C-34-1-1, *F-4C/D/E Aircrew Weapons
  Delivery Manual, Non-Nuclear*, Sec VI Safe Escape, Fig 6-14 sheet 2, p.6-43,
  "Level delivery, low drag", straight-and-level constant-speed escape, worst
  row (360 KTAS). Contact burst. A public scan is on archive.org
  (`f4cdennwdmanual`). It agrees with T.O. 1A-7K-34-1-1 Fig 6-15. It is a
  **level-release** figure.
- **Considered and rejected: a floor for the Mk-20 Rockeye and CBU-99.**
  USAF T.O. 1-1M-34, Fig 6-1, p.6-9, gives 1,380 ft as the maximum fragment
  altitude of an intact Mk 20 Rockeye cluster at sea level ("MK 20 ROCKEYE
  (INTACT CLUSTER) 1380"; cluster safe escape there is based on the canister
  failing to open, p.6-2). It is a fragment ceiling, not a release minimum, and
  it was dropped as a floor on 2026-11-13: a release below a floor is an error
  that blocks saving, so it would have made the normal 500 ft Rockeye laydown
  unsaveable on every jet. The figure stays in the two rows' `notes` for
  reference; both rows keep the "no data on file" caution.
- **Envelope extras (these do not clear the caution).** BLU-107: minimum release
  250 ft and maximum 620 kt, from T.O. 1-1M-34 Sec I p.1-39, "designed for level
  delivery at 250 feet AGL and for release speeds up to 620 KCAS" (the source
  says KCAS; the field is KTAS). Heatblur's F-4E manual advises about 500 ft AGL.
  CBU-105: 200 to 20,000 ft and up to 650 kt, and CBU-103: up to 40,000 ft, from
  globalsecurity.org/military/systems/munitions/cbu-105.htm. The CBU-105's three
  figures are stated there for the CBU-97, before the WCMD kit; the CBU-103's
  40,000 ft is the page's "delivery altitude increases up to 40,000 feet" for
  the WCMD kit.
- **The GBU-16 gets a weight only.** Borrowing the Mk-83's floor for it was
  declined.
- **What changes in the planner.** The Mk-83's floor is read as its floor
  everywhere the seed rows' are: auto-build raises a lower release to it, the
  attack checks error on a release under it, the pop-up form shows "Weapon
  floor", the card prints "MIN SAFE 1,300 ft AGL", and a strike's frag clear
  time for it is 20 s (it was 0). Every Mk-83 profile already released above
  1,300 ft, so no auto-built release moves. None of the envelope extras moves
  an auto-built release either: the lowest release of the Durandal and the
  CBU-105 is 500 ft AGL, above their 250 and 200 ft minimums.
- **Not audited: the older rows.** The rows from the old SQLite seed cite no
  source, and the public Dash-34 tables disagree with two of them: the same
  Fig 6-14 gives the Mk-82 about 1,100 ft and the Mk-84 about 1,700 ft (level
  release, 360 KTAS), where the seed rows say 3,000 and 4,500; T.O. 1-1M-34
  Fig 6-1 gives maximum fragment altitudes of 2,050 ft (Mk-82) and 2,750 ft
  (Mk-84) at sea level. Nothing was changed; see "Audit the seed rows' numbers"
  in `ROADMAP.md`.
