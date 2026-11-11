// Chapter 13 — Trazabilidad (manual v2, MAN-03): the matrix that joins the
// requirements of chapter 7, the cases of chapter 8, their latest results
// (the JUnit import of chapter 10, the manual run of chapter 11) and the
// defects of chapter 12. Coverage, the latest result and its run, the result
// filters, the order by risk, the gaps, migrating free-text references and
// exporting. It runs after the executions and the defects, so the matrix has
// something to show. Example: Liomar checks what is tested of Pharos 0.3.0.
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import { PROJECT_A, byTestId, chooseOption, clickButton, dialog, es, openProject, openSection, tf, waitForText, waitForToast } from "./helpers";

const T = es.traceability;
const D = '[role="dialog"]';

chapter("trazabilidad", () => {
  step("matriz", {
    title: "La matriz de trazabilidad",
    caption:
      "«Trazabilidad», al final del menú del proyecto, responde a «¿está probado cada requisito?». Arriba, las cifras: cuántos requisitos hay, cuántos están cubiertos (con al menos un caso), cuántos no y la cobertura. Debajo, la matriz: cada requisito con su prioridad, los casos que lo verifican, el estado de prueba de cada caso y sus defectos. Un requisito sin ningún caso sale en rojo. Va al final del menú porque mide el resultado de todo lo anterior: es la vista que enseñar cuando alguien pregunta qué se ha probado. En este ejemplo, Liomar revisa la 0.3.0 de Pharos después de la importación del capítulo 10, la ejecución manual del capítulo 11 y los defectos del capítulo 12.",
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
      await $('[data-testid="trace-run-link"]').scrollIntoView({ block: "center" });
    },
  });

  step("filtros", {
    title: "Filtrar los resultados",
    caption:
      "Sobre la matriz, los filtros de resultados limitan el estado de prueba a las ejecuciones de un ciclo, una configuración, una build o un entorno: la foto de una ronda concreta. Los requisitos y los casos no cambian; solo qué resultados cuentan. Los filtros quedan en la dirección de la página, así que se pueden guardar o compartir, y «Quitar filtros» vuelve a todos. En este ejemplo, Liomar mira solo la build 0.3.0-rc1.",
    covers: ["action:matrix-filters"],
    focus: '[data-testid="trace-filter-build"]',
    run: async () => {
      const build = $('[data-testid="trace-filter-build"]');
      await chooseOption(build, { value: "0.3.0-rc1" });
      await browser.waitUntil(async () => (await browser.getUrl()).includes("build="), { timeoutMsg: "the filter is not in the URL" });
      await browser.waitUntil(async () => (await $$("tbody tr")).length > 0, { timeoutMsg: "the filtered matrix has no rows" });
    },
  });

  step("abrir-run", {
    title: "Del resultado a su run",
    caption: "La clave del run (RUN-…) de un resultado abre la pantalla de ese run, con todos sus elementos e intentos (capítulos 10 y 11). «Atrás» vuelve a la matriz.",
    covers: ["action:matrix-run-link"],
    shot: false,
    run: async () => {
      await byTestId("trace-filters-clear").click();
      await browser.waitUntil(async () => !(await browser.getUrl()).includes("build="), { timeoutMsg: "the filters were not cleared" });
      await $('[data-testid="trace-run-link"]').click();
      await browser.waitUntil(async () => /\/runs\/[^/?]+/.test(await browser.getUrl()), { timeoutMsg: "the run screen did not open" });
      await browser.back();
      await waitForText(T.matrix.title);
    },
  });

  step("orden", {
    title: "Ordenar por riesgo",
    caption:
      "«Orden» decide cómo se listan los requisitos. Por defecto, «Riesgo»: primero los de más riesgo (probabilidad × impacto, capítulo 7), para que lo más arriesgado se revise antes; los que no tienen riesgo evaluado van al final. «ID de requisito» los ordena por su clave.",
    covers: ["action:matrix-sort"],
    focus: '[data-testid="trace-sort"]',
    run: async () => {
      const sort = $('[data-testid="trace-sort"]');
      await chooseOption(sort, { value: "key" });
      await chooseOption(sort, { value: "risk" });
      await expect($('[data-testid^="trace-result-"]')).toBeExisting();
    },
  });

  step("huecos", {
    title: "Solo los huecos",
    caption:
      "«Mostrar solo huecos» deja los requisitos sin ningún caso, lo primero que conviene resolver antes de cerrar un ciclo. Debajo, «Huecos de trazabilidad» reúne lo que rompe la cadena requisito ↔ caso ↔ defecto: casos sin requisito, casos que enlazan un requisito inexistente y defectos sin caso vinculado.",
    covers: ["action:matrix-gaps"],
    run: async () => {
      await $(`label*=${T.matrix.onlyGaps}`).click();
      await expect($(`button[role="switch"][aria-checked="true"]`)).toBeExisting();
    },
  });

  step("migrar", {
    title: "Migrar referencias escritas a mano",
    caption:
      "Si un caso menciona un ID de requisito en su texto libre («Otras referencias (texto libre)»), la matriz no lo cuenta. «Migrar trazabilidad» propone convertirlo en un vínculo real: marca los que quieras y pulsa «Aplicar». En este ejemplo, la checklist de humo (PH-004) citaba REQ-006 en el capítulo 8.",
    covers: ["dialogs:src/modules/traceability/ui/MigrateTraceabilityModal.tsx"],
    shot: { element: D },
    run: async () => {
      await $(`label*=${T.matrix.onlyGaps}`).click();
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
