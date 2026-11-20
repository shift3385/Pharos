// WebdriverIO config of the guided tours (MAN-01). Same harness as the smoke
// (wdio.conf.ts: tauri-driver, isolated profile, clean-up); run it through
// `npm run manual` (e2e/tours/run-tours.mjs), which starts the isolated API and
// builds the tour binary first. The tours run as ONE group, in manifest order,
// in a single app session: in a full run each chapter builds on the data the
// earlier ones made on screen (prerequisites: e2e/tours/prepare.ts).
import { cpSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { selectTours } from "./tours/manifest";
import { config as base } from "./wdio.conf";

// The AI tours hand a real key to the app over WebDriver: msedgedriver's
// verbose log would record it, so it is never enabled for the tours (the base
// config reads the variable only in onPrepare).
delete process.env.PHAROS_E2E_DRIVER_LOG;
const e2eDir = fileURLToPath(new URL(".", import.meta.url));

// `npm run manual -- --spec 04` → PHAROS_TOURS_ONLY=04: the preparation tour
// (theme) and the tours whose file name matches it (a regular expression:
// "0[2-4]"); each prepares the data it reads (`uses`, e2e/tours/prepare.ts).
const { files } = selectTours(process.env.PHAROS_TOURS_ONLY);

export const config: WebdriverIO.Config = {
  ...base,
  specs: [files.map((file) => join(e2eDir, "tours", file))],
  // A tour clicks the first match (a page often repeats a label, e.g. two
  // «Guardar»); every step asserts its outcome, so a wrong click still fails.
  strictSelectors: false,
  // A few long chapters (the 17-step plan wizard) need more than the smoke.
  mochaOpts: { ui: "bdd", timeout: 600_000 },
  // No JUnit report: it records every WebDriver command with its arguments,
  // the AI key included (found by check-manual --secret-scan). The tours'
  // own record is e2e/results/tours/steps.jsonl.
  reporters: ["spec"],
  // The app logs of the tour profile go to e2e/results/tours/app-logs (the
  // base config copies them to e2e/results/app-logs, the smoke's place).
  onComplete: async (...a: unknown[]) => {
    const profile = process.env.PHAROS_E2E_PROFILE ?? "";
    const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    const logs = join(localAppData, "com.pharos.desktop", "logs", "e2e", profile);
    if (profile && existsSync(logs)) cpSync(logs, join(e2eDir, "results", "tours", "app-logs"), { recursive: true });
    const smokeLogs = join(e2eDir, "results", "app-logs");
    const hadSmokeLogs = existsSync(smokeLogs);
    const onComplete = base.onComplete as (...x: unknown[]) => unknown;
    await onComplete(...a);
    if (!hadSmokeLogs) rmSync(smokeLogs, { recursive: true, force: true });
  },
};
