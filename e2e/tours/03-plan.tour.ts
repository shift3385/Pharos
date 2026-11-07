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
  atLeast,
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
  waitForToast,
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

/** Adds rows to a PairListField (two text areas per row). */
async function fillPairs(label: string, rows: [string, string][]) {
  const group = $(`[role="group"][aria-label="${label}"]`);
  for (const [a, b] of rows) {
    await group.$(".tp-list-field__add").click();
    const fields = await group.$$("textarea");
    await fields[fields.length - 2].setValue(a);
    await fields[fields.length - 1].setValue(b);
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
    caption:
      "El plan de pruebas se redacta con un asistente de 19 pasos que sigue la norma ISO/IEC/IEEE 29119. Entra en el proyecto y pulsa «Plan de pruebas» en el menú lateral. A la izquierda tienes la lista de pasos, con una marca en los que ya están completos y el porcentaje de avance; en el centro, el paso actual (el primero pide el título del plan, en este ejemplo «Plan de pruebas · Banca Móvil 2.0», y su estado); a la derecha, «Estado del plan» resume estado, versión, autor y última actualización. No hace falta seguir el orden: puedes saltar a cualquier paso desde la lista.",
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
    caption:
      "«Siguiente», al pie, avanza al paso 2. Indica la versión del documento (en este ejemplo, «2.0») y su fecha. El autor no se escribe: es tu nombre oficial del perfil (capítulo 1), el mismo que firma el plan cuando lo exportas.",
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
    caption:
      "El resumen es lo primero que leerá quien reciba el plan: describe en pocas líneas qué se prueba y por qué (en este ejemplo, la versión 2.0 de una app de banca móvil). Si has configurado un motor de IA (capítulo 10), el botón de IA (✨, «Asistir con IA») propone un borrador que puedes usar, editar o descartar; nada se aplica sin que lo aceptes (capítulo 11).",
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
    caption:
      "El alcance fija qué se prueba y, tan importante como eso, qué no: así nadie da por cubierto lo que queda fuera. En «Elementos dentro del alcance» y «Fuera del alcance», «+ Añadir» crea una fila por elemento (en este ejemplo, transferencias, pagos con QR y notificaciones dentro; banca de empresas y migración de datos fuera). El icono de papelera de cada fila («Quitar») la elimina; si la fila tiene texto, el botón pide confirmarlo con «Sí, eliminar» o «Cancelar».",
    covers: ["wizard:scope"],
    run: async () => {
      await next();
      await fillList(P.scopeIn, ["Transferencias entre cuentas propias y a terceros", "Pagos con código QR", "Notificaciones push"]);
      await fillList(P.scopeOut, ["Banca de empresas", "Migración de datos del sistema anterior"]);
    },
  });

  step("tipos", {
    title: "Paso 5 · Tipos de prueba",
    caption:
      "Marca los tipos de prueba que el equipo se compromete a ejecutar, agrupados en cobertura funcional (funcional, regresión…) y no funcional (seguridad, usabilidad, rendimiento…). En este ejemplo hay cinco marcados. Si el que necesitas no está en la lista, «Otro» añade uno propio.",
    covers: ["wizard:types"],
    run: async () => {
      await next();
      await pickPills(P.step.types, [P.typeLabel.functional, P.typeLabel.regression, P.typeLabel.security, P.typeLabel.usability, P.typeLabel.performance]);
    },
  });

  step("metodologia", {
    title: "Paso 6 · Metodología",
    caption:
      "Indica cómo trabaja el equipo. Con «Ágil» defines la duración del sprint (en semanas) y las reuniones del equipo, cada una con su frecuencia (por ejemplo, una vez por sprint); con «Tradicional», las fases del proyecto. La duración del sprint no es solo informativa: el cronograma (paso 14) la usa para proponer el siguiente sprint.",
    covers: ["wizard:methodology"],
    run: async () => {
      await next();
      await selectOption(P.methodology, P.agile);
      // Daily, review and retrospective on. A new plan already has them, so a
      // blind click would turn them off (what MAN-01 first captured).
      const group = $(`[role="group"][aria-label="${P.ceremonies}"]`);
      for (const name of [P.ceremonyLabel.daily, P.ceremonyLabel.review, P.ceremonyLabel.retrospective]) {
        const pill = group.$(`button.tp-pill=${name}`);
        if ((await pill.getAttribute("aria-pressed")) !== "true") await pill.click();
      }
      await expect(byTestId("ceremony-frequencies")).toBeDisplayed();
      // FIX-14: nothing left to ask, and the step is marked done.
      await expect(byTestId("methodology-gaps")).toHaveText("");
      await expect($("nav.tpw-rail").$(`button*=${P.step.methodology}`)).toHaveAttribute("data-done", "true");
    },
  });

  step("niveles", {
    title: "Paso 7 · Niveles de prueba",
    caption:
      "Los niveles indican en qué capas del producto se prueba: unitarias, integración, sistema y aceptación. Marca solo los que cubre este plan (en este ejemplo, integración, sistema y aceptación); lo que no marques queda, de forma explícita, fuera de este plan.",
    covers: ["wizard:levels"],
    run: async () => {
      await next();
      await pickPills(P.step.levels, [P.levelLabel.integration, P.levelLabel.system, P.levelLabel.acceptance]);
    },
  });

  step("entregables", {
    title: "Paso 8 · Entregables",
    caption:
      "Los entregables son los documentos y artefactos que el equipo de pruebas se compromete a producir. La lista sigue la documentación de ISO/IEC/IEEE 29119-3, agrupada en gestión de pruebas, especificación, datos y entorno, ejecución y resultados, y aceptación. Marca los que se acordaron con el proyecto y desmarca los que no se van a entregar: el plan deja constancia de ese acuerdo y sirve de referencia al cerrar el ciclo. Si se acordó algo que no está en la lista, escríbelo en «Otro entregable» y pulsa «Añadir» (en este ejemplo, «Informe de accesibilidad»): aparece en «Aceptación y otros» con la etiqueta «Propio» y su papelera para quitarlo.",
    covers: ["wizard:deliverables"],
    focus: ".tpw-check--own",
    run: async () => {
      await next();
      const checks = await atLeast(".tpw-check input[type=checkbox]", 4);
      for (const c of checks.slice(0, 4)) await c.click();
      await (await field(P.deliverables.other)).setValue("Informe de accesibilidad");
      await browser.keys("Enter");
      await expect($(hasText("Informe de accesibilidad"))).toBeDisplayed();
    },
  });

  step("entorno", {
    title: "Paso 9 · Entorno de pruebas",
    caption:
      "Describe dónde se va a probar: la configuración del entorno (en este ejemplo, preproducción con datos anonimizados y la API de pagos en modo sandbox) y el hardware y software que necesita (dispositivos, sistemas y navegadores). Sirve para preparar el entorno a tiempo y para saber, ante un fallo, en qué condiciones se encontró.",
    covers: ["wizard:environment"],
    run: async () => {
      await next();
      await (await field(P.environmentConfig)).setValue("Entorno de preproducción con datos anonimizados; API de pagos en modo sandbox.");
      await (await field(P.environmentRequirements)).setValue("iPhone 14 (iOS 18), Pixel 8 (Android 15), Chrome y Edge actuales.");
    },
  });

  step("herramientas", {
    title: "Paso 10 · Herramientas y automatización",
    caption:
      "Elige las herramientas del proyecto: arriba, las más usadas en QA; «Más herramientas» despliega el resto por categorías, con buscador; si la tuya no está, escríbela en «¿No está en la lista?» y pulsa «Añadir». Las elegidas quedan resaltadas (en este ejemplo, Playwright, Selenium y Cypress). Después describe la estrategia de automatización: qué se automatiza, con qué y cuándo se ejecuta. el botón de IA (✨, «Asistir con IA») propone un borrador de esa estrategia; se activa cuando configuras un motor de IA en Administración (capítulo 10), como en esta captura, donde aún aparece en gris.",
    covers: ["wizard:tools"],
    focus: "button*=Asistir con IA",
    run: async () => {
      await next();
      const pills = await atLeast(".tpw-tools .tp-pill", 3);
      for (const p of pills.slice(0, 3)) await p.click();
      await (await field(P.automationStrategy)).setValue("Regresión automatizada con Playwright en cada build nocturna; humo en cada PR.");
    },
  });

  step("datos", {
    title: "Pasos 11 y 12 · Datos y defectos",
    caption:
      "Dos pasos de texto libre. En el 11, cómo se consiguen y se protegen los datos de prueba (en este ejemplo, clientes sintéticos generados por script, sin datos reales). En el 12, el que muestra la captura, cómo se gestionan los defectos: dónde se registran, con qué severidad y prioridad y quién los revisa.",
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
    caption:
      "Cada fila une un rol con su responsabilidad, para que quede claro quién decide y quién hace qué (en este ejemplo, el «Líder de QA» planifica, prioriza y aprueba el cierre, y el «Analista de pruebas» diseña y ejecuta los casos). «+ Añadir» crea otra fila y la papelera de cada una la quita. Si has configurado un motor de IA, «Sugerir responsabilidades con IA» propone la responsabilidad de los roles que escribiste y aún no la tienen; eliges cuáles usar, y los roles y lo ya escrito no cambian.",
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
    title: "Paso 14 · Cronograma: sprints",
    caption:
      "El cronograma sitúa en el calendario los sprints y los hitos del ciclo de pruebas. Con «Sprint» elegido, haz clic en el día de inicio y después en el de fin: el sprint aparece como una franja sobre las semanas que ocupa y en la lista «Sprints», con su nombre y sus fechas, que puedes editar. La lista se desplaza por su cuenta, sin mover el calendario. «Siguiente sprint» añade el siguiente a continuación, con la duración que fijaste en la metodología (paso 6). La leyenda explica el calendario: las franjas de sprint alternan azul y ámbar para distinguir un sprint del siguiente, el rombo marca un hito, el círculo ámbar es el día de hoy y el rojo claro señala los días en que dos sprints se solapan (es un aviso: el plan se guarda igualmente). El sprint seleccionado se ve en azul oscuro (en este ejemplo, el segundo) y se resalta su fila; puedes arrastrar sus extremos en el calendario. Las flechas de arriba cambian de mes.",
    covers: ["wizard:schedule"],
    focus: ".tps-legend",
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
    title: "Cronograma: hitos",
    caption:
      "Un hito es una fecha clave que no ocupa días, como una congelación de código o una salida a producción. Elige «Hito» y haz clic en un día: el hito se marca con un rombo ámbar bajo la fecha y se añade a la lista «Hitos», donde le das nombre (en este ejemplo, «Congelación de código» y «Salida a producción») y puedes corregir la fecha. El hito seleccionado se ve con un rombo mayor, con borde azul. También funciona con el teclado: las flechas mueven el foco por los días e Intro marca el día enfocado.",
    covers: ["action:schedule-milestone", "keyboard:schedule-calendar"],
    focus: ".tps-diamond",
    run: async () => {
      await $(`.tps-seg__btn=${P.schedule.modeMilestone}`).click();
      await day("25").click();
      await day("26").click();
      await browser.keys(["ArrowRight", "Enter"]);
      const names = await atLeast(`input.tps-name[aria-label^="${P.milestoneName}"]`, 2);
      // Replace the default names («Hito 1»…): select all, then type.
      for (const [i, name] of ["Congelación de código", "Salida a producción"].entries()) {
        await names[i].click();
        await browser.keys(["Control", "a"]);
        await browser.keys([...name]);
        await expect(names[i]).toHaveValue(name);
      }
      // The capture shows the whole calendar, its «Sprint / Hito» switch included.
      await $(".tps-card").scrollIntoView({ block: "center" });
    },
  });

  step("riesgos", {
    title: "Paso 15 · Riesgos y mitigación",
    caption:
      "Cada fila es un riesgo que podría afectar a las pruebas y su mitigación, es decir, lo que se hará para reducirlo (en este ejemplo, el retraso del proveedor de pagos QR se mitiga con un simulador propio). Cada campo crece con su texto, para que se lea entero. Si has configurado un motor de IA, «Sugerir riesgos con IA» propone riesgos con su mitigación para que elijas cuáles añadir (capítulo 11).",
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
    caption:
      "Tres pasos de texto que completan el plan: el plan de comunicación (paso 16: qué se informa, a quién y cada cuánto), los criterios de cierre (paso 17: cada criterio con su métrica objetivo, en este ejemplo «Casos críticos ejecutados» al «100 %»; «Inicio» los muestra como criterios de salida; con un motor de IA, «Sugerir criterios con IA» propone criterios ligados a los riesgos del plan para que elijas cuáles añadir) y el propósito del documento (paso 18, el de la captura).",
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
    caption:
      "El paso 19 recoge la conclusión del plan y, debajo, «Antes de terminar»: la lista de los pasos que aún están incompletos, cada uno con un enlace que lleva directamente a él. Úsala como lista de comprobación antes de finalizar; un plan con pasos pendientes se guarda igualmente, como borrador.",
    covers: ["wizard:conclusion"],
    focus: "section.tpw-finish",
    run: async () => {
      await next();
      await (await field(P.conclusion)).setValue("Pendiente de la ejecución del ciclo de regresión.");
      await expect($("section.tpw-finish")).toBeDisplayed();
    },
  });

  step("guardar", {
    title: "Guardar el plan",
    caption:
      "«Finalizar plan» (o «Guardar», en la cabecera, desde cualquier paso) guarda el plan: aparece el aviso «Plan de pruebas guardado» y la cabecera del proyecto pasa a «Plan borrador». Guarda a menudo: cada guardado crea además una revisión a la que puedes volver.",
    toast: true,
    covers: ["action:plan-save"],
    run: async () => {
      await button(P.nav.finish).click();
      await waitForToast(P.savedToast);
      await expect($(".pj-header")).toHaveText(expect.stringContaining(es.projects.header.plan.draft));
    },
  });

  step("salir-sin-guardar", {
    title: "Salir con cambios sin guardar",
    caption:
      "Si cambias algo y vas a otra sección sin guardar, Pharos te avisa antes de perder el trabajo. «Seguir editando» te devuelve al plan para guardarlo; «Descartar cambios» sale sin guardar.",
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
    caption:
      "Cada guardado crea una revisión, una copia fechada del plan. «Revisiones», en la cabecera, abre la lista con el número, el título y la fecha de cada una. «Restaurar» vuelve al contenido de una revisión anterior, tras pedir confirmación.",
    covers: ["dialogs:src/modules/test-plan/ui/wizard/PlanSidePanels.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await $('[role="alertdialog"]').$(`button=${es.dialog.unsaved.keep}`).click();
      await button(P.save).click();
      await waitForToast(P.savedToast);
      await button(P.revisions).click();
      await expect(dialog().$(".tp-revs__restore")).toBeDisplayed();
    },
  });

  step("restaurar", {
    title: "Restaurar una revisión",
    caption:
      "Al confirmar, el asistente carga el contenido de esa revisión, todavía sin guardar, para que lo revises. Si es lo que buscabas, pulsa «Guardar»: se crea una revisión nueva y las anteriores se conservan, así que restaurar nunca borra el historial.",
    covers: ["dialogs:src/modules/test-plan/ui/TestPlanWizard.tsx"],
    shot: false,
    run: async () => {
      await dialog().$(".tp-revs__restore").click();
      await acceptNativeDialog();
      await browser.keys("Escape");
      await button(P.save).click();
      await waitForToast(P.savedToast);
    },
  });

  step("exportar", {
    title: "Exportar el plan",
    caption:
      "«Importar / Exportar», en la cabecera, ofrece el plan en .pdf, maquetado y listo para firmar, o en .xlsx, editable en Excel. Al pie, el menú indica qué historial lleva el documento: «Solo la versión vigente» o «Historial de revisiones», según Ajustes del proyecto (capítulo 2). El archivo se guarda en tu carpeta de descarga (Administración › General, capítulo 10) y un aviso indica su nombre.",
    covers: ["action:plan-export"],
    focus: "[role=\"menu\"]",
    run: async () => {
      await button(P.io.button).click();
      await expect(menuItem(P.io.exportPdf)).toBeDisplayed();
    },
  });

  step("importar", {
    title: "Importar un plan desde .xlsx",
    caption:
      "Para traer un plan escrito fuera de Pharos, «Importar / Exportar → Importar .xlsx» lee una plantilla rellenada en Excel o un plan exportado antes (en este ejemplo, el .xlsx que se acaba de exportar). Antes de tocar nada, el informe de importación muestra qué campos reconoció, para que decidas si aplicarlo.",
    covers: ["upload:src/modules/test-plan/ui/TestPlanWizard.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await menuItem(P.io.exportPdf).click();
      await waitForToast(tf("testPlan.exportedToast", { name: "" }).replace(/«»$/, ""), 60_000);
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
    caption:
      "«Aplicar al formulario» carga los datos reconocidos en el asistente, sin guardar todavía: revisa cada paso y pulsa «Guardar» para conservarlos como una revisión nueva.",
    shot: false,
    run: async () => {
      const apply = $(`button=${es.importReport.apply}`);
      await apply.waitForEnabled({ timeout: 30_000 });
      await apply.click();
      await waitForToast(P.import.applied);
      await button(P.save).click();
      await waitForToast(P.savedToast);
    },
  });
});
