// Chapter 6 — Tablero (manual v2, MAN-03; before UX-21, «Planificador»): the
// kanban board of the QA team's work that is not a case or a defect. Cards of
// tasks and test data, the card editor with attachments and its
// unsaved-changes prompt, moving cards with the keyboard, filters, delete and
// the board on a phone. The example: the board of «Pharos», the app under test.
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { DESKTOP, MOBILE, chapter, setViewport, step } from "./tour";
import {
  chooseFile,
  PROJECT_A,
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
const DATA_CARD = "Preparar cuentas de prueba sintéticas";
const REVIEW_CARD = "Revisar los casos de sincronización";
const AUTO_CARD = "Automatizar la regresión de acceso";

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

chapter("tablero", () => {
  step("tablero", {
    title: "El tablero",
    caption:
      "El «Tablero» organiza el trabajo del equipo de pruebas que no es un caso ni un defecto: tareas (automatizar una regresión, revisar casos) y preparación de datos de prueba. Es la sección en la que se abre un proyecto que ya existe. Cuatro columnas, «Backlog», «En progreso», «En revisión» y «Hecho», muestran en qué punto está cada tarjeta, con su número al lado; el «+» de cada columna, o «Añadir tarjeta» al pie, crea una tarjeta directamente en ella. Arriba, los filtros por tipo y por prioridad y el buscador.",
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
      "«Nueva tarjeta», en la cabecera, abre el editor: el tipo (tarea, defecto o datos de prueba), la prioridad (baja, media, alta o crítica), el título, que es obligatorio, una descripción y etiquetas. En este ejemplo, Liomar prepara las cuentas de prueba de Pharos: «Preparar cuentas de prueba sintéticas», de tipo datos de prueba y prioridad alta. «Guardar» la deja en Backlog; una vez guardada, admite adjuntos.",
    covers: ["action:card-create"],
    run: async () => {
      await clickButton(L.newCard);
      await (await field(L.cardTitle)).setValue(DATA_CARD);
      await selectOption(L.kind, L.kindLabel.test_data);
      await selectOption(L.priority, L.priorityLabel.high);
      await (await field("Descripción")).setValue("Una cuenta por persona del equipo en el servidor de staging, con sus proyectos de ejemplo; ningún dato real.");
    },
  });

  step("adjunto", {
    title: "Adjuntar archivos a una tarjeta",
    caption:
      "Con la tarjeta guardada, «Adjuntar archivos», en «Adjuntos», acepta archivos de hasta 200 MB (en este ejemplo, «cuentas-de-prueba.csv» con las cuentas del equipo). Se guardan cifrados en este equipo; un clic en el nombre lo guarda en tu carpeta de descarga, y la papelera («Quitar: nombre del archivo») lo quita. Los adjuntos solo están en la app de escritorio.",
    covers: ["upload:src/modules/planner/ui/CardEditor.tsx"],
    focus: ".pl-attach__open",
    run: async () => {
      await $(".tp-editor__save").click();
      await waitForToast(L.savedToast);
      // Saving a new card returns to the board: open it again to attach.
      await $(`button.pl-card__title*=${DATA_CARD}`).click();
      await chooseFile("input.pl-attach__input", join(fixturesDir, "cuentas-de-prueba.csv"));
      await expect($(".pl-attach__open*=cuentas-de-prueba.csv")).toBeDisplayed();
    },
  });

  step("adjunto-grande", {
    title: "Archivos demasiado grandes",
    caption:
      "Un archivo de más de 200 MB no se adjunta: Pharos avisa con su nombre y el límite («… supera el límite de 200 MB.») y la tarjeta queda como estaba. Para vídeos largos, enlaza dónde están en la descripción.",
    covers: ["dialogs:src/modules/planner/ui/CardEditor.tsx"],
    toast: true,
    run: async () => {
      // The «Tarjeta guardada» toast first goes, so the capture shows only this one.
      await browser.waitUntil(async () => !(await $(`.toast-stack*=${L.savedToast}`).isDisplayed().catch(() => false)), {
        timeout: 15_000,
        timeoutMsg: "the «Tarjeta guardada» toast stayed",
      });
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
      await waitForToast(tf("planner.attachTooLarge", { name: "video-de-prueba.mp4", mb: 200 }), 15_000, { error: true });
    },
  });

  step("sin-guardar", {
    title: "Salir con cambios sin guardar",
    caption:
      "Si cambias algo y pulsas «← Volver» (o vas a otra sección) sin guardar, Pharos pregunta antes de perderlo: «Seguir editando» te deja en la tarjeta; «Descartar cambios» vuelve al tablero sin guardar. Sin cambios, «← Volver» sale directamente.",
    covers: ["dialogs:src/modules/planner/ui/CardEditor.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await (await field(L.cardTitle)).addValue(" (staging)");
      await $(".tp-editor__back").click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await clickButton(es.dialog.unsaved.discard, '[role="alertdialog"]');
      await expect($('section.pl-col[data-status="backlog"]')).toBeDisplayed();
      await expect($(`button.pl-card__title*=(staging)`)).not.toBeExisting();
    },
  });

  step("tarjetas", {
    title: "Tarjetas en el tablero",
    caption:
      "Cada tarjeta muestra su asa de arrastre, su tipo, su título, sus etiquetas y la bandera de su prioridad, para ver de un vistazo qué es urgente. Un clic en el título la abre para editarla; la papelera la elimina, tras pedir confirmación. En este ejemplo hay tres: las cuentas de prueba, «Revisar los casos de sincronización» y «Automatizar la regresión de acceso», esta con prioridad crítica.",
    run: async () => {
      await newCard(REVIEW_CARD, { priority: L.priorityLabel.medium });
      await back();
      await newCard(AUTO_CARD, { priority: L.priorityLabel.critical });
      await back();
      await expect($$("article.pl-card")).toBeElementsArrayOfSize(3);
    },
  });

  step("mover", {
    title: "Mover una tarjeta (también con el teclado)",
    caption:
      "Cuando una tarea avanza, arrastra su tarjeta con el ratón a la columna que corresponda (en este ejemplo, «Revisar los casos de sincronización» pasa a «En progreso»). Con el teclado: lleva el foco al asa (⠿) con Tab, pulsa Espacio o Intro para cogerla, muévela con ← → entre columnas y con ↑ ↓ dentro de la columna, y suéltala con Espacio o Intro; Esc cancela. Un lector de pantalla anuncia cada movimiento.",
    covers: ["action:card-move"],
    focus: 'section.pl-col[data-status="in_progress"] article.pl-card',
    run: async () => {
      const handle = $(`[aria-label="${tf("planner.drag.handle", { card: REVIEW_CARD })}"]`);
      await keyboardDrag(handle, { until: tf("planner.drag.over", { card: REVIEW_CARD, column: L.column.in_progress }) });
      await expect($('section.pl-col[data-status="in_progress"]').$(`article.pl-card*=${REVIEW_CARD}`)).toBeExisting();
    },
  });

  step("filtrar", {
    title: "Filtrar y buscar tarjetas",
    caption:
      "Con muchas tarjetas, filtra por tipo («Todas», «Tareas», «Datos de prueba», con su número) y por prioridad, o busca por título, clave o etiqueta sin preocuparte por los acentos (en este ejemplo, «regresion» deja una sola tarjeta). Los filtros solo cambian lo que ves: las tarjetas siguen en su columna.",
    covers: ["action:planner-filter"],
    run: async () => {
      await $(`button.chips__chip*=${L.filter.test_data}`).click();
      await browser.waitUntil(async () => (await $$("article.pl-card")).length === 1, { timeoutMsg: "the test-data filter did not leave 1 card" });
      await $(`button.chips__chip*=${L.filter.all}`).click();
      await $(`input[placeholder="${L.filter.search}"]`).setValue("regresion");
      await browser.waitUntil(async () => (await $$("article.pl-card")).length === 1, { timeoutMsg: "the search did not leave 1 card" });
    },
  });

  step("eliminar", {
    title: "Eliminar una tarjeta",
    caption:
      "La papelera de la tarjeta pide confirmación («¿Eliminar la tarjeta?») antes de borrarla con sus adjuntos. Esc no cierra este aviso: solo «Cancelar».",
    covers: ["dialogs:src/modules/planner/ui/PlannerBoard.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await $(`button[aria-label="Eliminar: ${AUTO_CARD}"]`).click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("eliminada", {
    title: "Tarjeta eliminada",
    caption: "Al confirmar, la tarjeta desaparece del tablero.",
    shot: false,
    run: async () => {
      await clickButton(L.deleteConfirm, '[role="alertdialog"]');
      await clearInput(`input[placeholder="${L.filter.search}"]`);
      await browser.waitUntil(async () => (await $$("article.pl-card")).length === 2, { timeoutMsg: "the card was not deleted" });
    },
  });

  step("movil", {
    title: "El tablero en el móvil",
    caption:
      "En el móvil, las columnas se recorren deslizando de lado y los filtros (tipo, búsqueda y prioridad) quedan arriba; el menú de prioridad se abre como una hoja desde abajo. «Nueva tarjeta» está en la fila de botones de la sección.",
    covers: ["platform:mobile-planner"],
    run: async () => {
      await setViewport(MOBILE);
      await expect($("section.pl-col")).toBeDisplayed();
      await expect($(`button*=${L.priority}`)).toBeDisplayed();
    },
    after: async () => {
      await setViewport(DESKTOP);
    },
  });
});
