// Chapter 1 — Acceso y cuenta (manual v2, MAN-03): the sign-in screen, its
// server line and its errors, creating an account with its recovery codes,
// the sign-in screen on a phone, account recovery, signing in and out, the
// user menu and the profile (account security, preferences). The example: Liomar Rodríguez, QA lead
// of Pharos, creates his own account here and tests Pharos itself with it in
// every chapter (NC-052: the one person and account of the manual).
import { $, browser, expect } from "@wdio/globals";
import { email, signOut, userMenuTrigger } from "../support";
import { PERSONA } from "../../scripts/manual/persona.mjs";
import { DESKTOP, MOBILE, chapter, setViewport, step } from "./tour";
import { button, byTestId, clearInput, dialog, es, scrollToTop, waitForText } from "./helpers";

/** The tour account (run-tours passes its e-mail and password). Liomar types
 *  his surname without its accent when he registers and corrects it in his
 *  profile: the profile step shows a real fix, never another person. */
const TOUR_PASSWORD = process.env.TEST_USER_PASSWORD ?? "supersecret1";
const TYPED_LAST = "Rodriguez";
/** Shown in clear in the manual on purpose: an example, not a real password. */
const EXAMPLE_PASSWORD = "Ejemplo-2026";
/** The tour account's person in the manual (docs: datos de ejemplo). */
export const LEAD = { alias: PERSONA.alias, first: PERSONA.first, last: PERSONA.last };
const REVEAL = `button[aria-label="${es.auth.showPassword}"]`;
const USER_MENU = '[data-testid="user-menu-trigger"]';
const SAVED_CHECK = `label=${es.recoveryCodes.saved}`;

/** The sidebar says «Sincronizado» (no «Sincronizando…» in the capture). */
const syncIdle = () =>
  browser.waitUntil(async () => (await $(".sidebar .sync").getText()).includes(es.sync.synced), {
    timeout: 20_000,
    timeoutMsg: "the sync never went idle",
  });

chapter("acceso", () => {
  step("pantalla-entrada", {
    title: "La pantalla de entrada",
    caption:
      "Al abrir Pharos sin una sesión iniciada aparece «Iniciar sesión». A la izquierda está el formulario: tu correo electrónico, tu contraseña y el botón «Entrar»; bajo el título, el enlace «Regístrate» por si aún no tienes cuenta. «Continuar con Google» ya se ve, pero todavía no funciona («Próximamente»). A la derecha, un resumen de lo que ofrece Pharos. Al pie, la versión instalada: dila siempre si informas de un fallo.",
    covers: ["screen:login", "action:login-google"],
    run: async () => {
      if (await userMenuTrigger().isExisting()) await signOut();
      await expect(button(es.auth.login)).toBeDisplayed();
      // «Continuar con Google» is shown but disabled («Próximamente»).
      await expect(byTestId("login-google")).toBeDisabled();
      // React-controlled fields: clearValue fires no input event.
      await clearInput("#email");
      await clearInput("#password");
      await expect($("#password")).toHaveValue("");
    },
  });

  step("servidor", {
    title: "El servidor al que te conectas",
    caption:
      "Encima del correo, la línea «Servidor» dice adónde van tu correo y tu contraseña; si trabajas solo en tu equipo, «Este equipo» y la dirección de tu servidor local. «Cambiar» abre «Servidor», donde escribes la dirección https:// que te dé quien administra Pharos y pulsas «Conectar»: Pharos comprueba el servidor antes de quedarse con él. Si ya entraste en otros, «Usados en este equipo» los lista para elegirlos con un clic. «Cancelar» o Esc vuelven sin cambiar nada. En la versión web no aparece: su servidor es el que la sirve.",
    covers: ["screen:server-line", "dialogs:src/modules/server-picker/ui/ServerPanel.tsx"],
    focus: '[data-testid="server-panel"]',
    run: async () => {
      await expect(byTestId("server-line")).toBeDisplayed();
      await byTestId("server-change").click();
      await expect(byTestId("server-panel")).toBeDisplayed();
      await expect($("#server-address")).toBeDisplayed();
    },
    after: async () => {
      await button(es.server.panel.cancel).click();
      await expect(byTestId("server-panel")).not.toBeExisting();
      await expect(byTestId("server-line")).toBeDisplayed();
    },
  });

  step("idioma-entrada", {
    title: "Elegir el idioma antes de entrar",
    caption:
      "El selector de idioma, en la esquina inferior izquierda (muestra el idioma actual, «Español»), despliega los idiomas disponibles: español e inglés. Muévete por la lista con las flechas y elige con Intro, o haz clic. Toda la interfaz cambia al momento, también esta pantalla, y Pharos lo recuerda en este equipo; una vez dentro, el idioma viaja con tu cuenta a tus otros equipos. Después se cambia desde el menú de usuario o desde «Mi perfil».",
    covers: ["action:login-language"],
    focus: ['[data-testid="login-language"]', '[role="menu"]'],
    run: async () => {
      await byTestId("login-language").click();
      await expect($('[role="menu"], [role="listbox"]')).toBeDisplayed();
    },
  });

  step("contrasena-oculta", {
    title: "La contraseña se escribe oculta",
    caption:
      "Por seguridad, cada carácter de la contraseña aparece como un punto. Si dudas de lo que has tecleado, el icono del ojo, a la derecha del campo («Mostrar contraseña»), te deja comprobarlo.",
    group: "ojo",
    focus: ["#password", REVEAL],
    run: async () => {
      await browser.keys("Escape");
      await $("#password").setValue(EXAMPLE_PASSWORD);
      await expect($("#password")).toHaveAttribute("type", "password");
    },
  });

  step("mostrar-contrasena", {
    title: "Ver la contraseña mientras escribes",
    caption:
      "Al pulsar el ojo, la contraseña se muestra en claro (en este ejemplo, «Ejemplo-2026») y el icono pasa a un ojo tachado. Vuelve a pulsarlo para ocultarla antes de que otra persona pueda verla en tu pantalla.",
    covers: ["action:show-password"],
    group: "ojo",
    focus: ["#password", REVEAL],
    run: async () => {
      await $(REVEAL).click();
      await expect($("#password")).toHaveAttribute("type", "text");
      await expect($(REVEAL)).toHaveAttribute("aria-pressed", "true");
    },
    after: async () => {
      await $(REVEAL).click();
      await expect($("#password")).toHaveAttribute("type", "password");
    },
  });

  step("error-credenciales", {
    title: "Si el correo o la contraseña no son correctos",
    caption:
      "Si el correo o la contraseña no corresponden a ninguna cuenta, Pharos no entra y lo indica bajo el formulario: «Correo o contraseña incorrectos.». Por seguridad no dice cuál de los dos falla, así que revisa ambos (el ojo te ayuda con la contraseña) y vuelve a intentarlo. Tras varios intentos seguidos, pide que esperes un momento antes de probar otra vez.",
    covers: ["state:login-error"],
    focus: ".auth-form__error",
    run: async () => {
      await $("#email").setValue(email);
      await clearInput("#password");
      await $("#password").setValue("contraseña-equivocada");
      await button(es.auth.login).click();
      // Not [role="alert"]: the toast stack has an empty one that comes first.
      await expect($(".auth-form__error")).toHaveText(es.auth.error.invalid_credentials);
    },
  });

  step("registro", {
    title: "Crear una cuenta",
    caption:
      "Si es tu primera vez, «Regístrate» abre «Crear cuenta». Escribe tu nombre, tus apellidos, tu alias, tu correo y una contraseña de al menos 8 caracteres. En este ejemplo, Liomar Rodríguez, responsable de QA de Pharos, crea la cuenta con la que hará todas las pruebas del manual, con el alias «Liomar QA» (escribe «Rodriguez» sin tilde, por descuido: lo corrige en «Mi perfil»). El alias es el nombre con el que Pharos te nombra: el menú lateral, los miembros de un workspace, las revisiones y los avisos. El nombre y los apellidos forman tu nombre oficial, que guarda tu perfil. Todos los campos son obligatorios: si falta uno, el formulario te lleva a él.",
    covers: ["screen:register"],
    run: async () => {
      await $(`button=${es.auth.signUpLink}`).click();
      await expect($(`h1=${es.auth.registerTitle}`)).toBeDisplayed();
      await $("#displayName").setValue(LEAD.alias);
      await $("#firstName").setValue(LEAD.first);
      await $("#lastName").setValue(TYPED_LAST);
      await $("#email").setValue(email);
      await $("#password").setValue(TOUR_PASSWORD);
    },
  });

  step("registro-codigos", {
    title: "Guardar los códigos de recuperación",
    caption:
      "«Registrarme» (o Intro) crea la cuenta y, antes de entrar, muestra tus 10 códigos de recuperación de la cuenta. Sirven para entrar si un día olvidas la contraseña, y cada uno vale una vez. Es la única vez que Pharos los enseña: cópialos o descarga el .txt y guárdalos en un gestor de contraseñas o en papel, nunca junto a la contraseña. «Continuar» se activa cuando marcas «He guardado los códigos en un lugar seguro».",
    covers: ["action:register", "screen:signup-recovery-codes"],
    focus: ['[data-testid="recovery-codes"]', SAVED_CHECK],
    run: async () => {
      await button(es.auth.register).click();
      await expect($(`h1=${es.recoveryCodes.title}`)).toBeDisplayed();
      await expect(byTestId("recovery-codes")).toBeDisplayed();
      await expect(button(es.recoveryCodes.continue)).toBeDisabled();
    },
  });

  step("registro-hecho", {
    title: "Primera entrada con la cuenta nueva",
    caption:
      "Con los códigos guardados, «Continuar» abre Pharos. Como la cuenta es nueva, «Inicio» aparece vacío: el saludo y la invitación a crear tu primer proyecto con «Nuevo proyecto» (capítulo 4). Arriba del menú lateral ya está el selector de workspace, con «Personal», tu espacio propio, y tu rol en él (capítulo 2). Tu alias y tu correo quedan al pie del menú lateral, junto al estado de la sincronización.",
    covers: ["state:home-empty"],
    focus: [USER_MENU, '[data-testid="workspace-switcher"]'],
    run: async () => {
      await $(SAVED_CHECK).click();
      await button(es.recoveryCodes.continue).click();
      await expect(userMenuTrigger()).toBeDisplayed();
      // The first sync ends a moment later.
      await syncIdle();
      // FIX-40: the workspace selector is there from the first sign-in.
      await expect(byTestId("workspace-switcher")).toHaveText(expect.stringContaining("Personal"));
    },
  });

  step("menu-usuario", {
    title: "El menú de usuario",
    caption:
      "Un clic en tu avatar, al pie del menú lateral, abre el menú de usuario. Reúne lo que es tuyo y no de un proyecto: «Mi perfil», «Administración» (la configuración de la aplicación, capítulo 15), el idioma de la interfaz (español o inglés, con una ✓ en el actual; se aplica al momento y viaja con tu cuenta) y «Cerrar sesión». En la app de escritorio, encima de «Cerrar sesión», «Conectado a …» dice a qué servidor está conectada tu sesión (aquí, el de este equipo). Se recorre con las flechas ↑ ↓ y se cierra con Esc.",
    covers: ["screen:user-menu", "action:user-menu-language"],
    focus: '[role="menu"]',
    run: async () => {
      await syncIdle();
      await userMenuTrigger().click();
      await expect($(`[role="menuitem"]*=${es.shell.myProfile}`)).toBeDisplayed();
      // Shown in capitals (CSS): compare ignoring case.
      const menuText = await browser.execute(() => document.querySelector('[role="menu"]')?.textContent ?? "");
      expect(menuText).toContain(es.server.connectedTo.split("{{")[0].trim());
      await expect(byTestId("lang-es")).toBeDisplayed();
      await expect(button(es.auth.logout)).toBeDisplayed();
    },
  });

  step("cerrar-sesion", {
    title: "Cerrar sesión",
    caption:
      "Para salir, elige «Cerrar sesión» en ese mismo menú. Pharos vuelve a la pantalla de entrada y borra de este equipo los datos en caché de tu cuenta; lo que ya está sincronizado sigue en el servidor. Ciérrala siempre si compartes el equipo: si no, la sesión sigue abierta la próxima vez que alguien abra la aplicación.",
    covers: ["action:logout"],
    // The screen it returns to is the one of the first step.
    shot: false,
    run: async () => {
      await button(es.auth.logout).click();
      await expect(button(es.auth.login)).toBeDisplayed();
    },
  });

  step("entrada-movil", {
    title: "La entrada en el móvil",
    caption:
      "En una pantalla estrecha (un móvil, o la ventana muy reducida), la foto queda arriba con el logotipo y el selector de idioma, y el formulario sube como una hoja desde abajo. Es el mismo formulario, con los mismos campos y errores; solo se desplaza la hoja, no la foto.",
    covers: ["platform:mobile-login"],
    run: async () => {
      await setViewport(MOBILE);
      await expect($(".auth--mobile .auth-sheet")).toBeDisplayed();
    },
    after: async () => {
      await setViewport(DESKTOP);
      await expect($(".auth--mobile")).not.toBeExisting();
    },
  });

  step("olvidaste", {
    title: "¿Olvidaste tu contraseña?",
    caption:
      "Bajo la contraseña, «¿Olvidaste tu contraseña?» abre «Recupera el acceso». En «Con un código» escribes tu correo, uno de tus códigos de recuperación y la contraseña nueva dos veces; «Cambiar la contraseña y entrar» la cambia, gasta ese código, cierra la sesión en todos tus equipos y te deja dentro. Si te quedan 3 códigos o menos, Pharos te avisa para que generes otros en «Mi perfil». Tus datos locales no se tocan.",
    covers: ["screen:recover", "tabs:src/modules/auth/ui/AccountRecovery.tsx"],
    focus: ".auth-form",
    run: async () => {
      await button(es.auth.forgot).click();
      await expect($(`h1=${es.auth.recover.title}`)).toBeDisplayed();
      await expect($("#recover-code")).toBeDisplayed();
    },
  });

  step("olvidaste-correo", {
    title: "Recuperar por correo",
    caption:
      "En «Por correo» escribes tu correo y «Enviar enlace» te manda un enlace para elegir una contraseña nueva. Caduca en 30 minutos y sirve una vez; Pharos responde lo mismo exista o no la cuenta. Solo funciona si quien administra el servidor configuró el envío de correo: si no, como en este ejemplo, Pharos lo dice y te queda el código. En la app de escritorio, pega el enlace del correo en «¿Ya tienes el enlace?».",
    covers: ["state:email-reset-off", "screen:reset-link"],
    focus: ".auth-form",
    run: async () => {
      await $(`[role="tab"]=${es.auth.recover.tab.email}`).click();
      await waitForText(es.auth.recover.emailOff);
      await expect($("#reset-link")).toBeDisplayed();
    },
    after: async () => {
      await $(`button*=${es.auth.recover.back}`).click();
      await expect(button(es.auth.login)).toBeDisplayed();
    },
  });

  step("entrar", {
    title: "Iniciar sesión",
    caption:
      "Para entrar, escribe tu correo y tu contraseña y pulsa «Entrar» (o Intro); el botón pasa a «Entrando…» mientras tanto. Pharos abre «Inicio» y recuerda la sesión en este equipo hasta que la cierres, así que no tendrás que escribirla cada vez que abras la aplicación. En el resto del manual, Liomar trabaja con esta misma cuenta.",
    covers: ["action:login"],
    focus: `button=${es.auth.login}`,
    run: async () => {
      await $("#email").setValue(email);
      await $("#password").setValue(TOUR_PASSWORD);
    },
    // The capture shows the filled form; signing in happens after it.
    after: async () => {
      await button(es.auth.login).click();
      await expect(userMenuTrigger()).toBeDisplayed();
    },
  });

  step("perfil", {
    title: "Tu perfil",
    caption:
      "«Mi perfil» reúne lo tuyo: arriba, el alias y tu nombre oficial (nombre y apellidos), con el estado de la sincronización y «Sincronizar ahora»; más abajo, «Seguridad de la cuenta», «Tokens personales» y «Preferencias». La cuenta de este ejemplo tiene los datos con los que Liomar la creó.",
    covers: ["route:/profile"],
    run: async () => {
      await syncIdle();
      await userMenuTrigger().click();
      await $(`[role="menuitem"]*=${es.shell.myProfile}`).click();
      await expect($(`h1=${es.profile.title}`)).toBeDisplayed();
      await expect($("#displayName")).toBeEnabled(); // once the profile has loaded
      await syncIdle();
    },
  });

  step("perfil-guardar", {
    title: "Cambiar el alias y el nombre",
    caption:
      "Corrige lo que haga falta y pulsa «Guardar» (o Intro). En este ejemplo, Liomar escribió su apellido sin tilde al registrarse y lo corrige: «Rodríguez». Junto al botón aparece «Guardado» (si cambias el alias, el avatar y el pie del menú lateral lo muestran al momento) y, debajo, cuándo se creó y se actualizó tu perfil y su número de revisión, que sube con cada cambio. Los cambios llegan a tus otros equipos con la siguiente sincronización.",
    covers: ["action:profile-save"],
    focus: [".profile__audit", `button=${es.profile.save}`],
    run: async () => {
      await expect($("#displayName")).toBeEnabled(); // once the profile has loaded
      await expect($("#lastName")).toHaveValue(TYPED_LAST);
      await clearInput("#lastName");
      await $("#lastName").setValue(LEAD.last);
      await button(es.profile.save).click();
      await waitForText(es.profile.saved);
      await expect($(".profile__audit")).toBeDisplayed();
      await expect($("#lastName")).toHaveValue(LEAD.last);
      await expect(userMenuTrigger()).toHaveText(expect.stringContaining(LEAD.alias));
    },
  });

  step("perfil-seguridad", {
    title: "Seguridad de la cuenta",
    caption:
      "Más abajo, «Seguridad de la cuenta». En «Cambiar la contraseña» escribes la actual y la nueva dos veces; al guardarla se cierra la sesión en tus otros equipos y este sigue abierto. «Códigos de recuperación de la cuenta» dice cuántos te quedan, cuándo se generaron y cuándo usaste uno por última vez. Las dos cosas necesitan conexión con el servidor. No es la clave de recuperación de la base local, que está en «Administración › Seguridad».",
    covers: ["screen:account-security"],
    focus: ".account-security",
    run: async () => {
      // The card's title just below the top bar, not under it.
      await scrollToTop(".account-security");
      await expect(byTestId("codes-remaining")).toHaveText(expect.stringContaining("10"));
    },
  });

  step("perfil-codigos-confirmar", {
    title: "Generar códigos nuevos",
    caption:
      "«Generar códigos nuevos» pide tu contraseña actual, porque los códigos que tienes dejan de funcionar. Hazlo si has gastado varios o si crees que alguien los ha visto.",
    covers: ["dialogs:src/modules/profile/ui/AccountSecuritySection.tsx"],
    run: async () => {
      await button(es.account.codesGenerate).click();
      await expect(dialog()).toBeDisplayed();
      await dialog().$("#codes-password").setValue(TOUR_PASSWORD);
    },
  });

  step("perfil-codigos-nuevos", {
    title: "Los códigos nuevos, una sola vez",
    caption:
      "Pharos muestra los 10 códigos nuevos una sola vez, como al registrarte. Guárdalos, marca «He guardado los códigos en un lugar seguro» y pulsa «Listo». El cambio queda en «Administración › Auditoría» como «Códigos de recuperación generados».",
    covers: ["dialogs:src/modules/profile/ui/AccountSecuritySection.tsx", "action:regenerate-recovery-codes"],
    run: async () => {
      await dialog().$(`button=${es.account.codesGenerate}`).click();
      await expect(dialog().$('[data-testid="recovery-codes"]')).toBeDisplayed();
    },
    after: async () => {
      await dialog().$(SAVED_CHECK).click();
      await dialog().$(`button=${es.recoveryCodes.close}`).click();
      await expect(dialog()).not.toBeExisting();
    },
  });

  step("perfil-preferencias", {
    title: "Preferencias: idioma y tema",
    caption:
      "Al final de «Mi perfil», «Preferencias» guarda el idioma y el tema: claro, oscuro o «Según el sistema», que sigue el ajuste de Windows. Se aplican al momento y viajan con tu cuenta: tus otros equipos los toman al sincronizar («Se aplica en todos tus equipos»). Justo encima, «Tokens personales» crea los tokens para el CLI `pharos` y tus scripts (capítulo 20).",
    covers: ["action:profile-preferences"],
    focus: ".profile-prefs",
    run: async () => {
      // To the end of the page: the card keeps the page's bottom margin.
      await browser.execute(() => {
        const main = document.querySelector(".app-shell__content");
        if (main) main.scrollTop = main.scrollHeight;
      });
      await expect(byTestId("profile-theme")).toBeDisplayed();
      await expect(byTestId("profile-language")).toBeDisplayed();
      await expect($(".profile-prefs")).toHaveText(expect.stringContaining(es.profile.synced));
    },
  });
});
