// Chapter 1 — Acceso y cuenta (manual v2, MAN-03): the sign-in screen and its
// errors, creating an account, the sign-in screen on a phone, signing in and
// out, the user menu and the profile. The example: Liomar Rodríguez, QA lead
// of Pharos, creates his own account here and tests Pharos itself with it in
// every chapter (NC-052: the one person and account of the manual).
import { $, browser, expect } from "@wdio/globals";
import { email, signOut, userMenuTrigger } from "../support";
import { PERSONA } from "../../scripts/manual/persona.mjs";
import { DESKTOP, MOBILE, chapter, setViewport, step } from "./tour";
import { button, byTestId, clearInput, es, waitForText } from "./helpers";

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

  step("idioma-entrada", {
    title: "Elegir el idioma antes de entrar",
    caption:
      "El selector de idioma, en la esquina inferior izquierda (muestra el idioma actual, «Español»), despliega los idiomas disponibles: español e inglés. Muévete por la lista con las flechas y elige con Intro, o haz clic. Toda la interfaz cambia al momento, también esta pantalla, y Pharos lo recuerda en este equipo. Una vez dentro, el idioma se cambia desde el menú de usuario o desde «Mi perfil».",
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
      "Si es tu primera vez, «Regístrate» abre «Crear cuenta». Escribe tu alias, tu nombre, tus apellidos, tu correo y una contraseña de al menos 8 caracteres. En este ejemplo, Liomar Rodríguez, responsable de QA de Pharos, crea la cuenta con la que hará todas las pruebas del manual, con el alias «Liomar QA». El alias es como te ve el resto de la aplicación; el nombre y los apellidos forman tu nombre oficial, el que firma los documentos que exportas (el plan de pruebas, por ejemplo). Todos los campos son obligatorios: si falta uno, el formulario te lleva a él.",
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

  step("registro-hecho", {
    title: "Primera entrada con la cuenta nueva",
    caption:
      "«Registrarme» (o Intro) crea la cuenta y entra directamente, sin pasos intermedios. Como la cuenta es nueva, «Inicio» aparece vacío: el saludo y la invitación a crear tu primer proyecto con «Nuevo proyecto» (capítulo 4). Tu alias y tu correo quedan al pie del menú lateral, junto al estado de la sincronización.",
    covers: ["action:register", "state:home-empty"],
    focus: USER_MENU,
    run: async () => {
      await button(es.auth.register).click();
      await expect(userMenuTrigger()).toBeDisplayed();
    },
  });

  step("cerrar-sesion", {
    title: "Cerrar sesión",
    caption:
      "Para salir, abre el menú de usuario con un clic en tu avatar, al pie del menú lateral, y elige «Cerrar sesión». Pharos vuelve a la pantalla de entrada y borra de este equipo los datos en caché de tu cuenta; lo que ya está sincronizado sigue en el servidor. Ciérrala siempre si compartes el equipo: si no, la sesión sigue abierta la próxima vez que alguien abra la aplicación.",
    covers: ["action:logout", "screen:user-menu"],
    focus: `button=${es.auth.logout}`,
    run: async () => {
      await userMenuTrigger().click();
      await expect(button(es.auth.logout)).toBeDisplayed();
    },
  });

  step("entrada-movil", {
    title: "La entrada en el móvil",
    caption:
      "En una pantalla estrecha (un móvil, o la ventana muy reducida), la foto queda arriba con el logotipo y el selector de idioma, y el formulario sube como una hoja desde abajo. Es el mismo formulario, con los mismos campos y errores; solo se desplaza la hoja, no la foto.",
    covers: ["platform:mobile-login"],
    run: async () => {
      await button(es.auth.logout).click();
      await expect(button(es.auth.login)).toBeDisplayed();
      await setViewport(MOBILE);
      await expect($(".auth--mobile .auth-sheet")).toBeDisplayed();
    },
    after: async () => {
      await setViewport(DESKTOP);
      await expect($(".auth--mobile")).not.toBeExisting();
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

  step("menu-usuario", {
    title: "El menú de usuario",
    caption:
      "El menú de tu avatar reúne lo que es tuyo y no de un proyecto: «Mi perfil», «Administración» (la configuración de la aplicación, capítulo 15), el idioma de la interfaz (español o inglés, con una ✓ en el actual; se aplica al momento) y «Cerrar sesión». Se recorre con las flechas ↑ ↓ y se cierra con Esc.",
    covers: ["action:user-menu-language"],
    focus: '[role="menu"]',
    run: async () => {
      await userMenuTrigger().click();
      await expect($(`[role="menuitem"]*=${es.shell.myProfile}`)).toBeDisplayed();
      await expect(byTestId("lang-es")).toBeDisplayed();
    },
  });

  step("perfil", {
    title: "Tu perfil",
    caption:
      "«Mi perfil» reúne tus datos: el alias y tu nombre oficial (nombre y apellidos), el estado de la sincronización con «Sincronizar ahora» y, en «Preferencias», el idioma y el tema (claro u oscuro), que se aplican al momento en este equipo. La cuenta de este ejemplo tiene los datos con los que Liomar la creó.",
    covers: ["route:/profile", "action:profile-preferences"],
    run: async () => {
      await $(`[role="menuitem"]*=${es.shell.myProfile}`).click();
      await expect($(`h1=${es.profile.title}`)).toBeDisplayed();
      await expect(byTestId("profile-theme")).toBeDisplayed();
      await expect(byTestId("profile-language")).toBeDisplayed();
    },
  });

  step("perfil-guardar", {
    title: "Cambiar el alias y el nombre",
    caption:
      "Corrige lo que haga falta y pulsa «Guardar» (o Intro). En este ejemplo, Liomar escribió su apellido sin tilde al registrarse y lo corrige: «Rodríguez». Ese nombre oficial es el que firma el plan de pruebas que redacta en el capítulo 5. Junto al botón aparece «Guardado» (si cambias el alias, el avatar y el pie del menú lateral lo muestran al momento) y, debajo, cuándo se creó y se actualizó tu perfil y su número de revisión, que sube con cada cambio. Los cambios llegan a tus otros equipos con la siguiente sincronización.",
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
});
