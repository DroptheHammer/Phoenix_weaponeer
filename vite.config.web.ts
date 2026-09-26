import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The web build: the same app, with the Rust core as WebAssembly and the
// browser for files. Run `npm run build:wasm` first. Output goes to
// dist-web/, which GitHub Pages serves (see docs/MOBILE_WEB_PLAN.md).

const THEME = "#16213e"; // dcs-navy, the header colour
const BACKGROUND = "#1a1a2e"; // dcs-dark

/** The app icons, taken from the desktop app's set rather than copied into the repo. */
const ICONS: [from: string, to: string][] = [
  ["android/mipmap-xxxhdpi/ic_launcher.png", "icons/icon-192.png"],
  ["icon.png", "icons/icon-512.png"],
  ["ios/AppIcon-60x60@3x.png", "icons/apple-touch-icon.png"],
];

/** Emits the icons and adds the phone-only tags to index.html (the desktop build keeps its own). */
function webShell(): Plugin {
  return {
    name: "phoenix-web-shell",
    generateBundle() {
      for (const [from, to] of ICONS) {
        const source = readFileSync(fileURLToPath(new URL(`./src-tauri/icons/${from}`, import.meta.url)));
        this.emitFile({ type: "asset", fileName: to, source });
      }
    },
    transformIndexHtml: (html) =>
      html
        // Room under the iPhone notch and home bar is handled in CSS with safe-area insets.
        .replace(
          'content="width=device-width, initial-scale=1.0"',
          'content="width=device-width, initial-scale=1.0, viewport-fit=cover"',
        )
        .replace(
          "</head>",
          `    <meta name="theme-color" content="${THEME}" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Weaponeer" />
    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
  </head>`,
        ),
  };
}

export default defineConfig({
  plugins: [
    react(),
    webShell(),
    // Installable ("Add to Home Screen") and usable offline once loaded.
    // A new version waits until the planner taps Reload (UpdateBanner),
    // which registers the service worker itself.
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "Phoenix Weaponeer",
        short_name: "Weaponeer",
        description: "DCS attack planning and kneeboard cards",
        display: "standalone",
        orientation: "any",
        start_url: "./",
        scope: "./",
        theme_color: THEME,
        background_color: BACKGROUND,
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,wasm,png,svg}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // Map tiles seen before still draw offline. OSM's usage policy
            // asks clients to cache; a week and a few hundred tiles is modest.
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: "CacheFirst",
            options: {
              cacheName: "osm-tiles",
              expiration: { maxEntries: 800, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],

  // Relative asset paths, so the site works under any folder
  // (GitHub Pages serves it at /Phoenix_weaponeer/).
  base: "./",

  resolve: {
    alias: {
      "@platform": fileURLToPath(new URL("./src/lib/platform/web.ts", import.meta.url)),
      "@pwa-update": fileURLToPath(new URL("./src/lib/pwaUpdate/web.ts", import.meta.url)),
    },
  },

  build: {
    outDir: "dist-web",
    // Source maps would publish the source a second time, with comments.
    sourcemap: false,
  },

  server: {
    port: 1421,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**", "**/crates/**"],
    },
  },
});
