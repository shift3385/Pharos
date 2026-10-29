/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

// The root package.json is the single source of the Pharos version
// (scripts/version.mjs, docs/VERSIONING.md), inlined as a constant so the
// bundle does not carry the whole package.json. The UI shows it (UX-07) and
// sync requests carry it (SYNC-08).
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

// Tauri expects a fixed port and does not clear the terminal on rebuild.
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      "@app": fileURLToPath(new URL("./src/app", import.meta.url)),
      "@modules": fileURLToPath(new URL("./src/modules", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@test": fileURLToPath(new URL("./src/test", import.meta.url)),
    },
  },
  // Prevent Vite from obscuring Rust errors and align dev server with Tauri.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Tauri sources are watched by cargo, not Vite.
      ignored: ["**/src-tauri/**"],
    },
  },
  // Env vars starting with these prefixes are exposed to the client.
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    restoreMocks: true,
  },
});
