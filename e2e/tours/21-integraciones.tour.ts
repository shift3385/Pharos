// Chapter 21 — Integraciones (INT-02, INT-03; ADR-0052): what a Test Manager
// sets up so CI and other tools talk to Pharos: project tokens (create, the
// secret once, rotate, reassign, revoke), «Conectar CI», webhooks (create, the
// secret once, a test delivery and «Entregas») and personal tokens in «Mi
// perfil». Example: the «Pharos» that chapter 20 shares into «Equipo QA»
// (prerequisites `equipo-qa` and `jorge-en-equipo`; chapter 20 runs first)
// gets the token «CI de Pharos» (TEAM in data/pharos.ts).
//
// «Conectar CI» and «Usar en el CLI» are track L's UI (L6b, INT-04); their
// steps and texts come from L's notes.
import { $, $$, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import { acceptConfirm, byTestId, chooseOption, clickButton, es, scrollToTop, switchWorkspace, waitForText, waitForToast } from "./helpers";
import { TEAM } from "./data/pharos";
import { jorgeCreatesProjectToken } from "./people";

const I = es.integrations;
const WS = TEAM.workspace;
/** The project the chapter shares: «Pharos», with everything the earlier
 *  chapters made (its keys do not change). */
const PROJECT = TEAM.sharedProject;
const TOKEN_NAME = `CI de ${PROJECT}`;
const HOOK_URL = "https://ci.ejemplo.test/pharos";
const D = '[role="dialog"]';
const CONFIRM = '[role="alertdialog"]';

async function openIntegrations() {
  await switchWorkspace(WS);
  await byTestId("workspace-switcher").click();
  await byTestId("workspace-members").click();
  await clickButton(es.workspaces.tabs.integrations);
  await expect(byTestId("project-tokens")).toBeDisplayed();
}

/** The YAML block scrolled back to its first column (a click inside it can
 *  leave it scrolled sideways). */
async function resetYaml() {
  await browser.execute(() => {
    const pre = document.querySelector('[data-testid="ci-yaml"]');
    if (pre) pre.scrollLeft = 0;
  });
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
  step("integraciones", {
    title: "La pestaña «Integraciones»",
    caption:
      "Los tokens de CI y los webhooks pertenecen a un workspace compartido (capítulo 20). En el selector de workspace, con «Equipo QA» elegido, «Miembros y roles» abre la página del workspace, con dos pestañas: «Miembros» e «Integraciones». «Integraciones» reúne los tokens de proyecto, «Conectar CI» y los webhooks. Solo existe en un workspace compartido y necesita el servidor. Cualquier miembro la ve; solo un Test Manager crea, rota, revoca o reasigna.",
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
      "«Nuevo token…» abre el formulario: un nombre que diga dónde se usa (en este ejemplo, «CI de Pharos»), el proyecto, los permisos (scopes) y la caducidad, entre 30 días y un año (90 por defecto). El token actúa en nombre de quien lo crea y nunca puede más que su rol: si ese rol cambia, el token cambia con él. Para un CI que sube resultados basta «Subir resultados y cerrar ejecuciones».",
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
      "Al pulsar «Crear token», Pharos lo muestra una sola vez, con un ejemplo de cómo usarlo en el CI. Cópialo y guárdalo como secreto del CI (por ejemplo, `PHAROS_TOKEN` en GitHub Actions): Pharos solo guarda una huella y no puede volver a enseñarlo. Para cerrar, marca «Lo he guardado en un sitio seguro» y pulsa «Hecho». La guía de la API explica cómo subir resultados con él (véase el final del capítulo).",
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
      "«Rotar» cambia el secreto de un token sin tocar su nombre, su proyecto ni sus permisos. «Rotar ahora» anula el antiguo al momento, si se ha filtrado. «Mantener el anterior 24 h» lo deja funcionar un día más, para cambiar el CI sin cortes. El token nuevo, como siempre, se ve una sola vez.",
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
      "La tabla lista los tokens de proyecto del workspace: nombre, proyecto, permisos, dueño, caducidad, último uso y estado. Siete días antes de caducar, el dueño recibe un aviso. Si el dueño sale del workspace o se desactiva su cuenta, el token deja de funcionar y los Test Manager reciben un aviso: «Reasignar a mí» lo pasa al Test Manager que lo pulsa, sin cambiar el secreto del CI (paso siguiente). «Rotar» da un token nuevo (el antiguo puede seguir 24 h, mientras cambias el CI) y «Revocar» lo anula al momento. Aquí se ven los tokens de Liomar y el «CI nocturno de Pharos» que Jorge creó desde su equipo.",
    covers: ["dialogs:src/modules/integrations/ui/ProjectTokensSection.tsx"],
    focus: '[data-testid="project-tokens"]',
    run: async () => {
      // Jorge, from his computer: a project token for the nightly CI.
      await jorgeCreatesProjectToken(TEAM.jorgeToken, PROJECT, WS);
      await openIntegrations();
      await waitForText(TOKEN_NAME);
      await waitForText(TEAM.jorgeToken);
    },
  });

  step("token-reasignar", {
    title: "Reasignar un token de otra persona",
    caption:
      "Jorge, el otro Test Manager del workspace, creó desde su equipo el token «CI nocturno de Pharos» para el CI de cada noche. Un token actúa con los permisos de su dueño; si Jorge sale del workspace o se desactiva su cuenta, deja de funcionar y los Test Manager reciben un aviso. «Reasignar a mí» lo pasa a quien lo pulsa, después de confirmar: el secreto no cambia, así que el CI sigue funcionando sin tocar nada.",
    covers: ["dialogs:src/modules/integrations/ui/ProjectTokensSection.tsx"],
    shot: { element: CONFIRM },
    run: async () => {
      await waitForText(TEAM.jorgeToken);
      const row = $(`//tr[td[1][contains(normalize-space(.), ${JSON.stringify(TEAM.jorgeToken)})]]`);
      await row.$(`button=${I.tokens.reassignToMe}`).click();
      await expect($(CONFIRM)).toBeDisplayed();
    },
    after: async () => {
      await acceptConfirm();
      await waitForToast(I.tokens.reassigned.split("{{")[0] || "ahora es tuyo");
    },
  });

  step("conectar-ci", {
    title: "Conectar CI: el paso de GitHub Actions",
    caption:
      "«Conectar CI», debajo de los tokens, prepara el paso de GitHub Actions que sube los informes de tus pruebas a este proyecto en cada pull request. Elige el proyecto y marca los informes que genera tu CI: por defecto, JUnit (pruebas), SARIF (análisis estático), k6 (rendimiento) y axe (accesibilidad). El paso se actualiza al momento y ya lleva tu servidor y tu proyecto, pero nunca el token. Una línea larga sigue en la línea de abajo, con sangría, para que se lea entera; «Copiar» copia el YAML exacto, sin esos saltos. Si el aviso pide cambiar el SHA de la acción, pon el del commit de la versión de Pharos que uses: fijar la acción por SHA impide que alguien la cambie sin que lo sepas.",
    covers: ["section:connect-ci"],
    focus: ['[data-testid="ci-project"]', '[data-testid="ci-yaml"]'],
    mask: ['[data-testid="ci-url"]'],
    run: async () => {
      await chooseOption(byTestId("ci-project"), { text: PROJECT });
      await check("ci-format-ctrf");
      await expect(byTestId("ci-yaml")).toHaveText(expect.stringContaining("ctrf"));
      await resetYaml();
      // The card from its top, just below the top bar (after the clicks,
      // which scroll the page to each control).
      await scrollToTop('[data-testid="connect-ci"]');
    },
  });

  step("conectar-ci-github", {
    title: "Conectar CI: en GitHub",
    caption:
      "En GitHub, una vez por repositorio, en Settings › Secrets and variables › Actions: crea el secreto PHAROS_TOKEN con un token de proyecto (el de la sección de arriba, que solo se ve al crearlo; si no eres Test Manager, la sección te dice que se lo pidas a uno) y la variable PHAROS_URL con la dirección del servidor de tu equipo, la que muestra la sección con su propio botón «Copiar» (en las capturas va difuminada: es la del servidor de pruebas de este manual, que un CI no alcanzaría). Después pega el paso al final del job de tus pruebas, ajusta las rutas de los informes y abre un PR: la página del job enseña una tabla con lo subido y el run aparece en Pharos, en «Ejecuciones» (capítulo 10). En un PR desde un fork no hay secretos: no se sube nada y el job no falla.",
    covers: [],
    // The GitHub instructions alone: the page cannot scroll past the card,
    // so a page shot would repeat the step before.
    shot: { element: "ol.int-ci__steps" },
    focus: '[data-testid="ci-url"]',
    mask: ['[data-testid="ci-url"]'],
    run: async () => {
      await byTestId("ci-url").scrollIntoView({ block: "center" });
      await expect(byTestId("ci-url")).toHaveText(expect.stringContaining("http"));
      await resetYaml();
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
      // The dispatcher tries every 2 s and the target never resolves. The
      // list is read when «Entregas» opens, so reopen it until the first
      // attempt has failed (not «Pendiente · intento 0»).
      await browser.waitUntil(
        async () => {
          if (await $(D).isExisting()) {
            await browser.keys("Escape");
            await $(D).waitForExist({ reverse: true });
          }
          await clickButton(I.webhooks.deliveries);
          await expect($(D)).toBeDisplayed();
          await browser.pause(500);
          if ((await $$(`${D} .int-dl li`).length) === 0) return false;
          return (await byTestId("delivery-detail").getText()).includes(I.webhooks.statuses.failed);
        },
        { timeout: 60_000, interval: 2_000, timeoutMsg: "the test delivery never showed a failed attempt" },
      );
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
      "Para tu propia línea de comandos (el CLI `pharos`) usa un token personal: en «Mi perfil», «Tokens personales» › «Nuevo token personal…». Puede servir para todos tus workspaces o solo para uno, con los permisos y la caducidad que elijas, y también se ve una sola vez. Como los de proyecto, actúa en tu nombre y avisa 7 días antes de caducar. Debajo, «Usar en el CLI» da el comando `pharos login --server <este servidor>`, con la dirección del servidor de tu equipo (en las capturas, difuminada: es la del servidor de pruebas de este manual), que pide el token y lo guarda en el Administrador de credenciales de Windows: el token nunca va escrito en el comando. «Revocar» lo anula; el administrador del servidor puede revocar todos los de una cuenta si se filtran.",
    covers: ["dialogs:src/modules/integrations/ui/PersonalTokensSection.tsx"],
    focus: '[data-testid="personal-tokens"]',
    mask: ['[data-testid="use-in-cli"] pre.int-snippet'],
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
      await byTestId("personal-tokens").scrollIntoView({ block: "start" });
    },
    after: async () => {
      await clickButton(I.tokens.revoke, '[data-testid="personal-tokens"]');
      await acceptConfirm();
      await waitForToast(I.tokens.revoked.split("{{")[0]);
    },
  });
});
