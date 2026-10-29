// BASE-08 on the real binary: Administration shows the version and the
// "Exportar diagnóstico" action, and the bundle the desktop builds carries the
// version and migrations but none of the user's data (here: the account email
// and a project created for the purpose).
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { $, browser, expect } from "@wdio/globals";
import { cleanUp, createProject, email, es, pkg, signIn } from "../support";

const marker = `Confidencial-${process.env.PHAROS_E2E_PROFILE}`;
const resultsDir = fileURLToPath(new URL("../results/", import.meta.url));

describe("Diagnostics on the desktop (BASE-08)", () => {
  before(async () => {
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

  it("builds a bundle without user data", async () => {
    const bundle = await browser.execute(async () => {
      const tauri = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (cmd: string, args: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      return JSON.stringify(
        await tauri.invoke("diag_export", {
          client: { language: "es", theme: "light" },
        }),
      );
    });
    const parsed = JSON.parse(bundle) as {
      manifest: {
        app: { version: string };
        database: { migrations: { name: string }[] };
      };
      logs: { name: string }[];
    };
    expect(parsed.manifest.app.version).toBe(pkg.version);
    expect(parsed.manifest.database.migrations.length).toBeGreaterThan(0);
    expect(parsed.logs.length).toBeGreaterThan(0);
    expect(bundle).not.toContain(marker);
    expect(bundle).not.toContain(email);
  });

  after(async () => {
    await cleanUp(marker);
  });
});
