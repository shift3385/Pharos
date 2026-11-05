// Chapter 10 — Administración: the AI engine screen, templates (download,
// import, delete), general settings (theme, language, background, download
// folder), sync, security (recovery key) and diagnostics. It opens with the
// home panel, now that the earlier chapters left data in it.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { editOnOtherDevice } from "./other-device";
import { chapter, step } from "./tour";
import {
  acceptNativeDialog,
  byTestId,
  chooseFile,
  clickButton,
  dialog,
  es,
  field,
  PROJECT_A,
  goHome,
  menuItem,
  openAdminTab,
  openProject,
  openSection,
  repoDir,
  tf,
  waitForText,
  waitForToast,
} from "./helpers";

const A = es.admin;
const D = '[role="dialog"]';
const downloadsDir = process.env.PHAROS_TOURS_DOWNLOADS ?? "";

function newestDownload(ext: string): string {
  const files = readdirSync(downloadsDir)
    .filter((f) => f.toLowerCase().endsWith(ext))
    .map((f) => ({ f, t: statSync(join(downloadsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error(`no ${ext} in ${downloadsDir}`);
  return join(downloadsDir, files[0].f);
}

chapter("administracion", () => {
  step("inicio-con-datos", {
    title: "Inicio, con datos",
    caption: "Con proyectos en marcha, «Inicio» cuenta las pruebas pendientes (sin ejecutar o bloqueadas), la tasa de éxito del periodo y los defectos abiertos; cada tarjeta lleva a su lista. «Ejecución por proyecto» muestra, de cada proyecto, cuántos casos tienen ya resultado y cuál es el último; «Ejecuciones diarias», lo registrado cada día, manual o importado. «Criterios de salida» evalúa los del plan del proyecto que elijas (Cumple, No cumple o Sin datos), aunque todavía no haya ejecuciones.",
    covers: ["action:home-kpi", "action:home-exit-criteria", "state:home-metrics"],
    run: async () => {
      await goHome();
      await expect(byTestId("kpi-projects")).toBeDisplayed();
      // The metrics have loaded: the rate card shows a number or «—», not «…».
      await browser.waitUntil(async () => !(await byTestId("kpi-rate").getText()).includes("…"));
      await expect(byTestId("home-daily")).toBeDisplayed();
      // Loaded, not failed: no «No se pudieron cargar las ejecuciones».
      await expect($$(".home [role=alert]")).toBeElementsArrayOfSize(0);
    },
  });

  step("inicio-criterios-filtros", {
    title: "Criterios de salida: en riesgo o cumplen",
    caption: "El selector de «Criterios de salida» busca por nombre o clave y filtra los proyectos: Todos, En riesgo (algún criterio no se cumple) o Cumplen (todos los que se pueden evaluar se cumplen). Están ordenados por fecha de cierre.",
    covers: ["action:home-exit-filter"],
    run: async () => {
      await byTestId("exit-picker").click();
      await byTestId("exit-filter-risk").click();
      await expect(byTestId("exit-filter-risk")).toHaveAttribute("aria-pressed", "true");
      await byTestId("exit-filter-all").click();
      await browser.keys("Escape");
    },
  });

  step("inicio-proximas", {
    title: "Próximas pruebas",
    caption: "«Próximas pruebas» separa los casos sin ejecutar, los bloqueados y los que esperan re-test (fallaron y su defecto ya está corregido), por prioridad. Cada fila abre el caso.",
    covers: ["tabs:src/app/dashboard/UpcomingTests.tsx"],
    run: async () => {
      await byTestId("tab-home-up-blocked").click();
      await expect(byTestId("tab-home-up-blocked")).toHaveAttribute("aria-selected", "true");
      await byTestId("tab-home-up-retest").click();
      await byTestId("tab-home-up-notRun").click();
    },
  });

  step("motor-ia", {
    title: "Administración · Motor de IA",
    caption:
      "«Administración» (en el menú de tu avatar o en el menú lateral) reúne la configuración de la aplicación en pestañas agrupadas: «Recursos» (Motor de IA, Plantillas), «Aplicación» (General), «Cuenta y datos» (Sincronización, Seguridad, Evidencias) y «Soporte» (Diagnóstico). En «Motor de IA» eliges cómo usar la IA (automático, solo online o solo local), el proveedor online, su clave y el modelo, o un modelo local con Ollama para trabajar sin internet. La IA es opcional: sin ella, los botones de asistencia se desactivan con un aviso y nada de lo que propone se aplica sin que lo aceptes.",
    covers: ["route:/admin", "admin:ai", "state:ollama-offline", "tabs:src/modules/admin/ui/AdminTabs.tsx"],
    mask: ["#ai-key"],
    focus: "[role=\"tablist\"]",
    run: async () => {
      await openAdminTab("ai");
      await expect(byTestId("ai-provider-gemini")).toBeDisplayed();
      // Without Ollama on this machine, its card says so instead of failing.
      await waitForText(es.ai.ollamaOffline);
    },
  });

  step("ia-descartar-clave", {
    title: "Cambiar de proveedor con una clave sin guardar",
    caption:
      "Si escribes una clave y cambias de proveedor sin pulsar «Guardar clave», Pharos avisa de que se descartará, para que no la pierdas sin darte cuenta. Al guardarla, la clave queda cifrada en el almacén de credenciales de Windows, nunca en un archivo, y no se incluye en exportaciones ni diagnósticos.",
    covers: ["dialogs:src/modules/ai/ui/AiEngineTab.tsx"],
    shot: false,
    run: async () => {
      // An obviously fake placeholder: this step only exercises the warning.
      await $("#ai-key").setValue("clave-de-ejemplo");
      await byTestId("ai-provider-openai").click();
      await expect(await browser.getAlertText()).toContain(es.ai.keyDiscardConfirm.slice(0, 20));
      await acceptNativeDialog();
      await byTestId("ai-provider-gemini").click();
      await expect($("#ai-key")).toHaveValue("");
    },
  });

  step("plantillas", {
    title: "Plantillas",
    caption:
      "«Plantillas» guarda las plantillas de plan y de caso: las incluidas con Pharos y las tuyas. Sirven para trabajar fuera de la aplicación: descarga una en .xlsx, rellénala en Excel (o pásala a quien no usa Pharos) e impórtala después en un plan (capítulo 3) o en un caso (capítulo 4).",
    covers: ["admin:templates", "action:template-download"],
    run: async () => {
      await openAdminTab("templates");
      await browser.waitUntil(async () => (await $$('[data-testid="template-card"]')).length > 0, { timeoutMsg: "no template cards" });
      await $('[data-testid="template-card"]').$(`button[aria-label^="${tf("templates.moreActions", { name: "" })}"]`).click();
      await menuItem(es.templates.download).click();
      await waitForToast(".xlsx", 30_000);
    },
  });

  step("importar-plantilla", {
    title: "Importar una plantilla",
    caption:
      "«Importar plantilla» añade una plantilla tuya desde un .xlsx: pide su nombre, el tipo (plan o caso), el idioma, la versión, una descripción y un «prompt de uso», las instrucciones que la IA sigue cuando rellena un documento con esa plantilla.",
    covers: ["upload:src/modules/templates/ui/TemplatesTab.tsx", "dialogs:src/modules/templates/ui/TemplateFormModal.tsx"],
    shot: { element: D },
    run: async () => {
      await chooseFile('input[type="file"][accept=".xlsx"]', newestDownload(".xlsx"));
      await expect(dialog()).toBeDisplayed();
      await (await field(es.templates.form.name, D)).setValue("Plan de pruebas · Banca (propia)");
    },
  });

  step("eliminar-plantilla", {
    title: "Eliminar una plantilla propia",
    caption:
      "Tus plantillas se editan o eliminan desde su menú; las incluidas con Pharos no se pueden borrar. Eliminar pide confirmación con «Sí, eliminar».",
    covers: ["dialogs:src/modules/templates/ui/TemplatesTab.tsx", "dialogs:src/modules/templates/ui/TemplateFormModal.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      // Closing with changes asks first; dismissing the question keeps editing.
      await clickButton(es.common.cancel, D);
      await browser.dismissAlert();
      await expect(dialog()).toBeDisplayed();
      await clickButton(es.templates.form.save, D);
      await waitForToast(tf("templates.importedToast", { name: "Plan de pruebas · Banca (propia)" }));
      await $(`button[aria-label="${tf("templates.moreActions", { name: "Plan de pruebas · Banca (propia)" })}"]`).click();
      await menuItem(es.common.delete).click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("general", {
    title: "General",
    caption: "Tema (claro, oscuro o según el sistema) e idioma se aplican al momento. También un fondo personalizado con su opacidad, la retención de elementos borrados y la carpeta donde se guardan las exportaciones.",
    covers: ["admin:general", "upload:src/modules/admin/ui/tabs/GeneralTab.tsx"],
    run: async () => {
      await clickButton(es.common.confirmDelete, '[role="alertdialog"]');
      await $('[role="alertdialog"]').waitForExist({ reverse: true });
      await openAdminTab("general");
      await expect(byTestId("download-dir")).toBeDisplayed();
      await chooseFile('input[type="file"][accept="image/*"]', join(repoDir, "src-tauri", "pharos-icon-source.png"));
    },
  });

  step("cambios-sin-guardar", {
    title: "Cambiar de pestaña con cambios sin guardar",
    caption: "Si cambias de pestaña sin «Guardar ajustes», Pharos pregunta si descartas los cambios. Aquí se descartan: el fondo vuelve a ser el de siempre.",
    covers: ["dialogs:src/modules/admin/ui/AdminPage.tsx"],
    shot: false,
    run: async () => {
      await byTestId("admin-tab-sync").click();
      await acceptNativeDialog();
      await expect(byTestId("admin-tab-sync")).toHaveAttribute("aria-selected", "true");
    },
  });

  step("sincronizacion", {
    title: "Sincronización",
    caption:
      "Pharos trabaja sin conexión: guarda todo en este equipo y lo sincroniza con el servidor al iniciar sesión o cuando pulsas «Sincronizar ahora» (también al pie del menú lateral). Esta pestaña muestra el estado, la cuenta, los cambios pendientes de enviar y si hay conflictos que revisar.",
    covers: ["admin:sync", "action:sync-now"],
    run: async () => {
      await clickButton(A.sync.now, "#admin-panel");
      await waitForToast(es.sync.doneToast.split("{{")[0], 30_000);
    },
  });

  step("conflicto-otro-equipo", {
    title: "Un cambio en dos equipos",
    caption:
      "Si el mismo dato se cambia en dos equipos antes de sincronizar (en este ejemplo, el título del requisito REQ-002), el segundo que sincroniza recibe un conflicto: Pharos no pisa ninguno de los dos cambios, avisa y te deja decidir.",
    shot: false,
    run: async () => {
      // The other device: the tour's own API, as a second Pharos would.
      await editOnOtherDevice(
        "requirement",
        (p) => p.requirementKey === "REQ-002",
        (p) => ({ ...p, title: "Pago con código QR (editado en otro equipo)" }),
      );
      // This device: the same requirement, edited before syncing.
      await openProject(PROJECT_A.name);
      await openSection("traceability");
      await $(`button.chips__chip*=${es.traceability.view.requirements}`).click();
      await $("button.tz-open*=Pago con código QR").click();
      await (await field(es.traceability.requirement.title, D)).setValue("Pago con código QR · versión de este equipo");
      await clickButton(es.traceability.requirement.save, D);
      await waitForToast(es.traceability.requirement.savedToast);
      await clickButton(es.sync.now);
      await waitForToast(es.sync.conflictToast.split("{{")[0].trim(), 30_000);
    },
  });

  step("conflictos", {
    title: "Revisar conflictos",
    caption:
      "«Sincronización → Revisar conflictos» (o el aviso del menú lateral) muestra cada conflicto campo a campo: tu versión y la del servidor, una junto a otra. Elige «Conservar la mía» o «Usar la del servidor»; la otra versión se descarta.",
    covers: ["dialogs:src/modules/sync-offline/ui/ConflictPanel.tsx"],
    shot: { element: D },
    run: async () => {
      await openAdminTab("sync");
      await clickButton(tf("admin.sync.review_other", { count: 1 }));
      await expect($("#cp-title")).toBeDisplayed();
    },
  });

  step("conflicto-resuelto", {
    title: "Conflicto resuelto",
    caption:
      "Al elegir una versión, el conflicto desaparece de la lista («Conflicto resuelto») y la versión elegida se sincroniza con el resto de tus equipos.",
    shot: false,
    run: async () => {
      await clickButton(es.sync.conflict.keepRemote, D);
      await waitForToast(es.sync.conflict.resolved);
      // The panel's own «Cerrar» (Esc may land on a re-rendering list).
      await $(".cp__close").click();
      await $(".cp-overlay").waitForExist({ reverse: true });
    },
  });

  step("seguridad", {
    title: "Seguridad · clave de recuperación",
    caption:
      "La base de datos de este equipo está cifrada y su clave vive en el almacén de credenciales de Windows. «Mostrar clave de recuperación» la enseña tras pedir confirmación: con esa clave y una copia de tus datos puedes recuperarlos en otro equipo si este falla. Guárdala ahora, no cuando la necesites.",
    covers: ["admin:security", "dialogs:src/modules/profile/ui/RecoveryKeySection.tsx"],
    shot: { element: D },
    run: async () => {
      await openAdminTab("security");
      await clickButton(es.recoveryKey.show);
      await expect(dialog()).toBeDisplayed();
    },
  });

  step("clave-mostrada", {
    title: "Guarda la clave",
    caption:
      "La clave aparece en grupos de caracteres (en este manual, difuminada). Cópiala a un gestor de contraseñas o escríbela en papel y guárdala en un lugar seguro; marca «Ya la he guardado» y cierra. Quien tenga la clave y una copia de tus datos puede leerlos: no la compartas.",
    covers: ["dialogs:src/modules/profile/ui/RecoveryKeySection.tsx"],
    shot: { element: D },
    mask: ['[data-testid="recovery-key"]'],
    run: async () => {
      await clickButton(es.recoveryKey.confirm, D);
      await expect(byTestId("recovery-key")).toBeDisplayed();
    },
  });

  step("diagnostico", {
    title: "Diagnóstico",
    caption:
      "Si algo falla, «Exportar diagnóstico» guarda un ZIP con la versión, el sistema y el registro de la aplicación, para adjuntarlo al informar del problema. Nunca incluye tus datos ni tus claves.",
    covers: ["admin:diagnostics", "action:diagnostics-export"],
    run: async () => {
      await $(`label*=${es.recoveryKey.savedCheck}`).click();
      await clickButton(es.recoveryKey.close, D);
      await openAdminTab("diagnostics");
      await clickButton(es.diagnostics.export);
      await waitForToast(tf("diagnostics.exported", { file: "" }).trim(), 30_000);
    },
  });
});
