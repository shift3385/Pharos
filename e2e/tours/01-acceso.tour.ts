// Chapter 1 — Acceso y cuenta: the sign-in screen, its errors, creating an
// account, the user menu, the profile and the recovery key.
import { $, browser, expect } from "@wdio/globals";
import { email, signOut, userMenuTrigger } from "../support";
import { chapter, step } from "./tour";
import { button, byTestId, clearInput, es, waitForText } from "./helpers";

/** A throwaway account on the tour's own server (dropped with its database). */
const NEW_ACCOUNT = { alias: "Ana QA", first: "Ana", last: "Pérez", email: "ana.qa@pharos.test", password: "tour-ana-2026" };
const TOUR_PASSWORD = process.env.TEST_USER_PASSWORD ?? "supersecret1";

chapter("acceso", () => {
  step("pantalla-entrada", {
    title: "La pantalla de entrada",
    caption: "Al abrir Pharos sin sesión ves «Iniciar sesión»: correo, contraseña y el botón «Entrar». «Continuar con Google» llegará más adelante («Próximamente»). A la derecha, lo que ofrece la aplicación.",
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

  step("error-credenciales", {
    title: "Si la contraseña no es correcta",
    caption: "Con un correo o una contraseña incorrectos, Pharos lo dice bajo el formulario y no entra.",
    covers: ["state:login-error"],
    run: async () => {
      await $("#email").setValue(email);
      await $("#password").setValue("contraseña-equivocada");
      await button(es.auth.login).click();
      await waitForText(es.auth.error.invalid_credentials);
    },
  });

  step("mostrar-contrasena", {
    title: "Ver la contraseña mientras escribes",
    caption: "El ojo del campo «Contraseña» la muestra u oculta, para comprobar lo que has tecleado.",
    covers: ["action:show-password"],
    run: async () => {
      await $(`button[aria-label="${es.auth.showPassword}"]`).click();
      await expect($("#password")).toHaveAttribute("type", "text");
      await $(`button[aria-label="${es.auth.showPassword}"]`).click();
      await expect($("#password")).toHaveAttribute("type", "password");
    },
  });

  step("idioma-entrada", {
    title: "Idioma de la aplicación",
    caption: "Desde la entrada puedes cambiar el idioma (español o inglés) antes de iniciar sesión.",
    covers: ["action:login-language"],
    run: async () => {
      await byTestId("login-language").click();
      await expect($('[role="menu"], [role="listbox"]')).toBeDisplayed();
    },
  });

  step("registro", {
    title: "Crear una cuenta",
    caption: "«Regístrate» abre «Crear cuenta»: alias, nombre, apellidos, correo y contraseña. El nombre oficial es el que firma los documentos.",
    covers: ["screen:register"],
    run: async () => {
      await browser.keys("Escape");
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
    caption: "«Registrarme» crea la cuenta y entra directamente en «Inicio», todavía sin proyectos.",
    covers: ["action:register", "state:home-empty"],
    run: async () => {
      await button(es.auth.register).click();
      await expect(userMenuTrigger()).toBeDisplayed();
    },
  });

  step("cerrar-sesion", {
    title: "Cerrar sesión",
    caption: "El menú de usuario (tu avatar, arriba a la derecha) tiene «Cerrar sesión». Al cerrar, Pharos vuelve a la entrada.",
    covers: ["action:logout", "screen:user-menu"],
    run: async () => {
      await userMenuTrigger().click();
      await expect(button(es.auth.logout)).toBeDisplayed();
    },
  });

  step("entrar", {
    title: "Iniciar sesión",
    caption: "Escribe tu correo y contraseña y pulsa «Entrar». La sesión se recuerda en este equipo hasta que la cierres.",
    covers: ["action:login"],
    run: async () => {
      await button(es.auth.logout).click();
      await expect(button(es.auth.login)).toBeDisplayed();
      await $("#email").setValue(email);
      await $("#password").setValue(TOUR_PASSWORD);
      await button(es.auth.login).click();
      await expect(userMenuTrigger()).toBeDisplayed();
    },
  });

  step("menu-usuario", {
    title: "El menú de usuario",
    caption: "Desde el avatar llegas a «Mi perfil», a «Administración», al idioma (español o inglés) y a «Cerrar sesión».",
    covers: ["action:user-menu-language"],
    run: async () => {
      await userMenuTrigger().click();
      await expect($(`[role="menuitem"]*=${es.shell.myProfile}`)).toBeDisplayed();
      await expect(byTestId("lang-es")).toBeDisplayed();
    },
  });

  step("perfil", {
    title: "Tu perfil",
    caption: "«Mi perfil» muestra tu alias y tu nombre oficial, la auditoría de la cuenta y tus preferencias de idioma y tema.",
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
    caption: "Edita el alias o el nombre y pulsa «Guardar»: aparece «Guardado» y sube la revisión del perfil.",
    covers: ["action:profile-save"],
    run: async () => {
      await expect($("#displayName")).toBeEnabled(); // once the profile has loaded
      await $("#displayName").setValue("Smoke QA");
      await button(es.profile.save).click();
      await waitForText(es.profile.saved);
    },
  });

});
