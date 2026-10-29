// BASE-08 on the real binary: Administration shows the version and the
// "Exportar diagnóstico" action; clicking it saves a ZIP to the Downloads
// folder whose content carries the version and migrations but none of the
// user's data (here: the account email and a project created for the purpose).
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { $, browser, expect } from "@wdio/globals";
import {
  TEST_PROJECT_PREFIX,
  cleanUp,
  createProject,
  email,
  ensureSignedOut,
  es,
  pkg,
  signIn,
} from "../support";

const marker = `${TEST_PROJECT_PREFIX}confidencial ${process.env.PHAROS_E2E_PROFILE}`;
const resultsDir = fileURLToPath(new URL("../results/", import.meta.url));
const downloadsDir =
  process.env.PHAROS_E2E_DOWNLOADS ?? join(homedir(), "Downloads");

/** Bundles saved since `since` (ms), complete (no partial download left). */
function savedBundles(since: number): string[] {
  if (!existsSync(downloadsDir)) return [];
  return readdirSync(downloadsDir)
    .filter(
      (name) =>
        name.startsWith(`pharos-diagnostic-${pkg.version}-`) &&
        name.endsWith(".zip"),
    )
    .map((name) => join(downloadsDir, name))
    .filter((path) => statSync(path).mtimeMs >= since);
}

describe("Diagnostics on the desktop (BASE-08)", () => {
  before(async () => {
    await ensureSignedOut();
    await signIn();
    await createProject(marker);
  });

  it("shows the version and the export action in Administration", async () => {
    await $('[data-testid="nav-admin"]').click();
    const section = $('[data-testid="admin-diagnostics"]');
    await expect(section).toBeDisplayed();
    await expect(section).toHaveText(expect.stringContaining(pkg.version));
    await expect(section.$(`button=${es.diagnostics.export}`)).toBeEnabled();
    await section.scrollIntoView();
    await browser.saveScreenshot(join(resultsDir, "admin-diagnostics.png"));
  });

  it("saves a bundle without user data to Downloads", async () => {
    const since = Date.now() - 1000;
    await $(`button=${es.diagnostics.export}`).click();
    await browser.waitUntil(async () => savedBundles(since).length > 0, {
      timeout: 20_000,
      timeoutMsg: `no pharos-diagnostic-*.zip appeared in ${downloadsDir}`,
    });
    const [path] = savedBundles(since);
    try {
      const zip = await JSZip.loadAsync(readFileSync(path));
      const names = Object.keys(zip.files);
      expect(names).toContain("diagnostic.json");
      expect(names.some((n) => n.startsWith("logs/pharos."))).toBe(true);
      const manifest = await zip.file("diagnostic.json")!.async("string");
      const parsed = JSON.parse(manifest);
      expect(parsed.platform).toBe("desktop");
      expect(parsed.app.version).toBe(pkg.version);
      expect(parsed.database.migrations.length).toBeGreaterThan(0);
      let everything = manifest;
      for (const name of names) {
        everything += await zip.file(name)?.async("string");
      }
      expect(everything).not.toContain(marker);
      expect(everything).not.toContain(email);
    } finally {
      rmSync(path, { force: true });
    }
  });

  after(async () => {
    await cleanUp();
  });
});
