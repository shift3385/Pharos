// Chapter 8 — Casos de prueba (manual v2, MAN-03): the cases of «Pharos», the
// app under test. The list, the three scenario levels (basic, Outline,
// advanced with flows), checklists, linking each case to the requirements of
// chapter 7, the Gherkin view, custom fields, reordering steps with the
// keyboard, walking the cases, «Ir a un caso» (Ctrl+P), revisions, export /
// import, bulk delete, the Gherkin on a phone and, last, the project library
// (shared steps and datasets, CAS-01): a case that uses both, run row by row.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { DESKTOP, MOBILE, chapter, setViewport, step } from "./tour";
import {
  PROJECT_A,
  acceptConfirm,
  byTestId,
  atLeast,
  chooseFile,
  clearInput,
  clickForConfirm,
  clickButton,
  dialog,
  dismissConfirm,
  es,
  field,
  fixturesDir,
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
const L = es.library;
/** The library items and the case of «Biblioteca» (CAS-01). */
const STEP_NAME = "Iniciar sesión";
const DATASET_NAME = "Usuarios válidos";
const CASE_TITLE = "Acceso con usuarios de prueba";
/** The key the library case got (read from the run's case picker). */
let libraryCaseKey = "";
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

/** A meta menu (Prioridad / Automatización) → an option. */
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
      "Rellena el caso: el título (en este ejemplo, «Iniciar sesión con credenciales válidas»), las precondiciones, los pasos (cada uno con «+ Añadir paso»; la papelera de un paso lo quita, tras confirmarlo si tiene texto) y el resultado esperado, los que muestra la captura. Más arriba se clasifica: prioridad, tipo de caso, automatización, nivel y versión. El estado (borrador, en revisión, aprobado u obsoleto) no se elige aquí: lo mueve la revisión, más adelante en este capítulo. En «Requisitos vinculados», «Vincular un requisito…» lo enlaza con lo que comprueba (en este ejemplo, REQ-001): el caso lleva el tag @REQ-001 en su Gherkin y la matriz lo cuenta como cubierto. Al guardarlo recibe su ID con el prefijo del proyecto (en este ejemplo, PH-001).",
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

  step("enviar-revision", {
    title: "Enviar un caso a revisión",
    caption:
      "Bajo la cabecera de un caso guardado están las acciones de su revisión. «Enviar a revisión» pide una nota opcional para quien revise y pasa el caso a «En revisión». Si alguien edita el contenido antes de aprobarlo, vuelve a Borrador. Con cambios sin guardar, las acciones esperan a que guardes.",
    covers: ["action:case-review-send", "dialogs:src/modules/test-cases/ui/CaseReviewPanel.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await $("a.cl-title*=Iniciar sesión").click();
      await expect($("#tc-title")).toBeDisplayed();
      await byTestId("case-send-review").click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
      await $('[role="alertdialog"] textarea').setValue("Listo para revisar: cubre el acceso con una cuenta de prueba.");
    },
  });

  step("aprobar-caso", {
    title: "Aprobar un caso",
    caption:
      "Quien revisa ve quién envió el caso y su nota, y, si había una versión anterior aprobada o enviada, qué cambió desde entonces. «Pedir cambios…» deja un comentario obligatorio y el caso sigue en revisión. «Aprobar versión N» pide confirmación y deja quién aprobó, cuándo y qué versión. Liomar trabaja en su espacio personal, que no pide aprobación independiente, así que aprueba su propio caso y queda como «aprobación propia»; en un espacio compartido con la regla activada, lo aprobaría un Test Manager o un Test Analyst que no sea el autor.",
    covers: ["action:case-review-approve", "dialogs:src/modules/test-cases/ui/CaseReviewPanel.tsx"],
    focus: ".tc-review",
    run: async () => {
      await byTestId("case-send-review-confirm").click();
      await waitForToast(tf("testCase.review.toast.send", { key: "PH-001" }).split(" ")[0]);
      await byTestId("case-approve").waitForEnabled();
      await byTestId("case-approve").click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
      await byTestId("case-approve-confirm").click();
      await expect($(".case-review-approved")).toBeDisplayed();
    },
  });

  step("devolver-caso", {
    title: "Pedir cambios en un caso",
    caption:
      "Si el caso no está listo, «Pedir cambios…» deja un comentario y el caso sigue en revisión: Borrador es solo el principio. El comentario es obligatorio: sin él, el diálogo dice «Escribe qué hay que cambiar.». Quien escribió el caso lo verá en un aviso «Cambios pedidos por…», y en la lista el caso lleva la marca «Cambios pedidos». Cuando guarde los cambios, el aviso pasa a «Cambios guardados tras la petición de…» y el caso se puede aprobar.",
    covers: ["action:case-review-return", "dialogs:src/modules/test-cases/ui/CaseReviewPanel.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await backToList();
      await $("a.cl-title*=Rechazar credenciales").click();
      await expect($("#tc-title")).toBeDisplayed();
      await byTestId("case-send-review").click();
      await byTestId("case-send-review-confirm").click();
      await byTestId("case-return").waitForEnabled();
      await byTestId("case-return").click();
      await $('[role="alertdialog"] textarea').setValue("Falta un ejemplo con el correo en mayúsculas.");
    },
    after: async () => {
      await byTestId("case-return-confirm").click();
      await expect($(".case-review-returned")).toBeDisplayed();
    },
  });

  step("obsoleto", {
    title: "Marcar un caso como obsoleto",
    caption:
      "«Marcar obsoleto» pide confirmación: el caso se conserva en el histórico, pero deja de usarse y, si estaba aprobado, pierde la aprobación.",
    covers: ["action:case-obsolete", "dialogs:src/modules/test-cases/ui/CaseReviewPanel.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await clickButton(C.review.obsolete, ".tc-review");
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("reactivar", {
    title: "Reactivar un caso obsoleto",
    caption:
      "Un caso obsoleto se puede «Reactivar»: vuelve a Borrador y, para aprobarlo otra vez, hay que enviarlo a revisión.",
    covers: ["dialogs:src/modules/test-cases/ui/CaseReviewPanel.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await acceptConfirm();
      await clickButton(C.review.reactivate, ".tc-review");
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await acceptConfirm();
    },
  });

  step("baseline-nueva", {
    title: "Congelar una baseline",
    caption:
      "«Baselines», en la lista de casos, congela un conjunto de casos tal como están: cada uno con su revisión exacta y su estado. «Nueva baseline» pide un nombre y qué casos entran: todos, los del filtro de la lista o los seleccionados («Congelar en baseline» en la barra de selección). «Solo los casos aprobados» viene marcado, y el diálogo dice cuáles se quedan fuera. Una baseline no se edita ni se borra.",
    covers: ["dialogs:src/modules/test-cases/ui/BaselinesView.tsx", "action:case-baseline-create"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await backToList();
      await byTestId("cases-baselines").click();
      await byTestId("baseline-new").click();
      await expect(dialog()).toBeDisplayed();
      await byTestId("baseline-name").setValue("Regresión 0.5.0");
    },
  });

  step("baseline-comparar", {
    title: "Comparar una baseline",
    caption:
      "«Comparar» enfrenta una baseline con el «Estado actual» o con otra baseline. Arriba, los recuentos: añadidos, quitados, contenido cambiado, solo estado cambiado y sin cambios. Debajo, un caso por fila; al pulsar su título se ven los cambios campo a campo, con lo quitado tachado y lo añadido resaltado.",
    covers: ["action:case-baseline-compare"],
    focus: ".bl",
    run: async () => {
      await byTestId("baseline-create").click();
      await waitForSettled();
      await expect(byTestId("baseline-row")).toBeDisplayed();
      await clickButton(C.baselines.compare);
      await expect(byTestId("baseline-counts")).toBeDisplayed();
    },
    after: async () => {
      await clickButton(C.baselines.title);
      await clickButton(C.baselines.back);
      await expect($("section.cl")).toBeDisplayed();
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

  // ---- Biblioteca: pasos compartidos y datasets (CAS-01, ADR-0055) ----------------
  // Last in the chapter, so the captures of the steps above keep their numbers.
  // The case it makes («Acceso con usuarios de prueba») stays in draft and
  // out of the «Alta» filter of chapter 9; the run it executes is deleted at
  // the end, so the later chapters count the same results as before.

  step("biblioteca", {
    title: "La Biblioteca del proyecto",
    caption:
      "«Biblioteca», en el menú lateral después de «Casos de prueba», guarda lo que se repite en muchos casos. Tiene dos pestañas: «Pasos compartidos», unos pasos con nombre que se insertan en los casos, y «Datasets», tablas de datos con nombre que se vinculan a la tabla de ejemplos de un caso. Cada pestaña tiene su buscador, su botón «Nuevo…» y «Mostrar obsoletos». Mientras está vacía, la pestaña lo dice.",
    covers: ["section:library", "tabs:src/modules/library/ui/LibraryPage.tsx"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("library");
      await expect($(`button[role="tab"]*=${L.tab.steps}`)).toHaveAttribute("aria-selected", "true");
      await expect($("p.lb-empty")).toBeDisplayed();
    },
  });

  step("paso-compartido", {
    title: "Un paso compartido con parámetros",
    caption:
      "«Nuevo paso compartido» pide el nombre (en este ejemplo, «Iniciar sesión»), una descripción opcional y los pasos, cada uno con su resultado esperado opcional; las flechas los reordenan y la papelera quita uno. Lo que cambia de un caso a otro se escribe entre ángulos, como en un Outline: `<usuario>` y `<clave>`. Pharos los lista a la derecha, en «Parámetros», donde se les puede dar un valor que se propone al insertarlos. «Guardar» lo crea como v1.",
    focus: ".lb-side",
    run: async () => {
      await clickButton(L.newStep);
      await (await field(L.field.name, ".lb-editor")).setValue(STEP_NAME);
      await (await field(L.field.description, ".lb-editor")).setValue("Entrar en Pharos con una cuenta de prueba.");
      const texts = ["Escribir <usuario> en «Correo electrónico»", "Escribir <clave> en «Contraseña»", "Pulsar «Entrar»"];
      for (const [i, text] of texts.entries()) {
        const input = $(`input[aria-label="${tf("library.step.n", { n: i + 1 })}"]`);
        if (!(await input.isExisting())) await clickButton(`+ ${L.step.add}`, ".lb-editor");
        await input.setValue(text);
      }
      await $(`input[aria-label="${L.step.expected} · ${tf("library.step.n", { n: 3 })}"]`).setValue("Se abre «Inicio»");
      // One row per parameter found in the steps (<usuario>, <clave>).
      await expect($$(".lb-params tbody tr")).toBeElementsArrayOfSize(2);
    },
    after: async () => {
      await clickButton(L.editor.save, ".lb-editor__actions");
      await waitForToast(tf("library.toast.created", { name: STEP_NAME }));
      await expect($(".lb-version=v1")).toBeDisplayed();
    },
  });

  step("descartar-cambios", {
    title: "Salir con cambios sin guardar",
    caption:
      "Si vuelves a la lista («← Biblioteca») con cambios sin guardar, Pharos pregunta antes de perderlos: «Descartar» los tira y «Cancelar» te deja seguir editando.",
    covers: ["dialogs:src/modules/library/ui/useItemEditor.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await (await field(L.field.description, ".lb-editor")).addValue(" Sin terminar.");
      await clickButton(L.editor.back, ".lb-editor__bar");
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await acceptConfirm(L.discard.title);
      await expect($("button.lb-open=" + STEP_NAME)).toBeDisplayed();
    },
  });

  step("dataset-importar", {
    title: "Un dataset importado de un CSV",
    caption:
      "En la pestaña «Datasets», «Nuevo dataset» abre una rejilla: una columna por parámetro y una fila por cada juego de datos. Se escribe en ella, se pega un bloque copiado de una hoja de cálculo (Ctrl+V; en un dataset vacío, la primera fila da los nombres de las columnas) o se importa con «Importar CSV o xlsx…». En este ejemplo, «Usuarios válidos» trae de un CSV las columnas `usuario` y `clave` y tres cuentas de prueba. Un dataset no es un almacén de secretos: usa cuentas de prueba, nunca contraseñas reales.",
    covers: ["upload:src/modules/library/ui/DatasetEditor.tsx"],
    focus: ".lb-grid-wrap",
    run: async () => {
      await $(`button[role="tab"]*=${L.tab.datasets}`).click();
      await clickButton(L.newDataset);
      await (await field(L.field.name, ".lb-editor")).setValue(DATASET_NAME);
      await chooseFile('.lb-editor input[type="file"]', join(fixturesDir, "usuarios-validos.csv"));
      await waitForToast(tf("library.dataset.imported", { rows: 3, columns: 2 }));
      await expect($$("table.lb-grid tbody tr")).toBeElementsArrayOfSize(3);
    },
  });

  step("dataset-reemplazar", {
    title: "Reemplazar los datos al importar",
    caption:
      "Si la rejilla ya tiene filas, importar otro archivo pregunta antes de reemplazarlas. Las filas conservan su identificador por posición, así que los casos que eligieron filas concretas siguen apuntando a las mismas. «Cancelar» deja la rejilla como estaba.",
    covers: ["dialogs:src/modules/library/ui/DatasetEditor.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await chooseFile('.lb-editor input[type="file"]', join(fixturesDir, "usuarios-validos.csv"));
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await dismissConfirm(L.dataset.replaceTitle);
      await clickButton(L.editor.save, ".lb-editor__actions");
      await waitForToast(tf("library.toast.created", { name: DATASET_NAME }));
    },
  });

  step("eliminar-elemento", {
    title: "Eliminar un elemento de la biblioteca",
    caption:
      "«Eliminar» quita de la biblioteca un paso compartido o un dataset con todas sus versiones, después de confirmarlo. Solo se puede mientras ningún caso lo use; si alguno lo usa, el botón queda desactivado y la alternativa es «Marcar obsoleto», que lo deja de ofrecer al insertar sin tocar los casos. En este ejemplo, Liomar cancela: va a usar el dataset.",
    covers: ["dialogs:src/modules/library/ui/useItemEditor.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await clickButton(L.editor.delete, ".lb-editor__actions");
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await dismissConfirm();
    },
  });

  step("insertar-paso", {
    title: "Insertar un paso compartido en un caso",
    caption:
      "En un caso básico o «Básico avanzado», «Insertar paso compartido…», bajo los pasos, abre la lista de la biblioteca. Tras «Elegir», el diálogo muestra sus pasos y un campo por parámetro. Un argumento vacío deja el parámetro tal cual, y su valor sale de la tabla de datos del caso; un literal (una cuenta concreta) se escribe en la copia del caso; otro parámetro entre ángulos lo renombra. «Dónde va» elige entre los pasos y las precondiciones. En este ejemplo, el caso «Acceso con usuarios de prueba» deja los dos argumentos vacíos.",
    covers: ["dialogs:src/modules/library/ui/case/InsertSharedStepDialog.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await openSection("cases");
      await newCase("outline");
      await $("#tc-title").setValue(CASE_TITLE);
      await fillSteps(C.steps, ["Abrir Pharos sin una sesión iniciada"]);
      await (await field(C.expectedResult)).setValue("Se abre «Inicio» con el nombre de la cuenta.");
      await clickButton(L.insert.open);
      await expect(dialog()).toBeDisplayed();
      await dialog().$(`.//li[.//b[normalize-space(.)=${xpathString(STEP_NAME)}]]//button`).click();
      // The arguments view: one field per parameter.
      await expect(dialog().$$(".lb-field input")).toBeElementsArrayOfSize(2);
    },
    after: async () => {
      await clickButton(L.insert.confirm, '[role="dialog"]');
      await expect(byTestId("shared-step-block")).toBeDisplayed();
    },
  });

  step("vincular-dataset", {
    title: "Vincular un dataset al caso",
    caption:
      "En la tabla de ejemplos, «Vincular dataset…» ofrece los datasets activos del proyecto, con sus filas y sus columnas. Al vincular uno, sus filas pasan a ser la tabla de datos del caso: una fila, una ejecución. Las columnas se emparejan con los parámetros por su nombre.",
    covers: ["dialogs:src/modules/library/ui/case/DatasetDialogs.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await clickButton(L.bind.open);
      await expect(dialog()).toBeDisplayed();
      await expect(dialog().$(`.//b[normalize-space(.)=${xpathString(DATASET_NAME)}]`)).toBeDisplayed();
    },
    after: async () => {
      await dialog().$(`.//li[.//b[normalize-space(.)=${xpathString(DATASET_NAME)}]]//button`).click();
      await expect($(".lb-bound")).toBeDisplayed();
    },
  });

  step("elegir-filas", {
    title: "Elegir las filas del dataset",
    caption:
      "«Elegir filas…», en la tabla vinculada, deja ejecutar solo algunas filas del dataset (por ejemplo, una sola cuenta para una prueba de humo). En este ejemplo se usan las tres.",
    covers: ["dialogs:src/modules/library/ui/case/DatasetDialogs.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await clickButton(L.bind.chooseRows, ".lb-bound");
      await expect(dialog()).toBeDisplayed();
      await expect(dialog().$$('input[type="checkbox"]')).toBeElementsArrayOfSize(3);
    },
    after: async () => {
      await clickButton(L.rows.confirm, '[role="dialog"]');
      await dialog().waitForExist({ reverse: true });
    },
  });

  step("caso-con-biblioteca", {
    title: "El caso con su paso compartido y su dataset",
    caption:
      "El caso muestra los pasos insertados como un bloque («Paso compartido · Iniciar sesión», con su versión) y la tabla vinculada, de solo lectura, con «Dataset · Usuarios válidos». Un bloque nuevo sigue la última versión: si alguien cambia el paso o el dataset en la biblioteca, el caso se actualiza solo. «Fijar en vN» lo deja en esa versión, «Abrir en la biblioteca» lleva a editarlo y «Desvincular» convierte los pasos o las filas en propios del caso. «Guardar» guarda el caso.",
    focus: [".lb-bound", '[data-testid="shared-step-block"]'],
    run: async () => {
      await saveCase();
      await expect(byTestId("shared-step-block")).toBeDisplayed();
      await $(".lb-bound").scrollIntoView({ block: "center" });
      await expect($$(".lb-bound tbody tr")).toBeElementsArrayOfSize(3);
    },
  });

  step("aviso-impacto", {
    title: "Cambiar un paso compartido: el aviso de impacto",
    caption:
      "Al guardar un cambio de un paso compartido o de un dataset que usan casos, Pharos avisa antes: «Guardar «Iniciar sesión» como v2», cuántos casos se actualizan, por estado, y cuáles. Los casos aprobados vuelven a «En revisión», como al editarlos a mano; los fijados en una versión no cambian. En este ejemplo, Liomar completa el resultado esperado del paso 3 y se actualiza un caso en borrador.",
    covers: ["dialogs:src/modules/library/ui/ImpactDialog.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await openSection("library");
      await $(`button.lb-open=${STEP_NAME}`).click();
      const expected = $(`input[aria-label="${L.step.expected} · ${tf("library.step.n", { n: 3 })}"]`);
      await expect(expected).toHaveValue("Se abre «Inicio»");
      await expected.addValue(" con el nombre de la cuenta");
      await clickButton(L.editor.save, ".lb-editor__actions");
      await expect($(".lb-impact")).toBeDisplayed();
    },
    after: async () => {
      await clickButton(tf("library.impact.confirm_one", { count: 1 }), '[role="dialog"]');
      await waitForToast(tf("library.toast.updatedCases_one", { count: 1, version: 2 }));
    },
  });

  step("usado-en", {
    title: "Dónde se usa y sus versiones",
    caption:
      "Cada elemento tiene tres pestañas: «Pasos» (o «Datos»), su contenido; «Usado en», los casos que lo usan, separados entre los que siguen la última versión y los fijados; y «Versiones», cada versión guardada, que se puede abrir para ver qué tenía. Cada cambio del contenido sube la versión (v1, v2…).",
    covers: ["tabs:src/modules/library/ui/ItemEditorFrame.tsx"],
    run: async () => {
      await expect($(".lb-version=v2")).toBeDisplayed();
      await $(`button[role="tab"]*=${tf("library.editor.usedIn", { count: 1 })}`).click();
      await waitForText(CASE_TITLE);
    },
  });

  step("run-con-dataset", {
    title: "Un caso con dataset en un run",
    caption:
      "Al añadir el caso a un run, el selector de casos dice cuántas filas trae y de qué dataset: «3 filas · Usuarios válidos (v1)». Cada fila será una ejecución propia.",
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await openSection("runs");
      await byTestId("run-new").click();
      await byTestId("run-new-title").setValue("Acceso con usuarios de prueba");
      await byTestId("run-cases-search").setValue("usuarios de prueba");
      const hint = $('[data-testid^="run-case-dataset-"]');
      await expect(hint).toHaveText(tf("execution.picker.dataset_other", { count: 3, name: DATASET_NAME, version: 1 }));
      libraryCaseKey = ((await hint.getAttribute("data-testid")) ?? "").replace("run-case-dataset-", "");
      await byTestId(`run-case-${libraryCaseKey}`).click();
    },
  });

  step("ejecutar-filas", {
    title: "Ejecutar cada fila del dataset",
    caption:
      "En el ejecutor, cada fila es una ejecución con su propio resultado: «Flujo principal · Fila 1 de 3», «Fila 2 de 3»… con el primer valor de la fila al lado. Los valores de la fila aparecen resaltados en los pasos, y los pasos insertados llevan encima «Paso compartido · Iniciar sesión · v2». En este ejemplo pasan las dos primeras cuentas y la tercera falla al pulsar «Entrar». Cada resultado recuerda el dataset y la versión de cada paso compartido; el progreso del run cuenta el caso una vez.",
    focus: ".ex-targets",
    run: async () => {
      if (await byTestId("run-cases-confirm").isExisting()) await byTestId("run-cases-confirm").click();
      else await clickButton(es.execution.newRun.create, '[role="dialog"]');
      await browser.waitUntil(async () => /\/runs\/[^/?]+/.test(await browser.getUrl()), { timeoutMsg: "the run screen did not open" });
      await $(`[data-testid="run-item-execute"][data-case-key="${libraryCaseKey}"]`).click();
      await expect(byTestId("exec-panel")).toBeDisplayed();
      const targets = await atLeast("button.ex-target", 3);
      await expect(targets[0]).toHaveText(expect.stringContaining(tf("execution.rowOf", { n: 1, total: 3 })));
      for (let row = 0; row < 3; row++) {
        await $$("button.ex-target")[row].click();
        await expect($$("button.ex-target")[row]).toHaveAttribute("aria-current", "true");
        const steps = (await $$('[data-testid^="exec-step-"][data-testid$="-pass"]')).length;
        for (let i = 1; i <= steps; i++) {
          await byTestId(`exec-step-${i}-${row === 2 && i === steps ? "fail" : "pass"}`).click();
        }
        await byTestId("exec-save").click();
        await waitForToast(tf("execution.recorded", { status: es.runs.status[row === 2 ? "failed" : "passed"] }));
      }
      await expect($(".ex-shared")).toHaveText(expect.stringContaining(tf("execution.sharedBlock", { name: STEP_NAME, version: 2 })));
      // The capture shows the rows with their results and the shared block.
      await $(".ex-targets").scrollIntoView({ block: "start" });
    },
    // The run only shows the rows: deleting it keeps the results the later
    // chapters count (the matrix, Inicio) as they were.
    after: async () => {
      await byTestId("run-delete").click();
      await byTestId("run-delete-confirm").waitForEnabled();
      await byTestId("run-delete-confirm").click();
      await browser.waitUntil(async () => /\/runs\/?(\?|$)/.test(await browser.getUrl()), {
        timeoutMsg: "the runs list did not open after deleting the run",
      });
    },
  });
});
