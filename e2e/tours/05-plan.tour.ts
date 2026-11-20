// Chapter 5 — Plan de pruebas (manual v2, MAN-03): the 22-step ISO/IEC/IEEE
// 29119 wizard (UX-31, PLN-06) with the plan of Pharos 0.6.0, the app under
// test. Liomar does not type the plan: he imports the .xlsx he keeps it in
// (fixtures/pharos/«Plan de pruebas de Pharos 0.6.0.xlsx», made by Pharos's
// own exporter from data/pharos.ts), saves it and then reads each section,
// changes what the 0.6.0 plan still lacks (a scope row and, with the keyboard,
// a milestone), saves a second revision, exports it and takes it through
// review (PLN-07): sent, self-approved in his personal workspace, obsolete and
// reactivated. Asking for changes and the approval by another person happen
// in the team chapter (21). The AI buttons of the plan are toured in chapter
// 17 (they need a real key).
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import { CYCLE, PLAN, PLAN_ON_SCREEN } from "./data/pharos";
import { pharosFixtures } from "./prepare";
import {
  PROJECT_A,
  atLeast,
  button,
  byTestId,
  chooseFile,
  dialog,
  dismissConfirm,
  es,
  field,
  menuItem,
  openProject,
  openSection,
  waitForToast,
} from "./helpers";

const P = es.testPlan;

/** «dd/mm/aaaa» of an ISO date, as the wizard shows it. */
const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** The ISO date of the day after `iso`. */
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Opens a wizard step from the rail of steps (wide desktop). */
async function goToStep(id: keyof typeof P.step) {
  await $("nav.tpw-rail").$(`button*=${P.step[id]}`).click();
  await expect($("h2.tpw__title")).toHaveText(P.step[id]);
  await top();
}

/** «Siguiente: …», then the pointer leaves it (no hover in the capture). */
async function next(id: keyof typeof P.step) {
  await $(".tpw__next").click();
  await expect($("h2.tpw__title")).toHaveText(P.step[id]);
  await top();
}

/** The step from its title, the pointer out of the way. */
async function top() {
  await browser.execute(() => {
    document.querySelector(".app-shell__content")?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  });
  await $("h2.tpw__title").moveTo();
}

/** A day of the schedule calendar (ISO date). */
const day = (iso: string) => $(`.tps-grid [data-day="${iso}"]`);

chapter("plan", () => {
  step("asistente", {
    title: "El asistente del plan",
    caption:
      "El plan de pruebas dice qué se prueba, cómo, con qué medios, quién y cuándo. Pharos lo redacta con un asistente de 22 pasos que sigue la norma ISO/IEC/IEEE 29119-3 y el apartado 5.1.1 de ISTQB CTFL v4: «Plan de pruebas», la primera sección del proyecto. A la izquierda, la lista de pasos con una ✓ en los completos y el porcentaje de avance; en el centro, el paso actual, con «Paso N de 22» y si hay cambios sin guardar; a la derecha, «Estado del plan» (estado, versión, autor, última actualización y las acciones de revisión) y el «Historial» de sus últimos cambios. No hace falta seguir el orden: salta a cualquier paso desde la lista. En este ejemplo, «Pharos» todavía no tiene plan («Sin plan», en la cabecera del proyecto).",
    covers: ["section:plan"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("plan");
      await expect(byTestId("plan-wizard")).toBeDisplayed();
      await expect($("h2.tpw__title")).toHaveText(P.step.identification);
      await expect($(".pj-header")).toHaveText(expect.stringContaining(es.projects.header.plan.none));
    },
  });

  step("importar", {
    title: "Importar el plan desde Excel",
    caption: `Liomar no escribe el plan paso a paso: lo tiene en Excel, en «${PLAN.file}», un plan exportado antes desde Pharos. «Importar / Exportar», en la cabecera, y después «Importar .xlsx» leen un plan exportado o una plantilla rellenada en Excel (Administración › Plantillas). Antes de tocar nada, el informe de importación muestra, campo a campo, qué reconoció y qué no («no detectado», «en blanco»…), para que decidas si aplicarlo. El título del plan sale del nombre del archivo.`,
    covers: ["upload:src/modules/test-plan/ui/TestPlanWizard.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await chooseFile('input[type="file"][accept=".xlsx"]', join(pharosFixtures, PLAN.file));
      await expect(dialog()).toBeDisplayed();
      // The report is complete once «Aplicar al formulario» can be pressed.
      await $(`button=${es.importReport.apply}`).waitForEnabled({ timeout: 30_000 });
    },
  });

  step("importado", {
    title: "El plan, cargado en el asistente",
    caption: `«Aplicar al formulario» carga lo reconocido en el asistente, todavía sin guardar: la línea del paso dice «Cambios sin guardar» y la lista de pasos marca con una ✓ los que quedan completos. En el paso 1 ya están el título («${PLAN.title}»), la versión («${PLAN.version}») y la fecha (${dmy(PLAN.planDate)}). Un plan importado empieza siempre en Borrador, aunque el Excel venga de un plan aprobado.`,
    focus: "nav.tpw-rail",
    run: async () => {
      await $(`button=${es.importReport.apply}`).click();
      await waitForToast(P.import.applied);
      await expect($("#tp-title")).toHaveValue(PLAN.title);
      await top();
    },
  });

  step("guardar", {
    title: "Guardar el plan",
    caption:
      "«Guardar», en la cabecera, guarda el plan desde cualquier paso (en el último, «Finalizar plan» hace lo mismo): aparece el aviso «Plan de pruebas guardado», la línea de estado pasa a «Guardado · ahora mismo» y la cabecera del proyecto pasa de «Sin plan» a «Plan borrador». Guarda a menudo: cada guardado con cambios sube la versión y crea una revisión a la que puedes volver; guardar sin cambios avisa de que no hay nada que guardar.",
    toast: true,
    covers: ["action:plan-save"],
    focus: "header.pj-header",
    run: async () => {
      await button(P.save).click();
      await waitForToast(P.savedToast);
      await expect($(".pj-header")).toHaveText(expect.stringContaining(es.projects.header.plan.draft));
      await top();
    },
  });

  step("identificacion", {
    title: "Paso 1 · Identificación del plan",
    caption: `El paso 1 es el bloque de identificación del documento de ISO/IEC/IEEE 29119-3: el título (aquí, «${PLAN.title}»), el estado (no se elige aquí: cambia con las acciones de «Estado del plan», como en los casos), el ID de documento (por defecto «TP-», el prefijo del proyecto y seis caracteres; se puede cambiar), la versión («${PLAN.version}») y la fecha. El autor no se escribe: es tu nombre oficial del perfil (en este ejemplo, Liomar Rodríguez, capítulo 1); lo ves en el panel «Estado del plan» y firma el plan cuando lo exportas.`,
    covers: ["wizard:identification"],
    focus: ".tpw-ident",
    run: async () => {
      await expect($("h2.tpw__title")).toHaveText(P.step.identification);
      await expect(await field(P.version)).toHaveValue(PLAN.version);
      await expect(byTestId("plan-status")).toBeDisplayed();
    },
  });

  step("fecha", {
    title: "La fecha: el selector de fechas de Pharos",
    caption: `La fecha se escribe dd/mm/aaaa (aquí, ${dmy(PLAN.planDate)}) o se elige en el calendario de Pharos, el mismo del cronograma: el botón del calendario, al final del campo, lo abre en el mes de la fecha, con el mes y el año arriba y ‹ › para cambiar de mes. Hoy lleva un anillo naranja y el día elegido va relleno. Con el teclado, las flechas recorren los días, RePág y AvPág cambian de mes, Inicio y Fin van al principio y al final de la semana, Intro elige y Esc cierra y vuelve al botón sin cambiar nada. Al pie, «Hoy» elige el día de hoy y «Borrar» vacía el campo. En el móvil se abre como una hoja desde abajo. El mismo selector está en los ciclos (capítulo 9), en el informe de estado (capítulo 11) y en los campos personalizados de tipo fecha (capítulo 14).`,
    covers: ["action:date-picker"],
    focus: ".pdate__pop",
    run: async () => {
      const date = await field(P.date);
      await date.$("..").$("button.pdate__btn").click();
      await expect($(".pdate-cal")).toBeDisplayed();
      await expect($(`.pdate-cal [data-day="${PLAN.planDate}"]`)).toBeFocused();
      await browser.keys(["ArrowRight"]);
      await expect($(`.pdate-cal [data-day="${nextDay(PLAN.planDate)}"]`)).toBeFocused();
    },
    after: async () => {
      await browser.keys("Escape");
      await expect($(".pdate-cal")).not.toBeDisplayed();
      await expect(await field(P.date)).toHaveValue(dmy(PLAN.planDate));
    },
  });

  step("resumen", {
    title: "Paso 2 · Resumen",
    caption:
      "«Siguiente: …», al pie, avanza al paso siguiente y lo nombra; «Anterior» vuelve. El resumen es lo primero que leerá quien reciba el plan: en pocas líneas, qué se prueba y por qué (aquí, la versión 0.6.0 de Pharos: la biblioteca del proyecto, la importación de informes, las integraciones y la nueva base de datos local cifrada). Con un motor de IA configurado (capítulo 15), el botón ✨ «Asistir con IA» redacta un borrador a partir de lo que hayas escrito; lo usas, lo editas o lo descartas, y nada se aplica sin que lo aceptes (capítulo 17).",
    covers: ["wizard:summary", "action:plan-step-nav"],
    run: async () => {
      await next("summary");
      await expect(await field(P.summary)).toHaveValue(PLAN.summary);
    },
  });

  step("alcance", {
    title: "Paso 3 · Alcance: completar lo que falta",
    caption: `El alcance fija qué se prueba y, tan importante como eso, qué no: así nadie da por cubierto lo que queda fuera. Al repasarlo, Liomar ve que falta algo que los riesgos del plan sí nombran: pulsa «+ Añadir» en «Elementos dentro del alcance» y escribe «${PLAN_ON_SCREEN.scopeIn}». Cada fila es un elemento; su papelera («Quitar») la elimina y, si tiene texto, pide confirmarlo con «Sí, eliminar» o «Cancelar». Pharos avisa de las filas repetidas. «Fuera del alcance» deja constancia de lo que no se prueba en esta versión, como la integración con Jira o una app móvil nativa.`,
    covers: ["wizard:scope"],
    focus: `[role="group"][aria-label="${P.scopeIn}"]`,
    run: async () => {
      await next("scope");
      const group = $(`[role="group"][aria-label="${P.scopeIn}"]`);
      await group.$(".tp-list-field__add").click();
      const inputs = await group.$$("input");
      await expect(inputs).toBeElementsArrayOfSize(PLAN.scopeIn.length + 1);
      await inputs[inputs.length - 1].setValue(PLAN_ON_SCREEN.scopeIn);
      await $("h2.tpw__title").moveTo();
    },
  });

  step("supuestos", {
    title: "Paso 4 · Supuestos y restricciones",
    caption:
      "Dos listas, una junto a otra. Los supuestos son lo que se da por hecho al planificar (aquí, que el servidor de staging esté disponible de 8 a 20 h); si uno deja de cumplirse, hay que revisar el plan. Las restricciones son los límites que el equipo no puede cambiar (un equipo de QA de dos personas, la fecha de la versión). Con un motor de IA, «Sugerir supuestos y restricciones con IA» propone elementos de las dos listas a partir del plan, y eliges cuáles añadir.",
    covers: ["wizard:assumptions"],
    run: async () => {
      await next("assumptions");
    },
  });

  step("niveles-tipos", {
    title: "Paso 5 · Niveles y tipos de prueba",
    caption:
      "Qué se prueba, en qué nivel y con qué tipo (ISTQB), en columnas. Los niveles dicen dónde se prueba: unitarias (un componente), integración (sus interfaces), sistema (de extremo a extremo) y aceptación (usuario y negocio); aquí, integración, sistema y aceptación, porque las unitarias son cosa del equipo de desarrollo. Los tipos dicen qué se comprueba: funcionales, no funcionales (rendimiento, seguridad, usabilidad…) y «Confirmación y regresión», las pruebas que siguen a un cambio: confirmación (volver a probar lo que falló, una vez arreglado), regresión, humo y sanidad; pasa el ratón por cada una para leer qué es. Lo que no está en la lista va en la columna «Propios» (aquí, «Pruebas de sincronización»): se escribe al pie y se añade con Intro o «Añadir»; la ✕ lo quita.",
    covers: ["wizard:levelsTypes"],
    focus: ".tpw-lt",
    run: async () => {
      await next("levelsTypes");
      // The «Propios» column, above the sticky footer.
      await byTestId("plan-types-own").scrollIntoView({ block: "center" });
      await expect(byTestId("plan-types-own")).toHaveText(expect.stringContaining("Pruebas de sincronización"));
    },
  });

  step("tecnicas", {
    title: "Paso 6 · Técnicas de prueba",
    caption:
      "Cómo se diseñan los casos, con las técnicas de ISTQB CTFL v4 en columnas: de caja negra (particiones de equivalencia, valores límite, tablas de decisión, transición de estados), de caja blanca (sentencias y ramas), basadas en la experiencia (predicción de errores, exploratoria, listas de comprobación) y colaborativas (historias de usuario, criterios de aceptación, ATDD). Aquí, valores límite y particiones para los formularios, transición de estados para los ciclos y exploratoria en cada versión. Las del equipo van en «Propias», como en los tipos y los entregables.",
    covers: ["wizard:techniques"],
    focus: ".tpw-tech",
    run: async () => {
      await next("techniques");
    },
  });

  step("metodologia", {
    title: "Paso 7 · Metodología",
    caption:
      "Cómo trabaja el equipo, en dos columnas. En «Método de trabajo», la metodología y, con «Ágil», la duración del sprint (aquí, «2 semanas»; de 1 a 4). En «Reuniones del equipo», una fila por reunión (diaria, revisión, retrospectiva y planificación): su casilla, su nombre y su frecuencia en la misma fila; la frecuencia de una reunión sin marcar se ve en gris y no se puede cambiar hasta marcarla. Con «Tradicional / V-model», que no trabaja por sprints, la duración y las reuniones desaparecen y la segunda columna pide las fases del proyecto. Si falta algo, una línea bajo el paso dice qué. La duración del sprint no es solo informativa: el cronograma (paso 15) la usa para proponer el siguiente sprint y avisa si uno dura otra cosa.",
    covers: ["wizard:methodology"],
    focus: ".tpw-meth",
    run: async () => {
      await next("methodology");
      await expect(byTestId("plan-sprint-weeks")).toHaveText(expect.stringContaining(String(PLAN.methodology.sprintWeeks)));
      await expect(byTestId("methodology-gaps")).toHaveText("");
    },
  });

  step("lista-desplegable", {
    title: "Las listas desplegables de Pharos",
    caption:
      "La metodología se elige en una lista desplegable de Pharos, como todas las de la aplicación: la opción elegida lleva una ✓, y con el teclado ↑ ↓ recorren las opciones, una letra salta a la que empieza por ella, Intro elige y Esc cierra sin cambiar nada; en el móvil se abre como una hoja desde abajo.",
    covers: ["action:pharos-select"],
    focus: ".popover .pselect__option[data-selected]",
    run: async () => {
      await (await field(P.methodology)).click();
      await expect($('[role="listbox"]')).toBeDisplayed();
    },
    after: async () => {
      await browser.keys("Escape");
      await expect($('[role="listbox"]')).not.toBeDisplayed();
    },
  });

  step("entregables", {
    title: "Paso 8 · Entregables",
    caption:
      "Los entregables son los documentos y artefactos que el equipo de pruebas se compromete a producir. La lista sigue la documentación de ISO/IEC/IEEE 29119-3, en columnas: gestión de pruebas, especificación, datos y entorno, ejecución y resultados, y aceptación. Las casillas marcadas son lo acordado con el proyecto; el plan deja constancia de ese acuerdo y sirve de referencia al cerrar el ciclo. Lo acordado que no está en la lista va en la sexta columna, «Propios» (aquí, «Informe de accesibilidad WCAG 2.2»), con su ✕ para quitarlo.",
    covers: ["wizard:deliverables"],
    focus: ".tpw-deliv",
    run: async () => {
      await next("deliverables");
      await expect(byTestId("plan-deliverables-own")).toHaveText(expect.stringContaining("Informe de accesibilidad WCAG 2.2"));
    },
  });

  step("entorno-herramientas", {
    title: "Pasos 9 y 10 · Entorno, herramientas y automatización",
    caption:
      "El paso 9 describe dónde se prueba: la configuración del entorno (aquí, la app de escritorio en Windows 11 y la versión web en Chrome y Edge, contra el servidor de staging) y el hardware y software que necesita; sirve para prepararlo a tiempo y para saber, ante un fallo, en qué condiciones apareció. El paso 10, el de la captura, reúne las herramientas: arriba, las más usadas en QA; «Más herramientas» despliega el resto por categorías, con un buscador que no distingue acentos, y «¿No está en la lista?» añade otra. Las elegidas quedan resaltadas y se cuentan. Debajo, la estrategia de automatización: qué se automatiza, con qué y cuándo se ejecuta (aquí, WebdriverIO en cada PR, Playwright cada noche y los informes subidos con `pharos upload`). Sin un motor de IA (capítulo 15), los botones ✨ «Asistir con IA» aparecen en gris y, al pasar el ratón, dicen por qué.",
    covers: ["wizard:environment", "wizard:tools"],
    focus: ".tpw-tools",
    run: async () => {
      await next("environment");
      await expect(await field(P.environmentConfig)).toHaveValue(PLAN.environmentConfig);
      await next("tools");
      await atLeast(".tpw-tools .tp-pill", 3);
    },
  });

  step("datos", {
    title: "Pasos 11 y 12 · Datos y defectos",
    caption:
      "Dos pasos de texto libre. En el 11, cómo se consiguen y se protegen los datos de prueba (aquí, cuentas y proyectos de prueba creados por script, sin datos reales). En el 12, el que muestra la captura, cómo se gestionan los defectos: dónde se registran, con qué severidad y prioridad y quién los revisa. Los dos tienen su botón ✨ de IA.",
    covers: ["wizard:testData", "wizard:defects"],
    run: async () => {
      await next("testData");
      await next("defects");
      await expect(await field(P.defectManagement)).toHaveValue(PLAN.defectManagement);
    },
  });

  step("roles", {
    title: "Paso 13 · Roles, independencia y formación",
    caption:
      "Cada fila une un rol con su responsabilidad, para que quede claro quién decide y quién hace qué: aquí, el «Responsable de QA» (Liomar) planifica, prioriza y aprueba el cierre, y el «Analista de pruebas» (su compañero de QA, capítulo 21) diseña y ejecuta los casos y revisa los de Liomar. «+ Añadir fila» crea otra y la papelera de cada una la quita. Con un motor de IA, «Sugerir responsabilidades con IA» propone la responsabilidad de los roles que aún no la tienen. Debajo, la independencia de las pruebas en una escala de cinco, de quien escribe el código a un equipo externo (aquí, «Probadores del equipo»), con cómo se garantiza, y las necesidades de formación con su plazo.",
    covers: ["wizard:roles"],
    focus: ".tpw-scale",
    run: async () => {
      await next("roles");
      await expect(byTestId("plan-independence").$(`input[value="${PLAN.independence}"]`)).toBeSelected();
    },
  });

  step("estimacion", {
    title: "Paso 14 · Estimación y presupuesto",
    caption: `Cuánto esfuerzo y dinero hace falta y con qué técnica se calculó (CTFL v4 §5.1.4): por proporciones, por extrapolación, Wideband Delphi, tres puntos o juicio experto. Con la de tres puntos, el plan lleva el esfuerzo optimista, el más probable y el pesimista en persona-días (aquí, ${PLAN.estimation.optimistic}, ${PLAN.estimation.likely} y ${PLAN.estimation.pessimistic}), y Pharos calcula la estimación, E = (O + 4·M + P) / 6, y su desviación. Debajo, el presupuesto y en qué se basan las cifras.`,
    covers: ["wizard:estimation"],
    focus: ".tpw-calc",
    run: async () => {
      await next("estimation");
      await expect(byTestId("plan-est-result")).toHaveText(expect.stringContaining("19,0"));
    },
  });

  step("cronograma", {
    title: "Paso 15 · Cronograma",
    caption:
      "El cronograma sitúa en el calendario los sprints y los hitos del ciclo de pruebas: aquí, los dos sprints de la versión, del 9 de noviembre al 6 de diciembre. Con «Sprint» elegido, haz clic en el día de inicio y después en el de fin (Esc cancela el rango a medias): el sprint aparece como una franja y en la lista «Sprints», con su nombre y sus fechas, que puedes editar (dd/mm/aaaa e Intro). «Siguiente sprint» añade el siguiente a continuación, con la duración del paso 7. La leyenda explica el calendario: las franjas alternan azul y ámbar para distinguir un sprint del siguiente, el rombo marca un hito, el círculo ámbar es hoy y el rojo claro señala días en que dos sprints se solapan (es un aviso: el plan se guarda igualmente). Con el ratón puedes arrastrar los extremos del sprint seleccionado. Las flechas de arriba cambian de mes.",
    covers: ["wizard:schedule"],
    focus: ".tps-card",
    run: async () => {
      await next("schedule");
      await expect($('[role="grid"].tps-grid')).toBeDisplayed();
      await atLeast("section.tps-list .tps-row", PLAN.sprints.length);
      await $(".tps-card").scrollIntoView({ block: "start" });
    },
  });

  step("cronograma-hito", {
    title: "Cronograma: un hito con el teclado",
    caption: `Un hito es una fecha clave que no ocupa días, como una congelación de código o una publicación. Liomar marca uno con el teclado: elige «Hito», lleva el foco al calendario con Tab, se mueve con las flechas hasta el ${dmy(PLAN_ON_SCREEN.milestone.date)} y pulsa Intro. El hito se marca con un rombo ámbar y se añade a la lista «Hitos», donde le da nombre, «${PLAN_ON_SCREEN.milestone.name}», y puede corregir la fecha. Con el ratón basta un clic en el día. En el calendario, ← → mueven el foco un día, ↑ ↓ una semana, Inicio y Fin van al principio y al final de la semana, RePág y AvPág cambian de mes, e Intro o Espacio marcan el día enfocado.`,
    covers: ["action:schedule-milestone", "keyboard:schedule-calendar"],
    focus: [".tps-diamond", "section.tps-list"],
    run: async () => {
      await $(`.tps-seg__btn=${P.schedule.modeMilestone}`).click();
      const before = (await $$(`input.tps-name[aria-label^="${P.milestoneName}"]`)).length;
      // Keyboard focus on the day before, then → and Enter.
      await browser.execute((iso: string) => {
        (document.querySelector(`.tps-grid [data-day="${iso}"]`) as HTMLElement | null)?.focus();
      }, PLAN_ON_SCREEN.milestone.from);
      await expect(day(PLAN_ON_SCREEN.milestone.from)).toBeFocused();
      await browser.keys(["ArrowRight"]);
      await expect(day(PLAN_ON_SCREEN.milestone.date)).toBeFocused();
      await browser.keys(["Enter"]);
      const names = await atLeast(`input.tps-name[aria-label^="${P.milestoneName}"]`, before + 1);
      // The new one has the default name («Hito N»): name it.
      let fresh: WebdriverIO.Element | undefined;
      for (const n of names) {
        if (/^\S+ \d+$/.test(await n.getValue())) fresh = n;
      }
      if (!fresh) throw new Error("the new milestone row was not found");
      await fresh.click();
      await browser.keys(["Control", "a"]);
      await browser.keys([...PLAN_ON_SCREEN.milestone.name]);
      await expect(fresh).toHaveValue(PLAN_ON_SCREEN.milestone.name);
      await $(".tps-card").scrollIntoView({ block: "start" });
      await $("h2.tpw__title").moveTo();
    },
  });

  step("riesgos", {
    title: "Paso 16 · Riesgos y mitigación",
    caption:
      "Cada fila es un riesgo que podría afectar a las pruebas y su mitigación, lo que se hará para reducirlo: aquí, que una actualización de WebView2 rompa la automatización de escritorio, los conflictos de sincronización difíciles de reproducir y que la conversión de los datos locales al formato de la 0.6 falle en equipos con poco espacio. Cada campo crece con su texto, para que se lea entero. Con un motor de IA, «Sugerir riesgos con IA» propone riesgos con su mitigación según el resto del plan, y eliges cuáles añadir (capítulo 17).",
    covers: ["wizard:risks"],
    run: async () => {
      await next("risks");
    },
  });

  step("comunicacion", {
    title: "Pasos 17 y 18 · Comunicación; entrada, suspensión y reanudación",
    caption:
      "El plan de comunicación (paso 17) dice qué se informa, a quién y cada cuánto. El paso 18, el de la captura, fija cuándo puede empezar un ciclo (criterios de entrada: aquí, la versión instalada en staging y la prueba de humo en verde), cuándo se detiene la prueba (si falla el acceso) y qué tiene que pasar para retomarla (una versión con el bloqueo corregido). Con un motor de IA, «Sugerir criterios con IA» propone elementos de las tres listas.",
    covers: ["wizard:communication", "wizard:entry"],
    run: async () => {
      await next("communication");
      await next("entry");
    },
  });

  step("metricas", {
    title: "Paso 19 · Métricas y objetivos medibles",
    caption: `Qué se mide y qué objetivo debe alcanzar, una fila por métrica: su comparador (≥, >, ≤, <, =), su objetivo y su unidad. Un plan trae cuatro de partida: casos ejecutados ≥ 95 %, tasa de éxito ≥ 90 %, defectos críticos abiertos = 0 y cobertura de requisitos ≥ 90 %. Las del catálogo (también densidad de defectos por cada 100 casos, defectos escapados, tiempo de corrección en días, reapertura e inestables) las mide Pharos y su unidad es fija; una propia lleva nombre y unidad y se valora a mano (aquí, «${PLAN.ownMetric.name}» ≥ ${PLAN.ownMetric.target}). «Criterio de salida» la lleva a los criterios de cierre, para que cuente al cerrar un ciclo.`,
    covers: ["wizard:metrics"],
    focus: ".tpw-metrics",
    run: async () => {
      await next("metrics");
      await atLeast('[data-testid="plan-metric"]', 5);
    },
  });

  step("cierre", {
    title: "Pasos 20 y 21 · Criterios de cierre y propósito",
    caption:
      "Los criterios de cierre (paso 20) son los criterios de salida del plan. «Medido por» dice qué métrica mide cada uno: entonces su texto sale de la métrica y se evalúa solo al cerrar un ciclo (el Inicio también los muestra, capítulo 3). Sin métrica, el criterio es texto libre y se marca a mano (aquí, «Casos críticos ejecutados» al «100 %»). Cada uno es «Bloqueante» (por defecto: en «No cumple» pide una justificación para cerrar el ciclo) u «Orientativo» (solo se informa). Con un motor de IA, «Sugerir criterios con IA» propone criterios ligados a los riesgos del plan. El paso 21 recoge el propósito del documento.",
    covers: ["wizard:closure", "wizard:purpose"],
    run: async () => {
      await next("closure");
      await atLeast('[data-testid="plan-criterion-blocking"]', 4);
      await next("purpose");
      await expect(await field(P.purpose)).toHaveValue(PLAN.purpose);
      await goToStep("closure");
    },
  });

  step("conclusion", {
    title: "Paso 22 · Conclusión y «Antes de terminar»",
    caption: `El paso 22, el último, recoge la conclusión del plan (aquí, que falta la regresión del ciclo «${CYCLE.title}», el del capítulo 9) y, debajo, «Antes de terminar»: cuántos pasos están completos y la lista de los que no, cada uno con un enlace que lleva a él, junto con el estado actual del plan. Úsala como lista de comprobación; un plan con pasos pendientes se guarda igualmente. Solo el título es obligatorio.`,
    covers: ["wizard:conclusion"],
    focus: "section.tpw-finish",
    run: async () => {
      await goToStep("conclusion");
      await expect(await field(P.conclusion)).toHaveValue(PLAN.conclusion);
      await expect($("section.tpw-finish")).toBeDisplayed();
    },
  });

  step("salir-sin-guardar", {
    title: "Salir con cambios sin guardar",
    caption:
      "Liomar ha cambiado el alcance y el cronograma. Si va a otra sección sin guardar (o cierra la ventana), Pharos le avisa antes de perder el trabajo: «Seguir editando» le devuelve al plan para guardarlo; «Descartar cambios» sale sin guardar. La línea de estado del paso ya lo advertía: «Cambios sin guardar».",
    covers: ["dialogs:src/modules/test-plan/ui/TestPlanWizard.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await byTestId("nav-project-cases").click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("revisiones", {
    title: "Revisiones del plan",
    caption:
      "Liomar pulsa «Seguir editando» y «Guardar». Cada guardado con cambios sube la versión y crea una revisión, una copia fechada del plan. El panel «Historial», junto al formulario (o debajo en pantallas estrechas), enseña los últimos cambios: estado, versión, fecha, quién y qué pasos tocó (aquí, «Alcance» y «Cronograma»). Su enlace «Revisiones» abre la lista con el número, el título y la fecha de cada copia, la más reciente arriba.",
    covers: ["dialogs:src/modules/test-plan/ui/wizard/PlanSidePanels.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await $('[role="alertdialog"]').$(`button=${es.dialog.unsaved.keep}`).click();
      await button(P.save).click();
      await waitForToast(P.savedToast);
      await $('section[aria-labelledby="tpw-revs-title"]').$(`button=${P.revisions}`).click();
      await atLeast('[role="dialog"] .tp-revs__restore', 1);
    },
  });

  step("restaurar", {
    title: "Restaurar una revisión",
    caption:
      "«Restaurar» vuelve al contenido de una revisión anterior, tras pedir confirmación. El asistente carga ese contenido sin guardar, para que lo revises; si es lo que buscabas, «Guardar» crea una revisión nueva y las anteriores se conservan, así que restaurar nunca borra el historial. Aquí Liomar solo mira la confirmación y pulsa «Cancelar»: se queda con la revisión que acaba de guardar.",
    covers: ["dialogs:src/modules/test-plan/ui/TestPlanWizard.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      const restore = await $$('[role="dialog"] .tp-revs__restore');
      await restore[restore.length - 1].click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await dismissConfirm();
      await browser.keys("Escape");
      await expect($('[role="dialog"]')).not.toBeExisting();
    },
  });

  step("exportar", {
    title: "Exportar el plan",
    caption:
      "«Importar / Exportar», en la cabecera, ofrece el plan en .pdf, maquetado y listo para firmar, o en .xlsx, editable en Excel y que «Importar .xlsx» vuelve a leer. Al pie, el menú indica qué historial lleva el documento: «Solo la versión vigente» o «Historial de revisiones», según «Ajustes del proyecto» (capítulo 14). Se exporta lo que ves, aunque no esté guardado. El archivo va a tu carpeta de descarga (Administración › General, capítulo 15) y un aviso dice su nombre.",
    covers: ["action:plan-export"],
    focus: '[role="menu"]',
    run: async () => {
      await top();
      await button(P.io.button).click();
      await expect(menuItem(P.io.exportPdf)).toBeDisplayed();
    },
    after: async () => {
      await menuItem(P.io.exportPdf).click();
      await waitForToast(P.exportedToast.split("{{")[0], 60_000);
    },
  });

  step("enviar-plan", {
    title: "Enviar el plan a revisión",
    caption:
      "El estado del plan cambia con las acciones de «Estado del plan», como el de un caso. Un borrador se envía con «Enviar a revisión», con una nota opcional para quien revise, y pasa a «En revisión»; la cabecera del proyecto dice entonces «Plan en revisión». Borrador es solo el principio: desde ahí el plan se revisa las veces que haga falta hasta que se aprueba. Con cambios sin guardar, las acciones esperan y dicen por qué.",
    covers: ["dialogs:src/modules/test-plan/ui/wizard/PlanReviewControls.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await byTestId("plan-send-review").click();
      await $('[role="alertdialog"] textarea').setValue(PLAN_ON_SCREEN.reviewNote);
    },
    after: async () => {
      await byTestId("plan-send-review-confirm").click();
      await waitForToast(P.review.toast.send);
      await expect($(".pj-header")).toHaveText(expect.stringContaining(es.projects.header.plan.reviewed));
    },
  });

  step("aprobar", {
    title: "Aprobar el plan",
    caption:
      "En revisión, el plan se aprueba con «Aprobar versión N». Pharos pide confirmación y recuerda que, si después se edita el contenido, el plan volverá a «En revisión» y habrá que aprobarlo de nuevo. Liomar trabaja en su workspace personal, que no pide aprobación independiente, así que el diálogo le avisa de que aprueba su propio plan. Cuando el plan pasa al workspace del equipo, lo revisa otra persona: allí se piden cambios con «Pedir cambios…» y lo aprueba un Test Manager que no sea el autor (capítulo 21).",
    covers: ["dialogs:src/modules/test-plan/ui/wizard/PlanReviewControls.tsx", "action:plan-approve"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await byTestId("plan-approve").waitForEnabled();
      await byTestId("plan-approve").click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
      await expect($("body")).toHaveText(expect.stringContaining(P.review.selfApprovalNote.slice(0, 30)));
    },
  });

  step("aprobado", {
    title: "Plan aprobado",
    caption:
      "Al confirmar, el plan pasa a «Aprobado» sin cambiar de versión, y «Estado del plan» muestra quién lo aprobó y cuándo, aquí como «aprobación propia»; el PDF y el Excel lo llevan en la cabecera y el «Historial» lo apunta. Si luego cambias el contenido, un aviso lo dice antes de guardar, el plan vuelve a «En revisión» con una versión nueva y el historial indica que perdió la aprobación.",
    covers: ["action:plan-approved"],
    focus: "aside.tpw-side",
    run: async () => {
      await byTestId("plan-approve-confirm").click();
      await waitForToast(P.review.toast.approve.replace("{{version}}", "").split("(")[0].trim());
      await expect(byTestId("plan-approved-by")).toBeDisplayed();
      await top();
    },
  });

  step("obsoleto-plan", {
    title: "Marcar el plan como obsoleto",
    caption:
      "«Marcar obsoleto» pide confirmación: el plan se conserva, pero deja de usarse y, si estaba aprobado, pierde la aprobación. Sirve, por ejemplo, cuando una versión se cancela.",
    covers: ["dialogs:src/modules/test-plan/ui/wizard/PlanReviewControls.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await byTestId("plan-obsolete").click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await $('[role="alertdialog"]').$(`button=${P.review.obsolete}`).click();
      await waitForToast(P.review.toast.obsolete);
    },
  });

  step("reactivar-plan", {
    title: "Reactivar el plan",
    caption:
      "«Reactivar» devuelve el plan a «En revisión» (a Borrador si nunca se envió). No recupera la aprobación anterior: hay que aprobarlo de nuevo. Liomar lo deja así, en revisión, para que lo revise su compañero de QA cuando compartan el proyecto (capítulo 21).",
    covers: ["dialogs:src/modules/test-plan/ui/wizard/PlanReviewControls.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await byTestId("plan-reactivate").click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await $('[role="alertdialog"]').$(`button=${P.review.reactivate}`).click();
      await waitForToast(P.review.toast.reactivate);
      await expect($(".pj-header")).toHaveText(expect.stringContaining(es.projects.header.plan.reviewed));
    },
  });
});
