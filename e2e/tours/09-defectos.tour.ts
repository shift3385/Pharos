// Chapter 9 — Defectos: the list and the board, the editor (details,
// reproduction, links, evidence), a defect born from a failed result, moving
// through its states (with a resolution when closing), filters and delete.
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import {
  PROJECT_A,
  atLeast,
  clearInput,
  clickButton,
  dialog,
  es,
  field,
  fixturesDir,
  hasText,
  keyboardDrag,
  openProject,
  openSection,
  selectOption,
  tf,
  waitForSettled,
  waitForText,
  waitForToast,
} from "./helpers";

const F = es.defects;
const DRAGGED = "El saldo no se actualiza tras una transferencia";
const D = '[role="dialog"]';

async function save() {
  await $(".tp-editor__save").click();
  await waitForToast(F.savedToast);
  await waitForSettled();
}

async function back() {
  // Saving a new item may already close the editor: a missing button is fine.
  if (await $(".tp-editor__back").isExisting()) await $(".tp-editor__back").click().catch(() => undefined);
  await expect($(`button=${F.newDefect}`)).toBeDisplayed();
}

async function view(which: "list" | "board") {
  await $(`[role="radiogroup"] button[data-value="${which}"]`).click();
}

chapter("defectos", () => {
  step("vacio", {
    title: "Defectos",
    caption:
      "Un defecto registra algo que no funciona como se esperaba, para que se corrija y se pueda volver a probar. Pulsa «Defectos» en el menú lateral. Arriba están «Desde un resultado» y «Nuevo defecto»; debajo, los filtros por estado (abiertos, todos, cerrados), la búsqueda, la severidad y el cambio entre «Lista» y «Tablero».",
    covers: ["section:defects", "state:defects-empty"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("defects");
      await waitForText(F.empty);
    },
  });

  step("titulo-obligatorio", {
    title: "Nuevo defecto: el título es obligatorio",
    caption:
      "«Nuevo defecto» abre el editor. El título es obligatorio: sin él, Pharos lo indica en el campo y no guarda.",
    covers: ["state:defect-title-required"],
    run: async () => {
      await clickButton(F.newDefect);
      await $(".tp-editor__save").click();
      await waitForText(F.titleRequired);
    },
  });

  step("nuevo", {
    title: "Rellenar el defecto",
    caption:
      "Un buen defecto permite reproducir el fallo sin preguntar a nadie. Rellena los detalles (severidad, prioridad, estado y etiquetas), la reproducción (pasos, resultado esperado y resultado obtenido), dónde se encontró (build y entorno), los vínculos con casos y requisitos y, si se sigue también fuera de Pharos, la referencia externa (en este ejemplo, «El saldo no se actualiza tras una transferencia», de severidad mayor, encontrado en la build 2.0.0-rc1).",
    covers: ["action:defect-create", "action:defect-links", "action:defect-custom-fields"],
    run: async () => {
      await (await field(F.field.title)).setValue("El saldo no se actualiza tras una transferencia");
      await selectOption(F.field.severity, F.severity.major);
      await selectOption(F.field.priority, F.priority.high);
      await (await field(F.field.steps)).setValue("1. Transferir 150 € a un beneficiario.\n2. Volver a «Inicio».");
      await (await field(F.field.expected)).setValue("El saldo baja a 850 €.");
      await (await field(F.field.actual)).setValue("Sigue mostrando 1.000 € hasta cerrar sesión.");
      await (await field(F.field.foundInBuild)).setValue("2.0.0-rc1");
      const caseLink = $(`label*=Transferencia a un tercero`);
      if (await caseLink.isExisting()) await caseLink.click();
      // The defect field created in chapter 2 (FLD-03).
      const customer = await field("Cliente afectado");
      await customer.scrollIntoView();
      await customer.setValue("Banca Norte");
    },
  });

  step("evidencias", {
    title: "Evidencias",
    caption:
      "Una vez guardado, «Evidencias» admite capturas, vídeos o registros que muestran el fallo (en este ejemplo, una captura del saldo). Se guardan cifrados en este equipo; la papelera de cada archivo («Quitar: nombre del archivo») lo quita.",
    covers: ["upload:src/modules/defects/ui/DefectEditor.tsx"],
    run: async () => {
      await save();
      // A new defect returns to the list once saved: open it again.
      if (!(await $(".tp-editor__save").isExisting())) await $("button.df-open*=El saldo no se actualiza").click();
      const input = $(`input[type="file"][aria-label="${F.section.attachments}"]`);
      await input.scrollIntoView();
      await input.setValue(join(fixturesDir, "captura-saldo.png"));
      await expect($(hasText("captura-saldo.png"))).toBeDisplayed();
    },
  });

  step("desde-resultado", {
    title: "Un defecto desde un resultado fallido",
    caption:
      "Cuando una prueba falla, lo más rápido es crear el defecto desde su resultado. «Desde un resultado» lista los intentos que no pasaron en los runs del proyecto (en este ejemplo, el del informe importado en el capítulo 8). Al elegir uno, el editor se rellena con el error y el defecto queda vinculado a ese resultado, así que la trazabilidad no depende de copiar y pegar.",
    covers: ["dialogs:src/modules/defects/ui/ResultPickerDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await back();
      await clickButton(F.fromResult);
      await expect(dialog()).toBeDisplayed();
      await expect($(D).$(`button*=${F.results.choose}`)).toBeDisplayed();
    },
  });

  step("prerrellenado", {
    title: "Prerrellenado desde el resultado",
    caption:
      "El aviso azul de arriba indica de qué resultado nace el defecto. Revisa el título y la severidad que propone (en este ejemplo, se marca como crítico) y guarda.",
    focus: ".df-banner",
    run: async () => {
      await $(D).$(`button*=${F.results.choose}`).click();
      await expect($(".df-banner")).toBeDisplayed();
      await (await field(F.field.title)).setValue("Login rechazado: el ejemplo 2 devuelve «fallo»");
      await selectOption(F.field.severity, F.severity.critical);
      // Saved at the start of the next step: saving closes the editor, and this
      // capture is the pre-filled editor with its banner.
    },
  });

  step("lista", {
    title: "La lista de defectos",
    caption:
      "La lista muestra ID, título, severidad, prioridad, estado, casos vinculados y fecha. Cambia entre abiertos, todos o cerrados, filtra por severidad o busca por texto (en este ejemplo, «saldo»).",
    covers: ["action:defects-filter"],
    run: async () => {
      await save();
      await back();
      await browser.waitUntil(async () => (await $$("button.df-open")).length === 2, { timeoutMsg: "the list does not show the 2 defects" });
      await $(`input[placeholder="${F.filter.search}"]`).setValue("saldo");
      await browser.waitUntil(async () => (await $$("button.df-open")).length === 1, { timeoutMsg: "the search did not leave 1 defect" });
      await clearInput(`input[placeholder="${F.filter.search}"]`);
    },
  });

  step("tablero", {
    title: "El tablero de defectos",
    caption:
      "«Tablero» agrupa los defectos por estado, una columna por cada etapa de su ciclo de vida. Para avanzar un defecto, arrastra su tarjeta (o, con el teclado, lleva el foco a su asa y usa Espacio y las flechas). Pharos solo permite los cambios de estado válidos del ciclo de vida, así que una columna que no admite el defecto no lo acepta.",
    covers: ["screen:defect-board", "action:defect-move", "views:src/modules/defects/ui/DefectsPage.tsx"],
    focus: "section.df-col[data-column=\"open\"]",
    run: async () => {
      await view("board");
      await expect($(".df-board")).toBeDisplayed();
      const handle = $(`[aria-label="${tf("defects.board.drag.handle", { defect: "El saldo no se actualiza tras una transferencia" })}"]`);
      await keyboardDrag(handle, { until: tf("defects.board.drag.over", { defect: DRAGGED, column: F.status.open }) });
      await expect($('section.df-col[data-column="open"]').$("article.df-card*=El saldo no se actualiza")).toBeExisting();
    },
  });

  step("cerrar", {
    title: "Cerrar un defecto",
    caption:
      "Al soltar un defecto en «Cerrado» (o en «Otros»: rechazado o aplazado), Pharos pide la resolución y, si quieres, la build en la que se corrigió. Así el cierre queda justificado y se sabe desde qué versión probar.",
    covers: ["dialogs:src/modules/defects/ui/TransitionDialog.tsx"],
    shot: { element: D },
    run: async () => {
      // Open → Rechazado, through «Otros»: the move that asks for a resolution.
      const handle = $(`[aria-label="${tf("defects.board.drag.handle", { defect: "El saldo no se actualiza tras una transferencia" })}"]`);
      await keyboardDrag(handle, { until: tf("defects.board.drag.over", { defect: DRAGGED, column: F.status.other }) });
      await expect(dialog()).toBeDisplayed();
      await $(D).$("select").selectByIndex(1);
    },
  });

  step("eliminar", {
    title: "Eliminar un defecto",
    caption:
      "Normalmente un defecto se cierra, no se borra. Si se creó por error, la papelera de su fila («Eliminar») pide confirmación con «Sí, eliminar»; su clave no se vuelve a usar.",
    covers: ["dialogs:src/modules/defects/ui/DefectsPage.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await clickButton(F.resolutionDialog.confirm, D);
      await $(".cd-overlay").waitForExist({ reverse: true });
      await view("list");
      await $(`button.chips__chip*=${F.filter.all}`).click();
      const [del] = await atLeast(`button[aria-label^="${F.delete}: "]`, 1);
      await del.click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("eliminado", {
    title: "Defecto eliminado",
    caption:
      "Al confirmar, el defecto desaparece de la lista.",
    shot: false,
    run: async () => {
      await clickButton(F.deleteConfirm, '[role="alertdialog"]');
      await browser.waitUntil(async () => (await $$("button.df-open")).length === 1, { timeoutMsg: "the defect was not deleted" });
    },
  });
});
