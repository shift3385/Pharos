/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

// The root package.json is the single source of the Pharos version
// (scripts/version.mjs, docs/VERSIONING.md), inlined as a constant so the
// bundle does not carry the whole package.json. The UI shows it (UX-07) and
// sync requests carry it (SYNC-08).
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

// «Acerca de Pharos» (UX-26): the build (commit and date) and the stack with
// the major versions this build was made with, read from the manifests so the
// dialog never goes stale. Outside a git checkout the commit is "dev".
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const deps = (path: string): Record<string, string> => {
  const p = JSON.parse(read(path)) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return { ...p.dependencies, ...p.devDependencies };
};
const major = (range: string | undefined) => range?.match(/\d+/)?.[0] ?? "";
const web = deps("./package.json");
const server = deps("./server/package.json");
const tauri = read("./src-tauri/Cargo.toml").match(/^tauri\s*=\s*\{\s*version\s*=\s*"([^"]+)"/m)?.[1];
let commit = "dev";
try {
  commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
} catch {
  // Not a git checkout (e.g. a source archive): keep "dev".
}
const build = {
  commit,
  date: new Date().toISOString().slice(0, 10),
  stack: [
    { name: "Tauri", version: major(tauri) },
    { name: "Rust", version: "" },
    { name: "SQLite", version: "", encrypted: true },
    { name: "React", version: major(web.react) },
    { name: "TypeScript", version: major(web.typescript) },
    { name: "Vite", version: major(web.vite) },
    { name: "Fastify", version: major(server.fastify) },
    { name: "PostgreSQL", version: "" },
  ],
};

// Tauri expects a fixed port and does not clear the terminal on rebuild.
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(build),
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
