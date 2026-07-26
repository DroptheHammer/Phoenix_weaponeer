# Bugfix Sprint Plan — Map & Geometry Bugs

**Created:** 2026-07-12
**Status:** NOT STARTED
**Context:** A code scan found 7 bugs, two of which explain the reported "weird movement around the waypoints" on the map. This plan fixes them in 4 stages. Each task is small, self-contained, and verifiable — designed to be executed one task at a time by Claude Sonnet 4.5/4.6 in a fresh session.

**Rules for the executing session:**
- Complete ONE task at a time. Run that task's verification before moving on.
- After each stage, run the Stage Gate commands. Do not start the next stage on a red gate.
- Check off tasks in this file (`[ ]` → `[x]`) as you complete them, and commit after each stage with message `Bugfix Stage N: <summary>`.
- Test data for manual checks: `test-data/nttr_redflag_viper1.json` — import it and select group **`Viper 1 (Hot)`** (14 waypoints, incl. "IP", "TGT1", "TGT2"). See `test-data/README.md`.
  - Do NOT use `test-data/test_fragorders.json`: it is synthetic and its coordinates land 300+ km off the NTTR map.
- Launch app with `npm run tauri dev` (NOT `npm run dev` — the plain Vite server has no Tauri backend and throws `window.__TAURI_INTERNALS__` errors).

---

## Stage 1 — NaN heading breaks attack overlay geometry (CRITICAL)

**Bug:** `PopupCCIPForm.tsx:131` stores `parseFloat('')` = `NaN` when the Heading field is cleared. The input *displays* empty (`NaN || ''`) so it looks unset, `canSave` in `AttackEditor.tsx` doesn't validate heading, and the NaN is saved. In `src/lib/attackGeometry.ts:203` the fallback `userAttackHeading ?? naturalAttackHeading` only catches `null`/`undefined` — NaN passes through and every overlay point (POP/ATK/TGT markers, all 4 polylines) becomes NaN. Also: typing "090" transiently stores 0 → 9 → 90, making the overlay swing around the target while typing.

### Task 1.1 — Make `runInHeading_deg` optional in the type
- File: `src/types/attack.types.ts`
- In `PopupCCIPProfile`, change `runInHeading_deg: number;` to `runInHeading_deg?: number; // undefined = auto from IP→Target bearing`
- Verify: `npx tsc --noEmit 2>&1 | grep runInHeading` produces no NEW errors (pre-existing unrelated errors are OK, see Stage 2).

### Task 1.2 — Stop storing NaN in the heading input
- File: `src/components/attacks/forms/PopupCCIPForm.tsx` (~line 128–134, the "Heading (deg)" input)
- Change the onChange to store `undefined` on empty input:
  ```tsx
  onChange={(e) => onChange({
    ...profile,
    runInHeading_deg: e.target.value === '' ? undefined : parseFloat(e.target.value),
  })}
  ```
- Change the value binding from `profile.runInHeading_deg || ''` to `profile.runInHeading_deg ?? ''` (so a legitimate heading of 0 still displays).
- Also fix the display at ~line 243 which uses truthiness (`profile.runInHeading_deg ? ... : ...`) — use `profile.runInHeading_deg != null` so heading 0 shows "000°" instead of falling back.

### Task 1.3 — Defensive guard in the geometry calculator
- File: `src/lib/attackGeometry.ts`, function `calculatePopupGeometry` (~line 203)
- Replace:
  ```ts
  const attackHeading = userAttackHeading ?? naturalAttackHeading;
  ```
  with:
  ```ts
  const attackHeading = (userAttackHeading != null && Number.isFinite(userAttackHeading))
    ? userAttackHeading
    : naturalAttackHeading;
  ```
  This protects against NaN already saved in existing mission files, not just future input.

### Stage 1 Gate
1. `npx tsc --noEmit` — no new errors vs. before the stage.
2. Manual repro in the app (`npm run tauri dev`):
   - Import `test-data/nttr_redflag_viper1.json` (group `Viper 1 (Hot)`), add a flight member, create an attack: target "TGT1", IP "IP".
   - In the Heading field: type `90`, then select-all and delete so it's empty. Save (calculate first if required).
   - Map view: the attack overlay (blue dashed IP leg → yellow offset leg → red attack leg → green egress) must render along the IP→Target axis. No missing/mispositioned POP/ATK/TGT markers, no console errors about invalid LatLng.
   - Reopen the attack: the Heading field is empty, overlay still correct.

---

## Stage 2 — Overlay draws hardcoded test data instead of the saved profile

**Bug:** `src/components/map/AttackProfileOverlay.tsx:45` calls `getRecommendedParams()` which returns hardcoded values (4nm pop, 20° right, 7500ft apex, source "Validated Test…"). All geometry and tooltips use these `params`, not the user's saved `profile`. Editing pop distance/altitudes/offset in the attack editor changes nothing on the map except heading. Additional inconsistency: the green egress line uses `profile.egressDirection` but the egress label prints `Defend ${params.offsetDirection}` (always "right").

This stage also resolves the **known pre-existing TS errors**: `AttackEditor.tsx` initializes `offsetDirection`/`offsetAngle_deg` which don't exist on `PopupCCIPProfile`.

### Task 2.1 — Add the missing offset fields to the profile type
- File: `src/types/attack.types.ts`, interface `PopupCCIPProfile`
- Add after the "Pop maneuver" fields:
  ```ts
  // Offset maneuver (optional — defaults come from recommended params)
  offsetDirection?: 'left' | 'right';
  offsetAngle_deg?: number;
  turnInRange_nm?: number;
  ```
- Verify: `npx tsc --noEmit 2>&1 | grep -i offsetDirection` — the `AttackEditor.tsx(52)` and `PopupCCIPForm.tsx` offsetDirection/offsetAngle errors are gone.

### Task 2.2 — Merge profile values over recommended params in the overlay
- File: `src/components/map/AttackProfileOverlay.tsx` (~line 44–52)
- After `const params = getRecommendedParams(...)`, build effective params, taking any finite saved profile value and falling back to the recommendation:
  ```ts
  const num = (v: number | undefined, fallback: number) =>
    v != null && Number.isFinite(v) ? v : fallback;

  const effective: ChucksGuideParams = {
    ...params,
    offsetRange_nm: num(profile.popDistance_nm, params.offsetRange_nm),
    offsetAngle_deg: num(profile.offsetAngle_deg, params.offsetAngle_deg),
    offsetDirection: profile.offsetDirection ?? params.offsetDirection,
    climbAngle_deg: num(profile.climbAngle_deg, params.climbAngle_deg),
    turnInRange_nm: num(profile.turnInRange_nm, params.turnInRange_nm),
    apexAltitude_ft: num(profile.apexAltitude_ft, params.apexAltitude_ft),
    minReleaseAltitude_ft: num(profile.releaseAltitude_ft, params.minReleaseAltitude_ft),
    runInAltitude_ft: num(profile.runInAltitude_ft, params.runInAltitude_ft),
    runInSpeed_ktas: num(profile.runInSpeed_ktas, params.runInSpeed_ktas),
  };
  ```
- Replace every subsequent use of `params.` in this component with `effective.` (geometry call, all tooltips, IP/egress labels). Import `ChucksGuideParams` type from `../../lib/attackGeometry`.

### Task 2.3 — Fix the egress label inconsistency
- Same file, egress info label (~line 215): `Defend ${params.offsetDirection}` → `Defend ${profile.egressDirection ?? effective.offsetDirection}` so the label matches the drawn green egress line (which already uses `profile.egressDirection`).

### Task 2.4 — Clear remaining TS errors so the build gate goes green
- Run `npx tsc --noEmit`. Fix every remaining error — they are all unused imports/variables (`AttackEditor.tsx`, `AttackProfileOverlay.tsx`, `MapView.tsx`, `ThreatList.tsx`, `attackGeometry.ts`). Delete unused imports/vars; prefix intentionally-unused function params with `_`.
- Do NOT change behavior in this task — removal of dead code only.

### Stage 2 Gate
1. `npm run build` — **must pass with zero TS errors** (this becomes the standing gate for all later work).
2. Manual: open an attack, change Pop Distance from 4.0 to 2.5nm and apex to 5000ft, save. The POP marker on the map must move to ~2.5nm from target and the POP/ATK tooltips must show the edited values, not 4nm/7500ft.
3. Set egress direction to `left`: green egress line goes left of attack heading AND label says "Defend left".

---

## Stage 3 — Import robustness (Rust backend)

### Task 3.1 — Don't place failed threat conversions at (0,0)
- File: `src-tauri/src/commands/mod.rs`, `process_threat_unit` (~line 393): `dcs_to_latlon(...).unwrap_or((0.0, 0.0))` puts threats in the Gulf of Guinea on conversion failure.
- Change `process_threat_unit` to return `Option<ProcessedThreat>`: on conversion `Err`, `eprintln!` a warning with the group/unit name and return `None`. Update the caller(s) (search `process_threat_unit(`) to use `filter_map`.
- Verify: `cargo check` clean; `cargo test --lib` passes.

### Task 3.2 — Surface silently dropped waypoints
- Same file, waypoint processing (~line 351): `dcs_to_latlon(...).ok()?` inside `filter_map` silently drops waypoints.
- Keep the drop (a waypoint with no coordinates is unusable) but log it: on `Err(e)`, `eprintln!("WARNING: dropping waypoint {:?}: {}", pt.name, e)` before returning `None`. Steerpoint numbering must continue to use the pre-filter `enumerate` index `(i + 1)` so surviving waypoints keep their original steerpoint numbers (this is already the case — do not change it).
- Verify: `cargo test --lib` passes.

### Task 3.3 — Word-boundary matching in waypoint type inference ✅ DONE (2026-07-26)
Completed ahead of the rest of Stage 3, while diagnosing the reported map problems.

- File: `src-tauri/src/commands/mod.rs`, `infer_waypoint_type`
- Problem: `name_upper.contains("IP")` classified "SLIP"/"SHIP" as IP; `contains("BE")` classified "BEACH"/"ABERDEEN" as bullseye.
- Fixed by tokenizing on non-alphanumeric characters and matching whole tokens, plus a `has_numbered` helper so "TGT1"/"IP2" still classify.

Two corrections to what this task originally prescribed, both found by testing against the real NTTR Red Flag mission:

1. **Tanker callsigns must NOT imply a tanker waypoint.** The original plan said to leave tanker names unchanged because "they're distinctive" — they are not. The real Viper 1 route has a plain nav turnpoint named **ARCO**, which the old code (and the proposed fix) misclassified as a tanker. Only explicit words now match: `TANKER`, `AAR`, `REFUEL`, `REFUELING`. Word-boundary matching alone would not have caught this, since ARCO is already a whole token.
2. **DCS point-type spellings vary.** The `Some("Takeoff Parking Hot")` arm never matched anything — real exports use `TakeOffParkingHot` (no spaces). Point types are now normalized (uppercased, non-alphanumerics stripped) before comparison.

Tests added in a new `#[cfg(test)] mod tests` in `commands/mod.rs`, including `classifies_real_nttr_redflag_route`, which pins all 14 waypoints of the real Viper 1 route.

### Stage 3 Gate
1. `cargo test --lib` — all tests pass, including the new `infer_waypoint_type` tests. ✅ 25 passing as of 2026-07-26.
2. Manual: import `test-data/nttr_redflag_viper1.json` (group `Viper 1 (Hot)`) — "IP" renders yellow (ip), "TGT1"/"TGT2" red (target), "ARCO" plain nav (NOT tanker), and the IP/Target dropdowns in the attack editor are populated (no regression).

---

## Stage 4 — Map interaction & code health

### Task 4.1 — Placement mode: markers must not swallow clicks
- File: `src/components/map/MapView.tsx`
- Problem: react-leaflet only applies `interactive` at layer creation; toggling `interactive={!isPlacementMode}` on existing Markers/Circles does nothing.
- Fix: force remount when placement mode toggles by including it in the key of every Marker/Circle that passes `interactive`: e.g. waypoints `key={`${waypoint.id}-${isPlacementMode}`}`, threat wrapper `key={`${threat.id}-${isPlacementMode}`}`. The bullseye Marker needs a key added: `key={`bullseye-${isPlacementMode}`}`.
- Verify manually: enter placement mode, click directly ON an existing waypoint marker — a threat is placed there (previously the click was swallowed). Exit placement mode — popups work again.

### Task 4.2 — Replace `<span>` wrapper with Fragment
- Same file (~line 250): threats are wrapped in `<span key={threat.id}>`. Change to `<Fragment key={...}>` (import `Fragment` from 'react'), preserving the composite key from Task 4.1.

### Task 4.3 — Deduplicate geo math
- Canonical implementations live in `src/lib/coordinates.ts` (`calculateBearing`, `calculateDistance`, `calculateDestination`).
- `src/lib/attackGeometry.ts`: delete its local `calculateBearing`, `calculateDistance`, `calculatePointAtDistance` and its local `Coordinates` interface; import from `./coordinates` and `../types` instead (`calculatePointAtDistance` = `calculateDestination` — re-export under the old name if other files import it: check `AttackProfileOverlay.tsx` imports).
- `src/components/attacks/AttackEditor.tsx`: delete the inline `calculateBearing` (~line 74) and import from `../../lib/coordinates`.
- Verify: `npm run build` passes; overlay still renders identically (spot-check one attack in the app).

### Task 4.4 — Static color classes in overlay labels
- File: `src/components/map/AttackProfileOverlay.tsx`, `createLabelIcon` uses `bg-${color}-500` — a dynamic Tailwind class that only works because the same literals appear in other files.
- Replace with an explicit lookup: `const colorClasses: Record<string, string> = { red: 'bg-red-500', yellow: 'bg-yellow-500', orange: 'bg-orange-500' };` and use `colorClasses[color] ?? 'bg-gray-500'`.

### Stage 4 Gate
1. `npm run build` green, `cargo test --lib` green.
2. Full manual regression pass: import test mission → add flight member → create attack → verify overlay → place a planning threat via map click (including clicking on a marker) → drag the threat → export kneeboard to a folder and open the PNG (768×1024, correct content).

---

## Completion checklist
- [ ] Stage 1 complete + gate green (commit `Bugfix Stage 1: NaN heading guard`)
- [ ] Stage 2 complete + gate green (commit `Bugfix Stage 2: overlay uses saved profile; tsc green`)
- [ ] Stage 3 complete + gate green (commit `Bugfix Stage 3: import robustness + type inference tests`)
- [ ] Stage 4 complete + gate green (commit `Bugfix Stage 4: map interaction + geo dedupe`)
- [ ] Update `docs/BUGFIX_PLAN.md` status to COMPLETE, update `ROADMAP.md` and `CLAUDE.md` session notes
