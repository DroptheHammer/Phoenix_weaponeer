# 0.2.1 review — bugs, cross-platform, security

Reviewed 2026-09-12, before wider squadron use. **Nothing below is fixed yet** —
pick which to fix, and each fix goes in with a test.

The threat that matters most for a squadron tool is **a file someone else hands
you**: a saved mission `.json`, a FragOrders export, or a profile dropped into the
profiles folder. The worst issue in the app is on that path.

**Confirmed** = traced through the code line by line. **Plausible** = the code
reads that way, but no test or run has shown it yet.

## Status (2026-09-12)

| Item | Status | What changed |
|---|---|---|
| H1 | **Fixed** | `validateMission` checks every opened file before it reaches the store; Leaflet icon strings go through `escapeHtml`. |
| M0 | **Fixed** | Real CSP in `tauri.conf.json` (`devCsp` lets Vite's dev server work; `style-src` kept out of Tauri's nonce injection so Leaflet's inline styles still apply). |
| M1 | **Fixed** | `save_mission` writes only `.json`; `save_kneeboard_png` writes only `.png`, only PNG bytes, and no longer creates folders. |
| M2, M3, M7 | **Fixed** | Per-aircraft kneeboard folders in ⚙ Settings (see the note under M2). |
| M4 | **Fixed** | The window's close button runs the unsaved-changes dialog. macOS Cmd+Q / Dock → Quit do too (app-level `ExitRequested` → `quit-requested`) — tested in the real app 2026-09-14: Discard, Save, Dock Quit, and a clean quit all behave. |
| M5 | **Fixed** | `ErrorBoundary` shows the error and offers **Save a copy…**. |
| M6 | **Fixed** | Clashing card filenames get `_2`, `_3` within one export. |
| M8 | **Fixed** (2026-09-14) | Confirmed by geo-check first (six NaN tests failed). `runAttackChecks` now turns any non-finite number in a profile into an error, so Save is blocked; `DiveForm`/`LevelForm` send a cleared optional field back to Auto, keep the last value for a cleared required field, and re-derive a cleared attack heading. |
| L1 | **Fixed** (2026-09-14) | Both multi-card exports join with Tauri's `join`; the single-card "Saved:" message splits on `/[/\\]/`. `dcsExport.ts` no longer builds paths at all. |
| L7 | **Fixed** (2026-09-14) | `tauri-action` pinned to `84b9d35` (v0) and `rust-toolchain` to `6bed076` (stable, now named with `toolchain: stable`). GitHub's own `checkout`/`setup-node` left on `@v4`. |
| L2, L3 | **Fixed** (2026-09-14) | Removed `mlua`, `zip`, `image`, `rusttype` (plus `uuid` and `thiserror`, whose only users went with them), the `exporters` module, `MizParser`, the stub commands `render_kneeboard` / `export_to_dcs_kneeboard` / `parse_miz_file`, `new_mission` and `chrono_now`. Rust tests 74 → 73 (the `exporters` placeholder test went with it). |
| L4 | **Fixed** (2026-09-14) | `shell:allow-open` removed from `capabilities/default.json`. No click-through possible: nothing in the frontend calls `reveal_profiles_dir` any more (kept for a future "Open profiles folder" button, by choice), and it opens the folder from Rust, which never needed the capability. |
| L5 | **Fixed** (2026-09-14) | `npm audit fix` cleared everything but `uuid` (the advisory is v3/v5/v6 only; the app imports only `v4`, and the fix is a breaking jump to 14 — left alone). `cargo-audit` installed: 6 vulnerabilities found, all transitive, all cleared by compatible `cargo update`s (`bytes` 1.12.1, `time` 0.3.55, `tar` 0.4.46 — a `proj-sys` build dep — and `plist` 1.10.0 → `quick-xml` 0.41.0). Now 0 vulnerabilities; 11 unmaintained/unsound warnings remain, all deep in Tauri's own tree. |
| L6 | **Fixed** (2026-09-14) | `open_database_in` returns a plain message with the path; setup shows it in a native error dialog (non-blocking `show` — setup is on the main thread) and quits with code 1. Two new tests, both shown to fail with the path stripped from the message; Rust tests now 75. The dialog itself has not been seen on screen (skipped by choice — it would mean locking the real database). |
| L8, L9 | Open | Need a Linux / Windows box. |

---

## High

### H1. A crafted mission file can run script, and script can write any file — Confirmed (code trace)
The chain, with every link checked:
1. `load_mission` keeps waypoints as untyped JSON (`src-tauri/src/commands/mod.rs:38`, `waypoints: Vec<Value>`), so nothing checks that `steerpoint` is a number.
2. `loadMission` puts the loaded mission straight into the store (`src/stores/missionStore.ts:138`).
3. The map builds each steerpoint marker as an HTML string: `createWaypointIcon(waypoint.steerpoint.toString(), …)` (`src/components/map/MapView.tsx:382`) interpolates the label into `html:` (`MapView.tsx:226-230`).
4. Leaflet inserts that string with `div.innerHTML` (`node_modules/leaflet/src/layer/marker/DivIcon.js:53`).
5. No CSP (H2), so injected script runs with full access to the app's commands.
6. `save_kneeboard_png(path, base64)` writes **any bytes to any path** and creates folders on the way (`commands/mod.rs:736`).

**Failure scenario:** a mission file shared in Discord has `"steerpoint": "<img src=x onerror=…>"`. Opening it writes a `.bat` into the Windows Startup folder, and that file runs at next login.

**Fix:** (a) build marker icons as DOM nodes with `textContent` rather than HTML strings (three `divIcon` sites plus `AttackProfileOverlay.tsx:68`); (b) validate a loaded mission, e.g. `steerpoint` must be an integer and coordinates finite numbers, and reject the file otherwise; (c) H2; (d) M1.

## Medium

### M0. No Content Security Policy — Confirmed
`src-tauri/tauri.conf.json`: `"csp": null`. This is what turns any HTML injection into full command access.

**Fix:** set one. Something like `default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; style-src 'self' 'unsafe-inline'; connect-src ipc: http://ipc.localhost`. Leaflet and Tailwind need inline styles; the build has no inline scripts and no `eval`. It must be tested with the planner map, the card map tiles, and export.

### M1. File-writing commands take any path and any extension — Confirmed
`save_mission` (`commands/mod.rs:100`) and `save_kneeboard_png` (`:736`) trust whatever path the frontend sends. `save_kneeboard_png` also creates missing folders and doesn't check that the bytes are a PNG.

**Fix:** require `.json` / `.png`, check the PNG signature, and only create folders under a DCS `Kneeboard` directory.

> **M2, M3 and M7 — FIXED (2026-09-12)** by per-aircraft kneeboard folders. Export
> to DCS no longer picks a folder on its own. The first export for each aircraft
> type opens the folder picker at a best guess (database folder name, `DCS` or
> `DCS.openbeta`, nearest existing parent), the user picks, and the choice is
> remembered for that type in `settings.json`. **⚙ Settings** lists every type
> with Choose… and Reset buttons. Cards are grouped by aircraft type.

### M2. Kneeboard folder is wrong for 6 of the 10 aircraft — Confirmed
`getAircraftKneeboardPath` (`src/lib/dcsExport.ts:29-36`) hard-codes 4 aircraft. Everything else falls back to `aircraftId.toUpperCase()`: `av8b` → `AV8B`, where the database says `AV8BNA`; likewise `F4E`, `A4EC`, `F5E`, `F14`, `F1`.

**Failure:** Harrier cards land in a folder DCS never reads.

**Fix:** use `Aircraft.kneeboardPath`, which the app already loads from `get_all_aircraft`. *The database folder names themselves have never been checked against a real DCS install.*

### M3. "Export All to DCS" files every card under the first attack's aircraft — Confirmed
`KneeboardPreview.tsx` (`firstAttack` → one `aircraftPath` for the whole loop).

**Failure:** in a mixed F-16 / A-10 package, the A-10 cards go into `Kneeboard/F-16C`.

**Fix:** work out the folder per card.

### M4. Quitting the app throws away unsaved work without asking — Confirmed
`guardUnsaved` (`src/App.tsx:74`) covers New, Import, Open and Close. Nothing handles closing the window (no `onCloseRequested` or `beforeunload` anywhere).

**Fix:** a Tauri `onCloseRequested` handler that reuses the existing confirm dialog.

### M5. No error boundary: one render crash blanks the whole app — Confirmed
There is no `ErrorBoundary` anywhere in `src/`. A malformed shared mission, or any bug that throws while rendering, leaves a white window. Unsaved work can't be reached.

**Fix:** a top-level boundary that shows the error and offers to save a recovery copy.

### M6. Card filenames collide and overwrite silently — Confirmed
`kneeboardFilename(callsign, targetName)` (`src/lib/buildKneeboardCard.ts:419`).

**Failure:** two attacks by the same pilot on the same target (a re-attack), or two names that sanitize to the same string (any non-Latin callsign → `_`), overwrite each other in Export All. The count still says "Saved 2".

**Fix:** add the attack's sequence number, or a `-2` suffix on a clash.

### M7. DCS folder detection misses a relocated Saved Games — Confirmed (never run on Windows)
`detect_dcs_folder` (`commands/mod.rs:753`) builds `%USERPROFILE%\Saved Games` by hand. Saved Games moved to another drive or redirected by OneDrive isn't found, so the user gets the manual folder picker instead of auto-export.

**Fix:** ask Windows for the Known Folder (`FOLDERID_SavedGames`).

### M8. Clearing a Customize number field can save NaN — Confirmed, FIXED 2026-09-14
`DiveForm.tsx:25`, `LevelForm.tsx:26` (and the pop-up fields) store `parseFloat('')` = `NaN`. `attackChecks` skips non-finite values (`attackChecks.ts:54`), so nothing turns into an error and Save stays enabled.

**Failure:** the card or map shows `NaN` or a missing leg.

**Fix:** treat a blank field as "use the profile value", and flag non-finite numbers as errors. Confirm with a geo-check test first.

## Low

### L1. Windows path handling in export — Confirmed
- `path.split('/').pop()` in the "Saved:" message shows the whole path on Windows. `App.tsx:84` already uses `/[/\\]/`.
- `${folder}/${filename}` (KneeboardPreview) and `${dcsBasePath}/Kneeboard/…` (`dcsExport.ts:15`) mix separators. Windows accepts that, but `@tauri-apps/api/path` `join` is the right tool.

### L2. Dead code and unused crates in the Rust backend — Confirmed
- `mlua` (vendored: compiles Lua's C source in every CI build) has **zero uses**.
- `zip` is used only by the unused `MizParser` stub.
- `image` and `rusttype` are used only by the `exporters` stub.
- The stub commands `render_kneeboard`, `export_to_dcs_kneeboard` and `parse_miz_file` are still registered as IPC commands, and `new_mission` is never called by the frontend.

**Fix:** remove them all. Smaller attack surface, faster release builds.

### L3. `chrono_now` writes a fake timestamp — Confirmed, but dead
`2024-01-01T00:00:NNNNNZ`, used only by `new_mission`, which nothing calls. It goes with L2.

### L4. The frontend is granted `shell:allow-open` but never uses it — Confirmed
Only Rust's `reveal_profiles_dir` opens a folder, and Rust-side calls don't need the capability. Remove it from `capabilities/default.json` (check the folder reveal still works).

### L5. npm advisories — Confirmed, none reach the installers
`npm audit`: 10 findings, all build-time or dev-server (`vite` ≤6.4.2 ×4, `rollup`, `postcss`, `picomatch`, `nanoid`, `browserslist`, `@babel/core`). `npm audit fix` clears them without breaking changes. The `uuid` advisory affects v3/v5/v6 only, and the app uses only v4. **Rust crates were not scanned** because `cargo-audit` isn't installed.

### L6. A database problem at launch is a silent crash — Confirmed
`lib.rs` setup `expect(...)`s the app-data folder and the database open. A locked, unwritable or corrupt DB file means the app just doesn't start.

**Fix:** show a native dialog with the path and the error.

### L7. CI actions are pinned to tags, not commits — Confirmed
`tauri-apps/tauri-action@v0` and `dtolnay/rust-toolchain@stable`, in a job with `contents: write`. This is optional supply-chain hardening: pin them to commit SHAs.

### L8. Card fonts on Linux — Not verified
`'Arial Narrow'` and `'Courier New'` are usually missing on Linux. Labels are measured when drawn, so the layout should adapt, but the look will differ. Check on a Linux box.

### L9. Card map tiles — informational
Tile requests tell OSM's servers which area is being planned. That's fine for training, but worth knowing. Volume is tiny: about 30 tiles per card, cached per session, no bulk fetching. **Windows (WebView2) and Linux (WebKitGTK) haven't run the tile/CORS path yet.** A failed load degrades to a card without the map; it never breaks export.

---

## Already in good shape
- No `unwrap`/`expect`/indexing panics in non-test Rust code outside setup (L6).
- The FragOrders import reports every dropped point as a warning instead of silently placing it at (0,0).
- Profile files are validated field by field, and a bad file becomes a warning, not a crash.
- React escapes every name it renders. H1 is specifically the one place that bypasses React: Leaflet's `divIcon` HTML strings.
