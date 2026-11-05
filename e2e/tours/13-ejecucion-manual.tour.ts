// Chapter 13 — Ejecución manual (EJE-02, wave E5): a manual run, its screen,
// the keyboard-first executor (marks per step, notes, evidence), saving the
// attempt, a defect from a failed attempt, closing / reopening the run, and
// deleting it (EJE-07).
// Selectors: the data-testids of src/modules/runs/README.md.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import { PROJECT_A, byTestId, chooseFile, clickButton, es, field, fixturesDir, openProject, openSection, tf, waitForText } from "./helpers";

const E = es.execution;
const downloadsDir = process.env.PHAROS_TOURS_DOWNLOADS ?? "";

/** Waits until a non-empty status report `ext` exported after `since` is in
 *  the tour's download folder. */
async function waitForExport(ext: string, since: number) {
  if (!downloadsDir || !existsSync(downloadsDir)) throw new Error("PHAROS_TOURS_DOWNLOADS is not set");
  await browser.waitUntil(
    async () =>
      readdirSync(downloadsDir).some((f) => {
        const st = statSync(join(downloadsDir, f));
        return f.startsWith("Informe_de_estado") && f.endsWith(ext) && st.size > 0 && st.mtimeMs >= since - 1000;
      }),
    { timeout: 15_000, timeoutMsg: `no status report ${ext} in ${downloadsDir}` },
  );
}
const D = '[role="dialog"]';

/** Ticks a case in the open case picker (by its key, e.g. BM-001). */
async function pickCase(key: string) {
  const box = byTestId(`run-case-${key}`);
  await box.waitForExist();
  if (!(await box.isSelected().catch(() => false))) await box.click();
}

chapter("ejecucion-manual", () => {
  step("nuevo-run", {
    title: "Nuevo run manual",
    caption: "En «Ejecuciones», «Nuevo run manual» crea un run para ejecutar a mano: título, entorno, build, configuración y los casos que entran (con su revisión vigente).",
    covers: ["dialogs:src/modules/runs/ui/CasePickerDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("runs");
      await byTestId("run-new").click();
      await byTestId("run-new-title").setValue("Regresión manual · 2.0.0-rc1");
      if (await byTestId("run-cases-search").isExisting()) {
        await pickCase("BM-001");
        await pickCase("BM-002");
      }
    },
  });

  step("pantalla-run", {
    title: "La pantalla del run",
    caption: "El run abierto muestra su cabecera (clave, entorno, build, configuración, estado), el progreso por resultado y sus elementos. Cada caso Outline o con flujos se ejecuta una vez por fila o por flujo.",
    covers: ["route:/projects/:projectId/runs/:runId", "screen:manual-run"],
    run: async () => {
      if (await byTestId("run-cases-confirm").isExisting()) await byTestId("run-cases-confirm").click();
      else await clickButton(E.newRun.create, D);
      await browser.waitUntil(async () => /\/runs\/[^/?]+/.test(await browser.getUrl()), { timeoutMsg: "the run screen did not open" });
      if ((await $$('[data-testid="run-item-execute"]')).length === 0) {
        await byTestId("run-add-cases").click();
        await pickCase("BM-001");
        await pickCase("BM-002");
        await byTestId("run-cases-confirm").click();
      }
      await browser.waitUntil(async () => (await $$('[data-testid="run-item-execute"]')).length >= 2, {
        timeoutMsg: "the run has no items to execute",
      });
    },
  });

  step("ejecutor", {
    title: "El ejecutor",
    caption: "«Ejecutar» abre el ejecutor junto a la lista: los pasos del caso con su resultado esperado. Marca cada paso como Pasa, Falla, Bloqueado u Omitido; con el teclado, P / F / B / S marcan y J / K (o las flechas) cambian de paso.",
    covers: ["action:manual-run-result", "keyboard:exec-keys"],
    run: async () => {
      await $('[data-testid="run-item-execute"][data-case-key="BM-001"]').click();
      await expect(byTestId("exec-panel")).toBeDisplayed();
      await byTestId("exec-step-1-pass").click();
      // The keyboard: J moves to the next step, P marks it as passed.
      await browser.keys(["j"]);
      await browser.keys(["p"]);
      await expect(byTestId("exec-step-2-pass")).toHaveAttribute("aria-pressed", "true");
      await byTestId("exec-step-3-fail").click();
      // «Obtenido» opens the field and focuses it: type into the focus.
      await byTestId("exec-step-3-notes").click();
      await browser.waitUntil(async () => browser.execute(() => document.activeElement?.tagName === "TEXTAREA"), {
        timeoutMsg: "the «obtenido» field did not take the focus",
      });
      await browser.keys([..."El saldo sigue en 1.000 € tras confirmar."]);
    },
  });

  step("atajos", {
    title: "Los atajos de teclado",
    caption: "«Atajos» (o «?») muestra todas las teclas del ejecutor.",
    covers: ["dialogs:src/modules/runs/ui/ExecutionPanel.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(E.shortcuts, '[data-testid="exec-panel"]');
      await expect($(D)).toBeDisplayed();
    },
  });

  step("evidencia", {
    title: "Adjuntar evidencias",
    caption: "Cada paso y el resultado admiten archivos, una imagen pegada (Ctrl+V o «Pegar captura») o una captura del sistema. Se cifran en este equipo al adjuntarlas. El borrador se guarda solo: si cierras, lo encuentras al volver.",
    covers: ["upload:src/modules/runs/ui/ExecutionPanel.tsx"],
    run: async () => {
      // Close the shortcuts dialog the previous step opened.
      await browser.keys("Escape");
      await $(".cd-overlay").waitForExist({ reverse: true });
      await chooseFile('[data-testid="exec-panel"] input[type="file"]', join(fixturesDir, "captura-saldo.png"));
      await waitForText(E.attached_one);
    },
  });

  step("pegar-captura", {
    title: "Pegar una captura",
    caption: "Con el foco en un paso o en el resultado, Ctrl+V pega la imagen del portapapeles (una captura hecha con Win+Mayús+S) como evidencia, sin guardarla antes en un archivo.",
    covers: ["action:exec-paste"],
    run: async () => {
      // The earlier attachment's toast must be gone, or it would pass for this one.
      await browser.waitUntil(async () => !(await $("body").getText()).includes(E.attached_one), {
        timeout: 15_000,
        timeoutMsg: "the previous attachment toast never went away",
      });
      // The same paste event Ctrl+V fires, with an image in its clipboard data:
      // WebDriver cannot fill the Windows clipboard itself.
      await browser.execute(async () => {
        // A 1×1 PNG (a fetch of a data: URL would be blocked by the CSP).
        const bin = atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
        const png = new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type: "image/png" });
        const dt = new DataTransfer();
        dt.items.add(new File([png], "captura.png", { type: "image/png" }));
        const target = document.querySelector('[data-testid="exec-step-3-fail"]') ?? document.querySelector('[data-testid="exec-panel"]');
        target?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      });
      await browser.waitUntil(async () => (await $("body").getText()).includes(E.attached_one), {
        timeoutMsg: "the pasted image was not attached",
      });
    },
  });

  step("guardar", {
    title: "Guardar el resultado",
    caption: "«Guardar resultado» (o Ctrl+Enter) registra el intento con el estado que resulta de los pasos (aquí, Falla). Un intento guardado no cambia: repetir la prueba crea otro intento.",
    run: async () => {
      await byTestId("exec-save").click();
      await waitForText(E.recorded.split("{{")[0]);
      await expect(byTestId("exec-create-defect")).toBeDisplayed();
    },
  });

  step("crear-defecto", {
    title: "Crear un defecto desde el intento fallido",
    caption: "En un intento fallido, «Crear defecto» abre el editor de defectos relleno con el caso, el paso y lo obtenido, ya vinculado al resultado.",
    run: async () => {
      await byTestId("exec-create-defect").click();
      await expect($(".tp-editor__save")).toBeDisplayed();
      await $(".tp-editor__save").click();
      await waitForText(es.defects.savedToast);
    },
  });

  step("descartar", {
    title: "Descartar un borrador",
    caption: "«Descartar» tira el borrador del elemento (y sus adjuntos) después de confirmarlo.",
    covers: ["dialogs:src/modules/runs/ui/ExecutionPanel.tsx"],
    shot: { element: D },
    run: async () => {
      if (await $(".tp-editor__back").isExisting()) await $(".tp-editor__back").click().catch(() => undefined);
      await $('[data-testid="run-item-execute"][data-case-key="BM-002"]').click();
      await expect(byTestId("exec-panel")).toBeDisplayed();
      await byTestId("exec-step-1-pass").click();
      await byTestId("exec-discard").click();
      await expect($(D)).toBeDisplayed();
    },
  });

  step("editar-run", {
    title: "Editar los datos del run",
    caption: "«Editar datos» cambia el título, el entorno, la build o la configuración del run.",
    covers: ["dialogs:src/modules/runs/ui/RunDetail.tsx"],
    shot: { element: D },
    run: async () => {
      await $(D).$("button.cd__confirm").click();
      await $(".cd-overlay").waitForExist({ reverse: true });
      await byTestId("run-edit").click();
      await expect($(D)).toBeDisplayed();
      await (await field(es.runs.field.environment, D)).setValue("preproducción");
      await (await field(es.runs.field.build, D)).setValue("2.0.0-rc1");
    },
  });

  step("cerrar-run", {
    title: "Cerrar el run",
    caption: "«Cerrar run» avisa de lo que queda sin ejecutar y de los borradores pendientes (que se pueden descartar); un run cerrado no admite intentos nuevos. «Reabrir» lo vuelve a abrir.",
    covers: ["dialogs:src/modules/runs/ui/RunDetail.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(E.run.save, D);
      await waitForText(E.run.saved);
      await byTestId("run-close").click();
      await expect(byTestId("run-close-confirm")).toBeDisplayed();
    },
  });

  step("reabrir", {
    title: "Run cerrado y reabierto",
    caption: "Tras cerrar, el run queda en solo lectura; «Reabrir» permite volver a ejecutar.",
    shot: false,
    run: async () => {
      await byTestId("run-close-confirm").click();
      await expect(byTestId("run-reopen")).toBeDisplayed();
      await byTestId("run-reopen").click();
      await expect(byTestId("run-close")).toBeDisplayed();
    },
  });

  step("informe-estado", {
    title: "Informe de estado",
    caption: "En «Ejecuciones», «Informe de estado» genera el informe de estado de pruebas (ISO/IEC/IEEE 29119-3) del proyecto, de un ciclo o del plan, en el periodo que elijas: progreso, resultados por estado, defectos (a fecha de hoy), cobertura y riesgos, los criterios de salida del plan (cumple / no cumple) y los bloqueos. El resumen se rellena con las cifras y, con las recomendaciones, se guarda solo en este equipo.",
    covers: ["dialogs:src/modules/runs/report/StatusReportDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await openSection("runs");
      await byTestId("runs-report").click();
      await expect(byTestId("status-report")).toBeDisplayed();
      await waitForText(es.statusReport.section.exit);
      await byTestId("report-recommendations").setValue("Repetir los casos fallidos tras la corrección de pagos y cerrar el ciclo.");
    },
  });

  step("informe-xlsx", {
    title: "Exportar el informe a Excel",
    caption: "«Exportar .xlsx» guarda el informe en la carpeta de descargas: una hoja «Resumen» con las nueve secciones y hojas con los resultados por caso, los defectos y la cobertura por requisito.",
    covers: ["action:report-export-xlsx"],
    shot: false,
    run: async () => {
      const since = Date.now();
      await byTestId("report-export-xlsx").click();
      await waitForText(tf("statusReport.exportedToast", { name: "" }).trim(), 30_000);
      await waitForExport(".xlsx", since);
    },
  });

  step("informe-pdf", {
    title: "Exportar el informe a PDF",
    caption: "«Exportar PDF» guarda el mismo informe como documento, listo para enviar.",
    covers: ["action:report-export-pdf"],
    shot: false,
    run: async () => {
      const since = Date.now();
      await byTestId("report-export-pdf").click();
      await waitForText(tf("statusReport.exportedToast", { name: "" }).trim(), 60_000);
      await waitForExport(".pdf", since);
      await browser.keys("Escape");
    },
  });

  step("matriz-resultados", {
    title: "Los resultados en la matriz",
    caption: "En «Trazabilidad → Matriz», cada caso muestra su último resultado final, venga de un run manual o de un informe importado (capítulo 8): el estado, la clave del run y la fecha, y avisos como «Flaky» o «Desactualizado» (se ejecutó una revisión anterior del caso). Los filtros de arriba limitan los resultados a un ciclo, una configuración, una build o un entorno.",
    covers: ["action:matrix-filters"],
    run: async () => {
      await openSection("traceability");
      await $(`button.chips__chip*=${es.traceability.view.matrix}`).click();
      await waitForText(es.traceability.matrix.title);
      await browser.waitUntil(async () => (await $$('[data-testid="trace-run-link"]')).length >= 1, {
        timeoutMsg: "the matrix shows no run of a result",
      });
      const build = $('[data-testid="trace-filter-build"]');
      await build.scrollIntoView();
      await build.selectByAttribute("value", "2.0.0-rc1");
      await browser.waitUntil(async () => (await browser.getUrl()).includes("build="), { timeoutMsg: "the filter is not in the URL" });
      // Under the build filter the matrix keeps its rows, and the manual run
      // (on that build) is still the last result of its case.
      await browser.waitUntil(async () => (await $$("tbody tr")).length > 0, { timeoutMsg: "the filtered matrix has no rows" });
      await browser.waitUntil(async () => (await $$('[data-testid="trace-run-link"]')).length >= 1, {
        timeoutMsg: "the filtered matrix shows no run",
      });
    },
  });

  step("abrir-run-matriz", {
    title: "Del resultado a su run",
    caption: "La clave del run (RUN-…) abre la pantalla de ese run. «Quitar filtros» devuelve todos los resultados.",
    covers: ["action:matrix-run-link"],
    shot: false,
    run: async () => {
      await byTestId("trace-filters-clear").click();
      await browser.waitUntil(async () => !(await browser.getUrl()).includes("build="), { timeoutMsg: "the filters were not cleared" });
      await $('[data-testid="trace-run-link"]').click();
      await browser.waitUntil(async () => /\/runs\/[^/?]+/.test(await browser.getUrl()), { timeoutMsg: "the run screen did not open" });
    },
  });

  step("borrar-run", {
    title: "Eliminar un run",
    caption: "«Eliminar run» lo quita de las listas y del progreso, en este equipo y en los que sincronicen. Antes dice qué se oculta: elementos, resultados, evidencias, borradores que se descartan, el ciclo cuyo progreso deja de contarlo y los defectos vinculados. Los resultados nunca se borran a mano: la purga se los lleva con el run pasada la retención. Un run de un ciclo cerrado no se puede eliminar.",
    covers: ["dialogs:src/modules/runs/ui/DeleteRunDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await byTestId("run-delete").click();
      await expect(byTestId("run-delete-hidden")).toBeDisplayed();
      await expect(byTestId("run-delete-confirm")).toBeEnabled();
    },
  });

  step("run-borrado", {
    title: "Run eliminado",
    caption: "Al confirmar vuelves a la lista de runs, donde ya no aparece; el registro de auditoría guarda la eliminación con lo que ocultó.",
    run: async () => {
      await byTestId("run-delete-confirm").click();
      await $(D).waitForExist({ reverse: true });
      await browser.waitUntil(async () => /\/runs\/?(\?|$)/.test(await browser.getUrl()), {
        timeoutMsg: "the runs list did not open after deleting the run",
      });
    },
  });
});
