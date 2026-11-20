// Chapter 21 — Trabajo en equipo (decision D-1, MAN-03, NC-052 amended).
// Liomar creates the shared workspace «Equipo QA», shares «Pharos» into it,
// invites his QA teammate Jorge L. Meneses Yero with a one-time code, turns on
// «Aprobación independiente», sends a case to Jorge's review (Jorge asks for
// changes, then approves), gets the plan approved by a Test Manager who is not
// its author, assigns Jorge a defect, and reads what reached him: the
// notifications and the audit.
//
// Every screen is Liomar's. Jorge acts from his own computer through the tour
// API (people.ts: jorgeAcceptsInvitation, jorgeRequestsChangesOnCase,
// jorgeApprovesCase, jorgeApprovesPlan); he never signs in to this app, and
// the captions say what he did «desde su equipo».
//
// It runs before chapter 20 (manifest.ts), which gives the shared «Pharos» a
// CI token; the manual prints it after. It leaves «Equipo QA» with «Pharos»
// (prerequisite `equipo-qa`) and Jorge as its second Test Manager
// (`jorge-en-equipo`).
import { $, $$, browser, expect } from "@wdio/globals";
import { TEAMMATE } from "../../scripts/manual/persona.mjs";
import { DEFECTS, PROJECT_A, TEAM } from "./data/pharos";
import {
  byTestId,
  chooseOption,
  clickButton,
  dismissConfirm,
  es,
  menuItem,
  openAdminTab,
  openProject,
  openSection,
  pointerAway,
  switchWorkspace,
  tf,
  waitForSettled,
  waitForText,
  waitForToast,
} from "./helpers";
import { jorgeAcceptsInvitation, jorgeApprovesCase, jorgeApprovesPlan, jorgeRequestsChangesOnCase, jorgeRequestsChangesOnPlan } from "./people";
import { chapter, step } from "./tour";
import { syncNow } from "../support";

const W = es.workspaces;
const C = es.testCase;
const P = es.testPlan;
const WS = TEAM.workspace;
const PERSONAL = "Personal";
const JORGE = TEAMMATE.alias;
const CASE = TEAM.reviewCase;
const CASE_TITLE = "Humo de la versión 0.6.0";
const ASSIGNEE = '[data-testid="defect-assignee"]';
const ASSIGNEE_LABEL = `//label[.//span[normalize-space(.)="${es.defects.field.assignee}"]]`;
/** Jorge's row in «Miembros y roles» (by his e-mail), and the invitations. */
const JORGE_ROW = `tr[data-email="${TEAMMATE.email}"]`;
const INVITATIONS = '[aria-labelledby="ws-invitations"]';
const D = '[role="dialog"]';
const ASK = '[role="alertdialog"]';

/** «Sincronizar ahora» from the sidebar, waiting for this sync's toast. */
async function sync() {
  await syncNow();
  await waitForSettled();
}

/** «Miembros y roles» of the current workspace, from the switcher. */
async function openMembers() {
  await byTestId("workspace-switcher").click();
  await byTestId("workspace-members").click();
  await expect($(`h1=${WS}`)).toBeDisplayed();
  await expect($(".ws-table")).toBeDisplayed();
}

/** Opens a case of «Pharos» afresh from the list (what a sync brought shows). */
async function openCase(title: string) {
  await openProject(PROJECT_A.name);
  await openSection("cases");
  await $(`a.cl-title*=${title}`).click();
  await expect($("#tc-title")).toBeDisplayed();
  await expect(byTestId("case-review")).toBeDisplayed();
}

/** The plan of «Pharos» on one of its wizard steps. */
async function openPlanStep(id: keyof typeof P.step) {
  await openProject(PROJECT_A.name);
  await openSection("plan");
  await $("nav.tpw-rail").$(`button*=${P.step[id]}`).click();
  await expect($("h2.tpw__title")).toHaveText(P.step[id]);
}


chapter("equipo", () => {
  step("workspace-equipo", {
    title: "Un workspace para el equipo",
    caption:
      "Tu workspace «Personal» es solo tuyo. Para trabajar con otras personas se crea un workspace compartido, que vive en el servidor: en el selector de workspace, arriba en el menú lateral, «Crear workspace». Quien lo crea es su Test Manager y después invita a los demás. En este ejemplo, Liomar crea «Equipo QA» para trabajar con su compañero de QA, Jorge L. Meneses Yero.",
    covers: ["dialogs:src/modules/workspaces/ui/CreateWorkspaceDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await byTestId("workspace-switcher").click();
      await byTestId("workspace-create").click();
      await $(`${D} input`).setValue(WS);
    },
    after: async () => {
      await clickButton(W.create.submit, D);
      await waitForToast(W.create.created.split("{{")[0]);
      await sync();
    },
  });

  step("compartir-proyecto", {
    title: "Llevar un proyecto al workspace",
    caption:
      "Un proyecto nace en tu workspace personal. Para que el equipo lo vea se lleva al compartido: en «Proyectos», con «Personal» elegido en el selector, el menú «⋯» de su fila › «Compartir con un workspace…». Se mueve entero (plan, casos, requisitos, ciclos, ejecuciones, defectos, adjuntos y su auditoría) y sus claves no cambian. Hace falta conexión con el servidor y ser Test Manager del destino. En este ejemplo, Liomar lleva «Pharos» a «Equipo QA»; «API de sincronización» se queda en su espacio personal.",
    covers: ["dialogs:src/modules/workspaces/ui/ShareProjectDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await switchWorkspace(PERSONAL);
      await byTestId("nav-projects").click();
      const rowMenu = $(`button[aria-label="${tf("projects.list.rowMenu", { name: TEAM.sharedProject })}"]`);
      await rowMenu.waitForClickable({ timeout: 20_000 });
      await rowMenu.click();
      await menuItem(W.share.action).click();
      await chooseOption(byTestId("share-destination"), { text: WS });
    },
    after: async () => {
      await byTestId("share-submit").click();
      await waitForToast(W.share.done.split("{{")[0]);
      // The moved project reaches this device's copy of «Equipo QA» by sync.
      await sync();
    },
  });

  step("selector", {
    title: "Cambiar de workspace",
    caption:
      "El selector de workspace lista tus workspaces con tu rol en cada uno: «Personal» y, ahora, «Equipo QA», donde Liomar es Test Manager. Al elegir uno, «Proyectos» muestra sus proyectos, y lo que creas allí lo ven sus miembros. Debajo están «Crear workspace», «Unirse con un código…» y «Miembros y roles».",
    focus: '[role="menu"]',
    run: async () => {
      await byTestId("workspace-switcher").click();
      await expect($(`[role="menuitem"]*=${WS}`)).toBeDisplayed();
    },
    after: async () => {
      await $(`[role="menuitem"]*=${WS}`).click();
      await switchWorkspace(WS);
    },
  });

  step("miembros-solo", {
    title: "Miembros y roles",
    caption:
      "«Miembros y roles», en el selector, abre la página del workspace, con su nombre por título («Equipo QA»). La pestaña «Miembros» lista a cada persona con su correo, su rol y desde cuándo está; debajo, las «Reglas» del workspace y las invitaciones pendientes. Al pie, «¿Qué puede hacer cada rol?» se despliega con un resumen de los cinco roles: Test Manager, Test Analyst, Automation Engineer, Product Owner y Viewer (solo lectura). Por ahora Liomar es el único miembro.",
    covers: ["route:/workspaces/members"],
    run: async () => {
      await openMembers();
      await expect($(`summary=${W.members.roles}`)).toBeDisplayed();
      // The page from its head: the title, the tabs and «Invitar».
      await pointerAway();
      await browser.execute(() => {
        const content = document.querySelector(".app-shell__content");
        if (content) content.scrollTop = 0;
      });
    },
  });

  step("invitar", {
    title: "Invitar a un compañero",
    caption:
      "«Invitar» crea una invitación de un solo uso: eliges el rol con el que entrará la persona (debajo, qué puede hacer con él), una nota para acordarte de para quién es, que no se envía, y cuándo caduca (1, 7 o 30 días). Liomar invita a Jorge como Test Analyst, el rol más bajo que puede escribir, revisar y aprobar casos.",
    covers: ["dialogs:src/modules/workspaces/ui/InviteDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await byTestId("members-invite").click();
      await expect($(D)).toBeDisplayed();
      await chooseOption(byTestId("invite-role"), { text: W.roles[TEAM.jorgeRole] });
      await $(`${D} input`).setValue(TEAM.inviteNote);
    },
  });

  let code = "";
  step("invitacion-creada", {
    title: "El código, una sola vez",
    caption:
      "«Crear invitación» muestra el código y la dirección del servidor. Pharos no envía correos: «Copiar texto de invitación» copia un mensaje con el workspace, el servidor y el código, para que se lo mandes por el canal que uséis. El código solo se ve ahora (en este manual, difuminado); si se pierde, revoca la invitación y crea otra.",
    covers: ["dialogs:src/modules/workspaces/ui/InviteDialog.tsx"],
    shot: { element: D },
    mask: [".ws-code"],
    run: async () => {
      await byTestId("invite-create").click();
      await $(".ws-code").waitForDisplayed({ timeout: 15_000 });
      code = (await $(".ws-code").getText()).trim();
      expect(code.length).toBeGreaterThan(4);
    },
    after: async () => {
      await clickButton(es.common.close, D);
      await $(D).waitForExist({ reverse: true });
      // Jorge, on his own computer: «Unirse con un código…», «Comprobar», «Unirme».
      await jorgeAcceptsInvitation(code);
    },
  });

  step("unirse", {
    title: "Unirse con un código",
    caption:
      "Así se une quien recibe la invitación: en su Pharos, en el selector de workspace, «Unirse con un código…». Pega el código y pulsa «Comprobar»: Pharos le dice a qué workspace entra, con qué rol y quién le invitó; «Unirme» lo confirma, y los proyectos del workspace llegan a su equipo en la siguiente sincronización. Su workspace «Personal» no cambia. Jorge ya lo ha hecho desde su equipo; aquí se ve la página, vacía, en el Pharos de Liomar.",
    covers: ["route:/workspaces/join"],
    run: async () => {
      await byTestId("workspace-switcher").click();
      await byTestId("workspace-join").click();
      await expect(byTestId("join-code")).toBeDisplayed();
    },
  });

  step("miembros", {
    title: "Jorge, en el equipo",
    caption:
      "De vuelta en «Miembros y roles», Jorge L. Meneses Yero aparece como Test Analyst, con su correo y el día en que se unió. Su invitación ya no figura en «Invitaciones pendientes», que solo lista las que siguen sin usar o han caducado: ahora dice «No hay invitaciones pendientes.». Como Test Manager, Liomar puede cambiar el rol de cada miembro en la columna «Rol» o quitarlo del workspace; el workspace nunca se queda sin un Test Manager.",
    focus: [".ws-table-wrap", INVITATIONS],
    run: async () => {
      await openMembers();
      await $(JORGE_ROW).waitForDisplayed({ timeout: 30_000, timeoutMsg: "Jorge never appeared among the members" });
      await expect(byTestId(`member-role-${TEAMMATE.email}`)).toHaveText(expect.stringContaining(W.roles[TEAM.jorgeRole]));
      await $(INVITATIONS).scrollIntoView({ block: "end" });
      await expect($(INVITATIONS)).toHaveText(expect.stringContaining(W.members.noInvitations));
    },
  });

  step("aprobacion-independiente", {
    title: "Aprobación independiente",
    caption:
      "En la misma página, «Reglas»: un workspace compartido nace con «Aprobación independiente» activada. Un caso lo aprueba un Test Manager o un Test Analyst que no sea su autor, y un plan, un Test Manager que no sea su autor. Solo un Test Manager la cambia, y desactivarla pide confirmación: entonces cualquiera que pueda editar algo puede aprobarlo, también el autor, y queda como «aprobación propia». Las aprobaciones que ya existen no cambian. En el workspace Personal está siempre desactivada, porque allí trabajas solo. Liomar cancela: la regla sigue activada.",
    covers: ["dialogs:src/modules/workspaces/ui/WorkspaceMembersPage.tsx", "action:workspace-rules"],
    shot: { element: ASK },
    run: async () => {
      await byTestId("workspace-rules").scrollIntoView({ block: "center" });
      await expect(byTestId("workspace-independent-approval")).toHaveAttribute("aria-checked", "true");
      await byTestId("workspace-independent-approval").click();
      await expect($(ASK)).toHaveText(expect.stringContaining(W.rules.disableTitle));
    },
    after: async () => {
      await dismissConfirm(W.rules.disableTitle);
      await expect(byTestId("workspace-independent-approval")).toHaveAttribute("aria-checked", "true");
    },
  });

  step("enviar-caso", {
    title: "Enviar un caso a revisión",
    caption: `Liomar abre «${CASE.key} ${CASE_TITLE}», la checklist de humo de la versión, y pulsa «Enviar a revisión» con una nota para quien revise. Como «Pharos» está en un workspace compartido, los demás miembros reciben el aviso de que hay un caso por revisar.`,
    shot: { element: ASK },
    run: async () => {
      await openCase(CASE_TITLE);
      await byTestId("case-send-review").click();
      await expect($(ASK)).toBeDisplayed();
      await $(`${ASK} textarea`).setValue(CASE.sendNote);
    },
    after: async () => {
      await byTestId("case-send-review-confirm").click();
      await waitForToast(tf("testCase.review.toast.send", { key: CASE.key }));
    },
  });

  step("aprobar-propio", {
    title: "Tu propio caso no lo apruebas tú",
    caption:
      "Con la aprobación independiente, el «Aprobar versión N» de Liomar está en gris y explica por qué: «Este workspace pide aprobación independiente: lo tiene que aprobar otra persona.». El caso espera «En revisión» a que lo revise Jorge.",
    focus: ".tc-review",
    run: async () => {
      await expect(byTestId("case-approve")).toBeDisabled();
      await waitForText(C.review.notAllowed.author);
    },
    after: sync,
  });

  step("cambios-pedidos", {
    title: "Jorge pide cambios",
    caption:
      "Jorge revisa el caso desde su equipo y pulsa «Pedir cambios…» con su comentario. Al sincronizar, Liomar ve en el caso el aviso «Cambios pedidos por Jorge L. Meneses Yero», con la fecha y el comentario, y recibe una notificación. El caso sigue en revisión.",
    focus: ".tc-review",
    run: async () => {
      await jorgeRequestsChangesOnCase(PROJECT_A.name, CASE.key, CASE.changes);
      await sync();
      await openCase(CASE_TITLE);
      await expect($(".case-review-returned")).toHaveText(expect.stringContaining(JORGE));
      await expect($(".case-review-returned")).toHaveText(expect.stringContaining(CASE.changes));
    },
  });

  step("cambios-guardados", {
    title: "Hacer los cambios",
    caption:
      "Liomar añade la comprobación que pidió Jorge («+ Añadir paso» en «Comprobaciones») y guarda. El caso sigue «En revisión», y el aviso pasa a «Cambios guardados tras la petición de Jorge L. Meneses Yero», con su comentario; debajo, «Cambios desde el …», con la fecha de la revisión que Jorge vio, enseña la comprobación añadida, para que Jorge sepa qué mirar.",
    focus: ".tc-review",
    run: async () => {
      const group = $(`[role="group"][aria-label="${C.checklist.items}"]`);
      await group.scrollIntoView({ block: "center" });
      const before = (await group.$$('[aria-label^="Paso "]')).length;
      await group.$(`.//button[contains(normalize-space(.),"${C.addStep}")]`).click();
      const item = group.$(`[aria-label="${tf("testCase.stepN", { n: before + 1 })}"]`);
      await item.setValue(CASE.newItem);
      await clickButton(C.save, ".tc-nav");
      await waitForToast(C.savedToast);
      await waitForSettled();
      await expect($(".case-review-changes-made")).toBeDisplayed();
      // The banner and the change under it, clear of the top bar.
      await $(".tc-review").scrollIntoView({ block: "center" });
    },
    after: sync,
  });

  step("caso-aprobado", {
    title: "Jorge aprueba el caso",
    caption:
      "Jorge lo vuelve a revisar desde su equipo y lo aprueba. Tras sincronizar, el caso de Liomar muestra «Aprobado por Jorge L. Meneses Yero», con la fecha y la versión, sin «aprobación propia»: lo aprobó otra persona. Liomar recibe la notificación.",
    focus: ".tc-review",
    run: async () => {
      await jorgeApprovesCase(PROJECT_A.name, CASE.key);
      await sync();
      await openCase(CASE_TITLE);
      await expect($(".case-review-approved")).toHaveText(expect.stringContaining(JORGE));
      await expect($(".case-review-approved")).not.toHaveText(expect.stringContaining(C.review.banner.selfApproved));
    },
  });

  step("plan-en-revision", {
    title: "Quién aprueba el plan",
    caption:
      "El plan de «Pharos» llega al equipo «En revisión», tal como Liomar lo dejó en el capítulo 5 (un borrador se envía con «Enviar a revisión»). En «Estado del plan», el «Aprobar versión N» de Liomar está en gris: lo aprueba un Test Manager que no sea el autor del plan. Jorge, como Test Analyst, puede revisarlo y pedir cambios, pero no aprobarlo.",
    focus: '[data-testid="plan-review"]',
    run: async () => {
      await openPlanStep("roles");
      // A plan that is still a draft (a run of this chapter alone) is sent first.
      if (await byTestId("plan-send-review").isExisting()) {
        await byTestId("plan-send-review").click();
        await $(`${ASK} textarea`).setValue(TEAM.planNote);
        await byTestId("plan-send-review-confirm").click();
        await waitForToast(P.review.toast.send);
      }
      await expect(byTestId("plan-approve")).toBeDisabled();
      await waitForText(P.review.notAllowed.author);
      await pointerAway();
      await browser.execute(() => {
        const content = document.querySelector(".app-shell__content");
        if (content) content.scrollTop = 0;
      });
    },
    after: sync,
  });

  step("plan-pedir-cambios", {
    title: "«Pedir cambios…» en el plan",
    caption:
      "Quien revisa un plan que no está listo pulsa «Pedir cambios…» en «Estado del plan»: el comentario es obligatorio y el plan sigue «En revisión», con un aviso para su autor. Este es el diálogo que Jorge usa en su Pharos; Liomar lo abre aquí solo para verlo y cancela.",
    covers: ["dialogs:src/modules/test-plan/ui/wizard/PlanReviewControls.tsx"],
    shot: { element: ASK },
    run: async () => {
      await byTestId("plan-request-changes").waitForEnabled();
      await byTestId("plan-request-changes").click();
      await expect($(ASK)).toBeDisplayed();
    },
    after: async () => {
      await dismissConfirm();
    },
  });

  step("plan-cambios", {
    title: "Cambios pedidos en el plan",
    caption:
      "Jorge revisa el plan desde su equipo y pide un cambio: que «Roles» diga quién aprueba el plan en el equipo. Al sincronizar, «Estado del plan» de Liomar muestra «Cambios pedidos por Jorge L. Meneses Yero» con su comentario. Liomar añade la fila en «Roles, independencia y formación» y pulsa «Guardar»: el plan sigue «En revisión» y el aviso pasa a «Cambios guardados tras la petición de Jorge L. Meneses Yero».",
    focus: ['[data-testid="plan-review"]', `[role="group"][aria-label="${P.step.roles}"]`],
    run: async () => {
      await jorgeRequestsChangesOnPlan(PROJECT_A.name, TEAM.planChanges);
      await sync();
      await openPlanStep("roles");
      await waitForText(tf("testPlan.review.banner.changesRequested", { name: JORGE, date: "" }).split(" · ")[0]);
      const group = $(`[role="group"][aria-label="${P.step.roles}"]`);
      await group.$(".tp-list-field__add").click();
      const fields = await group.$$("textarea");
      await fields[fields.length - 2].setValue(TEAM.planRole[0]);
      await fields[fields.length - 1].setValue(TEAM.planRole[1]);
      await clickButton(P.save);
      await waitForToast(P.savedToast);
      await waitForSettled();
      await waitForText(tf("testPlan.review.banner.changesMade", { name: JORGE, comment: TEAM.planChanges }));
      await group.scrollIntoView({ block: "center" });
    },
    after: sync,
  });

  step("cambiar-rol", {
    title: "Cambiar el rol de un miembro",
    caption:
      "Para que otra persona pueda aprobar planes, el equipo necesita un segundo Test Manager. En «Miembros y roles», Liomar cambia el rol de Jorge a «Test Manager» en su fila: se aplica al momento y Pharos lo confirma («Rol de Jorge L. Meneses Yero: Test Manager»). Con dos Test Manager, el workspace no se queda sin uno si alguno se va.",
    focus: ".ws-table-wrap",
    toast: true,
    run: async () => {
      await openMembers();
      await chooseOption(byTestId(`member-role-${TEAMMATE.email}`), { text: W.roles[TEAM.jorgeFinalRole] });
      await waitForToast(tf("workspaces.members.roleChanged", { name: JORGE, role: W.roles[TEAM.jorgeFinalRole] }));
    },
  });

  step("plan-aprobado", {
    title: "Otra persona aprueba el plan",
    caption:
      "Jorge, ya Test Manager, aprueba el plan desde su equipo. Tras sincronizar, «Estado del plan» muestra «Aprobado» con su nombre y la fecha, sin «aprobación propia»; el «Historial» y los exportes del plan lo recogen también.",
    focus: '[data-testid="plan-approved-by"]',
    run: async () => {
      await jorgeApprovesPlan(PROJECT_A.name);
      await sync();
      await openPlanStep("roles");
      await expect(byTestId("plan-approved-by")).toHaveText(expect.stringContaining(JORGE));
      await pointerAway();
      await browser.execute(() => {
        const content = document.querySelector(".app-shell__content");
        if (content) content.scrollTop = 0;
      });
    },
  });

  step("asignar", {
    title: "Asignar trabajo a Jorge",
    caption: `En un workspace compartido, «Asignado a» de un defecto elige entre los miembros activos del workspace (o «Sin asignar»). Liomar abre «${DEFECTS[TEAM.assignedDefect].title}» en «Defectos», elige «Jorge L. Meneses Yero» y guarda. Jorge recibe en su Pharos el aviso «Liomar QA te asignó…», con la clave y el título del defecto; en la campana de Liomar no aparece, porque el aviso es para quien recibe el trabajo. Del mismo modo, «Asignar a», al añadir casos a un ciclo, reparte su ejecución.`,
    focus: ASSIGNEE_LABEL,
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("defects");
      await $(`button.df-open*=${DEFECTS[TEAM.assignedDefect].title}`).click();
      await expect($(".tp-editor__save")).toBeDisplayed();
      await chooseOption($(ASSIGNEE), { text: JORGE });
      await $(".tp-editor__save").click();
      await waitForToast(es.defects.savedToast);
      await waitForSettled();
      // Saving goes back to the list: open it again to show the field saved.
      if (!(await $(".tp-editor__save").isExisting())) await $(`button.df-open*=${DEFECTS[TEAM.assignedDefect].title}`).click();
      await $(ASSIGNEE).scrollIntoView({ block: "center" });
      await expect($(ASSIGNEE)).toHaveText(expect.stringContaining(JORGE));
    },
    after: sync,
  });

  step("notificaciones", {
    title: "Lo que te llega del equipo",
    caption:
      "La campana de la barra superior reúne lo que el equipo hizo y te concierne, agrupado por día: aquí, entre otros avisos, que Jorge L. Meneses Yero se unió a «Equipo QA», que devolvió el caso con cambios y que lo aprobó. Cada aviso lleva su acción directa («Ver miembros», «Abrir caso»…). «Marcar todo como leído» los da por vistos; se guardan 90 días.",
    focus: '[data-testid="notifications-panel"]',
    run: async () => {
      // The bell pulls from the server after every sync.
      await $(".topbar__icon-btn--bell").click();
      await expect(byTestId("notifications-panel")).toBeDisplayed();
      await browser.waitUntil(
        async () => {
          const text = await byTestId("notifications-panel").getText();
          return text.includes(JORGE) && text.includes(CASE.key);
        },
        { timeout: 30_000, timeoutMsg: "Jorge's notifications never reached Liomar" },
      );
    },
    after: async () => {
      await browser.keys("Escape");
    },
  });

  step("auditoria", {
    title: "La auditoría del equipo",
    caption: `En «Administración › Auditoría», el Test Manager de un workspace compartido ve también lo que hicieron los demás miembros, con su nombre. Liomar busca «${CASE.key}»: cada paso de la revisión del caso sale por su nombre, «Enviado a revisión» (Liomar), «Cambios pedidos» y «Aprobado» (Jorge L. Meneses Yero), con los campos que cambió («Aprobación, Revisión, Estado»).`,
    focus: ['[data-testid="audit-search"]', '(//*[starts-with(@data-testid,"audit-row-")])[position()<=4]'],
    run: async () => {
      await openAdminTab("audit");
      await byTestId("audit-search").setValue(CASE.key);
      const A = es.admin.audit.reviewEvents;
      await browser.waitUntil(
        async () => {
          const text = await byTestId("audit-tab").getText();
          return text.includes(JORGE) && text.includes(A.sent) && text.includes(A.changesRequested) && text.includes(A.approved);
        },
        { timeout: 20_000, timeoutMsg: "the audit does not show Jorge's review of the case" },
      );
      // The case's own rows in view (the search also lists other elements).
      // The search applies after a pause: every row is the case's.
      // The search applies after a 300 ms pause and then reloads the list
      // (the URL gets `q=`; the list is busy while it loads). Settled when
      // the list, not busy, stays the same over three polls. The search also
      // matches other elements that mention the case (the run of chapter 11
      // that included it), so not every row is the case's: the newest are.
      let last = "";
      let same = 0;
      await browser.waitUntil(
        async () => {
          const q = decodeURIComponent(/[?&]q=([^&#]*)/.exec(await browser.getUrl())?.[1] ?? "");
          const busy = await $('[data-testid="audit-tab"] [aria-busy="true"]').isExisting();
          const rows = await $$('[data-testid^="audit-row-"]');
          const now = `${q}|${rows.length}|${rows.length ? await rows[0].getText() : ""}`;
          same = !busy && q === CASE.key && now === last ? same + 1 : 0;
          last = now;
          return same >= 2;
        },
        { timeout: 20_000, interval: 400, timeoutMsg: "the audit search never settled" },
      );
      // The newest row is Jorge's approval of the case.
      await expect($('[data-testid^="audit-row-"]')).toHaveText(expect.stringContaining(CASE.key));
      // From the top: the search box and the steps of the review.
      await browser.execute(() => {
        const content = document.querySelector(".app-shell__content");
        if (content) content.scrollTop = 0;
      });
    },
  });

  step("quitar-miembro", {
    title: "Quitar a alguien del workspace",
    caption:
      "«Quitar», en la fila de un miembro, pide confirmación: la persona deja de ver el workspace y la copia de sus proyectos en sus equipos se borra en su próxima sincronización, y lo que no haya sincronizado se pierde; su cuenta sigue existiendo. Quien no es Test Manager solo ve «Salir» en su propia fila. Aquí Liomar cancela: Jorge sigue en el equipo.",
    covers: ["dialogs:src/modules/workspaces/ui/WorkspaceMembersPage.tsx"],
    shot: { element: ASK },
    run: async () => {
      await openMembers();
      await byTestId(`member-remove-${TEAMMATE.email}`).click();
      await expect($(ASK)).toBeDisplayed();
    },
    after: async () => {
      await dismissConfirm();
    },
  });
});
