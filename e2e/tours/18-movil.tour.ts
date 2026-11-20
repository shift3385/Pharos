// Chapter 18 — Pantallas estrechas y móvil (manual v2, MAN-03): the same app
// at 390 px (top bar, bottom bar, section pills, bottom sheets). The icon
// strip of medium screens is in chapter 2; each chapter shows its own screens
// on a phone. Example: Liomar checks his Pharos project from a phone.
import { $, browser, expect } from "@wdio/globals";
import { DESKTOP, MOBILE, chapter, step, setViewport } from "./tour";
import { PROJECT_A, byTestId, clickButton, es, scrollToTop } from "./helpers";

/** Moves the pointer to the sheet's grip, so no row of a sheet is shot hovered. */
async function restMouse() {
  await browser.action("pointer").move({ origin: "viewport", x: 195, y: 58 }).perform();
}

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
      // Inicio from its top: the KPI tiles whole under the top bar.
      await browser.execute(() => {
        window.scrollTo(0, 0);
        for (const el of document.querySelectorAll("main, .app-main, [data-scroll-root]")) (el as HTMLElement).scrollTop = 0;
      });
    },
  });

  step("movil-busqueda", {
    title: "Buscar en el móvil",
    caption: "La lupa convierte la barra superior en un campo de búsqueda; la flecha (o Esc) la cierra. La búsqueda global de casos, requisitos y proyectos llega en una próxima versión, y el campo lo avisa.",
    covers: ["platform:mobile-search"],
    run: async () => {
      await byTestId("search-trigger").click();
      await expect($(".mtopbar__search")).toBeDisplayed();
    },
  });

  step("movil-notificaciones", {
    title: "Notificaciones en el móvil",
    caption:
      "En el móvil, la campana de la barra superior abre las notificaciones como una hoja desde abajo, con lo mismo que en el escritorio: los avisos agrupados por día, el filtro «Sin leer», «Marcar todo como leído» y la acción de cada aviso. Sin avisos, la hoja dice qué aparecerá en ella. La ✕ o un toque fuera la cierran.",
    covers: ["dialogs:src/app/layout/TopbarControls.tsx"],
    run: async () => {
      await browser.keys("Escape");
      await byTestId("notifications-trigger").click();
      await expect(byTestId("notifications-panel")).toBeDisplayed();
    },
  });

  step("movil-avatar", {
    title: "Tu avatar: workspace y cuenta",
    caption:
      "En el móvil no hay menú lateral: tu avatar, en la barra superior, abre una hoja con lo que en el escritorio está en el selector de workspace y en el menú de usuario. Arriba, tu correo y el estado de la sincronización, con «Sincronizar ahora». Después, «Workspace» lista tus workspaces con tu rol en cada uno (aquí, «Personal», donde Liomar es Test Manager) y ofrece «Crear workspace», «Unirse con un código…» y «Miembros y roles». Debajo, «Mi perfil», «Administración», el tema, el idioma y «Cerrar sesión».",
    covers: ["platform:mobile-user-sheet"],
    run: async () => {
      await browser.keys("Escape");
      await $(".user-menu--mobile").$('[data-testid="user-menu-trigger"]').click();
      await expect($(".bs")).toBeDisplayed();
      await expect($(".bs").$('[data-testid="workspace-members"]')).toBeDisplayed();
      // The section label is upper-cased by CSS.
      await expect($(".bs")).toHaveText(expect.stringContaining(es.workspaces.switcher.label), { ignoreCase: true });
      await restMouse();
    },
  });

  step("movil-proyecto", {
    title: "Secciones del proyecto en el móvil",
    caption: "Dentro de un proyecto, sus diez secciones (Plan, Tablero, Requisitos, Casos, Biblioteca, Ciclos, Ejecuciones, Defectos, Trazabilidad y Ajustes) se recorren con las píldoras bajo el título, que se desplazan de lado; la flecha de la barra superior vuelve a Proyectos. En este ejemplo, Liomar abre «Trazabilidad»: en el móvil, cada requisito es una tarjeta con sus casos.",
    covers: ["platform:mobile-project-pills"],
    run: async () => {
      await browser.keys("Escape");
      await $(".bs").waitForExist({ reverse: true });
      await byTestId("nav-projects").click();
      await $(`a*=${PROJECT_A.name}`).click();
      await expect($("nav.project-pills")).toBeDisplayed();
      const pill = $("nav.project-pills").$('[data-testid="nav-project-traceability"]');
      await pill.click();
      await expect(pill).toHaveAttribute("aria-current", "page");
      await $(".tz-cards").waitForDisplayed();
      // The pills scrolled sideways to the open section; the page at its
      // first requirement card.
      await browser.execute(() => {
        const nav = document.querySelector<HTMLElement>("nav.project-pills");
        const cur = nav?.querySelector<HTMLElement>('[aria-current="page"]');
        if (nav && cur) nav.scrollLeft += cur.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - cur.offsetWidth) / 2;
      });
      await scrollToTop(".tz-cards");
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
      await restMouse();
    },
  });

  step("movil-pasos-plan", {
    title: "Los pasos del plan en el móvil",
    caption: "En el plan de pruebas, «Ver pasos» abre la lista de los 22 pasos en una hoja inferior.",
    covers: ["dialogs:src/modules/test-plan/ui/wizard/StepNav.tsx"],
    run: async () => {
      await $(".bs__close").click();
      await $("nav.project-pills").$('[data-testid="nav-project-plan"]').click();
      await clickButton(es.testPlan.nav.showSteps);
      await expect($(".bs")).toBeDisplayed();
      await restMouse();
    },
  });

  step("escritorio", {
    title: "De vuelta al escritorio",
    caption: "Al ensanchar la ventana, Pharos vuelve al menú lateral completo.",
    shot: false,
    run: async () => {
      await $(".bs__close").click();
      await setViewport(DESKTOP);
      await expect($('aside.sidebar[data-mode="full"]')).toBeExisting();
    },
  });
});
