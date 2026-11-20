// Chapter 13 — Trazabilidad (manual v2, MAN-03): the matrix that joins the
// requirements of chapter 7, the cases of chapter 8, their latest results
// (the JUnit import of chapter 10, the manual run of chapter 11) and the
// defects of chapter 12. Coverage, the latest result and its run, a case with
// a dataset, the result filters, the order by risk, the gaps, the open
// findings of the scans of chapter 10, migrating free-text references and
// exporting. It runs after the executions and the defects, so the matrix has
// something to show. Example: Liomar checks what is tested of Pharos 0.6.0.
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import {
  PROJECT_A,
  byTestId,
  chooseOption,
  clickButton,
  dialog,
  es,
  openInfoTip,
  openProject,
  openSection,
  pointerAway,
  scrollToTop,
  tf,
  waitForText,
  waitForToast,
} from "./helpers";
import { CYCLE, LIBRARY, SCANS } from "./data/pharos";

const T = es.traceability;
const D = '[role="dialog"]';
/** The matrix card (its head and its rows). */
const MATRIX = 'section.tz-panel[aria-labelledby="tz-matrix-title"]';

/** The page from its top, with the pointer away (no row in hover state). */
async function pageTop() {
  await pointerAway();
  await browser.execute(() => {
    const content = document.querySelector(".app-shell__content");
    if (content) content.scrollTop = 0;
  });
}

chapter("trazabilidad", () => {
  step("matriz", {
    title: "La matriz de trazabilidad",
    caption:
      "«Trazabilidad», al final del menú del proyecto, responde a «¿está probado cada requisito?». Arriba, las cifras: cuántos requisitos hay, cuántos están cubiertos (con al menos un caso), cuántos no y la cobertura. Debajo, la matriz: cada requisito con su prioridad, los casos que lo verifican, el estado de prueba de cada caso y sus defectos. Un requisito sin ningún caso sale en rojo. Va al final del menú porque mide el resultado de todo lo anterior: es la vista que enseñar cuando alguien pregunta qué se ha probado. En este ejemplo, Liomar revisa la 0.6.0 de Pharos después de las importaciones del capítulo 10, la ejecución manual del capítulo 11 y los defectos del capítulo 12.",
    covers: ["section:traceability", "screen:matrix"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("traceability");
      await waitForText(T.matrix.title);
      await browser.waitUntil(async () => (await $$('[data-testid="trace-run-link"]')).length >= 1, {
        timeoutMsg: "the matrix shows no run of a result",
      });
    },
  });

  step("resultados", {
    title: "El último resultado de cada caso",
    caption:
      "«Estado de prueba» es el último resultado final de cada caso, venga de un run manual o de un informe importado: el estado, la clave del run y la fecha. Los avisos lo matizan: «Flaky» (pasó tras fallar), «Desactualizado» (se ejecutó una revisión anterior del caso) y «Por confirmar» (falló y su defecto ya está corregido). «Defectos» enseña los de cada caso, con su severidad; los cerrados, atenuados. En este ejemplo, el caso de acceso PH-001 falla en el último run y lleva su defecto crítico.",
    focus: '[data-testid^="trace-result-"]',
    run: async () => {
      await pointerAway();
      await scrollToTop(MATRIX);
    },
  });

  step("dataset", {
    title: "Un caso con dataset en la matriz",
    caption:
      `Un caso con dataset (capítulo 8) se ejecuta una vez por fila, y en la matriz pasa solo si pasan todas sus filas. En este ejemplo, «${LIBRARY.case.title}» (${LIBRARY.case.key}) verifica REQ-001 junto a los otros dos casos de acceso y falla: en la ejecución manual del capítulo 11, la tercera cuenta no entra.`,
    // Its row is in the previous picture: no picture of its own.
    shot: false,
    run: async () => {
      const row = $(`[data-testid="trace-result-${LIBRARY.case.key}"]`);
      await row.waitForDisplayed();
      // Its row with the other cases of REQ-001 above it.
      await scrollToTop(row.parentElement(), 260);
    },
  });

  step("filtros", {
    title: "Filtrar los resultados",
    caption:
      `Sobre la matriz, los filtros de resultados limitan el estado de prueba a las ejecuciones de un ciclo, una configuración, una build o un entorno: la foto de una ronda concreta. Los requisitos y los casos no cambian; solo qué resultados cuentan. Los filtros quedan en la dirección de la página, así que se pueden guardar o compartir, y «Quitar filtros» vuelve a todos. En este ejemplo, Liomar mira solo el ciclo «${CYCLE.title}»: cuenta el informe importado en el ciclo (capítulo 10), y PH-005, que no se ejecutó en él, queda «No ejecutado».`,
    covers: ["action:matrix-filters"],
    focus: '[data-testid="trace-filter-cycle"]',
    run: async () => {
      const cycle = $('[data-testid="trace-filter-cycle"]');
      await chooseOption(cycle, { index: 1 });
      await browser.waitUntil(async () => (await browser.getUrl()).includes("cycle"), { timeoutMsg: "the filter is not in the URL" });
      await browser.waitUntil(async () => (await $$("tbody tr")).length > 0, { timeoutMsg: "the filtered matrix has no rows" });
      // The filters on top, the access cases of REQ-001 below.
      await pointerAway();
      await scrollToTop('[data-testid="trace-filter-cycle"]', 48);
    },
  });

  step("abrir-run", {
    title: "Del resultado a su run",
    caption: "La clave del run (RUN-…) de un resultado abre la pantalla de ese run, con todos sus elementos e intentos (capítulos 10 y 11). «Atrás» vuelve a la matriz.",
    covers: ["action:matrix-run-link"],
    shot: false,
    run: async () => {
      await byTestId("trace-filters-clear").click();
      await browser.waitUntil(async () => !(await browser.getUrl()).includes("cycle"), { timeoutMsg: "the filters were not cleared" });
      await $('[data-testid="trace-run-link"]').click();
      await browser.waitUntil(async () => /\/runs\/[^/?]+/.test(await browser.getUrl()), { timeoutMsg: "the run screen did not open" });
      await browser.back();
      await waitForText(T.matrix.title);
    },
  });

  step("orden", {
    title: "Ordenar por riesgo",
    caption:
      "«Orden» decide cómo se listan los requisitos. Por defecto, «Riesgo»: primero los de más riesgo (probabilidad × impacto, capítulo 7), para que lo más arriesgado se revise antes; los que no tienen riesgo evaluado van al final. «ID de requisito» los ordena por su clave: en este ejemplo, Liomar lo elige para encontrar REQ-001, arriba del todo, y después vuelve a «Riesgo».",
    covers: ["action:matrix-sort"],
    focus: '[data-testid="trace-sort"]',
    run: async () => {
      const sort = $('[data-testid="trace-sort"]');
      await chooseOption(sort, { value: "key" });
      await browser.waitUntil(async () => (await $(MATRIX).$("tbody tr .tr-key").getText()) === "REQ-001", {
        timeoutMsg: "the matrix is not ordered by requirement ID",
      });
      await pointerAway();
      await scrollToTop('[data-testid="trace-sort"]', 48);
    },
    after: async () => {
      await chooseOption($('[data-testid="trace-sort"]'), { value: "risk" });
      await expect($('[data-testid^="trace-result-"]')).toBeExisting();
    },
  });

  step("ponderada", {
    title: "Cobertura ponderada por riesgo",
    caption:
      "«Cobertura ponderada» pesa cada requisito por su nivel de riesgo (probabilidad × impacto): cubrir uno de nivel 20 cuenta cinco veces más que uno de nivel 4, así un hueco en lo más arriesgado se nota más que en lo trivial. Debajo pone la «aprobada» (los requisitos con todos sus casos ejecutados y en Pasa) y cuántos requisitos sin evaluar quedan fuera; el ⓘ enseña la cuenta y las bandas del proyecto (capítulo 14). Bajo las cifras, una barra por banda —alto, medio, bajo y sin evaluar— dice cuántos requisitos de cada una tienen caso. Sigue los filtros de ciclo, configuración, build y entorno, como el informe de estado.",
    covers: ["action:matrix-weighted"],
    focus: ['[data-testid="tz-weighted"]', ".infotip__bubble:not([hidden])"],
    run: async () => {
      await expect(byTestId("tz-weighted")).toBeDisplayed();
      await browser.waitUntil(async () => (await byTestId("tz-weighted").getText()).includes("%"), {
        timeoutMsg: "the weighted coverage has no value",
      });
      await expect(byTestId("tz-bands")).toBeDisplayed();
      await pageTop();
      // The ⓘ open: the account and the bands of the project.
      await openInfoTip(T.matrix.weightedTitle, '[data-testid="tz-weighted"]');
    },
  });

  step("huecos", {
    title: "Solo los huecos",
    caption:
      "«Mostrar solo huecos» deja los requisitos sin ningún caso, lo primero que conviene resolver antes de cerrar un ciclo. En este ejemplo quedan 9, empezando por los de más riesgo; desde cada uno, «Generar casos con IA» propone sus casos (capítulo 17).",
    covers: ["action:matrix-gaps"],
    focus: ".tz-gaps-toggle[data-on]",
    run: async () => {
      await $(`label*=${T.matrix.onlyGaps}`).click();
      await expect($(`button[role="switch"][aria-checked="true"]`)).toBeExisting();
      await pageTop();
    },
  });

  step("hallazgos", {
    title: "Casos con hallazgos abiertos",
    caption:
      `Un caso con hallazgos abiertos en el último análisis de cada herramienta (capítulo 10) lleva una insignia con cuántos son, en el color del peor; al pasar el puntero dice su severidad. «Con hallazgos abiertos» deja solo los requisitos con algún caso así. En este ejemplo, el análisis de Semgrep vinculó a ${SCANS.sarif.linkedCase} un hallazgo de severidad media: la respuesta de /auth/login delata si un correo tiene cuenta. El que Liomar triajó como falso positivo ya no cuenta. Bajo la matriz, «Huecos de trazabilidad» reúne lo que rompe la cadena requisito ↔ caso ↔ defecto: casos sin requisito, casos que enlazan un requisito inexistente y defectos sin caso vinculado.`,
    focus: [`[data-testid="trace-findings-${SCANS.sarif.linkedCase}"]`, ".tz-gaps-toggle[data-on]"],
    run: async () => {
      await $(`label*=${T.matrix.onlyGaps}`).click();
      await $(`label*=${tf("traceability.matrix.onlyFindings_one", { count: 1 }).split(" (")[0]}`).click();
      const badge = $(`[data-testid="trace-findings-${SCANS.sarif.linkedCase}"]`);
      await badge.waitForDisplayed();
      await expect(badge).toHaveText(tf("traceability.findings.badge_one", { count: 1 }));
      // From the switches down to the «Huecos de trazabilidad» panel.
      await pointerAway();
      await scrollToTop(".tz-toolbar");
      await expect($("section.tz-gaps")).toBeDisplayed();
    },
  });

  step("migrar", {
    title: "Migrar referencias escritas a mano",
    caption:
      "Si un caso menciona un ID de requisito en su texto libre («Otras referencias (texto libre)»), la matriz no lo cuenta. «Migrar trazabilidad» propone convertirlo en un vínculo real: marca los que quieras y pulsa «Aplicar». En este ejemplo, la checklist de humo (PH-004) citaba REQ-006 en el capítulo 8.",
    covers: ["dialogs:src/modules/traceability/ui/MigrateTraceabilityModal.tsx"],
    shot: { element: D },
    run: async () => {
      await $(`label*=${tf("traceability.matrix.onlyFindings_one", { count: 1 }).split(" (")[0]}`).click();
      const migrate = $(`button*=${T.migrate.button.split(" (")[0]}`);
      await migrate.scrollIntoView({ block: "center" });
      await migrate.click();
      await expect(dialog()).toBeDisplayed();
      await expect(dialog()).toHaveText(expect.stringContaining("REQ-006"));
    },
  });

  step("exportar-matriz", {
    title: "Exportar la matriz",
    caption:
      "«Exportar matriz (.xlsx)», en la cabecera, guarda la matriz en un libro de Excel: requisitos, casos, estados y defectos, más la hoja «Resultados» con el run, la fecha y los defectos de cada caso, y anotados los filtros que estaban activos. Sirve para compartirla con quien no usa Pharos o adjuntarla a una auditoría. El archivo va a tu carpeta de descarga y un aviso dice su nombre.",
    covers: ["action:matrix-export"],
    shot: false,
    run: async () => {
      await clickButton(T.migrate.apply, D);
      await waitForToast(T.migrate.doneToast.split(":")[0]);
      await $(".cd-overlay").waitForExist({ reverse: true });
      await clickButton(T.io.exportXlsx);
      await waitForToast(tf("traceability.matrix.exportedToast", { name: "" }).trim(), 30_000);
    },
  });
});
