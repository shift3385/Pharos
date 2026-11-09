// Chapter 9 — Ciclos de prueba (manual v2, MAN-03): the cycle «Regresión
// 0.3.0» of «Pharos» (what runs, where, against which build), adding cases one
// by one and by filter, assigning, reordering, executing it into runs (one per
// configuration), its status report, cloning, deleting and the list on a phone.
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
  tf,
  waitForText,
  waitForToast,
} from "./helpers";

const Y = es.cycles;
const D = '[role="dialog"]';

async function setDate(el: WebdriverIO.Element, iso: string) {
  await browser.execute(
    (input: HTMLInputElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    el as unknown as HTMLInputElement,
    iso,
  );
}

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
      "«Nuevo ciclo» pide el título (obligatorio), la build y el entorno contra los que se prueba, el hito y el sprint del plan, las fechas y las configuraciones en las que se ejecutará (las de «Ajustes del proyecto», capítulo 14). En este ejemplo, «Regresión 0.3.0» de la build 0.3.0-rc1 en staging, del 9 al 20 de noviembre, en Chrome y en Edge sobre Windows 11. Sin configuraciones, el ciclo se ejecuta como un único run. Intro en un campo crea el ciclo.",
    covers: ["dialogs:src/modules/cycles/ui/CycleDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(Y.new);
      await expect(dialog()).toBeDisplayed();
      await (await field(Y.field.title, D)).setValue("Regresión 0.3.0");
      await (await field(Y.field.build, D)).setValue("0.3.0-rc1");
      await (await field(Y.field.environment, D)).setValue("staging");
      await (await field(Y.field.sprint, D)).setValue("Sprint 1");
      await setDate(await field(Y.field.startsOn, D), "2026-11-09");
      await setDate(await field(Y.field.endsOn, D), "2026-11-20");
      const checks = Array.from(await $(D).$$(".cy-check input[type=checkbox]"));
      if (checks.length === 0) throw new Error("the cycle dialog offers no configuration (chapter 2 creates them)");
      for (const c of checks.slice(0, 2)) await c.click();
    },
  });

  step("detalle", {
    title: "El ciclo, recién creado",
    caption:
      "«Crear ciclo» lo crea con su clave y abre su detalle: arriba, el estado, la build, el entorno, las fechas y el sprint; los botones «Ejecutar», «Informe de estado», «Editar» y el menú «⋯»; el resumen de resultados (pasa, falla, bloqueado, omitido, sin ejecutar) y las pestañas «Elementos», lo que hay que probar, y «Runs», las ejecuciones lanzadas. «← Ciclos» vuelve a la lista. Un ciclo vacío no se puede ejecutar todavía.",
    run: async () => {
      await clickButton(Y.create, D);
      await waitForToast(Y.createdToast.split("{{")[0]);
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
      await (await field(Y.add.assignee, D)).setValue("Liomar Rodríguez");
    },
  });

  step("por-filtro", {
    title: "Añadir por filtro",
    caption:
      "Para no marcar caso por caso, «Añadir por filtro» los elige por etiquetas, prioridad, estado del caso, requisitos o riesgo mínimo de sus requisitos (por ejemplo, «Alto (≥ 13)»). El recuento («N casos coinciden») se actualiza mientras marcas. Se añaden los que coinciden en ese momento: si después cambian, el ciclo no cambia.",
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
      await assignee.setValue("Liomar Rodríguez");
      await browser.keys("Enter");
      const menus = Array.from(await $$(`button[aria-label^="${tf("cycles.items.actions", { key: "" })}"]`));
      await menus[menus.length - 1].click();
      await expect(menuItem(Y.items.remove)).toBeDisplayed();
    },
  });

  step("quitar-elemento", {
    title: "Quitar un elemento del ciclo",
    caption:
      "«Quitar del ciclo» pregunta antes de hacerlo. El caso deja de formar parte del ciclo, pero sus resultados ya registrados se conservan y puedes volver a añadirlo cuando quieras. Es una confirmación normal: Esc, un clic fuera o «Cancelar» lo dejan como estaba (en este ejemplo, Liomar cancela).",
    covers: ["dialogs:src/modules/cycles/ui/CycleDetail.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
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
      // The row menu is gone before the click: a late Escape must not reach
      // the dialog that opens next.
      await browser.keys("Escape");
      await menuItem(Y.items.remove).waitForDisplayed({ reverse: true });
      await clickButton(Y.execute.action);
      await expect(dialog()).toBeDisplayed();
    },
  });

  step("runs", {
    title: "Los runs del ciclo",
    caption: "Los runs creados aparecen en la pestaña «Runs» (con su configuración, su estado y su inicio) y en «Ejecuciones» (capítulo 10), listos para registrar resultados. Un clic en su clave abre el run para ejecutarlo paso a paso (capítulo 11).",
    covers: ["tabs:src/modules/cycles/ui/CycleDetail.tsx"],
    run: async () => {
      await clickButton(tf("cycles.execute.confirm_other", { count: 2 }), D);
      await waitForToast(tf("cycles.execute.doneToast_other", { count: 2, keys: "" }).split(":")[0]);
      await $('[data-testid="tab-cy-runs"]').click();
      await browser.waitUntil(async () => (await $$("tr.dt__row")).length >= 2, { timeoutMsg: "the cycle shows no runs" });
    },
  });

  step("informe-ciclo", {
    title: "Informe de estado de un ciclo",
    caption: "«Informe de estado» en la cabecera del ciclo abre el informe con el alcance ya puesto en ese ciclo: el progreso cuenta cada caso en cada configuración, como la pestaña «Elementos». El informe completo, con sus exportaciones a Excel y PDF, se explica en el capítulo 11.",
    covers: ["action:cycle-report"],
    shot: { element: D },
    run: async () => {
      await $('[data-testid="cycle-report"]').click();
      await expect($('[data-testid="status-report"]')).toBeDisplayed();
      await waitForText(es.statusReport.section.identification);
    },
  });

  step("clonar", {
    title: "Clonar y eliminar un ciclo",
    caption:
      "El menú «⋯» del ciclo lo clona, con sus elementos y sin resultados, útil para repetir una regresión en la siguiente versión (el clon se abre solo); también lo elimina, tras confirmar.",
    covers: ["dialogs:src/modules/cycles/ui/CycleDetail.tsx"],
    run: async () => {
      if (await $('[data-testid="status-report"]').isExisting()) {
        await browser.keys("Escape");
        await $(".cd-overlay").waitForExist({ reverse: true });
      }
      await $(`button[aria-label="${Y.moreActions}"]`).click();
      await expect(menuItem(Y.clone)).toBeDisplayed();
    },
  });

  step("eliminar", {
    title: "Confirmar la eliminación",
    caption:
      "Eliminar un ciclo pide confirmación, con cuántos runs tiene. Los resultados no se pierden: sus runs se conservan, sin ciclo, en «Ejecuciones». Esc no cierra este aviso: solo «Cancelar».",
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
      "En el móvil, cada ciclo es una tarjeta con su clave, su estado, su título, sus fechas y su progreso. Dentro de un ciclo, cada elemento es una tarjeta con su caso, su asignado y una pastilla por configuración; su menú «⋯» lo sube, lo baja o lo quita. El asignado se cambia desde un ordenador.",
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
