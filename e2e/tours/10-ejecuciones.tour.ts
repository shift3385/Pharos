// Chapter 10 — Ejecuciones e importación de resultados (manual v2, MAN-03):
// the run list, importing the reports of the automation of «Pharos» (the ING-01
// Playwright JUnit sample and a JUnit with the capture of a failure, into the
// cycle of chapter 9), the «Sin vincular» tray (link a test to a case, unlink
// it, filter), the list on a phone, and findings and metrics (ING-06): a
// Trivy SARIF and a k6 summary, the run's «Hallazgos» and «Métricas» tabs and
// the triage of a finding.
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { DESKTOP, MOBILE, chapter, setViewport, step } from "./tour";
import {
  PROJECT_A,
  acceptConfirm,
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
  waitForToast,
  chooseOption,
} from "./helpers";
import { RELEASE } from "./data/pharos";

const R = es.runs;
const D = '[role="dialog"]';
/** The ING-01 sample: a Playwright (playwright-bdd) JUnit report with a
 *  failed example and a retry (packages/formats/src/fixtures). */
const REPORT = join(repoDir, "packages", "formats", "src", "fixtures", "ing01", "single", "pw-junit.xml");
/** Real SARIF and k6 samples of ING-06 (packages/formats/src/fixtures/*). */
const SARIF = join(repoDir, "packages", "formats", "src", "fixtures", "sarif", "trivy-misconfig.sarif");
const K6 = join(repoDir, "packages", "formats", "src", "fixtures", "k6", "handle-summary.json");
const F = es.findings;
/** The run key the import summary names (`RUN-012`). */
async function importedRunKey(): Promise<string> {
  const text = await $(".rn-done").getText();
  const key = /[A-Z][A-Z0-9]*-\d+/.exec(text)?.[0];
  if (!key) throw new Error(`no run key in: ${text}`);
  return key;
}

chapter("ejecuciones", () => {
  step("lista", {
    title: "Ejecuciones",
    caption:
      "Un run es una ejecución concreta de pruebas: manual, creada al ejecutar un ciclo, o importada de tu automatización. Pulsa «Ejecuciones» en el menú lateral. La pestaña «Runs» lista los runs con su clave, su título, su origen y su build, su estado (en curso, completado o cancelado), sus resultados (pasan, fallan, otros, sin vincular) y su inicio; en este ejemplo, los dos runs del ciclo «Regresión 0.3.0», todavía sin resultados. «Sin vincular» reúne los tests importados que esperan un caso. Arriba, «Informe de estado», «Importar informe» y «Nuevo run manual» (capítulo 11).",
    covers: ["section:runs", "state:runs-empty"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("runs");
      await expect($('[data-testid="tab-runs"]')).toBeDisplayed();
    },
  });

  step("importar", {
    title: "Importar un informe",
    caption:
      "«Importar informe» trae a Pharos los resultados de tu automatización: Cucumber Messages (NDJSON), CTRF, JUnit XML, JSON de Playwright o Pharos Run JSON, hasta 200 MB (50 MB si es JSON o XML). El formato se detecta por el contenido. Al elegir el archivo, Pharos rellena el título, la build, el commit, la rama y el entorno con lo que trae el informe; corrígelos si hace falta. En este ejemplo, el JUnit de la regresión nocturna de Pharos con Playwright. Solo en la app de escritorio.",
    covers: ["dialogs:src/modules/runs/ui/ImportReportDialog.tsx", "upload:src/modules/runs/ui/ImportReportDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(R.import.open);
      await expect(dialog()).toBeDisplayed();
      await $(D).$('input[type="file"]:not([webkitdirectory])').setValue(REPORT);
      await waitForText(R.format.junit);
      await (await field(R.field.title, D)).setValue("Regresión automática · nightly 2026-11-03");
      await (await field(R.field.build, D)).setValue(RELEASE.build);
      await (await field(R.field.environment, D)).setValue("staging");
    },
  });

  step("vista-previa", {
    title: "Vista previa antes de importar",
    caption:
      "La vista previa dice cuántos tests e intentos trae el informe, cuántos se vinculan a un caso y cuántos quedarán «sin vincular», con los avisos que haya. Un test se vincula solo si lleva la clave de un caso: en Cucumber, Playwright o CTRF, como tag (@PH-001); en JUnit, con la propiedad test_id. Este informe no la lleva, así que sus 4 tests irán a la bandeja. Nada se guarda hasta pulsar «Importar». Si el archivo ya se importó, Pharos lo dice y no duplica nada.",
    shot: { element: D },
    run: async () => {
      await $(D).$(`[aria-label="${R.import.preview}"]`).scrollIntoView();
      await expect(dialog()).toHaveText(expect.stringContaining("tests"));
    },
  });

  step("importado", {
    title: "Informe importado",
    caption: "Al terminar, el resumen dice qué run se creó, cuántos resultados se importaron y cuántos quedan sin vincular. El run aparece en la lista como «Importado», con sus resultados. El filtro «Importados» deja solo los runs que vienen de un informe.",
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
    caption:
      "Si el informe enlaza capturas, vídeos o trazas por su ruta, Pharos pide la «Carpeta de adjuntos» (por ejemplo, test-results): busca cada archivo por su nombre y lo guarda, cifrado, como evidencia del resultado. En este ejemplo, un JUnit de dos tests de acceso, vinculados a PH-001 y PH-002 por su test_id, con la captura de un fallo. «Ciclo» hace que el run nuevo sea del ciclo «Regresión 0.3.0»: sus resultados cuentan en el progreso del ciclo sin editar nada después (los ciclos cerrados no se ofrecen). «Run abierto» añade los resultados a un run en curso, para los shards de una misma ejecución.",
    covers: ["action:import-attachments-folder", "action:import-into-cycle"],
    shot: { element: D },
    run: async () => {
      await clickButton(R.import.open);
      await expect(dialog()).toBeDisplayed();
      await $(D).$('input[type="file"]:not([webkitdirectory])').setValue(join(fixturesDir, "informe-adjuntos", "junit.xml"));
      await waitForText(R.format.junit);
      // msedgedriver uploads a whole folder into a webkitdirectory input.
      await $(D).$('input[type="file"][webkitdirectory]').setValue(join(fixturesDir, "informe-adjuntos", "capturas"));
      await (await field(R.field.title, D)).setValue("Tests de acceso · con capturas");
      await (await field(R.field.build, D)).setValue(RELEASE.build);
      await (await field(R.field.environment, D)).setValue("staging");
      // The cycle of chapter 7 (CYC-02): the first option after «Sin ciclo».
      const cycle = $(D).$('[data-testid="import-cycle"]');
      await chooseOption(cycle, { index: 1 });
      await waitForText(tf("runs.import.attachments_one", { count: 1 }));
    },
  });

  step("con-adjuntos-hecho", {
    title: "Adjuntos guardados",
    caption: "El resumen confirma cuántos resultados se importaron, que ninguno quedó sin vincular y cuántos adjuntos se guardaron como evidencia (o cuáles no se encontraron en la carpeta).",
    shot: false,
    run: async () => {
      await clickButton(R.import.confirm, D);
      await $(".rn-done").waitForDisplayed({ timeout: 60_000 });
      await expect($(".rn-done")).toHaveText(expect.stringContaining(tf("runs.import.done.attached_one", { count: 1 })));
      // Both tests carry the `test_id` property (PH-001, PH-002): none goes to the tray.
      await expect($(".rn-done")).toHaveText(expect.stringContaining(", 0 sin vincular"));
      await clickButton(es.common.close, D);
    },
  });

  step("sin-vincular", {
    title: "La bandeja «Sin vincular»",
    caption:
      "Los tests importados sin la clave de un caso del proyecto esperan en «Sin vincular» (la pestaña dice cuántos), con el motivo («Sin etiqueta de caso», «Dos etiquetas de caso», «PH-099 no es un caso del proyecto»…), su último estado, cuántos resultados tienen y su último run. Hasta que los vincules no cuentan para ningún caso, ni en el progreso ni en la matriz. Solo en la app de escritorio.",
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
    caption: "«Vincular…» abre el buscador de casos: busca por clave o título (en este ejemplo, «Iniciar sesión»), elige el caso y pulsa «Vincular». Desde ese momento, todos sus resultados, pasados y futuros, cuentan para el caso; los resultados en sí no cambian.",
    covers: ["dialogs:src/modules/runs/ui/LinkCaseDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await $(`button=${R.tray.linkAction}`).click();
      await expect(dialog()).toBeDisplayed();
      await (await field(R.tray.search, D)).setValue("Iniciar sesión");
      await $(D).$('input[type="radio"]').click();
    },
  });

  step("vinculado", {
    title: "Vinculados a mano",
    caption:
      "El aviso confirma el vínculo («Test vinculado: sus resultados cuentan para el caso.»). El filtro «Vinculados a mano» muestra los tests que vinculaste, con su caso, para revisarlos; «Todos» enseña también los demás. «Desvincular» deshace el vínculo si te equivocaste.",
    toast: true,
    covers: ["action:tray-filter", "action:tray-unlink"],
    run: async () => {
      await clickButton(R.tray.link, D);
      await waitForToast(R.tray.linkedToast);
      await $(`button.chips__chip*=${R.tray.filterMapped}`).click();
      await expect($(`button=${R.tray.unlink}`)).toBeDisplayed();
    },
  });

  step("desvincular", {
    title: "Desvincular",
    covers: ["dialogs:src/modules/runs/ui/UnlinkedTray.tsx"],
    caption: "«Desvincular» pregunta antes: sus resultados, pasados y futuros, dejan de contar para el caso y el test vuelve a la bandeja («Vínculo retirado.»). Los resultados no cambian; si te equivocas, vuelve a vincularlo. Esc o «Cancelar» lo dejan como estaba.",
    shot: false,
    run: async () => {
      await clickButton(R.tray.unlink);
      await acceptConfirm(R.tray.unlinkTitle.replace("{{name}}", "").slice(0, 12));
      await waitForToast(R.tray.unlinkedToast);
      await $(`button.chips__chip*=${R.tray.filterUnlinked}`).click();
    },
  });
  step("movil", {
    title: "Las ejecuciones en el móvil",
    caption:
      "En el móvil, cada run es una tarjeta con su clave, su estado, su título y sus resultados; un toque lo abre. «Informe de estado», «Importar informe» y «Nuevo run manual» quedan en la fila de botones de la sección.",
    covers: ["platform:mobile-runs"],
    run: async () => {
      await $(`button.chips__chip*=${R.tray.filterUnlinked}`).waitForDisplayed();
      await $('[data-testid="tab-runs"]').click();
      await setViewport(MOBILE);
      await expect($(".rn-card")).toBeDisplayed();
    },
    after: async () => {
      await setViewport(DESKTOP);
    },
  });

  step("importar-sarif", {
    title: "Importar hallazgos de seguridad (SARIF)",
    caption:
      "«Importar informe» también lee un SARIF (Semgrep, Trivy, ZAP, CodeQL, ESLint…), un informe de axe o el resumen de k6. No traen tests sino hallazgos o métricas, y la vista previa los cuenta: aquí, Trivy encontró dos problemas en el Dockerfile del servidor, uno de severidad alta (la imagen se ejecuta como root) y otro baja (no tiene HEALTHCHECK).",
    shot: { element: D },
    run: async () => {
      await openSection("runs");
      await clickButton(R.import.open);
      await expect(dialog()).toBeDisplayed();
      await $(D).$('input[type="file"]:not([webkitdirectory])').setValue(SARIF);
      await waitForText(R.format.sarif);
      await (await field(R.field.title, D)).setValue("Análisis Trivy · imagen del servidor");
      await $('[data-testid="import-preview-findings"]').waitForDisplayed({ timeout: 30_000 });
      await expect($('[data-testid="import-preview-findings"]')).toHaveText(
        expect.stringContaining(tf("findings.preview.findings_other", { count: 2 })),
      );
    },
  });

  let sarifRun = "";
  step("hallazgos", {
    title: "Los hallazgos de un run",
    caption:
      "En el run aparecen las pestañas «Hallazgos» y «Métricas» cuando hay algo que mostrar. «Hallazgos» los agrupa por regla, con su severidad, su ubicación (archivo y línea, o página y elemento) y sus referencias (CWE, WCAG…). «Nuevo» marca los que no estaban en el run anterior de la misma herramienta. Los filtros dejan ver solo una severidad, los abiertos, los que esperan revisión («A revisar») o los ya triajados.",
    covers: ["tabs:src/modules/runs/ui/RunDetail.tsx"],
    run: async () => {
      await clickButton(R.import.confirm, D);
      await $(".rn-done").waitForDisplayed({ timeout: 60_000 });
      sarifRun = await importedRunKey();
      await clickButton(es.common.close, D);
      await $(`[data-testid="run-row-${sarifRun}"]`).click();
      await $(`[role="tab"]*=${F.tabs.findings}`).click();
      await $('[data-testid="findings-panel"]').waitForDisplayed();
      await browser.waitUntil(async () => (await $$('[data-testid="finding"]')).length === 2, {
        timeoutMsg: "the two Trivy findings are not listed",
      });
      // Every group open, for the picture.
      for (const g of await $$('[data-testid="finding-rule"]')) {
        if ((await g.getAttribute("open")) === null) await g.$("summary").click();
      }
    },
  });

  step("triaje", {
    title: "Triaje de un hallazgo",
    caption:
      "«Triaje» decide qué hacer con un hallazgo: falso positivo, riesgo aceptado o corregido, siempre con un motivo, o reabrirlo. La decisión vale para ese hallazgo en todos los runs del proyecto, así que el próximo análisis llega ya triajado, y las decisiones anteriores quedan en su historial. Aquí se acepta el riesgo de no tener HEALTHCHECK hasta la versión 0.7.0.",
    covers: ["dialogs:src/modules/runs/ui/TriageDialog.tsx"],
    shot: { element: D },
    run: async () => {
      const low = await $(".fd-rule*=DS026");
      await low.$('[data-testid="finding-triage"]').click();
      await expect(dialog()).toBeDisplayed();
      await $(D).$('[data-testid="triage-accepted_risk"] input').click();
      await $(D).$('[data-testid="triage-reason"]').setValue("El orquestador ya comprueba /health; se añade en 0.7.0.");
    },
  });

  step("triaje-hecho", {
    title: "Hallazgo triajado",
    caption:
      "Al guardar, el hallazgo sale de «Abiertos» (ya no cuenta en la matriz ni en el informe) y aparece en «Triajados» con su estado.",
    shot: false,
    run: async () => {
      await $(D).$('[data-testid="triage-save"]').click();
      await $(D).waitForDisplayed({ reverse: true });
      await browser.waitUntil(async () => (await $$('[data-testid="finding"]')).length === 1, {
        timeoutMsg: "the triaged finding is still listed as open",
      });
      await $(`button.chips__chip*=${F.standing.triaged}`).click();
      await waitForText(F.triageState.accepted_risk);
    },
  });

  step("metricas", {
    title: "Las métricas de una prueba de carga (k6)",
    caption:
      "El resumen de k6 trae métricas: cada una con su agregación (p95, media, tasa…), su valor y su umbral, si lo tiene. «Métricas» pone primero los umbrales incumplidos (aquí, peticiones fallidas por encima del 0,01 %), luego el resumen de cada métrica (con «Ver todas», cada agregación) y aparte los checks de k6. Un umbral incumplido de una métrica vinculada a un caso lo marca como fallido.",
    run: async () => {
      await openSection("runs");
      await clickButton(R.import.open);
      await expect(dialog()).toBeDisplayed();
      await $(D).$('input[type="file"]:not([webkitdirectory])').setValue(K6);
      await waitForText(R.format.k6);
      await (await field(R.field.title, D)).setValue("Carga · API de Pharos, 5 usuarios");
      await $('[data-testid="import-preview-metrics"]').waitForDisplayed({ timeout: 30_000 });
      await clickButton(R.import.confirm, D);
      await $(".rn-done").waitForDisplayed({ timeout: 60_000 });
      const k6Run = await importedRunKey();
      await clickButton(es.common.close, D);
      await $(`[data-testid="run-row-${k6Run}"]`).click();
      await $(`[role="tab"]*=${F.tabs.metrics}`).click();
      await $('[data-testid="metrics-thresholds"]').waitForDisplayed();
      await expect($('[data-testid="metrics-thresholds"]')).toHaveText(
        expect.stringContaining(tf("findings.metric.thresholdsMet", { passed: 3, total: 4 })),
      );
    },
  });
});
