// Chapter 10 — Ejecuciones e importación de resultados (manual v2, MAN-03):
// the run list, importing the reports of the automation of «Pharos» (the ING-01
// Playwright JUnit sample and a JUnit with the capture of a failure, into the
// cycle of chapter 9), the «Sin vincular» tray (link a test to a case, unlink
// it, filter), a JUnit with `example_row` for the dataset case of chapter 8,
// the previews of an Allure .zip and a .NET TRX, and findings and metrics
// (ING-06): a Semgrep SARIF of the server with its triage, the axe audit of a
// Pharos dialog and a k6 load test, the run's «Hallazgos» and «Métricas» tabs,
// the counters of the run list and the list on a phone.
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { DESKTOP, MOBILE, chapter, setViewport, step } from "./tour";
import {
  PROJECT_A,
  acceptConfirm,
  byTestId,
  clickButton,
  dialog,
  es,
  field,
  fixturesDir,
  openProject,
  openSection,
  openInfoTip,
  scrollToTop,
  tf,
  waitForText,
  waitForToast,
  chooseOption,
} from "./helpers";
import { AXE_REPORT, pharosFixtures } from "./prepare";
import { LIBRARY, RELEASE, RESULTS, SCANS } from "./data/pharos";

const R = es.runs;
const D = '[role="dialog"]';
const INFORMES = join(pharosFixtures, "informes");
/** The ING-01 sample (packages/formats/src/fixtures/ing01/single/pw-junit.xml):
 *  a Playwright (playwright-bdd) JUnit report with a failed example and a
 *  retry, with its test names in proper Spanish. */
const REPORT = join(INFORMES, "regresion-nocturna.junit.xml");
const F = es.findings;

/** The run key the import summary names (`RUN-012`). */
async function importedRunKey(): Promise<string> {
  const text = await $(".rn-done").getText();
  const key = /[A-Z][A-Z0-9]*-\d+/.exec(text)?.[0];
  if (!key) throw new Error(`no run key in: ${text}`);
  return key;
}

/** «Importar informe»: the dialog open, no file chosen yet. */
async function openImport() {
  await openSection("runs");
  await clickButton(R.import.open);
  await expect(dialog()).toBeDisplayed();
}

/** A file in the open import dialog → its format detected and the preview ready. */
async function pickReport(file: string, format: string) {
  await $(D).$('input[type="file"]:not([webkitdirectory])').setValue(file);
  await waitForText(format);
  await browser.waitUntil(async () => $(D).$(`button=${R.import.confirm}`).isEnabled(), {
    timeout: 30_000,
    timeoutMsg: `the preview of ${file} never got ready`,
  });
}

/** «Importar informe» → a file → its format detected and the preview ready. */
async function chooseReport(file: string, format: string) {
  await openImport();
  await pickReport(file, format);
}

/** «Importar» → the summary → «Cerrar» → the new run opened. */
async function importAndOpen(): Promise<string> {
  await clickButton(R.import.confirm, D);
  await $(".rn-done").waitForDisplayed({ timeout: 60_000 });
  const key = await importedRunKey();
  await clickButton(es.common.close, D);
  await $(`[data-testid="run-row-${key}"]`).click();
  await browser.waitUntil(async () => /\/runs\/[^/?]+/.test(await browser.getUrl()), { timeoutMsg: "the run screen did not open" });
  return key;
}

/** Closes the import dialog without importing anything. */
async function cancelImport() {
  await browser.keys("Escape");
  await $(D).waitForExist({ reverse: true });
}

chapter("ejecuciones", () => {
  step("lista", {
    title: "Ejecuciones",
    caption:
      "Un run es una ejecución concreta de pruebas: manual, creada al ejecutar un ciclo, o importada de tu automatización. Pulsa «Ejecuciones» en el menú lateral. La pestaña «Runs» lista los runs con su clave, su título, su origen y su build, su estado (en curso, completado o cancelado), sus resultados (pasan, fallan, otros, sin vincular) y su inicio; en este ejemplo, los dos runs del ciclo «Regresión 0.6.0», todavía sin resultados. «Sin vincular» reúne los tests importados que esperan un caso. Arriba, «Informe de estado», «Importar informe» y «Nuevo run manual» (capítulo 11). Los runs que sube tu CI con `pharos upload` o «Conectar CI» (capítulo 20) aparecen aquí solos.",
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
      "«Importar informe» trae a Pharos los resultados de tu automatización: tests, hallazgos y métricas. La lista de formatos está tras el «?» del campo «Informe»: los tests de JUnit XML, CTRF, JSON de Playwright, Cucumber Messages (NDJSON), Pharos Run JSON, .NET (TRX), Allure (la carpeta `allure-results` comprimida en un .zip) y Xcode (el JSON de `xcresulttool`); los hallazgos de SARIF y axe, y las métricas del resumen de k6. Admite hasta 200 MB (50 MB si es JSON o XML). Solo en la app de escritorio.",
    covers: ["dialogs:src/modules/runs/ui/ImportReportDialog.tsx", "upload:src/modules/runs/ui/ImportReportDialog.tsx"],
    focus: ".infotip__bubble:not([hidden])",
    run: async () => {
      await openImport();
      await openInfoTip("Informe", D);
    },
  });

  step("vista-previa", {
    title: "Vista previa antes de importar",
    caption:
      "Pulsa «Elegir archivo…»: el formato se detecta por el contenido, y Pharos rellena el título, la build, el commit, la rama y el entorno con lo que trae el informe; corrígelos si hace falta. En este ejemplo, el JUnit de la regresión nocturna de Pharos con Playwright. Abajo, la vista previa dice cuántos tests trae el informe y en cuántos intentos, y cuántos de esos intentos se vinculan a un caso y cuántos quedarán «sin vincular», con los avisos que haya. Un test se vincula solo si lleva la clave de un caso: en Cucumber, Playwright o CTRF, como tag (@PH-001); en JUnit, con la propiedad test_id; en TRX, con su categoría ([TestCategory(\"PH-001\")]); en Allure, con la etiqueta `tag` o un enlace `tms`. Este informe no la lleva, así que sus 4 tests irán a la bandeja. Nada se guarda hasta pulsar «Importar». Si el archivo ya se importó, Pharos lo dice y no duplica nada.",
    shot: { element: D },
    focus: `${D} [aria-label="${R.import.preview}"]`,
    run: async () => {
      // A click elsewhere closes the tip of the previous step.
      await $(D).$(".cd__title").click();
      await $(".infotip__bubble:not([hidden])").waitForExist({ reverse: true });
      await pickReport(REPORT, R.format.junit);
      await (await field(R.field.title, D)).setValue("Regresión nocturna · Playwright");
      await (await field(R.field.build, D)).setValue(RELEASE.build);
      await (await field(R.field.environment, D)).setValue(RELEASE.environment);
      await $(D).$(`[aria-label="${R.import.preview}"]`).scrollIntoView({ block: "center" });
      await expect(dialog()).toHaveText(expect.stringContaining("tests"));
    },
  });

  step("importado", {
    title: "Informe importado",
    caption:
      "Al terminar, el resumen dice qué run se creó, cuántos resultados se importaron y cuántos quedan sin vincular; si el informe nombra adjuntos y no elegiste la «Carpeta de adjuntos», avisa de que no se guardaron (aquí, sus 3 capturas). Al cerrarlo, el run aparece en la lista como «Importado», con sus resultados; el filtro «Importados» deja solo los runs que vienen de un informe.",
    covers: ["action:runs-filter"],
    shot: { element: D },
    run: async () => {
      await clickButton(R.import.confirm, D);
      await $(".rn-done").waitForDisplayed({ timeout: 60_000 });
    },
    after: async () => {
      await clickButton(es.common.close, D);
      await $(`button.chips__chip*=${R.list.imported}`).click();
      await browser.waitUntil(async () => (await $$("tr.dt__row")).length >= 1, { timeoutMsg: "the imported run is not listed" });
      await $(`button.chips__chip*=${R.list.all}`).click();
    },
  });

  step("con-adjuntos", {
    title: "Un informe con adjuntos",
    caption:
      "Si el informe enlaza capturas, vídeos o trazas por su ruta, Pharos pide la «Carpeta de adjuntos» (por ejemplo, test-results): busca cada archivo por su nombre y lo guarda, cifrado, como evidencia del resultado. En este ejemplo, un JUnit de dos tests de acceso, vinculados a PH-001 y PH-002 por su test_id, con la captura de un fallo. «Ciclo» hace que el run nuevo sea del ciclo «Regresión 0.6.0»: sus resultados cuentan en el progreso del ciclo sin editar nada después (los ciclos cerrados no se ofrecen). «Run abierto» añade los resultados a un run en curso, para los shards de una misma ejecución.",
    covers: ["action:import-attachments-folder", "action:import-into-cycle"],
    shot: { element: D },
    focus: ["button*=Elegir carpeta", '[data-testid="import-cycle"]'],
    run: async () => {
      await chooseReport(join(fixturesDir, "informe-adjuntos", "junit.xml"), R.format.junit);
      // msedgedriver uploads a whole folder into a webkitdirectory input.
      await $(D).$('input[type="file"][webkitdirectory]').setValue(join(fixturesDir, "informe-adjuntos", "capturas"));
      await (await field(R.field.title, D)).setValue(RESULTS.title);
      await (await field(R.field.build, D)).setValue(RESULTS.build);
      await (await field(R.field.environment, D)).setValue(RESULTS.environment);
      // The cycle of chapter 9: the first option after «Sin ciclo».
      const cycle = $(D).$('[data-testid="import-cycle"]');
      await chooseOption(cycle, { index: 1 });
      await waitForText(tf("runs.import.attachments_one", { count: 1 }));
      // From the top of the dialog: the folder and the cycle, above the preview.
      await scrollToTop(`${D} .cd__title`);
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
      await browser.waitUntil(async () => (await $$(`button*=${R.tray.linkAction}`)).length >= 4, {
        timeoutMsg: "the ING-01 sample should leave 4 tests unlinked",
      });
    },
  });

  step("vincular", {
    title: "Vincular un test a un caso",
    caption:
      "«Vincular…» abre el buscador de casos: busca por clave o título (en este ejemplo, el test «Login con credenciales válidas» de la regresión nocturna es el caso «Iniciar sesión con credenciales válidas»), elige el caso y pulsa «Vincular». Desde ese momento, todos sus resultados, pasados y futuros, cuentan para el caso; los resultados en sí no cambian.",
    covers: ["dialogs:src/modules/runs/ui/LinkCaseDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await $(`//button[contains(., ${JSON.stringify(R.tray.linkAction)}) and contains(., "Login con credenciales válidas")]`).click();
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
      await expect($(`button*=${R.tray.unlink}`)).toBeDisplayed();
    },
  });

  step("desvincular", {
    title: "Desvincular",
    covers: ["dialogs:src/modules/runs/ui/UnlinkedTray.tsx"],
    caption:
      "«Desvincular» pregunta antes: sus resultados, pasados y futuros, dejan de contar para el caso y el test vuelve a la bandeja («Vínculo retirado.»). Los resultados no cambian; si te equivocas, vuelve a vincularlo. Esc o «Cancelar» lo dejan como estaba.",
    shot: false,
    run: async () => {
      await $(`button*=${R.tray.unlink}`).click();
      await acceptConfirm(R.tray.unlinkTitle.replace("{{name}}", "").slice(0, 12));
      await waitForToast(R.tray.unlinkedToast);
      await $(`button.chips__chip*=${R.tray.filterUnlinked}`).click();
      await $('[data-testid="tab-runs"]').click();
    },
  });

  let datasetRun = "";
  step("filas-dataset", {
    title: "Resultados por fila del dataset",
    caption:
      `Un caso con dataset (capítulo 8) se ejecuta una vez por fila. Si lo automatizas sin Cucumber, di qué fila ejecutó cada test con la propiedad \`example_row\` (en JUnit, \`<property name="example_row" value="2"/>\`; en CTRF, \`extra.exampleRow\`; en Playwright, la anotación \`example_row\`), contando desde 1. En este ejemplo, los tres tests de «${LIBRARY.case.title}» (${LIBRARY.case.key}) llevan su fila: en la lista, el run nuevo cuenta dos que pasan y uno que falla, el de la tercera cuenta, cada uno en su fila del caso. La matriz de trazabilidad (capítulo 13) cuenta el caso por sus filas.`,
    run: async () => {
      await chooseReport(join(INFORMES, SCANS.datasetJunit.file), R.format.junit);
      await (await field(R.field.title, D)).setValue(SCANS.datasetJunit.title);
      await (await field(R.field.build, D)).setValue(RELEASE.build);
      await clickButton(R.import.confirm, D);
      await $(".rn-done").waitForDisplayed({ timeout: 60_000 });
      datasetRun = await importedRunKey();
      // Every test found its case: none waits in the tray.
      await expect($(".rn-done")).toHaveText(expect.stringContaining(", 0 sin vincular"));
      await clickButton(es.common.close, D);
      await $(`[data-testid="run-row-${datasetRun}"]`).waitForDisplayed();
    },
  });

  step("run-importado", {
    title: "Los resultados de un run importado",
    caption: `Un clic en la clave de un run importado abre su pantalla, con los resultados que trajo el informe: cada test con su caso (clave y título) y, si la tiene, su fila del dataset, o «Sin vincular» si no tiene caso; su estado y sus intentos. El progreso los cuenta como ejecutados («3/3 ejecutados») y los filtros de arriba los separan por estado. Un run importado no ofrece «Añadir casos»: sus resultados vienen del informe; «Reabrir» lo deja en curso para añadirle más informes con «Run abierto». Aquí, el run de «${LIBRARY.case.title}», con sus tres filas.`,
    covers: ["screen:run-imported-results"],
    run: async () => {
      await $(`[data-testid="run-row-${datasetRun}"]`).click();
      await browser.waitUntil(async () => (await $$('[data-testid="run-imported-result"]')).length === 3, {
        timeout: 20_000,
        timeoutMsg: "the imported run does not list its three results",
      });
      await expect(byTestId("run-add-cases")).not.toBeExisting();
      await waitForText(tf("execution.run.progress", { executed: 3, total: 3 }));
    },
  });

  step("allure", {
    title: "Importar resultados de Allure (.zip)",
    caption:
      "De Allure, comprime la carpeta `allure-results` y elige el .zip. Los reintentos son intentos del mismo test: uno que pasa tras fallar queda *flaky*. La etiqueta `tag` (`@PH-001`) o un enlace `tms` vinculan el test a su caso, y sus adjuntos se guardan como evidencias. En este ejemplo, los tests de acceso de Pharos con Allure: la vista previa cuenta 2 tests en 3 intentos, los 3 vinculados a su caso, y 1 adjunto.",
    shot: { element: D },
    run: async () => {
      await chooseReport(join(INFORMES, SCANS.allure.file), R.format.allure);
      await $(D).$(`[aria-label="${R.import.preview}"]`).scrollIntoView({ block: "center" });
    },
    after: cancelImport,
  });

  step("trx", {
    title: "Importar un TRX de .NET",
    caption:
      "Un TRX (`dotnet test --logger trx`, también de NUnit y xUnit) vincula cada test por su categoría: `[TestCategory(\"PH-001\")]` en MSTest, `[Category]` en NUnit. En este ejemplo, las pruebas .NET de la API v1 de Pharos llevan las categorías API-001 a API-003, claves del proyecto «API de sincronización», así que en «Pharos» la vista previa las deja sin vincular: se importan en el proyecto al que pertenecen. Para Xcode, exporta el JSON con `xcrun xcresulttool get test-results tests`; sus tests se vinculan desde la bandeja «Sin vincular».",
    shot: { element: D },
    run: async () => {
      await chooseReport(join(INFORMES, SCANS.trx.file), R.format.trx);
      await $(D).$(`[aria-label="${R.import.preview}"]`).scrollIntoView({ block: "center" });
    },
    after: cancelImport,
  });

  step("importar-sarif", {
    title: "Importar hallazgos de seguridad (SARIF)",
    caption:
      "Un SARIF (Semgrep, Trivy, ZAP, CodeQL, ESLint…), un informe de axe o el resumen de k6 no traen tests, sino hallazgos o métricas, y la vista previa los cuenta. En este ejemplo, Semgrep analizó el servidor de Pharos y encontró dos problemas: uno de severidad media, que la respuesta de /auth/login delata si un correo tiene cuenta, y otro bajo, una cadena de formato construida con una variable. El primero lleva el tag @PH-002: la matriz de trazabilidad (capítulo 13) lo cuenta en el caso «Rechazar credenciales no válidas».",
    shot: { element: D },
    run: async () => {
      await chooseReport(join(INFORMES, SCANS.sarif.file), R.format.sarif);
      await (await field(R.field.title, D)).setValue(SCANS.sarif.title);
      await $('[data-testid="import-preview-findings"]').waitForDisplayed({ timeout: 30_000 });
      await expect($('[data-testid="import-preview-findings"]')).toHaveText(
        expect.stringContaining(tf("findings.preview.findings_other", { count: 2 })),
      );
      await $('[data-testid="import-preview-findings"]').scrollIntoView({ block: "center" });
    },
  });

  step("hallazgos", {
    title: "Los hallazgos de un run",
    caption:
      "En el run aparecen las pestañas «Hallazgos» y «Métricas» cuando hay algo que mostrar. «Hallazgos» los agrupa por regla, con su severidad, su ubicación (archivo y línea, o página y elemento) y sus referencias (CWE, WCAG…). «Nuevo» marca los que no estaban en el run anterior de la misma herramienta. Los filtros dejan ver solo una severidad, los abiertos, los que esperan revisión («A revisar») o los ya triados.",
    covers: ["tabs:src/modules/runs/ui/RunDetail.tsx"],
    run: async () => {
      await importAndOpen();
      await $(`[role="tab"]*=${F.tabs.findings}`).click();
      await $('[data-testid="findings-panel"]').waitForDisplayed();
      await browser.waitUntil(async () => (await $$('[data-testid="finding"]')).length === 2, {
        timeoutMsg: "the two Semgrep findings are not listed",
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
      "«Triaje» decide qué hacer con un hallazgo: falso positivo, riesgo aceptado o corregido, siempre con un motivo, o reabrirlo. La decisión vale para ese hallazgo en todos los runs del proyecto, así que el próximo análisis llega ya triado, y las decisiones anteriores quedan en su historial. En este ejemplo, Liomar marca como falso positivo la cadena de formato: es una constante del módulo y no viene de la petición.",
    covers: ["dialogs:src/modules/runs/ui/TriageDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await $(`.fd-rule*=${SCANS.sarif.triagedRule}`).$('[data-testid="finding-triage"]').click();
      await expect(dialog()).toBeDisplayed();
      await $(D).$('[data-testid="triage-false_positive"] input').click();
      await $(D).$('[data-testid="triage-reason"]').setValue(SCANS.sarif.triageReason);
    },
  });

  step("triaje-hecho", {
    title: "Hallazgo triado",
    caption:
      "Al guardar, el hallazgo sale de «Abiertos» (ya no cuenta en la matriz ni en los informes) y aparece en «Triados» con su estado.",
    shot: false,
    run: async () => {
      await $(D).$('[data-testid="triage-save"]').click();
      await $(D).waitForDisplayed({ reverse: true });
      await browser.waitUntil(async () => (await $$('[data-testid="finding"]')).length === 1, {
        timeoutMsg: "the triaged finding is still listed as open",
      });
      await $(`button.chips__chip*=${F.standing.triaged}`).click();
      await waitForText(F.triageState.false_positive);
    },
  });

  step("axe", {
    title: "Importar un informe de accesibilidad (axe)",
    caption:
      "Un informe de axe (axe-core, @axe-core/playwright…) trae las reglas de accesibilidad incumplidas en cada página, con su nivel WCAG. En este ejemplo, la auditoría del diálogo «Nuevo requisito» de Pharos trae una infracción de severidad alta, la página sin título (`document-title`), y una regla «A revisar», el contraste de color: axe no pudo decidirla, así que no cuenta como abierta hasta que alguien la mire y decida en «Triaje».",
    run: async () => {
      await chooseReport(AXE_REPORT, R.format.axe);
      await (await field(R.field.title, D)).setValue(SCANS.axe.title);
      await importAndOpen();
      await $(`[role="tab"]*=${F.tabs.findings}`).click();
      await $('[data-testid="findings-panel"]').waitForDisplayed();
      await $(`button.chips__chip*=${F.standing.all}`).click();
      await browser.waitUntil(async () => (await $$('[data-testid="finding"]')).length >= 2, {
        timeoutMsg: "the axe findings are not listed",
      });
    },
  });

  step("metricas", {
    title: "Las métricas de una prueba de carga (k6)",
    caption:
      "El resumen de k6 trae métricas: cada una con su agregación (p95, media, tasa…), su valor y su umbral, si lo tiene. «Métricas» pone primero los umbrales incumplidos (en este ejemplo, cinco usuarios contra la API de Pharos durante un minuto, con las peticiones fallidas por encima del 1 %), luego el resumen de cada métrica (con «Ver todas», cada agregación) y aparte los checks de k6. La métrica de entrar lleva `{case:PH-001}` y su check, `@PH-001`: un umbral incumplido de una métrica vinculada a un caso lo marca como fallido.",
    run: async () => {
      await chooseReport(join(INFORMES, SCANS.k6.file), R.format.k6);
      await (await field(R.field.title, D)).setValue(SCANS.k6.title);
      await $('[data-testid="import-preview-metrics"]').waitForDisplayed({ timeout: 30_000 });
      await importAndOpen();
      await $(`[role="tab"]*=${F.tabs.metrics}`).click();
      await $('[data-testid="metrics-thresholds"]').waitForDisplayed();
      await expect($('[data-testid="metrics-thresholds"]')).toHaveText(
        expect.stringContaining(tf("findings.metric.thresholdsMet", { passed: 3, total: 4 })),
      );
      // The thresholds line on top, down to «Ver todas» and the k6 checks.
      await scrollToTop('[data-testid="metrics-panel"]');
    },
  });

  step("hallazgos-lista", {
    title: "Hallazgos en la lista de runs",
    caption:
      "La lista de runs marca cada análisis con sus hallazgos abiertos, en el color del peor, y cada prueba de carga con sus umbrales incumplidos; un run que solo trae hallazgos o métricas ya no dice «Sin resultados». Fuera del run cuenta el último análisis de cada herramienta: lo que ya no aparece en él se da por corregido.",
    // The three runs on top: the k6 load test and the two analyses.
    focus: '[data-testid="runs-list"] tr.dt__row:nth-child(-n+3)',
    run: async () => {
      await openSection("runs");
      await waitForText(tf("runs.list.thresholdsFailed_one", { count: 1 }));
    },
  });

  step("movil", {
    title: "Las ejecuciones en el móvil",
    caption:
      "En el móvil, cada run es una tarjeta con su clave, su estado, su título y sus resultados; un toque lo abre. «Informe de estado», «Importar informe» y «Nuevo run manual» quedan en la fila de botones de la sección.",
    covers: ["platform:mobile-runs"],
    run: async () => {
      await setViewport(MOBILE);
      await expect($(".rn-card")).toBeDisplayed();
    },
    after: async () => {
      await setViewport(DESKTOP);
    },
  });
});
