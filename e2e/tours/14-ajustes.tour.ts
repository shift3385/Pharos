// Chapter 14 — Ajustes del proyecto (manual v2, MAN-03): the name and case
// numbering, custom fields of cases and defects, configurations, and copying
// fields to a second project. It runs right after chapter 4 (which makes the
// projects): the prefix, the fields and the configurations are what the next
// chapters use.
import { $, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import {
  PROJECT_A,
  PROJECT_B,
  acceptConfirm,
  button,
  chooseOption,
  clickButton,
  dialog,
  es,
  field,
  hasText,
  menuItem,
  openProject,
  openSection,
  selectOption,
  tf,
  waitForText,
  waitForToast,
} from "./helpers";

async function setPrefix(prefix: string) {
  await openSection("settings");
  await $("#pj-prefix").setValue(prefix);
  await chooseOption($("#pj-digits"), { value: "3" });
  await button(es.projects.save).click();
  await waitForToast(es.projects.savedToast);
}

chapter("ajustes", () => {
  step("ajustes", {
    title: "Ajustes del proyecto: prefijo de los casos",
    caption:
      "«Ajustes del proyecto», en el menú lateral, permite cambiar el nombre y cómo se numeran sus casos: el prefijo (en este ejemplo, Liomar acorta a «PH-» el «PHA-» que Pharos sugirió al crearlo) y el número de dígitos. La vista previa muestra cómo quedará el ID del siguiente caso (PH-001). Elige el prefijo pronto: es el que verás en informes, defectos y exportaciones. «Guardar» lo confirma con «Ajustes actualizados».",
    toast: true,
    covers: ["section:settings", "action:project-settings-save"],
    focus: ".pj-settings__preview",
    run: async () => {
      await openProject(PROJECT_A.name);
      await setPrefix(`${PROJECT_A.prefix}-`);
      await expect($(".pj-settings__preview")).toHaveText(expect.stringContaining(`${PROJECT_A.prefix}-`));
      // FIX-11: the sidebar switcher shows the new prefix at once, without navigating.
      await expect($(".sidebar__project-badge")).toHaveText(`${PROJECT_A.prefix}-`);
    },
  });

  step("prefijo-solapado", {
    title: "Un prefijo que se solapa",
    caption:
      "Dos proyectos no pueden usar prefijos que se solapen: iguales (sin contar el guion o el guion bajo final, ni mayúsculas) o uno que empiece por el otro, como «PH-» y «PHA-», porque «PHA-001» también empieza por «PH». Si escribes uno así, el campo dice con qué proyecto choca (en este ejemplo, «API-» es el de «API de sincronización») y «Guardar» no guarda hasta que lo cambies. Los proyectos que ya compartían prefijo de una versión anterior (todos empezaban con «ATS_») pueden seguir guardando su nombre; el aviso solo aparece al cambiar el prefijo.",
    focus: "#pj-prefix",
    run: async () => {
      await $("#pj-prefix").setValue(`${PROJECT_B.prefix}-`);
      await waitForText(es.projects.prefix.overlap.split("{{")[0]);
    },
    after: async () => {
      await $("#pj-prefix").setValue(`${PROJECT_A.prefix}-`);
    },
  });

  step("historial-plan", {
    title: "El historial en el plan exportado",
    caption:
      "«Historial en el plan exportado» decide qué llevan del historial el .xlsx y el .pdf del plan (capítulo 5), tanto al exportarlo desde el asistente como en el ZIP del proyecto. «Solo la versión vigente», la opción de partida, pone en la cabecera la versión, la fecha, el autor y el estado actuales. «Historial de revisiones» añade una tabla con una fila por persona y día: su último guardado, el estado y las secciones que cambió. Se guarda al elegirlo, sin pulsar «Guardar» («Ajuste del historial guardado.»). En este ejemplo, Liomar elige el historial: el plan de Pharos pasa por revisiones y quiere que se vean al firmarlo.",
    covers: ["action:plan-export-history"],
    toast: true,
    focus: "fieldset.pj-choice",
    run: async () => {
      const option = $(`label.pj-choice__option*=${es.testPlan.historyMode.revisions}`);
      await option.scrollIntoView({ block: "center" });
      await option.click();
      await waitForToast(es.projects.settings.planHistorySaved);
    },
  });

  step("campo-nuevo", {
    title: "Nuevo campo personalizado",
    caption:
      "Los campos personalizados añaden a los casos lo que tu equipo necesite clasificar y que Pharos no trae de serie. En «Campos personalizados», «Nuevo campo» abre el diálogo: nombre, clave, tipo (texto, número, fecha, sí/no, selección…), opciones y si es obligatorio. Un campo de tipo fecha se rellena en el caso con el selector de fechas de Pharos (capítulo 5). El botón [?] junto a «Clave» explica su formato (minúsculas, números y guion bajo) al pasar el ratón, con el tabulador o al tocarlo; debajo se recuerda que no se puede cambiar después. En este ejemplo, una selección «Navegador» con tres opciones.",
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
    caption:
      "«Crear campo» lo guarda y aparece en la lista; desde ese momento, los casos del proyecto pueden usarlo (capítulo 8). Se reordena arrastrando o con el menú de cada campo: ese es el orden en que se ve en el editor.",
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
    caption:
      "Un campo no se borra, para no perder lo que ya se escribió en él: se archiva desde su menú («Archivar») y sus valores se conservan. «Mostrar archivados» lo enseña y «Desarchivar» lo recupera.",
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
    caption:
      "Si cierras el diálogo de un campo con cambios sin guardar, Pharos pregunta antes de descartarlos, para que no los pierdas por un clic.",
    covers: ["dialogs:src/modules/custom-fields/ui/CustomFieldDialog.tsx"],
    shot: false,
    run: async () => {
      const card = $('[data-testid="custom-fields-card"]');
      await card.$(`button=${es.customFields.new}`).click();
      await (await field(es.customFields.dialog.label, '[role="dialog"]')).setValue("Borrador");
      await clickButton(es.common.cancel, '[role="dialog"]');
      await acceptConfirm();
      await expect($('[role="dialog"]')).not.toBeExisting();
    },
  });

  step("campo-defecto", {
    title: "Campos de los defectos",
    caption:
      "El selector «Casos / Defectos» de la tarjeta elige de qué entidad son los campos. Con «Defectos», «Nuevo campo» crea un campo que aparece en el editor de cada defecto (en este ejemplo, «Sistema operativo»). Los campos de casos y de defectos son independientes, y «Copiar de otro proyecto» copia los de la entidad elegida.",
    covers: ["action:custom-field-defect"],
    run: async () => {
      const card = $('[data-testid="custom-fields-card"]');
      await card.scrollIntoView();
      await card.$('[data-testid="custom-fields-entity"] [data-value="defect"]').click();
      await waitForText(es.customFields.emptyDefect.slice(0, 30));
      await card.$(`button=${es.customFields.new}`).click();
      await (await field(es.customFields.dialog.label, '[role="dialog"]')).setValue("Sistema operativo");
      await dialog().$(`button=${es.customFields.dialog.create}`).click();
      await waitForToast(tf("customFields.savedToast", { label: "Sistema operativo" }));
      await expect(card.$(hasText("Sistema operativo"))).toBeDisplayed();
      await card.scrollIntoView();
    },
  });

  step("configuracion-nueva", {
    title: "Nueva configuración",
    caption:
      "Una configuración describe dónde se ejecuta una prueba, para saber en qué entorno pasó o falló. En «Configuraciones», «Nueva configuración» pide navegador, sistema, dispositivo e idioma (en este ejemplo, «Chrome · Windows 11»). Las etiquetas de importación (Intro o coma para añadir cada una) son los nombres con los que un informe importado reconoce la configuración.",
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
    caption:
      "«Guardar» la añade a la lista. En este ejemplo hay dos activas (Chrome y Edge); una tercera se archivó desde su menú y solo se ve con «Mostrar archivadas»: así deja de ofrecerse en ciclos nuevos sin perder su historia.",
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

  step("copiar-campos", {
    title: "Copiar los campos a otro proyecto",
    caption:
      "Un segundo proyecto (en este ejemplo, «API de sincronización», con el prefijo «API-») no tiene que definir sus campos desde cero: en sus ajustes, «Copiar de otro proyecto» trae los campos personalizados de otro, con sus opciones. Solo se copian los que aún no tiene; los demás no se tocan.",
    covers: ["dialogs:src/modules/custom-fields/ui/CopyFieldsDialog.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await openProject(PROJECT_B.name);
      await setPrefix(`${PROJECT_B.prefix}-`);
      const card = $('[data-testid="custom-fields-card"]');
      await card.scrollIntoView();
      await card.$(`button=${es.customFields.copy}`).click();
      await expect(dialog().$(hasText(es.customFields.copyDialog.source))).toBeDisplayed();
    },
    after: async () => {
      await dialog().$(`button=${es.customFields.copyDialog.confirm}`).click();
      await waitForToast(tf("customFields.copyDialog.copiedToast_other", { count: 2 }));
    },
  });
});
