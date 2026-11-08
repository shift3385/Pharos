// Chapter 6 — Tablero (UX-21; before, «Planificador»): the kanban board of tasks and test data, the card
// editor with attachments, moving cards with the keyboard, filters and delete.
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import {
  PROJECT_A,
  acceptNativeDialog,
  clearInput,
  clickButton,
  es,
  field,
  fixturesDir,
  keyboardDrag,
  openProject,
  openSection,
  selectOption,
  tf,
  waitForToast,
} from "./helpers";

const L = es.planner;

async function newCard(title: string, opts: { kind?: string; priority?: string; description?: string } = {}) {
  await clickButton(L.newCard);
  await (await field(L.cardTitle)).setValue(title);
  if (opts.kind) await selectOption(L.kind, opts.kind);
  if (opts.priority) await selectOption(L.priority, opts.priority);
  if (opts.description) await (await field("Descripción")).setValue(opts.description);
  await $(".tp-editor__save").click();
  await waitForToast(L.savedToast);
}

async function back() {
  // Saving a new item may already close the editor: a missing button is fine.
  if (await $(".tp-editor__back").isExisting()) await $(".tp-editor__back").click().catch(() => undefined);
  await expect($('section.pl-col[data-status="backlog"]')).toBeDisplayed();
}

chapter("planificador", () => {
  step("tablero", {
    title: "El tablero",
    caption:
      "El tablero organiza el trabajo del equipo de pruebas que no es un caso: tareas y preparación de datos. Pulsa «Tablero» en el menú lateral, justo debajo de «Plan»: cuatro columnas (Backlog, En progreso, En revisión y Hecho) muestran en qué punto está cada tarjeta; el «+» de cada columna crea una tarjeta directamente en ella. Arriba, los filtros por tipo y prioridad y el buscador.",
    covers: ["section:planner"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("planner");
      await expect($$("section.pl-col")).toBeElementsArrayOfSize(4);
    },
  });

  step("nueva-tarjeta", {
    title: "Nueva tarjeta",
    caption:
      "«Nueva tarjeta» abre el editor. Una tarjeta es una tarea o un conjunto de datos de prueba, con su prioridad, una descripción y etiquetas (en este ejemplo, «Preparar datos de clientes sintéticos», de tipo datos de prueba y prioridad alta). «Guardar» la deja en Backlog; una vez guardada, admite adjuntos.",
    covers: ["action:card-create"],
    run: async () => {
      await clickButton(L.newCard);
      await (await field(L.cardTitle)).setValue("Preparar datos de clientes sintéticos");
      await selectOption(L.kind, L.kindLabel.test_data);
      await selectOption(L.priority, L.priorityLabel.high);
      await (await field("Descripción")).setValue("50 clientes con saldo, tarjetas y beneficiarios; sin datos reales.");
    },
  });

  step("adjunto", {
    title: "Adjuntar archivos a una tarjeta",
    caption:
      "Con la tarjeta guardada, «Adjuntos» acepta archivos hasta el límite indicado (en este ejemplo, un .csv con los datos de clientes). Se guardan cifrados en este equipo y se abren desde la propia tarjeta; la papelera junto a cada archivo («Quitar: nombre del archivo») lo quita.",
    covers: ["upload:src/modules/planner/ui/CardEditor.tsx"],
    focus: ".pl-attach__open",
    run: async () => {
      await $(".tp-editor__save").click();
      await waitForToast(L.savedToast);
      // Saving a new card returns to the board: open it again to attach.
      await $("button.pl-card__title*=Preparar datos").click();
      await $("input.pl-attach__input").setValue(join(fixturesDir, "datos-clientes.csv"));
      await expect($(".pl-attach__open*=datos-clientes.csv")).toBeDisplayed();
    },
  });

  step("adjunto-grande", {
    title: "Archivos demasiado grandes",
    caption:
      "Un archivo de más de 200 MB no se adjunta: Pharos avisa con su nombre y el límite, y la tarjeta queda como estaba.",
    covers: ["dialogs:src/modules/planner/ui/CardEditor.tsx"],
    shot: false,
    run: async () => {
      // A 201 MB file made in the page (nothing that big crosses WebDriver):
      // the same change event a file pick fires.
      await browser.execute(() => {
        const input = document.querySelector<HTMLInputElement>("input.pl-attach__input");
        if (!input) throw new Error("no attachment input");
        const mb = new Uint8Array(1024 * 1024);
        const big = new File(Array.from({ length: 201 }, () => mb), "video-de-prueba.mp4", { type: "video/mp4" });
        const dt = new DataTransfer();
        dt.items.add(big);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(await browser.getAlertText()).toContain("200 MB");
      await acceptNativeDialog();
    },
  });

  step("tarjetas", {
    title: "Tarjetas en el tablero",
    caption:
      "Cada tarjeta muestra su tipo, su prioridad y sus etiquetas, para ver de un vistazo qué es urgente. Un clic en el título la abre para editarla; el botón «Eliminar» (la papelera) la borra, tras pedir confirmación.",
    run: async () => {
      await back();
      await newCard("Revisar casos de pagos con QR", { priority: L.priorityLabel.medium });
      await back();
      await newCard("Automatizar la regresión de transferencias", { priority: L.priorityLabel.critical });
      await back();
      await expect($$("article.pl-card")).toBeElementsArrayOfSize(3);
    },
  });

  step("mover", {
    title: "Mover una tarjeta (también con el teclado)",
    caption:
      "Cuando una tarea avanza, arrastra su tarjeta por el asa a la columna que corresponda (en este ejemplo, «Revisar casos de pagos con QR» pasa a «En progreso»). Con el teclado: lleva el foco al asa, pulsa Espacio para cogerla, muévela con las flechas y suéltala con Espacio.",
    covers: ["action:card-move"],
    focus: "section.pl-col[data-status=\"in_progress\"] article.pl-card",
    run: async () => {
      const handle = $(`[aria-label="${tf("planner.drag.handle", { card: "Revisar casos de pagos con QR" })}"]`);
      await keyboardDrag(handle, { until: tf("planner.drag.over", { card: "Revisar casos de pagos con QR", column: L.column.in_progress }) });
      await expect(
        $('section.pl-col[data-status="in_progress"]').$("article.pl-card*=Revisar casos de pagos con QR"),
      ).toBeExisting();
    },
  });

  step("filtrar", {
    title: "Filtrar y buscar tarjetas",
    caption:
      "Con muchas tarjetas, filtra por tipo (tareas o datos de prueba) y por prioridad, o busca por texto (en este ejemplo, «regresión» deja una sola tarjeta). Los filtros solo cambian lo que ves; las tarjetas siguen en su columna.",
    covers: ["action:planner-filter"],
    run: async () => {
      await $(`button.chips__chip*=${L.filter.test_data}`).click();
      await browser.waitUntil(async () => (await $$("article.pl-card")).length === 1, { timeoutMsg: "the test-data filter did not leave 1 card" });
      await $(`button.chips__chip*=${L.filter.all}`).click();
      await $(`input[placeholder="${L.filter.search}"]`).setValue("regresión");
      await browser.waitUntil(async () => (await $$("article.pl-card")).length === 1, { timeoutMsg: "the search did not leave 1 card" });
    },
  });

  step("eliminar", {
    title: "Eliminar una tarjeta",
    caption:
      "El botón «Eliminar» de la tarjeta pide confirmación («¿Eliminar la tarjeta?») antes de borrarla con sus adjuntos.",
    covers: ["dialogs:src/modules/planner/ui/PlannerBoard.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await $('button[aria-label="Eliminar: Automatizar la regresión de transferencias"]').click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("eliminada", {
    title: "Tarjeta eliminada",
    caption:
      "Al confirmar, la tarjeta desaparece del tablero.",
    shot: false,
    run: async () => {
      await clickButton(L.deleteConfirm, '[role="alertdialog"]');
      await clearInput(`input[placeholder="${L.filter.search}"]`);
      await browser.waitUntil(async () => (await $$("article.pl-card")).length === 2, { timeoutMsg: "the card was not deleted" });
    },
  });
});
