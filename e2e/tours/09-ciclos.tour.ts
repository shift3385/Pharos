// Chapter 9 — Ciclos de prueba (manual v2, MAN-03): the cycle «Regresión
// 0.6.0» of «Pharos» (what runs, where, against which build), adding cases one
// by one and by filter, assigning, reordering, executing it into runs (one per
// configuration), cloning, deleting and the list on a phone. Its closing (the
// status report on real results, the quality gate and the closure report) is
// 09-ciclos-cierre.tour.ts, which runs after chapters 10 to 13 and prints at
// the end of this chapter.
import { $, $$, browser, expect } from "@wdio/globals";
import { DESKTOP, MOBILE, chapter, setViewport, step } from "./tour";
import {
  PROJECT_A,
  clickButton,
  dialog,
  es,
  field,
  menuItem,
  openProject,
  openSection,
  pickDate,
  tf,
  typeDate,
  waitForText,
  waitForToast,
} from "./helpers";
import { CYCLE } from "./data/pharos";

const Y = es.cycles;
const D = '[role="dialog"]';

chapter("ciclos", () => {
  step("vacio", {
    title: "Ciclos de prueba",
    caption:
      "Un ciclo agrupa lo que se va a probar en una ronda concreta (una regresión, una versión candidata), dónde y contra qué build. Ejecutarlo crea un run por configuración, donde se registran los resultados (capítulos 10 y 11). Pulsa «Ciclos de prueba» en el menú lateral. Arriba, «Nuevo ciclo» y los filtros por estado; sin ciclos, la lista dice «Aún no hay ciclos…».",
    covers: ["section:cycles", "state:cycles-empty"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("cycles");
      await waitForText(Y.empty.slice(0, 30));
    },
  });

  step("nuevo-ciclo", {
    title: "Nuevo ciclo",
    caption:
      "«Nuevo ciclo» pide el título (obligatorio), la build y el entorno contra los que se prueba, el hito y el sprint del plan, las fechas (se escriben dd/mm/aaaa o se eligen en el calendario de Pharos, capítulo 5; el de «Termina» abre en el mes de «Empieza» y no deja elegir un día anterior) y las configuraciones en las que se ejecutará (las de «Ajustes del proyecto», capítulo 14). En este ejemplo, «Regresión 0.6.0» de la build 0.6.0-beta.1 en staging, con las fechas del Sprint 1 del plan, en Chrome y en Edge sobre Windows 11. Sin configuraciones, el ciclo se ejecuta como un único run. Intro en un campo crea el ciclo.",
    covers: ["dialogs:src/modules/cycles/ui/CycleDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(Y.new);
      await expect(dialog()).toBeDisplayed();
      await (await field(Y.field.title, D)).setValue(CYCLE.title);
      await (await field(Y.field.build, D)).setValue(CYCLE.build);
      await (await field(Y.field.environment, D)).setValue(CYCLE.environment);
      await (await field(Y.field.sprint, D)).setValue(CYCLE.sprint);
      // The start typed, the end picked in the calendar (UX-36): it opens on
      // the start's month, with the days before it off.
      await typeDate(await field(Y.field.startsOn, D), CYCLE.startsOn);
      await pickDate(await field(Y.field.endsOn, D), CYCLE.endsOn);
      const checks = Array.from(await $(D).$$(".cy-check input[type=checkbox]"));
      if (checks.length === 0) throw new Error("the cycle dialog offers no configuration (chapter 2 creates them)");
      for (const c of checks.slice(0, 2)) await c.click();
    },
  });

  step("detalle", {
    title: "El ciclo, recién creado",
    caption:
      "«Crear ciclo» lo crea con su clave y abre su detalle: arriba, el estado, la build, el entorno, las fechas y el sprint; los botones «Ejecutar», «Informe de estado», «Editar», «Cerrar ciclo…» (al final del capítulo) y el menú «⋯»; el resumen de resultados (pasa, falla, bloqueado, omitido, sin ejecutar) y las pestañas «Elementos», lo que hay que probar, y «Runs», las ejecuciones lanzadas. «← Ciclos» vuelve a la lista. Un ciclo vacío no se puede ejecutar todavía.",
    run: async () => {
      await clickButton(Y.create, D);
      await waitForToast(Y.createdToast.split("{{")[0]);
      // Creating opens the detail; until it renders, neither the detail nor
      // the list's key may be on screen (the same race as BASE-24). Wait for
      // one of them instead of looking once.
      await browser.waitUntil(
        async () => (await $("#cy-detail-title").isExisting()) || (await $("button.cy-key").isExisting()),
        { timeout: 15_000, interval: 200, timeoutMsg: "neither the new cycle's detail nor its key in the list appeared" },
      );
      if (!(await $("#cy-detail-title").isExisting())) await $("button.cy-key").click();
      await expect($("#cy-detail-title")).toBeDisplayed();
    },
  });

  step("anadir-casos", {
    title: "Añadir casos al ciclo",
    caption:
      "«Añadir casos» lista los casos del proyecto con buscador: marca los que entran en esta ronda, asígnalos a alguien si quieres (en este ejemplo, Liomar se los asigna a sí mismo) y confirma. Los que ya están en el ciclo salen marcados y bloqueados («Ya en el ciclo»). Pharos avisa si alguno no está aprobado («No aprobado»), para que no pruebes un caso aún en borrador sin saberlo; se añade igualmente.",
    covers: ["dialogs:src/modules/cycles/ui/ItemDialogs.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(Y.add.action);
      await expect(dialog()).toBeDisplayed();
      const picks = Array.from(await $("ul.cy-pick").$$("input[type=checkbox]"));
      for (const p of picks.slice(0, 2)) await p.click();
      await (await field(Y.add.assignee, D)).setValue(CYCLE.assignee);
    },
  });

  step("por-filtro", {
    title: "Añadir por filtro",
    caption:
      "Para no marcar caso por caso, «Añadir por filtro» los elige por etiquetas, prioridad, estado del caso, requisitos o riesgo mínimo de sus requisitos (por ejemplo, «Alto (≥ 13)»). El recuento («N casos coinciden») se actualiza mientras marcas. Se añaden los que coinciden en ese momento: si después cambian, el ciclo no cambia. En este ejemplo, Liomar marca la prioridad alta: solo coincide PH-001, que ya está en el ciclo, así que no se añade nada nuevo.",
    covers: ["dialogs:src/modules/cycles/ui/ItemDialogs.tsx"],
    run: async () => {
      await clickButton(tf("cycles.add.confirm_other", { count: 2 }), D);
      await waitForToast(tf("cycles.add.addedToast_other", { count: 2 }));
      await clickButton(Y.filter.action);
      await expect(dialog().$(".cy-preview")).toBeDisplayed();
      const prio = Array.from(await $(D).$$("input[type=checkbox]"));
      await prio[0].click();
      // The live count follows (200 ms later): only PH-001 is «Alta».
      await waitForText(tf("cycles.filter.matches_one", { count: 1 }));
    },
  });

  step("elementos", {
    title: "Los elementos del ciclo",
    caption: "Cada elemento muestra el caso, a quién está asignado y su resultado en cada configuración. El asignado se edita en la propia fila: Intro o salir del campo lo guarda (en este ejemplo, los dos casos ya están asignados a Liomar). El menú de la fila, «Acciones de PH-…», lo sube, lo baja o lo quita del ciclo. «Quitar del ciclo» pregunta antes; quitarlo no borra el caso ni sus resultados, y puedes volver a añadirlo.",
    covers: ["action:cycle-assignee", "action:cycle-item-menu"],
    run: async () => {
      await clickButton(Y.filter.confirm, D);
      await $(".cd-overlay").waitForExist({ reverse: true });
      const assignee = $(`input[aria-label^="${tf("cycles.items.assigneeOf", { key: "" })}"]`);
      await assignee.setValue(CYCLE.assignee);
      await browser.keys("Enter");
    },
  });

  step("quitar-elemento", {
    title: "Quitar un elemento del ciclo",
    caption:
      "«Quitar del ciclo» pregunta antes de hacerlo. El caso deja de formar parte del ciclo, pero sus resultados ya registrados se conservan y puedes volver a añadirlo cuando quieras. Es una confirmación normal: Esc, un clic fuera o «Cancelar» lo dejan como estaba (en este ejemplo, Liomar cancela).",
    covers: ["dialogs:src/modules/cycles/ui/CycleDetail.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      const menus = Array.from(await $$(`button[aria-label^="${tf("cycles.items.actions", { key: "" })}"]`));
      await menus[menus.length - 1].click();
      await menuItem(Y.items.remove).click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await browser.keys("Escape");
      await $('[role="alertdialog"]').waitForExist({ reverse: true });
    },
  });

  step("ejecutar", {
    title: "Ejecutar el ciclo",
    caption:
      "«Ejecutar» crea un run por configuración con todos los elementos: así cada navegador o equipo lleva su propio registro de resultados. Cada caso se congela en su revisión actual: si después cambia, el run ejecuta la versión que había. Elige configuraciones, build y entorno (vienen del ciclo) y pulsa «Crear N runs». En la web también se puede ejecutar.",
    covers: ["dialogs:src/modules/cycles/ui/ExecuteDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(Y.execute.action);
      await expect(dialog()).toBeDisplayed();
    },
  });

  step("runs", {
    title: "Los runs del ciclo",
    caption: "Los runs creados aparecen en la pestaña «Runs» (con su configuración, su estado y su inicio) y en «Ejecuciones» (capítulo 10), listos para registrar resultados. Un clic en su clave abre el run para ejecutarlo paso a paso (capítulo 11). El ciclo sigue «Activo» mientras se ejecuta: se cierra cuando ya tiene resultados, como se ve al final de este capítulo.",
    covers: ["tabs:src/modules/cycles/ui/CycleDetail.tsx"],
    run: async () => {
      await clickButton(tf("cycles.execute.confirm_other", { count: 2 }), D);
      await waitForToast(tf("cycles.execute.doneToast_other", { count: 2, keys: "" }).split(":")[0]);
      await $('[data-testid="tab-cy-runs"]').click();
      await browser.waitUntil(async () => (await $$("tr.dt__row")).length >= 2, { timeoutMsg: "the cycle shows no runs" });
    },
  });

  step("clonar", {
    title: "Clonar y eliminar un ciclo",
    caption:
      "El menú «⋯» del ciclo lo clona, con sus elementos y sin resultados, útil para repetir una regresión en la siguiente versión (el clon se abre solo); también lo elimina, tras confirmar.",
    covers: ["dialogs:src/modules/cycles/ui/CycleDetail.tsx"],
    run: async () => {
      await $(`button[aria-label="${Y.moreActions}"]`).click();
      await expect(menuItem(Y.clone)).toBeDisplayed();
    },
  });

  step("eliminar", {
    title: "Confirmar la eliminación",
    caption:
      "Eliminar un ciclo pide confirmación, con cuántos runs tiene. Los resultados no se pierden: sus runs se conservan, sin ciclo, en «Ejecuciones». El ciclo eliminado pasa a la Papelera (Administración › General, capítulo 15), desde donde se restaura mientras dure la retención. Esc no cierra este aviso: solo «Cancelar». En este ejemplo, Liomar elimina el clon que acaba de crear.",
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await menuItem(Y.clone).click();
      await waitForToast(Y.clonedToast.split("{{")[0]);
      await $(`button[aria-label="${Y.moreActions}"]`).click();
      await menuItem(Y.delete).click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("lista", {
    title: "La lista de ciclos",
    caption:
      "La lista muestra cada ciclo con su clave, su título con la build y el entorno, su estado, sus fechas, sus configuraciones, su progreso y sus runs. Filtra por «Planificados», «Activos» o «Cerrados» (← → también cambian de filtro) para ver de un vistazo lo que está en curso; si ningún ciclo coincide, la lista lo dice.",
    covers: ["action:cycles-filter"],
    run: async () => {
      await clickButton(Y.deleteConfirm, '[role="alertdialog"]');
      await waitForToast(Y.deletedToast.split("{{")[0].trim() || "eliminado");
      // Deleting returns to the list.
      await $("#cy-title").waitForDisplayed();
      await clickButton(Y.statusPlural.planned);
      await waitForText(Y.emptyFilter);
      await clickButton(Y.all);
      await expect($("button.cy-key")).toBeDisplayed();
    },
  });
  step("movil", {
    title: "Los ciclos en el móvil",
    caption:
      "En el móvil, cada ciclo es una tarjeta con su clave, su estado, su título, sus fechas y su progreso; un toque lo abre.",
    covers: ["platform:mobile-cycles"],
    run: async () => {
      await setViewport(MOBILE);
      await expect($("button.cy-key")).toBeDisplayed();
    },
    after: async () => {
      await setViewport(DESKTOP);
    },
  });
});
