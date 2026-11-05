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
  chooseFile,
  clearInput,
  clickButton,
  dialog,
  es,
  field,
  menuItem,
  openProject,
  openSection,
  pickFromMenu,
  selectOption,
  tf,
  waitForSettled,
  waitForText,
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
  await waitForText(C.savedToast);
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
    caption: "Pulsa «Casos de prueba» en el menú lateral. Arriba quedan «Importar / Exportar», «Sugerir casos con IA» y «Nuevo caso»; mientras no haya casos, la lista lo dice.",
    covers: ["section:cases", "state:cases-empty"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("cases");
      await expect($("p.cl-empty")).toBeDisplayed();
    },
  });

  step("tipo-escenario", {
    title: "Elegir el tipo de escenario",
    caption: "«Nuevo caso» pregunta el tipo: «Básico» (Given/When/Then), «Básico avanzado» (Scenario Outline con tabla de ejemplos) o «Avanzado» (Background y varios flujos). Se puede subir de nivel después.",
    covers: ["screen:level-picker"],
    run: async () => {
      await clickButton(C.new);
      await expect($$("button.tc-level-card")).toBeElementsArrayOfSize(3);
    },
  });

  step("titulo-obligatorio", {
    title: "El título es obligatorio",
    caption: "Si guardas un caso sin título, Pharos lo marca y no lo guarda.",
    covers: ["state:case-title-required"],
    run: async () => {
      await $(`.//button[contains(@class,"tc-level-card")][.//*[normalize-space(.)=${xpathString(C.level.basic.name)}]]`).click();
      await clearInput("#tc-title");
      await clickButton(C.save, ".tc-nav");
      await expect($('[role="alert"]')).toBeDisplayed();
    },
  });

  step("caso-basico", {
    title: "Un caso básico",
    caption: "Título, precondiciones, pasos (cada uno con «+ Añadir paso»), resultado esperado y, arriba, nivel, tipo, prioridad, estado y automatización. «Guardar» le da su ID (BM-001).",
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
    },
  });

  step("campos-personalizados", {
    title: "Campos personalizados en el caso",
    caption: "Los campos del proyecto aparecen en «Campos personalizados», al final del editor: aquí, «Navegador» (selección) y «Regresión crítica» (sí/no).",
    covers: ["action:case-custom-fields"],
    run: async () => {
      const section = $("section.cf-section");
      await section.scrollIntoView();
      await selectOption("Navegador", "Chrome", "section.cf-section");
      await selectOption("Regresión crítica", es.customFields.section.yes, "section.cf-section");
      await saveCase();
      await expect($(".tc-nav__state")).toHaveAttribute("data-state", "saved");
      // FIX-13: the header counts the new case without leaving the section.
      await expect($(".pj-header__meta")).toHaveText(new RegExp(String.raw`(^|\D)${es.projects.header.cases_one}(\s|$)`));
    },
  });

  step("gherkin", {
    title: "La vista Gherkin",
    caption: "«Gherkin» muestra el mismo caso como un escenario .feature, sincronizado con el editor: lo que cambias en uno se ve en el otro. La barra inserta palabras clave en el cursor.",
    covers: ["action:case-gherkin", "views:src/modules/test-cases/ui/TestCaseEditor.tsx"],
    run: async () => {
      await $('[role="radiogroup"]').$('button[data-value="gherkin"]').click();
      await expect($(".tc-gherkin__ta")).toBeDisplayed();
    },
  });

  step("vista-dividida", {
    title: "Vista dividida y copiar el Gherkin",
    caption: "«Vista dividida» pone editor y Gherkin uno junto a otro. El botón de copiar lleva el Gherkin al portapapeles («Gherkin copiado»).",
    covers: ["action:case-gherkin-copy"],
    run: async () => {
      await $('[role="radiogroup"]').$('button[data-value="split"]').click();
      await $(`button[aria-label="${C.gherkin.copy}"]`).click();
      await waitForText(C.gherkin.copied);
    },
  });

  step("outline", {
    title: "Un caso «Básico avanzado» (Outline)",
    caption: "Los pasos usan marcadores entre ángulos (<importe>) y la tabla «Examples» da un valor por fila: un mismo escenario se ejecuta con varios datos. «+ Columna» y «+ Fila» la amplían.",
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
    caption: "El nivel avanzado añade precondiciones compartidas (Background) y flujos alternos, cada uno con su nombre, pasos y resultado: en Gherkin, un Scenario por flujo.",
    covers: ["action:case-flows"],
    run: async () => {
      await backToList();
      await newCase("advanced");
      await $("#tc-title").setValue("Inicio de sesión con huella");
      await fillSteps(`${C.flow.steps} · ${C.flow.mainName}`, ["Abrir la app con la huella registrada", "Apoyar el dedo en el lector"]);
      await $("button.tc-flow__add").click();
      const names = Array.from(await $$(`input[aria-label="${C.flow.namePlaceholder}"]`));
      await names[names.length - 1].setValue("Huella no reconocida");
      await fillSteps(`${C.flow.steps} · Huella no reconocida`, ["Apoyar un dedo no registrado", "Pulsar «Usar contraseña»"]);
      await saveCase();
    },
  });

  step("checklist", {
    title: "Un caso de tipo checklist",
    caption: "«Tipo de caso: Checklist» cambia los pasos por una lista de comprobaciones, sin Gherkin. Útil para revisiones rápidas, como una prueba de humo.",
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
    caption: "Cada paso tiene un asa: con el foco en ella, Espacio la coge, las flechas la mueven e Intro o Espacio la sueltan (también se puede arrastrar con el ratón).",
    covers: ["keyboard:steps-reorder"],
    shot: false,
    run: async () => {
      const handle = $(`[aria-label^="${C.dragStep}"]`);
      await handle.click();
      await browser.keys(" ");
      await browser.keys("ArrowDown");
      await browser.keys(" ");
      await saveCase();
    },
  });

  step("lista", {
    title: "La lista de casos",
    caption: "Con casos, la tabla muestra ID, título, requisito, prioridad, estado y edición. Busca por ID, título o requisito y filtra por estado (con su recuento), prioridad, nivel, tipo, automatización o un campo sí/no.",
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
    caption: "Si la búsqueda o los filtros no dejan ningún caso, la lista lo dice y ofrece «Quitar filtros».",
    covers: ["state:cases-no-match"],
    run: async () => {
      await $(`input[placeholder="${C.list.search}"]`).setValue("no-existe-xyz");
      await expect($(`button=${C.list.clearFilters}`)).toBeDisplayed();
    },
  });

  step("recorrer", {
    title: "Editar y recorrer los casos",
    caption: "Al abrir un caso, la barra superior permite pasar al anterior o al siguiente de la lista (respetando el filtro) y muestra si hay cambios sin guardar.",
    covers: ["action:case-walk", "action:case-edit"],
    run: async () => {
      await clickButton(C.list.clearFilters);
      await $("a.cl-title*=Transferencia").click();
      await expect($("#tc-title")).toBeDisplayed();
      await $("#tc-title").addValue(" (SEPA)");
      await saveCase();
      const before = await $(".tc-nav__pos").getText();
      const steps = Array.from(await $$(".tc-nav__step"));
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
    caption: "«Ir a un caso…» o Ctrl+P abre un buscador: escribe parte del ID o del título, elige con las flechas y pulsa Intro.",
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
    caption: "El menú «⋯» del caso muestra sus revisiones (cada guardado) y lo exporta a .xlsx, .pdf o .feature; el aviso dice dónde se guardó.",
    covers: ["action:case-revisions", "action:case-export"],
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
    caption: "En la lista, «Importar / Exportar → Importar .xlsx» lee un caso de una plantilla o de un .xlsx exportado; el informe enseña qué se reconoció y «Aplicar» abre el editor con los datos.",
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
    caption: "Revisa el caso importado y guárdalo: entra en la lista con el siguiente ID.",
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
    caption: "«Importar / Exportar → Exportar .feature» genera un archivo .feature por caso (las checklists no tienen Gherkin), listo para playwright-bdd o Cucumber.",
    covers: ["action:cases-export-features"],
    shot: false,
    run: async () => {
      await backToList();
      await pickFromMenu(C.list.io, C.exportFeature);
      await waitForText(".feature", 30_000);
    },
  });

  step("seleccion", {
    title: "Acciones con varios casos",
    caption: "Marca varios casos con su casilla: aparece una barra para exportarlos a .feature o eliminarlos.",
    covers: ["action:cases-bulk"],
    run: async () => {
      // The row label is «<ID> <título>»: match the title only.
      const prefix = tf("table.selectRow", { name: "" });
      await $(`input[aria-label^="${prefix}"][aria-label$=" Pago con QR (copia importada)"]`).click();
      await expect($(".cl-bulk")).toHaveText(expect.stringContaining(tf("testCase.list.selected_one", { count: 1 })));
    },
  });

  step("eliminar", {
    title: "Eliminar casos",
    caption: "«Eliminar» pide confirmación («¿Eliminar 1 caso?») antes de quitarlos del proyecto.",
    covers: ["dialogs:src/modules/test-cases/ui/TestCaseList.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await clickButton(C.list.deleteSelected, ".cl-bulk");
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("eliminado", {
    title: "Casos eliminados",
    caption: "Al confirmar, un aviso dice cuántos se eliminaron.",
    shot: false,
    run: async () => {
      await clickButton(C.list.deleteConfirm, '[role="alertdialog"]');
      await expect($('[role="alertdialog"]')).not.toBeExisting();
      await rows((n) => n === 4, "the 4 remaining cases");
    },
  });
});
