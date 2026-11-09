// Chapter 2 — La aplicación de un vistazo (manual v2, MAN-03): the shell every
// screen shares. The side menu and the project menu in test-process order
// (UX-21), the project switcher, the breadcrumbs, search (Ctrl+K),
// notifications, the theme, the sync indicator, collapsing the menu and the
// icon strip of medium screens. It runs after chapter 4, which makes the two
// projects (Pharos and API de sincronización).
import { $, browser, expect } from "@wdio/globals";
import { DESKTOP, TABLET, chapter, setViewport, step } from "./tour";
import { PROJECT_A, PROJECT_B, byTestId, es, menuItem, openProject, switchToLightTheme, waitForToast } from "./helpers";

const PROJECT_GROUP = '[aria-labelledby="sidebar-project-label"]';

chapter("navegacion", () => {
  step("estructura", {
    title: "La pantalla de Pharos",
    caption:
      "Todas las pantallas comparten la misma estructura. A la izquierda, el menú lateral: «Inicio» y «Proyectos» arriba; dentro de un proyecto, el bloque «Proyecto activo» con sus secciones; «Administración» en «Configuración» y, al pie, la sincronización, la versión instalada y tu menú de usuario. Arriba, la barra con la ruta (migas de pan), el buscador, las notificaciones y el cambio de tema. El resto es el contenido de la sección abierta: en este ejemplo, el «Tablero» del proyecto «Pharos».",
    covers: ["screen:shell"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await expect($(PROJECT_GROUP)).toBeDisplayed();
      await expect($("nav.crumbs")).toBeDisplayed();
    },
  });

  step("menu-proyecto", {
    title: "Las secciones y el proceso de prueba",
    caption:
      "El bloque «Proyecto activo» va en el orden del proceso de prueba: cada sección sirve a una de sus actividades, como resume la tabla de debajo. La sección abierta queda resaltada. Al abrir un proyecto existente, Pharos entra en su «Tablero»; uno recién creado se abre en su «Plan de pruebas».",
    covers: ["action:project-nav"],
    focus: PROJECT_GROUP,
    run: async () => {
      for (const section of ["plan", "planner", "requirements", "cases", "cycles", "runs", "defects", "traceability", "settings"]) {
        await expect(byTestId(`nav-project-${section}`)).toBeDisplayed();
      }
      await expect(byTestId("nav-project-planner")).toHaveAttribute("aria-current", "page");
    },
  });

  step("cambiar-proyecto", {
    title: "Cambiar de proyecto",
    caption:
      "El selector de la parte superior del bloque, con el prefijo y el nombre del proyecto, salta a otro proyecto sin volver a la lista. Escribe para filtrar (útil con muchos proyectos), muévete con ↑ ↓ y elige con Intro o con un clic. Pharos abre la misma sección en el otro proyecto: si estabas en su «Tablero», llegas al «Tablero» del nuevo. «Ver todos los proyectos», al pie, abre la lista.",
    covers: ["action:project-switcher"],
    focus: ['[data-testid="project-switcher"]', '[role="menu"]'],
    run: async () => {
      await byTestId("project-switcher").click();
      await expect($(`[aria-label="${es.shell.searchProjects}"]`)).toBeDisplayed();
      await expect(menuItem(PROJECT_B.name)).toBeDisplayed();
    },
  });

  step("migas", {
    title: "Dónde estás: las migas de pan",
    caption:
      "Tras elegir «API de sincronización», la barra superior muestra la ruta: «Proyectos › API de sincronización › Tablero». Cada tramo, menos el último, es un enlace: «Proyectos» vuelve a la lista. Si un nombre es muy largo, se recorta con «…» y se lee entero al pasar el ratón.",
    covers: ["action:breadcrumbs"],
    focus: "nav.crumbs",
    run: async () => {
      await menuItem(PROJECT_B.name).click();
      await expect($(`h1=${PROJECT_B.name}`)).toBeDisplayed();
      await expect($("nav.crumbs")).toHaveText(expect.stringContaining(PROJECT_B.name));
      await expect(byTestId("nav-project-planner")).toHaveAttribute("aria-current", "page");
    },
  });

  step("busqueda", {
    title: "Buscar (Ctrl+K)",
    caption:
      "El buscador de la barra superior, o Ctrl+K desde cualquier pantalla (⌘K en Mac), será la búsqueda global de casos, requisitos y proyectos. En esta versión todavía no busca: el panel avisa de que llega en una próxima versión. Mientras tanto, cada lista tiene su propio buscador y, en los casos, Ctrl+P salta a uno concreto (capítulo 8). Esc cierra el panel.",
    covers: ["keyboard:ctrl-k", "dialogs:src/app/layout/TopbarControls.tsx"],
    focus: ".topbar__panel",
    run: async () => {
      await openProject(PROJECT_A.name);
      await browser.keys(["Control", "k"]);
      await expect($(".topbar__panel")).toBeDisplayed();
    },
  });

  step("notificaciones", {
    title: "Notificaciones",
    caption:
      "La campana, junto al buscador, abrirá tus notificaciones. Como la búsqueda, todavía es un adelanto: el panel avisa de que llegan en una próxima versión. Los avisos de lo que haces (guardado, exportado, sincronizado) aparecen por ahora un momento abajo a la derecha.",
    covers: ["dialogs:src/app/layout/TopbarControls.tsx"],
    focus: ".topbar__panel",
    run: async () => {
      await browser.keys("Escape");
      await expect($(".topbar__panel")).not.toBeDisplayed();
      await byTestId("notifications-trigger").click();
      await expect($(".topbar__panel")).toBeDisplayed();
    },
  });

  step("tema", {
    title: "Tema claro u oscuro",
    caption:
      "El botón de la luna, a la derecha de la barra superior, pasa Pharos al tema oscuro («Faro Nocturno»); en el tema oscuro es un sol y vuelve al claro. Se aplica al momento y se recuerda en este equipo. En «Administración › General» (capítulo 15) hay además la opción «Según el sistema», que sigue el ajuste de Windows.",
    covers: ["action:theme-toggle"],
    focus: '[data-testid="theme-toggle"]',
    run: async () => {
      await browser.keys("Escape");
      await byTestId("theme-toggle").click();
      expect(await browser.execute(() => document.documentElement.dataset.theme)).toBe("dark");
    },
    after: async () => {
      await switchToLightTheme();
    },
  });

  step("sincronizar", {
    title: "La sincronización, al pie del menú",
    caption:
      "Al pie del menú lateral, un punto de color y una palabra dicen cómo está la sincronización con el servidor: «Sincronizado», «Cambios pendientes (N)», «Sin conexión» o «Conflictos (N)». Pharos sincroniza solo al entrar y cuando vuelve la conexión (y, si activas «Sincronización automática» en Administración › Sincronización, capítulo 15, cada pocos minutos); «Sincronizar ahora» lo hace al momento y avisa de cuántos cambios envió (↑) y recibió (↓). Con conflictos aparece «Revisar conflictos» (capítulo 15).",
    covers: ["action:sync-indicator"],
    toast: true,
    focus: ".sidebar .sync",
    run: async () => {
      await $(".sidebar .sync").$(`button=${es.sync.now}`).click();
      await waitForToast(es.sync.doneToast.split("{{")[0], 30_000);
    },
  });

  step("menu-contraido", {
    title: "Contraer el menú lateral",
    caption:
      "El botón junto al logotipo contrae el menú lateral a una tira de iconos con su nombre corto, para dar más espacio a tablas y editores; al pasar el ratón, cada icono dice su nombre completo. Vuelve a pulsarlo para expandirlo. Pharos recuerda tu elección en este equipo. En la tira, la sincronización es solo el punto: púlsalo para sincronizar.",
    covers: ["action:sidebar-collapse"],
    focus: "aside.sidebar",
    run: async () => {
      await byTestId("sidebar-collapse").click();
      await expect($('aside.sidebar[data-mode="rail"], aside.sidebar[data-mode="collapsed"]')).toBeExisting();
      await expect(byTestId("sync-compact")).toBeDisplayed();
    },
    after: async () => {
      await byTestId("sidebar-collapse").click();
      await expect($('aside.sidebar[data-mode="rail"], aside.sidebar[data-mode="collapsed"]')).not.toBeExisting();
    },
  });

  step("tableta", {
    title: "Pantallas medianas: la tira de iconos",
    caption:
      "Pharos se adapta al ancho de la ventana. Por debajo de 1280 px (una tableta, o la ventana a media pantalla), el menú lateral es siempre la tira de iconos, el buscador se reduce a la lupa (Ctrl+K sigue funcionando), las tablas ocultan sus columnas menos importantes y lo que no cabe, como las columnas del Tablero, se desplaza de lado. Si la ventana es baja, desplaza la tira para llegar a tu avatar. Por debajo de 600 px pasa al diseño del móvil, con una barra inferior (capítulo 18).",
    covers: ["platform:tablet-icon-strip"],
    run: async () => {
      await setViewport(TABLET);
      await expect(byTestId("nav-projects")).toBeDisplayed();
      // The layout follows the resize a moment later: wait for the strip.
      await byTestId("sidebar-collapse").waitForDisplayed({ reverse: true, timeout: 10_000 });
    },
    after: async () => {
      await setViewport(DESKTOP);
    },
  });
});

