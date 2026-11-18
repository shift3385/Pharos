import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The shared result importers (ADR-0053), loaded from source like tsx does.
    alias: {
      "@pharos/formats": fileURLToPath(
        new URL("../packages/formats/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Single shared test database — avoid parallel files clobbering each other.
    fileParallelism: false,
  },
});
