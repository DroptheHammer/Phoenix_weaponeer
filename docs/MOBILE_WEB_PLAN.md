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
