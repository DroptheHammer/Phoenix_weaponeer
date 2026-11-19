# Delivery planning reference — pop-up, dive and loft deliveries

What public F-16 documentation says a pop-up attack is, how it is planned,
and what that implies for the profile library. Written 2026-09-07 after the
question "isn't this in the docs?" — it was not. It is now.

## Sources

1. **Korean Air Force Basic Employment Manual, Volume 5 (F-16C), 1 October
   2005**, §5.14 "Pop-Up Deliveries" (pp. 5-78 … 5-82), §5.16.4 repositioning
   (5-91 … 5-92), **§5.17 "Pop-Up Formulas"** with a worked example (5-92 …
   5-97), §5.6 computed visual bombing, §5.8 tactical considerations (dive
   bomb, HADB, LAT). Unclassified.
   http://falcon.blu3wolf.com/Docs/Basic-Employment-Manual-F-16C-RoKAF.pdf
   (11 MB; text-searchable. Page numbers below are PDF pages; printed pages
   are 5-nn.)
2. **"Pop-up Attack Manual" v4.7, Cars "Falcas" Burgers** (Falcon BMS
   community). Image-only PDF, but a clean worked example and the Type I /
   Type II distinction below.
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
  the library's *Loft 30°* profile is this. See "Loft and LABS" below.
- **Dive recovery** (§5.6.4): plan to release at or above the MRA or abort;
  recovery must clear the frag envelope, the ground, and a premature burst.
- **CCIP technique** (§5.6.5): roll out with the bomb-fall line through the
  target and the planned Initial Aim-off Angle; the example is a 20° LALD
  with IAA 3.6°. Do not let the FPM fall below the planned dive angle in the
  roll-in.

### The dive aims off (built 2026-11-15)

Until 2026-11-15 the tool drew a dive's roll-in and release on a straight
line at the dive angle **through the target**. A bomb released on that line
falls under it and lands short: 2,091 ft (637 m) for the F-16C 30° profile.
The manual's dive has an aim-off (the CCIP quotation above), and so does the
tool's pop-up; the dive now takes the pop-up's own formula
(`src/lib/diveAim.ts`, `diveRanges`), from the pilot's unchanged numbers
(dive angle, roll-in and release altitude, release speed):

```
line     = release / tan(max(dive, 1°))           the old release range
range    = vacuum bomb range (release, speed, dive)  popupPlanning.ts, 1.69 ft/s per kt, g = 32.2
AOD      = max(line − range, 0)                   the pop-up's aimOff_ft; 0 for a gun or rocket pass
release range from the target = range             a vacuum bomb with the jet's velocity lands on it
roll-in range                 = rollIn / tan(dive) − AOD
aim-off point                 = the target + AOD along the attack heading
```

Roll-in, release, target and aim-off point lie on one line at the dive angle;
the jet flies the line, the bomb leaves along it and falls below it onto the
target. The **initial aim-off angle** (IAA) is the BEM's angle between that
line and the line to the target at release, `atan(release / range) − dive`:
8.3° for the F-16C 30° profile (4,500 ft, 450 kt). A gun or rocket pass keeps
the sight line through the target (rounds and rockets fly nearly straight),
and so does a dive with no usable release speed (no bomb range to aim with).
The aim-off is a vacuum figure, like the pop-up's: under 1% of range off a
slick bomb's drag answer, but a retarded bomb (the F-16C LALD 10° profile's
high-drag bombs) falls shorter than it, and no figure is on file for that.

What moves on a dive's map and card: the ROLL and REL markers come nearer the
target, a dashed aim line runs on past the target, the roll-in turn and the
attack and egress headings change (the offset leg meets a smaller roll-in
ring), the side view's ROLL, REL and EGRESS distances, and a strike's push
times. On the F-16C 30° card: roll-in 2.3 nm · RIGHT 42° → 1.9 nm · RIGHT 53°,
attack heading 271° → 281°, egress 001° → 011°, REL 1.28 → 0.94 nm, the aim
line 0.34 nm past the target. No row is added to the card. The card's egress
heading is now worked out from the live attack heading, so an old saved dive
prints the egress its own picture draws.

Three 45° profiles, the **A-10C, AV-8B and A-4E** (1.40 to 1.45 nm roll-in
rings), now get auto-build's "Check turn reduced 20° → 10°", as the F-16C
LALD already did: a 20° turn at 4.5 nm passes 1.54 nm abeam the target and
never reaches the smaller ring. An attack of those saved before, with the old
20° turn, is drawn with no offset leg or action point (straight from the IP to
the roll-in, on its stored heading), and its card prints that same run: no
Action Point or Approach HDG row, the roll-in with the turn the map flies
there, and the caution "⚠ The offset leg no longer reaches the roll-in — open
this attack in the editor and save it" (2026-11-16).

A gun or rocket pass is solved on its own ring, the sight line's, whenever a
customized pass has its flank flipped, its IP moved or a Group-tab edit
reaches it, so the heading it stores (which the card prints and the
straight-in warning reads) is the one its picture draws (2026-11-16; before,
those three re-solved it on a bomb's aim-off ring).

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
  The strike strip warns of a pair inside one cone; the 3D playback's footer
  does not, because no time set there changes how far apart the axes are.
- **Timing.** Each jet has a time-over-target offset from the lead. The
  default is `(n − 1) × spacing`, with spacing starting at 30 s. There are no
  clock times, only offsets.
- **Frag warning (built 2026-11-16 for 0.4.0; the user's decision of
  2026-11-15).** A strike is warned the way DCS's blast works: when a bomb goes
  off, any other jet inside that weapon's blast radius, in 3D, at that instant,
  is named ("#2 is 130 ft from #1's bomb when it goes off, inside its 360 ft
  blast radius (est.)"). Nothing after the instant counts: no falling
  fragments, no lingering cloud. Distance only: DCS's blast is blocked by
  terrain, but the app has no DCS terrain, so a hill in the way earns no credit
  and the check can warn where DCS would not, never the reverse. The radius is
  the weapon row's sourced blast radius (see "Weapon numbers", the blast radius
  item); a weapon with none is not checked, and the strike strip and the
  playback's footer say which. The check runs on the planner's own lines, in
  the same playback the 3D view flies, so the strike strip, the playback's
  footer and its time bar say the same thing. It needs the playback, so the
  phone's strike strip says the check is made in the desktop app. A strike of
  one jet has nothing to check. Measured on the F-16C profiles, no jet's path
  comes within about 1,200 ft of a burst on its own target at any spacing, so on
  one target it never fires: it guards odd geometry, such as a second target
  high on a ridge under another jet's run. It warns, never blocks, and moves
  no release floor (those guard the dropper against its own bomb and are
  unchanged). It says nothing about two jets passing close to each other: two
  jets stacked on one axis at the same time are not flagged by it, where the
  old rule flagged them by accident.
  - *Spacing in time (the real-world habit, ESTIMATED), a choice on the
    strike, off by default.* The strike strip's "Warn by" picks it, and the
    choice is saved with the strike, so the squadron sees the same warnings. It
    is how long a jet's bombs keep the air over the target dangerous, modelled
    as fragments thrown up to the weapon's frag min-safe height and falling
    back, in vacuum: `2·√(2h/g)`, rounded up to 5 s. That gives 20 s at 1,500
    ft, 30 s for a Mk-82 (3,000 ft) and 35 s for a Mk-84 (4,500 ft). Spacing
    below it is warned, never blocked; the warning says so when the two jets
    are also within 15° of the same axis. Only under this rule does the Group
    tab's spacing slider say "Frag clears in ~N s (est.)". It is not what DCS
    does.
  - The default 30 s spacing comes from neither rule: it is the planning
    default, and still spaces the jets for the defender.
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
  (`f4cdennwdmanual`). It is a **level-release** figure.
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
  floor", the card prints "MIN SAFE 1,300 ft AGL", and, on a strike warned by
  spacing in time, its frag clear time is 20 s (it was 0). Every Mk-83 profile already released above
  1,300 ft, so no auto-built release moves. None of the envelope extras moves
  an auto-built release either: the lowest release of the Durandal and the
  CBU-105 is 500 ft AGL, above their 250 and 200 ft minimums.
- **Blast radius, eight rows (approved 2026-11-16; separate from the 26 above).**
  The distance from a burst within which DCS damages an aircraft: the three
  `blast_radius_*` fields on the weapon row (feet, what the figure means, where it
  comes from), read by the blast test (the strike strip and the 3D playback run
  the same one, see "Frag warning") and by nothing else. The old
  `frag_*_radius_ft` seed numbers cite no source and are not read for it. The
  only public measurement is one community test, "Anatomy of explosions" on
  flyandwire.com (2026-07-11): a Ka-50 helicopter spawned over a burst, damage
  judged by eye, DCS version not stated, not a game figure. Its three results:
  **Mk-82 250 ft** (`any_damage`: minor damage at 240 ft, none at 250 ft),
  **Mk-83 250 ft** (`any_damage`: limited damage at 240 ft, none at 250 ft) and
  **Mk-84 360 ft** (`destroyed`: destroyed at 350 ft, not at 365 ft, the author's
  "circa 360"). Five more rows take the figure of the bomb whose warhead they
  share in the game's files (DCS 2.9.31, the public `dcs-lua-datamine` export):
  **Mk-82 AIR, Mk-82 Snakeye and GBU-38 take the Mk-82's 250 ft**, **Mk-83 AIR
  the Mk-83's 250 ft**, **GBU-31 the Mk-84's 360 ft**. The AIR and Snakeye point
  at the Mk-82's own warhead file (`_G/warheads/Mk_82.lua`); the GBU-38 (87.1 kg
  of explosive), Mk-83 AIR (201.9 kg) and GBU-31 (428.7 kg) carry their own
  warhead tables with the same explosive mass as the Mk-82, Mk-83 and Mk-84.
  The test named only the three bare bombs, so each of those five rows says so
  in its `notes`. Every row is `community_measurement`, and its `notes` carry the
  article, what it saw and the caveats above. GBU-12, GBU-10, GBU-16 and GBU-24
  were not offered (the game's files hold two warhead tables for each, and they
  disagree), and no cluster, missile, rocket or gun row has a radius. The same
  article's other test, a column of Gazelle helicopters over a Mk-84 that read
  "damaged" up to 800 ft, is not used: its author doubts it. The Rust and
  geo-check tests list exactly these eight ids, so a ninth row, or a changed
  figure, fails until the list is changed on purpose. Every blast number on
  screen is marked "(est.)". The planner's own release floors and the old
  spacing rule do not read these fields.
- **Not audited: the older rows.** The rows from the old SQLite seed cite no
  source, and the public Dash-34 tables disagree with two of them: the same
  Fig 6-14 gives the Mk-82 about 1,100 ft and the Mk-84 about 1,700 ft (level
  release, 360 KTAS), where the seed rows say 3,000 and 4,500; T.O. 1-1M-34
  Fig 6-1 gives maximum fragment altitudes of 2,050 ft (Mk-82) and 2,750 ft
  (Mk-84) at sea level. Nothing was changed; see "Audit the seed rows' numbers"
  in `ROADMAP.md`.

## Loft and LABS (2026-11-13)

The F-16 *Loft 30°* (CCRP) and the F-4E *LABS Loft 45°*: a low run-in, a
wings-level pull to the loft angle, release in the climb, and an escape turn
away from the bomb. The code is `src/lib/loftPlanning.ts`. Everything it
prints is ESTIMATED.

### Sources

1. **USAF T.O. 1F-4C-34-1-1, *F-4C/D/E Aircrew Weapons Delivery Manual,
   Non-Nuclear*** (15 Mar 1970, Change 9, Jan 1973). Public scan on
   archive.org, `f4cdennwdmanual`; the same scan as the Mk-83 frag floor above.
   - p.5-10: the loft tables assume "Pullup acceleration: 4 G obtained in 2
     seconds", approach 300/1,000/3,000/5,000 ft AGL at 500/550/600 KTAS,
     release angle 20° to 50°.
   - **Fig 5-9, p.5-28, "Loft Bombing Table"**: M117 750-lb GP, 4.0 G,
     military power at pull-up, 42,000 lb, target density altitude 0 ft,
     approach 300 ft at 500 KTAS. For each release angle: release altitude,
     pull-up-to-release time, gyro setting, **range pull-up to impact** and
     release-to-impact time. This is the worked example (below).
   - pp.5-22/5-23, sample problem: the pull-up timer is the IP-to-pull-up
     distance over the run-in speed ("6107 ft ÷ 844 fps = 7.2 seconds", no
     wind).
   - p.1-105 (F-4E): the timer starts when the bomb button is pressed over the
     IP; at run-out a tone sounds and the pilot pulls at 4 G; release is
     automatic at the preset angle.
   - p.2-89: after release "the AC initiates a wingover escape maneuver to
     achieve a 120° turn while diving toward minimum escape altitude".
   - The Mk-82 loft tables are in the companion book T.O. 1F-4C-34-1-2, which
     is not in the scan. Nothing public was found for them.
2. **RoKAF F-16C Basic Employment Manual Vol 5** (source 1 at the top).
   - p.5-33, §5.6.7.1: "Execute a frag avoidance maneuver after bomb
     release ... Know minimum stand-off range (typically 0.5 NM for Frag
     Avoidance) and do not violate it!" This is the loft frag check's
     standoff.
   - p.5-51, §5.8.4, LAT: "accurate visual deliveries of low-drag munitions
     at standoff ranges"; accuracy is worse than CCIP. p.5-57, §5.11.1: the
     jet is "exposed belly-up to the target area", and "long weapon TOF
     combined with wind effects result in decreased accuracy".
   - p.5-58, §5.11.4: CCRP "allows the most flexibility ... from a level,
     dive, or climbing delivery"; p.5-61, §5.11.6.1: LADD is "a programmed
     4-G pull to a 45-degree climb angle". The maximum-toss solution assumes
     5 G to 45° (p.5-33).
   - p.5-109, §5.19.7.1: "An immediate roll or dive recovery after weapon
     release is recommended. Avoid a perfect 180-degree reversal." p.5-111:
     jets that turned back toward the target have collided with their own
     lofted bombs. §8.13.4.2.2: roll to 135° of bank and pull down "with 4 G".
3. **Heatblur F-4E manual** (f4.manuals.heatblur.se), "Lofting & Tossing":
   in LOFT the ARBCS flies "a 4 G pull-up schedule" and releases at the preset
   angle after timer run-out; the WSO sets the angle and the pull-up timer.
   §9.4, the bombing computer's own example: Mk-82, 350 KTAS, run-in 3,000 ft
   MSL, target 30 ft MSL, 30° loft → pull-up range 14,796 ft, release range
   12,989 ft, timer 16.1 s from an IP 4 nm out. It is a sim tool, not a
   manual, but it is the only Mk-82 loft case found, and it is what DCS
   pilots use.
4. Chuck's Guide and ED's F-16C manual have no bomb-loft procedure or
   numbers. The old profile files' 4 nm / 3,500 ft (F-16) and 3.5 nm /
   4,000 ft (F-4E) had no source; they are gone.

### The model

Inputs: run-in altitude AGL and speed (KTAS), the loft angle, the pull G.

1. **The pull.** G builds from 1 to the pull G over 2 s, then holds. The
   flight path bends at `g(n − cos γ)/V`. The engine is at military power,
   taken as thrust equal to drag, so the climb trades speed for height:
   `dV/dt = −g sin γ`. Release is the moment the climb angle reaches the
   loft angle.
2. **The bomb.** From the release state, gravity plus drag of `k·v²`
   (deceleration, against the velocity), k = 7.2 × 10⁻⁶ per ft, sea-level
   air, no wind. k is the one number fitted, to every row of Fig 5-9.
3. **Derived:** pull-up range (pull distance + bomb range), release altitude
   and speed, release range, bomb time of flight, and the F-4E pull-up timer
   from the IP. The pull-up range is measured back from the target; the
   picture runs straight from the IP (decided 2026-11-13: the IP is the
   timing mark; a planner who wants another axis drops a custom IP).
4. **Escape:** a 120° turn off the attack heading at 4 G, left or right
   (away from the nearest threat by default), drawn from the release point.

### Worked example (Fig 5-9) and our check

300 ft AGL, 500 KTAS, 4 G. geo-check runs every printed row (20° to 44°).

| Release angle | Table: release alt | Ours | Table: pull-up to impact | Ours | Table: time of fall | Ours |
|---|---|---|---|---|---|---|
| 20° | 748 ft | 748 | 17,701 ft | 17,809 (+0.6%) | 19.41 s | 19.69 |
| 30° | 1,250 ft | 1,241 | 22,255 ft | 22,269 (+0.1%) | 27.20 s | 27.42 |
| 42° | 1,990 ft | 1,992 | 24,235 ft | 24,169 (−0.3%) | 34.84 s | 35.11 |
| 44° | 2,147 ft | 2,127 | 24,205 ft | 24,131 (−0.3%) | 36.03 s | 36.19 |

Worst over all 13 rows: range 0.6%, release altitude 0.9%, pull-up to release
0.12 s, time of fall 0.28 s. The range peaks at 42°, as the table does. A
vacuum bomb at constant speed lands 10% (20°) to 24% (44°) long and never
peaks, which is why the loft, unlike the pop-up, cannot use one. The same k
puts the Heatblur Mk-82 case at 12,868 ft against 12,989 (−0.9%), and the
timer formula reproduces its 16.1 s exactly. (Heatblur's 1,807 ft pull
distance is an *instant* 4 G pull, r·sin 30°; the T.O.'s 2 s onset is used
here.)

What the two bundled profiles give:

| Profile | Run-in | Pull-up | Release | Release range | Time of fall |
|---|---|---|---|---|---|
| F-16 Loft 30° | 500 ft, 520 kt, 4 G | 3.97 nm | ~1,520 ft AGL, 497 kt | 3.20 nm | 28.8 s |
| F-4E LABS 45° | 500 ft, 500 kt, 4 G | 3.99 nm | ~2,400 ft AGL, 455 kt | 3.06 nm | 37.0 s |

### What it does not do

- **One drag constant for every bomb.** The tool has no per-weapon drag. k
  is an M117's, and it lands the Heatblur Mk-82 within 1%; a high-drag or
  cluster store would fly shorter. Lofting a JDAM or an LGB is drawn the same
  way, though the weapon steers itself.
- **No altitude, temperature or wind.** The table is for a sea-level target.
- **The F-4E's LABS angle is a pitch (gyro) angle.** Fig 5-9 gives a gyro
  setting about 6–8° above the release (flight-path) angle at 4 G: 36.9° for a
  30° release. The tool plans on the flight-path angle, as Heatblur's
  bombing computer does, and does not print a gyro setting.
- **The jet's speed after release is held constant** for the frag check
  below. The real escape dives and accelerates, so the check errs short.

### Checks (decided 2026-11-13)

- **The release-altitude floors do not apply to a loft.** The weapon's frag
  min-safe and minimum release altitude are about where the jet is when the
  bomb goes off, and a lofting jet is miles away by then. Without this every
  Mk-82 loft (3,000 ft floor, ~1,500 ft release) would be an error, and an
  error blocks saving.
- **Instead: where the jet is at impact.** The jet flies the drawn escape for
  the bomb's time of fall. Inside the F-16 handbook's 0.5 nm frag standoff
  of the target is a **warning, never an error**, so it never blocks saving.
  The standoff is a rule of thumb, and the handbook's frag chart (Fig 5.51) is
  marked "not for planning".
- The "predictable straight-in" warning does not apply: a loft runs straight
  from the IP by design.

## Manual sight (2026-11-19)

A jet with a fixed sight (F-5E, F-4E, Mirage F1, A-4E-C) needs a depression
setting before the IP. Until 0.4.0 each manual-dive profile carried one fixed
number that traced to no table and never moved when the attack was
customized. Now the card and the editor work the figure from the jet's own
sight table every time (`src/lib/sightTables.ts`, `src/lib/sightSetting.ts`;
data in `crates/core/data/sight_tables.json`).

### Sources

Carried with the owner's approval (2026-11-18) and credited in the About
dialog and the read-me, never on a card:

| Jet | Source | What it prints |
|---|---|---|
| F-5E | *F-5E Bomb And Rocket Depression Tables For Kneeboard*, DCS User Files no. 3320266 (no author named) | Mk 82 low drag: dives of 15° to 60°, 1,000 to 6,000 ft, 400 to 550 kt on the gauge. Mk 82 Snakeye: level to 30°, low heights |
| F-4E | *F-4E Kneeboards* by AKA_Relent, DCS User Files no. 3338073 | three low-drag dive rows at 3,000 ft and two Snakeye laydown rows, with their true airspeeds; released at 0 G |
| Mirage F1 | *Mirage F1 Kneeboards* by AKA_Relent, DCS User Files no. 3329090 | SAMP 250 LD at 10° and 20°, given as excerpts from the module's flight manual, for an 11,000 kg jet |
| A-4E-C | the mod's own *Kneeboard Manual*, version 2.3 | four rows for any low-drag bomb |

181 printed points, 160 of them figures; the rest are cells the F-5E pack
marks ">200" (more depression than the sight can be set to). Cells it marks
as never tested are left out.

Not used: any real-world weapons manual (the sources rule), and the F-5E
module manual's own two rows. A module's own manual outranks a third-party
document, but the manual that ships with today's game was not to hand; the
check against it is pinned on the roadmap.

### The rule

- **On a printed point** (within 0.5°, 50 ft, 5 kt on the gauge; 10 ft for a
  retarded bomb), the document's own figure.
- **Between printed points**, the planner's vacuum bomb-fall figure plus the
  table's own difference from it, carried across the gap along speed, then
  height, then dive. Marked "est.".
- **One step beyond the printed points**, on one axis only (30 kt, 500 ft
  below or 1,000 ft above, 5°), the nearest points' difference. Marked "est.".
- **Anywhere else, no figure.** The vacuum figure never prints on its own: it
  knows nothing of drag, angle of attack or where the sight sits.
- A retarded bomb's figure moves fast with height and dive, so it is carried
  between printed speeds only.
- Beside a ">200" cell there is no figure: the document itself says the
  setting there is past the sight's limit.
- A slick bomb the document does not name borrows the jet's slick table and
  is always marked "est."; a retarded bomb never borrows.

The tables are printed for the speed on the gauge and the planner holds true
airspeed, so the lookup converts on a standard day at the release height
above sea level (`src/lib/airspeed.ts`). A printed point's own true airspeed
is worked over a sea-level target, except the F-4E pack's, which prints it.

### What prints

| Case | Card header |
|---|---|
| The document's own figure | `SIGHT 118 mils · set before IP` |
| An estimate | `SIGHT 121 mils (est.) · set before IP` |
| The pilot's own figure (Customize) | `SIGHT 110 mils (own) · set before IP` |
| A squadron profile file's number, at that profile's own settings | `SIGHT 105 mils (profile) · set before IP` |
| The A-4E-C's computed dive | `SIGHT 0 mils (CP-741) · set before IP` |
| No figure | `SIGHT — no figure (outside table)`, `(no table)`, `(over 200 mils)`, `(near 200-mil limit)` |

The editor's key line also names the table (`est. near F-5E table`), because
the planner has to judge the figure. A level laydown with no table for its
bomb prints no sight line, as before.

### What it does not do

- Nothing was flown to check any table against today's game. The F-5E pack's
  pages are dated January 2022.
- The default dives do not all sit on printed points, so several default
  cards say "no figure". Moving a default is the owner's decision, jet by jet.
- The card's release label still shows true airspeed only.
- No notice on opening a mission saved before 0.4.0: its old fixed number is
  simply no longer printed.
- The F-4E's own bombing calculator is not read.
