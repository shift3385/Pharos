// Chapter 13 — Ejecución manual (EJE-02, wave E5): a manual run, its screen,
// the keyboard-first executor (marks per step, notes, evidence), saving the
// attempt, a defect from a failed attempt, and closing / reopening the run.
// Selectors: the data-testids of src/modules/runs/README.md.
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import { PROJECT_A, byTestId, chooseFile, clickButton, es, field, fixturesDir, openProject, openSection, waitForToast } from "./helpers";

const E = es.execution;
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
      await waitForToast(E.attached_one);
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
      await waitForToast(E.recorded.split("{{")[0]);
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
      await waitForToast(es.defects.savedToast);
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
      await waitForToast(E.run.saved);
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
});
