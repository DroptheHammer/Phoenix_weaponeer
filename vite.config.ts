import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: {
      // The desktop build talks to Tauri. The web build (vite.config.web.ts)
      // points this at the browser platform instead.
      "@platform": fileURLToPath(new URL("./src/lib/platform/desktop.ts", import.meta.url)),
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
