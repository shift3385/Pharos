// Vitest config of the case-study fixture generator (make-fixtures.test.ts):
// the app's own config (aliases, `?url` assets, setup), run on that one file.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import base from "../../../vite.config";

export default defineConfig({
  ...base,
  root: fileURLToPath(new URL("../../..", import.meta.url)),
  test: {
    ...base.test,
    include: ["scripts/manual/fixtures/make-fixtures.test.ts"],
  },
});
