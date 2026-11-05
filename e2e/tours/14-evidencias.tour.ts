// Chapter 14 — Evidencias (DAT-03b, wave E5): Administración › Evidencias
// shows the encrypted evidence store, verifies every file and deletes the
// orphans after confirmation. Selectors: the evidence-* test ids.
//
// To show the repair, the tour leaves one orphan in the isolated profile's
// evidence folder: a file with the store's name pattern (<2 hex>/<64 hex>.pev)
// that no row knows, dated two days back (younger orphans are never deleted).
import { execFileSync } from "node:child_process";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import { byTestId, openAdminTab } from "./helpers";

function plantOrphan() {
  const profile = process.env.PHAROS_E2E_PROFILE;
  if (!profile) throw new Error("PHAROS_E2E_PROFILE is not set");
  const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  const folder = join(appData, "com.pharos.desktop", "e2e", profile, "evidence", "ab");
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `ab${"0".repeat(62)}.pev`);
  writeFileSync(file, Buffer.from("not a real evidence file"));
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  utimesSync(file, twoDaysAgo, twoDaysAgo);
  // Windows also looks at the creation time, which Node cannot set.
  execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `(Get-Item -LiteralPath '${file.replaceAll("'", "''")}').CreationTime = (Get-Date).AddDays(-2)`,
  ]);
}

chapter("evidencias", () => {
  step("almacen", {
    title: "El almacén de evidencias",
    caption: "En «Administración», pulsa la pestaña «Evidencias». «Almacén de evidencias» da el espacio que ocupan, los adjuntos por tipo (planificador, defectos, reportes, resultados, borradores…) y la retención de los reportes importados.",
    covers: ["admin:evidence", "screen:evidence-admin"],
    run: async () => {
      plantOrphan();
      await openAdminTab("evidence");
      await expect(byTestId("evidence-usage")).toBeDisplayed();
      await expect(byTestId("evidence-usage-total")).toBeDisplayed();
    },
  });

  step("verificar", {
    title: "Verificar las evidencias",
    caption: "«Verificar evidencias» comprueba que cada archivo está y se descifra, y busca archivos que ninguna fila conoce (huérfanos). No borra nada por sí sola; puedes seguir trabajando mientras tanto.",
    run: async () => {
      await byTestId("evidence-verify").click();
      await byTestId("evidence-report").waitForDisplayed({ timeout: 60_000 });
      await expect(byTestId("evidence-orphans")).toBeDisplayed();
    },
  });

  step("reparar", {
    title: "Borrar los huérfanos",
    caption: "Los huérfanos aparecen en su bloque con su tamaño; «Borrar seleccionados» pide confirmación antes de eliminarlos. Los que faltan o están dañados se listan con el elemento que los usa.",
    covers: ["dialogs:src/modules/admin/ui/tabs/EvidenceTab.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      const block = byTestId("evidence-orphans");
      const box = block.$('input[type="checkbox"]');
      if ((await box.isExisting()) && !(await box.isSelected())) await box.click();
      await byTestId("evidence-repair").click();
      await expect(byTestId("evidence-confirm")).toBeDisplayed();
    },
  });

  step("reparado", {
    title: "Huérfanos borrados",
    caption: "Al confirmar se borran y el informe se actualiza; cada borrado queda en el registro de auditoría.",
    shot: false,
    run: async () => {
      await byTestId("evidence-confirm").click();
      await $('[role="alertdialog"]').waitForExist({ reverse: true });
      // Nothing left to delete: the repair button goes away (or is disabled).
      await browser.waitUntil(
        async () => !(await byTestId("evidence-repair").isExisting()) || !(await byTestId("evidence-repair").isEnabled()),
        { timeout: 30_000, timeoutMsg: "the orphan was not deleted" },
      );
    },
  });
});
