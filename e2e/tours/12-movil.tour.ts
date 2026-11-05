// Chapter 12 — Pantallas estrechas y móvil: the same app at 1024 px (icon
// strip) and at 390 px (top bar, bottom bar, section pills, bottom sheets).
import { $, browser, expect } from "@wdio/globals";
import { setAppWindow } from "../support";
import { DESKTOP, MOBILE, chapter, step, setViewport } from "./tour";
import { PROJECT_A, byTestId, clickButton, es } from "./helpers";

chapter("movil", () => {
  step("tableta", {
    title: "Pantallas medianas: menú de iconos",
    caption:
      "Pharos se adapta al ancho de la ventana. Por debajo de 1280 px, el menú lateral se reduce a una tira de iconos con su nombre corto y el contenido gana espacio.",
    covers: ["platform:tablet-icon-strip"],
    run: async () => {
      await setAppWindow(1024, 768, "tablet");
      await expect(byTestId("nav-projects")).toBeDisplayed();
    },
  });

  step("movil-inicio", {
    title: "En el móvil: barra inferior",
    caption:
      "A 390 px, el ancho de un móvil, Pharos usa una barra superior compacta y una barra inferior con Inicio, Proyectos, Administración y Perfil, al alcance del pulgar.",
    covers: ["platform:mobile-bottom-nav", "tabs:src/app/dashboard/DashboardPage.tsx"],
    run: async () => {
      await setViewport(MOBILE);
      await byTestId("nav-dashboard").click();
      await expect($("nav.bottom-nav")).toBeDisplayed();
      // «Inicio» on a phone: Resumen / Ejecución / Pruebas tabs.
      await byTestId("tab-home-execution").click();
      await expect(byTestId("tab-home-execution")).toHaveAttribute("aria-selected", "true");
    },
  });

  step("movil-busqueda", {
    title: "Buscar en el móvil",
    caption: "La lupa convierte la barra superior en un campo de búsqueda; la flecha (o Esc) la cierra.",
    covers: ["platform:mobile-search"],
    run: async () => {
      await byTestId("search-trigger").click();
      await expect($(".mtopbar__search")).toBeDisplayed();
    },
  });

  step("movil-proyecto", {
    title: "Secciones del proyecto en el móvil",
    caption: "Dentro de un proyecto, las secciones (Plan, Casos, Ciclos…) se recorren con las píldoras bajo el título; la flecha vuelve a Proyectos.",
    covers: ["platform:mobile-project-pills"],
    run: async () => {
      await browser.keys("Escape");
      await byTestId("nav-projects").click();
      await $(`a*=${PROJECT_A.name}`).click();
      await expect($("nav.project-pills")).toBeDisplayed();
    },
  });

  step("movil-filtros", {
    title: "Filtros en una hoja inferior",
    caption:
      "En la lista de casos, «Filtros» abre una hoja desde abajo con los mismos filtros que en el escritorio, para que la lista conserve la pantalla.",
    covers: ["platform:mobile-filters", "dialogs:src/modules/test-cases/ui/TestCaseList.tsx"],
    run: async () => {
      await $("nav.project-pills").$('[data-testid="nav-project-cases"]').click();
      await clickButton(es.testCase.list.filters);
      await expect($(".bs")).toBeDisplayed();
    },
  });

  step("movil-pasos-plan", {
    title: "Los pasos del plan en el móvil",
    caption: "En el plan de pruebas, «Ver pasos» abre la lista de los 19 pasos en una hoja inferior.",
    covers: ["dialogs:src/modules/test-plan/ui/wizard/StepNav.tsx"],
    run: async () => {
      await $(".bs__close").click();
      await $("nav.project-pills").$('[data-testid="nav-project-plan"]').click();
      await clickButton(es.testPlan.nav.showSteps);
      await expect($(".bs")).toBeDisplayed();
    },
  });

  step("escritorio", {
    title: "De vuelta al escritorio",
    caption: "Al ensanchar la ventana, Pharos vuelve al menú lateral completo.",
    shot: false,
    run: async () => {
      await $(".bs__close").click();
      await setViewport(DESKTOP);
      await expect(byTestId("app-version")).toBeExisting();
    },
  });
});
