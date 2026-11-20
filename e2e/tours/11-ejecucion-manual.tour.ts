// Chapter 11 — Ejecución manual (manual v2, MAN-03; EJE-02): a manual run of
// the access cases of «Pharos» (PH-001, PH-002 and the dataset case PH-005 of
// chapter 8), its screen, the keyboard-first executor (marks per step, notes,
// evidence, paste), saving the attempt, a defect from a failed attempt,
// discarding a draft, running a case row by row, editing, closing and
// reopening the run, the status report and its exports, the run on a phone
// and deleting a run (to the Papelera, EJE-07). It leaves the run completed
// (the `ejecucion-manual` prerequisite).
// Selectors: the data-testids of src/modules/runs/README.md.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { DESKTOP, MOBILE, chapter, setViewport, step } from "./tour";
import { PROJECT_A, byTestId, chooseFile, clickButton, es, field, fixturesDir, openProject, openSection, pointerAway, scrollToTop, tf, waitForText, waitForToast } from "./helpers";
import { CYCLE, LIBRARY, MANUAL_RUN } from "./data/pharos";

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

/** Ticks a case in the open case picker (by its key, e.g. PH-001). */
async function pickCase(key: string) {
  const box = byTestId(`run-case-${key}`);
  await box.waitForExist();
  if (!(await box.isSelected().catch(() => false))) await box.click();
}

/** Opens a run item in the executor. */
async function execute(caseKey: string) {
  await $(`[data-testid="run-item-execute"][data-case-key="${caseKey}"]`).click();
  await expect(byTestId("exec-panel")).toBeDisplayed();
}

/** Marks every step of the open target (`fail`: the last step fails). */
async function markSteps(fail: boolean) {
  const steps = (await $$('[data-testid^="exec-step-"][data-testid$="-pass"]')).length;
  for (let i = 1; i <= steps; i++) await byTestId(`exec-step-${i}-${fail && i === steps ? "fail" : "pass"}`).click();
}

/** Saves the open target's attempt. */
async function saveAttempt(fail: boolean) {
  await byTestId("exec-save").click();
  await waitForToast(tf("execution.recorded", { status: es.runs.status[fail ? "failed" : "passed"] }));
}

/** Marks every step of the open target and saves it (`fail`: the last step fails). */
async function markAndSave(fail: boolean) {
  await markSteps(fail);
  await saveAttempt(fail);
}

chapter("ejecucion-manual", () => {
  step("nuevo-run", {
    title: "Nuevo run manual",
    caption:
      `Para las pruebas que se hacen a mano fuera de un ciclo, «Nuevo run manual», en «Ejecuciones», crea un run: el título (obligatorio; propone «Run manual» y la fecha), el entorno, la build, la configuración y los casos que entran, con buscador y el recuento de los elegidos. Cada caso entra con su revisión vigente, así que el resultado queda ligado a la versión del caso que se ejecutó. Un caso con dataset dice cuántas filas trae y de qué dataset («3 filas · ${LIBRARY.dataset.name} (v1)»): cada fila será una ejecución propia. En este ejemplo, Liomar repite a mano los casos de acceso de Pharos en staging, con la build ${MANUAL_RUN.build}. «Crear y abrir» lo crea y abre su pantalla.`,
    covers: ["dialogs:src/modules/runs/ui/CasePickerDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("runs");
      await byTestId("run-new").click();
      await byTestId("run-new-title").setValue(MANUAL_RUN.title);
      await (await field(es.runs.field.environment, D)).setValue(MANUAL_RUN.environment);
      await (await field(es.runs.field.build, D)).setValue(MANUAL_RUN.build);
      await pickCase(MANUAL_RUN.failed.caseKey);
      await pickCase(MANUAL_RUN.passed.caseKey);
      await pickCase(MANUAL_RUN.dataset.caseKey);
      await expect(byTestId(`run-case-dataset-${MANUAL_RUN.dataset.caseKey}`)).toHaveText(
        tf("execution.picker.dataset_other", { count: LIBRARY.dataset.rows, name: LIBRARY.dataset.name, version: 1 }),
      );
    },
  });

  step("pantalla-run", {
    title: "La pantalla del run",
    caption:
      "La pantalla del run muestra su cabecera (clave, título, estado, origen, entorno, build, configuración, ciclo y fechas), el progreso y sus elementos, que se filtran por resultado. Un caso Outline, con flujos o con dataset se ejecuta una vez por fila o por flujo, y cada fila o flujo cuenta como una ejecución: en este ejemplo, PH-002 tiene dos filas de ejemplos y PH-005, las tres filas de su dataset, así que el progreso dice «0/6 ejecutados». Arriba, «Añadir casos», «Editar datos», «Cerrar run» y «Eliminar run»; «Ejecutar el siguiente» abre el primer elemento pendiente. Un run con hallazgos o métricas tiene además las pestañas «Hallazgos» y «Métricas» (capítulo 10).",
    covers: ["route:/projects/:projectId/runs/:runId", "screen:manual-run"],
    run: async () => {
      await byTestId("run-cases-confirm").click();
      await browser.waitUntil(async () => /\/runs\/[^/?]+/.test(await browser.getUrl()), { timeoutMsg: "the run screen did not open" });
      await browser.waitUntil(async () => (await $$('[data-testid="run-item-execute"]')).length >= 3, {
        timeoutMsg: "the run has no items to execute",
      });
      await waitForText(tf("execution.run.progress", { executed: 0, total: 6 }));
    },
  });

  step("ejecutor", {
    title: "El ejecutor",
    caption:
      "Un clic en un caso abre el ejecutor junto a la lista: los pasos del caso con su resultado esperado. Marca cada paso como «Pasa», «Falla», «Bloqueado» u «Omitido» (repetir la marca la quita). Falla y Bloqueado abren «Obtenido / notas» para escribir qué pasó (en este ejemplo, los tres primeros pasan y el 4, «Pulsar «Entrar»», falla: Pharos se queda en la entrada con «Correo o contraseña incorrectos.»). Con el teclado es más rápido: P, F, B y S marcan el paso enfocado; J o ↓ y K o ↑ cambian de paso; N abre las notas; T pone en marcha o pausa el cronómetro.",
    covers: ["action:manual-run-result", "keyboard:exec-keys"],
    run: async () => {
      await execute(MANUAL_RUN.failed.caseKey);
      await byTestId("exec-step-1-pass").click();
      // The keyboard: J moves to the next step, P marks it as passed.
      await browser.keys(["j"]);
      await browser.keys(["p"]);
      await expect(byTestId("exec-step-2-pass")).toHaveAttribute("aria-pressed", "true");
      // Writing the address and the password works; «Entrar» fails.
      for (let n = 3; n < MANUAL_RUN.failed.step; n++) await byTestId(`exec-step-${n}-pass`).click();
      await byTestId(`exec-step-${MANUAL_RUN.failed.step}-fail`).click();
      // «Obtenido» opens the field and focuses it: type into the focus.
      await byTestId(`exec-step-${MANUAL_RUN.failed.step}-notes`).click();
      await browser.waitUntil(async () => browser.execute(() => document.activeElement?.tagName === "TEXTAREA"), {
        timeoutMsg: "the «obtenido» field did not take the focus",
      });
      await browser.keys([...MANUAL_RUN.failed.actual]);
    },
  });

  step("atajos", {
    title: "Los atajos de teclado",
    caption:
      "«Atajos» (o la tecla «?») muestra todas las teclas del ejecutor: P / F / B / S marcan, J / K y las flechas cambian de paso, N abre las notas, T el cronómetro, Ctrl+Enter guarda el resultado, Ctrl+Mayús+N pasa al siguiente elemento y Ctrl+V pega una captura. Las letras solo actúan cuando no estás escribiendo en un campo; Ctrl+Enter y Ctrl+Mayús+N, también dentro de un campo.",
    covers: ["dialogs:src/modules/runs/ui/ExecutionPanel.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(E.shortcuts, '[data-testid="exec-panel"]');
      await expect($(D)).toBeDisplayed();
    },
  });

  step("evidencia", {
    title: "Adjuntar evidencias",
    caption:
      "El clip de cada paso («Adjuntar») y «Adjuntar al resultado» añaden archivos de hasta 200 MB: capturas, vídeos, registros. Se muestran como fichas con su miniatura (en este ejemplo, la captura del fallo de acceso). Mientras ejecutas, todo es un borrador que se guarda solo en este equipo (lo dice el pie): si cierras la app, lo encuentras al volver. Al guardar el resultado, sus evidencias se guardan cifradas y llegan a los demás equipos del espacio de trabajo. Los adjuntos solo están en la app de escritorio.",
    covers: ["upload:src/modules/runs/ui/ExecutionPanel.tsx"],
    focus: ".ex-result",
    run: async () => {
      // Close the shortcuts dialog the previous step opened.
      await browser.keys("Escape");
      await $(".cd-overlay").waitForExist({ reverse: true });
      await chooseFile('[data-testid="exec-panel"] input[type="file"]', join(fixturesDir, "captura-fallo-acceso.png"));
      await waitForToast(E.attached_one);
      await $(".ex-result__files").scrollIntoView({ block: "center" });
      await $(".ex-file__name*=captura-fallo-acceso").waitForDisplayed();
    },
  });

  step("pegar-captura", {
    title: "Pegar una captura",
    caption:
      "Con el foco en un paso o en el resultado, Ctrl+V pega la imagen del portapapeles como evidencia, sin guardarla antes en un archivo: haz la captura con Win+Mayús+S (⌘⇧4 en Mac) y pega. «Pegar captura» hace lo mismo con un clic. La imagen se llama «captura-» con la fecha y la hora y aparece como una ficha más, junto a la captura del fallo.",
    covers: ["action:exec-paste"],
    focus: '[data-testid="exec-panel"] .ex-file',
    run: async () => {
      // The earlier attachment's toast must be gone, or it would pass for this one.
      await browser.waitUntil(async () => !(await $("body").getText()).includes(E.attached_one), {
        timeout: 15_000,
        timeoutMsg: "the previous attachment toast never went away",
      });
      const before = (await $$(".ex-file")).length;
      // The same paste event Ctrl+V fires, with an image in its clipboard data:
      // WebDriver cannot fill the Windows clipboard itself.
      await browser.execute(async (stepNo: number) => {
        // A 1×1 PNG (a fetch of a data: URL would be blocked by the CSP).
        const bin = atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
        const png = new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type: "image/png" });
        const dt = new DataTransfer();
        dt.items.add(new File([png], "captura.png", { type: "image/png" }));
        const target = document.querySelector(`[data-testid="exec-step-${stepNo}-fail"]`) ?? document.querySelector('[data-testid="exec-panel"]');
        target?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      }, MANUAL_RUN.failed.step);
      await browser.waitUntil(async () => (await $$(".ex-file")).length > before, { timeoutMsg: "the pasted image was not attached" });
      // No hover state in the picture; then the same framing as «Adjuntar
      // evidencias»: both captures in view.
      await pointerAway();
      await $(".ex-result__files").scrollIntoView({ block: "center" });
      await $(".ex-file__name*=captura-fallo-acceso").waitForDisplayed();
      let pasted: WebdriverIO.Element | null = null;
      for (const name of await $$(".ex-file__name")) {
        const text = await name.getText();
        if (text.startsWith("captura-") && !text.includes("fallo")) pasted = name;
      }
      if (!pasted) throw new Error("the pasted capture has no chip");
      if (!(await pasted.isDisplayed({ withinViewport: true }))) await pasted.scrollIntoView({ block: "center" });
      if (!(await pasted.isDisplayed({ withinViewport: true }))) throw new Error("the pasted capture is not in view");
    },
  });

  step("quitar-evidencia", {
    title: "Quitar una evidencia",
    caption:
      "La papelera de cada ficha («Quitar «nombre»») borra esa evidencia, y no se puede recuperar. Por eso es una confirmación crítica: Esc y el clic fuera no hacen nada; solo responden «Cancelar» o «Quitar», en rojo (en este ejemplo, Liomar quita la captura pegada y conserva la del fallo).",
    covers: ["dialogs:src/modules/runs/ui/ExecutionPanel.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      // The pasted capture («captura-<fecha>»), not the file «captura-fallo-acceso.png».
      await $(`button[aria-label^="${E.removeFile.split("{{")[0]}captura-"]:not([aria-label*="fallo"])`).click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
      await browser.keys("Escape");
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await $('[role="alertdialog"]').$("button.cd__confirm").click();
      await $('[role="alertdialog"]').waitForExist({ reverse: true });
      await expect($(".ex-file__name*=captura-fallo-acceso")).toBeExisting();
    },
  });

  step("guardar", {
    title: "Guardar el resultado",
    caption:
      "«Guardar resultado (Falla)» (o Ctrl+Enter) registra el intento con el estado que resulta de los pasos; el selector «Resultado» permite fijar otro a mano. Los pasos sin marcar se guardan como Omitido, y el aviso lo dice antes. Al guardar, el intento aparece en «Intentos», debajo, con su estado, su fecha y sus evidencias, y el ejecutor queda listo para otro. Un intento guardado no cambia: repetir la prueba crea otro intento («Intento 2»), así que el historial de lo que pasó se conserva.",
    focus: ".ex-attempts",
    run: async () => {
      await expect(byTestId("exec-save")).toHaveText(expect.stringContaining(es.runs.status.failed));
      await byTestId("exec-save").click();
      await waitForToast(E.recorded.split("{{")[0]);
      await expect(byTestId("exec-create-defect")).toBeDisplayed();
      // The saved attempt, with the end of the (now empty) draft above it.
      await scrollToTop(".ex-attempts", 420);
    },
  });

  step("crear-defecto", {
    title: "Crear un defecto desde el intento fallido",
    caption:
      "En un intento fallido o bloqueado, «Crear defecto» abre el editor de defectos relleno con los pasos de la revisión ejecutada, lo obtenido, el resultado esperado (el del paso que falló o, si no tiene, el del caso), la build y el entorno, ya vinculado al resultado y a su caso, y con sus evidencias (sin copiar los archivos). «Guardar y crear defecto», en un paso que falla, hace lo mismo sin guardar antes el intento. Los vínculos ofrecen los casos y los requisitos del proyecto, como en «Defectos» (capítulo 12). En este ejemplo, el fallo de acceso ya tiene su defecto (se registra desde el informe importado; lo verás en el capítulo 12), así que Liomar vuelve sin guardar: un mismo fallo, un solo defecto.",
    run: async () => {
      await byTestId("exec-create-defect").click();
      await expect($(".tp-editor__save")).toBeDisplayed();
      // The capture starts at the top of the editor: its origin, the title
      // and the prefilled fields below.
      await expect(await field(es.defects.field.steps)).toHaveValue(expect.stringContaining("1."));
      await scrollToTop(".df-editor");
    },
    // Not saved: the login failure already has its defect (chapter 12).
    after: async () => {
      await $(".tp-editor__back").click();
      if (await $('[role="alertdialog"]').isExisting()) await $('[role="alertdialog"]').$("button.cd__confirm").click();
      await $(".tp-editor__back").waitForExist({ reverse: true });
    },
  });

  step("descartar", {
    title: "Descartar un borrador",
    caption:
      "Si un borrador no te sirve, «Descartar borrador» tira sus marcas, notas y adjuntos, después de confirmarlo («¿Descartar el borrador?»). Los intentos ya guardados no cambian.",
    covers: ["dialogs:src/modules/runs/ui/ExecutionPanel.tsx"],
    shot: { element: D },
    run: async () => {
      await execute(MANUAL_RUN.passed.caseKey);
      await byTestId("exec-step-1-pass").click();
      await byTestId("exec-discard").click();
      await expect($(D)).toBeDisplayed();
    },
  });

  step("ejecutar-filas", {
    title: "Ejecutar cada fila del dataset",
    caption:
      `En el ejecutor, cada fila de un Outline o de un dataset es una ejecución con su propio resultado: «Flujo principal · Fila 1 de 3», «Fila 2 de 3»… con el primer valor de la fila al lado. Los valores de la fila aparecen resaltados en los pasos, y los pasos insertados de la biblioteca llevan encima «Paso compartido · ${LIBRARY.step.name} · v2». En este ejemplo, Liomar pasa las dos filas de PH-002 y, en «${LIBRARY.case.title}» (PH-005), entran las dos primeras cuentas y la tercera falla al pulsar «Entrar». Cada resultado recuerda el dataset y la versión de cada paso compartido.`,
    focus: ".ex-targets",
    run: async () => {
      await $(D).$("button.cd__confirm").click();
      await $(".cd-overlay").waitForExist({ reverse: true });
      // PH-002: both example rows pass.
      for (let row = 0; row < (await $$("button.ex-target")).length; row++) {
        await $$("button.ex-target")[row].click();
        await markAndSave(false);
      }
      // PH-005: one execution per dataset row; the failing one is marked
      // last and saved after the capture, so the picture shows its marks.
      await execute(MANUAL_RUN.dataset.caseKey);
      const targets = await $$("button.ex-target");
      await expect(targets[0]).toHaveText(expect.stringContaining(tf("execution.rowOf", { n: 1, total: LIBRARY.dataset.rows })));
      const failed = MANUAL_RUN.dataset.failedRow - 1;
      for (let row = 0; row < LIBRARY.dataset.rows; row++) {
        if (row === failed) continue;
        await $$("button.ex-target")[row].click();
        await expect($$("button.ex-target")[row]).toHaveAttribute("aria-current", "true");
        await markAndSave(false);
      }
      await $$("button.ex-target")[failed].click();
      await expect($$("button.ex-target")[failed]).toHaveAttribute("aria-current", "true");
      await markSteps(true);
      await expect($(".ex-shared")).toHaveText(expect.stringContaining(tf("execution.sharedBlock", { name: LIBRARY.step.name, version: 2 })));
      // The executor from its head: the case, the rows and the marked steps.
      await pointerAway();
      await scrollToTop('[data-testid="exec-panel"]');
    },
    after: async () => {
      await saveAttempt(true);
    },
  });

  step("editar-run", {
    title: "Editar los datos del run",
    caption: "«Editar datos» corrige el título, el entorno o la build del run, si te equivocaste al crearlo.",
    covers: ["dialogs:src/modules/runs/ui/RunDetail.tsx"],
    shot: { element: D },
    run: async () => {
      await byTestId("run-edit").click();
      await expect($(D)).toBeDisplayed();
      await expect(await field(es.runs.field.build, D)).toHaveValue(MANUAL_RUN.build);
    },
  });

  step("cerrar-run", {
    title: "Cerrar el run",
    caption:
      "«Cerrar run» avisa de lo que queda sin ejecutar y de los borradores sin guardar, y pide cómo se cierra en «Cerrar como»: «Completado» o «Cancelado» (cancelar descarta los borradores). Un run cerrado no admite intentos nuevos; «Reabrir» lo vuelve a abrir, salvo que su ciclo esté cerrado.",
    covers: ["dialogs:src/modules/runs/ui/RunDetail.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(E.run.save, D);
      await waitForToast(E.run.saved);
      await byTestId("run-close").click();
      await expect(byTestId("run-close-confirm")).toBeDisplayed();
    },
  });

  step("reabrir", {
    title: "Run cerrado y reabierto",
    caption:
      "Tras cerrar, el run queda en solo lectura: se ven sus intentos, pero no se ejecuta. «Reabrir» permite volver a ejecutar, por ejemplo, si faltó un caso.",
    shot: false,
    run: async () => {
      await byTestId("run-close-confirm").click();
      await expect(byTestId("run-reopen")).toBeDisplayed();
      await byTestId("run-reopen").click();
      await expect(byTestId("run-close")).toBeDisplayed();
    },
  });

  step("movil", {
    title: "El run en el móvil",
    caption:
      "En pantallas estrechas, el ejecutor ocupa toda la pantalla en lugar de la lista: al tocar un caso se abre, y «Cerrar la ejecución» (✕) vuelve a la lista. Los adjuntos y «Pegar captura» son de la app de escritorio; en la web, el borrador se guarda en el navegador.",
    covers: ["platform:mobile-run"],
    run: async () => {
      await setViewport(MOBILE);
      await browser.waitUntil(
        async () =>
          (await byTestId("exec-panel").isDisplayed().catch(() => false)) ||
          (await $('[data-testid="run-item-execute"]').isDisplayed().catch(() => false)),
        { timeoutMsg: "neither the executor nor the item list shows on a phone" },
      );
      // The strip of rows scrolled to the selected one, so no chip is cut.
      await browser.execute(() => {
        const chip = document.querySelector<HTMLElement>('button.ex-target[aria-current="true"]');
        const strip = chip?.parentElement?.closest<HTMLElement>(".ex-targets");
        if (!chip || !strip) return;
        let scroller: HTMLElement | null = chip.parentElement;
        while (scroller && scroller !== strip.parentElement && scroller.scrollWidth <= scroller.clientWidth + 1) scroller = scroller.parentElement;
        if (!scroller || scroller === strip.parentElement) return;
        const s = scroller.getBoundingClientRect();
        const c = chip.getBoundingClientRect();
        // The selected chip whole at the left edge: no card cut on that side.
        scroller.scrollLeft += c.left - s.left;
      });
    },
    // Liomar has run everything: the run ends completed (the prerequisite of
    // chapters 3, 13 and 16).
    after: async () => {
      await setViewport(DESKTOP);
      await byTestId("run-close").click();
      await byTestId("run-close-confirm").click();
      await expect(byTestId("run-reopen")).toBeDisplayed();
    },
  });

  step("informe-estado", {
    title: "Informe de estado",
    caption:
      "En «Ejecuciones» (o en la cabecera de un ciclo), «Informe de estado» genera el informe de estado de pruebas (ISO/IEC/IEEE 29119-3) del proyecto, de un ciclo o del plan, entre las fechas que elijas en «Desde» y «Hasta» (con el selector de fechas de Pharos del capítulo 5: «Hasta» abre en el mes de «Desde» y no deja elegir un día anterior). Sus secciones: identificación, progreso, resultados por estado, defectos por severidad (a fecha de hoy), cobertura y riesgos (con la cobertura ponderada por riesgo), los criterios de salida del plan (cumple / no cumple / sin datos), bloqueos, resumen y recomendaciones. Con un ciclo cerrado, el informe empieza por su «Decisión de salida» (capítulo 9).",
    covers: ["dialogs:src/modules/runs/report/StatusReportDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await openSection("runs");
      await byTestId("runs-report").click();
      await expect(byTestId("status-report")).toBeDisplayed();
      await waitForText(es.statusReport.section.exit);
      await waitForText(es.statusReport.section.findings);
      // The capture starts at the top of the report.
      await $(`${D} .cd__title`).scrollIntoView({ block: "start" });
    },
  });

  step("informe-recomendaciones", {
    title: "Hallazgos, resumen y recomendaciones",
    caption:
      "Si hay análisis o pruebas de carga (capítulo 10), «7.1 Hallazgos y rendimiento» cuenta los hallazgos abiertos por severidad, los nuevos, los triados, los que esperan revisión y los umbrales cumplidos e incumplidos. El resumen se rellena solo con las cifras y se puede cambiar; las recomendaciones las escribes tú: en este ejemplo, Liomar pide repetir lo que falló cuando se corrija. Los dos se guardan solo en este equipo y van en las exportaciones.",
    shot: { element: D },
    focus: `${D} [data-testid="report-recommendations"]`,
    run: async () => {
      await byTestId("report-recommendations").setValue(
        `Repetir PH-001 y la tercera fila de PH-005 cuando se corrija el fallo de acceso, y ejecutar los runs del ciclo «${CYCLE.title}» antes de cerrarlo.`,
      );
      // From «7.1 Hallazgos y rendimiento» down to the end of the body (the
      // line under the recommendations), clear of the button bar.
      await scrollToTop($(D).$(`h4=${es.statusReport.section.findings}`), 0);
    },
  });

  step("informe-xlsx", {
    title: "Exportar el informe a Excel",
    caption:
      "«Exportar .xlsx» guarda el informe en tu carpeta de descarga: una hoja «Resumen» con todas sus secciones y hojas con los resultados por caso, los defectos y la cobertura por requisito. Un aviso dice el nombre del archivo.",
    covers: ["action:report-export-xlsx"],
    shot: false,
    run: async () => {
      const since = Date.now();
      await byTestId("report-export-xlsx").click();
      await waitForToast(tf("statusReport.exportedToast", { name: "" }).trim(), 30_000);
      await waitForExport(".xlsx", since);
    },
  });

  step("informe-pdf", {
    title: "Exportar el informe a PDF",
    caption: "«Exportar PDF» guarda el mismo informe como documento, listo para enviar o firmar.",
    covers: ["action:report-export-pdf"],
    shot: false,
    run: async () => {
      const since = Date.now();
      await byTestId("report-export-pdf").click();
      await waitForToast(tf("statusReport.exportedToast", { name: "" }).trim(), 60_000);
      await waitForExport(".pdf", since);
      await browser.keys("Escape");
    },
  });

  step("borrar-run", {
    title: "Eliminar un run",
    caption:
      "«Eliminar run», en la cabecera de un run (solo en la app de escritorio), lo quita de las listas y del progreso, en este equipo y en los que sincronicen. En este ejemplo, Liomar elimina un run que creó por error. Antes dice qué se oculta: elementos, resultados, evidencias, borradores que se descartan, el ciclo cuyo progreso deja de contarlo y los defectos vinculados. Un run de un ciclo cerrado no se puede eliminar.",
    covers: ["dialogs:src/modules/runs/ui/DeleteRunDialog.tsx"],
    shot: { element: D },
    run: async () => {
      // A run made by mistake: the real ones keep their results for the
      // matrix (chapter 13) and the Home.
      await openSection("runs");
      await byTestId("run-new").click();
      await byTestId("run-new-title").setValue("Run creado por error");
      await pickCase("PH-004");
      await byTestId("run-cases-confirm").click();
      await browser.waitUntil(async () => /\/runs\/[^/?]+/.test(await browser.getUrl()), { timeoutMsg: "the run screen did not open" });
      await byTestId("run-delete").click();
      await expect(byTestId("run-delete-hidden")).toBeDisplayed();
      await expect(byTestId("run-delete-confirm")).toBeEnabled();
    },
  });

  step("run-borrado", {
    title: "Run eliminado",
    caption:
      "Al confirmar vuelves a la lista de runs, donde ya no aparece; el registro de auditoría guarda la eliminación con lo que ocultó. El run pasa a la Papelera (Administración › General, capítulo 15): desde allí se restaura con sus resultados mientras dure la retención, y pasada esta la purga se lo lleva.",
    run: async () => {
      await byTestId("run-delete-confirm").click();
      await $(D).waitForExist({ reverse: true });
      await browser.waitUntil(async () => /\/runs\/?(\?|$)/.test(await browser.getUrl()), {
        timeoutMsg: "the runs list did not open after deleting the run",
      });
      // No row in hover state in the picture.
      await $("h1, h2").moveTo();
    },
  });
});
