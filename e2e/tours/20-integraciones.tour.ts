// Chapter 20 — Integraciones (INT-02, INT-03; ADR-0052): what a Test Manager
// sets up so CI and other tools talk to Pharos. A shared workspace and its
// project, project tokens (create, the secret once, revoke), webhooks (create,
// the secret once, a test delivery and «Entregas») and personal tokens in
// «Mi perfil». Example: Liomar opens «Equipo QA» for his team, shares
// «Pharos» into it and gives its CI a token (TEAM in data/pharos.ts).
//
// «Conectar CI» and «Usar en el CLI» are track L's UI (L6b, INT-04); their
// steps and texts come from L's notes.
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import { acceptConfirm, byTestId, chooseOption, clickButton, es, menuItem, openAdminTab, tf, waitForText, waitForToast } from "./helpers";
import { TEAM } from "./data/pharos";

const I = es.integrations;
const WS = TEAM.workspace;
// The personal workspace, as the server names it.
const PERSONAL = "Personal";
/** The project the chapter shares: «Pharos», with everything the earlier
 *  chapters made (its keys do not change). */
const PROJECT = TEAM.sharedProject;
const TOKEN_NAME = `CI de ${PROJECT}`;
const HOOK_URL = "https://ci.ejemplo.test/pharos";
const D = '[role="dialog"]';
const CONFIRM = '[role="alertdialog"]';

async function syncNow() {
  await openAdminTab("sync");
  await clickButton(es.admin.sync.now, "#admin-panel");
  await waitForToast(es.sync.doneToast.split("{{")[0], 30_000);
}

/** Picks a workspace in the switcher once it lists it (the list catches up
 *  with the server after a create). */
async function switchWorkspace(name: string) {
  await browser.waitUntil(
    async () => {
      if ((await byTestId("workspace-switcher").getAttribute("title"))?.startsWith(name)) return true;
      await byTestId("workspace-switcher").click();
      const item = $(`[role="menuitem"]*=${name}`);
      if (await item.isExisting()) {
        await item.click();
      } else {
        await browser.keys("Escape");
      }
      return false;
    },
    { timeout: 30_000, interval: 1_000, timeoutMsg: `the switcher never offered «${name}»` },
  );
}

async function openIntegrations() {
  await byTestId("workspace-switcher").click();
  await byTestId("workspace-members").click();
  await clickButton(es.workspaces.tabs.integrations);
  await expect(byTestId("project-tokens")).toBeDisplayed();
}

/** Ticks a checkbox, never unticks it (some are ticked by default). */
async function check(testId: string) {
  if (!(await byTestId(testId).isSelected())) await byTestId(testId).click();
  await expect(byTestId(testId)).toBeSelected();
}

/** The created-once dialog: tick «Lo he guardado» and close it. */
async function closeSecret() {
  await byTestId("token-saved").click();
  await byTestId("token-done").click();
  await $(D).waitForExist({ reverse: true });
}

chapter("integraciones", () => {
  step("workspace-equipo", {
    title: "Un workspace para el equipo",
    caption:
      "Los tokens de CI y los webhooks pertenecen a un workspace compartido: el espacio que comparte un equipo en el servidor. Se crea desde el selector de workspace, arriba en el menú lateral, con «Crear workspace». Quien lo crea es su Test Manager. En este ejemplo, Liomar crea «Equipo QA» para su equipo.",
    covers: ["dialogs:src/modules/workspaces/ui/CreateWorkspaceDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await byTestId("workspace-switcher").click();
      await byTestId("workspace-create").click();
      await $(`${D} input`).setValue(WS);
    },
    after: async () => {
      await clickButton(es.workspaces.create.submit, D);
      await waitForToast(es.workspaces.create.created.split("{{")[0]);
      // The desktop lists the workspaces its last sync brought.
      await syncNow();
    },
  });

  step("compartir-proyecto", {
    title: "Llevar un proyecto al workspace",
    caption:
      "Un proyecto nuevo nace en tu workspace personal. Para que el equipo lo vea, y para darle un token de CI, se lleva al workspace compartido: en «Proyectos», el menú «⋯» de su fila › «Compartir con un workspace…». Se mueve entero (plan, casos, requisitos, ciclos, ejecuciones, defectos, adjuntos y su auditoría) y sus claves no cambian. Hace falta conexión con el servidor y ser Test Manager del destino. En este ejemplo, Liomar crea «Pagos Web» y lo lleva a «Equipo QA».",
    covers: ["dialogs:src/modules/workspaces/ui/ShareProjectDialog.tsx"],
    shot: { element: D },
    run: async () => {
      // The server moves it, so it must have it first.
      await syncNow();
      await switchWorkspace(PERSONAL);
      await byTestId("nav-projects").click();
      const rowMenu = $(`button[aria-label="${tf("projects.list.rowMenu", { name: PROJECT })}"]`);
      await rowMenu.waitForClickable({ timeout: 20_000 });
      await rowMenu.click();
      await menuItem(es.workspaces.share.action).click();
      await chooseOption(byTestId("share-destination"), { text: WS });
    },
    after: async () => {
      await byTestId("share-submit").click();
      await waitForToast(es.workspaces.share.done.split("{{")[0]);
    },
  });

  step("elegir-workspace", {
    title: "Trabajar en el workspace del equipo",
    caption:
      "El selector de workspace cambia entre tu espacio personal y los compartidos. Liomar elige «Equipo QA»: Pharos muestra sus proyectos, y lo que crea a partir de ahí lo ven sus miembros.",
    covers: [],
    shot: false,
    run: async () => {
      await switchWorkspace(WS);
    },
  });

  step("integraciones", {
    title: "La pestaña «Integraciones»",
    caption:
      "En el selector de workspace, «Miembros y roles» abre la página del workspace, con dos pestañas: «Miembros» e «Integraciones». «Integraciones» reúne los tokens de proyecto y los webhooks. Solo existe en un workspace compartido y necesita el servidor. Cualquier miembro la ve; solo un Test Manager crea, revoca o reasigna.",
    covers: ["tabs:src/modules/workspaces/ui/WorkspaceMembersPage.tsx"],
    focus: '[role="tablist"]',
    run: async () => {
      await openIntegrations();
      await expect(byTestId("webhooks")).toBeDisplayed();
    },
  });

  step("nuevo-token", {
    title: "Nuevo token de proyecto",
    caption:
      "«Nuevo token…» abre el formulario: un nombre que diga dónde se usa («CI de Pagos Web»), el proyecto, los permisos (scopes) y la caducidad, entre 30 días y un año (90 por defecto). El token actúa en nombre de quien lo crea y nunca puede más que su rol: si ese rol cambia, el token cambia con él. Para un CI que sube resultados basta «Subir resultados y cerrar runs».",
    covers: ["dialogs:src/modules/integrations/ui/TokenDialogs.tsx"],
    shot: { element: D },
    run: async () => {
      await byTestId("project-token-new").click();
      await byTestId("token-name").setValue(TOKEN_NAME);
      await chooseOption(byTestId("token-target"), { text: PROJECT });
      await check("token-scope-runs:write");
    },
  });

  step("token-creado", {
    title: "El token, una sola vez",
    caption:
      "Al pulsar «Crear token», Pharos lo muestra una sola vez, con un ejemplo de cómo usarlo en el CI. Cópialo y guárdalo como secreto del CI (por ejemplo, `PHAROS_TOKEN` en GitHub Actions): Pharos solo guarda una huella y no puede volver a enseñarlo. Para cerrar, marca «Lo he guardado en un sitio seguro» y pulsa «Hecho». La guía de la API (docs/api-v1.md) explica cómo subir resultados con él.",
    covers: ["dialogs:src/modules/integrations/ui/TokenDialogs.tsx"],
    shot: { element: D },
    mask: ['[data-testid="token-secret"]'],
    run: async () => {
      await byTestId("token-create").click();
      await expect(byTestId("token-secret")).toBeDisplayed();
    },
    after: closeSecret,
  });

  step("token-rotar", {
    title: "Rotar un token",
    caption:
      "«Rotar» cambia el secreto de un token sin tocar su nombre, su proyecto ni sus permisos. «Rotar ahora» anula el antiguo al momento, si se ha filtrado. «Mantener 24 h» lo deja funcionar un día más, para cambiar el CI sin cortes. El token nuevo, como siempre, se ve una sola vez.",
    covers: ["dialogs:src/modules/integrations/ui/TokenDialogs.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(I.tokens.rotate, '[data-testid="project-tokens"]');
      await expect(byTestId("token-rotate-now")).toBeDisplayed();
    },
    after: async () => {
      await byTestId("token-rotate-now").click();
      await expect(byTestId("token-secret")).toBeDisplayed();
      await closeSecret();
    },
  });

  step("tokens-proyecto", {
    title: "Los tokens del workspace",
    caption:
      "La tabla lista los tokens de proyecto del workspace: nombre, proyecto, permisos, dueño, caducidad, último uso y estado. Siete días antes de caducar, el dueño recibe un aviso. Si el dueño sale del workspace o se desactiva su cuenta, el token deja de funcionar y los Test Manager reciben un aviso: «Reasignar» lo pasa a otro Test Manager sin cambiar el secreto del CI. «Rotar» da un token nuevo (el antiguo puede seguir 24 h, mientras cambias el CI) y «Revocar» lo anula al momento.",
    covers: ["dialogs:src/modules/integrations/ui/ProjectTokensSection.tsx"],
    focus: '[data-testid="project-tokens"]',
    run: async () => {
      await waitForText(TOKEN_NAME);
    },
  });

  step("conectar-ci", {
    title: "Conectar CI: el paso de GitHub Actions",
    caption:
      "«Conectar CI», debajo de los tokens, prepara el paso de GitHub Actions que sube los informes de tus pruebas a este proyecto en cada pull request. Elige el proyecto y marca los informes que genera tu CI: por defecto, JUnit (pruebas), SARIF (análisis estático), k6 (rendimiento) y axe (accesibilidad). El paso se actualiza al momento y ya lleva tu servidor y tu proyecto, pero nunca el token. «Copiar» lo copia. Si el aviso pide cambiar el SHA de la acción, pon el del commit de la versión de Pharos que uses: fijar la acción por SHA impide que alguien la cambie sin que lo sepas.",
    covers: ["section:connect-ci"],
    focus: '[data-testid="connect-ci"]',
    run: async () => {
      await byTestId("connect-ci").scrollIntoView({ block: "start" });
      await chooseOption(byTestId("ci-project"), { text: PROJECT });
      await check("ci-format-ctrf");
      await expect(byTestId("ci-yaml")).toHaveText(expect.stringContaining("ctrf"));
    },
  });

  step("conectar-ci-github", {
    title: "Conectar CI: en GitHub",
    caption:
      "En GitHub, una vez por repositorio, en Settings › Secrets and variables › Actions: crea el secreto PHAROS_TOKEN con un token de proyecto (el de la sección de arriba, que solo se ve al crearlo; si no eres Test Manager, la sección te dice que se lo pidas a uno) y la variable PHAROS_URL con la dirección de este servidor, que tiene su propio botón «Copiar». Después pega el paso al final del job de tus pruebas, ajusta las rutas de los informes y abre un PR: la página del job enseña una tabla con lo subido y el run aparece en Pharos, en «Ejecuciones» (capítulo 10). En un PR desde un fork no hay secretos: no se sube nada y el job no falla.",
    covers: [],
    focus: '[data-testid="ci-url"]',
    run: async () => {
      await byTestId("ci-url").scrollIntoView({ block: "center" });
      await expect(byTestId("ci-url")).toHaveText(expect.stringContaining("http"));
    },
  });

  step("webhook-nuevo", {
    title: "Nuevo webhook",
    caption:
      "Un webhook avisa a otra herramienta (Slack, un bot de PRs, Jenkins) cuando pasa algo en el workspace: se crea un run, se suben resultados, se cierra un ciclo, cambia un defecto o se decide una revisión. «Nuevo webhook…» pide un nombre, la URL de destino (https y fuera de la red privada, salvo que el servidor lo permita), los eventos y, si quieres, un proyecto. Pharos firma cada envío para que el destino compruebe que viene de tu servidor.",
    covers: ["dialogs:src/modules/integrations/ui/WebhooksSection.tsx"],
    shot: { element: D },
    run: async () => {
      await byTestId("webhook-new").click();
      await byTestId("webhook-name").setValue("Avisos al CI");
      await byTestId("webhook-url").setValue(HOOK_URL);
      await check("webhook-event-run.completed");
    },
  });

  step("webhook-secreto", {
    title: "El secreto de firma, una sola vez",
    caption:
      "Al guardar, Pharos enseña el secreto de firma (`whsec_…`) una sola vez. El destino lo usa para comprobar la firma de cada envío; la guía de la API trae el código para hacerlo en Node y en Python. Si se pierde, «Rotar secreto» da otro y el anterior sigue firmando 24 h.",
    covers: ["dialogs:src/modules/integrations/ui/WebhooksSection.tsx"],
    shot: { element: D },
    mask: ['[data-testid="webhook-secret"]'],
    run: async () => {
      await byTestId("webhook-save").click();
      await expect(byTestId("webhook-secret")).toBeDisplayed();
    },
    after: async () => {
      await byTestId("webhook-saved").click();
      await byTestId("webhook-secret-done").click();
      await $(D).waitForExist({ reverse: true });
    },
  });

  step("webhook-entregas", {
    title: "Probar un webhook y ver sus entregas",
    caption:
      "«Enviar prueba» manda un evento `ping` al destino. «Entregas» lista los envíos de los últimos 30 días con su estado, el intento, la respuesta del destino y cuándo será el siguiente. En este ejemplo el destino no existe, así que la entrega falla: Pharos la reintenta durante unas 22 horas y, tras 50 fallos seguidos, desactiva el webhook y avisa a los Test Manager. «Reintentar ahora» la envía de nuevo al momento.",
    covers: ["dialogs:src/modules/integrations/ui/WebhooksSection.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(I.webhooks.test);
      await waitForToast(I.webhooks.testQueued);
      await clickButton(I.webhooks.deliveries);
      await expect($(D)).toBeDisplayed();
      // The dispatcher tries every 2 s; the target never resolves.
      await browser.waitUntil(async () => (await $$(`${D} .int-dl li`).length) > 0, {
        timeout: 20_000,
        timeoutMsg: "no delivery listed",
      });
    },
    after: async () => {
      await browser.keys("Escape");
      await $(D).waitForExist({ reverse: true });
    },
  });

  step("webhook-rotar", {
    title: "Rotar el secreto de un webhook",
    caption:
      "«Rotar secreto» da un secreto de firma nuevo, que se ve una sola vez. Durante 24 h Pharos firma cada envío con los dos, el nuevo y el anterior, para que cambies el destino sin perder avisos.",
    covers: ["dialogs:src/modules/integrations/ui/WebhooksSection.tsx"],
    shot: { element: CONFIRM },
    run: async () => {
      await clickButton(I.webhooks.rotate, '[data-testid="webhooks"]');
      await expect($(CONFIRM)).toBeDisplayed();
    },
    after: async () => {
      await acceptConfirm();
      await expect(byTestId("webhook-secret")).toBeDisplayed();
      await byTestId("webhook-saved").click();
      await byTestId("webhook-secret-done").click();
      await $(D).waitForExist({ reverse: true });
    },
  });

  step("webhook-borrar", {
    title: "Borrar un webhook",
    caption:
      "«Borrar» quita el webhook y deja de enviar sus avisos; Pharos pregunta antes. Un webhook que falla 50 veces seguidas no se borra: se desactiva solo, y «Activar» lo enciende otra vez cuando el destino vuelve a responder.",
    covers: ["dialogs:src/modules/integrations/ui/WebhooksSection.tsx"],
    shot: { element: CONFIRM },
    run: async () => {
      await clickButton(I.webhooks.delete, '[data-testid="webhooks"]');
      await expect($(CONFIRM)).toBeDisplayed();
    },
    after: async () => {
      await acceptConfirm();
      await waitForToast(I.webhooks.deleted.split("{{")[0].trim() || "borrado");
    },
  });

  step("tokens-personales", {
    title: "Tokens personales",
    caption:
      "Para tu propia línea de comandos (el CLI `pharos`) usa un token personal: en «Mi perfil», «Tokens personales» › «Nuevo token…». Puede servir para todos tus workspaces o solo para uno, con los permisos y la caducidad que elijas, y también se ve una sola vez. Como los de proyecto, actúa en tu nombre y avisa 7 días antes de caducar. Debajo, «Usar en el CLI» da el comando `pharos login --server <este servidor>`, que pide el token y lo guarda en el Administrador de credenciales de Windows: el token nunca va escrito en el comando. «Revocar» lo anula; el administrador del servidor puede revocar todos los de una cuenta si se filtran.",
    covers: ["dialogs:src/modules/integrations/ui/PersonalTokensSection.tsx"],
    focus: '[data-testid="personal-tokens"]',
    run: async () => {
      await byTestId("user-menu-trigger").click();
      await $(`[role="menuitem"]*=${es.shell.myProfile}`).click();
      await byTestId("personal-token-new").click();
      await byTestId("token-name").setValue("Mi CLI");
      await check("token-scope-runs:read");
      await byTestId("token-create").click();
      await expect(byTestId("token-secret")).toBeDisplayed();
      await closeSecret();
      await waitForText("Mi CLI");
      await expect(byTestId("use-in-cli")).toBeDisplayed();
    },
    after: async () => {
      await clickButton(I.tokens.revoke, '[data-testid="personal-tokens"]');
      await acceptConfirm();
      await waitForToast(I.tokens.revoked.split("{{")[0]);
    },
  });
});
