// Chapter 8 — Casos de prueba (manual v2, MAN-03): the cases of «Pharos», the
// app under test. The list, the three scenario levels (basic, Outline,
// advanced with flows), checklists, linking each case to the requirements of
// chapter 7, the Gherkin view, custom fields, reordering steps with the
// keyboard, walking the cases, «Ir a un caso» (Ctrl+P), revisions, export /
// import, bulk delete and the Gherkin on a phone.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { DESKTOP, MOBILE, chapter, setViewport, step } from "./tour";
import {
  PROJECT_A,
  acceptConfirm,
  atLeast,
  chooseFile,
  clearInput,
  clickForConfirm,
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
  chooseOption,
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

/** Links a requirement from «Requisitos vinculados». */
async function linkRequirement(key: string) {
  await chooseOption($('[data-testid="requirement-add"]'), { value: key });
  await expect($(`[aria-label="${tf("testCase.requirements.remove", { key })}"]`)).toBeDisplayed();
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
      "Los casos de prueba describen qué se comprueba y cómo, paso a paso. Pulsa «Casos de prueba» en el menú lateral, justo debajo de «Requisitos». Arriba están «Importar / Exportar», «Sugerir casos con IA» (necesita un motor de IA y el plan del proyecto, capítulo 17) y «Nuevo caso»; mientras el proyecto no tenga casos, la lista dice «Aún no hay casos. Crea el primero.».",
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
      "«Nuevo caso» pregunta primero qué tipo de escenario quieres escribir: «Básico», un escenario Given/When/Then; «Básico avanzado», un Scenario Outline que se repite con una tabla de ejemplos; o «Avanzado», con precondiciones comunes (Background) y varios flujos. Empieza por el más simple que te sirva: un caso se puede subir de nivel después. «← Volver» sale sin crear nada.",
    covers: ["screen:level-picker"],
    run: async () => {
      await clickButton(C.new);
      await expect($$("button.tc-level-card")).toBeElementsArrayOfSize(3);
    },
  });

  step("titulo-obligatorio", {
    title: "El título es obligatorio",
    caption:
      "El título es lo único obligatorio (y los campos personalizados que el proyecto marque como obligatorios). Si guardas un caso sin título, arriba aparece «No se puede guardar: revisa 1 campo.» con un enlace al campo, y Pharos no lo guarda hasta que lo escribas.",
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
      "Rellena el caso: el título (en este ejemplo, «Iniciar sesión con credenciales válidas»), las precondiciones, los pasos (cada uno con «+ Añadir paso»; la papelera de un paso lo quita, tras confirmarlo si tiene texto) y el resultado esperado, los que muestra la captura. Más arriba se clasifica: prioridad, estado (borrador, revisado, aprobado u obsoleto), tipo de caso, automatización, nivel y versión. En «Requisitos vinculados», «Vincular un requisito…» lo enlaza con lo que comprueba (en este ejemplo, REQ-001): el caso lleva el tag @REQ-001 en su Gherkin y la matriz lo cuenta como cubierto. Al guardarlo recibe su ID con el prefijo del proyecto (en este ejemplo, PH-001).",
    covers: ["action:case-create-basic", "action:case-meta", "action:case-requirement-link"],
    run: async () => {
      // FIX-12: the ID placeholder carries the project's own prefix.
      await expect($(`input[placeholder="${tf("testCase.scenarioIdAuto", { prefix: `${PROJECT_A.prefix}-` })}"]`)).toBeDisplayed();
      await $("#tc-title").setValue("Iniciar sesión con credenciales válidas");
      await fillSteps(C.steps, [
        "Abrir Pharos sin una sesión iniciada",
        "Escribir el correo y la contraseña de una cuenta de prueba",
        "Pulsar «Entrar»",
      ]);
      await (await field(C.expectedResult)).setValue("Se abre «Inicio» con el saludo «Hola» y el nombre de la cuenta.");
      await setMeta(C.priority, C.priorityLabel.high);
      await setMeta(C.status, C.statusLabel.approved);
      await linkRequirement("REQ-001");
      // The capture shows the steps and the result the caption explains.
      await $(`[role="group"][aria-label="${C.steps}"]`).scrollIntoView({ block: "center" });
    },
  });

  step("campos-personalizados", {
    title: "Campos personalizados en el caso",
    caption:
      "Los campos personalizados del proyecto (capítulo 14) aparecen al final del editor, en «Campos personalizados». Sirven para clasificar los casos con lo que tu equipo necesite y luego filtrar por ello (en este ejemplo, «Navegador», una selección, y «Regresión crítica», un sí/no). Si uno es obligatorio, el caso no se guarda sin él. «Guardar» confirma con «Caso de prueba guardado» y la cabecera del proyecto pasa a «1 caso».",
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
      "El selector de vista, a la derecha del título, cambia entre «Editor», «Gherkin» y «Vista dividida». «Gherkin» muestra el mismo caso escrito como un escenario .feature. No son dos copias: es el mismo caso visto de dos formas, así que lo que escribes en el formulario aparece en el Gherkin y lo que editas en el Gherkin vuelve al formulario. La barra de palabras clave (Given, When, Then…) las inserta donde está el cursor; Tab sangra la línea, y para salir del editor con el teclado pulsa Esc y después Tab. Los tags de requisitos (@REQ-001) son enlaces.",
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
      "Un caso «Básico avanzado» (Scenario Outline) prueba el mismo escenario con varios datos. En los pasos, los valores que cambian se escriben como marcadores entre ángulos (en este ejemplo, `<correo>` y `<contraseña>`), y Pharos crea solo una columna por marcador en la tabla «Examples»: cada fila es una ejecución del escenario (aquí, una contraseña equivocada y un correo sin cuenta). «+ Columna» y «+ Fila» amplían la tabla; la papelera quita una fila o una columna. Si una columna no tiene su marcador en los pasos, Pharos lo avisa.",
    covers: ["action:case-outline"],
    run: async () => {
      await $('[role="radiogroup"]').$('button[data-value="editor"]').click();
      await backToList();
      await newCase("outline");
      await $("#tc-title").setValue("Rechazar credenciales no válidas");
      await fillSteps(C.steps, ["Abrir la pantalla de entrada", "Escribir <correo> y <contraseña> y pulsar «Entrar»"]);
      await (await field(C.expectedResult)).setValue("Se muestra «Correo o contraseña incorrectos.» y no se entra.");
      const table = $("table.tc-examples__table");
      await table.scrollIntoView();
      await clickButton(C.examples.addRow);
      await clickButton(C.examples.addRow);
      const cells = Array.from(await table.$$("tbody input"));
      const values = ["lucia.romero@pharos.test", "contraseña-mala", "nadie@pharos.test", "supersecret1"];
      for (let i = 0; i < Math.min(values.length, cells.length); i++) await cells[i].setValue(values[i]);
      await linkRequirement("REQ-001");
      await saveCase();
    },
  });

  step("flujos", {
    title: "Un caso «Avanzado» con flujos alternos",
    caption:
      "El nivel «Avanzado» añade precondiciones compartidas (Background), que se cumplen antes de cada flujo, y flujos alternativos además del principal, cada uno con su nombre, sus pasos y su resultado (en este ejemplo, el caso «Crear un proyecto» con el flujo alterno «Nombre vacío»). En Gherkin, cada flujo es un Scenario. «+ Añadir flujo alterno» crea otro y la papelera junto al nombre lo quita. Cada flujo puede llevar su propia tabla de ejemplos.",
    covers: ["action:case-flows"],
    run: async () => {
      await backToList();
      await newCase("advanced");
      await $("#tc-title").setValue("Crear un proyecto");
      await fillSteps(`${C.flow.steps} · ${C.flow.mainName}`, ["Abrir «Proyectos» y pulsar «Nuevo proyecto»", "Escribir el nombre y pulsar «Crear»"]);
      const flowName = `input[aria-label="${C.flow.namePlaceholder}"]`;
      const flowsBefore = (await $$(flowName)).length;
      await $("button.tc-flow__add").click();
      const names = await atLeast(flowName, flowsBefore + 1);
      await names[names.length - 1].setValue("Nombre vacío");
      await fillSteps(`${C.flow.steps} · Nombre vacío`, ["Pulsar «Crear» sin escribir el nombre", "Leer el aviso bajo el campo"]);
      await linkRequirement("REQ-002");
      await saveCase();
    },
  });

  step("checklist", {
    title: "Un caso de tipo checklist",
    caption:
      "Con «Tipo de caso: Checklist», los pasos se convierten en una lista de comprobaciones sin Given/When/Then y sin Gherkin. Es útil para revisiones rápidas, como una prueba de humo o una revisión de accesibilidad, donde lo que importa es no olvidar nada (en este ejemplo, «Humo de la versión 0.3.0»). Los pasos y el Gherkin que tuviera se conservan, ocultos, por si vuelves a «Estándar». En «Otras referencias (texto libre)» se puede citar algo sin vincularlo (aquí, REQ-006): el capítulo 13 enseña a convertirlo en un vínculo.",
    covers: ["action:case-checklist"],
    run: async () => {
      await backToList();
      await newCase("basic");
      await $("#tc-title").setValue("Humo de la versión 0.3.0");
      await $('[data-testid="tc-case-type"]').$('button[data-value="checklist"]').click();
      await fillSteps(C.checklist.items, ["La app arranca sin errores", "Se puede iniciar sesión", "El Inicio muestra los proyectos"]);
      // A reference written by hand, which «Migrar trazabilidad» (chapter 13) turns into a link.
      await (await field(C.otherReferences)).setValue("Relacionado con REQ-006");
      await saveCase();
    },
  });

  step("reordenar-teclado", {
    title: "Reordenar con el teclado",
    caption:
      "Para cambiar el orden de los pasos (o de las comprobaciones de una checklist), arrastra el asa (⠿) que tiene cada uno. Con el teclado: lleva el foco al asa con Tab, pulsa Espacio o Intro para cogerlo, muévelo con ↑ ↓ y suéltalo con Espacio o Intro; Esc cancela. Un lector de pantalla anuncia cada movimiento («Paso 1 movido a la posición 2»).",
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
      "Con casos, la tabla muestra ID, título, requisito, prioridad, estado, «Ejecución» y fecha de la última edición. «Ejecución» es el último resultado de cada caso, el mismo que la matriz (capítulo 13): «Pasa», «Falla», «Bloqueado», «Omitido» o «Por confirmar»; «—» si aún no tiene ninguno. Si un caso tiene contenido sugerido por IA que nadie ha revisado, su estado (normalmente «Borrador») lleva un ✨ y un borde discontinuo, y al pasar el puntero lo explica. Busca por ID, título o requisito y filtra por estado (cada uno con su recuento), prioridad, resultado («Ejecución», con «Sin resultados» para los que aún no se han ejecutado), tipo, automatización o un campo personalizado de sí/no, para quedarte, por ejemplo, con los casos aprobados de prioridad alta. Haz clic en la cabecera de una columna para ordenar por ella. En este ejemplo, «credenciales» deja los dos casos de acceso.",
    covers: ["action:cases-search", "action:cases-filter", "action:cases-sort"],
    run: async () => {
      await backToList();
      await rows((n) => n >= 4, "at least 4 cases");
      await $(`input[placeholder="${C.list.search}"]`).setValue("credenciales");
      await rows((n) => n === 2, "2 cases matching «credenciales»");
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
      "Con un caso abierto, la barra superior indica su posición en la lista (por ejemplo, «2 de 3») y sus flechas pasan al anterior o al siguiente respetando el filtro activo, para revisar varios casos seguidos sin volver a la lista. El orden del recorrido se fija al abrir el caso, aunque la lista cambie. A la derecha, el estado de guardado avisa si hay cambios sin guardar; si sales con cambios, Pharos pregunta antes de perderlos.",
    covers: ["action:case-walk", "action:case-edit"],
    focus: ".tc-nav",
    run: async () => {
      await clickButton(C.list.clearFilters);
      await $("a.cl-title*=Iniciar sesión").click();
      await expect($("#tc-title")).toBeDisplayed();
      await $("#tc-title").addValue(" (escritorio)");
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
      "«Ir a un caso…» (o Ctrl+P, ⌘P en Mac, desde el editor) abre un buscador: escribe parte del ID, del título o de un requisito, muévete con ↑ ↓ y pulsa Intro para abrirlo sin pasar por la lista; Esc lo cierra. En este ejemplo, «credenciales» encuentra los dos casos de acceso.",
    covers: ["keyboard:ctrl-p", "dialogs:src/modules/test-cases/ui/GoToCaseDialog.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await browser.keys(["Control", "p"]);
      await expect(dialog()).toBeDisplayed();
      await browser.keys([..."credenciales no"]);
    },
  });

  step("mas-acciones", {
    title: "Revisiones y exportación de un caso",
    caption:
      "El menú «⋯» del caso reúne sus revisiones y la exportación a .xlsx, .pdf o .feature (este último no aparece en una checklist). Al exportar, un aviso dice dónde se guardó el archivo.",
    covers: ["action:case-export"],
    focus: "[role=\"menu\"]",
    run: async () => {
      await $('[role="option"]').waitForDisplayed();
      await browser.keys("Enter");
      await $(".cd-overlay").waitForExist({ reverse: true, timeout: 5_000 }).catch(async () => {
        await $('[role="option"]').click();
      });
      await $(".cd-overlay").waitForExist({ reverse: true });
      await expect($("#tc-title")).toHaveValue(expect.stringContaining("Rechazar"));
      await $(`button[aria-label="${C.nav.more}"]`).click();
      await expect(menuItem(C.exportXlsx)).toBeDisplayed();
    },
  });

  step("revisiones", {
    title: "Las revisiones de un caso",
    caption:
      "Cada guardado crea una revisión, una copia fechada del caso. «⋯ → Revisiones» las lista con su número, su título y su fecha; la vigente dice «Actual» (en este ejemplo, Liomar añadió «(v2)» al título y guardó, así que hay dos). La clave del caso nunca cambia entre revisiones. En la versión web todavía no se guardan revisiones.",
    covers: ["action:case-revisions"],
    focus: ".tp-revs-panel",
    run: async () => {
      await browser.keys("Escape");
      await $("#tc-title").addValue(" (v2)");
      await saveCase();
      await $(`button[aria-label="${C.nav.more}"]`).click();
      await menuItem(C.revisions).click();
      await expect($(".tp-revs__restore")).toBeDisplayed();
    },
  });

  step("restaurar", {
    title: "Restaurar una revisión",
    caption:
      "«Restaurar», junto a una revisión anterior, pregunta antes y carga su contenido en el editor, todavía sin guardar y con la misma clave: revísalo y, si es lo que buscabas, pulsa «Guardar». Se crea una revisión nueva y las anteriores se conservan, así que restaurar nunca borra el historial. Esc o «Cancelar» lo dejan todo como estaba.",
    covers: ["dialogs:src/modules/test-cases/ui/TestCaseEditor.tsx"],
    shot: false,
    run: async () => {
      // The revisions list re-renders after the save of the step before.
      await clickForConfirm(".tp-revs__restore");
      await acceptConfirm(C.restoreConfirm.slice(0, 20));
      await expect($("#tc-title")).not.toHaveValue(expect.stringContaining("(v2)"));
      await saveCase();
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
      await $("#tc-title").setValue("Rechazar credenciales no válidas (copia importada)");
      await saveCase();
    },
  });

  step("exportar-feature", {
    title: "Exportar todos los .feature",
    caption:
      "«Importar / Exportar › Exportar .feature» genera un ZIP con un archivo .feature por caso, listo para un proyecto de automatización con playwright-bdd o Cucumber; cada escenario lleva el tag de su ID (@PH-001) y de sus requisitos. Las checklists se omiten porque no tienen Gherkin, y el aviso lo dice.",
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
      "Marca uno o varios casos con su casilla (en este ejemplo, la copia importada): aparece una barra con el número de casos seleccionados (también los de otras páginas) y lo que puedes hacer con todos a la vez: exportarlos a .feature, eliminarlos o «Quitar selección».",
    covers: ["action:cases-bulk"],
    focus: ".cl-bulk",
    run: async () => {
      // The row label is «<ID> <título>»: match the title only.
      const prefix = tf("table.selectRow", { name: "" });
      await $(`input[aria-label^="${prefix}"][aria-label$=" Rechazar credenciales no válidas (copia importada)"]`).click();
      await expect($(".cl-bulk")).toHaveText(expect.stringContaining(tf("testCase.list.selected_one", { count: 1 })));
    },
  });

  step("eliminar", {
    title: "Eliminar casos",
    caption:
      "«Eliminar» pide confirmación antes de quitar los casos del proyecto («¿Eliminar 1 caso?», con sus IDs); «Cancelar» los deja como estaban. Esc no cierra este aviso.",
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
  step("gherkin-movil", {
    title: "El Gherkin en el móvil",
    caption:
      "En el móvil, el editor del caso tiene dos vistas, «Editor» y «Gherkin» (no hay vista dividida). El Gherkin se lee sin editar; desliza el código de lado para las líneas largas. «Editar» lo abre a pantalla completa con una barra de teclas sobre el teclado del móvil (Given, When, Then, And, But, Scenario, Examples, |, <>, @tag y sangrar) y «Listo» vuelve. Abajo, «‹ Anterior · N de M · Siguiente ›» recorre los casos.",
    covers: ["platform:mobile-gherkin"],
    run: async () => {
      await setViewport(MOBILE);
      await $("a.cl-title*=Iniciar sesión").click();
      await $('[role="radiogroup"]').$('button[data-value="gherkin"]').click();
      await expect($('[role="radiogroup"]').$('button[data-value="split"]')).not.toBeExisting();
    },
    after: async () => {
      await setViewport(DESKTOP);
    },
  });
});
