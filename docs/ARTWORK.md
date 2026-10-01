# Artwork: the app icon

The phoenix icon was supplied by DroptheHammer on 2026-09-30. It is
**AI-generated** (made with ChatGPT), not hand-drawn.

A splash picture came with it. A start-up splash was built, seen in the real
app, and removed the same day; the app opens straight to the planner. The
picture is not in the repo.

## Where things live

| What | File | Notes |
|---|---|---|
| Original art | `Other Items/Artwork/` | Git-ignored. Never commit the originals: they carry a provenance tag. |
| Icon master | `app-icon.png` | 1024×1024, clear background. The source for `tauri icon`. |
| Desktop icon set | `src-tauri/icons/` | Generated. Windows and Linux use the clear phoenix. |
| Mac icon | `src-tauri/icons/icon.icns` | The phoenix on a dark rounded tile. Recent macOS puts a grey plate behind any icon that is not a rounded tile. |
| Phone home-screen icons | `src-tauri/icons/web/` | The phoenix on a full dark square; phones round the corners themselves. Read by `vite.config.web.ts`. |
| Browser tab icon | `public/favicon.png` | A copy of `src-tauri/icons/64x64.png`. |

## The strip rule

Every picture is re-encoded before it reaches the repo, so nothing rides along
inside it (see "Privacy" in `CLAUDE.md`). After converting, this must print
nothing:

```sh
grep -a -l -E 'c2pa|caBX|OpenAI|ChatGPT|tEXt|iTXt|zTXt|eXIf|iCCP|tIME|Exif|/Users/' \
  app-icon.png public/favicon.png \
  src-tauri/icons/*.png src-tauri/icons/*.ic* \
  src-tauri/icons/*/*.png src-tauri/icons/*/*/*.png
```

## Regenerating

`ART` is the folder with the originals; `TMP` is any scratch folder outside
the repo. Run from the repo root.

```sh
# Icon master (clear background), then the whole desktop set
magick "$ART/Icon.png" -strip -resize 1024x1024 \
  -define png:exclude-chunks=date,time app-icon.png
npm run tauri -- icon app-icon.png --ios-color "#1a1a2e"

# Mac: the phoenix on a dark rounded tile, .icns only
magick -size 1024x1024 gradient:'#2a3a6b-#12122a' -alpha set \
  \( -size 1024x1024 xc:none -fill white \
     -draw 'roundrectangle 100,100 923,923 185,185' \) \
  -compose DstIn -composite \
  \( "$ART/Icon.png" -resize 690x690 \) -gravity center -compose Over -composite \
  -strip -define png:exclude-chunks=date,time "$TMP/icon-tile-1024.png"
npm run tauri -- icon "$TMP/icon-tile-1024.png" -o "$TMP/tile-icons"
cp "$TMP/tile-icons/icon.icns" src-tauri/icons/icon.icns

# Phone home screen: the phoenix on a full dark square
magick -size 1024x1024 gradient:'#2a3a6b-#12122a' \
  \( "$ART/Icon.png" -resize 760x760 \) -gravity center -compose Over -composite \
  -alpha off -strip -define png:exclude-chunks=date,time "$TMP/icon-bleed-1024.png"
npm run tauri -- icon "$TMP/icon-bleed-1024.png" -o "$TMP/bleed-icons" -p 180,192,512
cp "$TMP/bleed-icons/192x192.png" src-tauri/icons/web/icon-192.png
cp "$TMP/bleed-icons/512x512.png" src-tauri/icons/web/icon-512.png
cp "$TMP/bleed-icons/180x180.png" src-tauri/icons/web/apple-touch-icon.png

# Browser tab
cp src-tauri/icons/64x64.png public/favicon.png
```

Run the Mac and phone steps **after** the desktop set: `tauri icon` rewrites
`icon.icns` each time it runs on `app-icon.png`.

## Known limits

- At 32 px the icon is only an orange shape; the detail reads from 64 px up.
