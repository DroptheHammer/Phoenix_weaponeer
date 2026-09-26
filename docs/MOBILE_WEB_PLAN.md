# Phone web app: plan and handoff log

**Status:** in progress. Work happens on branch `claude/mobile-app-distribution-b6uo76`.
Nothing is public until milestone M5 and the user's go-ahead.

**For a fresh session:** read the **Handoff log** at the bottom first. It says exactly
where the work stopped and what comes next. The plan above it is the agreed design.
Don't reopen those decisions.

---

## Why

Squadron members should be able to plan on iPhone and Android. App stores are out
for now: they cost money, need review, and show the developer's legal name on the
listing. Instead, the app also ships as an **installable web app** ("Add to Home
Screen") on **GitHub Pages**, at no cost.

The desktop Tauri app and its installers keep working unchanged. It's still the only
build that writes cards straight into DCS's Saved Games folder. Desktop browsers get
today's desktop layout from the web build.

## Decisions (made by the user, 2026-09-26)

- **Scope:** the full planner on the phone in v1, including Customize sliders and multi-jet strikes.
- **Layout:** a full-screen map with a bottom tab bar and a bottom sheet (peek, half, full).
- **Placing things on the map:** a fixed crosshair in the middle of the screen with
  "Set here". There is no finger dragging on phones.
- **Extras:**
  - Autosave with a "My missions" list on the device.
  - Kneeboard mode: a full-screen card with the screen kept awake.
  - Share all cards.
- **Easter egg:** "Strike near me", which plans a strike on a real-world spot found by
  the phone's GPS.
- **Hosting:** GitHub Pages. No app stores for now.
- **Not chosen:**
  - Android share-to-app (web apps can't receive shares on iOS).
  - Native Tauri mobile builds.
  - Google Play and the App Store.

## What the code audit found (2026-09-26)

### Rust backend: 24 commands (`src-tauri/src/lib.rs:90-120`, bodies in `commands/mod.rs`)
- **Pure computation, about 3,800 lines.** Parsers, coordinate conversion, threat mapping,
  profiles, `airfields_data`. This ports to WASM once `proj` is gone.
- **Six database reads.** SQLite holds **reference data only** (`db/mod.rs:115-121`,
  seeded at `:250-420`, schema v4). It can ship as embedded data.
- **About 11 filesystem commands.** Missions, PNGs, settings, recent missions, the DCS folder.
- **One network command.** `fragorders_link.rs`: a Firestore manifest, then a CloudFront bundle.
- **Lifecycle.** Quit and the close guard (`lib.rs:123-137`).

### Won't build for `wasm32`
- `proj`: C++. It's used only in `parsers/coordinate_conversion.rs`, and every theater is a
  plain WGS84 `+proj=tmerc`.
- `rusqlite`, `ureq`, `tauri`, and its plugins.
- `std::fs`: compiles, but fails at runtime.

### FragOrders from a browser
- The Firestore manifest request **allows browser origins** (checked 2026-09-26).
- The CloudFront bundle is not yet tested. If it refuses, add a free Cloudflare Worker
  proxy locked to the two hosts.

### Frontend
- 24 `invoke()` calls across 9 files, with no central wrapper.
  `src/hooks/useTauriCommand.ts` exists but nothing uses it.
- Dialog plugin imports are in `missionFile.ts`, `KneeboardPreview.tsx` and `dcsExport.ts`.

### UI
- **Navigation** is `useState` flags in `App.tsx`, with no router.
- **The mission view** (`App.tsx:389-535`):
  - A full-bleed `MapView`.
  - Five toggle buttons at the top left.
  - An `absolute right-0 w-1/3` side panel.
  - The header is one row of 7 buttons (`App.tsx:308-377`).
- **AttackEditor:** a `Modal fill` with a `w-[460px]` controls column (`AttackEditor.tsx:185`),
  plus `AttackPreviewMap`, `RunInReadout` and `SideProfileView`.
- **Map picks** go through `uiStore.mapPick` (`uiStore.ts:55`).
- **`KneeboardPreview`** shows one card per attack, picked from a `<select>` and drawn at 384×512.
- **Five hand-rolled overlays** don't use `common/Modal.tsx`: FlightMemberEditor,
  LoadoutEditor, the ThreatList add form, SettingsModal and FragOrdersImport.
- **Geometry** works entirely on lat/lon (`src/lib/attackPicture.ts`). The theater only
  gives the map's starting center (`MapView.tsx:93`).
- **Styling:** dark theme only. `bg-dcs-darker` is used but never defined in `tailwind.config`.

## Part A: Web build foundation (no visible change on desktop)

1. **Replace `proj` with a pure-Rust transverse Mercator** in `parsers/coordinate_conversion.rs`.
   - Gates: `npm run geo-check` 312/312, and every coordinate test passes.
   - This also removes the CMake/PROJ build from release CI.
2. **Create a `core` crate** (a workspace member) holding:
   - the parsers
   - coordinate conversion
   - threat mapping
   - embedded profiles
   - `airfields_data`
   - the reference data as Rust data, converted from the seed INSERTs

   The Tauri commands call into it. A `wasm-bindgen` wrapper (`core-wasm`) exposes the
   same functions to the browser.
3. **Add a `src/lib/backend.ts` adapter** with a Tauri implementation and a web implementation,
   chosen at build time.
   - Route all 24 `invoke()` call sites and the dialog-plugin imports through it.
   - Remove the unused `useTauriCommand.ts`.
4. **Web implementations:**
   - Mission open: a file input. Mission save: download or share the `.json`.
   - Settings: `localStorage`.
   - FragOrders: `fetch`, with the same host checks as `fragorders_link.rs`.
   - Hidden on the web: the DCS-folder export, Quit, and reveal-profiles.
5. **Separate web build:** `vite.config.web.ts` and `npm run build:web`, with `vite-plugin-pwa`
   providing:
   - the manifest, using the icons in `src-tauri/icons`
   - a service worker for the offline app shell
   - an "Update available, tap to reload" banner

   The Tauri `vite.config.ts` and `release.yml` are untouched.

## Part B: Phone UI (below 768px; the desktop layout is unchanged above)

### Shell
- **`src/hooks/useIsPhone.ts`** (`matchMedia`). `App.tsx` renders `<PhoneShell/>` or today's
  layout. Both share the stores and panel components.
- **PhoneShell** (`src/components/phone/`):
  - **Top bar:** mission name, a dirty dot, and a ⋯ menu (New, Open .json,
    Import FragOrders, Export .json, My missions, Settings, 📍 Strike near me).
  - A full-screen `MapView`.
  - **Bottom tab bar:** Map · Threats · Flight · Attacks · Cards.
  - **Bottom sheet** (peek, half, full) holding the existing panels: WaypointList, ThreatList,
    FlightRoster, AttackList, KneeboardPreview.
- **Landing page on the phone:** My missions (autosaved), Import FragOrders, Open .json, New,
  📍 Strike near me.
- **Modals:** `common/Modal.tsx` renders full screen on the phone. Move the five hand-rolled
  overlays onto `Modal`.

### Attack editor
- On the phone it becomes a full-screen page:
  - `AttackPreviewMap` pinned at the top, about 35% of the height.
  - `RunInReadout` as a strip of chips you swipe sideways.
  - `SideProfileView` behind a toggle.
  - JetPanel or GroupPanel scrolling below.
- `JetStrip` becomes a sideways row of chips (Group | Jet 1 | Jet 2…), and you can swipe
  between jets.
- **SliderField:** a larger thumb, −/+ step buttons, and a number box with `inputmode="decimal"`.

### Map
- **Crosshair pick.** On a phone, arming `uiStore.mapPick` shows:
  - a fixed crosshair
  - a "Set here" button, which reads `map.getCenter()`
  - Cancel

  It's used by IpPicker "📍 Place on map", ThreatList "+ Add Threat", and "Move" (which
  replaces dragging a custom IP or planning threat). It works in both MapView and
  AttackPreviewMap.
- MapLegend becomes a **Layers** button and sheet.
- Information carried by `title=` tooltips moves to tap popups or ⓘ buttons.
- The FragOrdersImport preview tables become stacked cards.

### Cards
- A full-width carousel (CSS scroll-snap). Tap a card for a zoomable full-screen view.
- **Share** and **Share all** use `navigator.share({ files })` with PNGs, and fall back to download.
- **Kneeboard mode:** a full-screen viewer, swipe between cards, screen kept awake with the
  Wake Lock API.

### Autosave and My missions
- Missions are stored in IndexedDB (`idb-keyval`), autosaved with a debounce from the
  mission store. `navigator.storage.persist()` is requested.
- On the web, the recent-missions list comes from here.
- Export .json stays the durable backup, and the way to move a plan to the PC.

### Web basics
- Tap targets of at least 44px.
- Input text of at least 16px, so iOS doesn't zoom in on focus.
- `env(safe-area-inset-*)` for the notch and home bar.
- `overscroll-behavior: none` on the map.
- Portrait and landscape.
- `100dvh` instead of `100vh` (`App.tsx:389`).
- Define the missing `dcs-darker` colour.

## Part D: "Strike near me" Easter egg

- **A `real_world` pseudo-theater** in the core theater list:
  - Named "Real world (not a DCS map)".
  - It has no DCS x/y projection, and FragOrders import never produces it.
  - The map center comes from the mission.
  - A "Real world, can't be flown in DCS" banner replaces the "coordinates unverified" banner.
- **Flow:**
  1. Tap 📍 Strike near me.
  2. The browser asks for location (`navigator.geolocation`).
  3. The map centers on the user.
  4. The crosshair "Set target here" defaults to that spot; pan to pick somewhere nearby.
  5. A new mission is created with a TGT waypoint.
  6. Target elevation is typed into a box (default 0 ft MSL).
  7. A one-jet F-16C flight is added.
  8. The normal flow continues from there.
- **Web build first.** Desktop browsers also work, with a rougher location. In the Tauri
  desktop app it's hidden, or offered as a "pick anywhere on the map" variant (decide when
  building).
- **Privacy:**
  - The location never leaves the device. There's no geocoding and no elevation API.
  - Map tiles are the only traffic.
  - Sharing or exporting a real-world card or `.json` shows a warning first:
    "This contains the real location you picked."
  - Tests use **synthetic coordinates only**.

## Part C: Hosting

- **`.github/workflows/pages.yml`** builds the WASM with `wasm-pack`, runs `npm run build:web`,
  then deploys with `actions/deploy-pages`. No `gh-pages` branch commits.
- It's **`workflow_dispatch` only** until the user approves going public. After that it
  runs on `v*` tags. Add it to the CLAUDE.md release checklist then.
- **Before the first public deploy**, run a privacy scan over `dist/`:
  - no source maps
  - no analytics
  - nothing from `Other Items/` or `test-data/private/` (CI builds from a clean checkout)
- **Map tiles:** keep OSM with attribution. If usage grows, fall back to a free-tier
  provider with an API key.

## Milestones

| # | Milestone | Content |
|---|---|---|
| M1 | Foundation | Part A. The web build runs in a desktop browser, and every desktop gate is green. |
| M2 | Phone shell | Breakpoint, top bar, tabs and sheet, full-screen Modal, landing page, My missions, autosave. |
| M3 | Planning | Import, threats, flight and loadout, the full attack editor with Customize and strikes, crosshair pick, sliders. |
| M4 | Cards | Carousel, share and share all, kneeboard mode. |
| M4b | Strike near me | Part D. |
| M5 | Ship | PWA polish, Pages deploy, real-device test, privacy scan, then the user approves going public. |

## Verification

### Every milestone
- `npm run geo-check` (312)
- `cargo test` (106 before this work; it grows)
- `npm run build`
- The Tauri desktop app looks and works the same at 768px and wider.

### Web
- Run `npm run build:web && npx vite preview`.
- Drive it with Playwright/Chromium (`/opt/pw-browsers` in cloud sessions) at 390×844 and
  412×915, in portrait and landscape.
- Walk the whole flow: import JSON → threats → flight → add an attack → Customize → strike →
  cards → share and share all → kneeboard mode → reload → mission restored from My missions.

### Strike near me
- Playwright with a mocked geolocation at a synthetic point.

### FragOrders link
- Test a link from `test-data/private/` on the main Mac.

### Real iPhone (Safari) and Android (Chrome)
- Add to Home Screen, offline launch, the share sheet, Wake Lock, and crosshair precision.

---

## Handoff log (newest first; keep this current)

### 2026-09-27 (overnight, the user asleep): M3, M4, M4b and M5 in progress

- **The user's standing instructions for the night:**
  - Keep building the plan.
  - Use sub-agents freely for parallel parts.
  - At a genuine decision point, build **3 options on separate branches** (at most 3×3×3 = 27
    leaves) so the user can pick in a morning walkthrough.
  - Explain everything in the walkthrough in plain, non-technical words.
  - After the walkthrough, delete the unused branches.
- **In parallel sub-agents (worktrees off `cc8a9fc`), to be merged into this branch:**
  - **M3a:** the phone Attack editor, JetStrip chips and swipe, SliderField −/+.
  - **M3b:** map interaction on phones: crosshair pick, Move instead of drag, the Layers
    button, tooltips to taps.
  - **M4:** the cards carousel, zoom, Share and Share all (a new Platform share method),
    kneeboard mode (Wake Lock), and the FragOrdersPreview cards.
- **Done on this branch meanwhile:**
  - **M5 hosting:**
    - `.github/workflows/pages.yml` (workflow_dispatch only; needs repo Settings → Pages →
      Source: GitHub Actions).
    - `scripts/build-wasm.mjs`: remaps the absolute source paths Rust embeds in the `.wasm`.
      The home-folder path would have leaked the username.
    - `scripts/web-privacy-check.mjs`: the last step of `build:web`; fails on home paths,
      private folders or source maps.
    - The update prompt: `@pwa-update` alias and `UpdateBanner`, with the service worker in
      `registerType: 'prompt'`.
    - `release.yml` no longer installs sqlite3 on Windows (it was only for PROJ).
  - **M4b (partly):**
    - The `real_world` pseudo-theater in `crates/core/src/theaters.rs`.
    - `src/lib/strikeNearMe.ts` builds the mission: target, an IP 10 nm out on the far side
      from the planner, and one F-16C with 6 Mk-82s. Covered by 8 geo-checks (320 total).
    - `src/components/mission/StrikeNearMe.tsx`: GPS, the crosshair screen, and the details form.
    - **Not yet wired into the App.** That comes after the merges: landing button, ⋯ menu,
      real-world banner, share/export warnings.
- **Later that night:**
  - **Merged:** M3a (`22fa366`), M3b (`857648d`) and M4 (`0247345`).
  - **`map/ZoomTimerGuard`** fixed the `_leaflet_pos` crash. Closing a map mid-zoom threw
    from a Leaflet timer.
  - **Strike near me is wired in** (`2684b8c`), web only:
    - A front-page button and a ⋯ menu item.
    - The blue "Real world: can't be flown in DCS" banner.
    - Privacy warnings before sharing a card (inline "Share anyway") and before exporting
      the `.json` or downloading cards (confirm).
    - `scripts/web-smoke-strike.cjs` runs the flow with a mocked synthetic location.
  - **All smoke tests pass with no page errors:**
    - `web-smoke.cjs` at 390×844, 844×390 and 1280×800
    - `web-smoke-cards.cjs` at 390×844 and 412×915
    - `web-smoke-strike.cjs`
  - geo-check: 320 on the main branch.
- **A real FragOrders link was tested from the cloud.**
  - The Firestore manifest allows the GitHub Pages origin.
  - The CloudFront bundle host is blocked by the cloud sandbox's network policy, so its
    CORS answer is still unknown. Test it with `npm run dev:web` on the Mac, or allow the
    host in the environment settings.
- **Decisions for the morning walkthrough.** A = what is on this branch; B and C are
  branches off `2684b8c`, one commit each.
  - **D1, Strike near me in the desktop app:**
    - A: web only.
    - B: `…-opt-d1b-desktop-map`. Desktop too, opening on the world with no GPS.
    - C: `…-opt-d1c-desktop-coords`. Like B, plus a "Go to" box for typed coordinates or a
      pasted Google Maps / OSM link, on every platform (`parseLocation`, 11 geo-checks).
  - **D2, the Cards tab on a phone:**
    - A: half-height sheet, pull up for full width.
    - B: opens at full height.
    - C: a vertical list of full-width cards. Being built by a sub-agent.
  - **D3, the Attack editor with a phone held sideways:**
    - A: map beside the controls.
    - B: one column with a short map.
    - C: the map behind a Show/Hide toggle. Being built by a sub-agent.
  - Branch names all start `claude/mobile-app-distribution-b6uo76-opt-`. After the
    walkthrough, merge the picks here and delete the rest.

### 2026-09-26 (late): M2 done, the phone shell

- **Built:**
  - `src/hooks/useIsPhone.ts`: `(max-width: 767px), (max-height: 500px)`, the same query as
    the phone rules in `index.css` (16px inputs, no overscroll).
  - `src/components/phone/PhoneShell.tsx`:
    - The top bar holds the title, a dirty dot and the ⋯ menu (New, Import, Open .json,
      Export .json, Close, Settings).
    - The message bar dismisses on tap.
    - The map fills the screen.
    - The tab bar reads Route · Threats · Flight · Attacks · Cards, with counts.
  - `src/components/phone/BottomSheet.tsx`: half or full height, switched by tap or drag
    on the handle; a drag low down closes it.
  - `App.tsx` builds the shared pieces once (`mapView`, `unverifiedBanner`, `renderPanel`,
    `dialogs`, `startButtons`) and renders either `PhoneShell` or the unchanged desktop layout.
  - **Autosave (web only):**
    - `lib/localMissions.ts` (IndexedDB) and `stores/localMissionStore.ts` (`useAutosave`,
      `flushAutosave`, `isAutosaved`).
    - Writes 400 ms after a change, and at once on visibility-hidden or pagehide.
    - On the web, `guardUnsaved` and the close guard only ask if autosave failed.
  - `components/mission/MyMissions.tsx`: on the web landing page (both layouts) instead of
    the recent-files list. Opening goes through `openLocalMission` (validated like a file);
    deleting asks first.
  - On the web, the header "Save" reads "Export .json" and "Save As" is hidden.
  - `common/Modal.tsx` is full screen on a phone. The five hand-rolled overlays now use it:
    FlightMemberEditor, LoadoutEditor, the ThreatList add form, FragOrdersImport and
    SettingsModal.
    - Desktop side effects: slightly different title sizes, and the Loadout dialog no longer
      closes on a backdrop click (Escape and × do).
  - `tailwind.config.js` defines `dcs-darker` (the hover/selected rows had no colour before).
- **Verified:** `scripts/web-smoke.cjs` runs at 390×844 (phone) and 1280×800. It now covers
  Export → Close → My missions lists it → reopen from My missions → Open the exported file.
  All steps pass.
- **Known issue (M3):** the Attack editor on a phone still uses the desktop two-column layout.
  Its preview map gets no width, which throws a Leaflet `_leaflet_pos` page error at 390×844.
  Fixing this is the first M3 item.
- **Next action: M3.** In order:
  1. The phone AttackEditor layout: pinned map, then the run-in chip strip, the side view
     toggle and scrolling controls; JetStrip chips with swipe.
  2. SliderField −/+ steps and `inputmode`.
  3. The crosshair map pick (`uiStore.mapPick`) for IpPicker, Add Threat and Move.
  4. The Layers button replacing MapLegend.
  5. Tooltips to taps.
  6. FragOrdersPreview tables as cards.

### 2026-09-26 (night): M1 done, the web build runs the whole app

- **M1c done:**
  - `src/lib/platform/` holds `types.ts`, `desktop.ts` (every Tauri call now lives here) and
    `web.ts` (WASM plus the browser).
  - Every former `invoke` site uses `import { platform } from '@platform'`. The files:
    `App.tsx`, `missionFile.ts`, `dcsExport.ts`, `settingsStore`, `theaterStore`,
    `profileStore`, `LoadoutEditor`, `FragOrdersImport`, `KneeboardPreview`, `SettingsModal`.
  - `useTauriCommand.ts` is deleted.
  - Web-only hiding: the Quit button, 🎯 Export to DCS and the per-aircraft folder rows, and
    the Settings → DCS kneeboard folders section. "Export" reads "Download" on the web.
- **Web build:**
  - `npm run build:web` runs `build:wasm`, then `tsc -p tsconfig.web.json`, then
    `vite build --config vite.config.web.ts`, writing `dist-web/`.
  - `npm run dev:web` serves on port 1421.
  - The PWA comes from `vite-plugin-pwa`: manifest, service worker (autoUpdate), offline
    precache of the app and the `.wasm`, and a 7-day OSM tile cache.
  - Icons are emitted from `src-tauri/icons`; none are copied into the repo.
  - Phone meta tags (`viewport-fit=cover`, theme colour, apple-touch-icon) are injected into
    the web `index.html` only.
- **Verified:**
  - `scripts/web-smoke.cjs` (Playwright, synthetic `test-data/nevada_SYNTHETIC_link_payload.json`)
    passes on a desktop-size viewport: import JSON → preview → mission on the map → threats
    (Kub and Shilka mapped) → Save As downloads the `.json` → Close → Open that file back →
    Attack editor opens.
  - No page errors. The only failed requests are OSM tiles, which the cloud sandbox's browser
    can't reach.
  - Gates: core 95, desktop 21, wasm 3, geo-check 312, and both `tsc` configs and both
    builds are clean.
- **Not yet checked:**
  - The desktop app run by hand (the Tauri UI). The code path is the same `invoke` calls,
    moved into `desktop.ts`. Worth a quick click-through on the Mac: Open, Save, Import URL,
    Export, Export to DCS, Quit guard.
  - A real FragOrders link from a browser (the CloudFront CORS question). Try one in
    `npm run dev:web` on the Mac.
- **Next action: M2 (phone shell).** Start with `src/hooks/useIsPhone.ts` and
  `src/components/phone/PhoneShell.tsx`, following Part B. Check against the real layout with
  `scripts/web-smoke.cjs` at 390×844, and extend the script as the phone UI grows.

### 2026-09-26 (evening): M1b done, M1c in progress

- **M1b done:** commits `98b4865` (the core split, SQLite dropped) and `5ba396d` (`crates/wasm`).
  - `crates/core` (`weaponeer-core`) holds:
    - `parsers/`
    - `import.rs` (`import_json`, `import_link`, `process_*`)
    - `refdata.rs` (`reference()`, from `data/reference.json`; all 51 query answers checked
      identical to SQLite's)
    - `profiles.rs` (`load_all(Vec<UserFile>)`)
    - `mission.rs`
    - `theaters.rs`
    - `fragorders_link.rs` (checks and parsing, plus shared error wording)
  - `src-tauri` keeps `commands/mod.rs` (files, settings, lifecycle), `link_fetch.rs` (ureq)
    and `settings.rs`.
  - `crates/wasm` mirrors each core command as a `#[wasm_bindgen]` fn that returns JSON text.
    `npm run build:wasm` writes `src/generated/weaponeer-wasm/` (git-ignored).
  - Tests: core 95, desktop 21 (+1 ignored), wasm 3, geo-check 312.
  - **Gates now:**
    - `cargo test --manifest-path crates/core/Cargo.toml`
    - `cargo test --manifest-path src-tauri/Cargo.toml`
    - `cargo test --manifest-path crates/wasm/Cargo.toml`
    - `npm run geo-check`
    - `npm run build`
  - Tooling for the web build: `rustup target add wasm32-unknown-unknown` and
    `cargo install wasm-bindgen-cli --version 0.2.129 --locked` (it must match the
    `=0.2.129` pin in `crates/wasm/Cargo.toml`).
- **M1c design (in progress):**
  - The `src/lib/platform/` interface (`types.ts`) has two implementations, `desktop.ts`
    (Tauri) and `web.ts` (WASM plus browser APIs).
  - Import it as `@platform`. `tsconfig.json` and `vite.config.ts` map it to `desktop.ts`;
    `tsconfig.web.json` and `vite.config.web.ts` map it to `web.ts`.
  - `tsconfig.json` excludes `web.ts` so the desktop build never needs the generated bindings.
  - The interface covers:
    - `call(command, args)` for the 10 core commands
    - settings
    - mission file choose/read/write
    - card save/folder/write
    - DCS folder helpers
    - `quit` and `guardClose`
  - **Web behaviour for M1c (improved in M2 and M4):**
    - Save downloads the `.json`, and Open uses a file input.
    - Cards download.
    - Settings are in `localStorage`, and the recent list is empty on the web.
    - The close guard is the browser's own `beforeunload` prompt.
    - Quit and the DCS folder buttons are hidden.

Update this section at every checkpoint: after each sub-step, before a context clear, and at
session end. Each entry gives the state and the **exact next action**.

### Setting up a fresh cloud session

- **Branch:** work on `claude/mobile-app-distribution-b6uo76`.
  - `git fetch origin claude/mobile-app-distribution-b6uo76 && git checkout claude/mobile-app-distribution-b6uo76`
  - Merge `main` in only on purpose. Never rebase or force-push.
- **Install:**
  - `npm ci`
  - Rust tests need the Tauri Linux libraries:
    `apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libayatana-appindicator3-dev librsvg2-dev`
  - From M1b on: `rustup target add wasm32-unknown-unknown`, and `cargo install wasm-pack`
    (or the npm `wasm-pack` package).
- **Gates:**
  - `npm run geo-check`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `npm run build`
  - Some Rust tests load `test-data/private/` and skip when it's absent. That's expected in cloud sessions.
- **Privacy rules** (CLAUDE.md): commit with `TZ=UTC`, and never put real coordinates,
  names or FragOrders link ids into the repo.

### 2026-09-26 (later): M1a done, M1b designed

- **M1a done:**
  - `src-tauri/src/parsers/tmerc.rs` is a pure-Rust transverse Mercator: Krüger series to
    n³, with an exact iterative inverse latitude. It reads the theater `proj4_string`s and
    refuses parameters it does not model.
  - `coordinate_conversion.rs` uses it, and `proj` is gone from `Cargo.toml`.
  - `src-tauri/.cargo/config.toml` (a Mac linker path, needed only by PROJ) is deleted.
  - The CLAUDE.md setup and release sections are updated.
  - **Proof:** before PROJ was removed, a temporary test compared both at 21,756 points
    (±9° lat, ±12° lon around every theater) against system PROJ 9.4. The worst difference
    was 0.14 mm going to grid coordinates and 3.6e-10° going back. All 111 Rust tests passed
    with both in place.
  - A cloud container needs `apt-get install libproj-dev` **only** to rerun that comparison,
    which is no longer in the tree.
- **M1b design (decided, not yet built):**
  - **New crates, outside `src-tauri`, with no Cargo workspace:**
    - `crates/core` (package `weaponeer-core`, pure Rust). The Tauri app depends on it via
      `path = "../crates/core"`.
    - `crates/wasm` (package `weaponeer-wasm`, a `wasm-bindgen` wrapper), with its own
      lockfile and target dir.
    - `release.yml` is untouched.
  - **Moves to core:**
    - all of `parsers/`
    - `profiles` (the embedded bundled profiles plus merge and validate; reading the user
      folder stays in Tauri and passes the file contents in)
    - the import functions from `commands/mod.rs`: `process_fragorders_json`,
      `process_tasking_state`, `resolve_theater`, `convert_route`, `process_threat_unit`,
      `process_player_group`, `infer_waypoint_type`, `waypoint_name`, `deduplicate_threats`,
      and their tests
    - `Mission` and `parse_saved_mission`
    - `TheaterInfo` and `list_theaters`
    - the pure parts of `fragorders_link.rs` (`link_id`, `canonical_link`, `read_manifest`,
      `check_bundle_address`), plus a shared helper that turns a fetched link into
      `ProcessedFragOrdersData` (the notice and `source` logic now in `fetch_fragorders_url`)
    - the `private_fixture!` macro, with the path adjusted
  - **The SQLite reference DB is replaced by in-memory data**, for desktop too:
    - Dump the current seed through the existing Rust code into
      `crates/core/data/reference.json`, holding `threat_systems`, `weapons`, `fuze_options`,
      `aircraft` and `aircraft_weapons`.
    - `include_str!` it and parse it once.
    - Keep the query methods and SQL orderings: threats by (type, name), or by name within
      a type; weapons by (category, name); fuzes and aircraft by name.
    - `carried_by` is derived from `aircraft_weapons`.
    - `dcs_unit_name` matching is ASCII case-insensitive.
    - Drop `rusqlite`, `db/mod.rs`, `open_database_in` and its two tests, and the DB startup
      error dialog.
    - Move the SQL comments' provenance notes into `refdata.rs` docs.
  - **Keep the IPC contract byte-identical:** the same command names, argument names and
    JSON shapes.
- **Next action:** build M1b as above, then run the gates and commit.

### 2026-09-26: plan agreed, build started

- **Done:**
  - Plan agreed with the user through several rounds of questions. This file was written.
  - A cloud container was set up (npm ci, apt libraries).
- **State:** no code changed yet.
- **Next action: M1a.**
  1. In `src-tauri/src/parsers/coordinate_conversion.rs`, replace `proj::Proj` in
     `dcs_to_latlon` and `latlon_to_dcs` with a pure-Rust transverse Mercator: WGS84 ellipsoid,
     Krüger series, reading `lon_0`, `k_0`, `x_0`, `y_0` parsed from each theater's
     `proj4_string` (lat_0 = 0).
  2. Keep the `(y, x)` axis convention exactly as documented there.
  3. Remove `proj` from `src-tauri/Cargo.toml` and let `Cargo.lock` follow.
  4. Gates: all coordinate tests, including the Nevada and Sinai landmarks and the map-corner
     test (5 m tolerance), plus `npm run geo-check`.
  5. Then check that `.github/workflows/release.yml` and the CLAUDE.md "How the release build
     works" section no longer need the CMake/PROJ notes, and update them.
