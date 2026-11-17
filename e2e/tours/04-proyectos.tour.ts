// Chapter 4 — Proyectos (manual v2, MAN-03): the empty list, the «Nuevo
// proyecto» wizard (UX-29) and creating a project (a new one opens on its
// Plan, UX-22) and its header, a second one with Enter, a third one from the
// settings of «Pharos» (UX-25), the list (recent, search, sort), opening an
// existing project (it opens on its Tablero, UX-22), the row menu, exporting
// one project or all of them, and deleting a project. The example: Liomar
// creates «Pharos» (the app under test) and «API de sincronización».
import { $, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import {
  PROJECT_A,
  PROJECT_B,
  button,
  byTestId,
  clearInput,
  es,
  menuItem,
  openSection,
  startBlankProject,
  tf,
  waitForToast,
} from "./helpers";

const TEMP_PROJECT = "Proyecto de prueba";
const SEARCH = `input[placeholder="${es.projects.list.search}"]`;
const WIZARD = ".pj-wizard";
const W = es.projects.wizard;

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

  step("nuevo-proyecto", {
    title: "Nuevo proyecto: cómo empezar",
    caption:
      "«Nuevo proyecto» (aquí o en el Inicio) abre un asistente en una ventana. Arriba, los pasos; en el primero, «Cómo empezar», eliges entre «Proyecto en blanco», que empieza con los ajustes por defecto, y «A partir de uno existente», que reutiliza los ajustes de otro de tus proyectos. Sin proyectos todavía, la segunda opción está desactivada y dice por qué. Las flechas cambian de opción e Intro pasa al paso siguiente, como «Siguiente».",
    covers: ["dialogs:src/modules/projects/ui/NewProjectWizard.tsx"],
    shot: { element: WIZARD },
    run: async () => {
      await button(es.projects.new).click();
      await expect($(WIZARD)).toBeDisplayed();
      await expect(byTestId("pj-new-start-blank")).toBeSelected();
      await expect(byTestId("pj-new-start-existing")).toBeDisabled();
    },
  });

  step("nombre-obligatorio", {
    title: "El nombre es obligatorio",
    caption:
      "Un proyecto en blanco pasa directamente a «Datos generales»: el nombre, el prefijo de las claves de sus casos y los dígitos del número, los mismos campos que en «Ajustes del proyecto». Si pulsas «Crear proyecto» sin escribir el nombre, Pharos lo indica arriba y bajo el campo («Este campo es obligatorio.») y no crea nada. «Cancelar» o Esc cierran el asistente; si ya habías escrito o elegido algo, antes preguntan si quieres descartarlo.",
    covers: ["state:project-create-required"],
    shot: { element: WIZARD },
    run: async () => {
      await button(W.next).click();
      await expect($("#pj-new-name")).toBeFocused();
      await button(W.create).click();
      await expect($(`${WIZARD} .field-summary[role="alert"]`)).toBeDisplayed();
    },
  });

  step("crear-proyecto", {
    title: "Crear un proyecto",
    caption:
      "Escribe el nombre del producto que vas a probar y pulsa «Crear proyecto». En este ejemplo, Liomar crea «Pharos»: el equipo de QA prueba la propia aplicación. A la vez que escribes, Pharos sugiere el prefijo de las claves de sus casos, sacado del nombre y libre entre tus proyectos («✓ Libre»), y muestra cómo se numerarán (aquí, «PHA-», así que los casos serán PHA-001, PHA-002…); puedes cambiarlo antes de crear o después, en sus ajustes. Dos proyectos no pueden tener prefijos que se solapen: iguales, o uno que empiece por el otro (como «PH-» y «PHA-»). Si escribes uno así, Pharos dice con qué proyecto choca y no lo crea. Un proyecto recién creado se abre en su «Plan de pruebas», todavía vacío, porque es lo primero que conviene escribir (capítulo 5).",
    covers: ["action:project-create"],
    run: async () => {
      await $("#pj-new-name").setValue(PROJECT_A.name);
      await expect($("#pj-new-prefix")).toHaveValue(`${PROJECT_A.prefix}A-`);
      await expect($(`${WIZARD} .pj-free`)).toBeDisplayed();
      await button(W.create).click();
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
      "Para ir más rápido, en «Datos generales» escribe el nombre y pulsa Intro en lugar de «Crear proyecto». En este ejemplo, el segundo proyecto es «API de sincronización», el servidor con el que se sincroniza Pharos. Como el primero, se abre en su «Plan de pruebas».",
    covers: ["keyboard:project-create-enter"],
    run: async () => {
      await byTestId("nav-projects").click();
      await expect($(`h1=${es.projects.title}`)).toBeDisplayed();
      await startBlankProject(PROJECT_B.name);
      await browser.keys("Enter");
      await expect($(`h1=${PROJECT_B.name}`)).toBeDisplayed();
      await urlEndsWith("plan");
    },
  });

  step("descartar-proyecto", {
    title: "Cancelar el asistente",
    caption:
      "«Cancelar» o Esc cierran el asistente sin crear nada. Si ya habías escrito o elegido algo (aquí, «A partir de uno existente»), Pharos pregunta antes: «Descartar» lo pierde y «Seguir creando» vuelve al asistente tal como estaba.",
    covers: ["dialogs:src/modules/projects/ui/NewProjectWizard.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      // A third project, deleted at the end of the chapter.
      await byTestId("nav-projects").click();
      await button(es.projects.new).click();
      await byTestId("pj-new-start-existing").click();
      await browser.keys("Escape");
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("copiar-ajustes", {
    title: "A partir de otro proyecto: qué copiar",
    caption:
      "Con «A partir de uno existente», el asistente tiene un paso más, «Qué copiar». Eliges el «Proyecto de origen» (con su prefijo y sus casos) y, debajo, lo que quieres llevarte, todo marcado: los campos personalizados, los dígitos del número de caso, el «Historial en el plan exportado», las «Bandas de riesgo» y la retención de evidencias. Cada casilla muestra el valor que tiene el origen (por ejemplo, «3 · PHA-001» para los dígitos). Desmarca lo que no quieras. Nunca se copian el nombre, el prefijo ni los datos: plan, casos, requisitos, ciclos, ejecuciones, defectos y tablero. En la web, la retención de evidencias aparece desactivada, porque es un ajuste de la app de escritorio.",
    covers: ["action:project-create-copy-settings"],
    shot: { element: WIZARD },
    run: async () => {
      await button(W.discard.keep).click();
      await expect(byTestId("pj-new-start-existing")).toBeSelected();
      await button(W.next).click();
      await byTestId("pj-new-source").click();
      await $(`[role="menuitemradio"]*=${PROJECT_A.name}`).click();
      await expect(byTestId("pj-new-source")).toHaveText(expect.stringContaining(PROJECT_A.name));
      for (const part of ["fields", "digits", "planHistory", "retention"]) {
        await expect(byTestId(`pj-new-copy-${part}`)).toBeSelected();
      }
    },
  });

  step("copiar-datos-generales", {
    title: "A partir de otro proyecto: datos generales",
    caption:
      "«Siguiente» lleva a «Datos generales» con lo copiado ya puesto: los dígitos del origen aparecen marcados «copiado de Pharos» y se pueden cambiar. El nombre y el prefijo son los del proyecto nuevo, y debajo un resumen dice qué más se copiará. «Atrás» vuelve a «Qué copiar» sin perder lo elegido.",
    shot: { element: WIZARD },
    run: async () => {
      await button(W.next).click();
      await $("#pj-new-name").setValue(TEMP_PROJECT);
      await expect($(`${WIZARD} .pj-copied`)).toBeDisplayed();
      await expect(byTestId("pj-new-summary")).toHaveText(expect.stringContaining(PROJECT_A.name));
    },
  });

  step("ajustes-copiados", {
    title: "Ajustes copiados",
    caption:
      "Al pulsar «Crear proyecto», el proyecto se crea con los ajustes elegidos y un aviso lo confirma. La copia se hace una sola vez: si después cambias los ajustes de uno, el otro no cambia. Si alguna parte no se pudo copiar, el proyecto se crea igualmente y el aviso dice qué faltó, para que lo ajustes a mano en «Ajustes del proyecto» (capítulo 14) o en «Administración › Evidencias».",
    shot: false,
    run: async () => {
      await button(W.create).click();
      await expect($(`h1=${TEMP_PROJECT}`)).toBeDisplayed();
      await waitForToast(es.projects.copySettings.copiedToast.split("{{")[0]);
    },
  });

  step("lista-proyectos", {
    title: "Todos los proyectos",
    caption:
      "Con proyectos, la lista muestra arriba los «Recientes» (los últimos que abriste) y debajo la tabla de todos: el estado del plan, los casos, la cobertura de requisitos y el último acceso. Busca por nombre o prefijo (en este ejemplo, «sincro» deja solo «API de sincronización») y cambia el orden con el menú de orden: último acceso, nombre, última modificación, cierre del ciclo o cobertura. Con muchos proyectos, la tabla se pagina de 5, 10 o 20.",
    covers: ["action:projects-search", "action:projects-sort"],
    focus: [SEARCH, ".pj-table"],
    run: async () => {
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
