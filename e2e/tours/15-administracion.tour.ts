// Chapter 15 — Administración (manual v2, MAN-03): the AI engine screen,
// templates (download, import, delete), general settings (theme, language,
// background, download folder), sync (now, automatic, conflicts), security
// (recovery key) and diagnostics. Example: Liomar sets up his Pharos.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { editOnOtherDevice } from "./people";
import { chapter, step } from "./tour";
import {
  acceptConfirm,
  dismissConfirm,
  byTestId,
  chooseFile,
  clearInput,
  clickButton,
  dialog,
  es,
  field,
  PROJECT_A,
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
      await acceptConfirm(es.ai.keyDiscardConfirm.slice(0, 20));
      await byTestId("ai-provider-gemini").click();
      await expect($("#ai-key")).toHaveValue("");
    },
  });

  step("plantillas", {
    title: "Plantillas",
    caption:
      "«Plantillas» guarda las plantillas de plan y de caso: las incluidas con Pharos y las tuyas. Sirven para trabajar fuera de la aplicación: descarga una en .xlsx, rellénala en Excel (o pásala a quien no usa Pharos) e impórtala después en un plan (capítulo 5) o en un caso (capítulo 8).",
    covers: ["admin:templates", "action:template-download"],
    run: async () => {
      await openAdminTab("templates");
      await browser.waitUntil(async () => (await $$('[data-testid="template-card"]')).length > 0, { timeoutMsg: "no template cards" });
      await $('[data-testid="template-card"]').$(`button[aria-label^="${tf("templates.moreActions", { name: "" })}"]`).click();
      await menuItem(es.templates.download).click();
      await waitForToast(es.downloads.saved.split("{{")[0], 30_000);
    },
  });

  step("importar-plantilla", {
    title: "Importar una plantilla",
    caption:
      "«Importar plantilla» añade una plantilla tuya desde un .xlsx: pide su nombre, el tipo (plan o caso), el idioma, la versión, una descripción y un «prompt de uso», las instrucciones que la IA sigue cuando rellena un documento con esa plantilla. En este ejemplo, Liomar importa la plantilla de plan que acaba de descargar como «Plan de pruebas · Pharos (propia)».",
    covers: ["upload:src/modules/templates/ui/TemplatesTab.tsx", "dialogs:src/modules/templates/ui/TemplateFormModal.tsx"],
    shot: { element: D },
    run: async () => {
      await chooseFile('input[type="file"][accept=".xlsx"]', newestDownload(".xlsx"));
      await expect(dialog()).toBeDisplayed();
      await (await field(es.templates.form.name, D)).setValue("Plan de pruebas · Pharos (propia)");
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
      await dismissConfirm(es.dialog.unsaved.message.slice(0, 20));
      await expect(dialog()).toBeDisplayed();
      await clickButton(es.templates.form.save, D);
      await waitForToast(tf("templates.importedToast", { name: "Plan de pruebas · Pharos (propia)" }));
      await $(`button[aria-label="${tf("templates.moreActions", { name: "Plan de pruebas · Pharos (propia)" })}"]`).click();
      await menuItem(es.common.delete).click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("general", {
    title: "General",
    caption:
      "«General» reúne los ajustes de la aplicación en este equipo. El tema (claro, oscuro o según el sistema), el idioma y la carpeta de las exportaciones se guardan al momento. El fondo viene con una imagen predeterminada que puedes cambiar o quitar; al mover su opacidad ves el resultado antes de pulsar «Guardar ajustes». También eliges la retención de los elementos borrados.",
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
    caption:
      "Si cambias de pestaña sin «Guardar ajustes», Pharos pregunta si descartas los cambios (en este ejemplo se descartan y el fondo vuelve a ser el de siempre).",
    covers: ["dialogs:src/modules/admin/ui/AdminPage.tsx"],
    shot: false,
    run: async () => {
      await byTestId("admin-tab-sync").click();
      await acceptConfirm();
      await expect(byTestId("admin-tab-sync")).toHaveAttribute("aria-selected", "true");
    },
  });

  step("papelera", {
    title: "Papelera",
    caption:
      "Al final de «General», la «Papelera» reúne lo que has borrado en este equipo y aún no se ha eliminado para siempre: el número de elementos, su desglose por tipo (proyectos, casos, requisitos, defectos…) y, en cada fila, cuándo se borró y en cuántos días se eliminará según la retención. Marca filas para «Restaurar» (vuelven a su sitio con su clave y su historial, y se sincronizan) o «Eliminar para siempre»; un proyecto vuelve con lo que se borró con él. «Vaciar papelera» pide confirmación y conserva lo que tiene cambios sin sincronizar. En la web no se guarda lo borrado: la papelera está en la app de escritorio.",
    covers: ["dialogs:src/modules/admin/ui/TrashSection.tsx"],
    focus: '[data-testid="admin-trash"]',
    run: async () => {
      await openAdminTab("general");
      await byTestId("admin-trash").scrollIntoView();
      await expect(byTestId("trash-table")).toBeDisplayed();
      await byTestId("trash-empty").click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await clickButton(es.common.cancel, '[role="alertdialog"]');
      await $('[role="alertdialog"]').waitForExist({ reverse: true });
    },
  });

  step("usuarios", {
    title: "Usuarios del servidor",
    caption:
      "«Usuarios», en el grupo «Aplicación», solo la ve un administrador del servidor: la primera cuenta que se registró en él (aquí, la de Liomar), las que nombre otro administrador y las que configure quien gestiona el servidor (PHAROS_ADMINS). Lista todas las cuentas del servidor, con su correo, su alta y si tienen códigos de recuperación, y en cada fila «Restablecer contraseña…» (un enlace de un solo uso que dura 24 horas; el administrador nunca ve ni pone la contraseña) y «Hacer administrador» o «Quitar administrador». No da acceso a los proyectos de nadie: es un rol de todo el servidor, distinto del Test Manager de un workspace. En tu propia fila no hay «Restablecer contraseña» (la tuya se cambia en «Mi perfil»), y como Liomar es el único administrador, su «Quitar administrador» está deshabilitado.",
    covers: ["admin:users"],
    focus: ".usr-table",
    run: async () => {
      await openAdminTab("users");
      await expect(byTestId("admins-count")).toBeDisplayed();
      await expect($(".usr-table")).toBeDisplayed();
    },
  });

  step("sincronizacion", {
    title: "Sincronización",
    caption:
      "Pharos trabaja sin conexión: guarda todo en este equipo y lo sincroniza con el servidor al iniciar sesión, al recuperar la conexión, cada pocos minutos si lo activas y cuando pulsas «Sincronizar ahora» (también al pie del menú lateral). Esta pestaña muestra el estado, la cuenta, los cambios pendientes de enviar y si hay conflictos que revisar. «Sincronizar ahora» envía y recibe al momento y avisa de cuántos cambios fueron (↑) y vinieron (↓).",
    covers: ["admin:sync", "action:sync-now"],
    run: async () => {
      await openAdminTab("sync");
      await clickButton(A.sync.now, "#admin-panel");
      await waitForToast(es.sync.doneToast.split("{{")[0], 30_000);
    },
  });

  step("sincronizacion-automatica", {
    title: "Sincronización automática",
    caption:
      "«Sincronización automática» viene apagada. Al activarla aparece «Cada», con 1, 5 (preseleccionado), 15 o 30 minutos, y se aplica al momento, sin «Guardar». Los minutos se cuentan desde la última sincronización, sea automática, manual o al reconectar: tras «Sincronizar ahora», la siguiente automática llega N minutos después. Sin conexión, o si ya hay una sincronización en curso, esa vuelta se salta. Apagada, Pharos sigue sincronizando al entrar, al recuperar la conexión y con «Sincronizar ahora».",
    covers: ["action:sync-auto"],
    focus: ['[data-testid="admin-sync-auto"]', '[data-testid="admin-sync-interval"]'],
    run: async () => {
      await expect(byTestId("admin-sync-interval")).not.toBeExisting();
      await byTestId("admin-sync-auto").click();
      await expect(byTestId("admin-sync-interval")).toBeDisplayed();
    },
    // Off again: an automatic sync must not land in the middle of the
    // conflict the next step stages.
    after: async () => {
      await byTestId("admin-sync-auto").click();
      await expect(byTestId("admin-sync-interval")).not.toBeExisting();
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
        (p) => ({ ...p, title: "Crear un proyecto con su prefijo (editado en otro equipo)" }),
      );
      // This device: the same requirement, edited before syncing.
      await openProject(PROJECT_A.name);
      await openSection("requirements");
      await $("button.tz-open*=Crear un proyecto con su prefijo").click();
      await (await field(es.traceability.requirement.title, D)).setValue("Crear un proyecto con su prefijo · versión de este equipo");
      await clickButton(es.traceability.requirement.save, D);
      await waitForToast(es.traceability.requirement.savedToast);
      await clickButton(es.sync.now);
      await waitForToast(tf("sync.conflictToast_one", { count: 1 }), 30_000);
    },
  });

  step("conflictos", {
    title: "Revisar conflictos",
    caption:
      "«Sincronización → Revisar conflictos» (o el aviso del menú lateral) muestra solo los campos que chocan: lo que cada equipo cambió en campos distintos ya está combinado. En cada campo eliges tu versión o la del servidor, una junto a otra, y «Aplicar»; «La mía en todo» y «La del servidor en todo» conservan una versión entera.",
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
      "Al aplicar, el conflicto desaparece de la lista («Conflicto resuelto») y lo elegido se sincroniza con el resto de tus equipos. Aquí, el título del servidor.",
    shot: false,
    run: async () => {
      // SYNC-02: the title changed on both sides, so the panel asks for it.
      const title = es.sync.conflict.fields.title;
      await $(`${D} input[aria-label="${title}: ${es.sync.conflict.remote}"]`).click();
      await clickButton(es.sync.conflict.apply, D);
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

  step("auditoria", {
    title: "Auditoría",
    caption:
      "«Auditoría» lista cada cambio de tu cuenta, el más reciente arriba: quién lo hizo (tú, un agente en tu nombre o el sistema), qué acción, sobre qué elemento y desde dónde (este equipo, la web u otro equipo). Por defecto ves los últimos 30 días; filtra por periodo, quién, elemento, acción o proyecto, o busca una clave. Arriba, Pharos comprueba que el registro está íntegro: ningún cambio se ha borrado, reordenado ni modificado.",
    covers: ["admin:audit", "action:audit-verify"],
    run: async () => {
      await openAdminTab("audit");
      await waitForText(A.audit.integrity.okTitle, 30_000);
      await browser.waitUntil(async () => (await $$('[data-testid^="audit-row-"]')).length > 0, {
        timeoutMsg: "no audit rows",
      });
    },
  });

  step("auditoria-detalle", {
    title: "El antes y el después de un cambio",
    caption:
      "Pulsa un elemento de la lista para ver el cambio campo a campo: lo que había, tachado en rojo, y lo que hay ahora, en verde. Una importación o un borrado en cascada muestra sus recuentos. «Ver todo su historial» lista todos los cambios de ese elemento; «Copiar como JSON» copia el evento tal como se guardó.",
    covers: ["dialogs:src/modules/admin/ui/audit/AuditDetail.tsx"],
    shot: { element: D },
    run: async () => {
      await $('[data-testid^="audit-row-"]').click();
      await expect(dialog()).toBeDisplayed();
      await waitForText(A.audit.detail.linkOk);
    },
  });

  step("auditoria-exportar", {
    title: "Exportar la auditoría",
    caption:
      "«Exportar» guarda lo que muestran los filtros, todas las páginas, en Excel (.xlsx) o CSV: una fila por campo cambiado, con quién, cuándo, el antes y el después. El Excel lleva una hoja «Integridad» con el resultado de la comprobación.",
    covers: ["action:audit-export"],
    shot: false,
    run: async () => {
      await browser.keys("Escape");
      await $(D).waitForExist({ reverse: true });
      await byTestId("audit-export").click();
      await menuItem(A.audit.export.xlsx).click();
      await waitForToast(es.downloads.saved.split("{{")[0], 30_000);
      expect(newestDownload(".xlsx")).toContain("pharos-auditoria-");
    },
  });

  step("ia-reemplazar-clave", {
    title: "Reemplazar una clave de IA guardada",
    caption:
      "Si ya hay una clave guardada y guardas otra sin probarla, Pharos pide confirmación, porque la anterior no se puede recuperar. «Probar conexión» comprueba la nueva sin reemplazar nada; si responde, se guarda sin preguntar.",
    covers: ["dialogs:src/modules/ai/ui/AiEngineTab.tsx"],
    shot: false,
    run: async () => {
      // Obviously fake placeholders, in the tour's isolated keychain profile:
      // this step only exercises the warning and never reaches a provider.
      const keyCommand = (cmd: string, args: object) =>
        browser.execute(
          async (c: string, a: object) => {
            const w = window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: object) => Promise<unknown> } };
            await w.__TAURI_INTERNALS__.invoke(c, a);
          },
          cmd,
          args,
        );
      await keyCommand("ai_key_set", { provider: "gemini", key: "clave-de-ejemplo" });
      await openAdminTab("ai");
      await $("#ai-key").setValue("otra-clave-de-ejemplo");
      await clickButton(es.ai.saveKey);
      await dismissConfirm(es.ai.keyReplaceConfirm.slice(0, 20));
      // Declined: nothing was replaced and the typed key is still there.
      await expect($("#ai-key")).toHaveValue("otra-clave-de-ejemplo");
      // React-controlled: clearValue fires no input event, and the tab would
      // stay «Por guardar» for the next chapter.
      await clearInput("#ai-key");
      await browser.waitUntil(async () => !(await $("body").getText()).includes("Por guardar"), {
        timeoutMsg: "the AI tab still has unsaved changes",
      });
      await keyCommand("ai_key_clear", { provider: "gemini" });
    },
  });

  // IA-12 (ADR-0034). The tour API runs with a throwaway AI_VAULT_KEY
  // (run-tours.mjs) and the key is an obviously fake placeholder in the
  // tour's isolated keychain: uploading it never reaches a provider.
  const W = es.ai.web;
  const webSwitch = () => byTestId("ai-web-switch");
  const keyCommand = (cmd: string, args: object) =>
    browser.execute(
      async (c: string, a: object) => {
        const w = window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: object) => Promise<unknown> } };
        await w.__TAURI_INTERNALS__.invoke(c, a);
      },
      cmd,
      args,
    );
  /** Opens Motor de IA afresh, so the switch reads the key and the server again. */
  const reopenAi = async () => {
    await openAdminTab("general");
    await openAdminTab("ai");
    await expect(webSwitch()).toBeDisplayed();
  };

  step("ia-web-consentimiento", {
    title: "Usar la clave de IA también en la web",
    caption:
      "«Usar esta clave también en la web» viene apagado. Al activarlo, Pharos explica qué implica antes de que la clave salga del equipo: el servidor guarda una copia cifrada y nunca la muestra, quien administre el servidor y tenga su base de datos y su clave maestra podría leerla, y lo que pidas desde la web se cobra a tu clave. «Subir la clave» solo se activa al marcar la casilla. Lo sube el núcleo de la app, directamente desde el almacén de credenciales de Windows.",
    covers: ["dialogs:src/modules/ai/ui/WebAccessPanel.tsx"],
    focus: '[role="dialog"]',
    run: async () => {
      await keyCommand("ai_key_set", { provider: "gemini", key: "clave-de-ejemplo" });
      await reopenAi();
      await browser.waitUntil(async () => webSwitch().isEnabled(), { timeoutMsg: "the web switch stays disabled" });
      await expect(webSwitch()).toHaveAttribute("aria-checked", "false");
      await webSwitch().click();
      await expect(byTestId("ai-web-consent-upload")).toBeDisabled();
      await byTestId("ai-web-consent-check").click();
      await expect(byTestId("ai-web-consent-upload")).toBeEnabled();
    },
  });

  step("ia-web-activada", {
    title: "La clave, disponible en la web",
    caption:
      "Con el interruptor activado, Motor de IA dice qué usa la web (proveedor y modelo), desde cuándo y en qué servidor. Al iniciar sesión en la web con tu cuenta, «Asistir con IA» funciona con esa clave. Si guardas aquí una clave nueva del mismo proveedor, la copia se actualiza sola.",
    covers: ["admin:ai"],
    focus: '[data-testid="ai-web-access"]',
    run: async () => {
      await byTestId("ai-web-consent-upload").click();
      await waitForToast(W.toast.on.split("{{")[0]);
      await expect(webSwitch()).toHaveAttribute("aria-checked", "true");
      await waitForText(W.facts.inWeb);
    },
  });

  step("ia-web-modelo", {
    title: "Cambiar el modelo que usa la web",
    caption:
      "Si cambias el modelo en el escritorio, la web sigue con el anterior hasta que lo confirmas: Motor de IA lo avisa y «Usar el nuevo modelo en la web» pregunta antes. Cambiar de proveedor sube otra clave, así que vuelve a pedir el consentimiento.",
    covers: ["dialogs:src/modules/ai/ui/WebAccessPanel.tsx"],
    shot: false,
    run: async () => {
      // The saved config, as «Guardar» would leave it, with another model.
      await browser.execute(() => {
        const raw = JSON.parse(localStorage.getItem("pharos.ai.config") ?? "{}") as { onlineModels?: Record<string, string> };
        raw.onlineModels = { ...(raw.onlineModels ?? {}), gemini: "gemini-2.5-flash" };
        localStorage.setItem("pharos.ai.config", JSON.stringify(raw));
      });
      await reopenAi();
      await clickButton(W.differs.useModel);
      await acceptConfirm(W.model.title.slice(0, 20));
      await waitForToast(W.toast.on.split("{{")[0]);
      await waitForText("gemini-2.5-flash");
    },
  });

  step("ia-web-desactivar", {
    title: "Dejar de usar la clave en la web",
    caption:
      "Al desactivar el interruptor, Pharos pregunta y borra la copia del servidor: la web se queda sin IA en línea. En la web también puedes pulsar «Dejar de usarla en la web».",
    covers: ["dialogs:src/modules/ai/ui/WebAccessPanel.tsx"],
    shot: false,
    run: async () => {
      await webSwitch().click();
      await acceptConfirm(W.off.message.slice(0, 20));
      await waitForToast(W.toast.off);
      await expect(webSwitch()).toHaveAttribute("aria-checked", "false");
    },
  });

  step("ia-web-quitar-clave", {
    title: "Quitar una clave que la web también usa",
    caption:
      "Si quitas del escritorio una clave que la web también usa, Pharos avisa de que la copia del servidor se borra con ella.",
    covers: ["dialogs:src/modules/ai/ui/clearWebCopy.ts"],
    shot: false,
    run: async () => {
      await webSwitch().click();
      await byTestId("ai-web-consent-check").click();
      await byTestId("ai-web-consent-upload").click();
      await waitForToast(W.toast.on.split("{{")[0]);
      await clickButton(es.ai.clearKey);
      await acceptConfirm(W.clearKey.title.slice(0, 20));
      await waitForToast(W.toast.keyClearedBoth);
      // Back to how the chapter found it: no key, the default model.
      await browser.execute(() => {
        const raw = JSON.parse(localStorage.getItem("pharos.ai.config") ?? "{}") as { onlineModels?: Record<string, string> };
        raw.onlineModels = { ...(raw.onlineModels ?? {}), gemini: "gemini-2.0-flash" };
        localStorage.setItem("pharos.ai.config", JSON.stringify(raw));
      });
    },
  });

  step("reglas-workspace", {
    title: "Reglas: aprobación independiente",
    caption:
      "«Miembros y roles», en el selector de workspace, tiene la sección «Reglas». «Aprobación independiente» decide quién aprueba planes y casos: activada, quien tiene el rol (Test Manager para planes; Test Manager o Test Analyst para casos) y no es el autor; desactivada, cualquiera que pueda editar, también el autor, y queda como aprobación propia. Solo un Test Manager la cambia, y apagarla pide confirmación. En el workspace Personal está siempre desactivada, porque trabajas solo: el interruptor se ve, pero no se puede activar. En un workspace compartido, lo normal es tenerla activada.",
    covers: ["action:workspace-rules"],
    focus: '[data-testid="workspace-rules"]',
    run: async () => {
      await byTestId("workspace-switcher").waitForDisplayed({ timeout: 30_000 });
      await byTestId("workspace-switcher").click();
      await byTestId("workspace-members").click();
      await expect(byTestId("workspace-rules")).toBeDisplayed();
      await expect(byTestId("workspace-independent-approval")).toBeDisabled();
    },
  });
});
