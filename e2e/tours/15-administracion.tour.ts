// Chapter 15 — Administración (manual v2, MAN-03): the AI engine screen,
// templates (download, import, delete), general settings (theme, language,
// background, download folder, trash), sync (now, automatic, the silent
// field-by-field merge, a conflict, its notification and the merge panel),
// security (recovery key), diagnostics, the audit and the AI key in the web
// (the workspace rules are in chapter 20). Example: Liomar, QA and Test Manager of his own
// workspace, sets up his Pharos.
//
// The last block is for whoever administers the server: the app signs in as
// «Administrador» (account-switch.ts), shows «Usuarios» acting on Jorge's
// account (reset link, administrator role, tokens, disable and re-enable;
// nothing is deleted and Jorge's password stays valid) and comes back to
// Liomar. Liomar is not a server administrator, so he never sees «Usuarios».
//
// The second device of the sync steps is Liomar's own other computer, played
// through the tour API (people.ts): at this point of the manual «Pharos» is in
// his Personal workspace, where nobody else can edit it.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { PERSONA, TEAMMATE } from "../../scripts/manual/persona.mjs";
import { signInAs } from "./account-switch";
import { editOnOtherDevice, jorgeCreatesPersonalToken } from "./people";
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
  hasText,
  PROJECT_A,
  menuItem,
  openAdminTab,
  openProject,
  openSection,
  repoDir,
  scrollToTop,
  tf,
  waitForText,
  waitForToast,
} from "./helpers";

const A = es.admin;
const U = es.admin.users;
const D = '[role="dialog"]';
const downloadsDir = process.env.PHAROS_TOURS_DOWNLOADS ?? "";

/** The requirement of the sync steps (fitting: it is about syncing). */
const SYNC_REQ = { key: "REQ-006", title: "Trabajar sin conexión y sincronizar" };
/** What Liomar's laptop adds to REQ-006's description in the silent merge. */
const MERGED_SENTENCE = "Si cambian el mismo campo, Pharos pregunta cuál queda.";

function newestDownload(ext: string): string {
  const files = readdirSync(downloadsDir)
    .filter((f) => f.toLowerCase().endsWith(ext))
    .map((f) => ({ f, t: statSync(join(downloadsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error(`no ${ext} in ${downloadsDir}`);
  return join(downloadsDir, files[0].f);
}

/** Leaves on screen only the toast that contains `text` (marked
 *  `data-tour-shown`, for a step's focus), once the next toast has come over
 *  it. The others are hidden, not removed (React owns them). */
async function showOnlyToast(text: string) {
  await browser.pause(1_500);
  await browser.execute((wanted: string) => {
    const toasts = Array.from(document.querySelectorAll<HTMLElement>(".toast-stack .toast"));
    const visible = toasts.find((t) => getComputedStyle(t).display !== "none");
    const display = visible ? getComputedStyle(visible).display : "flex";
    for (const t of toasts) {
      if ((t.textContent ?? "").includes(wanted)) {
        t.style.setProperty("display", display, "important");
        t.setAttribute("data-tour-shown", "");
      } else t.style.setProperty("display", "none", "important");
    }
  }, text);
  await expect($("[data-tour-shown]")).toBeDisplayed();
}

/** Every scrolled container back to its top (a page shot from its title). */
async function scrollAllToTop() {
  await browser.execute(() => {
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll<HTMLElement>("*")) if (el.scrollTop > 0) el.scrollTop = 0;
  });
}

/** Opens a requirement of «Pharos» by the start of its title. */
async function openRequirement(titleStart: string) {
  await openProject(PROJECT_A.name);
  await openSection("requirements");
  await $(`button.tz-open*=${titleStart}`).click();
  await expect(dialog()).toBeDisplayed();
}

/** Saves the open requirement with a new title. */
async function retitleRequirement(title: string) {
  await (await field(es.traceability.requirement.title, D)).setValue(title);
  await clickButton(es.traceability.requirement.save, D);
  await waitForToast(es.traceability.requirement.savedToast);
  await $(D).waitForExist({ reverse: true });
}

// ---- «Usuarios» (server administrator) -------------------------------------
// Rows and their buttons are found by the account's e-mail (FIX-38 test ids:
// data-email on the row, user-<action>-<email> on its buttons).
const userRow = (email: string) => $(`tr[data-email="${email}"]`);
type UserAction = "reset" | "grant" | "revoke" | "disable" | "enable";
const rowButton = (email: string, action: UserAction) => byTestId(`user-${action}-${email}`);

chapter("administracion", () => {
  // Safety net: whatever happens in the administrator block, the next
  // chapter finds the app signed in as Liomar (a no-op when it already is).
  after(async () => {
    // A dialog left open by a failed step would block the sign-out.
    for (let i = 0; i < 3 && (await $('[role="dialog"], [role="alertdialog"]').isExisting()); i++) await browser.keys("Escape");
    await signInAs("liomar");
  });

  step("motor-ia", {
    title: "Administración · Motor de IA",
    caption:
      "«Administración» (en el menú de tu avatar o en el menú lateral) reúne la configuración de la aplicación en pestañas agrupadas: «Recursos» (Motor de IA, Plantillas), «Aplicación» (General y, si administras el servidor, Usuarios), «Cuenta y datos» (Sincronización, Seguridad, Evidencias, Auditoría) y «Soporte» (Diagnóstico). Liomar no administra el servidor, así que no ve «Usuarios». En «Motor de IA» eliges cómo usar la IA (automático, solo online o solo local), el proveedor online, su clave y el modelo, o un modelo local con Ollama para trabajar sin internet. La IA es opcional: sin ella, los botones de asistencia se desactivan con un aviso y nada de lo que propone se aplica sin que lo aceptes.",
    covers: ["route:/admin", "admin:ai", "state:ollama-offline", "tabs:src/modules/admin/ui/AdminTabs.tsx"],
    mask: ["#ai-key"],
    focus: '[role="tablist"]',
    run: async () => {
      await openAdminTab("ai");
      await expect(byTestId("ai-provider-gemini")).toBeDisplayed();
      await expect(byTestId("admin-tab-users")).not.toBeExisting();
      // Without Ollama on this machine, its card says so instead of failing.
      await waitForText(es.ai.ollamaOffline);
      await scrollAllToTop();
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
      "«Plantillas» guarda las plantillas de plan y de caso: las incluidas con Pharos y las tuyas, que viajan con tu workspace (editarlas requiere ser Test Manager o Test Analyst). Sirven para trabajar fuera de la aplicación: descarga una en .xlsx, rellénala en Excel (o pásala a quien no usa Pharos) e impórtala después en un plan (capítulo 5) o en un caso (capítulo 8).",
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
      await (await field(es.templates.form.description, D)).setValue("El plan de una versión de Pharos, con el alcance por módulo y los criterios de salida del equipo.");
      await (await field(es.templates.form.usagePrompt, D)).setValue("Úsala para el plan de pruebas de una versión de Pharos: un apartado por módulo y los criterios de salida de la regresión.");
    },
  });

  step("eliminar-plantilla", {
    title: "Eliminar una plantilla propia",
    caption:
      "Tus plantillas se editan o eliminan desde su menú; las incluidas con Pharos no se pueden borrar. Eliminar pide confirmación con «Sí, eliminar»: la plantilla pasa a la papelera y puedes restaurarla desde «Administración › General › Papelera» hasta que se elimine para siempre.",
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
      "«General» reúne los ajustes de la aplicación en este equipo. El tema (claro, oscuro o según el sistema), el idioma y la carpeta de las exportaciones se guardan al momento. El fondo viene con una imagen predeterminada que puedes cambiar o quitar; al mover su opacidad ves el resultado detrás de la página antes de pulsar «Guardar ajustes», y un aviso dice qué queda «Por guardar». También eliges la retención de los elementos borrados.",
    covers: ["admin:general"],
    focus: "#adm-opacity",
    run: async () => {
      await clickButton(es.common.confirmDelete, '[role="alertdialog"]');
      await $('[role="alertdialog"]').waitForExist({ reverse: true });
      await openAdminTab("general");
      await expect(byTestId("download-dir")).toBeDisplayed();
      const slider = $("#adm-opacity");
      const before = await slider.getValue();
      await browser.execute(() => document.getElementById("adm-opacity")?.focus());
      // Up to about 80 %: the photo behind the page shows stronger at once.
      for (let i = 0; i < 100 && Number(await slider.getValue()) < 80; i++) await browser.keys("ArrowRight");
      await browser.waitUntil(async () => (await slider.getValue()) !== before, { timeoutMsg: "the opacity did not move" });
      await waitForText(A.general.pending.message.split("{{")[0]);
      // From the page title: «Apariencia» fits whole under the tabs.
      await scrollAllToTop();
      // The pointer off the controls: nothing is shot hovered.
      await browser.action("pointer").move({ origin: "viewport", x: 700, y: 40 }).perform();
    },
  });

  step("cambios-sin-guardar", {
    title: "Cambiar de pestaña con cambios sin guardar",
    caption:
      "«Elegir imagen» cambia el fondo por una imagen tuya, también como borrador. Si cambias de pestaña sin «Guardar ajustes», Pharos pregunta si descartas los cambios (en este ejemplo se descartan: el fondo y su opacidad vuelven a ser los de siempre).",
    covers: ["upload:src/modules/admin/ui/tabs/GeneralTab.tsx", "dialogs:src/modules/admin/ui/AdminPage.tsx"],
    shot: false,
    run: async () => {
      await chooseFile('input[type="file"][accept="image/*"]', join(repoDir, "src-tauri", "pharos-icon-source.png"));
      await byTestId("admin-tab-sync").click();
      await acceptConfirm();
      await expect(byTestId("admin-tab-sync")).toHaveAttribute("aria-selected", "true");
    },
  });

  step("papelera", {
    title: "Papelera",
    caption:
      "Al final de «General», la «Papelera» reúne lo que has borrado en este equipo y aún no se ha eliminado para siempre: el número de elementos, su desglose por tipo (proyectos, casos, requisitos, defectos…) y, en cada fila, cuándo se borró y en cuántos días se eliminará según la retención. Marca filas para «Restaurar» (vuelven a su sitio con su clave y su historial, y se sincronizan) o «Eliminar para siempre»; un proyecto vuelve con lo que se borró con él. «Vaciar papelera» pide confirmación y conserva lo que tiene cambios sin sincronizar. En la web no se guarda lo borrado: la papelera está en la app de escritorio. Los botones del desglose filtran la lista: aquí, «Plantillas» deja solo la plantilla que Liomar acaba de eliminar; «Todo» la muestra entera, con, entre otros, el requisito REQ-007 que borró en el capítulo 7.",
    covers: ["dialogs:src/modules/admin/ui/TrashSection.tsx"],
    focus: '[data-testid="admin-trash"]',
    run: async () => {
      await openAdminTab("general");
      await expect(byTestId("trash-table")).toBeDisplayed();
      await waitForText("REQ-007");
      // The template Liomar just deleted, through the breakdown's filter: the
      // whole list is longer than its box.
      await $(".adm-trash__chips").$(`button*=${es.admin.trash.kind.template_other}`).click();
      await expect($('[data-testid="trash-table"]').$(hasText("Plan de pruebas · Pharos (propia)"))).toBeDisplayed();
      await scrollToTop('[data-testid="admin-trash"]');
      await browser.action("pointer").move({ origin: "viewport", x: 700, y: 40 }).perform();
    },
    after: async () => {
      await $(".adm-trash__chips").$(`button*=${es.admin.trash.everything}`).click();
      await expect($('[data-testid="trash-table"]').$(hasText("REQ-007"))).toBeExisting();
      // «Vaciar papelera» asks first; Liomar keeps his trash.
      await byTestId("trash-empty").click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
      await clickButton(es.common.cancel, '[role="alertdialog"]');
      await $('[role="alertdialog"]').waitForExist({ reverse: true });
    },
  });

  step("sincronizacion", {
    title: "Sincronización",
    caption:
      "Pharos trabaja sin conexión: guarda todo en este equipo y lo sincroniza con el servidor al iniciar sesión, al recuperar la conexión, cada pocos minutos si lo activas y cuando pulsas «Sincronizar ahora» (también al pie del menú lateral). Esta pestaña muestra el estado, la cuenta, los cambios pendientes de enviar (si los hay) y si hay conflictos que revisar. «Sincronizar ahora» envía y recibe al momento y avisa de cuántos cambios fueron (↑) y vinieron (↓). Una vez al día, después de sincronizar, Pharos borra de su registro interno los cambios que el servidor ya tiene, para que la base de datos no crezca sin necesidad: tus datos, su historial y la auditoría siguen igual.",
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
      await browser.action("pointer").move({ origin: "viewport", x: 700, y: 40 }).perform();
    },
    // Off again: an automatic sync must not land in the middle of the
    // conflict the next steps stage.
    after: async () => {
      await byTestId("admin-sync-auto").click();
      await expect(byTestId("admin-sync-interval")).not.toBeExisting();
    },
  });

  step("cambios-combinados", {
    title: "Cambios en campos distintos: se combinan solos",
    caption:
      "Si el mismo elemento se cambia en dos sitios antes de sincronizar, Pharos lo combina campo a campo. En este ejemplo, Liomar completa desde su portátil la descripción del requisito REQ-006 («Si cambian el mismo campo, Pharos pregunta cuál queda.») y, en este equipo, sin sincronizar entre medias, su título («…con el servidor»). Al sincronizar, como tocó campos distintos, Pharos se queda con los dos cambios sin preguntar: el requisito tiene el título nuevo y la descripción del portátil. Un aviso lo dice («Se combinaron tus cambios con los hechos a la vez en otro equipo o por otra persona en 1 elemento…»), y el elemento queda en «Auditoría» como «Conflicto resuelto», con «Se quedó: Combinado».",
    toast: true,
    focus: ["[data-tour-shown]", `button.tz-open*=${SYNC_REQ.title}`],
    run: async () => {
      // The other device: Liomar's laptop, through the tour API.
      await editOnOtherDevice(
        "requirement",
        (p) => p.requirementKey === SYNC_REQ.key,
        (p) => ({ ...p, description: `${String(p.description ?? "")} ${MERGED_SENTENCE}`.trim() }),
      );
      // This device: the same requirement, another field, before syncing.
      await openRequirement(SYNC_REQ.title);
      await retitleRequirement(`${SYNC_REQ.title} con el servidor`);
      await clickButton(es.sync.now);
      await waitForToast(es.sync.autoMerged_one.split("{{")[0], 30_000);
      // The sync then adds its own «Sincronizado (↑…)» toast on top: the
      // picture shows the merge notice, the subject of this step.
      await showOnlyToast(es.sync.autoMerged_one.split("{{")[0]);
      // The picture: the notice over the list, with REQ-006's new title.
      await expect($(`button.tz-open*=${SYNC_REQ.title} con el servidor`)).toBeDisplayed();    },
    after: async () => {
      // Both changes are there.
      await openRequirement(SYNC_REQ.title);
      await expect(await field(es.traceability.requirement.title, D)).toHaveValue(`${SYNC_REQ.title} con el servidor`);
      await browser.waitUntil(async () => (await $(D).getText()).includes(MERGED_SENTENCE) || (await $(`${D} textarea`).getValue()).includes(MERGED_SENTENCE), {
        timeoutMsg: "the other device's description did not arrive",
      });
    },
  });

  step("conflicto-otro-equipo", {
    title: "El mismo campo cambiado en dos equipos",
    caption:
      "Si en cambio los dos cambian el mismo campo, Pharos no pisa ninguno de los dos: lo que no choca se combina y por lo que choca pregunta. En este ejemplo, desde el portátil Liomar cambia el título y la descripción de REQ-006 y, en este equipo, otra vez el título. Al sincronizar, «Sincronizar ahora» avisa de que hay un conflicto por revisar.",
    shot: false,
    run: async () => {
      await browser.keys("Escape");
      await $(D).waitForExist({ reverse: true });
      await editOnOtherDevice(
        "requirement",
        (p) => p.requirementKey === SYNC_REQ.key,
        (p) => ({
          ...p,
          title: `${SYNC_REQ.title} al recuperar la conexión`,
          description: `${String(p.description ?? "")} Lo resuelto queda en la auditoría.`.trim(),
        }),
      );
      await openRequirement(SYNC_REQ.title);
      await retitleRequirement(`${SYNC_REQ.title} campo a campo`);
      await clickButton(es.sync.now);
      await waitForToast(tf("sync.conflictToast_one", { count: 1 }), 30_000);
    },
  });

  step("notificaciones", {
    title: "Notificaciones",
    caption:
      "La campana de la barra superior abre las notificaciones, agrupadas por día: invitaciones, revisiones, defectos asignados, ciclos cerrados, cambios en los miembros, avisos de la cuenta y conflictos. Un número sobre la campana dice cuántas hay sin leer; «Sin leer» las filtra y «Marcar todo como leído» las da por vistas. Cada una lleva su acción: aquí, «1 conflicto de sincronización por revisar» con «Resolver». Se guardan 90 días.",
    focus: '[data-testid="notifications-panel"]',
    run: async () => {
      await byTestId("notifications-trigger").click();
      await expect(byTestId("notifications-panel")).toBeDisplayed();
      await browser.waitUntil(async () => (await $$('[data-testid="notification-row"][data-kind="sync.conflict"]')).length > 0, {
        timeoutMsg: "no sync conflict notification",
      });
    },
  });

  step("conflictos", {
    title: "Revisar conflictos",
    caption:
      "«Resolver» (o «Sincronización › Revisar conflictos», o el aviso «Conflictos» del menú lateral) abre el panel de conflictos. Solo muestra los campos que chocan, con tu versión y la del servidor una junto a otra; lo que cambió en campos distintos ya está combinado, y el panel lo dice («Se combinó 1 campo sin preguntar»: aquí, la descripción del portátil). En cada campo eliges una versión y pulsas «Aplicar»; «La mía en todo» y «La del servidor en todo» conservan una versión entera.",
    covers: ["dialogs:src/modules/sync-offline/ui/ConflictPanel.tsx"],
    shot: { element: D },
    run: async () => {
      await $('[data-testid="notification-row"][data-kind="sync.conflict"]').$(`button=${es.notifications.action.resolve}`).click();
      await expect($("#cp-title")).toBeDisplayed();
    },
  });

  step("conflicto-resuelto", {
    title: "Conflicto resuelto",
    caption:
      "Al aplicar, el conflicto desaparece de la lista («Conflicto resuelto») y lo elegido se sincroniza con el resto de tus equipos. Aquí Liomar se queda con su título («…campo a campo»), y la descripción del portátil se conserva.",
    shot: false,
    run: async () => {
      // SYNC-02: the title changed on both sides, so the panel asks for it.
      const title = es.sync.conflict.fields.title;
      await $(`${D} input[aria-label="${title}: ${es.sync.conflict.local}"]`).click();
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
      "Los datos de este equipo (el archivo pharos.db y la carpeta evidence) están cifrados y su clave vive en el almacén de credenciales de Windows. «Mostrar clave de recuperación» la enseña: con esa clave y una copia de tus datos puedes recuperarlos en otro equipo si este falla. Guárdala ahora, no cuando la necesites.",
    covers: ["admin:security"],
    focus: `button=${es.recoveryKey.show}`,
    run: async () => {
      await openAdminTab("security");
      await expect($(`button=${es.recoveryKey.show}`)).toBeDisplayed();
      await scrollAllToTop();
      await browser.action("pointer").move({ origin: "viewport", x: 700, y: 40 }).perform();
    },
  });

  step("clave-confirmar", {
    title: "Antes de mostrarla",
    caption: "«Mostrar clave de recuperación» pide confirmación antes de enseñar la clave: muéstrala solo cuando nadie más vea tu pantalla.",
    covers: ["dialogs:src/modules/profile/ui/RecoveryKeySection.tsx"],
    shot: false,
    run: async () => {
      await clickButton(es.recoveryKey.show);
      await expect(dialog()).toBeDisplayed();
    },
  });

  step("clave-mostrada", {
    title: "Guarda la clave",
    caption:
      "Al confirmar, la clave aparece en grupos de caracteres (en este manual, difuminada). Cópiala a un gestor de contraseñas o escríbela en papel y guárdala en un lugar seguro; marca «Ya la he guardado» y cierra. Quien tenga la clave y una copia de tus datos puede leerlos: no la compartas.",
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
      "Si algo falla, «Exportar diagnóstico» guarda un ZIP con la versión, el sistema y el registro de la aplicación y, solo como números, cuánto ocupan el registro de cambios y la auditoría, para adjuntarlo al informar del problema. Nunca incluye tus datos ni tus claves.",
    covers: ["admin:diagnostics", "action:diagnostics-export"],
    run: async () => {
      await $(`label*=${es.recoveryKey.savedCheck}`).click();
      await clickButton(es.recoveryKey.close, D);
      await openAdminTab("diagnostics");
      await clickButton(es.diagnostics.export);
      await waitForToast(tf("diagnostics.exported", { file: "" }).trim(), 30_000);
      await browser.action("pointer").move({ origin: "viewport", x: 700, y: 40 }).perform();
    },
  });

  step("auditoria", {
    title: "Auditoría",
    caption:
      "«Auditoría» lista cada cambio de tu cuenta, el más reciente arriba: quién lo hizo (tú, un agente en tu nombre o el sistema), qué acción, sobre qué elemento y desde dónde (este equipo, la web u otro equipo). Por defecto ves los últimos 30 días; filtra por periodo, quién, elemento, acción o proyecto, o busca una clave. Arriba, Pharos comprueba que el registro está íntegro: ningún cambio se ha borrado, reordenado ni modificado. Aquí Liomar busca «REQ-006»: cada cambio de su título sale como «Editado», y cada conflicto de sincronización como «Conflicto resuelto», con lo que se quedó («Se quedó: Combinado»: se juntaron los cambios de los dos equipos) y los campos que tocó.",
    covers: ["admin:audit", "action:audit-verify"],
    run: async () => {
      await openAdminTab("audit");
      await waitForText(A.audit.integrity.okTitle, 30_000);
      await byTestId("audit-search").setValue(SYNC_REQ.key);
      // FIX-39: the merged sync event says what was kept.
      await waitForText(`${A.audit.summary.resolution}: ${A.audit.summaryValue.merged}`, 20_000);
    },
  });

  step("auditoria-detalle", {
    title: "El antes y el después de un cambio",
    caption:
      "Pulsa un elemento de la lista para ver el cambio campo a campo: lo que había, tachado en rojo, y lo que hay ahora, en verde. Una importación o un borrado en cascada muestra sus recuentos. «Ver todo su historial» lista todos los cambios de ese elemento; «Copiar como JSON» copia el evento tal como se guardó. Aquí, el conflicto de REQ-006 que Liomar acaba de resolver: «Conflicto resuelto», con la descripción que llegó del portátil.",
    covers: ["dialogs:src/modules/admin/ui/audit/AuditDetail.tsx"],
    focus: D,
    run: async () => {
      await $('[data-testid^="audit-row-"]').click();
      await expect(dialog()).toBeDisplayed();
      await waitForText(A.audit.detail.linkOk);
      await waitForText(SYNC_REQ.key);
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

  // Obviously fake placeholders, in the tour's isolated keychain profile: the
  // AI steps only exercise warnings and never reach a provider. IA-12
  // (ADR-0034): the tour API runs with a throwaway AI_VAULT_KEY
  // (run-tours.mjs), so uploading the key never reaches a provider either.
  const keyCommand = (cmd: string, args: object) =>
    browser.execute(
      async (c: string, a: object) => {
        const w = window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: object) => Promise<unknown> } };
        await w.__TAURI_INTERNALS__.invoke(c, a);
      },
      cmd,
      args,
    );

  step("ia-reemplazar-clave", {
    title: "Reemplazar una clave de IA guardada",
    caption:
      "Si ya hay una clave guardada y guardas otra sin probarla, Pharos pide confirmación, porque la anterior no se puede recuperar. «Probar conexión» comprueba la nueva sin reemplazar nada; si responde, se guarda sin preguntar.",
    covers: ["dialogs:src/modules/ai/ui/AiEngineTab.tsx"],
    shot: false,
    run: async () => {
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

  const W = es.ai.web;
  const webSwitch = () => byTestId("ai-web-switch");
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
      // The whole card above the save bar.
      await scrollToTop('[data-testid="ai-web-access"]', 120);
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

  // ---- For whoever administers the server ----------------------------------

  step("usuarios", {
    title: "Para quien administra el servidor: «Usuarios»",
    caption:
      "Esta parte es para quien administra el servidor de Pharos, no para el trabajo diario de QA. «Usuarios», en el grupo «Aplicación», solo la ve un administrador del servidor: la primera cuenta que se registró en él (aquí, la cuenta «Administrador», con la que se entra para estos pasos), las que nombre otro administrador y las que configure quien gestiona el servidor (PHAROS_ADMINS). Es un rol de todo el servidor, distinto del Test Manager de un workspace, y no da acceso a los proyectos de nadie. La lista muestra todas las cuentas, con su correo, su alta, si tienen códigos de recuperación («Sin códigos»: si olvidan la contraseña, solo un administrador puede ayudarles) y su estado. En tu propia fila («Tú») no hay «Restablecer contraseña»: la tuya se cambia en «Mi perfil».",
    covers: ["admin:users"],
    focus: ".usr-table",
    run: async () => {
      // Jorge has a personal token for his CLI (made from his own computer).
      await jorgeCreatesPersonalToken("CLI de Jorge");
      await signInAs("admin");
      await openAdminTab("users");
      await expect(byTestId("admins-count")).toBeDisplayed();
      await expect(userRow(TEAMMATE.email)).toBeDisplayed();
      await expect(userRow(PERSONA.email)).toBeDisplayed();
      await scrollAllToTop();
    },
  });

  step("usuario-restablecer", {
    title: "Restablecer la contraseña de otra cuenta",
    caption:
      "Si Jorge olvida su contraseña y no le quedan códigos de recuperación, «Restablecer contraseña…» en su fila explica qué pasará y, con «Generar enlace», crea un enlace de un solo uso que dura 24 horas. Si el servidor envía correo, «Enviar por correo» se lo manda y tú no lo ves; si no, o si eliges «Prefiero entregarlo yo», se muestra una sola vez (en este manual, difuminado): cópialo y dáselo por un canal privado. Como este servidor no tiene dirección web configurada, aquí es un código que Jorge pega en «¿Olvidaste tu contraseña?» de su app. Nunca ves ni pones su contraseña. Al usarlo se cierran todas sus sesiones; Jorge recibe un aviso y queda en la auditoría de los dos.",
    covers: ["dialogs:src/modules/admin/ui/tabs/UsersTab.tsx", "action:admin-reset"],
    shot: { element: D },
    mask: ['[data-testid="admin-reset-link"]'],
    run: async () => {
      await rowButton(TEAMMATE.email, "reset").click();
      await expect(dialog()).toBeDisplayed();
      await clickButton(U.resetConfirm, D);
      // With e-mail on the server, it asks how to deliver it first.
      const myself = $(D).$(`button=${U.deliverMyself}`);
      await browser.waitUntil(async () => (await byTestId("admin-reset-link").isExisting()) || (await myself.isExisting()), {
        timeoutMsg: "no reset link and no delivery choice",
      });
      if (await myself.isExisting()) await myself.click();
      await expect(byTestId("admin-reset-link")).toBeDisplayed();
    },
    after: async () => {
      // Not used: Jorge's password stays as it is.
      await clickButton(U.done, D);
      await $(D).waitForExist({ reverse: true });
    },
  });

  step("usuario-hacer-admin", {
    title: "Nombrar a otro administrador",
    caption:
      "«Hacer administrador» pide confirmación y explica qué podrá hacer: ver todas las cuentas, restablecer contraseñas y nombrar o quitar administradores, sin acceso a los proyectos de nadie. La persona recibe un aviso.",
    covers: ["dialogs:src/modules/admin/ui/tabs/UsersTab.tsx", "action:admin-grant"],
    shot: { element: '[role="alertdialog"], [role="dialog"]' },
    run: async () => {
      await rowButton(TEAMMATE.email, "grant").click();
      await expect(dialog()).toBeDisplayed();
      await waitForText(tf("admin.users.grantTitle", { name: TEAMMATE.alias }));
    },
    after: async () => {
      await clickButton(U.grantConfirm, '[role="alertdialog"], [role="dialog"]');
      await waitForToast(tf("admin.users.granted", { name: TEAMMATE.alias }));
    },
  });

  step("usuario-quitar-admin", {
    title: "Quitar el rol de administrador",
    caption:
      "«Quitar administrador» también pide confirmación y avisa a la persona. Siempre tiene que quedar un administrador: el botón del último sale deshabilitado.",
    covers: ["dialogs:src/modules/admin/ui/tabs/UsersTab.tsx", "action:admin-revoke"],
    shot: false,
    run: async () => {
      await rowButton(TEAMMATE.email, "revoke").click();
      await clickButton(U.revokeConfirm, '[role="alertdialog"], [role="dialog"]');
      await waitForToast(tf("admin.users.revoked", { name: TEAMMATE.alias }));
      await expect(rowButton(TEAMMATE.email, "grant")).toBeDisplayed();
    },
  });

  step("usuario-revocar-tokens", {
    title: "Revocar los tokens de una cuenta",
    caption:
      "«Revocar sus tokens…» anula de una vez todos los tokens de API de esa cuenta, personales y de proyecto, por ejemplo si se filtró uno. La confirmación los nombra (aquí, «CLI de Jorge») y avisa de que no se puede deshacer: los CI que los usan dejan de subir resultados hasta que tengan uno nuevo.",
    covers: ["dialogs:src/modules/integrations/ui/AdminRevokeTokens.tsx"],
    shot: { element: '[role="alertdialog"], [role="dialog"]' },
    run: async () => {
      await userRow(TEAMMATE.email).$(`button=${es.integrations.admin.button}`).click();
      await expect(dialog()).toBeDisplayed();
      await waitForText("CLI de Jorge");
    },
    after: async () => {
      await clickButton(tf("integrations.admin.confirm_one", { count: 1 }), '[role="alertdialog"], [role="dialog"]');
      await waitForToast(tf("integrations.admin.done_one", { count: 1, name: TEAMMATE.alias }));
    },
  });

  step("usuario-desactivar", {
    title: "Desactivar una cuenta",
    caption:
      "Cuando alguien deja el equipo, «Desactivar cuenta…» cierra al momento todas sus sesiones (web, escritorio y API) sin borrar nada: sus datos, su autoría y su auditoría se conservan, y lo que tenga en su equipo se queda allí. Puedes escribir un motivo, que solo ven los administradores, y confirmas escribiendo su correo. Si fuera el único Test Manager activo de un workspace compartido, aquí mismo eliges quién pasa a serlo. No puedes desactivarte a ti ni al último administrador activo.",
    covers: ["dialogs:src/modules/admin/ui/tabs/UsersTab.tsx", "dialogs:src/modules/admin/ui/tabs/DisableAccountDialog.tsx", "action:admin-disable"],
    shot: { element: D },
    run: async () => {
      await rowButton(TEAMMATE.email, "disable").click();
      await expect(dialog()).toBeDisplayed();
      await (await field(U.disableReason, D)).setValue("Baja temporal");
      await (await field(tf("admin.users.disableConfirmLabel", { email: TEAMMATE.email }), D)).setValue(TEAMMATE.email);
      await expect($(D).$(`button=${U.disableConfirm}`)).toBeEnabled();
    },
    after: async () => {
      await clickButton(U.disableConfirm, D);
      await waitForToast(tf("admin.users.disabled", { name: TEAMMATE.alias }));
    },
  });

  step("usuarios-desactivadas", {
    title: "Cuentas desactivadas",
    caption:
      "La lista muestra primero las cuentas activas; «Desactivadas» y «Todas» enseñan las demás. Una cuenta desactivada lleva «Desactivada · fecha»; al pasar el ratón, quién la desactivó y por qué. Si Jorge intenta entrar, Pharos le dice que su cuenta está desactivada.",
    focus: '[data-testid="users-status"]',
    run: async () => {
      await byTestId("users-status").$(`button*=${U.status.disabled}`).click();
      await expect(userRow(TEAMMATE.email)).toBeDisplayed();
      await expect(rowButton(TEAMMATE.email, "enable")).toBeDisplayed();
      await browser.action("pointer").move({ origin: "viewport", x: 700, y: 40 }).perform();
    },
  });

  step("usuario-reactivar", {
    title: "Reactivar una cuenta",
    caption:
      "«Reactivar cuenta» pide confirmación y la devuelve: Jorge vuelve a entrar con su contraseña y conserva sus roles; sus sesiones anteriores no vuelven. Con esto termina la parte del administrador: la app vuelve a la sesión de Liomar.",
    covers: ["dialogs:src/modules/admin/ui/tabs/UsersTab.tsx", "action:admin-enable"],
    shot: false,
    run: async () => {
      await rowButton(TEAMMATE.email, "enable").click();
      await clickButton(U.enableConfirm, '[role="alertdialog"], [role="dialog"]');
      await waitForToast(tf("admin.users.enabled", { name: TEAMMATE.alias }));
      await signInAs("liomar");
    },
  });
});
