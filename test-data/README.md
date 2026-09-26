# Test Data

Sample missions for manual testing of the FragOrders import path.

The app imports **FragOrders CLI output**, not `.miz` files directly
(there is no built-in `.miz` parser). Produce a file with:

```bash
fragorders parse mission.miz > mission.json
```

## Files

**Real missions live in `test-data/private/`, which is git-ignored.** Squadron
missions and captured FragOrders link payloads can carry an author's hidden
threat laydown, so they never go to the public repo. That covers
`nttr_redflag_viper1.json`, `sinai_m01_v6.json`, `sinai_m01_v7.json` and
`fragorders-links/`. Tests that need one of them load it at run time
(`private_fixture!` in `src-tauri/src/lib.rs`) and print "skipped" when it is
missing, so the suite still passes on a fresh clone. To run them in full, copy
the folder over from a machine that has it. The private archive repo
(`Phoenix_weaponeer-archive`) has them too.

### `nttr_redflag_viper1.json` — ✅ the original reference

Real `fragorders parse` output from `NTTR_Training_RF_v13.miz` (NTTR Red Flag
training mission). This is the reference fixture: its waypoints are verified
against real-world geography.

Import it and select group **`Viper 1 (Hot)`** (first in the list). Expect
14 waypoints:

Waypoints are numbered **0-based, by raw route-point index**, the same as
FragOrders. Waypoint 0 is the spawn point.

| # | Name | Type | Lands at |
|---|------|------|----------|
| 0 | *(unnamed)* | departure | Nellis AFB ramp, 36.227 / -115.048 (`TakeOffParkingHot`) |
| 1 | *(unnamed)* | nav | Nellis AFB, 36.227 / -115.048 |
| 2 | JUNNO | nav | 36.730 / -114.880 |
| 3 | DREAM | nav | 37.193 / -114.958 |
| 4 | MARSHAL | marshal | 37.690 / -114.683 (near Caliente) |
| 5 | MEZ | nav | 37.831 / -115.602 |
| 6 | IP | ip | 37.777 / -116.323 (Tonopah Test Range) |
| 7 | TGT1 | target | 37.682 / -116.623 (Tonopah Test Range Airfield) |
| 8 | TGT2 | target | 37.309 / -116.780 |
| 9 | EGRESS | nav | 37.550 / -115.764 |
| 10 | ALAMO | nav | 37.365 / -115.164 (town of Alamo, NV) |
| 11 | ARCO | nav | 36.724 / -114.953 |
| 12 | APEX | nav | 36.329 / -114.928 |
| 13 | LAND | divert | 36.235 / -115.033 (Nellis) |

This mission also exercises the other branch: the **BFM/BVR client flights
air-start** at 25,000 ft with a plain `Turning Point` as route point 0. They are
numbered from 0 as well — the index is the number, unconditionally, and nothing
detects a takeoff point in order to shift it. `BVR Vipers 1` is the one pinned
by `air_start_flights_also_number_from_zero`.

The route legitimately **crosses itself** near Nellis — the outbound JUNNO leg
crosses the inbound ARCO leg. That is real mission geometry, not an import bug.

Note `ARCO` is a plain nav fix here even though ARCO is also a tanker callsign
elsewhere in this same mission. Waypoint-type inference deliberately does not
treat tanker callsigns as tanker waypoints; see `infer_waypoint_type` in
`src-tauri/src/commands/mod.rs`.

### `sinai_m01_v6.json` — ✅ the new-FragOrders reference

Real `fragorders parse` output from `M01 V6.miz`, produced by the **rebuilt
FragOrders CLI** (`cmd/cli`, commit `a3c1ff1316dd`, 2026-09-06). This is the
fixture that proves the app handles missions from the new FragOrders alongside
the January-era `nttr_redflag_viper1.json`.

The wire shape is unchanged — still the raw DCS mission table — with one new
top-level key, `startTime` (seconds past midnight; 24300 = 06:45 local, 04:45Z
at Sinai's UTC+2). Everything else the new build changed is *more* decoding of
the same structure: typed weather and clouds, pylon numbers preserved as map
keys, task parameters no longer skipped, TACAN/ICLS beacons, and DTC parsing.

Contents: theater `SinaiMap`, 86 groups, 312 units, and **8 client flights** —
Mustang (FA-18C), Lance (F-14BU), Spectre (F-16C), Hawg (A-10C II), Archer
(AH-64D), Saber (OH-58D), Barak (F-16C), Ari (F-15ESE). The red laydown is 163
vehicles across 22 types, including SA-2 (`S_75M_Volhov`), SA-6 (`Kub 2P25 ln`),
SA-8 (`Osa 9A33 ln`), SA-11 (`SA-11 Buk LN 9A310M1`), ZSU-23-4 Shilkas and a
`55G6` EWR. All of them resolve to database rows.

All 8 client flights start on the ramp (`TakeOffParking` / `From Parking Area`),
and **none of the 55 route points is named** — so every flight imports as
waypoint 0 = the ramp (`departure`, named after its airfield from the point's
`airdromeId`), then unnamed `nav` points from 1.

**Barak (F-16C_50, Springfield11 1-1) is the numbering reference.** Its five
waypoints are 0/102 ft (Ramat David ramp, `airdromeId` 50; earlier notes
wrongly said Ramon, and the position settles it), 1/676, 2/423, 3/374,
4/374. Waypoint 1 is ground truth read straight off the FragOrders map popup for
this mission — *"Barak Waypoint 1, 676 MSL, N 31° 14.4023′ E 34° 39.5637′"*,
89.3 NM out on the first leg — which pins the numbering **and** the Sinai
projection to the same independent source.

Covered by `sinai_m01_v6_fixture_imports` and `barak_numbering_matches_fragorders`
in `src-tauri/src/commands/mod.rs`.

Sinai is now **`verified: true`** — this mission is what verified it (see the
note at the end of this file), so importing it raises no banner.

### `sinai_m01_v7.json` — the same mission, re-saved

Real `fragorders parse` output from `M01 V7.miz`, the mission creator's next
revision of M01. **The wire shape is identical to V6.** A structural diff finds
no new or removed key types, only content changes:

- **Red ground:** six new vehicle groups (`TIC:Egypt Mech Inf#…`): two BMP-1
  and two BTR-60 platoons, each with a Ural-375 truck; a second ZSU-23-4 split
  out of what was a two-Shilka group; and an SA-13 (`Strela-10M3`), which maps
  to `9K35 Strela-10`. Trucks and APCs are filtered out as non-threats, as
  before.
- **Red air:** three of the five MiG-29 flights are gone. One remaining flight
  moved from a runway start to a ramp start.
- **Blue:** one new ground group (`TIC:Israel Mech Inf#M113-3`). **Spectre**'s
  route grows from 4 to 5 points, so it numbers 0..4.
- Every group carries `startTime: 0`, as in V6. The new groups add a few more
  of these keys, which is all a line-count diff of the two files shows.

The same eight client flights import. Every route point is still unnamed (`""`).

Covered by `sinai_m01_v7_fixture_imports` in `src-tauri/src/commands/mod.rs`.

### `sandbox_mission.json` — real format, but imports empty

Genuine `fragorders parse` output with correct NTTR coordinates (bullseye
resolves to 36.129 / -115.000). Useful as a small well-formed sample.

**It cannot be imported for planning:** its only group (`Aerial-1`) has skill
`High`, i.e. AI. The importer only offers groups containing `Client`/`Player`
units, so the group list comes up empty.

### `test_fragorders.json` — ⚠️ SYNTHETIC, COORDINATES ARE OFF-MAP

Hand-written fixture, **not** FragOrders output. Two problems:

1. Its waypoints convert to 39.5–40.4°N / -113.4 to -114.6°W — eastern Nevada
   near the Utah border, **300+ km outside the NTTR map**. Anything imported
   from it appears in empty desert far from the theater.
2. It uses the key `theatre`; real FragOrders output uses `theater`. (The parser
   accepts both via a serde alias, so this does not fail loudly.)

This file cost two separate debugging sessions chasing a coordinate-conversion
bug that did not exist — the projection code was correct the whole time and is
now pinned by ground-truth landmark tests in
`src-tauri/src/parsers/coordinate_conversion.rs`.

Prefer `nttr_redflag_viper1.json` for anything involving positions on a map.

### `sinai_SYNTHETIC_banner_check.json` — ⚠️ SYNTHETIC, UI CHECK ONLY

Hand-built, **not** FragOrders output. It was made for exactly one purpose: when
Sinai was still one of three theaters whose projection had never been
independently confirmed (`verified: false`), this file was a way to see the
amber "coordinates unverified" warning in the import preview and the banner over
the map without owning a Sinai mission. **Sinai has been verified since
2026-09-11** (below), so this file no longer shows the warning; only Kola and
Afghanistan missions still do.

**Its coordinates prove nothing.** They were generated *from* the very Sinai
projection the warning is about, by projecting chosen lat/lons backwards. Round-
tripping them therefore succeeds no matter whether that projection is right —
which is precisely the false confidence that `test_fragorders.json` above cost
two sessions to unlearn. Never cite this file as evidence that Sinai positions
are correct.

Contents: one F-16C flight (`Hawk 1 (Sinai synthetic)`, skill `Client`) with
four waypoints — DEPART, IP, TGT1, EGRESS — and one SA-6 near TGT1. Theater key
is `theatre: "SinaiMap"`, which is the name DCS actually writes; plain `Sinai`
matches nothing.

Retiring a `verified: false` flag needs the opposite of this file: real
ground-truth pairs (DCS x/y and lat/lon) from a mission on that map — the method
below is how Sinai's was retired.

## Sinai: how the projection was verified

Sinai carried `verified: false` from the start, alongside Kola and Afghanistan.
`M01 V6.miz` is what cleared it, and the method is worth reusing for the other
two.

**Do not click points on the F10 map.** Instead pick *single-unit groups* out of
the mission: the `.miz` already stores each unit's exact DCS x/y, so only the
lat/lon has to be read on screen, and the pair is exact to the arcsecond the
Mission Editor displays. Four units were used, chosen to span the map:

| Unit | DCS x (north) | DCS y (east) | Measured |
|---|---|---|---|
| `EW-Red-2-1` (far south) | −395998 | 180295 | N 26°29'03" E 33°06'39" |
| `EW-Israel-2-1` (far NE) | 310556 | 398891 | N 32°50'12" E 35°27'13" |
| `EW-Red-3-1` (far west) | 115649 | −36987 | N 31°05'03" E 30°50'17" |
| `EW-Red-1-1` (centre-south) | 10042 | 93432 | N 30°08'49" E 32°12'46" |

That spans 700 km north–south and 440 km east–west, which separates the three
possible faults: an `x_0`/`y_0` offset shifts all four alike, a `k_0` scale error
grows with distance from the origin, and a wrong `lon_0` shows as an east–west
gradient.

**All four agreed to within 27 m**, with residuals uniformly positive (+19 m
north, +22 m east) — the signature of the ME truncating seconds rather than
rounding, i.e. agreement at the limit of the input precision. The projection
needed no correction. Pinned by `test_dcs_to_latlon_sinai_landmarks`.

### The false lead, recorded so it is not chased again

Before those pairs existed, an attempt was made to verify Sinai by projecting
the mission's *parked aircraft* and comparing them to published airfield
reference points. They landed on the right airbases across a 300 km span
(Ramat David 0.9 km, Tel Nof 1.5 km, Cairo West 1.5 km, Nevatim 2.0 km), which
correctly ruled out a wrong `lon_0`, a swapped axis order and any gross offset.

But the residuals showed a consistent **−1.36 km northward bias (sd 0.45 km)**,
which looked like a real `y_0` error. It was not: it was the offset between a
parking ramp and the airfield datum. Applying that "correction" would have
broken a projection that was already right to 27 m. Ramp positions are not
ground truth.

Also note: the FragOrders CLI cannot supply pairs. Neither `parse` nor `inspect`
emits lat/lon, despite `pkg/dcsproj` projecting internally.
