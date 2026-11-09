// Preparation (not a manual chapter): a clean, signed-in, light-themed app at
// 1440 px. The data the chapters show is made by the chapters themselves,
// through the app's own screens and importers (fixtures in e2e/tours/fixtures/),
// in a fixed order, so every run starts from the same empty account and ends
// with the same data.
import { browser, expect } from "@wdio/globals";
import { $ } from "@wdio/globals";
import { button, ensureSignedOut } from "../support";
import { DESKTOP, chapter, step, setViewport } from "./tour";
import { es } from "./helpers";

chapter("preparacion", () => {
  step("ventana", {
    title: "Ventana de escritorio y sesión",
    caption: "La aplicación arranca a 1440 px, sin sesión: la cuenta la crea Liomar en el capítulo 1.",
    shot: false,
    run: async () => {
      await ensureSignedOut();
      await setViewport(DESKTOP);
      await expect(button(es.auth.login)).toBeDisplayed();
    },
  });

  step("tema-claro", {
    title: "Tema claro",
    caption: "El manual usa el tema claro de Faro Nocturno.",
    shot: false,
    run: async () => {
      // No theme switch on the sign-in screen: the stored preference, reloaded.
      await browser.execute(() => localStorage.setItem("pharos.theme", "light"));
      await browser.refresh();
      await $("body").waitForExist();
      await browser.waitUntil(async () => (await browser.execute(() => document.documentElement.dataset.theme)) === "light", {
        timeoutMsg: "the app did not switch to the light theme",
      });
    },
  });
});
