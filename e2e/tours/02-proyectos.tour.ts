// Chapter 2 — Inicio, proyectos y ajustes: the home panel, the project list,
// creating projects, their settings, custom fields and configurations.
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import {
  PROJECT_A,
  acceptNativeDialog,
  PROJECT_B,
  button,
  clearInput,
  clickButton,
  byTestId,
  dialog,
  es,
  field,
  goHome,
  hasText,
  menuItem,
  openProject,
  openSection,
  selectOption,
  tf,
  waitForText,
  waitForToast,
} from "./helpers";

const TEMP_PROJECT = "Proyecto de prueba";

async function newProject(name: string, how: "click" | "enter") {
  await byTestId("nav-projects").click();
  await expect($(`h1=${es.projects.title}`)).toBeDisplayed();
  await button(es.projects.new).click();
  await $("#pj-new-name").setValue(name);
  if (how === "enter") await browser.keys("Enter");
  else await button(es.projects.create).click();
  await expect($(`h1=${name}`)).toBeDisplayed();
}

async function setPrefix(prefix: string) {
  await openSection("settings");
  await $("#pj-prefix").setValue(prefix);
  await $("#pj-digits").selectByAttribute("value", "3");
  await button(es.projects.save).click();
  await waitForToast(es.projects.savedToast);
}

chapter("proyectos", () => {
  step("inicio", {
    title: "Inicio",
    caption: "«Inicio» resume tus proyectos: proyectos abiertos, pruebas pendientes, tasa de éxito y defectos abiertos, la ejecución por proyecto, los criterios de salida, las ejecuciones diarias y las próximas pruebas. Con una cuenta nueva aparece vacío.",
    covers: ["route:/"],
    run: async () => {
      await goHome();
      await expect($("#home-exec-title")).toBeDisplayed();
    },
  });

  step("periodo", {
    title: "El periodo de los datos",
    caption: "El selector de periodo («Últimos 14 días») elige los días de «Ejecuciones diarias» y de la tasa de éxito: hoy, 7, 14 o 30 días o el mes en curso. El resto del Inicio es el estado actual de cada proyecto. Se recuerda en este equipo.",
    covers: ["action:home-period"],
    run: async () => {
      // The period really filters: 7 days → 7 columns in «Ejecuciones diarias».
      await byTestId("home-period").click();
      await byTestId("period-7d").click();
      await expect(byTestId("home-period")).toHaveText(expect.stringContaining(es.dashboard.period["7d"]));
      await browser.waitUntil(async () => (await $$('[data-testid="home-daily"] .home-chart__col')).length === 7);
      // Ends with the menu open (the capture shows it; the next step picks
      // «Últimos 30 días» from it).
      await byTestId("home-period").click();
      await expect(byTestId("period-30d")).toBeDisplayed();
    },
  });

  step("busqueda", {
    title: "Buscar (Ctrl+K)",
    caption:
      "La barra de búsqueda de arriba (o Ctrl+K desde cualquier pantalla) es el punto de entrada de la búsqueda global de casos, requisitos y proyectos. En esta versión todavía no busca: el panel avisa de que llega en una próxima versión. Mientras tanto, cada lista tiene su propio buscador y, dentro de los casos, Ctrl+P salta a uno (capítulo 4). La campana, a su lado, abre las notificaciones.",
    covers: ["keyboard:ctrl-k", "dialogs:src/app/layout/TopbarControls.tsx"],
    focus: ".topbar__panel",
    run: async () => {
      await byTestId("period-30d").click();
      await browser.keys(["Control", "k"]);
      await expect($(".topbar__panel")).toBeDisplayed();
    },
  });

  step("menu-lateral", {
    title: "Contraer el menú lateral",
    caption:
      "El botón junto al logotipo contrae el menú lateral a una tira de iconos, para dar más espacio a tablas y editores, y lo vuelve a expandir. Pharos recuerda tu elección en este equipo.",
    covers: ["action:sidebar-collapse", "dialogs:src/app/layout/TopbarControls.tsx"],
    focus: "[data-testid=\"sidebar-collapse\"]",
    run: async () => {
      await browser.keys("Escape");
      await byTestId("notifications-trigger").click();
      await expect($(".topbar__panel")).toBeDisplayed();
      await browser.keys("Escape");
      await byTestId("sidebar-collapse").click();
      await expect($('aside.sidebar[data-mode="rail"], aside.sidebar[data-mode="collapsed"]')).toBeExisting();
    },
  });

  step("proyectos-vacio", {
    title: "La lista de proyectos, vacía",
    caption:
      "Todo en Pharos vive dentro de un proyecto: el plan, los casos, los ciclos, los defectos. «Proyectos», en el menú lateral, lista los tuyos; sin ninguno, la lista invita a crear el primero.",
    covers: ["route:/projects", "state:projects-empty"],
    run: async () => {
      await byTestId("sidebar-collapse").click();
      await byTestId("nav-projects").click();
      await expect($(".pj-empty")).toBeDisplayed();
    },
  });

  step("nombre-obligatorio", {
    title: "El nombre es obligatorio",
    caption:
      "«Nuevo proyecto» abre una fila para escribir el nombre. Si pulsas «Crear» sin escribirlo, Pharos lo indica bajo el campo y no crea nada.",
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
      "Escribe el nombre de tu proyecto (en este ejemplo, «Banca Móvil») y pulsa «Crear». Pharos abre el proyecto directamente en su plan de pruebas, todavía vacío: es el primer paso natural (capítulo 3).",
    covers: ["action:project-create"],
    run: async () => {
      await $("#pj-new-name").setValue(PROJECT_A.name);
      await button(es.projects.create).click();
      await expect($(`h1=${PROJECT_A.name}`)).toBeDisplayed();
    },
  });

  step("ajustes", {
    title: "Ajustes del proyecto: prefijo de los casos",
    caption:
      "«Ajustes del proyecto», en el menú lateral, permite cambiar el nombre y cómo se numeran sus casos: el prefijo (en este ejemplo, «BM-») y el número de dígitos. La vista previa muestra cómo quedará el ID del siguiente caso (BM-001). Elige el prefijo pronto: es el que verás en informes, defectos y exportaciones. «Guardar» lo confirma con «Ajustes actualizados».",
    toast: true,
    covers: ["section:settings", "action:project-settings-save"],
    focus: ".pj-settings__preview",
    run: async () => {
      await setPrefix(`${PROJECT_A.prefix}-`);
      await expect($(".pj-settings__preview")).toHaveText(expect.stringContaining(`${PROJECT_A.prefix}-`));
      // FIX-11: the sidebar switcher shows the new prefix at once, without navigating.
      await expect($(".sidebar__project-badge")).toHaveText(`${PROJECT_A.prefix}-`);
    },
  });

  step("campo-nuevo", {
    title: "Nuevo campo personalizado",
    caption: "En «Campos personalizados», «Nuevo campo» abre el diálogo: nombre, clave, tipo (texto, número, fecha, sí/no, selección…), opciones y si es obligatorio. El botón [?] junto a «Clave» explica su formato (minúsculas, números y guion bajo) al pasar el ratón, con el tabulador o al tocarlo; debajo se recuerda que no se puede cambiar después. Aquí, una selección «Navegador» con tres opciones.",
    covers: ["dialogs:src/modules/custom-fields/ui/CustomFieldDialog.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      const card = '[data-testid="custom-fields-card"]';
      await $(card).scrollIntoView();
      await $(card).$(`button=${es.customFields.new}`).click();
      await expect(dialog()).toBeDisplayed();
      await (await field(es.customFields.dialog.label, '[role="dialog"]')).setValue("Navegador");
      await selectOption(es.customFields.dialog.type, es.customFields.type.select, '[role="dialog"]');
      for (const [n, value] of ["Chrome", "Edge", "Firefox"].entries()) {
        if (n > 0 || !(await $(`[aria-label="${tf("customFields.dialog.optionN", { n: 1 })}"]`).isExisting())) {
          await dialog().$(`button*=${es.customFields.dialog.addOption}`).click();
        }
        await $(`[aria-label="${tf("customFields.dialog.optionN", { n: n + 1 })}"]`).setValue(value);
      }
    },
  });

  step("campo-creado", {
    title: "El campo, en la lista",
    caption: "«Crear campo» lo guarda y aparece en la lista; los casos del proyecto ya pueden usarlo. Se reordena arrastrando o con el menú de cada campo.",
    toast: true,
    covers: ["action:custom-field-create"],
    run: async () => {
      await dialog().$(`button=${es.customFields.dialog.create}`).click();
      await waitForToast(tf("customFields.savedToast", { label: "Navegador" }));
      // A second, yes/no field: the case list can filter by it.
      await $('[data-testid="custom-fields-card"]').$(`button=${es.customFields.new}`).click();
      await (await field(es.customFields.dialog.label, '[role="dialog"]')).setValue("Regresión crítica");
      await selectOption(es.customFields.dialog.type, es.customFields.type.boolean, '[role="dialog"]');
      await dialog().$(`button=${es.customFields.dialog.create}`).click();
      await waitForToast(tf("customFields.savedToast", { label: "Regresión crítica" }));
      await $('[data-testid="custom-fields-card"]').scrollIntoView();
    },
  });

  step("campo-archivar", {
    title: "Archivar un campo",
    caption: "Un campo no se borra: se archiva desde su menú («Archivar») y sus valores se conservan. «Mostrar archivados» lo enseña y «Desarchivar» lo recupera.",
    covers: ["action:custom-field-archive"],
    run: async () => {
      const card = $('[data-testid="custom-fields-card"]');
      await card.$(`button=${es.customFields.new}`).click();
      await (await field(es.customFields.dialog.label, '[role="dialog"]')).setValue("Sprint antiguo");
      await dialog().$(`button=${es.customFields.dialog.create}`).click();
      await waitForToast(tf("customFields.savedToast", { label: "Sprint antiguo" }));
      await card.$(`button[aria-label="${tf("customFields.actions", { label: "Sprint antiguo" })}"]`).click();
      await menuItem(es.customFields.archive).click();
      await waitForToast(tf("customFields.archivedToast", { label: "Sprint antiguo" }));
      await card.$(`label*=${es.customFields.showArchived}`).click();
      await expect(card.$(hasText(es.customFields.archived))).toBeDisplayed();
      await card.scrollIntoView();
    },
  });

  step("campo-descartar", {
    title: "Cerrar sin guardar",
    caption: "Si cierras el diálogo de un campo con cambios sin guardar, Pharos pregunta antes de descartarlos.",
    covers: ["dialogs:src/modules/custom-fields/ui/CustomFieldDialog.tsx"],
    shot: false,
    run: async () => {
      const card = $('[data-testid="custom-fields-card"]');
      await card.$(`button=${es.customFields.new}`).click();
      await (await field(es.customFields.dialog.label, '[role="dialog"]')).setValue("Borrador");
      await clickButton(es.common.cancel, '[role="dialog"]');
      await acceptNativeDialog();
      await expect($('[role="dialog"]')).not.toBeExisting();
    },
  });

  step("campo-defecto", {
    title: "Campos de los defectos",
    caption: "El selector «Casos / Defectos» de la tarjeta elige de qué entidad son los campos. Con «Defectos», «Nuevo campo» crea un campo que aparece en el editor de cada defecto; aquí, «Cliente afectado». Los campos de casos y de defectos son independientes, y «Copiar de otro proyecto» copia los de la entidad elegida.",
    covers: ["action:custom-field-defect"],
    run: async () => {
      const card = $('[data-testid="custom-fields-card"]');
      await card.scrollIntoView();
      await card.$('[data-testid="custom-fields-entity"] [data-value="defect"]').click();
      await waitForText(es.customFields.emptyDefect.slice(0, 30));
      await card.$(`button=${es.customFields.new}`).click();
      await (await field(es.customFields.dialog.label, '[role="dialog"]')).setValue("Cliente afectado");
      await dialog().$(`button=${es.customFields.dialog.create}`).click();
      await waitForToast(tf("customFields.savedToast", { label: "Cliente afectado" }));
      await expect(card.$(hasText("Cliente afectado"))).toBeDisplayed();
      await card.scrollIntoView();
    },
  });

  step("configuracion-nueva", {
    title: "Nueva configuración",
    caption: "En «Configuraciones», «Nueva configuración» define dónde se ejecuta un ciclo: navegador, sistema, dispositivo e idioma. Las etiquetas de importación (Intro o coma para añadir cada una) son los nombres con los que un informe importado reconoce la configuración.",
    covers: ["dialogs:src/modules/cycles/ui/ConfigurationDialog.tsx", "keyboard:config-labels"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      const card = $('[data-testid="configurations-card"]');
      await card.scrollIntoView();
      await card.$(`button=${es.configurations.new}`).click();
      await expect(dialog()).toBeDisplayed();
      const d = '[role="dialog"]';
      await (await field(es.configurations.name, d)).setValue("Chrome · Windows 11");
      await (await field(es.configurations.attr.browser, d)).setValue("Chrome");
      await (await field(es.configurations.attr.os, d)).setValue("Windows 11");
      await (await field(es.configurations.attr.device, d)).setValue("Escritorio");
      await (await field(es.configurations.attr.locale, d)).setValue("es-ES");
      const labels = await field(es.configurations.labels, d);
      await labels.click();
      await browser.keys([..."chromium", "Enter"]);
      await browser.keys([..."Desktop Chrome", ","]);
      await expect($(`[aria-label="${tf("configurations.removeLabel", { label: "chromium" })}"]`)).toBeDisplayed();
    },
  });

  step("configuracion-creada", {
    title: "Configuraciones del proyecto",
    caption: "«Guardar» la añade a la lista. Aquí hay dos (Chrome y Edge); una tercera se archivó desde su menú y solo se ve con «Mostrar archivadas».",
    covers: ["action:configuration-create", "action:configuration-archive"],
    run: async () => {
      await dialog().$(`button=${es.configurations.save}`).click();
      await waitForToast(tf("configurations.savedToast", { name: "Chrome · Windows 11" }));
      const card = $('[data-testid="configurations-card"]');
      for (const [name, browserName, label] of [
        ["Edge · Windows 11", "Edge", "msedge"],
        ["Safari · macOS", "Safari", "webkit"],
      ]) {
        await card.$(`button=${es.configurations.new}`).click();
        const d = '[role="dialog"]';
        await (await field(es.configurations.name, d)).setValue(name);
        await (await field(es.configurations.attr.browser, d)).setValue(browserName);
        await (await field(es.configurations.labels, d)).click();
        await browser.keys([...label, "Enter"]);
        await dialog().$(`button=${es.configurations.save}`).click();
        await waitForToast(tf("configurations.savedToast", { name }));
      }
      await card.$(`button[aria-label="${tf("configurations.actions", { name: "Safari · macOS" })}"]`).click();
      await menuItem(es.configurations.archive).click();
      await waitForToast(tf("configurations.archivedToast", { name: "Safari · macOS" }));
      await card.scrollIntoView();
    },
  });

  step("segundo-proyecto", {
    title: "Crear con Intro y copiar campos",
    caption: `Un segundo proyecto («${PROJECT_B.name}», creado pulsando Intro tras el nombre) puede copiar los campos personalizados de otro con «Copiar de otro proyecto».`,
    covers: ["keyboard:project-create-enter", "dialogs:src/modules/custom-fields/ui/CopyFieldsDialog.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await newProject(PROJECT_B.name, "enter");
      await setPrefix(`${PROJECT_B.prefix}-`);
      const card = $('[data-testid="custom-fields-card"]');
      await card.scrollIntoView();
      await card.$(`button=${es.customFields.copy}`).click();
      await expect(dialog().$(hasText(es.customFields.copyDialog.source))).toBeDisplayed();
    },
  });

  step("lista-proyectos", {
    title: "Todos los proyectos",
    caption:
      "Con proyectos, la lista muestra arriba los recientes y debajo la tabla de todos, con el estado del plan, los casos, la ejecución, la cobertura y el último acceso. Busca por nombre o prefijo (en este ejemplo, «BM» deja solo «Banca Móvil») y ordena con «Ordenar por».",
    covers: ["action:projects-search", "action:projects-sort"],
    run: async () => {
      await dialog().$(`button=${es.customFields.copyDialog.confirm}`).click();
      await waitForToast(tf("customFields.copyDialog.copiedToast_other", { count: 2 }));
      await byTestId("nav-projects").click();
      await $(`input[placeholder="${es.projects.list.search}"]`).setValue("BM");
      await expect($(`a.pj-row__link*=${PROJECT_A.name}`)).toBeDisplayed();
      await expect($(`a.pj-row__link*=${PROJECT_B.name}`)).not.toBeDisplayed();
      await clearInput(`input[placeholder="${es.projects.list.search}"]`);
      await $(".sort-menu__trigger").click();
      await menuItem(es.projects.list.sort.name).click();
      await expect($(`a.pj-row__link*=${PROJECT_B.name}`)).toBeDisplayed();
    },
  });

  step("menu-fila", {
    title: "Acciones de un proyecto",
    caption:
      "El menú «⋯» de cada fila reúne las acciones del proyecto: abrirlo, ir a sus ajustes o exportarlo en un ZIP con su plan, sus casos y sus documentos, útil como copia o para entregarlo a alguien que no usa Pharos.",
    covers: ["action:projects-row-menu"],
    focus: "[role=\"menu\"]",
    run: async () => {
      await $(`button[aria-label="${tf("projects.list.rowMenu", { name: PROJECT_A.name })}"]`).click();
      await expect(menuItem(es.projects.exportProject)).toBeDisplayed();
    },
  });

  step("exportar-zip", {
    title: "Exportar un proyecto",
    caption:
      "«Exportar proyecto (ZIP)» genera los documentos mostrando una barra de progreso y guarda el ZIP en tu carpeta de descarga (Administración › General); al terminar, un aviso indica cuántos archivos se exportaron y dónde. «Exportar todo» hace lo mismo con todos tus proyectos.",
    covers: ["dialogs:src/modules/projects/ui/ExportProgressModal.tsx"],
    shot: false,
    run: async () => {
      await menuItem(es.projects.exportProject).click();
      await waitForToast("archivos exportados en", 60_000);
    },
  });

  step("cambiar-proyecto", {
    title: "Cambiar de proyecto",
    caption:
      "Dentro de un proyecto, el selector de la parte superior del menú lateral (con su prefijo y su nombre) salta a otro proyecto sin volver a la lista; con muchos proyectos, escribe para filtrarlos.",
    covers: ["action:project-switcher"],
    focus: "[data-testid=\"project-switcher\"]",
    run: async () => {
      await openProject(PROJECT_A.name);
      await byTestId("project-switcher").click();
      await expect($(`[aria-label="${es.shell.searchProjects}"]`)).toBeDisplayed();
    },
  });

  step("eliminar-proyecto", {
    title: "Eliminar un proyecto",
    caption:
      "«Eliminar proyecto», al pie de los ajustes, borra el proyecto con todo lo que contiene. Por eso el diálogo cuenta lo que se perderá y, para evitar un borrado por error, pide escribir el prefijo (o el nombre) antes de habilitar «Sí, eliminar todo». Si solo quieres conservar una copia, exporta antes el ZIP.",
    covers: ["dialogs:src/modules/projects/ui/ProjectSettings.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await browser.keys("Escape");
      await newProject(TEMP_PROJECT, "click");
      await openSection("settings");
      await button(es.projects.deleteTitle).click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
      // The word to type is in the dialog: «Escribe «ATS» para confirmar».
      const prompt = await $('[role="alertdialog"]').getText();
      const word = /«([^»]+)»[^«]*confirmar/.exec(prompt)?.[1] ?? TEMP_PROJECT;
      await $('[role="alertdialog"] input').setValue(word);
    },
  });

  step("eliminado", {
    title: "Proyecto eliminado",
    caption:
      "Al confirmar, Pharos vuelve a la lista de proyectos, que ya no lo muestra.",
    shot: false,
    run: async () => {
      await button(es.projects.deleteConfirm).click();
      await expect($(`h1=${es.projects.title}`)).toBeDisplayed();
      await expect($(`a.pj-row__link*=${TEMP_PROJECT}`)).not.toBeExisting();
    },
  });
});
