// Chapter 8 — Ejecuciones: importing an automated test report (the ING-01
// Playwright JUnit sample), the run list and the «Sin vincular» tray (link a
// test to a case, unlink it, filter).
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import {
  PROJECT_A,
  clickButton,
  dialog,
  es,
  field,
  fixturesDir,
  openProject,
  openSection,
  repoDir,
  tf,
  waitForText,
} from "./helpers";

const R = es.runs;
const D = '[role="dialog"]';
/** The ING-01 sample: a Playwright (playwright-bdd) JUnit report with a
 *  failed example and a retry (src/shared/contracts/pharos-run/fixtures). */
const REPORT = join(repoDir, "src", "shared", "contracts", "pharos-run", "fixtures", "ing01", "single", "pw-junit.xml");

chapter("ejecuciones", () => {
  step("lista", {
    title: "Ejecuciones",
    caption: "Pulsa «Ejecuciones» en el menú lateral. La pestaña «Runs» lista los runs con su estado y resultados; «Sin vincular», los tests importados que esperan un caso. Arriba, «Nuevo run manual» e «Importar informe».",
    covers: ["section:runs", "state:runs-empty"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("runs");
      await expect($('[data-testid="tab-runs"]')).toBeDisplayed();
    },
  });

  step("importar", {
    title: "Importar un informe",
    caption: "«Importar informe» acepta Cucumber Messages, CTRF, JUnit XML, JSON de Playwright o Pharos Run JSON. Elige el archivo y, si el informe enlaza capturas o vídeos, su carpeta de adjuntos.",
    covers: ["dialogs:src/modules/runs/ui/ImportReportDialog.tsx", "upload:src/modules/runs/ui/ImportReportDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(R.import.open);
      await expect(dialog()).toBeDisplayed();
      await $(D).$('input[type="file"]:not([webkitdirectory])').setValue(REPORT);
      await waitForText(R.format.junit);
      await (await field(R.field.title, D)).setValue("Regresión automática · nightly 2026-11-03");
      await (await field(R.field.build, D)).setValue("2.0.0-rc1");
      await (await field(R.field.environment, D)).setValue("preproducción");
    },
  });

  step("vista-previa", {
    title: "Vista previa antes de importar",
    caption: "La vista previa dice cuántos tests e intentos trae el informe, cuántos se vinculan a casos por su etiqueta (@BM-001) y cuántos quedarán «sin vincular». Nada se guarda hasta pulsar «Importar».",
    shot: { element: D },
    run: async () => {
      await $(D).$(`[aria-label="${R.import.preview}"]`).scrollIntoView();
      await expect(dialog()).toHaveText(expect.stringContaining("tests"));
    },
  });

  step("importado", {
    title: "Informe importado",
    caption: "Al terminar, el resumen dice qué run se creó y cuántos resultados quedan sin vincular. El run aparece en la lista como «Importado».",
    covers: ["action:runs-filter"],
    run: async () => {
      await clickButton(R.import.confirm, D);
      await $(".rn-done").waitForDisplayed({ timeout: 60_000 });
      await clickButton(es.common.close, D);
      await $(`button.chips__chip*=${R.list.imported}`).click();
      await browser.waitUntil(async () => (await $$("tr.dt__row")).length >= 1, { timeoutMsg: "the imported run is not listed" });
      await $(`button.chips__chip*=${R.list.all}`).click();
    },
  });

  step("con-adjuntos", {
    title: "Un informe con adjuntos",
    caption: "Si el informe enlaza capturas, vídeos o trazas, elige también su «Carpeta de adjuntos»: Pharos busca cada archivo por su nombre y lo guarda, cifrado, como evidencia del resultado. Aquí, un JUnit de dos tests con la captura de un fallo.",
    covers: ["action:import-attachments-folder"],
    shot: { element: D },
    run: async () => {
      await clickButton(R.import.open);
      await expect(dialog()).toBeDisplayed();
      await $(D).$('input[type="file"]:not([webkitdirectory])').setValue(join(fixturesDir, "informe-adjuntos", "junit.xml"));
      await waitForText(R.format.junit);
      // msedgedriver uploads a whole folder into a webkitdirectory input.
      await $(D).$('input[type="file"][webkitdirectory]').setValue(join(fixturesDir, "informe-adjuntos", "capturas"));
      await (await field(R.field.title, D)).setValue("Regresión automática · con capturas");
      await waitForText(tf("runs.import.attachments_one", { count: 1 }));
    },
  });

  step("con-adjuntos-hecho", {
    title: "Adjuntos guardados",
    caption: "El resumen confirma cuántos resultados se importaron y cuántos adjuntos se guardaron como evidencia.",
    shot: false,
    run: async () => {
      await clickButton(R.import.confirm, D);
      await $(".rn-done").waitForDisplayed({ timeout: 60_000 });
      await expect($(".rn-done")).toHaveText(expect.stringContaining(tf("runs.import.done.attached_one", { count: 1 })));
      await clickButton(es.common.close, D);
    },
  });

  step("sin-vincular", {
    title: "La bandeja «Sin vincular»",
    caption: "Los tests del informe que no llevan la etiqueta de un caso del proyecto esperan en «Sin vincular», con el motivo (sin etiqueta, caso desconocido…), su último estado y cuántos resultados tienen.",
    covers: ["screen:unlinked-tray", "tabs:src/modules/runs/ui/RunsPage.tsx"],
    run: async () => {
      await $('[data-testid="tab-unlinked"]').click();
      await expect($(`table[aria-label="${R.tray.title}"]`)).toBeDisplayed();
      await browser.waitUntil(async () => (await $$(`button=${R.tray.linkAction}`)).length >= 4, {
        timeoutMsg: "the ING-01 sample should leave 4 tests unlinked",
      });
    },
  });

  step("vincular", {
    title: "Vincular un test a un caso",
    caption: "«Vincular…» abre el buscador de casos: elige el caso y pulsa «Vincular». Desde ese momento, todos sus resultados (también los de futuras importaciones) cuentan para el caso.",
    covers: ["dialogs:src/modules/runs/ui/LinkCaseDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await $(`button=${R.tray.linkAction}`).click();
      await expect(dialog()).toBeDisplayed();
      await (await field(R.tray.search, D)).setValue("Transferencia");
      await $(D).$('input[type="radio"]').click();
    },
  });

  step("vinculado", {
    title: "Vinculados a mano",
    caption: "El filtro «Vinculados a mano» muestra los tests que vinculaste; «Desvincular» deshace el vínculo.",
    toast: true,
    covers: ["action:tray-filter", "action:tray-unlink"],
    run: async () => {
      await clickButton(R.tray.link, D);
      await waitForText(R.tray.linkedToast);
      await $(`button.chips__chip*=${R.tray.filterMapped}`).click();
      await expect($(`button=${R.tray.unlink}`)).toBeDisplayed();
    },
  });

  step("desvincular", {
    title: "Desvincular",
    caption: "«Desvincular» devuelve el test a la bandeja («Vínculo retirado»).",
    shot: false,
    run: async () => {
      await clickButton(R.tray.unlink);
      await waitForText(R.tray.unlinkedToast);
      await $(`button.chips__chip*=${R.tray.filterUnlinked}`).click();
    },
  });
});
