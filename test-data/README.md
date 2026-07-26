# Test Data

Sample missions for manual testing of the FragOrders import path.

The app imports **FragOrders CLI output**, not `.miz` files directly
(`parse_miz_file` is still a stub). Produce a file with:

```bash
fragorders parse mission.miz > mission.json
```

## Files

### `nttr_redflag_viper1.json` — ✅ use this one

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
