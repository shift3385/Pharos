// Chapter 5 — Plan de pruebas (manual v2, MAN-03): the 17-step ISO/IEC/IEEE
// 29119 wizard (UX-31) filled with the plan of Pharos 0.3.0 (the app under test), the
// schedule calendar with mouse and keyboard, saving, the unsaved-changes
// guard, revisions, export / import as .xlsx and .pdf. The AI buttons of the
// plan are toured in chapter 17 (they need a real key).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import {
  PROJECT_A,
  acceptConfirm,
  atLeast,
  button,
  byTestId,
  chooseFile,
  chooseOption,
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
  typeDate,
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

/** Ticks the checkboxes of the columns of a step (UX-31) by the start of
 *  their label («Integración» for «Integración · interfaces»), leaving the
 *  ones already ticked as they are. */
async function tick(names: string[]) {
  for (const name of names) {
    const box = $(
      `.//label[contains(@class,"tpw-check")][starts-with(normalize-space(.), ${xpathString(name)})]/input[@type="checkbox"]`,
    );
    if (!(await box.isSelected())) await box.click();
  }
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
      "El plan de pruebas dice qué se prueba, cómo, con qué medios, quién y cuándo. Pharos lo redacta con un asistente de 17 pasos que sigue la norma ISO/IEC/IEEE 29119-3: «Plan de pruebas», la primera sección del proyecto. A la izquierda, la lista de pasos con una ✓ en los completos y el porcentaje de avance; en el centro, el paso actual, con «Paso N de 17» y si hay cambios sin guardar; a la derecha, «Estado del plan» (estado, versión, autor y última actualización). No hace falta seguir el orden: salta a cualquier paso desde la lista.",
    covers: ["section:plan"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("plan");
      await expect(byTestId("plan-wizard")).toBeDisplayed();
      await expect($("h2.tpw__title")).toHaveText(P.step.identification);
    },
  });

  step("identificacion", {
    title: "Paso 1 · Identificación del plan",
    caption:
      "El paso 1 es el bloque de identificación del documento de ISO/IEC/IEEE 29119-3: el título (en este ejemplo, «Plan de pruebas de Pharos 0.3.0»), el estado (Borrador, Revisado, Aprobado u Obsoleto), la versión («0.3») y la fecha. El autor no se escribe: es tu nombre oficial del perfil (en este ejemplo, Liomar Rodríguez, capítulo 1); lo ves en el panel «Estado del plan» y firma el plan cuando lo exportas. El estado se elige en una lista desplegable de Pharos, como todas las de la aplicación: la opción elegida lleva una ✓, y con el teclado ↑ ↓ recorren las opciones, una letra salta a la que empieza por ella, Intro elige y Esc cierra; en el móvil se abre como una hoja desde abajo.",
    covers: ["wizard:identification", "action:pharos-select"],
    focus: ".popover .pselect__option[data-selected]",
    run: async () => {
      await $("#tp-title").setValue("Plan de pruebas de Pharos 0.3.0");
      await (await field(P.version)).setValue("0.3");
      await typeDate(await field(P.date), "2026-11-02");
      await selectOption(P.status, P.statusLabel.draft);
      // The capture shows the list open, with the ✓ on «Borrador».
      await $("#tp-status").click();
      await expect($('[role="listbox"]')).toBeDisplayed();
    },
  });

  step("fecha", {
    title: "La fecha: el selector de fechas de Pharos",
    caption:
      "La fecha se escribe dd/mm/aaaa (en este ejemplo, 02/11/2026) o se elige en el calendario de Pharos, el mismo del cronograma: el botón del calendario, al final del campo, lo abre en el mes de la fecha, con el mes y el año arriba («Noviembre de 2026») y ‹ › para cambiar de mes. Hoy lleva un anillo naranja y el día elegido va relleno. Con el teclado, las flechas recorren los días, RePág y AvPág cambian de mes, Inicio y Fin van al principio y al final de la semana, Intro elige y Esc cierra y vuelve al botón. Al pie, «Hoy» elige el día de hoy y «Borrar» vacía el campo. En el móvil se abre como una hoja desde abajo. El mismo selector está en los ciclos (capítulo 9), en el informe de estado (capítulo 11) y en los campos personalizados de tipo fecha (capítulo 14).",
    covers: ["action:date-picker"],
    focus: ".pdate__pop",
    run: async () => {
      // Closes the status list of the step before.
      await browser.keys("Escape");
      const date = await field(P.date);
      await date.$("..").$("button.pdate__btn").click();
      await expect($(".pdate-cal")).toBeDisplayed();
      await expect($('.pdate-cal [data-day="2026-11-02"]')).toBeFocused();
      await browser.keys(["ArrowRight"]);
      await expect($('.pdate-cal [data-day="2026-11-03"]')).toBeFocused();
    },
  });

  step("resumen", {
    title: "Paso 2 · Resumen",
    caption:
      "«Siguiente: …», al pie, avanza al paso siguiente y lo nombra; «Anterior» vuelve. El resumen es lo primero que leerá quien reciba el plan: en pocas líneas, qué se prueba y por qué (en este ejemplo, la versión 0.3.0 de Pharos, en escritorio y en la web). Con un motor de IA configurado (capítulo 15), el botón ✨ «Asistir con IA» redacta un borrador a partir de lo que hayas escrito; lo usas, lo editas o lo descartas, y nada se aplica sin que lo aceptes (capítulo 17).",
    covers: ["wizard:summary", "action:plan-step-nav"],
    run: async () => {
      await browser.keys("Escape");
      await next();
      await expect($("h2.tpw__title")).toHaveText(P.step.summary);
      await (await field(P.summary)).setValue(
        "Plan de pruebas de Pharos 0.3.0, la aplicación de gestión de pruebas: acceso, plan, requisitos, casos, ciclos, ejecución manual e importada, defectos, trazabilidad y sincronización, en la app de escritorio (Windows) y en la versión web.",
      );
    },
  });

  step("alcance", {
    title: "Paso 3 · Alcance",
    caption:
      "El alcance fija qué se prueba y, tan importante como eso, qué no: así nadie da por cubierto lo que queda fuera. En «Elementos dentro del alcance» y «Fuera del alcance», «+ Añadir» crea una fila por elemento (en este ejemplo, el acceso, el plan con los requisitos y los casos, la ejecución y la sincronización dentro; la integración con Jira y una app móvil nativa fuera). La papelera de cada fila («Quitar») la elimina; si la fila tiene texto, pide confirmarlo con «Sí, eliminar» o «Cancelar». Pharos avisa de las filas repetidas.",
    covers: ["wizard:scope"],
    run: async () => {
      await next();
      await fillList(P.scopeIn, ["Acceso y cuentas", "Plan, requisitos y casos de prueba", "Ciclos, ejecuciones e importación de informes", "Sincronización entre equipos"]);
      await fillList(P.scopeOut, ["Integración con Jira (llega con INT-05)", "App móvil nativa"]);
    },
  });

  step("niveles-tipos", {
    title: "Paso 4 · Niveles y tipos de prueba",
    caption:
      "Qué se prueba, en qué nivel y con qué tipo (ISTQB), en columnas. Los niveles dicen dónde se prueba: unitarias (un componente), integración (sus interfaces), sistema (de extremo a extremo) y aceptación (usuario y negocio); en este ejemplo, integración, sistema y aceptación, porque las unitarias son cosa del equipo de desarrollo. Los tipos dicen qué se comprueba: funcionales, no funcionales (rendimiento, seguridad, usabilidad…) y «Confirmación y regresión», las pruebas que siguen a un cambio: confirmación (volver a probar lo que falló, una vez arreglado), regresión, humo y sanidad; pasa el ratón por cada una para leer qué es. Si falta un tipo, escríbelo al pie de «Propios» y pulsa Intro o «Añadir» (en este ejemplo, «Pruebas de sincronización»); la ✕ lo quita. La ayuda «?» del título lo explica.",
    covers: ["wizard:levelsTypes"],
    focus: ".tpw-lt",
    run: async () => {
      await next();
      await expect($("h2.tpw__title")).toHaveText(P.step.levelsTypes);
      await tick([P.levelLabel.integration, P.levelLabel.system, P.levelLabel.acceptance]);
      await tick([P.typeLabel.functional, P.typeLabel.security, P.typeLabel.usability, P.typeLabel.performance, P.typeLabel.retest, P.typeLabel.regression]);
      await (await field(P.levelsTypes.other)).setValue("Pruebas de sincronización");
      await browser.keys("Enter");
      await expect(byTestId("plan-types-own").$(hasText("Pruebas de sincronización"))).toBeDisplayed();
    },
  });

  step("metodologia", {
    title: "Paso 5 · Metodología",
    caption:
      "Indica cómo trabaja el equipo, en dos columnas. En «Método de trabajo», la metodología y, con «Ágil», la duración del sprint («2 semanas»; de 1 a 4). En «Reuniones del equipo», una fila por reunión (diaria, revisión, retrospectiva y planificación): su casilla, su nombre y su frecuencia en la misma fila; la frecuencia de una reunión sin marcar se ve en gris y no se puede cambiar hasta marcarla (en este ejemplo, la planificación). Con «Tradicional / V-model», que no trabaja por sprints, la duración y las reuniones desaparecen y la segunda columna pide las fases del proyecto. Si falta algo, una línea bajo el paso dice qué. La duración del sprint no es solo informativa: el cronograma (paso 12) la usa para proponer el siguiente sprint y avisa si uno dura otra cosa.",
    covers: ["wizard:methodology"],
    focus: ".tpw-meth",
    run: async () => {
      await next();
      await selectOption(P.methodology, P.agile);
      // Daily, review and retrospective on. A new plan already has them, so a
      // blind click would turn them off (what MAN-01 first captured).
      await tick([P.ceremonyLabel.daily, P.ceremonyLabel.review, P.ceremonyLabel.retrospective]);
      // A new plan has the planning ticked too: off, its frequency greys out.
      const planning = $('[data-meeting="planning"] input[type="checkbox"]');
      if (await planning.isSelected()) await planning.click();
      await expect(byTestId("plan-frequency-planning")).toBeDisabled();
      await chooseOption(byTestId("plan-sprint-weeks"), { value: "2" });
      await expect(byTestId("plan-sprint-weeks")).toHaveText(tf("testPlan.weeks_other", { count: 2 }));
      // Each meeting's frequency is on its row.
      await chooseOption(byTestId("plan-frequency-review"), { value: "biweekly" });
      // FIX-14: nothing left to ask, and the step is marked done.
      await expect(byTestId("methodology-gaps")).toHaveText("");
      await expect($("nav.tpw-rail").$(`button*=${P.step.methodology}`)).toHaveAttribute("data-done", "true");
    },
  });

  step("entregables", {
    title: "Paso 6 · Entregables",
    caption:
      "Los entregables son los documentos y artefactos que el equipo de pruebas se compromete a producir. La lista sigue la documentación de ISO/IEC/IEEE 29119-3, en columnas: gestión de pruebas, especificación, datos y entorno, ejecución y resultados, y aceptación. Marca los que se acordaron con el proyecto y desmarca los que no se van a entregar: el plan deja constancia de ese acuerdo y sirve de referencia al cerrar el ciclo. Si se acordó algo que no está en la lista, escríbelo al pie de la sexta columna, «Propios», y pulsa Intro o «Añadir» (en este ejemplo, «Informe de accesibilidad WCAG 2.2»): queda en esa columna con su ✕ para quitarlo.",
    covers: ["wizard:deliverables"],
    focus: ".tpw-check--own",
    run: async () => {
      await next();
      await expect($("h2.tpw__title")).toHaveText(P.step.deliverables);
      const checks = await atLeast(".tpw-deliv .tpw-check input[type=checkbox]", 4);
      for (const c of checks.slice(0, 4)) await c.click();
      await (await field(P.deliverables.other)).setValue("Informe de accesibilidad WCAG 2.2");
      await browser.keys("Enter");
      await expect(byTestId("plan-deliverables-own").$(hasText("Informe de accesibilidad WCAG 2.2"))).toBeDisplayed();
    },
  });

  step("entorno", {
    title: "Paso 7 · Entorno de pruebas",
    caption:
      "Describe dónde se va a probar: la configuración del entorno (en este ejemplo, la app de escritorio en Windows 11 y la versión web contra el servidor de staging) y el hardware y software que necesita. Sirve para preparar el entorno a tiempo y para saber, ante un fallo, en qué condiciones se encontró. Los dos campos tienen su botón ✨ de IA.",
    covers: ["wizard:environment"],
    run: async () => {
      await next();
      await (await field(P.environmentConfig)).setValue("App de escritorio en Windows 11 y versión web en Chrome y Edge actuales, contra el servidor de staging (API y PostgreSQL) con una cuenta de prueba por persona.");
      await (await field(P.environmentRequirements)).setValue("PC con Windows 11 y 8 GB de RAM, WebView2 actualizado y acceso al servidor de staging.");
    },
  });

  step("herramientas", {
    title: "Paso 8 · Herramientas y automatización",
    caption:
      "Elige las herramientas del proyecto: arriba, las más usadas en QA; «Más herramientas» despliega el resto por categorías, con un buscador que no distingue acentos; si la tuya no está, escríbela en «¿No está en la lista?» y pulsa Intro o «Añadir». Las elegidas quedan resaltadas y se cuentan («N seleccionadas»). Después describe la estrategia de automatización: qué se automatiza, con qué y cuándo se ejecuta. El botón ✨ «Asistir con IA» propone un borrador; sin un motor de IA configurado (capítulo 15) aparece en gris, como en esta captura, y su aviso explica por qué.",
    covers: ["wizard:tools"],
    focus: "button*=Asistir con IA",
    run: async () => {
      await next();
      const pills = await atLeast(".tpw-tools .tp-pill", 3);
      for (const p of pills.slice(0, 3)) await p.click();
      await (await field(P.automationStrategy)).setValue("Regresión de escritorio con WebdriverIO y tauri-driver en cada PR; la web con Playwright cada noche; humo manual de cada versión.");
    },
  });

  step("datos", {
    title: "Pasos 9 y 10 · Datos y defectos",
    caption:
      "Dos pasos de texto libre. En el 9, cómo se consiguen y se protegen los datos de prueba (en este ejemplo, cuentas y proyectos de prueba creados por script, sin datos reales). En el 10, el que muestra la captura, cómo se gestionan los defectos: dónde se registran, con qué severidad y prioridad y quién los revisa. Los dos tienen su botón ✨ de IA.",
    covers: ["wizard:testData", "wizard:defects"],
    run: async () => {
      await next();
      await (await field(P.testDataManagement)).setValue("Cuentas y proyectos de prueba creados por script en staging; ningún dato real de clientes.");
      await next();
      await (await field(P.defectManagement)).setValue("Defectos en el propio Pharos, con severidad y prioridad; triaje diario del equipo de QA.");
    },
  });

  step("roles", {
    title: "Paso 11 · Roles y responsabilidades",
    caption:
      "Cada fila une un rol con su responsabilidad, para que quede claro quién decide y quién hace qué (en este ejemplo, el «Responsable de QA» planifica, prioriza y aprueba el cierre, y el «Analista de pruebas» diseña y ejecuta los casos; en Pharos, Liomar lleva los dos roles). «+ Añadir fila» crea otra y la papelera de cada una la quita. Con un motor de IA, «Sugerir responsabilidades con IA» propone la responsabilidad de los roles que escribiste y aún no la tienen; eliges cuáles usar, y lo ya escrito no cambia.",
    covers: ["wizard:roles"],
    run: async () => {
      await next();
      await fillPairs(P.step.roles, [
        ["Responsable de QA", "Planifica, prioriza y aprueba el cierre"],
        ["Analista de pruebas", "Diseña y ejecuta los casos"],
      ]);
    },
  });

  step("cronograma", {
    title: "Paso 12 · Cronograma: sprints",
    caption:
      "El cronograma sitúa en el calendario los sprints y los hitos del ciclo de pruebas. Con «Sprint» elegido, haz clic en el día de inicio y después en el de fin (Esc cancela el rango a medias; la ayuda «?» del título lo recuerda, y el calendario queda justo debajo de la barra): el sprint aparece como una franja y en la lista «Sprints», con su nombre y sus fechas, que puedes editar (dd/mm/aaaa e Intro). «Siguiente sprint» añade el siguiente a continuación, con la duración del paso 5 (Metodología). La leyenda explica el calendario: las franjas alternan azul y ámbar para distinguir un sprint del siguiente, el rombo marca un hito, el círculo ámbar es hoy y el rojo claro señala días en que dos sprints se solapan (es un aviso: el plan se guarda igualmente). El sprint seleccionado se ve en azul oscuro y se resalta su fila; con el ratón puedes arrastrar sus extremos. Las flechas de arriba cambian de mes.",
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
      "Un hito es una fecha clave que no ocupa días, como una congelación de código o una publicación. Elige «Hito» y haz clic en un día: el hito se marca con un rombo ámbar y se añade a la lista «Hitos», donde le das nombre (en este ejemplo, «Congelación de código» y «Publicación de la 0.3.0»; el tercero, «Hito 3», se marcó con el teclado) y puedes corregir la fecha. Todo el calendario funciona también con el teclado: ← → mueven el foco un día, ↑ ↓ una semana, Inicio y Fin van al principio y al final de la semana, RePág y AvPág cambian de mes, e Intro o Espacio marcan el día enfocado.",
    covers: ["action:schedule-milestone", "keyboard:schedule-calendar"],
    focus: ".tps-diamond",
    run: async () => {
      await $(`.tps-seg__btn=${P.schedule.modeMilestone}`).click();
      await day("25").click();
      await day("26").click();
      await browser.keys(["ArrowRight", "Enter"]);
      const names = await atLeast(`input.tps-name[aria-label^="${P.milestoneName}"]`, 2);
      // Replace the default names («Hito 1»…): select all, then type.
      for (const [i, name] of ["Congelación de código", "Publicación de la 0.3.0"].entries()) {
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
    title: "Paso 13 · Riesgos y mitigación",
    caption:
      "Cada fila es un riesgo que podría afectar a las pruebas y su mitigación, lo que se hará para reducirlo (en este ejemplo, que una actualización de WebView2 rompa la automatización de escritorio se mitiga fijando la versión del controlador). Cada campo crece con su texto, para que se lea entero. Con un motor de IA, «Sugerir riesgos con IA» propone riesgos con su mitigación según el resto del plan, y eliges cuáles añadir (capítulo 17).",
    covers: ["wizard:risks"],
    run: async () => {
      await next();
      await fillPairs(P.step.risks, [
        ["Una actualización de WebView2 rompe la automatización de escritorio", "Fijar la versión del controlador y revisarla en cada actualización"],
        ["Conflictos de sincronización difíciles de reproducir", "Escenarios con dos equipos simulados contra la API de pruebas"],
      ]);
    },
  });

  step("comunicacion", {
    title: "Pasos 14 a 16 · Comunicación, cierre y propósito",
    caption:
      "Tres pasos de texto que completan el plan: el plan de comunicación (paso 14: qué se informa, a quién y cada cuánto), los criterios de cierre (paso 15: cada criterio con su métrica objetivo; el plan trae tres por defecto, «% de casos ejecutados ≥ 95%», «Defectos críticos abiertos 0» y «Cobertura de requisitos ≥ 90%», y en este ejemplo se añade «Casos críticos ejecutados» al «100 %»; el Inicio los evalúa como criterios de salida, capítulo 3; con un motor de IA, «Sugerir criterios con IA» propone criterios ligados a los riesgos del plan) y el propósito del documento (paso 16, el de la captura).",
    covers: ["wizard:communication", "wizard:closure", "wizard:purpose"],
    run: async () => {
      await next();
      await (await field(P.communicationPlan)).setValue("Informe semanal de avance al equipo de producto; aviso inmediato de cada defecto crítico en el canal del equipo.");
      await next();
      await fillPairs(P.step.closure, [["Casos críticos ejecutados", "100 %"]]);
      await next();
      await (await field(P.purpose)).setValue("Asegurar que Pharos 0.3.0 cumple sus requisitos antes de publicarse.");
    },
  });

  step("conclusion", {
    title: "Paso 17 · Conclusión y «Antes de terminar»",
    caption:
      "El paso 17, el último, recoge la conclusión del plan y, debajo, «Antes de terminar»: cuántos pasos están completos y la lista de los que no, cada uno con un enlace que lleva a él, junto con el estado actual del plan. Úsala como lista de comprobación; un plan con pasos pendientes se guarda igualmente. Solo el título es obligatorio.",
    covers: ["wizard:conclusion"],
    focus: "section.tpw-finish",
    run: async () => {
      await next();
      await (await field(P.conclusion)).setValue("Pendiente de la regresión del ciclo «Regresión 0.3.0».");
      await expect($("section.tpw-finish")).toBeDisplayed();
    },
  });

  step("guardar", {
    title: "Guardar el plan",
    caption:
      "«Finalizar plan» (o «Guardar», en la cabecera, desde cualquier paso) guarda el plan: aparece el aviso «Plan de pruebas guardado», la línea de estado pasa a «Guardado · ahora mismo», sube la versión y la cabecera del proyecto pasa a «Plan borrador». Guarda a menudo: cada guardado crea además una revisión a la que puedes volver.",
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
      "Si cambias algo y vas a otra sección sin guardar (o cierras la ventana), Pharos te avisa antes de perder el trabajo: «Seguir editando» te devuelve al plan para guardarlo; «Descartar cambios» sale sin guardar. La línea de estado del paso ya te lo advertía: «Cambios sin guardar».",
    covers: ["dialogs:src/modules/test-plan/ui/TestPlanWizard.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await goToStep("summary");
      await (await field(P.summary)).addValue(" Incluye la nueva sección Requisitos.");
      await byTestId("nav-project-cases").click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("revisiones", {
    title: "Revisiones del plan",
    caption:
      "Cada guardado crea una revisión, una copia fechada del plan. «Ver todas», en el panel «Revisiones» (que enseña las tres últimas, junto al formulario o debajo en pantallas estrechas), abre la lista con el número, el título y la fecha de cada una. «Restaurar» vuelve al contenido de una revisión anterior, tras pedir confirmación. En la versión web todavía no se guardan revisiones.",
    covers: ["dialogs:src/modules/test-plan/ui/wizard/PlanSidePanels.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await $('[role="alertdialog"]').$(`button=${es.dialog.unsaved.keep}`).click();
      await button(P.save).click();
      await waitForToast(P.savedToast);
      await $('section[aria-labelledby="tpw-revs-title"]').$(`button=${P.panel.seeAll}`).click();
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
      await acceptConfirm();
      await browser.keys("Escape");
      await button(P.save).click();
      await waitForToast(P.savedToast);
    },
  });

  step("exportar", {
    title: "Exportar el plan",
    caption:
      "«Importar / Exportar», en la cabecera, ofrece el plan en .pdf, maquetado y listo para firmar, o en .xlsx, editable en Excel. Al pie, el menú indica qué historial lleva el documento: «Solo la versión vigente» o «Historial de revisiones», según «Ajustes del proyecto» (capítulo 14). Se exporta lo que ves, aunque no esté guardado. El archivo va a tu carpeta de descarga (Administración › General, capítulo 15) y un aviso dice su nombre.",
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
      "Para traer un plan escrito fuera de Pharos, «Importar / Exportar → Importar .xlsx» lee una plantilla rellenada en Excel (Administración › Plantillas) o un plan exportado antes (en este ejemplo, el .xlsx que se acaba de exportar). Antes de tocar nada, el informe de importación muestra, campo a campo, qué reconoció («no detectado», «en blanco»…), para que decidas si aplicarlo.",
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
