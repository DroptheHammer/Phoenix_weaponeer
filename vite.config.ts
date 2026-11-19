import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { appDefines } from "./scripts/app-version.mjs";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // The version the About dialog shows, read from package.json at build time.
  define: appDefines(),

  resolve: {
    alias: {
      // The desktop build talks to Tauri. The web build (vite.config.web.ts)
      // points this at the browser platform instead.
      "@platform": fileURLToPath(new URL("./src/lib/platform/desktop.ts", import.meta.url)),
      "@pwa-update": fileURLToPath(new URL("./src/lib/pwaUpdate/desktop.ts", import.meta.url)),
      "@playback": fileURLToPath(new URL("./src/components/playback/entry.desktop.tsx", import.meta.url)),
    },
  },

  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
