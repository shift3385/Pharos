import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Single shared test database — avoid parallel files clobbering each other.
    fileParallelism: false,
  },
});
