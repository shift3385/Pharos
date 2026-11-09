// Chapter 18 — Pantallas estrechas y móvil (manual v2, MAN-03): the same app
// at 390 px (top bar, bottom bar, section pills, bottom sheets). The icon
// strip of medium screens is in chapter 2; each chapter shows its own screens
// on a phone. Example: Liomar checks his Pharos project from a phone.
import { $, browser, expect } from "@wdio/globals";
import { DESKTOP, MOBILE, chapter, step, setViewport } from "./tour";
import { PROJECT_A, byTestId, clickButton, es } from "./helpers";

chapter("movil", () => {
  step("movil-inicio", {
    title: "En el móvil: barra inferior",
    caption:
      "Por debajo de 600 px de ancho (aquí, 390 px, el de un móvil), Pharos usa una barra superior compacta (la flecha para volver y el nombre de la sección, o el logotipo en Inicio; la lupa, las notificaciones y tu avatar) y una barra inferior con Inicio, Proyectos, Admin y Perfil, al alcance del pulgar. Es la misma aplicación, con los mismos datos: en este ejemplo, Liomar repasa su proyecto Pharos desde el móvil.",
    covers: ["platform:mobile-bottom-nav"],
    run: async () => {
      await setViewport(MOBILE);
      await byTestId("nav-dashboard").click();
      await expect($("nav.bottom-nav")).toBeDisplayed();
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
    caption: "Dentro de un proyecto, sus secciones (Plan, Tablero, Requisitos, Casos, Ciclos, Ejecuciones, Defectos, Trazabilidad y Ajustes) se recorren con las píldoras bajo el título, que se desplazan de lado; la flecha de la barra superior vuelve a Proyectos.",
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
