// Chapter 12 — Defectos (manual v2, MAN-03): the list and the board, the
// editor (details, reproduction, links, a defect field, evidence), a defect
// born from the failed result of the JUnit import (chapter 10), removing an
// evidence or a link (Pharos confirmations), moving through the lifecycle
// (with a resolution when rejecting or closing), filters and delete.
// Example: Liomar tests Pharos itself; the defect of the side menu keeping the
// old prefix (PH-003, REQ-002) and the login failure the automation found
// (PH-001).
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import {
  PROJECT_A,
  acceptConfirm,
  byTestId,
  chooseFile,
  chooseOption,
  clearInput,
  clickButton,
  dialog,
  dismissConfirm,
  es,
  field,
  fixturesDir,
  hasText,
  keyboardDrag,
  openProject,
  openSection,
  scrollToTop,
  selectOption,
  tf,
  waitForSettled,
  waitForText,
  waitForToast,
} from "./helpers";
import { PERSONA } from "../../scripts/manual/persona.mjs";
import { DEFECTS, RELEASE } from "./data/pharos";

const F = es.defects;
const PREFIX_BUG = DEFECTS.prefix.title;
const LOGIN_BUG = DEFECTS.login.title;
const DUPLICATE = "Entrar falla con credenciales válidas (duplicado)";
const ESCAPE = "El enlace del correo de bienvenida abre la versión anterior";
const D = '[role="dialog"]';
const ASK = '[role="alertdialog"]';

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

async function openDefect(title: string) {
  if (!(await $(".tp-editor__save").isExisting())) await $(`button.df-open*=${title}`).click();
  await expect($(".tp-editor__save")).toBeDisplayed();
}

async function view(which: "list" | "board") {
  await $(`[role="radiogroup"] button[data-value="${which}"]`).click();
}

const handleOf = (title: string) => $(`[aria-label="${tf("defects.board.drag.handle", { defect: title })}"]`);

chapter("defectos", () => {
  step("vacio", {
    title: "Defectos",
    caption:
      "Un defecto registra algo que no funciona como se esperaba, para que se corrija y se pueda volver a probar. Pulsa «Defectos» en el menú lateral. Arriba están «Desde un resultado» y «Nuevo defecto»; debajo, los filtros por estado (abiertos, todos, cerrados), la búsqueda, la severidad y el cambio entre «Lista» y «Tablero». Sin defectos, la lista lo dice.",
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
      "«Nuevo defecto» abre el editor. El título es obligatorio: si pulsas «Guardar» sin él, Pharos lo indica en el campo y no guarda nada.",
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
      "Un buen defecto permite reproducir el fallo sin preguntar a nadie. En «Detalles», rellena el título, la severidad (el impacto en el sistema) y la prioridad (la urgencia del arreglo); en «Reproducción», los pasos para reproducirlo, el resultado esperado y el obtenido. En este ejemplo, Liomar registra que, al cambiar el prefijo en los ajustes, el menú lateral sigue mostrando el anterior: severidad mayor, prioridad media, y los tres pasos que lo provocan.",
    covers: ["action:defect-create", "action:defect-links", "action:defect-custom-fields"],
    run: async () => {
      await (await field(F.field.title)).setValue(PREFIX_BUG);
      await selectOption(F.field.severity, F.severity.major);
      await selectOption(F.field.priority, F.priority.medium);
      await (await field(F.field.steps)).setValue(DEFECTS.prefix.steps);
      await (await field(F.field.expected)).setValue(DEFECTS.prefix.expected);
      await (await field(F.field.actual)).setValue(DEFECTS.prefix.actual);
      await (await field(F.field.foundInBuild)).setValue(RELEASE.build);
      await (await field(F.field.foundInEnvironment)).setValue(RELEASE.environment);
      for (const label of ["Crear un proyecto", "REQ-002"]) {
        const box = $(`label*=${label}`);
        if (await box.isExisting()) {
          await box.scrollIntoView({ block: "center" });
          await box.click();
        }
      }
      // The defect field created in chapter 14 (FLD-03).
      const os = await field("Sistema operativo");
      await os.scrollIntoView({ block: "center" });
      await os.setValue(DEFECTS.prefix.os);
      // The capture: from the «Detalles» heading down to the expected and
      // obtained results.
      await scrollToTop((await field(F.field.title)).parentElement(), 56);
    },
  });

  step("asignado", {
    title: "Asignado a",
    caption:
      `Debajo, «Dónde se encontró» lleva la build y el entorno (en este ejemplo, ${RELEASE.build} en ${RELEASE.environment}), y «Asignado a» dice quién se ocupa del defecto: se elige entre los miembros activos del workspace, o «Sin asignar». En «Personal» el único miembro eres tú, así que Liomar se lo asigna a sí mismo; en un workspace compartido, la persona elegida recibe un aviso con el defecto (capítulo 20). En «Vínculos», marca los casos y los requisitos afectados: la matriz de trazabilidad (capítulo 13) los mostrará junto al defecto. Liomar marca el caso «Crear un proyecto» (PH-003) y el requisito REQ-002.`,
    focus: '//label[.//*[@data-testid="defect-assignee"]]',
    run: async () => {
      await chooseOption(byTestId("defect-assignee"), { text: `${PERSONA.first} ${PERSONA.last}` });
      await expect(byTestId("defect-assignee")).toHaveText(expect.stringContaining(`${PERSONA.first} ${PERSONA.last}`));
      // «Dónde se encontró» on top, «Vínculos» with the marked case below.
      await scrollToTop('section.df-section:has([data-testid="defect-assignee"])');
    },
  });

  step("evidencias", {
    title: "Evidencias",
    caption:
      `Una vez guardado el defecto, «Evidencias» admite capturas, vídeos o registros que muestran el fallo, de hasta 200 MB cada uno: «Adjuntar archivos» abre el selector de archivos (en este ejemplo, una captura del menú lateral). Se guardan cifrados y llegan a los demás equipos del espacio de trabajo al sincronizar; un clic en el nombre descarga una copia. Quien tiene el rol Viewer no puede adjuntar. Encima, «Campos personalizados» trae los campos propios del proyecto: aquí, «Sistema operativo», creado en el capítulo 14, con ${DEFECTS.prefix.os}.`,
    covers: ["upload:src/modules/defects/ui/DefectEditor.tsx"],
    focus: ".pl-attach",
    run: async () => {
      await save();
      // A new defect returns to the list once saved: open it again.
      await openDefect(PREFIX_BUG);
      await $(".pl-attach").scrollIntoView({ block: "center" });
      await chooseFile(`input[type="file"][aria-label="${F.section.attachments}"]`, join(fixturesDir, "captura-prefijo-menu.png"));
      await expect($(hasText("captura-prefijo-menu.png"))).toBeDisplayed();
    },
  });

  step("quitar-evidencia", {
    title: "Quitar una evidencia",
    caption:
      "La papelera de cada archivo («Quitar: nombre») borra esa evidencia, y no se puede recuperar. Por eso Pharos pregunta con una confirmación crítica: Esc y el clic fuera no hacen nada; solo responden «Cancelar» o «Quitar», en rojo. En este ejemplo, Liomar cancela y la captura se queda.",
    covers: ["dialogs:src/modules/defects/ui/DefectEditor.tsx"],
    shot: { element: ASK },
    run: async () => {
      await $(`button[aria-label="${es.common.remove}: captura-prefijo-menu.png"]`).click();
      await expect($(ASK)).toBeDisplayed();
      await browser.keys("Escape");
      await expect($(ASK)).toBeDisplayed();
    },
    after: async () => {
      await $(ASK).$("button.cd__cancel").click();
      await $(ASK).waitForExist({ reverse: true });
      await expect($(hasText("captura-prefijo-menu.png"))).toBeDisplayed();
    },
  });

  step("desde-resultado", {
    title: "Un defecto desde un resultado fallido",
    caption:
      "Cuando una prueba falla, lo más rápido es crear el defecto desde su resultado. «Desde un resultado» lista los intentos que no pasaron en los runs del proyecto, con su run y, si el resultado está vinculado a un caso, su clave y su título («clave · título»; si no, la ruta del test), y se buscan por run, caso o test (en este ejemplo, «con capturas» deja la prueba automática de acceso del informe JUnit importado en el capítulo 10). Al elegir uno, el editor se rellena con el error y el defecto queda vinculado a ese resultado y a su caso, así que la trazabilidad no depende de copiar y pegar.",
    covers: ["dialogs:src/modules/defects/ui/ResultPickerDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await back();
      await clickButton(F.fromResult);
      await expect(dialog()).toBeDisplayed();
      await expect($(D).$(`button*=${F.results.choose}`)).toBeDisplayed();
      // The JUnit with captures (PH-001), not the dataset row that also failed.
      await $(D).$("input").setValue("con capturas");
      await browser.waitUntil(async () => (await $(D).$$(`button*=${F.results.choose}`)).length === 1, {
        timeoutMsg: "the search did not leave the access test alone",
      });
    },
  });

  step("prerrellenado", {
    title: "Prerrellenado desde el resultado",
    caption:
      "El aviso azul de arriba indica de qué resultado nace el defecto, y el editor llega ya relleno: más abajo, en «Reproducción», trae el error como resultado obtenido y, como esperado, el del paso que falló o, si no tiene, el del caso. Revisa el título y la severidad que propone y guarda. En este ejemplo, Liomar lo titula «Entrar con credenciales válidas muestra “Correo o contraseña incorrectos”» y lo marca como crítico: nadie puede entrar en la aplicación.",
    focus: ".df-banner",
    run: async () => {
      await $(D).$(`button*=${F.results.choose}`).click();
      await expect($(".df-banner")).toBeDisplayed();
      await (await field(F.field.title)).setValue(LOGIN_BUG);
      await selectOption(F.field.severity, F.severity.critical);
      await selectOption(F.field.priority, F.priority.critical);
      // The page from its top: the project head, the banner and the title.
      await browser.execute(() => {
        const content = document.querySelector(".app-shell__content");
        if (content) content.scrollTop = 0;
      });
    },
  });

  step("quitar-vinculo", {
    title: "Quitar el vínculo con un resultado",
    caption:
      "Una vez guardado, los resultados vinculados aparecen como fichas en «Vínculos»; la ✕ de una ficha quita el vínculo, tras preguntarlo. Es una confirmación normal, porque el resultado no se borra y se puede volver a vincular: Esc, un clic fuera o «Cancelar» lo dejan como estaba (en este ejemplo, Liomar cancela).",
    covers: ["dialogs:src/modules/defects/ui/DefectEditor.tsx"],
    shot: { element: ASK },
    run: async () => {
      await save();
      await openDefect(LOGIN_BUG);
      const chip = $(`button[aria-label^="${tf("defects.links.remove", { label: "" })}"]`);
      await chip.scrollIntoView({ block: "center" });
      await chip.click();
      await expect($(ASK)).toBeDisplayed();
    },
    after: async () => {
      await browser.keys("Escape");
      await $(ASK).waitForExist({ reverse: true });
    },
  });

  step("eliminar-desde-editor", {
    title: "Eliminar desde el editor",
    caption:
      "El editor de un defecto guardado también tiene «Eliminar defecto», así que se puede borrar desde cualquier vista, también desde el tablero y el móvil, que abren el editor. Pide la misma confirmación crítica que la papelera de la tabla y, al confirmar, vuelve a la lista (en este ejemplo, Liomar cancela).",
    covers: ["dialogs:src/modules/defects/ui/DefectEditor.tsx"],
    shot: false,
    run: async () => {
      await clickButton(F.delete);
      await expect($(ASK)).toBeDisplayed();
      await expect($(ASK)).toHaveText(expect.stringContaining(LOGIN_BUG));
    },
    after: async () => {
      await dismissConfirm();
    },
  });

  step("lista", {
    title: "La lista de defectos",
    caption:
      "La lista muestra ID, título, severidad, prioridad, estado, casos vinculados y fecha. Cambia entre abiertos, todos o cerrados, filtra por severidad o busca por texto (en este ejemplo, «prefijo» deja solo el del menú lateral). Un clic en el título abre el defecto.",
    covers: ["action:defects-filter"],
    focus: ".df-list, .dt-surface",
    run: async () => {
      await back();
      await browser.waitUntil(async () => (await $$("button.df-open")).length === 2, { timeoutMsg: "the list does not show the 2 defects" });
      await $(`input[placeholder="${F.filter.search}"]`).setValue("prefijo");
      await browser.waitUntil(async () => (await $$("button.df-open")).length === 1, { timeoutMsg: "the search did not leave 1 defect" });
    },
    after: async () => {
      await clearInput(`input[placeholder="${F.filter.search}"]`);
    },
  });

  step("tablero", {
    title: "El tablero de defectos",
    caption:
      "«Tablero» agrupa los defectos por estado, una columna por cada etapa de su ciclo de vida: nuevo, abierto, en curso, corregido, por confirmar, cerrado y «Otros» (rechazado o aplazado). Para avanzar un defecto, arrastra su tarjeta o, con el teclado, lleva el foco a su asa y usa Espacio y las flechas. Pharos solo permite los cambios de estado válidos, así que una columna que no admite el defecto no lo acepta. En este ejemplo, Liomar confirma el del menú lateral y lo pasa a «Abierto».",
    covers: ["screen:defect-board", "action:defect-move", "views:src/modules/defects/ui/DefectsPage.tsx"],
    focus: 'section.df-col[data-column="open"]',
    run: async () => {
      await view("board");
      await expect($(".df-board")).toBeDisplayed();
      await keyboardDrag(handleOf(PREFIX_BUG), { until: tf("defects.board.drag.over", { defect: PREFIX_BUG, column: F.status.open }) });
      await expect($('section.df-col[data-column="open"]').$(`article.df-card*=${PREFIX_BUG}`)).toBeExisting();
    },
  });

  step("otros", {
    title: "Rechazar o aplazar un defecto",
    caption:
      "Al soltar un defecto en «Otros», Pharos pregunta a qué estado pasa: «Rechazado» pide la resolución (duplicado, no reproducible, no se corregirá, funciona según el diseño…) y «Aplazado» lo deja abierto para más adelante. Al soltarlo en «Cerrado», pide la resolución y, si quieres, la build en la que se corrigió, para saber desde qué versión volver a probar. En este ejemplo, Liomar aplaza el del menú lateral a la versión siguiente: es molesto, pero no bloquea la entrega.",
    covers: ["dialogs:src/modules/defects/ui/TransitionDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await keyboardDrag(handleOf(PREFIX_BUG), { until: tf("defects.board.drag.over", { defect: PREFIX_BUG, column: F.status.other }) });
      await expect(dialog()).toBeDisplayed();
      // Liomar's choice, in the picture.
      await $(D).$(`label*=${F.status.deferred}`).click();
      await expect($(D).$(`label*=${F.status.deferred}`).$("input")).toBeSelected();
    },
    after: async () => {
      await clickButton(F.resolutionDialog.confirm, D);
      await $(".cd-overlay").waitForExist({ reverse: true });
    },
  });

  step("eliminar", {
    title: "Eliminar un defecto",
    caption:
      "Normalmente un defecto se cierra o se rechaza, no se borra. Si se creó por error (en este ejemplo, Liomar registró dos veces el fallo de acceso), la papelera de su fila (o «Eliminar defecto» en su editor, también desde el tablero y el móvil) lo borra tras una confirmación crítica: solo responden «Cancelar» y «Sí, eliminar». Su clave no se vuelve a usar.",
    covers: ["dialogs:src/modules/defects/ui/DefectsPage.tsx"],
    shot: { element: ASK },
    run: async () => {
      await view("list");
      await clickButton(F.newDefect);
      await (await field(F.field.title)).setValue(DUPLICATE);
      await save();
      await back();
      await $(`button.chips__chip*=${F.filter.all}`).click();
      await $(`button[aria-label="${F.delete}: DEF-003"]`).click();
      await expect($(ASK)).toBeDisplayed();
    },
  });

  step("eliminado", {
    title: "Defecto eliminado",
    caption:
      "Al confirmar, el defecto desaparece de la lista y pasa a la Papelera (Administración › General, capítulo 15): desde allí se restaura, sin sus adjuntos, mientras dure la retención. Si no se pudiera eliminar, un aviso lo dice y el defecto sigue ahí.",
    shot: false,
    run: async () => {
      await acceptConfirm();
      await browser.waitUntil(async () => !(await $(`button.df-open*=${DUPLICATE}`).isExisting()), {
        timeoutMsg: "the duplicate was not deleted",
      });
    },
  });

  step("escape", {
    title: "Un defecto que se escapó de las pruebas",
    caption:
      `Si el defecto se encontró fuera de las pruebas, por ejemplo en producción o en una demostración, marca «Encontrado fuera de las pruebas» en «Dónde se encontró». Cuenta como escape del último ciclo cerrado antes de darlo de alta: es la señal de lo que ese ciclo dejó pasar, y la recogen la tendencia de ciclos del Inicio (capítulo 3) y el informe de go/no-go (capítulo 9). En este ejemplo, un usuario de la beta avisa de que el enlace del correo de bienvenida abre la versión anterior, y Liomar lo registra como escape, con lo que vio el usuario y la build y el entorno de la beta. Como la «Regresión 0.6.0» aún no se ha cerrado (se cierra al final de la historia, capítulo 9), este escape no cuenta para ningún ciclo.`,
    focus: ".df-escaped",
    run: async () => {
      await clickButton(F.newDefect);
      await (await field(F.field.title)).setValue(ESCAPE);
      await selectOption(F.field.severity, F.severity.minor);
      await (await field(F.field.expected)).setValue(`El enlace abre Pharos ${RELEASE.build}.`);
      await (await field(F.field.actual)).setValue("El enlace «Abrir Pharos» del correo de bienvenida abre la versión 0.5.0.");
      await (await field(F.field.foundInBuild)).setValue(RELEASE.build);
      await (await field(F.field.foundInEnvironment)).setValue("beta pública");
      const escaped = byTestId("defect-escaped");
      await escaped.click();
      await expect(escaped).toBeSelected();
      // From the title down to the escape mark: the reader sees which defect.
      await $(".df-escaped").scrollIntoView({ block: "end" });
      await browser.execute(() => {
        const content = document.querySelector(".app-shell__content");
        if (content) content.scrollTop += 24;
      });
    },
    after: async () => {
      await save();
      await back();
    },
  });

  step("reabrir", {
    title: "Corregir, confirmar y reabrir",
    caption:
      "El camino de un defecto corregido, en el tablero o con el campo «Estado» del editor (que solo ofrece los estados siguientes): «En curso» mientras se arregla, «Corregido» cuando el equipo de desarrollo lo da por resuelto y «Por confirmar» mientras QA vuelve a probarlo. Si la prueba pasa, va a «Cerrado»; si no, se reabre: vuelve a «Abierto» desde «Por confirmar» (o desde «Cerrado»). Pharos apunta la primera vez que llega a «Corregido» y cuántas veces se reabre, y con eso calcula el tiempo de corrección y la reapertura de cada ciclo (capítulos 3 y 9). En este ejemplo, Liomar lleva el defecto del enlace por esos estados desde el editor; al volver a probarlo, el enlace sigue abriendo la versión anterior, así que lo reabre y en el tablero está otra vez en «Abierto».",
    focus: 'section.df-col[data-column="open"] article.df-card',
    run: async () => {
      // Through the editor's «Estado», which offers only the next states: the
      // same lifecycle as the board, one save per change.
      for (const status of [F.status.open, F.status.in_progress, F.status.fixed, F.status.retest, F.status.open]) {
        await openDefect(ESCAPE);
        await selectOption(F.field.status, status);
        await save();
        if (await $(".tp-editor__back").isExisting()) await back();
      }
      await view("board");
      await expect($(".df-board")).toBeDisplayed();
      await expect($('section.df-col[data-column="open"]').$(`article.df-card*=${ESCAPE}`)).toBeExisting();
    },
    after: async () => {
      await view("list");
    },
  });
});
