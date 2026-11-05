// Chapter 1 — Acceso y cuenta: the sign-in screen, its errors, creating an
// account, the user menu, the profile and the recovery key.
import { $, browser, expect } from "@wdio/globals";
import { email, signOut, userMenuTrigger } from "../support";
import { chapter, step } from "./tour";
import { button, byTestId, clearInput, es, waitForText } from "./helpers";

/** A throwaway account on the tour's own server (dropped with its database). */
const NEW_ACCOUNT = { alias: "Ana QA", first: "Ana", last: "Pérez", email: "ana.qa@pharos.test", password: "tour-ana-2026" };
const TOUR_PASSWORD = process.env.TEST_USER_PASSWORD ?? "supersecret1";
/** Shown in clear in the manual on purpose: an example, not a real password. */
const EXAMPLE_PASSWORD = "Ejemplo-2026";
const REVEAL = `button[aria-label="${es.auth.showPassword}"]`;
const USER_MENU = '[data-testid="user-menu-trigger"]';

chapter("acceso", () => {
  step("pantalla-entrada", {
    title: "La pantalla de entrada",
    caption:
      "Al abrir Pharos sin una sesión iniciada aparece «Iniciar sesión». A la izquierda está el formulario: tu correo electrónico, tu contraseña y el botón «Entrar»; bajo el título, el enlace «Regístrate» por si aún no tienes cuenta. «Continuar con Google» ya se ve, pero todavía no está disponible («Próximamente»). A la derecha, un resumen de lo que ofrece la aplicación.",
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
      "El selector de idioma, en la esquina inferior izquierda (muestra el idioma actual, «Español»), despliega los idiomas disponibles: español e inglés. Al elegir uno, toda la interfaz cambia al momento, también esta pantalla. Una vez dentro, el idioma se cambia desde el menú de usuario o desde «Mi perfil».",
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
      "Si el correo o la contraseña no corresponden a ninguna cuenta, Pharos no entra y lo indica bajo el formulario: «Correo o contraseña incorrectos.». Por seguridad no dice cuál de los dos falla, así que revisa ambos (el ojo te ayuda con la contraseña) y vuelve a intentarlo. Tras varios intentos seguidos, pide esperar un momento.",
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
      "Si es tu primera vez, «Regístrate» abre «Crear cuenta». Escribe tu alias, tu nombre y apellidos, tu correo y una contraseña de al menos 8 caracteres (en este ejemplo, la cuenta de Ana Pérez, con el alias «Ana QA»). El alias es como te verá el resto de la aplicación; el nombre y los apellidos forman tu nombre oficial, el que firma los documentos que exportas.",
    covers: ["screen:register"],
    run: async () => {
      await $(`button=${es.auth.signUpLink}`).click();
      await expect($(`h1=${es.auth.registerTitle}`)).toBeDisplayed();
      await $("#displayName").setValue(NEW_ACCOUNT.alias);
      await $("#firstName").setValue(NEW_ACCOUNT.first);
      await $("#lastName").setValue(NEW_ACCOUNT.last);
      await $("#email").setValue(NEW_ACCOUNT.email);
      await $("#password").setValue(NEW_ACCOUNT.password);
    },
  });

  step("registro-hecho", {
    title: "Primera entrada con la cuenta nueva",
    caption:
      "«Registrarme» crea la cuenta y entra directamente, sin pasos intermedios. Como la cuenta es nueva, «Inicio» aparece todavía vacío, con el saludo y la invitación a crear tu primer proyecto (capítulo 2). Tu alias y tu correo quedan al pie del menú lateral.",
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
      "Para salir, abre el menú de usuario con un clic en tu avatar, al pie del menú lateral, y elige «Cerrar sesión». Pharos vuelve a la pantalla de entrada. Hazlo siempre si compartes el equipo: si no, la sesión sigue abierta la próxima vez que alguien abra la aplicación.",
    covers: ["action:logout", "screen:user-menu"],
    focus: `button=${es.auth.logout}`,
    run: async () => {
      await userMenuTrigger().click();
      await expect(button(es.auth.logout)).toBeDisplayed();
    },
  });

  step("entrar", {
    title: "Iniciar sesión",
    caption:
      "Para entrar, escribe tu correo y tu contraseña y pulsa «Entrar» (o Intro). Pharos abre «Inicio» con el resumen de tus proyectos (capítulo 2) y recuerda la sesión en este equipo hasta que la cierres, así que no tendrás que volver a escribirla cada vez que abras la aplicación.",
    covers: ["action:login"],
    focus: `button=${es.auth.login}`,
    run: async () => {
      await button(es.auth.logout).click();
      await expect(button(es.auth.login)).toBeDisplayed();
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
      "El menú de tu avatar reúne lo que es tuyo y no de un proyecto: «Mi perfil», «Administración» (la configuración de la aplicación, capítulo 10), el idioma de la interfaz (español o inglés, se aplica al momento) y «Cerrar sesión».",
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
      "«Mi perfil» reúne tus datos personales: el alias y tu nombre oficial (nombre y apellidos, el que firma los documentos que exportas), el estado de la sincronización con «Sincronizar ahora» y, en «Preferencias», el idioma y el tema (claro u oscuro), que se aplican al momento en este equipo.",
    covers: ["route:/profile", "action:profile-preferences"],
    run: async () => {
      await $(`[role="menuitem"]*=${es.shell.myProfile}`).click();
      await expect($(`h1=${es.profile.title}`)).toBeDisplayed();
      await expect(byTestId("profile-theme")).toBeDisplayed();
      await expect(byTestId("profile-language")).toBeDisplayed();
    },
  });

  step("perfil-guardar", {
    title: "Cambiar el alias",
    caption:
      "Cambia el alias o el nombre (en este ejemplo, el alias pasa a «Smoke QA») y pulsa «Guardar». Junto al botón aparece «Guardado» y, debajo, cuándo se creó y se actualizó por última vez tu perfil y su número de revisión, que sube con cada cambio guardado. El nuevo alias llega a tus otros equipos con la siguiente sincronización.",
    covers: ["action:profile-save"],
    focus: [".profile__audit", `button=${es.profile.save}`],
    run: async () => {
      // The form shows before the profile loads: its required fields are still
      // empty (the browser blocks the submit) and the load overwrites what was typed.
      await browser.waitUntil(async () => (await $("#firstName").getValue()) !== "", {
        timeoutMsg: "the profile form never loaded",
      });
      await clearInput("#displayName");
      await $("#displayName").setValue("Smoke QA");
      await button(es.profile.save).click();
      await waitForText(es.profile.saved);
      await expect($(".profile__audit")).toBeDisplayed();
    },
  });
});
