// Chapter 4 — Casos de prueba: the list, the three scenario levels (basic,
// Outline, advanced with flows), checklists, the Gherkin view, custom fields,
// walking the cases, «Ir a un caso» (Ctrl+P), revisions, export / import and
// bulk delete.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import {
  PROJECT_A,
  atLeast,
  chooseFile,
  clearInput,
  clickButton,
  dialog,
  es,
  field,
  keyboardDrag,
  menuItem,
  openProject,
  openSection,
  pickFromMenu,
  selectOption,
  tf,
  waitForSettled,
  waitForText,
  waitForToast,
  xpathString,
} from "./helpers";

const C = es.testCase;
const downloadsDir = process.env.PHAROS_TOURS_DOWNLOADS ?? "";

function newestDownload(ext: string): string {
  const files = readdirSync(downloadsDir)
    .filter((f) => f.toLowerCase().endsWith(ext))
    .map((f) => ({ f, t: statSync(join(downloadsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error(`no ${ext} in ${downloadsDir}`);
  return join(downloadsDir, files[0].f);
}

/** «Nuevo caso» → the level picker → a level. */
async function newCase(level: "basic" | "outline" | "advanced") {
  await clickButton(C.new);
  await $(`.//button[contains(@class,"tc-level-card")][.//*[normalize-space(.)=${xpathString(C.level[level].name)}]]`).click();
  await expect($("#tc-title")).toBeDisplayed();
}

/** Fills the steps of a step list (group labelled `label`). */
async function fillSteps(label: string, steps: string[]) {
  const group = $(`[role="group"][aria-label="${label}"]`);
  for (const [i, text] of steps.entries()) {
    let input = group.$(`[aria-label="${tf("testCase.stepN", { n: i + 1 })}"]`);
    if (!(await input.isExisting())) {
      await group.$(".//button[contains(normalize-space(.),'" + C.addStep + "')]").click();
      input = group.$(`[aria-label="${tf("testCase.stepN", { n: i + 1 })}"]`);
    }
    await input.setValue(text);
  }
}

/** A meta menu (Prioridad / Estado / Automatización) → an option. */
async function setMeta(label: string, option: string) {
  await $(`//*[@class="tc-meta"][./*[contains(@class,"tc-meta__label")][normalize-space(.)=${xpathString(label)}]]//button[contains(@class,"tc-meta__trigger")]`).click();
  await menuItem(option).click();
}

/** Waits until the table's row count satisfies `ok`. */
async function rows(ok: (n: number) => boolean, what: string) {
  let last = -1;
  await browser.waitUntil(
    async () => {
      last = await browser.execute(() => document.querySelectorAll("a.cl-title").length);
      return ok(last);
    },
    { timeoutMsg: `the case list never showed ${what} (it shows ${last})` },
  );
}

async function saveCase() {
  await clickButton(C.save, ".tc-nav");
  await waitForToast(C.savedToast);
  // The saved case reloads into the editor: wait for it, not just the toast.
  await waitForSettled();
  await expect($(".tc-nav")).toBeDisplayed();
}

async function backToList() {
  await clickButton(C.nav.allCases);
  await expect($('table[aria-label="' + C.title + '"], section.cl')).toBeDisplayed();
}

chapter("casos", () => {
  step("lista-vacia", {
    title: "La lista de casos, vacía",
    caption:
      "Los casos de prueba describen qué se comprueba y cómo, paso a paso. Pulsa «Casos de prueba» en el menú lateral. Arriba están «Importar / Exportar», «Sugerir casos con IA» (con un motor de IA configurado, capítulo 11) y «Nuevo caso»; mientras el proyecto no tenga casos, la lista lo indica.",
    covers: ["section:cases", "state:cases-empty"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("cases");
      await expect($("p.cl-empty")).toBeDisplayed();
    },
  });

  step("tipo-escenario", {
    title: "Elegir el tipo de escenario",
    caption:
      "«Nuevo caso» pregunta primero qué tipo de escenario quieres escribir: «Básico», un escenario Given/When/Then; «Básico avanzado», un Scenario Outline que se repite con una tabla de ejemplos; o «Avanzado», con precondiciones comunes (Background) y varios flujos. Empieza por el más simple que te sirva: un caso se puede subir de nivel después.",
    covers: ["screen:level-picker"],
    run: async () => {
      await clickButton(C.new);
      await expect($$("button.tc-level-card")).toBeElementsArrayOfSize(3);
    },
  });

  step("titulo-obligatorio", {
    title: "El título es obligatorio",
    caption:
      "El título es lo único obligatorio. Si guardas un caso sin título, Pharos marca el campo con el error y no lo guarda hasta que lo escribas.",
    covers: ["state:case-title-required"],
    run: async () => {
      await $(`.//button[contains(@class,"tc-level-card")][.//*[normalize-space(.)=${xpathString(C.level.basic.name)}]]`).click();
      await clearInput("#tc-title");
      await clickButton(C.save, ".tc-nav");
      await expect($(".field-summary")).toBeDisplayed();
    },
  });

  step("caso-basico", {
    title: "Un caso básico",
    caption:
      "Rellena el caso: el título (en este ejemplo, «Transferencia a un tercero con saldo suficiente»), las precondiciones, los pasos (cada uno con «+ Añadir paso»; la papelera de un paso lo quita) y el resultado esperado. Encima de ellos se clasifica: prioridad, estado, tipo de caso, automatización, nivel y versión. A la derecha ves el mismo caso escrito en Gherkin: lo que escribes en una vista se refleja en la otra (los pasos 4.6 y 4.7 lo detallan). Al guardarlo recibe su ID con el prefijo del proyecto (en este ejemplo, BM-001).",
    covers: ["action:case-create-basic", "action:case-meta"],
    run: async () => {
      // FIX-12: the ID placeholder carries the project's own prefix.
      await expect($(`input[placeholder="${tf("testCase.scenarioIdAuto", { prefix: "BM-" })}"]`)).toBeDisplayed();
      await $("#tc-title").setValue("Transferencia a un tercero con saldo suficiente");
      await fillSteps(C.steps, [
        "Iniciar sesión con un cliente con saldo de 1.000 €",
        "Abrir «Transferir» y elegir un beneficiario guardado",
        "Introducir 150 € y confirmar con el código SMS",
      ]);
      await (await field(C.expectedResult)).setValue("La transferencia queda «Enviada» y el saldo baja a 850 €.");
      await setMeta(C.priority, C.priorityLabel.high);
      await setMeta(C.status, C.statusLabel.approved);
      // The capture shows the steps and the result the caption explains.
      await $(`[role="group"][aria-label="${C.steps}"]`).scrollIntoView({ block: "center" });
    },
  });

  step("campos-personalizados", {
    title: "Campos personalizados en el caso",
    caption:
      "Los campos personalizados del proyecto (capítulo 2) aparecen al final del editor, en «Campos personalizados». Sirven para clasificar los casos con lo que tu equipo necesite y luego filtrar por ello (en este ejemplo, «Navegador», una selección, y «Regresión crítica», un sí/no).",
    covers: ["action:case-custom-fields"],
    focus: "section.cf-section",
    run: async () => {
      const section = $("section.cf-section");
      await section.scrollIntoView();
      await selectOption("Navegador", "Chrome", "section.cf-section");
      await selectOption("Regresión crítica", es.customFields.section.yes, "section.cf-section");
      await saveCase();
      await expect($(".tc-nav__state")).toHaveAttribute("data-state", "saved");
      // FIX-13: the header counts the new case without leaving the section.
      // Saving reloads the editor at the top: the capture shows the fields.
      await section.scrollIntoView({ block: "center" });
      await expect($(".pj-header__meta")).toHaveText(new RegExp(String.raw`(^|\D)${es.projects.header.cases_one}(\s|$)`));
    },
  });

  step("gherkin", {
    title: "La vista Gherkin",
    caption:
      "El selector de vista, a la derecha del título, cambia entre «Editor», «Gherkin» y «Vista dividida». «Gherkin» muestra el mismo caso escrito como un escenario .feature. No son dos copias: es el mismo caso visto de dos formas, así que lo que escribes en el formulario aparece en el Gherkin y lo que editas en el Gherkin vuelve al formulario. La barra de palabras clave (Given, When, Then…) las inserta donde está el cursor.",
    covers: ["action:case-gherkin", "views:src/modules/test-cases/ui/TestCaseEditor.tsx"],
    focus: "[role=\"radiogroup\"]",
    run: async () => {
      await $('[role="radiogroup"]').$('button[data-value="gherkin"]').click();
      await expect($(".tc-gherkin__ta")).toBeDisplayed();
    },
  });

  step("vista-dividida", {
    title: "Vista dividida y copiar el Gherkin",
    caption:
      "«Vista dividida» pone el formulario y el Gherkin uno junto a otro, y es la forma más cómoda de ver cómo cada campo se traduce en el escenario mientras escribes; «Sincronizado», sobre el Gherkin, confirma que ambos coinciden. El botón de copiar, arriba a la derecha del Gherkin, lo lleva al portapapeles («Gherkin copiado») para pegarlo en tu proyecto de automatización.",
    covers: ["action:case-gherkin-copy"],
    focus: "button[aria-label=\"Copiar el Gherkin\"]",
    run: async () => {
      await $('[role="radiogroup"]').$('button[data-value="split"]').click();
      await $(`button[aria-label="${C.gherkin.copy}"]`).click();
      await waitForToast(C.gherkin.copied);
    },
  });

  step("outline", {
    title: "Un caso «Básico avanzado» (Outline)",
    caption:
      "Un caso «Básico avanzado» (Scenario Outline) prueba el mismo escenario con varios datos. En los pasos, los valores que cambian se escriben como marcadores entre ángulos (en este ejemplo, `<importe>`), y la tabla «Examples» da un valor por fila: cada fila es una ejecución del escenario. «+ Columna» y «+ Fila» amplían la tabla; la papelera quita una fila o una columna.",
    covers: ["action:case-outline"],
    run: async () => {
      await $('[role="radiogroup"]').$('button[data-value="editor"]').click();
      await backToList();
      await newCase("outline");
      await $("#tc-title").setValue("Pago con QR de distintos importes");
      await fillSteps(C.steps, ["Escanear el QR del comercio", "Introducir <importe> y confirmar"]);
      await (await field(C.expectedResult)).setValue("El pago de <importe> aparece en movimientos.");
      const table = $("table.tc-examples__table");
      await table.scrollIntoView();
      await clickButton(C.examples.addRow);
      await clickButton(C.examples.addRow);
      const cells = Array.from(await table.$$("tbody input"));
      const values = ["10,00", "999,99"];
      for (let i = 0; i < Math.min(2, cells.length); i++) await cells[i].setValue(values[i]);
      await saveCase();
    },
  });

  step("flujos", {
    title: "Un caso «Avanzado» con flujos alternos",
    caption:
      "El nivel «Avanzado» añade precondiciones compartidas (Background), que se cumplen antes de cada flujo, y flujos alternativos además del principal, cada uno con su nombre, sus pasos y su resultado (en este ejemplo, «Huella no reconocida»). En Gherkin, cada flujo es un Scenario. La papelera junto al nombre quita un flujo.",
    covers: ["action:case-flows"],
    run: async () => {
      await backToList();
      await newCase("advanced");
      await $("#tc-title").setValue("Inicio de sesión con huella");
      await fillSteps(`${C.flow.steps} · ${C.flow.mainName}`, ["Abrir la app con la huella registrada", "Apoyar el dedo en el lector"]);
      const flowName = `input[aria-label="${C.flow.namePlaceholder}"]`;
      const flowsBefore = (await $$(flowName)).length;
      await $("button.tc-flow__add").click();
      const names = await atLeast(flowName, flowsBefore + 1);
      await names[names.length - 1].setValue("Huella no reconocida");
      await fillSteps(`${C.flow.steps} · Huella no reconocida`, ["Apoyar un dedo no registrado", "Pulsar «Usar contraseña»"]);
      await saveCase();
    },
  });

  step("checklist", {
    title: "Un caso de tipo checklist",
    caption:
      "Con «Tipo de caso: Checklist», los pasos se convierten en una lista de comprobaciones sin Given/When/Then y sin Gherkin. Es útil para revisiones rápidas, como una prueba de humo o una revisión de accesibilidad, donde lo que importa es no olvidar nada.",
    covers: ["action:case-checklist"],
    run: async () => {
      await backToList();
      await newCase("basic");
      await $("#tc-title").setValue("Humo de la versión 2.0");
      await $('[data-testid="tc-case-type"]').$('button[data-value="checklist"]').click();
      await fillSteps(C.checklist.items, ["La app arranca sin errores", "El inicio de sesión funciona", "Se ve el saldo"]);
      await saveCase();
    },
  });

  step("reordenar-teclado", {
    title: "Reordenar con el teclado",
    caption:
      "Para cambiar el orden de los pasos, arrastra el asa que tiene cada uno. Con el teclado: lleva el foco al asa, pulsa Espacio para cogerlo, muévelo con las flechas y suéltalo con Intro o Espacio.",
    covers: ["keyboard:steps-reorder"],
    shot: false,
    run: async () => {
      const handle = $(`[aria-label^="${C.dragStep}"]`);
      await keyboardDrag(handle, { key: "ArrowDown" });
      await saveCase();
    },
  });

  step("lista", {
    title: "La lista de casos",
    caption:
      "Con casos, la tabla muestra ID, título, requisito, prioridad, estado y fecha de la última edición. Busca por ID, título o requisito y filtra por estado (cada uno con su recuento), prioridad, nivel, tipo, automatización o un campo personalizado de sí/no, para quedarte, por ejemplo, con los casos aprobados de prioridad alta.",
    covers: ["action:cases-search", "action:cases-filter", "action:cases-sort"],
    run: async () => {
      await backToList();
      await rows((n) => n >= 4, "at least 4 cases");
      await $(`input[placeholder="${C.list.search}"]`).setValue("QR");
      await rows((n) => n === 1, "1 case matching «QR»");
      await clearInput(`input[placeholder="${C.list.search}"]`);
      await $('button.dt__sort*=' + C.list.col.title).click();
    },
  });

  step("sin-coincidencias", {
    title: "Ningún caso coincide",
    caption:
      "Si la búsqueda o los filtros no dejan ningún caso, la lista lo dice y ofrece «Quitar filtros» para volver a verlos todos.",
    covers: ["state:cases-no-match"],
    focus: "button=Quitar filtros",
    run: async () => {
      await $(`input[placeholder="${C.list.search}"]`).setValue("no-existe-xyz");
      await expect($(`button=${C.list.clearFilters}`)).toBeDisplayed();
    },
  });

  step("recorrer", {
    title: "Editar y recorrer los casos",
    caption:
      "Con un caso abierto, la barra superior indica su posición en la lista (por ejemplo, «2 de 3») y sus flechas pasan al anterior o al siguiente respetando el filtro activo, para revisar varios casos seguidos sin volver a la lista. A la derecha, el estado de guardado avisa si hay cambios sin guardar.",
    covers: ["action:case-walk", "action:case-edit"],
    focus: ".tc-nav",
    run: async () => {
      await clickButton(C.list.clearFilters);
      await $("a.cl-title*=Transferencia").click();
      await expect($("#tc-title")).toBeDisplayed();
      await $("#tc-title").addValue(" (SEPA)");
      await saveCase();
      const before = await $(".tc-nav__pos").getText();
      const steps = await atLeast(".tc-nav__step", 1);
      const enabled = [];
      for (const s of steps) if (await s.isEnabled()) enabled.push(s);
      await enabled[0].click();
      await browser.waitUntil(async () => (await $(".tc-nav__pos").getText()) !== before, {
        timeoutMsg: "walking to another case did not change the position",
      });
    },
  });

  step("ir-a-caso", {
    title: "Ir a un caso (Ctrl+P)",
    caption:
      "«Ir a un caso…» (o Ctrl+P desde el editor) abre un buscador: escribe parte del ID o del título, elige con las flechas y pulsa Intro para abrirlo sin pasar por la lista.",
    covers: ["keyboard:ctrl-p", "dialogs:src/modules/test-cases/ui/GoToCaseDialog.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await browser.keys(["Control", "p"]);
      await expect(dialog()).toBeDisplayed();
      await browser.keys([..."QR"]);
    },
  });

  step("mas-acciones", {
    title: "Revisiones y exportación de un caso",
    caption:
      "El menú «⋯» del caso reúne sus revisiones (una por cada guardado, para ver o recuperar versiones anteriores) y la exportación a .xlsx, .pdf o .feature. El aviso indica dónde se guardó el archivo.",
    covers: ["action:case-revisions", "action:case-export"],
    focus: "[role=\"menu\"]",
    run: async () => {
      await $('[role="option"]').waitForDisplayed();
      await browser.keys("Enter");
      await $(".cd-overlay").waitForExist({ reverse: true, timeout: 5_000 }).catch(async () => {
        await $('[role="option"]').click();
      });
      await $(".cd-overlay").waitForExist({ reverse: true });
      await expect($("#tc-title")).toHaveValue(expect.stringContaining("QR"));
      await $(`button[aria-label="${C.nav.more}"]`).click();
      await expect(menuItem(C.exportXlsx)).toBeDisplayed();
    },
  });

  step("importar", {
    title: "Importar un caso desde .xlsx",
    caption:
      "Para traer un caso escrito en Excel, «Importar / Exportar → Importar .xlsx» lee una plantilla rellenada o un caso exportado antes. El informe enseña qué campos se reconocieron y «Aplicar» abre el editor con esos datos, todavía sin guardar.",
    covers: ["upload:src/modules/test-cases/ui/TestCasesPage.tsx", "dialogs:src/modules/test-cases/ui/TestCasesPage.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await menuItem(C.exportXlsx).click();
      await waitForText(tf("testCase.exportDone", { name: "" }).trim(), 30_000);
      await backToList();
      await chooseFile('input[type="file"][accept=".xlsx"]', newestDownload(".xlsx"));
      await expect(dialog()).toBeDisplayed();
    },
  });

  step("importado", {
    title: "Caso importado",
    caption:
      "Revisa el caso importado y guárdalo: entra en la lista con el siguiente ID libre del proyecto.",
    shot: false,
    run: async () => {
      const apply = $(`button=${es.importReport.apply}`);
      await apply.waitForEnabled({ timeout: 30_000 });
      await apply.click();
      await expect($("#tc-title")).toBeDisplayed();
      await $("#tc-title").setValue("Pago con QR (copia importada)");
      await saveCase();
    },
  });

  step("exportar-feature", {
    title: "Exportar todos los .feature",
    caption:
      "«Importar / Exportar → Exportar .feature» genera un archivo .feature por caso, listo para un proyecto de automatización con playwright-bdd o Cucumber. Las checklists se omiten porque no tienen Gherkin.",
    covers: ["action:cases-export-features"],
    shot: false,
    run: async () => {
      await backToList();
      await pickFromMenu(C.list.io, C.exportFeature);
      await waitForToast(C.exportFeaturesToast.split("{{count}}")[1].split("{{path}}")[0].trim(), 30_000);
    },
  });

  step("seleccion", {
    title: "Acciones con varios casos",
    caption:
      "Marca uno o varios casos con su casilla (en este ejemplo, uno): aparece una barra con el número de casos seleccionados y lo que puedes hacer con todos a la vez, exportarlos a .feature o eliminarlos.",
    covers: ["action:cases-bulk"],
    focus: ".cl-bulk",
    run: async () => {
      // The row label is «<ID> <título>»: match the title only.
      const prefix = tf("table.selectRow", { name: "" });
      await $(`input[aria-label^="${prefix}"][aria-label$=" Pago con QR (copia importada)"]`).click();
      await expect($(".cl-bulk")).toHaveText(expect.stringContaining(tf("testCase.list.selected_one", { count: 1 })));
    },
  });

  step("eliminar", {
    title: "Eliminar casos",
    caption:
      "«Eliminar» pide confirmación antes de quitar los casos del proyecto («¿Eliminar 1 caso?»); «Cancelar» los deja como estaban.",
    covers: ["dialogs:src/modules/test-cases/ui/TestCaseList.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await clickButton(C.list.deleteSelected, ".cl-bulk");
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("eliminado", {
    title: "Casos eliminados",
    caption:
      "Al confirmar, un aviso dice cuántos casos se eliminaron y la lista deja de mostrarlos.",
    shot: false,
    run: async () => {
      await clickButton(C.list.deleteConfirm, '[role="alertdialog"]');
      await expect($('[role="alertdialog"]')).not.toBeExisting();
      await rows((n) => n === 4, "the 4 remaining cases");
    },
  });
});
