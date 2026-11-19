# Artwork: the app icon and the loading splash

Both pictures were supplied by DroptheHammer on 2026-11-19 for 0.4.0. They
are **AI-generated**, not hand-drawn: a phoenix emblem on navy for the icon,
and a round embroidered patch for the splash.

History: a first icon and a full-scene splash were tried on 2026-09-30 and
taken out the same day. This set replaces them: an emblem, not a scene, and
a splash that shows only while the app loads.

## Where things live

| What | File | Notes |
|---|---|---|
| Original art | `Other Items/Artwork/v040/` | Git-ignored. Never commit the originals: they carry their maker's metadata. |
| Icon master | `app-icon.png` | 1024×1024, the emblem on its navy square. The source for `tauri icon`. |
| Desktop and phone icon set | `src-tauri/icons/` | Generated from the master. The phone build takes its home-screen icons from here (`vite.config.web.ts`). |
| Mac icon | `src-tauri/icons/icon.icns` | The same picture on a rounded tile. Recent macOS puts a grey plate behind any icon that is not a rounded tile. |
| Browser tab icon | `public/favicon.png` | A copy of `src-tauri/icons/64x64.png`. |
| Splash | `public/splash.webp` | The patch alone, cut out on a circle, 672×672 with a clear surround. |

## The splash

- Plain HTML in `index.html`, so it is on screen with the first frame, over
  the window's own colour (`#1a1a2e`). Both white-flash fixes stay: the
  window's `backgroundColor` in `tauri.conf.json` and the `<html>` background.
- `src/lib/splash.ts` fades it out (300 ms) and removes it when `App.tsx`'s
  loading ends. No minimum time and no animation: if loading takes a third of
  a second, that is how long it shows.
- The patch is cut out on a circle because a generated picture never matches
  the window's navy exactly; a square would show its edge.
- The phone build shares the page, so the splash shows there too.

## The strip rule

Every picture is re-encoded before it reaches the repo, so nothing rides
along inside it (see "Privacy" in `CLAUDE.md`). `npm run geo-check` holds it
(`scripts/art-check.ts`): no picture under `app-icon.png`, `public/` or
`src-tauri/icons/` may carry a text, date, camera or colour-profile chunk, or
a marker of a tool, a person or a machine.

## Rules for any art

- No real unit names or insignia, no squad member names. The app's name only.
- It goes in front of the owner in the real Mac app before it is merged.

## Regenerating

`ART` is the folder with the originals; `TMP` is any scratch folder outside
the repo. Run from the repo root. Needs ImageMagick and `cwebp`.

```sh
# Icon master (the navy square), then the whole set
magick "$ART/ICON.jpeg" -strip -resize 1024x1024 \
  -define png:exclude-chunks=date,time app-icon.png
npm run tauri -- icon app-icon.png --ios-color "#1a1a2e"

# Mac: the same picture on a rounded tile, .icns only
magick -size 824x824 xc:black -fill white \
  -draw 'roundrectangle 0,0 823,823 185,185' "$TMP/tile-mask.png"
magick "$ART/ICON.jpeg" -strip -resize 824x824 "$TMP/tile-art.png"
magick "$TMP/tile-art.png" "$TMP/tile-mask.png" -alpha off \
  -compose CopyOpacity -composite "$TMP/tile-cut.png"
magick "$TMP/tile-cut.png" -background none -gravity center -extent 1024x1024 \
  -define png:exclude-chunks=date,time "PNG32:$TMP/icon-tile-1024.png"
npm run tauri -- icon "$TMP/icon-tile-1024.png" -o "$TMP/tile-icons"
cp "$TMP/tile-icons/icon.icns" src-tauri/icons/icon.icns

# Browser tab
cp src-tauri/icons/64x64.png public/favicon.png

# Splash: the patch cut out on a circle (centre and radius measured on the picture)
magick "$ART/Splash.jpeg" -strip -crop 672x672+176+176 +repage \
  \( -size 672x672 xc:black -fill white -draw 'circle 336,336.5 336,4.5' -blur 0x0.8 \) \
  -alpha off -compose CopyOpacity -composite \
  -define png:exclude-chunks=date,time "$TMP/splash.png"
cwebp -q 86 -alpha_q 100 -metadata none "$TMP/splash.png" -o public/splash.webp
```

Run the Mac step **after** the whole set: `tauri icon` rewrites `icon.icns`
each time it runs on `app-icon.png`.

## Known limits

- Windows and Linux get the navy square, not a see-through emblem: only the
  navy version of the picture was supplied. A see-through one needs the same
  emblem on a plain white background.
- At 32 px the emblem is an orange shape; its detail reads from 64 px up.
- The splash's source is 667 px across, so on a large high-density screen it
  is drawn slightly above its own size.
