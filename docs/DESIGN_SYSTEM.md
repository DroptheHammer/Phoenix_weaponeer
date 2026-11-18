# Design system

How the app's look is built: the named values, the fonts, the base rules, the
shared building blocks, the dialog, and what each is held to. Written for
whoever builds the front page and the app shell on top of it. A rule here has
a check in `npm run geo-check` or in a build step, named beside it; the two
that have none yet are listed as open at the end of "Dialogs".

## Where things live

| What | File |
|---|---|
| Every colour, size, radius, shadow, duration and font stack | `src/styles/tokens.css` |
| The bundled fonts (`@font-face`) | `src/styles/fonts.css` |
| Base rules: dark scheme, page font, digits, scrollbars, focus ring, the map and playback fences | `src/index.css` |
| Tailwind's theme, which reads the tokens | `tailwind.config.js` |
| The building blocks | `src/components/ui/*.tsx` (one file each) |
| The dialog's keyboard rules | `src/components/ui/dialogKeys.ts`, used by `src/components/common/Modal.tsx` |
| The app shell: the header, the File menu, the planner's rail, side panel, zoom, credit and Legend, the phone's bars and sheet | `src/components/shell/`, `src/components/map/MapZoom.tsx`, `MapCredit.tsx`, `MapLegend.tsx`, `src/components/phone/` (see "The app shell") |
| A page that shows every block in every state | `ui-gallery.html` + `src/components/ui/dev/` (dev server only) |
| Checks on the sources | `scripts/design-check.tsx`, `scripts/ui-check.tsx`, `scripts/shell-check.tsx` (all run first by `npm run geo-check`) |
| Checks on the built app | `scripts/style-check.mjs` (CSS, fonts, offline cache), `scripts/bundle-check.mjs` (start-up JavaScript) |
| Ceilings | `scripts/style-budget.json`, `scripts/bundle-budget.json` |
| Browser runs | `scripts/design-shots.cjs`, `scripts/shell-shots.cjs`, `scripts/web-smoke-dialogs.cjs`, `scripts/playback-shots.cjs`, `scripts/web-smoke*.cjs` |

## Tokens

All values are CSS variables in `tokens.css`, under short families:
`--c-*` colours, `--d-*` the planner's data colours, `--fs-*` type sizes,
`--sp-*` spacing, `--r-*` radii, `--e-*` shadows, `--t-*` motion, `--font-*`
stacks, and named sizes (`--tap`, `--tag-h`, `--bar`, ...). A rule written
against them reads `var(--c-navy)` wherever it is.

- **Opaque colours come in two forms.** `--rgb-navy: 22 33 62` (three channels)
  and `--c-navy: rgb(var(--rgb-navy))`. Tailwind needs the channels to apply an
  opacity (`bg-surface-navy/80`). Translucent tints (`--c-fill-1`, `--c-line`,
  `--c-scrim`) are whole values. The hex in the comment is for people; the
  checks read the channels.
- **The five base colours never change**: window `#1a1a2e`, deep `#10101f`,
  navy `#16213e`, blue `#0f3460`, accent `#e94560` (DS1).
- **Ink on the accent is dark** (`--c-on-accent`, `#10101f`): white on the
  accent is only 3.8:1.
- **The one added accent is sky** (`--c-sky`): links, keyboard focus,
  information. **Warn** is the planner's own yellow and always comes with an
  icon and a word.
- **The quantity colour** (`--c-qty`, mint) marks the numbers of a loadout list
  and nothing else, so a pilot reads "how many" apart from "what". DS22 allows
  it only in the files listed in `QTY_USERS` in `design-check.tsx`. The list has
  one entry, the jet card (`src/components/landing/JetCard.tsx`), which every
  screen that lists a jet's stores shares. A screen that draws a quantity column
  of its own adds its file there, but one shared component is better than
  several entries.
- **Data colours** (`--d-target`, `--d-sam`, ...) are copies of what the map
  draws, for a dot or a key beside the map. DS6 proves each equals what
  `src/components/map/mapMarkers.ts` draws (the planner map's markers, rings
  and route line, kept in one file so any other map can draw the same; X4 in
  `scripts/landing-ui-check.tsx` pins that file's code). They never restyle the
  map: change the map, then the copy.
- **Spacing is Tailwind's own 4 px scale**; `--sp-*` mirror it (DS4), so a
  utility and a variable always agree.
- **Phone values are tokens, not components.** One block in `tokens.css`, right
  after the main block (the measures a screen adds follow it, "Adding a token"
  below), under the query `(max-width: 767px), (max-height: 500px)`
  (the same text as `PHONE_QUERY` in `src/hooks/useIsPhone.ts` and the phone
  rules in `index.css`; DS20 keeps the three equal), sets `--tap-sm` 44,
  `--fs-compact` 15, `--bar` 44, `--check` 22, `--field` 56, `--menu-w` 264,
  `--legend-w` 256. A primitive never has a phone switch: its sizes follow the
  tokens.
- **Contrast**: every text and graphic pair the blocks draw meets WCAG AA
  (text 4.5, graphics 3) in normal, protan and deutan vision, except the few
  pinned dips listed in `design-check.tsx` (DS5). A new pair goes in that list.

### Adding a token

A screen's own measures (a card's row height, a column width) are appended at
the end of `tokens.css` in the change that builds the screen, with a comment
saying what they size. A value that differs on a phone also goes in the phone
block. Never repeat a value in a component: name it once and read it. A new
colour needs a contrast pair in DS5 and a Tailwind key in `tailwind.config.js`.

## Tailwind

Everything in the theme of `tailwind.config.js` is `theme.extend`. The map's markers and the
existing forms use Tailwind's own `red`, `yellow`, `blue`, `orange`, `slate`
and `gray`, so a new key must never replace a Tailwind key or palette (DS3
proves the defaults still build). The design system's keys are names Tailwind
does not have: `surface-*`, `ink`, `ink-2`, `ink-3`, `accent`, `info`, `warn`,
`qty`, `control` (the outline colour), `line`, `tint-1/2/3`, `shade`, `scrim`,
`track`, `data-*`; type `text-ui-caption` ... `text-ui-display`; radii
`rounded-ui-xs` ... `rounded-ui-xl`, `rounded-pill`; shadows `shadow-ui-1`,
`shadow-ui-2`, `shadow-ui-up`, `shadow-halo`; sizes `tap`, `tap-sm`, `btn-sm`,
`btn-lg`, `tag`, `bar-btn`, `chip`, `rail-btn`, `tab`, `rail`, `badge`, and the
shell's `bar` (the header, `--bar`), `dock` (the planner's left column,
`--dock-w`), `legend` (`--legend-w`), `menu` (`--menu-w`) and `inset`
(`--inset`, the gap round the planner's floating boxes); two line heights,
`leading-where-title` and `leading-where-sub` (the header's two lines); and the
`animate-sheet-in` animation (the keyframes `sheet-in`, the side panel sliding
in over `--t-panel`). The planner's side-panel width, `--panel-w`, has no
Tailwind key: the grid reads it as `var(--panel-w)`.

The app's old names (`dcs-dark`, `dcs-darker`, `dcs-navy`, `dcs-blue`,
`dcs-accent`) still build, with opacity, from the same tokens. Forms that use
Tailwind's greys keep working; moving them to the tokens is done screen by
screen, never all at once.

**Window-height rules** are two variants, `tall:` (`min-height: 860px`) and
`short:` (`max-height: 819px`), added by a plugin at the end of
`tailwind.config.js`. Tailwind's own `max-[819px]:` is a width query, so a
height rule cannot be written with it. They are variants and never entries in
`theme.screens`: one screen given as an object (`{ raw: '...' }`) makes
Tailwind 3.4 drop every `max-*` and `min-*` variant in the app, the editors'
`max-md:` included. X9 in `landing-ui-check.tsx` proves both are height
queries and the width variants still build, using `scripts/tailwind-probe.mjs`,
which prints a rule inside an at-rule with it first
(`@media (max-height: 819px) margin-top:0.25rem`).

## Fonts

- **Figtree** for text and **JetBrains Mono** for `font-mono`, from two npm
  packages pinned to exact versions (`@fontsource-variable/figtree`,
  `@fontsource-variable/jetbrains-mono`). `fonts.css` names three files only
  (Figtree Latin and Latin Extended, JetBrains Mono Latin: 70,840 B), so the
  build carries no other subset. No font file is in the repo.
- The family names are the packages' own, `Figtree Variable` and
  `JetBrains Mono Variable`; `--font-sans` and `--font-mono` must name them
  exactly or the stack silently falls back (DS11).
- Nothing is fetched from a font host (DS13, style-check). The web build's
  offline cache holds the three files (`woff2` in the cache's glob), so a phone
  keeps the fonts offline. The licence notices travel in
  `public/font-licenses.txt`.
- Weights: 400 body, 500 notes, 600 buttons and labels, 700 primary actions and
  headings. No italic face: the browser slants the few italic notes.
- `font-mono` has ligatures off, so `->` in a pasted JSON stays two characters.
- Digits are equal width everywhere (`tabular-nums` on the page), except on the
  map and in the playback (below).

## Base rules (`index.css`)

- **Dark only** (`color-scheme: dark`): native scrollbars, drop-downs and
  checkboxes are dark too. There is no light theme.
- **Thin scrollbars** in a quiet colour where the browser allows it.
- **One keyboard focus ring**: 2 px sky, 2 px offset, at zero specificity
  (`:where(...)`), so a component's own focus style still wins. Leaflet's
  controls keep the browser's ring. No primitive removes the outline (DS16).
- **No blanket reduced-motion rule.** A universal `transition-duration` rule
  makes Leaflet measure its box mid-transition and frame the route about 32 px
  off. Each primitive carries `motion-reduce:transition-none` instead (DS19).

## The fences: what the design system must not change

1. **The cards, the attack picture and the jet colours** (`attackPicture.ts`,
   `cardTheme.ts`, `cardContrast.ts`, `renderKneeboardCanvas.ts`,
   `labelLayout.ts`, `jetColors.ts`, `JetStrip.tsx`) and **the playback's colour
   code** (its scene, lane, callout and 3D layer files) never read a token or a
   bundled font (DS7, which also fails if one of those files is renamed out of
   its list). The cards are also pinned byte for byte by geo-check's draw-log
   pins and, in a browser, by `design-shots.cjs` (HS7).
2. **The planner's data colours** are copies, pinned to the map (DS6).
3. **Tailwind's default palette** is untouched (DS3).
4. **`src/components/ui/` writes no colour**: no hex, no colour function, no
   Tailwind palette class (DS8). The same holds for `fonts.css` and
   `index.css`, except the map tooltip block.
5. **The map keeps its font.** The wrappers of both maps (`MapView`,
   `AttackPreviewMap`) carry `font-map`: the old stack
   (`Inter, system-ui, Avenir, Helvetica, Arial, sans-serif`) and ordinary
   digits. The attack labels are placed by measuring Arial Narrow, so a new
   font there would move them (DS12).
6. **The map tooltip's colours** are written out in `index.css` and pinned to
   `LABEL_STYLE` (DS7).
7. **A base colour is written as hex only where nothing can read a variable**:
   `index.html`, `src-tauri/tauri.conf.json`, `playback-harness.html`, the
   playback's `sceneStyle.ts` and `laneStyle.ts`, and the card files. The web
   build's theme colours are derived from `tokens.css` (DS9).
8. **The 3D playback keeps its look** until it gets its own. Its overlay's root
   carries `legacy-ui`, which `index.css` maps to the old sans stack, the old
   monospace (`Consolas, Monaco, monospace`, for its `font-mono` text and its
   error panel's `<pre>`; the timeline's chips are sized for it), ordinary
   digits, light native controls and the browser's own scrollbars. Keyboard
   focus still gets the sky ring. DS12 checks each promise of the fence by
   name. Lifting it is a decision of its own, proven with
   `design-shots.cjs --parts playback` and `playback-shots.cjs`.

## The building blocks (`src/components/ui/`)

Imported by path, one file each. **There is no barrel** (`index.ts`): add a
file beside the others, never a shared export list.

The contract every block keeps:

- **Class strings are written out whole.** Tailwind reads the source as text,
  so `` `bg-${tone}` `` would never be built (DS10).
- **One utility per property.** A variant, a size and a tone each own their
  properties, so two classes of one family never meet on one element (DS21).
  `cx` only joins class names; it does not resolve conflicts.
- **`className` is for layout only**: width, margin, position, flex and grid
  placement. Never colour, padding or radius.
- `Button`, `IconButton` and `Panel` forward a ref (`Card` does not, even as a
  button or a link). Buttons default to `type="button"` and put `aria-*` and
  `title` on the element itself. A control with no text cannot be built
  without a name (`IconButton`'s `label` is required).
- **States**: a disabled `primary` button turns grey (`tint-2` fill, `ink-3`
  text) so it never looks half-ready; every other disabled control fades to
  50%. Disabled shows the not-allowed cursor and no hover. Busy is disabled,
  `aria-busy` and the progress cursor; the caller changes the label.
- **No red, no danger variant.** Delete is `Button variant="outline"` with the
  trash icon and the word. ESTIMATED is `Chip tone="estimated"` (an outline and
  a tilde); a caution is `Chip tone="warn"` (amber with the triangle). The two
  never share a shape or a colour.
- **Colour is never the only cue**: a word or an icon goes with it.

What there is:

| Block | Props |
|---|---|
| `Button` | `variant`: `primary` (the one action a screen leads with), `tonal` (the default), `emphasis`, `quiet`, `outline`, `text` (the small sky row button). `size`: `md` 44 px, `lg` 52, `compact` 44 with smaller text, `sm` 36 pill, `bar` 36 for the 48 px header. `icon` (leading), `iconEnd` (trailing, e.g. `arrow-right`), `busy`, `pressed` (sets `aria-pressed`) |
| `IconButton` | `icon`, `label` (required: its name and tooltip), `size` `md` 44 or `sm` 32 (44 on a phone), `pressed` |
| `Icon` | 34 stroke icons on a 24 grid (`IconName`); `size` `xs` 14 (inside a tag), `sm` 16, `md` 20, `lg` 24, `rail` 22 |
| `Panel` | `tone`: `group` (a list on a page), `float` (what floats over the map: the one opaque material), `well` (a recessed field area), `dialog`. `nested` (a group inside a float or a dialog), `divided`, `as` |
| `GroupLabel` | the small uppercase heading over a group; `note` at its right end, which may hold an icon |
| `Card` | `as` `div`, `article`, `button` or `a` (a whole-card control gets the hover); `interactive` |
| `Chip` | `tone`: `neutral`, `quiet`, `ok` (done: a sky check), `none` (not done: give it `dash-ring` or `minus`), `detect`, `warn`, `estimated`. `size` `sm` 22 px or `lg` 28. `icon` |
| `Dot` | a 10 px dot in a planner data colour (`target`, `ip`, `sam`, ...) with the map's white rim; decorative, always with a word |
| `Tabs` | `variant`: `rail`, `bar` (the phone's bottom bar, clear of the home bar), `pills`, `segmented`. Buttons with `aria-pressed` in a labelled group, not a tablist. `toggle` (pressing the lit item closes it; default on for rail and bar). `nextSelection` is the pure rule |
| `DialogFrame` | what a dialog looks like, markup only (below) |

## Dialogs

Every dialog goes through `Modal` (`src/components/common/Modal.tsx`), which
draws `DialogFrame` in a portal on `document.body`. On a phone every dialog is
a full-screen page clear of the notch and the home bar.

**The look** (`DialogFrame`): a dark backdrop, a navy panel with 24 px corners,
an edge and a shadow; a header that stays put, with the title (26 px, 20 in
`fill` editors), an optional `eyebrow` above it and `description` under it, and
an icon close button named `Close <title>` (`Close` on a phone); a body that
scrolls; an optional `footer` strip (Back on the left, the main action on the
right). `widthClass` and `heightClass` size it; `fill` makes it nearly full
screen with a body that does not scroll; `scrollBody={false}` keeps a
fixed-height body still so two columns inside it can scroll apart.

**The contract other code relies on**: the element with `role="dialog"` carries
`aria-label={title}`, `aria-modal="true"` and `tabIndex={-1}`, and sits at
`z-[2000]`. `App.tsx` blocks Undo while any `[role="dialog"]` exists, and the 3D
playback decides who is on top by the last one in the page (DS18).

**The keyboard**, in every `Modal`, desktop and phone:

1. **Escape closes only the dialog on top.** The newest dialog is the last
   `[role="dialog"]` in the document (portals append to the end of `<body>`);
   a `Modal` is on top when that element is its own dialog or sits inside it,
   so a legend or sheet marked as a dialog inside a dialog does not take the
   keyboard from the dialog round it.
2. **Focus moves into the dialog when it opens**: the dialog element is focused
   (without scrolling), unless a child with `autoFocus` already took focus. The
   outline is left alone: a keyboard user sees the ring round the dialog, a
   mouse user sees none.
3. **Tab stays inside the dialog on top**: Tab on the last control goes to the
   first, Shift+Tab on the first to the last; from the dialog element or from
   outside, Tab goes to the first and Shift+Tab to the last; in between, the
   browser moves focus itself. A dialog with no control keeps focus on itself.
   "Control" means what the browser would Tab to: links, buttons, inputs,
   selects, textareas and `[tabindex]` not `-1`, not disabled, and drawn.
4. **Focus goes back when it closes**, to what had focus when it opened, if
   that is still in the page.

How it is built: `Modal` listens for keys on `window`, in the bubble phase, and
reads the latest `onClose` through a ref so the listener is attached once. The
bubble phase matters: the 3D playback takes Escape in the capture phase and
stops it there, which keeps the attack editor open under it. The rules are two
pure helpers in `dialogKeys.ts`, with no DOM globals of their own, so the
checks run them in Node on stand-in objects:

- `isTopDialog(root, doc)`: rule 1 (DS23).
- `tabStop(stops, active, back, root)`: rule 3; returns the element Tab must
  go to, or `undefined` to leave the browser's own move (DS24).

The playback keeps its own Tab rule and on-top test: it does more with the
same keys (its Escape first closes an open menu, then lets go of a box a time
is typed in, and only then closes), and its code loads only when it opens.

Not built, on purpose: closing a dialog by pressing the backdrop (the attack
editor has no discard prompt, so a stray press would lose work), and marking
the page behind a dialog as inert.

The on-top test is held twice: DS23 tests the helper, and
`scripts/web-smoke-chooser.cjs` proves it in a browser on the one path the web
build has that opens a `Modal` over a dialog (the flight chooser under
"Unsaved changes": one Escape closes only the top one). That run fails with the
on-top test taken out of `Modal`'s Escape handler, on the desktop layout. The
chooser asks for nothing of its own there: on a phone it is a sheet, not a
`Modal`, so it switches its own Escape off while the other dialog is up.

Open, small, for the next change that touches `Modal`:

- **Escape typed while an input method is composing text also closes the
  dialog.** `Modal`'s key handler does not skip `event.isComposing` (the
  playback's does), so Escape that cancels composed text in a dialog field
  closes the dialog too. It is one line, best added with a browser run that can
  show it.
- (By design, not open: the first Tab in a dialog lands on the header's close
  button, because it comes first in page order.)

## The app shell

The frame every screen sits in: one header, the planner's rail, side panel and
map controls, the Legend, and the phone's bars and sheet. The blocks live in
`src/components/shell/` (`AppBar`, `FileMenu`, `railItems`, `PlannerShell`,
`PanelSheet`), `src/components/map/` (`MapZoom`, `MapCredit`, `MapLegend`) and
`src/components/phone/` (`PhoneShell`, `BottomSheet`). They hold no mission
logic: `App.tsx` decides what goes in each slot.

**The header** (`AppBar`). One bar, 48 px (`h-bar`), edge to edge, the same on
the front page, the Flight overview and the planner. On a phone `PhoneShell`
draws its own 45 px bar instead (below). Left: the app's mark and name, then,
after a divider, `lead` (where you are: a `BackLink`, then a `HeaderWhere`, a
title line over a smaller line; or a file message). Right: `primary`, the one
filled button of the screen (Save in the planner, "Open the map" on the
overview; the front page has none), then File, Settings and Quit as quiet
buttons. Quit is the desktop app's only. Every button keeps its name and
tooltip when its word goes, and the words go in a set order as the window
narrows: the filled button's under 520 px wide, the back link's under 900, the
place in the small line under 960, the app's name under 1100, the quiet
buttons' under 1280. The words for work not yet saved ("Unsaved changes", and
"Not exported" in the browser, where every save is a download) never go: the
red dot beside the title is never the only sign. A file message ("Saved: …",
"Error: …", an error in amber) replaces the small line until the next action.

**File** (`FileMenu`) opens a list of two-line rows from its own button. Each
screen has its own list. The planner's: Flight overview, Save As (desktop
only), Open, Import, Close; its filled button is Save. The Flight overview's,
and the front page's while a mission is open: Save ("Export .json" in the
browser), Save As (desktop only), Open, Import, Close. The front page with no
mission: Open, Import. Opening puts the keyboard on the first row; arrow keys,
Home and End move; Escape shuts it from wherever the keyboard is and gives it
back to File; Tab shuts it; a press anywhere outside shuts it. A row shuts the
menu before it runs, so a dialog it opens never meets an open menu. It is not
shared with the Flight overview's waypoint list: that list picks one
waypoint, this one runs commands, and each is built and checked on its own,
with the same three behaviours.

**The planner's frame** (`PlannerShell`). The map is the page: it fills the
window under the header, edge to edge, and everything else floats over it in
one grid inset 12 px (`--inset`) from the edges. The grid lets clicks through;
only the floating boxes take them. Three columns:

- the left column, `--dock-w` (96 px): the rail at the top and the Legend at
  the bottom;
- the middle: the unverified-map or real-world notice at the top centre, the
  zoom at the top right, the map credit at the bottom right;
- the side panel, `--panel-w` (34% of the width, 380 to 520 px), only while a
  panel is open. The zoom therefore moves left by the panel's width when a
  panel opens. Under 900 px wide (the web build on a tablet held upright) the
  panel covers the other two columns, inside the same inset, rather than
  leaving a sliver of map.

The rail is one `Tabs variant="rail"`: an icon over a word, the count as a
badge, the open panel's button in the accent, and a line under Attacks ("1
hidden") while the Legend hides a jet. Its buttons are named by `stackedName`
("Waypoints (5)", "Attacks (2 · 1 hidden)"), so a screen reader hears the word
first. It counts only the threats the planner may see. The side panel
(`PanelSheet`) has a fixed head (the panel's name and "Close panel") and a
body that scrolls. It slides in once, when it opens from closed (180 ms, and
only where motion is allowed); switching panels keeps the same element; a map
pick hides it without unmounting it, so an open attack editor survives; "Close
panel" gives the keyboard back to the rail button that opened it. The map
draws no Leaflet zoom or credit of its own: `MapZoom` (two 44 px buttons) and
`MapCredit` ("© OpenStreetMap contributors", plain text, because the tiles'
licence asks for it) are the app's, on the desktop and the phone alike.

**The Legend** (`MapLegend`). Desktop: shut, one small "Legend" button at the
map's bottom-left corner, under the rail; the app starts with it shut. Open,
one box from that corner upward, `--legend-w` (224 px) wide: the key, then
Attacks (only while a jet has an attack), Threats and Route, as tall as its
content or the room under the rail, whichever is less, and it scrolls inside.
It never meets the rail, the zoom, the credit or the panel. Open or shut is
kept for the session (`uiStore.legendOpen`) through New, Open, Import, Close
and Show all, and is never saved with a mission. Escape inside it shuts it and
puts the keyboard on its button; a click elsewhere does not. A shut Legend with
a layer switched off reads "Legend · filtered". Its counts are the visible
mission's. The phone has no Legend box: a "Layers" button 12 px from the map's
top and right opens the same contents in a panel 8 px under it, which stops at
least 20 px above the map's bottom and scrolls, and shows a dot ("some layers
hidden") while a filter is on.

**The phone** (`PhoneShell`, `BottomSheet`). A top bar of 45 px with the title
over a smaller second line (on the map the place, then "Not exported" while
there is work not yet downloaded; on the Flight overview "Not exported" comes
first, because a phone cuts that line at its right end), a back arrow where a
screen has one, the dot named "unsaved changes", and a Menu button whose list
has an icon on every row. A bar of five icon tabs at the foot, 69 px and clear
of the home bar, the open one in the accent, the count a badge. A tab opens
its panel as a bottom sheet over the map, half height or full: the 96 x 44
handle switches them by touch, Enter or Space, and the close button is 44 px.
The zoom is at the bottom left and the credit at the bottom right.

**The stack.** What is drawn over what, by `z-index`. A new floating box takes
its layer from this table; it does not invent one.

| Layer | z | What |
|---|---|---|
| The map and what is drawn on it | 0 to 900 | the map, its markers and popups, the attack labels (900) |
| The planner's floating boxes | 1000 | rail, Legend, zoom, credit, notice and side panel (the one grid) |
| The header | 1100 | the File menu hangs from it, so it is over the map and over an open panel |
| The attack list's "Copy to" menu | 1300 | drawn straight into the page rather than into the panel, so it is over the header and the panel it opens from, and under dialogs |
| Dialogs | 2000 | every `Modal`, the flight chooser, the 3D playback: they cover the header |
| The full-screen kneeboard card | 2100 | over a dialog |
| The update banner | 3000 | over everything |

On a phone the notice banner on the map is 1050, the bottom sheet 1100, the
message strip under the top bar 1150, the top bar and the tab bar 1200, and the
menu 1300.

**Held by:** `scripts/shell-check.tsx` (SH1 to SH38, in `npm run geo-check`:
the names, the header and the File menu's lists and keys, the rail, the
panel's frame and slide, the zoom and credit, the Legend's looks and its
filters, the phone's bars, and that no shell file words or counts a threat the
mission author hid), and `scripts/shell-shots.cjs`, the browser run below.
Not covered: the planner with an attack (the synthetic mission has none, so
the Legend's Attacks set and the rail's "1 hidden" are in no picture); the
desktop app's own webview and Windows; a phone in the hand. The Quit button
exists only in the desktop app, so the browser run never sees it.

## Checks and how to run them

`npm run geo-check` runs `design-check.tsx`, `ui-check.tsx` and
`shell-check.tsx` first. Each check has a `// Red when:` line (the one change
that turns it red) and a `// Seen:` line (the failure it printed) beside it. A
new check is seen failing once before it is kept.

| Check | Holds |
|---|---|
| DS1, DS2 | the base colours; the Tailwind config names only tokens that exist and writes no colour |
| DS3, DS4 | Tailwind's defaults intact, the old names and the new names build; spacing tokens equal the scale |
| DS5 | contrast of every pair, three kinds of vision |
| DS6, DS7, DS9 | the data colours, the protected files, the base hex written once |
| DS8, DS10, DS16, DS21 | no colour in `ui/`, whole class names, no removed outline, one utility per property |
| DS11, DS12, DS13 | the fonts; the map and playback fences; no font host |
| DS14, DS15, DS18 | the blocks' markup and states; `nextSelection`; the dialog's contract, heights and `tabindex` |
| DS19, DS20, DS22 | no blanket motion rule; the phone block; the quantity colour |
| DS23, DS24 | the dialog on top; Tab staying inside |
| SH1 to SH38 (`shell-check.tsx`) | the app shell: the rail's names, the header and the File menu, the rail's counts, the side panel's frame and slide, the zoom and credit, the Legend, the phone's bars and sheet (see "The app shell") |
| X4, X9 (`landing-ui-check.tsx`) | the map's marker code is pinned; `tall:` and `short:` are height queries and the width variants still build |
| UI1, X3, X8 (`landing-ui-check.tsx`) | the jet card's quantity colour, amber unknown stores and ESTIMATED tag; no raw colour in `src/components/landing/` or in the flight chooser; no comment there points at a git-ignored file, and no width query stands in for a height rule |
| UI3, UI3b, X2, X2b (`landing-ui-check.tsx`) | the flight chooser names only threats the planner may see and reads as for no threats when all are hidden, the link's notice included; no front-page, chooser, overview or Threats-panel file reads or words a hidden-threat count; the Threats panel, drawn with hidden threats in the mission, lists and counts only what the planner may see, and each Settings switch shows its own kind |
| UI2, UI4, UI13 (`landing-ui-check.tsx`) | the Flight overview's threat block keeps four row slots and dashes its empty classes; a site that is not active says so in the card's word; the overview's fallback words say to reload or open the map |
| `bundle-check.mjs` (`LAZY_MARKERS`) | the Flight overview loads when it opens, on both builds, never at start-up |

**The built app**: `npm run build` and `npm run build:web` end with
`bundle-check.mjs` and `style-check.mjs`. Style-check fails on a font host, a
remote file, a font that is not one of the three, a missing licence file, a
CSP without `'self'` for fonts, fonts missing from the offline cache, and the
two ceilings below.

**Browser runs.** Each needs a local port and a browser, so it runs outside a
sandbox that forbids either. Each takes `PLAYWRIGHT_MODULE` (a playwright or
playwright-core folder) and `CHROME_PATH` (a Chromium binary), or falls back to
`require('playwright')` and its own browser. One at a time.

- **Dialogs and the keyboard**, at 1280 x 800 on the web build:
  ```
  npm run build:web && npx vite preview --config vite.config.web.ts --port 4173 &
  node scripts/web-smoke-dialogs.cjs http://localhost:4173/ <screenshotDir>
  ```
  It opens Settings from the keyboard, Tabs and Shift+Tabs 30 times each,
  closes it with Escape and checks focus came back to the Settings button,
  then the same on the attack editor. A change that moves a control it presses
  (the header's Settings button, the Attacks panel's "+ Add Attack") changes
  the script in the same commit and runs it.
- **The flight chooser under "Unsaved changes"**, at 1280 x 800 and at 390 x 844
  on the web build (the first run is desktop, the second a phone):
  ```
  node scripts/web-smoke-chooser.cjs http://localhost:4173/ <screenshotDir> [width height]
  ```
  It makes the browser's mission store refuse writes, imports a flight, loads
  the mission again and presses Import: "Unsaved changes" must open over the
  chooser. Cancel comes back to the chooser with the flight still chosen, one
  Escape closes only "Unsaved changes", the next closes the chooser, and Discard
  imports.
- **The shell**, at four desktop window sizes and two phone sizes, on the web
  build (it serves the build itself and loads the synthetic mission through the
  front page, so no real mission is needed):
  ```
  npm run build:web && node scripts/shell-shots.cjs dist-web <screenshotDir>
  ```
  It measures the header on the front page, the Flight overview and the planner
  (1400 x 900, 1024 x 768, and the web build's smallest desktop layouts,
  768 x 1024 and 768 x 501); the rail's names and its lit button; that Leaflet's
  own zoom and credit are gone; the Legend shut and open with the side panel
  shut and open (it sits at the map's bottom-left corner and meets nothing; under
  900 px wide an open panel covers the map); Escape in the Legend and "Legend ·
  filtered"; File's rows and keys on every screen; closing the panel putting the
  keyboard back on its rail button; that the File menu hangs over an open
  panel and a dialog covers the header (the stack above); and, on a phone
  (390 x 844, and 844 x 390 held sideways), the bars, Layers, the sheet and its
  handle, and the menu. It writes a picture of every state and prints one PASS
  or FAIL line per check (98 PASS when this was written). Tiles are blocked, so
  the map is plain and repeatable.
- **Before and after**, the whole proof of a change to the look:
  ```
  node scripts/design-shots.cjs --before <tree> --out <dir>
  ```
  where `<tree>` is the commit compared against, unpacked outside the repo
  with its web build (the script's head says how). It compares the app at
  1400 x 900 and 390 x 844 (the map untouched, the fonts local, no overflow),
  the kneeboard cards byte for byte, the gallery's sizes, and the playback's
  overlay pixel for pixel. `--parts app,cards,gallery,playback` runs a few.
- **The playback's own checks**: `node scripts/playback-shots.cjs <dir>`
  (12 to 25 minutes on a software renderer).
- **The gallery**, to look at: `npm run dev`, then `/ui-gallery.html`, at
  1400 px wide and at 390 px, where the phone's sizes take over. Each
  measurable element carries `data-gallery` (`button-md`, `iconbutton-sm`,
  `chip-sm`, `tabs-bar`, `dialog-columns`, ...).

## Budgets

Ceilings live in two JSON files. Raising one is a change of its own, reviewed
on its own, never folded into the change that needed the room. A build over a
ceiling fails.

| What | Ceiling | File | Measured when this was written |
|---|---|---|---|
| Start-up JavaScript (desktop, the chunks loaded at start) | 642,369 B | `bundle-budget.json` (`eagerMaxBytes`) | 641,857 B |
| CSS, either build | 67,500 B | `style-budget.json` (`cssMaxBytes`) | 63,983 B desktop, 63,965 B web |
| The phone's offline cache (every file the web build precaches) | 1,680,000 B | `style-budget.json` (`precacheMaxBytes`) | 1,672,184 B |
| Font files | exactly 3, 60,000 to 71,000 B | `style-check.mjs` (not a budget: proves the files are the ones meant) | 70,840 B |

The building blocks cost start-up bytes only once a start-up screen imports
them; the gallery is never built. A lazy screen (one loaded on demand) still
grows the offline cache, which holds every chunk.

## When you build a screen

- Use the blocks; reach for a utility only for layout.
- Take sizes and colours from the tokens. A measure only your screen uses goes
  at the end of `tokens.css`, in the same change.
- Draw a map-like dot or key from `Dot` or the `--d-*` copies, never a new
  colour.
- A choice list opens from its own button (never an inline drop-down): Escape
  closes it and puts focus back on the button, and a press outside closes it.
- A Leaflet map outside the planner (the Flight overview's picture) sits in a
  box with `isolate`: Leaflet's panes carry z-index 400 to 1000 and would
  otherwise draw over a list or menu that drops over the map.
- A new dialog is a `Modal`; it gets the look and the keyboard for free.
- Keep `role="dialog"` on anything that should block Undo and own Escape.
- Run `design-shots.cjs` before and after, and look at the diff pictures.
