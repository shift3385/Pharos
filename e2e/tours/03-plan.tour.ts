// Chapter 3 — Plan de pruebas: the 19-step ISO/IEC/IEEE 29119 wizard
// (Cronograma included), saving, revisions, the unsaved-changes guard and
// export / import as .xlsx and .pdf.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import {
  PROJECT_A,
  acceptNativeDialog,
  button,
  byTestId,
  chooseFile,
  dialog,
  es,
  field,
  hasText,
  menuItem,
  openProject,
  pickFromMenu,
  openSection,
  selectOption,
  tf,
  waitForText,
  xpathString,
} from "./helpers";

const P = es.testPlan;
const downloadsDir = process.env.PHAROS_TOURS_DOWNLOADS ?? "";

/** Opens a wizard step from the rail of steps (wide desktop). */
async function goToStep(id: keyof typeof P.step) {
  await $("nav.tpw-rail").$(`button*=${P.step[id]}`).click();
  await expect($("h2.tpw__title")).toHaveText(P.step[id]);
}

/** Adds rows to a ListField (one input per row). */
async function fillList(label: string, items: string[]) {
  const group = $(`[role="group"][aria-label="${label}"]`);
  for (const item of items) {
    await group.$(".tp-list-field__add").click();
    const inputs = await group.$$("input");
    await inputs[inputs.length - 1].setValue(item);
  }
}

/** Adds rows to a PairListField (two inputs per row). */
async function fillPairs(label: string, rows: [string, string][]) {
  const group = $(`[role="group"][aria-label="${label}"]`);
  for (const [a, b] of rows) {
    await group.$(".tp-list-field__add").click();
    const inputs = await group.$$("input");
    await inputs[inputs.length - 2].setValue(a);
    await inputs[inputs.length - 1].setValue(b);
  }
}

/** Selects pills (CheckboxGroup) by their visible text. */
async function pickPills(label: string, names: string[]) {
  const group = $(`[role="group"][aria-label="${label}"]`);
  for (const name of names) {
    await group.$(`.//button[@class="tp-pill"][normalize-space(.)=${xpathString(name)}]`).click();
  }
}

/** Sets a value on an <input type="date"> the way React notices. */
async function setDate(el: WebdriverIO.Element, iso: string) {
  await browser.execute(
    (input: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    el as unknown as HTMLInputElement,
    iso,
  );
}

/** A day of the month the calendar shows (`dd` = "09"). */
const day = (dd: string) => $(`.tps-grid [data-day$="-${dd}"]`);

async function next() {
  await $(".tpw__next").click();
}

/** The newest file in the tour downloads folder with that extension. */
function newestDownload(ext: string): string {
  const files = readdirSync(downloadsDir)
    .filter((f) => f.toLowerCase().endsWith(ext))
    .map((f) => ({ f, t: statSync(join(downloadsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error(`no ${ext} in ${downloadsDir}`);
  return join(downloadsDir, files[0].f);
}

chapter("plan", () => {
  step("asistente", {
    title: "El asistente del plan",
    caption: "Entra en el proyecto y pulsa «Plan de pruebas» en el menú lateral. A la izquierda, los 19 pasos con su progreso; en el centro, el paso actual (aquí, el título y su estado); a la derecha, «Estado del plan».",
    covers: ["section:plan", "wizard:title"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("plan");
      await expect(byTestId("plan-wizard")).toBeDisplayed();
      await $("#tp-title").setValue("Plan de pruebas · Banca Móvil 2.0");
      await selectOption(P.status, P.statusLabel.draft);
    },
  });

  step("meta", {
    title: "Paso 2 · Versión, fecha y autor",
    caption: "«Siguiente» avanza al paso 2: versión y fecha del plan. El autor es tu nombre oficial del perfil.",
    covers: ["wizard:meta", "action:plan-step-nav"],
    run: async () => {
      await next();
      await expect($("h2.tpw__title")).toHaveText(P.step.meta);
      await (await field(P.version)).setValue("2.0");
      await setDate(await field(P.date), "2026-11-02");
    },
  });

  step("resumen", {
    title: "Paso 3 · Resumen",
    caption: "El resumen presenta el plan. Con la IA configurada, «✨ Asistir con IA» propone un texto que puedes usar o descartar (capítulo 11).",
    covers: ["wizard:summary"],
    run: async () => {
      await next();
      await (await field(P.summary)).setValue(
        "Plan de pruebas de la versión 2.0 de la app de Banca Móvil: transferencias, pagos con QR y notificaciones push, en iOS y Android.",
      );
    },
  });

  step("alcance", {
    title: "Paso 4 · Alcance",
    caption: "Qué entra y qué queda fuera. «+ Añadir» crea una fila; la papelera la quita (pide confirmar si tiene texto).",
    covers: ["wizard:scope"],
    run: async () => {
      await next();
      await fillList(P.scopeIn, ["Transferencias entre cuentas propias y a terceros", "Pagos con código QR", "Notificaciones push"]);
      await fillList(P.scopeOut, ["Banca de empresas", "Migración de datos del sistema anterior"]);
    },
  });

  step("tipos", {
    title: "Paso 5 · Tipos de prueba",
    caption: "Marca los tipos de prueba, agrupados en cobertura funcional y no funcional. «Otro» añade uno propio.",
    covers: ["wizard:types"],
    run: async () => {
      await next();
      await pickPills(P.step.types, [P.typeLabel.functional, P.typeLabel.regression, P.typeLabel.security, P.typeLabel.usability, P.typeLabel.performance]);
    },
  });

  step("metodologia", {
    title: "Paso 6 · Metodología",
    caption: "Ágil (duración del sprint y reuniones con su frecuencia) o tradicional (fases). La duración del sprint se usa luego en el cronograma.",
    covers: ["wizard:methodology"],
    run: async () => {
      await next();
      await selectOption(P.methodology, P.agile);
      const ceremonies = await $(`[role="group"][aria-label="${P.ceremonies}"]`).$$(".tp-pill");
      for (const pill of ceremonies.slice(0, 3)) await pill.click();
    },
  });

  step("niveles", {
    title: "Paso 7 · Niveles de prueba",
    caption: "Unitarias, integración, sistema y aceptación: marca los que cubre el plan.",
    covers: ["wizard:levels"],
    run: async () => {
      await next();
      await pickPills(P.step.levels, [P.levelLabel.integration, P.levelLabel.system, P.levelLabel.acceptance]);
    },
  });

  step("entregables", {
    title: "Paso 8 · Entregables",
    caption: "La lista sigue la documentación de ISO/IEC/IEEE 29119-3. «Otro entregable» añade uno propio, marcado como «Propio».",
    covers: ["wizard:deliverables"],
    run: async () => {
      await next();
      const checks = await $$(".tpw-check input[type=checkbox]");
      for (const c of checks.slice(0, 4)) await c.click();
      await (await field(P.deliverables.other)).setValue("Informe de accesibilidad");
      await browser.keys("Enter");
      await expect($(hasText("Informe de accesibilidad"))).toBeDisplayed();
    },
  });

  step("entorno", {
    title: "Paso 9 · Entorno de pruebas",
    caption: "Cómo es el entorno y qué hardware y software necesita.",
    covers: ["wizard:environment"],
    run: async () => {
      await next();
      await (await field(P.environmentConfig)).setValue("Entorno de preproducción con datos anonimizados; API de pagos en modo sandbox.");
      await (await field(P.environmentRequirements)).setValue("iPhone 14 (iOS 18), Pixel 8 (Android 15), Chrome y Edge actuales.");
    },
  });

  step("herramientas", {
    title: "Paso 10 · Herramientas y automatización",
    caption: "Elige herramientas de la lista (las más usadas arriba; «Más herramientas» abre el resto con buscador) o añade una propia, y describe la estrategia de automatización.",
    covers: ["wizard:tools"],
    run: async () => {
      await next();
      const pills = await $$(".tpw-tools .tp-pill, .tp-pill");
      for (const p of pills.slice(0, 3)) await p.click();
      await (await field(P.automationStrategy)).setValue("Regresión automatizada con Playwright en cada build nocturna; humo en cada PR.");
    },
  });

  step("datos", {
    title: "Pasos 11 y 12 · Datos y defectos",
    caption: "Cómo se gestionan los datos de prueba y los defectos (este segundo, en el paso 12).",
    covers: ["wizard:testData", "wizard:defects"],
    run: async () => {
      await next();
      await (await field(P.testDataManagement)).setValue("Clientes sintéticos generados por script; ningún dato real.");
      await next();
      await (await field(P.defectManagement)).setValue("Defectos en Pharos con severidad y prioridad; revisión diaria en la reunión del equipo.");
    },
  });

  step("roles", {
    title: "Paso 13 · Roles y responsabilidades",
    caption: "Cada fila es un rol y su responsabilidad.",
    covers: ["wizard:roles"],
    run: async () => {
      await next();
      await fillPairs(P.step.roles, [
        ["Líder de QA", "Planifica, prioriza y aprueba el cierre"],
        ["Analista de pruebas", "Diseña y ejecuta los casos"],
      ]);
    },
  });

  step("cronograma", {
    title: "Paso 14 · Cronograma",
    caption: "Con «Sprint» marcado, haz clic en el día de inicio y en el de fin para crear un sprint; «Siguiente sprint» añade el siguiente con la duración del paso 6. Cada sprint aparece también en su fila, con fechas editables.",
    covers: ["wizard:schedule"],
    run: async () => {
      await next();
      await expect($('[role="grid"].tps-grid')).toBeDisplayed();
      await $(`.tps-seg__btn=${P.schedule.modeSprint}`).click();
      await day("09").click();
      await day("22").click();
      await expect($$("section.tps-list .tps-row")).toBeElementsArrayOfSize({ gte: 1 });
      await $("button.tps-next").click();
    },
  });

  step("cronograma-hito", {
    title: "Cronograma: hitos con el teclado",
    caption: "Con «Hito», un clic en un día añade un hito. También con el teclado: las flechas mueven el foco por el calendario e Intro marca el día.",
    covers: ["action:schedule-milestone", "keyboard:schedule-calendar"],
    run: async () => {
      await $(`.tps-seg__btn=${P.schedule.modeMilestone}`).click();
      await day("25").click();
      await day("26").click();
      await browser.keys(["ArrowRight", "Enter"]);
      const names = await $$('input.tps-name[aria-label^="' + P.milestoneName + '"]');
      expect(names.length).toBeGreaterThanOrEqual(2);
      // Replace the default names («Hito 1»…): select all, then type.
      for (const [i, name] of ["Congelación de código", "Salida a producción"].entries()) {
        await names[i].click();
        await browser.keys(["Control", "a"]);
        await browser.keys([...name]);
        await expect(names[i]).toHaveValue(name);
      }
    },
  });

  step("riesgos", {
    title: "Paso 15 · Riesgos y mitigación",
    caption: "Cada riesgo con su mitigación. Con IA, «✨ Sugerir riesgos con IA» propone una lista para añadir (capítulo 11).",
    covers: ["wizard:risks"],
    run: async () => {
      await next();
      await fillPairs(P.step.risks, [
        ["Retraso del proveedor de pagos QR", "Simulador propio del servicio de QR"],
        ["Pocos dispositivos Android antiguos", "Granja de dispositivos en la nube"],
      ]);
    },
  });

  step("comunicacion", {
    title: "Pasos 16 a 18 · Comunicación, cierre y propósito",
    caption: "El plan de comunicación, los criterios de cierre (criterio y métrica, que «Inicio» muestra como criterios de salida) y el propósito del documento.",
    covers: ["wizard:communication", "wizard:closure", "wizard:purpose"],
    run: async () => {
      await next();
      await (await field(P.communicationPlan)).setValue("Informe semanal de avance; aviso inmediato de defectos críticos al responsable de producto.");
      await next();
      await fillPairs(P.step.closure, [["Casos críticos ejecutados", "100 %"]]);
      await next();
      await (await field(P.purpose)).setValue("Asegurar que la versión 2.0 cumple los requisitos antes de su publicación en las tiendas.");
    },
  });

  step("conclusion", {
    title: "Paso 19 · Conclusión y «Antes de terminar»",
    caption: "El último paso resume qué falta: «Antes de terminar» lista los pasos incompletos con un enlace a cada uno.",
    covers: ["wizard:conclusion"],
    run: async () => {
      await next();
      await (await field(P.conclusion)).setValue("Pendiente de la ejecución del ciclo de regresión.");
      await expect($("section.tpw-finish")).toBeDisplayed();
    },
  });

  step("guardar", {
    title: "Guardar el plan",
    caption: "«Finalizar plan» (o «Guardar», arriba) guarda el plan: aparece «Plan de pruebas guardado» y la cabecera del proyecto pasa a «Plan borrador».",
    toast: true,
    covers: ["action:plan-save"],
    run: async () => {
      await button(P.nav.finish).click();
      await waitForText(P.savedToast);
      await expect($(".pj-header")).toHaveText(expect.stringContaining(es.projects.header.plan.draft));
    },
  });

  step("salir-sin-guardar", {
    title: "Salir con cambios sin guardar",
    caption: "Si cambias algo y sales sin guardar, Pharos pregunta antes de descartar los cambios. «Seguir editando» te devuelve al plan.",
    covers: ["dialogs:src/modules/test-plan/ui/TestPlanWizard.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await goToStep("summary");
      await (await field(P.summary)).addValue(" Incluye la nueva pantalla de inicio.");
      await byTestId("nav-project-cases").click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("revisiones", {
    title: "Revisiones del plan",
    caption: "Cada guardado crea una revisión. «Revisiones» las lista y «Restaurar» recupera el contenido de una (pide confirmación; después guarda para conservarla).",
    covers: ["dialogs:src/modules/test-plan/ui/wizard/PlanSidePanels.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await $('[role="alertdialog"]').$(`button=${es.dialog.unsaved.keep}`).click();
      await button(P.save).click();
      await waitForText(P.savedToast);
      await button(P.revisions).click();
      await expect(dialog().$(".tp-revs__restore")).toBeDisplayed();
    },
  });

  step("restaurar", {
    title: "Restaurar una revisión",
    caption: "Al confirmar, el plan vuelve al contenido de esa revisión, sin guardar todavía.",
    covers: ["dialogs:src/modules/test-plan/ui/TestPlanWizard.tsx"],
    shot: false,
    run: async () => {
      await dialog().$(".tp-revs__restore").click();
      await acceptNativeDialog();
      await browser.keys("Escape");
      await button(P.save).click();
      await waitForText(P.savedToast);
    },
  });

  step("exportar", {
    title: "Exportar el plan",
    caption: "«Importar / Exportar» genera el plan en .pdf (listo para firmar) o .xlsx (editable en Excel) en tu carpeta de descarga.",
    covers: ["action:plan-export"],
    run: async () => {
      await button(P.io.button).click();
      await expect(menuItem(P.io.exportPdf)).toBeDisplayed();
    },
  });

  step("importar", {
    title: "Importar un plan desde .xlsx",
    caption: "«Importar .xlsx» rellena el plan desde una plantilla o un plan exportado. El informe muestra qué campos se reconocieron antes de aplicarlos al formulario.",
    covers: ["upload:src/modules/test-plan/ui/TestPlanWizard.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await menuItem(P.io.exportPdf).click();
      await waitForText(tf("testPlan.exportedToast", { name: "" }).replace(/«»$/, ""), 60_000);
      const before = Date.now();
      await pickFromMenu(P.io.button, P.io.exportXlsx);
      // The new .xlsx, once its size stops changing (written in full).
      let xlsx = "";
      let lastSize = -1;
      await browser.waitUntil(
        async () => {
          try {
            const file = newestDownload(".xlsx");
            const { mtimeMs, size } = statSync(file);
            const done = mtimeMs >= before - 1000 && size > 0 && size === lastSize;
            lastSize = size;
            xlsx = file;
            return done;
          } catch {
            return false;
          }
        },
        { timeout: 30_000, interval: 300, timeoutMsg: "the plan .xlsx was not exported" },
      );
      await chooseFile('input[type="file"][accept=".xlsx"]', xlsx);
      await expect(dialog()).toBeDisplayed();
    },
  });

  step("importado", {
    title: "Plan importado",
    caption: "«Aplicar al formulario» carga los datos en el asistente; revisa y guarda.",
    shot: false,
    run: async () => {
      const apply = $(`button=${es.importReport.apply}`);
      await apply.waitForEnabled({ timeout: 30_000 });
      await apply.click();
      await waitForText(P.import.applied);
      await button(P.save).click();
      await waitForText(P.savedToast);
    },
  });
});
