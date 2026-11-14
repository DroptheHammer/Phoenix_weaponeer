# 0.4.0 — "Polish and Playback": brief for the Fable 5.2 creative director

## Context

The squad rates the app's workflow about 7/10. The data, colour scheme and
kneeboard cards are good and **must not change**. Two things hold it back:

1. **The UI looks basic and clunky, the opening screens most of all.** The
   landing page (`src/App.tsx:443-472`, `:718-750`) is four buttons, a recent
   list, and two dead reference lists (every threat and aircraft in the
   database: plain divs that do nothing). Styling is ad-hoc Tailwind with
   duplicated button strings, no CSS variables, and an `Inter` font that never
   loads.
2. **There's no way to *see* a coordinated strike happen.** A flight briefs
   from a static map and side view. 0.4.0 adds a **3D animated playback** of a
   strike, so a flight can hit play from the IP and watch every jet fly its
   profile, release and impact in sequence.

This file is the brief. A Fable 5.2 session directs the work and dispatches
Opus / Sonnet / Haiku sub-agents. Planned with the user on 2026-11-14, right
after 0.3.4 was published; every decision in the table below is theirs.

## Decisions already made by the user (don't reopen)

| Area | Decision |
|---|---|
| Front page | One big **"load a mission" box** (paste a FragOrders link, or drop/pick a FragOrders `.json` or saved mission; it detects which), **recent missions as cards** (map thumbnail, theater, flights, last edited), and a **mission summary screen** after loading, before the map. The threat/aircraft database lists leave the front page. |
| `.miz` | **Not** read directly in 0.4.0. The box takes links, FragOrders `.json` and saved missions only. |
| UI scope | Landing + import flow + **app shell** (header, side rail, panel frames). The editors and forms inside panels are out of scope except for picking up shared tokens and components. Kneeboards and their colours (`cardTheme.ts`) are untouched. |
| Drafts | **Clickable mockups first, then the real app.** Four drafts, one per feel: **Cockpit/MFD**, **Modern flight-planning app (EFB)**, **Mission-ops dashboard**, **Polished version of today**. The user picks one (or mixes), then it gets built and checked in the real app. |
| 3D ground | **Real terrain with hills**, the planner's street map draped on it. |
| Platforms | **Desktop first.** The phone gets playback in a later release. The phone build must still build and work (playback hidden there). |
| Playback unit | **One strike (a flight) at a time.** A single attack that isn't in a strike plays as a strike of one. |
| Timing | Playback has its own per-jet **delay sliders to try freely**. An **"Apply to plan"** button writes the spacing back to the strike's TOT offsets, and so to the cards. Nothing changes until it's pressed. |
| Cameras | Free orbit around the target, plus **chase a jet**, **top-down**, **from the target**, **side-on** (matching the card's side profile). |
| Extras | **Threat domes** (max range and altitude, jet highlights inside one), **frag cloud and frag-overlap warnings**, **labels on jets** (callsign, altitude, speed). No video recording in 0.4.0. |
| Look | Generic arrow per jet, a small generic bomb. No aircraft models. |
| Artwork (reopened by the user 2026-11-14) | A new **app icon** and a **loading splash**, in **squadron-patch / emblem style**. The **icon is a clean phoenix with no can** (it must read at small sizes). The **splash keeps the phoenix-and-White-Claw-can joke**. The splash shows **only while the app loads, then fades**: no fixed animation, no zoom. The user makes the images with their own generators (Qwen etc.) from the prompts below. The examples are the Sept 30 set in `Other Items/Artwork/`. |

## Track A: UI overhaul

### A1. Design drafts (mockups) — USER GATE
- Four self-contained HTML mockups, published as private artifacts so the
  user can show the squad. Each covers the same three screens: front page
  (load box + recent cards), mission summary, and the planning shell with one
  panel open.
- Use realistic sample content (a made-up mission, never real squad data or
  names), today's card colours left alone, and dark mode by default (the app
  is dark today).
- **Stop.** The user picks a direction (or a mix). Record the pick in
  `docs/V040_PLAN.md` and memory.
- **Picked 2026-11-14: the EFB draft** ("EFB looks the best"). Its fonts are
  Figtree and JetBrains Mono (both SIL OFL, so they can be bundled). The user
  asked to see the same look on the iPhone before the build; that phone
  mockup is the next thing to show.

### A2. Design foundation
- Tokens: move colours, spacing, radii and type into CSS variables and the
  Tailwind theme (`tailwind.config.js`, `src/index.css`). Replace the
  duplicated hex values.
- Fonts: bundle the chosen font locally. No Google Fonts, because the CSP
  blocks new hosts and the app must work offline.
- Shared primitives in `src/components/ui/`: Button, IconButton, Panel/Card,
  Chip, Tabs. Replace the duplicated `toolbarButton` / rail-button strings
  (`App.tsx:53`, `:639-688`). Reuse the existing `Modal.tsx` and give it the
  new look.

### A3. Front page + import + summary
- Extract the landing page from `App.tsx` into `src/components/landing/`.
- **Load box:**
  - It accepts a pasted link, a dropped file, or picked files.
  - It routes to the existing parsers: `fetch_fragorders_url`,
    `parse_fragorders_json`, and `src/lib/missionFile.ts` for saved missions.
  - `FragOrdersPreview.tsx`, the group picker, stays as the second step.
- **Recent cards:**
  - Built from `RecentMissions` (desktop) and `MyMissions` (web).
  - Thumbnail: waypoints and threats on a small canvas, reusing the
    basemap / tile code in `src/lib/kneeboardBasemap.ts`.
  - **Hidden threats stay hidden** (`src/lib/threatVisibility.ts`).
- **Mission summary:**
  - Shows theater, targets, visible threats (plus the "probable threats,
    location unknown" count), flights and loadouts, and attack readiness.
  - One button goes to the map.
  - It never edits imported waypoints.
- Create New Mission and Strike near me (web) stay as secondary actions.

### A4. App shell
- Restyle the header, left rail and slide-in panel frame (`App.tsx:542-711`)
  in the chosen design.
- The phone shell (`src/components/phone/PhoneShell.tsx`) picks up the tokens
  and primitives so it isn't left looking old. Its layout is unchanged.
- **Gate:** put it in front of the user in the real app with a real mission
  before merging.

## Track B: 3D strike playback (desktop)

### B1. The 4D track (pure maths, no UI) — the foundation
Add `src/lib/playback/`, which builds per-jet samples of (time, lat/lon,
altitude, speed, heading, phase), from a lead-in before the IP through the
profile to egress. Everything it needs exists:

- **Plan-view points:** `calculatePopupGeometry` / `Loft` / `Level` / `Dive`
  and `egressPath` in `src/lib/attackGeometry.ts`.
- **Altitudes along the track:** `buildSideProfile` (`src/lib/attackPicture.ts:445`).
  It is keyed by distance to target, so join it to the plan view by distance
  to target.
- **Speeds and timing:**
  - `PopupPlan` (`popupPlanning.ts`)
  - `LoftPlan.pullPath` / `pullTime_s` (`loftPlanning.ts`, the only real
    simulation)
  - the profile speed for level and dive
- **Bomb fall:**
  - Loft already has `bombFlight` / `bombPath` / `timeOfFlight_s`.
  - Pop-up, level and dive compute a vacuum fall internally
    (`bombRangeVacuum_ft`, `levelReleaseRange_nm`) but return only range.
    Expose the fall time and path. Don't invent new physics, and keep the
    ESTIMATED flags where they apply.
- **Strike timing:**
  - jet order and split: `strikeMembers` / `strikeFlank`
  - TOT offsets: `Attack.totOffset_s`
  - push times: `ipToImpact_s` / `strikeReadout` (`src/lib/strike.ts`)
  - frag clearance: `fragClearTime_s`
- **Lead-in:**
  - Jets appear on a short leg before the IP, along the inbound heading.
  - Each jet's delay shows as spacing in trail. Lead and #2 with zero delay
    start in loose formation, a small lateral offset.
- **Tests in `npm run geo-check`:**
  - Each jet's impact time in playback matches its strike TOT within a stated
    tolerance.
  - Release and impact positions match the 2D geometry.
  - Altitude at each side-profile point matches.
  - A frag overlap shows up where `strikeReadout` already warns.
  - Each new test is proven able to fail.

### B2. 3D scene + terrain spike — USER GATE
- **Stack:**
  - Recommended: three.js with `@react-three/fiber` and `@react-three/drei`
    (orbit controls, HTML labels). It draws local data and needs no CSP
    change for the scene itself.
  - Avoid MapLibre/Cesium: they need blob workers, wasm and new connect hosts
    under the strict CSP (`src-tauri/tauri.conf.json:25-60`).
- **Terrain:**
  - Public, keyless elevation tiles (e.g. AWS Terrain Tiles, Terrarium PNG)
    build a height mesh over a box of about 30-40 nm around the target.
  - OSM tiles are draped on it as the texture.
  - The terrain is shifted so its height at the target equals the plan's
    target elevation, so bombs land on the ground.
  - DCS terrain won't match real-world elevation exactly. Show a small note,
    and offer a flat-ground toggle.
- **CSP:** add the elevation host to `img-src` / `connect-src` in both `csp`
  and `devCsp`. Cache the tiles for offline use.
- **Bundle:** load the playback lazily as a separate chunk, so the web
  build's 3 MB PWA precache limit and the phone bundle aren't hurt. The
  entry button is hidden on phone.
- **Gate:** the user looks at one jet flying a pop-up over real terrain in
  the real app before B3 is built.
- **Gate passed 2026-11-14** (branch `v040-playback`, in the real Mac app,
  72 frames a second on a Retina screen). Nothing was raised against the
  ground, the sky or the frame rate. What the user asked for, which B3 now
  carries:
  - The opening view was far too zoomed out. Playback opens following the
    jet, and the home view frames the attack, not the whole run-in.
  - The run starts **10 seconds before the first action** (a later note the
    same day), not two minutes out at the start of the run-in. The design
    reads "first action" as the first planner marker after the IP; the
    whole run-in stays available from a switch.
  - Speeds are **1×, 2×, 4×, 8×, 16×** (this replaces the list under B3).
  - The planner's and the card's colour code on the 3D path (run-in blue,
    climb yellow, pull-down orange, attack red, egress green) and the same
    colours on the timeline.
  - The target drawn as the planner draws it.
  - Markers at the action points with the planner's own instructions, with a
    choice of off, shown as the jet reaches them, or always shown.
  - Threat envelopes switched on and off from a menu, by system.
    Early-warning radars are in that menu, off by default.
  - **Windows:** accepted untested for now; fix what turns up.
  - **Loft "push IP (est)" on the card** reads about 7 s late for an F-16
    loft and 16 s for an F-4E LABS loft against the flown profile. Parked for
    a later accuracy pass (see `ROADMAP.md`); no card text changes in 0.4.0.

### B3. Playback experience
- **Where it lives:** a "▶ Play strike" entry from the strike/attack editor
  and the attack list, opening a full-screen playback view.
- **Timeline:** play/pause, scrub, speed (1×, 2×, 4×, ½×), with event ticks
  for IP push, pull-up/roll-in, release and impact per jet.
- **Per-jet delay sliders:**
  - They start at the plan's offsets.
  - Changed values show live impact times and frag warnings.
  - **"Apply to plan"** writes `totOffset_s` back through the existing strike
    update path (`strikeDraft.ts` `respace` and the strike store action).
  - **"Reset"** returns them to the plan.
- **Cameras:** orbit (default), chase a jet (with a picker), top-down, from
  the target, and side-on (matching `SideProfileView` / `drawSideProfile`).
- **Threat domes:**
  - Max range × max altitude from `ThreatSystem`, styled to match the map's
    active, inactive and planning styles.
  - A jet's arrow and label highlight while it is inside a dome.
  - **Author-hidden threats never appear** (`threatVisibility.ts`, same rules
    and Admin reveal as the map).
- **Frag:** a brief cloud at impact sized from the existing frag data, and a
  warning chip when a later jet passes through an earlier jet's frag.
- **Labels:** callsign, altitude (MSL/AGL as the planner shows it) and speed
  beside each arrow, with a toggle.

## Track D: Icon and loading splash

**What happened last time (2026-09-30, memory `project-app-artwork-splash-icon`):**
- A full-scene splash (an anthropomorphic phoenix in a flight suit at a map
  table, with a slow push-in) passed in a preview page but looked "cheesy" in
  the real Mac app.
- The phoenix icon was rolled back the same evening.

**This time:**
- Emblem, not scene.
- No timed animation.
- The roughest working version goes in the real app before any polish.
- **Before building, update that memory:** the user has reopened artwork
  for 0.4.0, with the motif, style and behaviour decided here.

### D1. Prompts (the user generates; Fable may refine the wording)
These are written for Qwen-Image, which renders English text well. Make
4–8 of each and pick.

**Icon: 1:1, 1328×1328.**
> Flat vector emblem of a fierce phoenix in classic military squadron-insignia
> style, centered, diving toward the lower right with wings swept up in a sharp
> V and talons forward, head in profile. Bold simple shapes, a few large
> feather blades, thick dark outline, crisp edges. Limited palette: fiery
> orange #F26A1B, deep red #C8281E, gold #F5B82E, on a solid deep navy #1A1A2E
> background. The silhouette must stay recognisable at 32 pixels: no fine
> detail, at most one subtle gradient. The bird fills about 80% of the square,
> with a clear margin on every side and nothing cropped at the edges.
> No text, no letters, no border. Professional aviation app icon.

Negative: *text, letters, words, watermark, signature, drink can, bottle,
flag, photo, realistic, 3D render, thin lines, tiny details, multiple birds,
busy background, frame, blur, jpeg artifacts.*

- **Variant:** the same prompt with "on a plain flat white background", for a
  clean cut-out. That gives the transparent Windows/Linux icon. The navy one
  becomes the macOS rounded tile and the phone home-screen icon.
- **Alternative:** Qwen-Image-Edit on `Other Items/Artwork/Icon.png`: "remove
  the can, simplify into a flat two-tone vector emblem with thick outlines,
  navy background".

**Splash: wide, 1664×928 (16:9).** The window is 1400×900, so the art sits
in the centre with empty navy around it.
> A round embroidered military aviation squadron patch, seen straight on,
> centered, on a solid plain deep navy #1A1A2E background with wide empty
> space on both sides. Inside the patch: a fierce stylized phoenix with spread
> fiery orange, red and gold wings, diving, clutching a slim white hard-seltzer
> can with a blue wave logo that reads "WHITE CLAW" in its talons. Behind the
> phoenix, a faint top-down green tactical map with a red dashed attack arrow
> ending in a target ring. A curved banner across the top reads "PHOENIX
> WEAPONEER". Gold merrowed border, visible thread texture, rich but clean
> detail. The patch is a perfect circle, about 65% of the image height, fully
> inside the frame, with nothing breaking its border. Flat even lighting: no
> drop shadow, no glow, no vignette, no texture on the background.

Negative: *real military unit names, "Special Operations Command", national
flags, national insignia, people, humanoid bird, uniform, room, desk,
interior, clutter, extra text, misspelled text, watermark, low resolution.*

- **Optional:** a small motto banner at the bottom, in words the user
  chooses.
- Check every letter on the patch. Generators misspell.
- Why "a perfect circle, no shadow" (added 2026-11-14): a generator never
  hits the window's exact navy, so D2 cuts the patch out with a circular mask
  and sets it on the real `#1a1a2e`. A shadow or a broken border would leave
  a visible edge.

**Rules for any art that reaches the repo:**
- No real unit names or insignia. The Sept 30 splash carried a real
  command's name on its patches; never reuse it.
- No squad member names.
- App name only.
- The White Claw can stays as the user wants it. Don't re-raise it.

### D2. Build it — USER GATE in the real Mac app
- **Where the art goes:** the user drops picks in
  `Other Items/Artwork/v040/` (git-ignored).
- **Every copy that reaches the repo** is re-encoded, its metadata
  stripped, and then grepped for
  `c2pa|caBX|OpenAI|Qwen|tEXt|iTXt|zTXt|eXIf|iCCP|tIME|Exif|/Users/`.
- **Icon:**
  - Generate the full set from a 1024 px source with `npm run tauri icon`:
    a transparent phoenix for Windows/Linux and a navy rounded tile for the
    macOS `.icns`. Recent macOS puts a grey plate behind non-tile icons.
  - The phone icons are derived from `src-tauri/icons/`
    (`vite.config.web.ts:15-19`).
  - The commands are in `docs/ARTWORK.md` inside the reverted commit
    `b2785a1` (`git show b2785a1`). Restore that doc, updated.
- **Splash:**
  - A plain HTML overlay inline in `index.html`, so it paints on the first
    frame on top of the existing `#1a1a2e` background.
  - It is removed with a ~300 ms fade when `App.tsx`'s `loading` state ends
    (`App.tsx:620`, replacing "Loading database...").
  - No minimum display time: if loading takes 0.3 s, the splash shows
    0.3 s.
  - The image is centered with `object-fit: contain`, so the navy blends
    into the window colour. Compressed WebP/PNG, under ~300 KB.
  - **Keep both white-flash fixes:** the window `backgroundColor` in
    `tauri.conf.json`, and the inline `<html>` background in `index.html`.
- **Phone:** the web build shares `index.html`, so the splash shows there
  too (the PWA's own splash comes from the manifest icon). Check it at
  375 px.
- **Gate:** the user opens the real Mac app with the roughest working
  version before any polish or commit. If it disappoints, offer the
  rollback up front, alongside a fix.

## Track C: Release 0.4.0
- Run the privacy scan (memory `reference-privacy-scan-scripts`), then the
  full RELEASE CHECKLIST in `CLAUDE.md`.
- Update ROADMAP.md: shipped items in, "phone playback" and "video export"
  added as open.

## How Fable should run it

- **Snapshot first:** create a `pre-0.4.0` rollback tag on `main` before any
  merge (revamp principle: snapshot before big changes).
- **Order and parallelism:**
  - A1 and B1 run at the same time, since they're independent.
  - A2 → A3 → A4 run in sequence.
  - B2 → B3 run in sequence.
  - Track A and Track B touch different files except the playback entry
    button, so they can run in separate worktrees and branches.
  - Merge to `main` only after each user gate.
- **Model use** (the user's call for this release, replacing "Opus
  orchestrates, Sonnet builds"):
  - Fable directs and owns the design judgement.
  - **Opus** for B1 maths and the B2 3D/terrain architecture.
  - **Sonnet** for UI building (A2-A4, B3).
  - **Haiku** for searches, test scaffolding and mechanical edits.
  - `CLAUDE_CODE_SUBAGENT_MODEL` in `.claude/settings.local.json` makes
    Sonnet the default, so pass `model` per agent explicitly.
- **Standing rules that apply:**
  - Public repo privacy (no names, UTC commits, nothing from `Other Items/`).
  - Edit/Write tools only, never `cd` into a subfolder; `git push` / `gh` /
    `cargo` run unsandboxed.
  - Review every sub-agent diff and prove each new test can fail.
  - Look-and-feel goes in front of the user in the real app before it ships.
  - Script checks instead of asking the user to eyeball them.
  - Keep every knob; warn, don't block.
  - Imported waypoints are fixed.
  - Kneeboard output is unchanged.
- Track D runs alongside the others: D1 needs only the user. D2 touches
  `index.html`, the icons and `App.tsx`'s loading branch, so land it before
  or after A3, not at the same time as A3.
- **The user's stops:**
  - A1 design pick
  - generating the D1 images
  - B2 terrain look
  - D2 splash and icon in the real Mac app
  - A4/B3 final look in the real app
  - the release publish

## Verification
- `npm run geo-check` covers the B1 track, timing and frag tests. Also run
  `cargo test` for core and desktop, `npm run build`, and `npm run build:web`
  (the phone build stays green with playback excluded or lazy).
- **Track A, in the real app:** desktop `npm run tauri dev` and the browser
  preview, with a captured FragOrders link (private fixture) and a saved
  mission. Check:
  - Each load path through the box.
  - The summary counts match the panels.
  - Hidden threats are absent from the thumbnail and summary.
  - The phone layout still works at 375 px.
- **Track B:**
  - Play a 2- and 4-ship pop-up strike and a loft, and check that the
    impact-time readout matches the strike readout.
  - Change a delay and check the frag warning appears.
  - "Apply to plan" changes the cards' TOT. Reset restores it.
  - With network off, cached terrain works, and so does the flat fallback.
- **Track D:**
  - The icon is recognisable at 32, 64 and 128 px, and on the macOS Dock with
    no grey plate.
  - The splash shows only while loading, and there's no white flash on
    launch.
  - The metadata grep on every committed image comes back clean.
  - Check it in a release build (`npm run tauri build`), not just dev.
- **Kneeboard regression:** render a card before and after, and compare the
  pixels. They must be identical.
