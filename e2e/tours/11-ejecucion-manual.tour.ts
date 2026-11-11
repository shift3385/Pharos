// Chapter 11 — Ejecución manual (manual v2, MAN-03; EJE-02): a manual run of
// the access cases of «Pharos», its screen, the keyboard-first executor (marks
// per step, notes, evidence, paste), saving the attempt, a defect from a failed
// attempt, discarding a draft, editing, closing and reopening the run, the
// status report and its exports, the run on a phone and deleting it (EJE-07).
// Selectors: the data-testids of src/modules/runs/README.md.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { DESKTOP, MOBILE, chapter, setViewport, step } from "./tour";
import { PROJECT_A, byTestId, chooseFile, clickButton, es, field, fixturesDir, openProject, openSection, tf, waitForText, waitForToast } from "./helpers";

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

chapter("ejecucion-manual", () => {
  step("nuevo-run", {
    title: "Nuevo run manual",
    caption:
      "Para las pruebas que se hacen a mano fuera de un ciclo, «Nuevo run manual», en «Ejecuciones», crea un run: el título (obligatorio; propone «Run manual» y la fecha), el entorno, la build, la configuración y los casos que entran, con buscador y el recuento de los elegidos. Cada caso entra con su revisión vigente, así que el resultado queda ligado a la versión del caso que se ejecutó. En este ejemplo, Liomar repite a mano los dos casos de acceso de Pharos. «Crear y abrir» lo crea y abre su pantalla.",
    covers: ["dialogs:src/modules/runs/ui/CasePickerDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("runs");
      await byTestId("run-new").click();
      await byTestId("run-new-title").setValue("Regresión manual · 0.3.0-rc1");
      if (await byTestId("run-cases-search").isExisting()) {
        await pickCase("PH-001");
        await pickCase("PH-002");
      }
    },
  });

  step("pantalla-run", {
    title: "La pantalla del run",
    caption: "La pantalla del run muestra su cabecera (clave, título, estado, origen, entorno, build, configuración, ciclo y fechas), el progreso («0/3 ejecutados») y sus elementos, que se filtran por resultado. Un caso Outline o con flujos se ejecuta una vez por fila o por flujo (en este ejemplo, PH-002 tiene dos filas de ejemplos). Arriba, «Añadir casos», «Editar datos», «Cerrar run» y «Eliminar run»; «Ejecutar el siguiente» abre el primer elemento pendiente.",
    covers: ["route:/projects/:projectId/runs/:runId", "screen:manual-run"],
    run: async () => {
      if (await byTestId("run-cases-confirm").isExisting()) await byTestId("run-cases-confirm").click();
      else await clickButton(E.newRun.create, D);
      await browser.waitUntil(async () => /\/runs\/[^/?]+/.test(await browser.getUrl()), { timeoutMsg: "the run screen did not open" });
      if ((await $$('[data-testid="run-item-execute"]')).length === 0) {
        await byTestId("run-add-cases").click();
        await pickCase("PH-001");
        await pickCase("PH-002");
        await byTestId("run-cases-confirm").click();
      }
      await browser.waitUntil(async () => (await $$('[data-testid="run-item-execute"]')).length >= 2, {
        timeoutMsg: "the run has no items to execute",
      });
    },
  });

  step("ejecutor", {
    title: "El ejecutor",
    caption: "Un clic en un caso abre el ejecutor junto a la lista: los pasos del caso con su resultado esperado. Marca cada paso como «Pasa», «Falla», «Bloqueado» u «Omitido» (repetir la marca la quita). Falla y Bloqueado abren «Obtenido / notas» para escribir qué pasó (en este ejemplo, el paso 3 falla: Pharos se queda en la entrada con «Correo o contraseña incorrectos.»). Con el teclado es más rápido: P, F, B y S marcan el paso enfocado; J o ↓ y K o ↑ cambian de paso; N abre las notas; T pone en marcha o pausa el cronómetro.",
    covers: ["action:manual-run-result", "keyboard:exec-keys"],
    run: async () => {
      await $('[data-testid="run-item-execute"][data-case-key="PH-001"]').click();
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
      await browser.keys([..."Se queda en la entrada con «Correo o contraseña incorrectos.»"]);
    },
  });

  step("atajos", {
    title: "Los atajos de teclado",
    caption: "«Atajos» (o la tecla «?») muestra todas las teclas del ejecutor: P / F / B / S marcan, J / K y las flechas cambian de paso, N abre las notas, T el cronómetro, Ctrl+Enter guarda el resultado, Ctrl+Mayús+N pasa al siguiente elemento y Ctrl+V pega una captura. Las letras solo actúan cuando no estás escribiendo en un campo; Ctrl+Enter y Ctrl+Mayús+N, también dentro de un campo.",
    covers: ["dialogs:src/modules/runs/ui/ExecutionPanel.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(E.shortcuts, '[data-testid="exec-panel"]');
      await expect($(D)).toBeDisplayed();
    },
  });

  step("evidencia", {
    title: "Adjuntar evidencias",
    caption: "El clip de cada paso («Adjuntar») y «Adjuntar al resultado» añaden archivos de hasta 200 MB: capturas, vídeos, registros. Se guardan cifrados en este equipo y se muestran como fichas con su miniatura. Mientras ejecutas, todo es un borrador que se guarda solo (lo dice el pie: «Borrador guardado en este equipo»): si cierras la app, lo encuentras al volver. Los adjuntos solo están en la app de escritorio.",
    covers: ["upload:src/modules/runs/ui/ExecutionPanel.tsx"],
    run: async () => {
      // Close the shortcuts dialog the previous step opened.
      await browser.keys("Escape");
      await $(".cd-overlay").waitForExist({ reverse: true });
      await chooseFile('[data-testid="exec-panel"] input[type="file"]', join(fixturesDir, "captura-fallo-acceso.png"));
      await waitForToast(E.attached_one);
    },
  });

  step("pegar-captura", {
    title: "Pegar una captura",
    caption: "Con el foco en un paso o en el resultado, Ctrl+V pega la imagen del portapapeles como evidencia, sin guardarla antes en un archivo: haz la captura con Win+Mayús+S (⌘⇧4 en Mac) y pega. «Pegar captura» hace lo mismo con un clic. La imagen se llama «captura-» con la fecha y la hora.",
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

  step("quitar-evidencia", {
    title: "Quitar una evidencia",
    caption:
      "La papelera de cada ficha («Quitar «nombre»») borra esa evidencia, y no se puede recuperar. Por eso es una confirmación crítica: Esc y el clic fuera no hacen nada; solo responden «Cancelar» o «Quitar», en rojo (en este ejemplo, Liomar quita la captura pegada y conserva la del fallo).",
    covers: ["dialogs:src/modules/runs/ui/ExecutionPanel.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await $('button[aria-label^="' + E.removeFile.split("{{")[0] + 'captura-"]').click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
      await browser.keys("Escape");
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await $('[role="alertdialog"]').$("button.cd__confirm").click();
      await $('[role="alertdialog"]').waitForExist({ reverse: true });
    },
  });

  step("guardar", {
    title: "Guardar el resultado",
    caption:
      "«Guardar resultado (Falla)» (o Ctrl+Enter) registra el intento con el estado que resulta de los pasos; el selector «Resultado» permite fijar otro a mano. Los pasos sin marcar se guardan como Omitido, y el aviso lo dice antes. Un intento guardado no cambia: repetir la prueba crea otro intento («Intento 2»), así que el historial de lo que pasó se conserva en «Intentos», debajo.",
    run: async () => {
      await byTestId("exec-save").click();
      await waitForToast(E.recorded.split("{{")[0]);
      await expect(byTestId("exec-create-defect")).toBeDisplayed();
    },
  });

  step("crear-defecto", {
    title: "Crear un defecto desde el intento fallido",
    caption: "En un intento fallido o bloqueado, «Crear defecto» abre el editor de defectos relleno con los pasos de la revisión ejecutada, lo obtenido, la build y el entorno, ya vinculado al resultado y a su caso, y con sus evidencias (sin copiar los archivos). «Guardar y crear defecto», en un paso que falla, hace lo mismo sin guardar antes el intento. Los vínculos ofrecen los casos y los requisitos del proyecto, como en «Defectos» (capítulo 12).",
    run: async () => {
      await byTestId("exec-create-defect").click();
      await expect($(".tp-editor__save")).toBeDisplayed();
    },
    // The capture shows the prefilled editor; saving it is part of the step.
    after: async () => {
      await $(".tp-editor__save").click();
      await waitForToast(es.defects.savedToast);
    },
  });

  step("descartar", {
    title: "Descartar un borrador",
    caption:
      "Si un borrador no te sirve, «Descartar borrador» tira sus marcas, notas y adjuntos, después de confirmarlo («¿Descartar el borrador?»). Los intentos ya guardados no cambian.",
    covers: ["dialogs:src/modules/runs/ui/ExecutionPanel.tsx"],
    shot: { element: D },
    run: async () => {
      if (await $(".tp-editor__back").isExisting()) await $(".tp-editor__back").click().catch(() => undefined);
      await $('[data-testid="run-item-execute"][data-case-key="PH-002"]').click();
      await expect(byTestId("exec-panel")).toBeDisplayed();
      await byTestId("exec-step-1-pass").click();
      await byTestId("exec-discard").click();
      await expect($(D)).toBeDisplayed();
    },
  });

  step("editar-run", {
    title: "Editar los datos del run",
    caption:
      "«Editar datos» corrige el título, el entorno o la build del run, si te equivocaste al crearlo.",
    covers: ["dialogs:src/modules/runs/ui/RunDetail.tsx"],
    shot: { element: D },
    run: async () => {
      await $(D).$("button.cd__confirm").click();
      await $(".cd-overlay").waitForExist({ reverse: true });
      await byTestId("run-edit").click();
      await expect($(D)).toBeDisplayed();
      await (await field(es.runs.field.environment, D)).setValue("staging");
      await (await field(es.runs.field.build, D)).setValue("0.3.0-rc1");
    },
  });

  step("cerrar-run", {
    title: "Cerrar el run",
    caption: "«Cerrar run» avisa de lo que queda sin ejecutar y de los borradores sin guardar, y pide cómo se cierra: «Completado» o «Cancelado» (cancelar descarta los borradores). Un run cerrado no admite intentos nuevos; «Reabrir» lo vuelve a abrir, salvo que su ciclo esté cerrado.",
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
      // The executor of the last item is still open: on a phone it takes the screen.
      await browser.waitUntil(
        async () =>
          (await byTestId("exec-panel").isDisplayed().catch(() => false)) ||
          (await $('[data-testid="run-item-execute"]').isDisplayed().catch(() => false)),
        { timeoutMsg: "neither the executor nor the item list shows on a phone" },
      );
    },
    after: async () => {
      await setViewport(DESKTOP);
    },
  });

  step("informe-estado", {
    title: "Informe de estado",
    caption: "En «Ejecuciones» (o en la cabecera de un ciclo), «Informe de estado» genera el informe de estado de pruebas (ISO/IEC/IEEE 29119-3) del proyecto, de un ciclo o del plan, entre las fechas que elijas en «Desde» y «Hasta» (con el selector de fechas de Pharos del capítulo 5: «Hasta» abre en el mes de «Desde» y no deja elegir un día anterior): identificación, progreso, resultados por estado, defectos por severidad (a fecha de hoy), cobertura y riesgos, los criterios de salida del plan (cumple / no cumple / sin datos), bloqueos, resumen y recomendaciones. El resumen se rellena solo con las cifras y se puede cambiar; en este ejemplo, Liomar escribe sus recomendaciones. Los dos se guardan solo en este equipo y van en las exportaciones.",
    covers: ["dialogs:src/modules/runs/report/StatusReportDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await openSection("runs");
      await byTestId("runs-report").click();
      await expect(byTestId("status-report")).toBeDisplayed();
      await waitForText(es.statusReport.section.exit);
      await byTestId("report-recommendations").setValue("Repetir PH-001 cuando se corrija el fallo de acceso y cerrar el ciclo «Regresión 0.3.0».");
    },
  });

  step("informe-xlsx", {
    title: "Exportar el informe a Excel",
    caption: "«Exportar .xlsx» guarda el informe en tu carpeta de descarga: una hoja «Resumen» con las nueve secciones y hojas con los resultados por caso, los defectos y la cobertura por requisito. Un aviso dice el nombre del archivo.",
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
    caption: "«Eliminar run», en la cabecera de un run (solo en la app de escritorio), lo quita de las listas y del progreso, en este equipo y en los que sincronicen. En este ejemplo, Liomar elimina un run que creó por error. Antes dice qué se oculta: elementos, resultados, evidencias, borradores que se descartan, el ciclo cuyo progreso deja de contarlo y los defectos vinculados. Los resultados nunca se borran a mano: la purga se los lleva con el run pasada la retención (Administración › General). Un run de un ciclo cerrado no se puede eliminar.",
    covers: ["dialogs:src/modules/runs/ui/DeleteRunDialog.tsx"],
    shot: { element: D },
    run: async () => {
      // A run made by mistake: the real ones keep their results for the
      // matrix (chapter 13) and the Home.
      await openSection("runs");
      await byTestId("run-new").click();
      await byTestId("run-new-title").setValue("Run creado por error");
      if (await byTestId("run-cases-search").isExisting()) await pickCase("PH-004");
      if (await byTestId("run-cases-confirm").isExisting()) await byTestId("run-cases-confirm").click();
      else await clickButton(E.newRun.create, D);
      await browser.waitUntil(async () => /\/runs\/[^/?]+/.test(await browser.getUrl()), { timeoutMsg: "the run screen did not open" });
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
