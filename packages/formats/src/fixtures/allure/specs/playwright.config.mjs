import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./specs",
  retries: 1,
  workers: 1,
  reporter: [["allure-playwright", { resultsDir: "allure-results", environmentInfo: { os: "ci", app: "pharos-sample" } }]],
});
