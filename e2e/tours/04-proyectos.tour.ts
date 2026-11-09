// Chapter 4 — Proyectos (manual v2, MAN-03): the empty list, creating a
// project (a new one opens on its Plan, UX-22) and its header, a second one
// with Enter, the list (recent, search, sort), opening an existing project
// (it opens on its Tablero, UX-22), the row menu, exporting one project or all
// of them, and deleting a project. The example: Liomar creates «Pharos» (the
// app under test) and «API de sincronización».
import { $, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import { PROJECT_A, PROJECT_B, button, byTestId, clearInput, es, menuItem, openSection, tf, waitForToast } from "./helpers";

const TEMP_PROJECT = "Proyecto de prueba";
const SEARCH = `input[placeholder="${es.projects.list.search}"]`;

async function newProject(name: string, how: "click" | "enter") {
  await byTestId("nav-projects").click();
  await expect($(`h1=${es.projects.title}`)).toBeDisplayed();
  await button(es.projects.new).click();
  await $("#pj-new-name").setValue(name);
  if (how === "enter") await browser.keys("Enter");
  else await button(es.projects.create).click();
  await expect($(`h1=${name}`)).toBeDisplayed();
}

const urlEndsWith = (section: string) =>
  browser.waitUntil(async () => (await browser.getUrl()).includes(`/${section}`), { timeoutMsg: `not on ${section}` });

chapter("proyectos", () => {
  step("proyectos-vacio", {
    title: "La lista de proyectos, vacía",
    caption:
      "Todo en Pharos vive dentro de un proyecto: el plan, los requisitos, los casos, los ciclos, las ejecuciones y los defectos. Un proyecto es el producto (o la versión) que pruebas. «Proyectos», en el menú lateral, lista los tuyos; sin ninguno, la lista invita a crear el primero con «Nuevo proyecto».",
    covers: ["route:/projects", "state:projects-empty"],
    run: async () => {
      await byTestId("nav-projects").click();
      await expect($(".pj-empty")).toBeDisplayed();
    },
  });

  step("nombre-obligatorio", {
    title: "El nombre es obligatorio",
    caption:
      "«Nuevo proyecto» (aquí o en el Inicio) abre una fila para escribir el nombre. Si pulsas «Crear» sin escribirlo, Pharos lo indica bajo el campo («Este campo es obligatorio.») y no crea nada. «Cancelar» cierra la fila.",
    covers: ["state:project-create-required"],
    focus: ".pj-create__msg",
    run: async () => {
      await button(es.projects.new).click();
      await button(es.projects.create).click();
      await expect($('.pj-create__msg[role="alert"]')).toBeDisplayed();
    },
  });

  step("crear-proyecto", {
    title: "Crear un proyecto",
    caption:
      "Escribe el nombre del producto que vas a probar y pulsa «Crear». En este ejemplo, Liomar crea «Pharos»: el equipo de QA prueba la propia aplicación. A la vez que escribes, el campo de al lado sugiere el prefijo de las claves de sus casos, sacado del nombre y libre entre tus proyectos (aquí, «PHA-», así que los casos serán PHA-001, PHA-002…); puedes cambiarlo antes de crear o después, en sus ajustes. Dos proyectos no pueden tener prefijos que se solapen: iguales, o uno que empiece por el otro (como «PH-» y «PHA-»). Si escribes uno así, Pharos dice con qué proyecto choca y no lo crea. Un proyecto recién creado se abre en su «Plan de pruebas», todavía vacío, porque es lo primero que conviene escribir (capítulo 5).",
    covers: ["action:project-create"],
    run: async () => {
      await $("#pj-new-name").setValue(PROJECT_A.name);
      await expect($("#pj-new-prefix")).toHaveValue(`${PROJECT_A.prefix}A-`);
      await button(es.projects.create).click();
      await expect($(`h1=${PROJECT_A.name}`)).toBeDisplayed();
      await urlEndsWith("plan");
      await expect(byTestId("nav-project-plan")).toHaveAttribute("aria-current", "page");
    },
  });

  step("cabecera", {
    title: "La cabecera del proyecto",
    caption:
      "Todas las secciones del proyecto comparten su cabecera: la insignia con el prefijo de sus claves (aquí «PHA», el que Pharos sugirió; Liomar lo acorta a «PH» en el capítulo 14), el nombre, el estado de su plan («Sin plan», «Plan borrador», «Plan aprobado»…) y una línea con sus casos, sus requisitos y la fecha de cierre del ciclo, cuando el plan la tiene. A la derecha van los botones de la sección abierta (aquí, los del plan). En el móvil solo quedan los botones, para ganar espacio.",
    covers: ["screen:project-header"],
    focus: "header.pj-header",
    run: async () => {
      await expect($("header.pj-header .pj-header__badge")).toBeDisplayed();
      await expect($("header.pj-header")).toHaveText(expect.stringContaining(es.projects.header.plan.none));
    },
  });

  step("segundo-proyecto", {
    title: "Crear con Intro",
    caption:
      "Para ir más rápido, escribe el nombre y pulsa Intro en lugar de «Crear». En este ejemplo, el segundo proyecto es «API de sincronización», el servidor con el que se sincroniza Pharos. Como el primero, se abre en su «Plan de pruebas».",
    covers: ["keyboard:project-create-enter"],
    run: async () => {
      await newProject(PROJECT_B.name, "enter");
      await urlEndsWith("plan");
    },
  });

  step("lista-proyectos", {
    title: "Todos los proyectos",
    caption:
      "Con proyectos, la lista muestra arriba los «Recientes» (los últimos que abriste) y debajo la tabla de todos: el estado del plan, los casos, la cobertura de requisitos y el último acceso. Busca por nombre o prefijo (en este ejemplo, «sincro» deja solo «API de sincronización») y cambia el orden con el menú de orden: último acceso, nombre, última modificación, cierre del ciclo o cobertura. Con muchos proyectos, la tabla se pagina de 5, 10 o 20.",
    covers: ["action:projects-search", "action:projects-sort"],
    focus: [SEARCH, ".pj-table"],
    run: async () => {
      // A third project, deleted at the end of the chapter.
      await newProject(TEMP_PROJECT, "click");
      await byTestId("nav-projects").click();
      await expect($(".pj-recent")).toBeDisplayed();
      await $(".sort-menu__trigger").click();
      await menuItem(es.projects.list.sort.name).click();
      await $(SEARCH).setValue("sincro");
      await expect($(`a.pj-row__link*=${PROJECT_B.name}`)).toBeDisplayed();
      await expect($(`a.pj-row__link*=${PROJECT_A.name}`)).not.toBeDisplayed();
    },
  });

  step("abrir-proyecto", {
    title: "Abrir un proyecto",
    caption:
      "Haz clic en el nombre de un proyecto (en la tabla, en «Recientes» o en el Inicio) para abrirlo. Un proyecto que ya existe se abre en su «Tablero», donde está el trabajo del día a día del equipo (capítulo 6); desde ahí, el menú lateral lleva a las demás secciones.",
    covers: ["action:project-open"],
    run: async () => {
      await clearInput(SEARCH);
      await $(`a.pj-row__link*=${PROJECT_A.name}`).click();
      await expect($(`h1=${PROJECT_A.name}`)).toBeDisplayed();
      await urlEndsWith("planner");
    },
  });

  step("menu-fila", {
    title: "Acciones de un proyecto",
    caption:
      "El menú «⋯» de cada fila reúne las acciones del proyecto: «Abrir», «Ajustes del proyecto» (capítulo 14) y «Exportar proyecto (ZIP)». Se recorre con ↑ ↓ y se cierra con Esc.",
    covers: ["action:projects-row-menu"],
    focus: '[role="menu"]',
    run: async () => {
      await byTestId("nav-projects").click();
      await $(`button[aria-label="${tf("projects.list.rowMenu", { name: PROJECT_A.name })}"]`).click();
      await expect(menuItem(es.projects.exportProject)).toBeDisplayed();
    },
  });

  step("exportar-zip", {
    title: "Exportar un proyecto",
    caption:
      "«Exportar proyecto (ZIP)» reúne en un solo archivo el plan en PDF, los casos en .xlsx y .feature y la matriz de trazabilidad: sirve como copia o para entregar el trabajo a alguien que no usa Pharos. Una ventana muestra el progreso («Generando archivos…», «Comprimiendo el ZIP…») y no se puede cerrar hasta que termina; al acabar, un aviso dice cuántos archivos se exportaron y en qué carpeta (la carpeta de descarga de «Administración › General»).",
    covers: ["dialogs:src/modules/projects/ui/ExportProgressModal.tsx"],
    shot: false, // the toast shows a local path
    run: async () => {
      await menuItem(es.projects.exportProject).click();
      await waitForToast("archivos exportados en", 60_000);
    },
  });

  step("exportar-todo", {
    title: "Exportar todos los proyectos",
    caption:
      "«Exportar todo», arriba a la derecha de la lista, hace lo mismo con todos tus proyectos a la vez, una carpeta por proyecto dentro del ZIP. Si algún PDF no se pudo generar, el aviso lo dice y el resto del ZIP se guarda igualmente.",
    covers: ["action:projects-export-all"],
    shot: false, // the toast shows a local path
    run: async () => {
      await button(es.projects.exportAll).click();
      await waitForToast(es.projects.exportedAllToast.split("{{")[0], 120_000);
    },
  });

  step("eliminar-proyecto", {
    title: "Eliminar un proyecto",
    caption:
      "«Eliminar proyecto», al pie de sus ajustes, borra el proyecto con todo lo que contiene. Por eso el diálogo cuenta antes lo que se perderá (planes, casos, requisitos, tarjetas) y, para evitar un borrado por error, pide escribir el prefijo (o el nombre) antes de habilitar «Sí, eliminar todo». Esc no lo cierra: solo «Cancelar». Si quieres conservar una copia, exporta antes el ZIP.",
    covers: ["dialogs:src/modules/projects/ui/ProjectSettings.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await $(`a.pj-row__link*=${TEMP_PROJECT}`).click();
      await expect($(`h1=${TEMP_PROJECT}`)).toBeDisplayed();
      await openSection("settings");
      await button(es.projects.deleteTitle).click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
      // The word to type is in the dialog: «Escribe «PRO» para confirmar».
      const prompt = await $('[role="alertdialog"]').getText();
      const word = /«([^»]+)»[^«]*confirmar/.exec(prompt)?.[1] ?? TEMP_PROJECT;
      await $('[role="alertdialog"] input').setValue(word);
    },
  });

  step("eliminado", {
    title: "Proyecto eliminado",
    caption: "Al confirmar, Pharos vuelve a la lista de proyectos, que ya no lo muestra, y avisa de que se eliminó.",
    shot: false,
    run: async () => {
      await button(es.projects.deleteConfirm).click();
      await expect($(`h1=${es.projects.title}`)).toBeDisplayed();
      await expect($(`a.pj-row__link*=${TEMP_PROJECT}`)).not.toBeExisting();
    },
  });
});
