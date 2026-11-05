// Preparation (not a manual chapter): a clean, signed-in, light-themed app at
// 1440 px. The data the chapters show is made by the chapters themselves,
// through the app's own screens and importers (fixtures in e2e/tours/fixtures/),
// in a fixed order, so every run starts from the same empty account and ends
// with the same data.
import { browser, expect } from "@wdio/globals";
import { ensureSignedOut, signIn, userMenuTrigger } from "../support";
import { DESKTOP, chapter, step, setViewport } from "./tour";
import { switchToLightTheme } from "./helpers";

chapter("preparacion", () => {
  step("ventana", {
    title: "Ventana de escritorio y sesión",
    caption: "La aplicación arranca a 1440 px, con la cuenta de pruebas.",
    shot: false,
    run: async () => {
      await ensureSignedOut();
      await setViewport(DESKTOP);
      await signIn();
      await expect(userMenuTrigger()).toBeDisplayed();
    },
  });

  step("tema-claro", {
    title: "Tema claro",
    caption: "El manual usa el tema claro de Faro Nocturno.",
    shot: false,
    run: async () => {
      await switchToLightTheme();
      expect(await browser.execute(() => document.documentElement.dataset.theme)).toBe("light");
    },
  });
});
