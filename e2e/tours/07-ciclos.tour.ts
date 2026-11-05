// Chapter 7 — Ciclos y configuraciones: a cycle (what runs, where, against
// which build), adding cases one by one and by filter, assigning, reordering,
// executing it into runs (one per configuration), cloning and deleting.
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
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
    caption: "Pulsa «Ciclos de prueba» en el menú lateral. Arriba, «Nuevo ciclo» y los filtros por estado; sin ciclos, la lista lo indica.",
    covers: ["section:cycles", "state:cycles-empty"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("cycles");
      await waitForText(Y.empty.slice(0, 30));
    },
  });

  step("nuevo-ciclo", {
    title: "Nuevo ciclo",
    caption: "«Nuevo ciclo» pide título, build, entorno, hito y sprint del plan, fechas y las configuraciones en las que se ejecutará.",
    covers: ["dialogs:src/modules/cycles/ui/CycleDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(Y.new);
      await expect(dialog()).toBeDisplayed();
      await (await field(Y.field.title, D)).setValue("Regresión 2.0");
      await (await field(Y.field.build, D)).setValue("2.0.0-rc1");
      await (await field(Y.field.environment, D)).setValue("preproducción");
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
    caption: "«Crear ciclo» lo crea con su clave (CY-1) y abre su detalle: resumen de resultados y las pestañas «Elementos» y «Runs».",
    run: async () => {
      await clickButton(Y.create, D);
      await waitForText(Y.createdToast.split("{{")[0]);
      if (!(await $("#cy-detail-title").isExisting())) await $("button.cy-key").click();
      await expect($("#cy-detail-title")).toBeDisplayed();
    },
  });

  step("anadir-casos", {
    title: "Añadir casos al ciclo",
    caption: "«Añadir casos» lista los casos del proyecto con buscador; marca los que quieras, asígnalos a alguien si quieres y confirma. Pharos avisa si alguno no está aprobado.",
    covers: ["dialogs:src/modules/cycles/ui/ItemDialogs.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(Y.add.action);
      await expect(dialog()).toBeDisplayed();
      const picks = Array.from(await $("ul.cy-pick").$$("input[type=checkbox]"));
      for (const p of picks.slice(0, 2)) await p.click();
      await (await field(Y.add.assignee, D)).setValue("Ana Pérez");
    },
  });

  step("por-filtro", {
    title: "Añadir por filtro",
    caption: "«Añadir por filtro» elige los casos por etiquetas, prioridad, estado, requisitos o riesgo; el recuento se actualiza mientras marcas.",
    covers: ["dialogs:src/modules/cycles/ui/ItemDialogs.tsx"],
    run: async () => {
      await clickButton(tf("cycles.add.confirm_other", { count: 2 }), D);
      await waitForText(tf("cycles.add.addedToast_other", { count: 2 }));
      await clickButton(Y.filter.action);
      await expect(dialog().$(".cy-preview")).toBeDisplayed();
      const prio = Array.from(await $(D).$$("input[type=checkbox]"));
      await prio[0].click();
    },
  });

  step("elementos", {
    title: "Los elementos del ciclo",
    caption: "Cada elemento muestra el caso, a quién está asignado (se edita en la propia fila; Intro guarda) y su resultado. El menú de la fila lo sube, lo baja o lo quita del ciclo.",
    covers: ["action:cycle-assignee", "action:cycle-item-menu"],
    run: async () => {
      await clickButton(Y.filter.confirm, D);
      await $(".cd-overlay").waitForExist({ reverse: true });
      const assignee = $(`input[aria-label^="${tf("cycles.items.assigneeOf", { key: "" })}"]`);
      await assignee.setValue("Luis Gómez");
      await browser.keys("Enter");
      const menus = Array.from(await $$(`button[aria-label^="${tf("cycles.items.actions", { key: "" })}"]`));
      await menus[menus.length - 1].click();
      await expect(menuItem(Y.items.remove)).toBeDisplayed();
    },
  });

  step("ejecutar", {
    title: "Ejecutar el ciclo",
    caption: "«Ejecutar» crea un run por configuración con todos los elementos. Elige configuraciones, build y entorno y pulsa «Crear N runs».",
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
    caption: "Los runs creados aparecen en la pestaña «Runs» y en «Ejecuciones» (capítulo 8), listos para registrar resultados.",
    covers: ["tabs:src/modules/cycles/ui/CycleDetail.tsx"],
    run: async () => {
      await clickButton(tf("cycles.execute.confirm_other", { count: 2 }), D);
      await waitForText(tf("cycles.execute.doneToast_other", { count: 2, keys: "" }).split(":")[0]);
      await $('[data-testid="tab-cy-runs"]').click();
      await browser.waitUntil(async () => (await $$("tr.dt__row")).length >= 2, { timeoutMsg: "the cycle shows no runs" });
    },
  });

  step("informe-ciclo", {
    title: "Informe de estado de un ciclo",
    caption: "«Informe de estado» en la cabecera del ciclo abre el informe con el alcance ya puesto en ese ciclo: el progreso cuenta cada caso en cada configuración, como la pestaña «Elementos». El informe completo se explica en el capítulo 13.",
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
    caption: "El menú «⋯» del ciclo lo clona (con sus elementos, sin resultados: útil para la siguiente regresión) o lo elimina tras confirmar.",
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
    caption: "Eliminar un ciclo pide confirmación; sus runs se conservan en «Ejecuciones».",
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await menuItem(Y.clone).click();
      await waitForText(Y.clonedToast.split("{{")[0]);
      await $(`button[aria-label="${Y.moreActions}"]`).click();
      await menuItem(Y.delete).click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("lista", {
    title: "La lista de ciclos",
    caption: "La lista muestra cada ciclo con su estado, fechas, configuraciones, progreso y runs; filtra por Planificados, Activos o Cerrados.",
    covers: ["action:cycles-filter"],
    run: async () => {
      await clickButton(Y.deleteConfirm, '[role="alertdialog"]');
      await waitForText(Y.deletedToast.split("{{")[0].trim() || "eliminado");
      // Deleting returns to the list.
      await $("#cy-title").waitForDisplayed();
      await clickButton(Y.statusPlural.planned);
      await waitForText(Y.emptyFilter);
      await clickButton(Y.all);
      await expect($("button.cy-key")).toBeDisplayed();
    },
  });
});
