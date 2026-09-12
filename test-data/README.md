# Test Data

Sample missions for manual testing of the FragOrders import path.

The app imports **FragOrders CLI output**, not `.miz` files directly
(`parse_miz_file` is still a stub). Produce a file with:

```bash
fragorders parse mission.miz > mission.json
```

## Files

### `nttr_redflag_viper1.json` — ✅ the original reference

Real `fragorders parse` output from `NTTR_Training_RF_v13.miz` (NTTR Red Flag
training mission). This is the reference fixture: its waypoints are verified
against real-world geography.

Import it and select group **`Viper 1 (Hot)`** (first in the list). Expect
14 waypoints:

| # | Name | Type | Lands at |
|---|------|------|----------|
| 1–2 | *(unnamed)* | nav | Nellis AFB ramp, 36.227 / -115.048 |
| 3 | JUNNO | nav | 36.730 / -114.880 |
| 4 | DREAM | nav | 37.193 / -114.958 |
| 5 | MARSHAL | marshal | 37.690 / -114.683 (near Caliente) |
| 6 | MEZ | nav | 37.831 / -115.602 |
| 7 | IP | ip | 37.777 / -116.323 (Tonopah Test Range) |
| 8 | TGT1 | target | 37.682 / -116.623 (Tonopah Test Range Airfield) |
| 9 | TGT2 | target | 37.309 / -116.780 |
| 10 | EGRESS | nav | 37.550 / -115.764 |
| 11 | ALAMO | nav | 37.365 / -115.164 (town of Alamo, NV) |
| 12 | ARCO | nav | 36.724 / -114.953 |
| 13 | APEX | nav | 36.329 / -114.928 |
| 14 | LAND | divert | 36.235 / -115.033 (Nellis) |

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

Covered by `sinai_m01_v6_fixture_imports` in `src-tauri/src/commands/mod.rs`.

Sinai is now **`verified: true`** — this mission is what verified it (see the
note at the end of this file), so importing it raises no banner.

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

Hand-built, **not** FragOrders output. It exists for exactly one purpose: Sinai
is one of three theaters whose projection has never been independently
confirmed (`verified: false`), so this file is a way to see the amber
"coordinates unverified" warning in the import preview and the banner over the
map without owning a Sinai mission.

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

Retiring the `verified: false` flag needs the opposite of this file: real
ground-truth pairs (DCS x/y and lat/lon) read off the DCS F10 map by someone who
owns Sinai.

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
