// Chapter 16 — Evidencias (DAT-03b, wave E5; manual v2, MAN-03): Administración › Evidencias
// shows the encrypted evidence store, verifies every file and deletes the
// orphans after confirmation; «Retención por proyecto» (DAT-03c) sets how
// long each kind of evidence is kept. Selectors: the evidence-* test ids.
//
// To show the repair, the tour leaves one orphan in the isolated profile's
// evidence folder: a file with the store's name pattern (<2 hex>/<64 hex>.pev)
// that no row knows, dated two days back (younger orphans are never deleted).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import { PROJECT_A, byTestId, chooseOption, openAdminTab } from "./helpers";

/** «Proyecto» of «Retención por proyecto»: picks a project by its name. */
async function chooseProject(name: string) {
  const picker = byTestId("evidence-retention-project");
  await picker.waitForEnabled({ timeout: 15_000 });
  const chosen = async () => ((await picker.getAttribute("aria-label")) ?? "").endsWith(`: ${name}`);
  if (await chosen()) return;
  await picker.click();
  const items = ".project-menu__list > *";
  await browser.waitUntil(async () => (await $$(items)).length > 0, { timeoutMsg: "the project menu did not open" });
  for (const item of await $$(items)) {
    // An item reads «PH Pharos» (the prefix without its separator, FIX-46), then the name.
    if ((await item.getText()).replace(/^[A-Z0-9]+[-_]?\s+/, "").trim() === name) {
      await item.click();
      break;
    }
  }
  await browser.waitUntil(chosen, { timeoutMsg: `the retention did not switch to «${name}»` });
}

function plantOrphan() {
  const profile = process.env.PHAROS_E2E_PROFILE;
  if (!profile) throw new Error("PHAROS_E2E_PROFILE is not set");
  const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  // Named, as the store names its files, by the hash of its content: a
  // capture whose save was cut short (no row ever recorded it).
  const content = Buffer.from("captura-acceso-interrumpida.png: guardado a medias");
  const hash = createHash("sha256").update(content).digest("hex");
  const folder = join(appData, "com.pharos.desktop", "e2e", profile, "evidence", hash.slice(0, 2));
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${hash}.pev`);
  writeFileSync(file, content);
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
    caption:
      "Las evidencias son los archivos que adjuntas: capturas, vídeos, registros y trazas de las tarjetas del Tablero, los defectos, los resultados y los informes importados. Pharos los guarda cifrados en este equipo y, con un servidor, los comparte con tu workspace: cada archivo viaja una sola vez por su contenido y llega cifrado a tus otros equipos y a los de tus compañeros. En «Administración», la pestaña «Evidencias» empieza por «Almacén de evidencias»: el espacio que ocupan, los adjuntos vigentes por tipo (tablero, defectos, reportes, resultados, borradores…), los caducados y la retención de los reportes importados. En este ejemplo, los de Pharos: las capturas de sus resultados y los informes que Liomar importó (capítulo 10). Los de «Requisitos», si los hay, son los archivos de origen de los requisitos que el asistente de IA propone desde un proyecto o desde diseños (capítulo 17).",
    covers: ["admin:evidence", "screen:evidence-admin"],
    run: async () => {
      plantOrphan();
      await openAdminTab("evidence");
      await expect(byTestId("evidence-usage")).toBeDisplayed();
      await expect(byTestId("evidence-usage-total")).toBeDisplayed();
    },
  });

  step("retencion", {
    title: "Retención por proyecto",
    caption: "«Retención por proyecto» fija, para cada tipo de evidencia de un proyecto, cuánto se conserva antes de que caduque su archivo: el valor por defecto (30 días las trazas y los vídeos, 90 los reportes y los registros), «Siempre» o un número de días. Nunca caduca la evidencia de la ejecución manual, la de un resultado final fallido o bloqueado ni la de un resultado vinculado a un defecto abierto. Nada se guarda hasta pulsar «Guardar». Es un ajuste solo de este equipo: no se sincroniza. Primero eliges el proyecto: en este ejemplo, Liomar elige «Pharos» y guarda 45 días las trazas de Playwright y siempre los vídeos, porque los usa para comparar entre versiones.",
    covers: ["action:evidence-retention"],
    focus: ['[data-testid="evidence-retention-project"]', '[data-testid="evidence-retention-trace"]', '[data-testid="evidence-retention-video"]'],
    run: async () => {
      await byTestId("evidence-retention").scrollIntoView();
      await chooseProject(PROJECT_A.name);
      const trace = byTestId("evidence-retention-trace");
      await trace.waitForDisplayed();
      await chooseOption(trace, { value: "days" });
      const days = byTestId("evidence-retention-trace-days");
      await days.waitForDisplayed();
      await days.setValue("45");
      await chooseOption(byTestId("evidence-retention-video"), { value: "always" });
      await expect(byTestId("evidence-retention-device")).toBeDisplayed();
      // Longer than before: «Guardar» applies it without asking.
      await byTestId("evidence-retention-save").click();
      // Saved when the row shows the new value (the button is also disabled
      // while it saves, so it is not a signal).
      await browser.waitUntil(async () => (await byTestId("evidence-retention").getText()).includes("Ahora: 45 días"), {
        timeoutMsg: "the retention was not saved",
      });
      // The project, traces and videos rows whole under the top bar.
      await byTestId("evidence-retention-video").scrollIntoView({ block: "center" });
    },
  });

  step("retencion-acortar", {
    title: "Acortar la retención",
    caption: "Un plazo más corto que el actual pide confirmación y dice cuántos archivos caducarían en la próxima pasada (al arrancar o tras sincronizar). Los resultados se conservan; los archivos caducados no se recuperan. Por eso es una confirmación crítica: Esc no la cierra; solo responden «Cancelar» y el botón de confirmar. En este ejemplo, Liomar baja los registros a 7 días; Pharos no tiene registros adjuntos con más de 7 días, así que no caduca ninguno («0 archivos caducarían»).",
    covers: ["dialogs:src/modules/admin/ui/tabs/EvidenceRetentionSection.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await chooseOption(byTestId("evidence-retention-log"), { value: "days" });
      const days = byTestId("evidence-retention-log-days");
      await days.waitForDisplayed();
      await days.setValue("7");
      await byTestId("evidence-retention-save").click();
      await expect(byTestId("evidence-retention-shorter")).toBeDisplayed();
    },
  });

  step("retencion-acortada", {
    title: "Retención acortada",
    caption: "Al confirmar, el nuevo plazo se guarda en este equipo.",
    shot: false,
    run: async () => {
      await byTestId("evidence-retention-confirm").click();
      await $('[role="alertdialog"]').waitForExist({ reverse: true });
    },
  });

  step("verificar", {
    title: "Verificar las evidencias",
    caption:
      "«Verificar evidencias» comprueba que cada archivo está y se descifra, y busca archivos que ningún elemento usa, los huérfanos. No borra nada por sí sola; puedes seguir trabajando mientras tanto. Al terminar, el informe dice cuántos archivos comprobó y muestra en bloques lo que encontró: aquí, «Archivos sin registro (1)», un huérfano: una captura cuyo guardado se cortó (por ejemplo, porque el equipo se apagó en ese momento), así que ningún elemento llegó a apuntarla.",
    // The «Verificar evidencias» card alone: the page ends with it, so a
    // page shot would cut the retention rows above it.
    shot: { element: '[data-testid="evidence-check"]' },
    focus: '[data-testid="evidence-report"]',
    run: async () => {
      await byTestId("evidence-verify").click();
      await byTestId("evidence-report").waitForDisplayed({ timeout: 60_000 });
      await expect(byTestId("evidence-orphans")).toBeDisplayed();
      await byTestId("evidence-check").scrollIntoView({ block: "start" });
    },
  });

  step("reparar", {
    title: "Borrar los huérfanos",
    caption: "Los huérfanos aparecen en «Archivos sin registro», con su tamaño. Marca los que quieras borrar: «Borrar seleccionados» pide una confirmación crítica antes de eliminarlos, porque no se pueden recuperar. Solo se ofrecen los de más de 24 horas, para no tocar un archivo que se está guardando. Los que faltan o están dañados se listan con el elemento que los usa, para que sepas qué volver a adjuntar. Si tienes otra ventana de Pharos abierta con los mismos datos, ciérrala antes de borrar.",
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
