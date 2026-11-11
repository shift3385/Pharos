// Chapter 3 — Inicio (manual v2, MAN-03): the home panel once the team has
// work in Pharos. The KPI cards, the period, execution by project, the exit
// criteria and their picker, daily executions with their data table, upcoming
// tests, the board without scrolling at 1280 × 800 and how to customize it
// (move, resize, hide, show and reset, UX-27), and the Home on a phone. It runs after the manual-execution chapter
// so every card has real data; the empty Home is shown in chapter 1.
import { $, $$, browser, expect } from "@wdio/globals";
import { DESKTOP, LAPTOP, MOBILE, chapter, setViewport, step } from "./tour";
import { byTestId, es, goHome } from "./helpers";

const EXEC = "section.home-exec";
const EXIT = "section.home-exit";
const UPCOMING = 'section[aria-labelledby="home-upcoming-title"]';
const KPIS = '[data-gadget^="kpi"]';

/** The content area does not scroll: the whole Inicio is in view. */
const noScroll = () =>
  browser.execute(() => {
    const main = document.querySelector(".app-shell__content");
    return !!main && main.scrollHeight <= main.clientHeight + 1;
  });

/** Elements inside the board that scroll (UX-28: there must be none). */
const innerScrolls = () =>
  browser.execute(() =>
    [...document.querySelectorAll(".home-board *")]
      .filter((el) => {
        const cs = getComputedStyle(el);
        const y = /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
        const x = /auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
        return y || x;
      })
      .map((el) => el.getAttribute("class") || el.tagName),
  );

/** Gives the keyboard focus to a gadget of the board (customizing). */
const focusGadget = (id: string) =>
  browser.execute((sel: string) => (document.querySelector(sel) as HTMLElement | null)?.focus(), `[data-testid="gadget-${id}"]`);

chapter("inicio", () => {
  step("resumen", {
    title: "Tu Inicio",
    caption:
      "«Inicio» es lo primero que ves al entrar: un resumen de todos tus proyectos abiertos. Arriba, en una sola línea, el saludo y la fecha; a la derecha, el periodo de los datos, «Nuevo proyecto» y el engranaje para personalizarlo. Debajo, cuatro tarjetas con las cifras clave y cuatro paneles: la ejecución por proyecto, las próximas pruebas, los criterios de salida y las ejecuciones diarias. Ningún panel se desplaza por dentro: una lista muestra las filas que caben y termina en «+N más». Se actualiza solo cada vez que llegan datos de otro equipo.",
    covers: ["route:/", "state:home-metrics"],
    run: async () => {
      await goHome();
      await expect(byTestId("kpi-projects")).toBeDisplayed();
      // The metrics have loaded: the rate card shows a number or «—», not «…».
      await browser.waitUntil(async () => !(await byTestId("kpi-rate").getText()).includes("…"));
      await expect(byTestId("home-daily")).toBeDisplayed();
      // Loaded, not failed: no «No se pudieron cargar las ejecuciones».
      await expect($$(".home [role=alert]")).toBeElementsArrayOfSize(0);
      // No gadget scrolls inside (UX-28).
      await expect(await innerScrolls()).toEqual([]);
    },
  });

  step("tarjetas", {
    title: "Las cuatro cifras clave",
    caption:
      "«Proyectos abiertos» (y cuántos cierran este mes), «Pruebas pendientes» (casos sin ejecutar o bloqueados, sobre el total), «Tasa de éxito» (casos que pasan sobre los casos ejecutados en el periodo; un caso con varios flujos, filas o configuraciones pasa solo si pasan todos, y los tests importados sin vincular no cuentan: si los hay, debajo pone «Además, N tests sin vincular», con enlace a Ejecuciones) y «Defectos abiertos» (con los críticos aparte, en rojo). Cada tarjeta es un enlace: lleva a la lista de proyectos o, si solo tienes un proyecto, directamente a sus casos, sus ejecuciones o sus defectos.",
    covers: ["action:home-kpi"],
    focus: KPIS,
    run: async () => {
      for (const id of ["kpi-projects", "kpi-pending", "kpi-rate", "kpi-defects"]) await expect(byTestId(id)).toBeDisplayed();
    },
  });

  step("periodo", {
    title: "El periodo de los datos",
    caption:
      "El selector de periodo («Últimos 14 días», por defecto) decide qué días cuentan para la tasa de éxito y para «Ejecuciones diarias»: hoy, los últimos 7, 14 o 30 días, o el mes en curso. Las demás cifras son el estado actual de cada proyecto. Pharos recuerda el periodo en este equipo. Las opciones por ciclo, el rango personalizado y la comparación con el periodo anterior llegan en una próxima versión.",
    covers: ["action:home-period"],
    focus: ['[data-testid="home-period"]', '[role="menu"]'],
    run: async () => {
      await byTestId("home-period").click();
      await expect(byTestId("period-7d")).toBeDisplayed();
    },
    after: async () => {
      await byTestId("period-7d").click();
      await expect(byTestId("home-period")).toHaveText(expect.stringContaining(es.dashboard.period["7d"]));
      // The period really filters: 7 days → 7 rows in the chart's data.
      await browser.waitUntil(async () => (await $$(".home-daily .home-lines__data tbody tr")).length === 7);
    },
  });

  step("ejecucion", {
    title: "Ejecución por proyecto",
    caption:
      "Una barra por proyecto abierto con el último resultado de cada uno de sus casos: «Pasa», «Falla», «Bloqueado», «Otro» y «No ejecutado». Así ves de un vistazo cuánto falta por probar y dónde están los fallos. Pasa el ratón por un tramo para ver la cifra; el nombre del proyecto lo abre en su «Tablero».",
    covers: ["screen:home-exec"],
    focus: EXEC,
    run: async () => {
      await expect(byTestId("home-exec")).toBeDisplayed();
    },
  });

  step("ayuda", {
    title: "La ayuda de cada panel",
    caption:
      "Junto al título de cada panel, el botón «?» explica qué muestra: «Ejecución por proyecto», el último resultado de cada caso en cada proyecto abierto; «Próximas pruebas», qué ejecutar según su último resultado y por prioridad; «Criterios de salida», los definidos en el plan de pruebas; y «Ejecuciones diarias», qué cuenta como intento. Se abre al pasar el ratón, con un clic o con el teclado (Tab), y se cierra con Esc.",
    covers: ["action:home-gadget-help"],
    focus: ['[aria-label="Más información: Ejecución por proyecto"]', '[role="tooltip"]'],
    run: async () => {
      // Keyboard focus opens it (a click would toggle what hovering opened).
      await browser.execute(() =>
        (document.querySelector('[aria-label="Más información: Ejecución por proyecto"]') as HTMLElement | null)?.focus(),
      );
      await expect($('[role="tooltip"]')).toBeDisplayed();
      await expect($('[role="tooltip"]')).toHaveText(expect.stringContaining(es.dashboard.exec.subtitle));
    },
    after: async () => {
      // Esc closes it; the pointer, still over «?» after the click, leaves.
      await browser.keys("Escape");
      await $("h1").moveTo();
      // The help text stays in the DOM (it describes the card), hidden.
      await expect($('[role="tooltip"]')).not.toBeDisplayed();
    },
  });

  step("criterios", {
    title: "Criterios de salida",
    caption:
      "«Criterios de salida» evalúa los criterios de cierre del plan de pruebas de un proyecto (capítulo 5): el anillo da el porcentaje ejecutado y cada criterio dice «Cumple», «No cumple» o «Sin datos» (los que Pharos no puede medir solo). El titular resume si el proyecto está «Listo para cerrar» o si «Hay criterios que no se cumplen». Si el plan no define criterios, se usan los de por defecto; «Abrir el plan» lleva a él.",
    covers: ["action:home-exit-criteria"],
    focus: EXIT,
    run: async () => {
      await expect(byTestId("exit-ring")).toBeDisplayed();
      await expect(byTestId("home-criteria")).toBeDisplayed();
    },
  });

  step("criterios-filtros", {
    title: "Elegir el proyecto: en riesgo o cumplen",
    caption:
      "El botón con el nombre del proyecto abre el selector: escribe para buscar por nombre o prefijo, y filtra con «Todos», «En riesgo» (algún criterio no se cumple) o «Cumplen» (se cumplen todos los que se pueden evaluar). Los proyectos van ordenados por su fecha de cierre, la más próxima primero; por eso el Inicio muestra de entrada el que cierra antes.",
    covers: ["action:home-exit-filter"],
    focus: '[role="menu"], [role="dialog"]',
    run: async () => {
      await byTestId("exit-picker").click();
      await byTestId("exit-filter-risk").click();
      await expect(byTestId("exit-filter-risk")).toHaveAttribute("aria-pressed", "true");
    },
    after: async () => {
      await byTestId("exit-filter-all").click();
      await browser.keys("Escape");
    },
  });

  step("diarias", {
    title: "Ejecuciones diarias y sus datos",
    caption:
      "Una línea por estado («Pasa», «Falla» y «Otras», esta discontinua) con los intentos de cada día del periodo: cada vez que se ejecutó algo, reintentos y tests sin vincular incluidos, por eso puede sumar más que la tasa de éxito, que cuenta casos. Un punto marca cada día con alguno; arriba a la derecha, el total del periodo. «Ver los datos» abre la misma información en una tabla (día, pasa, falla, otras, manuales e importadas), más cómoda de leer con un lector de pantalla o para copiar; en el escritorio se abre en una ventana, para que el panel no crezca.",
    covers: ["action:home-daily-table", "dialogs:src/app/dashboard/DailyExecutionsChart.tsx"],
    focus: '[role="dialog"]',
    run: async () => {
      await byTestId("home-daily-data").click();
      await expect($('[role="dialog"] table')).toBeDisplayed();
    },
    after: async () => {
      await $('[role="dialog"]').$(`button=${es.common.close}`).click();
      await expect($('[role="dialog"]')).not.toBeExisting();
    },
  });

  step("diarias-30", {
    title: "Treinta días de un vistazo",
    caption:
      "Con «Últimos 30 días» el eje de fechas solo rotula el primer día, uno por semana y el último, con el mes cuando cambia, para que nunca se pisen; la escala llega al valor más alto que se ve (como poco, 5). Pasa el ratón, toca la gráfica o recórrela con las flechas del teclado: una línea vertical marca el día y una burbuja muestra su fecha y lo de cada estado. La leyenda también filtra: pulsa un estado para ocultar o mostrar su línea (siempre queda al menos uno) y la escala se ajusta a lo visible.",
    covers: ["action:home-daily-tooltip", "action:home-daily-legend"],
    focus: '[data-testid="home-daily-tip"]',
    run: async () => {
      await byTestId("home-period").click();
      await byTestId("period-30d").click();
      await browser.waitUntil(async () => (await $$(".home-daily .home-lines__data tbody tr")).length === 30);
      const labels = await $$('[data-testid="home-daily-xlabel"]');
      await expect(labels.length).toBeLessThanOrEqual(6);
      // 30 days of data stretch nothing: no page scroll, no gadget scroll.
      await browser.waitUntil(noScroll, { timeoutMsg: "Inicio scrolls at 1440 × 900 with 30 days" });
      await expect(await innerScrolls()).toEqual([]);
      // A tap on the chart: the bubble shows that day's date and values.
      await $(".home-lines").click();
      await expect(byTestId("home-daily-tip")).toBeDisplayed();
    },
    after: async () => {
      // The legend filters, and puts it back.
      await byTestId("daily-series-others").click();
      await expect(byTestId("daily-series-others")).toHaveAttribute("aria-pressed", "false");
      await byTestId("daily-series-others").click();
      await expect(byTestId("daily-series-others")).toHaveAttribute("aria-pressed", "true");
      await $("h1").moveTo();
    },
  });

  step("proximas", {
    title: "Próximas pruebas",
    caption:
      "«Próximas pruebas» propone qué ejecutar a continuación, por prioridad, según el último resultado de cada caso. El selector bajo el título elige la lista, con su número: «No ejecutadas», «Bloqueadas» o «Re-test» (casos que fallaron y cuyo defecto ya está corregido; cada fila dice cuándo falló). Cada fila abre el caso; la flecha de la derecha («Ver todas») lleva a la lista de casos, y si no caben todas, «+N más» también.",
    covers: ["action:home-upcoming-filter"],
    focus: ['[data-testid="home-upcoming-filter"]', '[role="listbox"]'],
    run: async () => {
      await $(UPCOMING).scrollIntoView({ block: "center" });
      await byTestId("home-upcoming-filter").click();
      await expect($('[role="listbox"]')).toBeDisplayed();
      await expect(byTestId("home-upcoming-filter")).toHaveAttribute("aria-expanded", "true");
    },
    after: async () => {
      await $('[role="option"]*=Bloqueadas').click();
      await expect(byTestId("home-upcoming-filter")).toHaveText(expect.stringContaining("Bloqueadas"));
      await byTestId("home-upcoming-filter").click();
      await $('[role="option"]*=No ejecutadas').click();
      await expect(byTestId("home-upcoming-filter")).toHaveText(expect.stringContaining("No ejecutadas"));
    },
  });

  step("sin-scroll", {
    title: "Todo a la vista, sin desplazarte",
    caption:
      "En el escritorio, el Inicio es una pizarra de 24 columnas por 24 filas que ocupa justo el alto de la ventana: desde 1280 × 800 en una ventana como esta, de 1280 × 820, lo ves todo sin desplazarte, y ningún panel se desplaza por dentro. Con menos alto, los paneles se compactan (menos márgenes y leyendas solo con puntos de color, con su nombre al pasar el ratón); por debajo de unos 700 px de alto aparece un único desplazamiento de página. Cada tarjeta es un «gadget» con su sitio y su tamaño en la cuadrícula. En una tableta los gadgets se apilan uno debajo de otro, y en el móvil se reparten en pestañas.",
    covers: ["platform:home-no-scroll"],
    run: async () => {
      await setViewport(LAPTOP);
      await goHome();
      await expect(byTestId("home-board")).toBeDisplayed();
      await browser.waitUntil(noScroll, { timeoutMsg: "Inicio scrolls at 1280 × 820" });
      await expect(await innerScrolls()).toEqual([]);
    },
    after: async () => {
      await setViewport(DESKTOP);
    },
  });

  step("personalizar", {
    title: "Personalizar el Inicio",
    caption:
      "El engranaje junto a «Nuevo proyecto» («Personalizar Inicio») activa el modo configurar: se ve la cuadrícula punteada y cada gadget con un borde discontinuo, su asa para moverlo (arriba a la izquierda), su tamaño y su mínimo («9×10 · mín 8×7») y la esquina inferior derecha para cambiar el tamaño. Al mover o agrandar uno, los demás se apartan y suben a llenar los huecos: nunca se solapan. Cada gadget tiene un tamaño mínimo para que su contenido se lea bien. «Listo» guarda la distribución en tu cuenta, así que la verás igual en tus otros equipos; Esc sale sin guardar (y pregunta si cambiaste algo).",
    covers: ["action:home-customize"],
    focus: ['[data-testid="home-customize"]', '[data-gadget="byProject"]'],
    run: async () => {
      await byTestId("home-customize").click();
      await expect(byTestId("home-customize")).toHaveAttribute("aria-pressed", "true");
      await expect(byTestId("home-board-done")).toBeDisplayed();
      await expect(byTestId("home-period")).not.toBeExisting();
      await expect($('[data-gadget="byProject"] .home-gadget__size')).toHaveText(expect.stringContaining("9×10"));
    },
  });

  step("teclado", {
    title: "Mover y cambiar el tamaño con el teclado",
    caption:
      "Con el teclado: pasa de un gadget a otro con Tab, muévelo con las flechas y cambia su tamaño con Mayús + flechas. Dos gadgets iguales y contiguos, como las cifras clave, se intercambian. Cada cambio se anuncia a los lectores de pantalla, por ejemplo «Proyectos abiertos: columna 7, fila 1, 6×4». Aquí, «Proyectos abiertos» ha pasado a la derecha de «Pruebas pendientes».",
    covers: ["keyboard:home-board"],
    focus: KPIS,
    run: async () => {
      await focusGadget("kpiProjects");
      await browser.keys("ArrowRight");
      await expect(byTestId("home-board-live")).toHaveText(
        expect.stringContaining(`${es.dashboard.kpi.projects}: columna 7, fila 1, 6×4`),
      );
    },
  });

  step("ocultar", {
    title: "Ocultar un gadget",
    caption:
      "El ojo tachado de cada gadget lo oculta y los demás suben a ocupar su sitio. Aquí se ha ocultado «Criterios de salida». Los gadgets ocultos no se pierden: se cuentan en «Gadgets ocultos», arriba.",
    covers: ["action:home-gadget-hide"],
    focus: '[data-testid="home-hidden-gadgets"]',
    run: async () => {
      await byTestId("hide-exitCriteria").click();
      await expect(byTestId("gadget-exitCriteria")).not.toBeExisting();
      await expect(byTestId("home-hidden-gadgets")).toHaveText(expect.stringContaining("(1)"));
    },
  });

  step("mostrar", {
    title: "Volver a mostrar un gadget",
    caption:
      "«Gadgets ocultos» lista los que has ocultado. Al elegir uno, vuelve al primer hueco donde quepa, con su tamaño o, si no cabe, con su tamaño mínimo. Si no queda sitio en las 24 filas, se coloca debajo y el Inicio pasa a tener desplazamiento; la línea de ayuda lo avisa.",
    covers: ["action:home-gadget-hide"],
    focus: '[role="menu"]',
    run: async () => {
      await byTestId("home-hidden-gadgets").click();
      await expect(byTestId("show-exitCriteria")).toBeDisplayed();
    },
    after: async () => {
      await byTestId("show-exitCriteria").click();
      await expect(byTestId("gadget-exitCriteria")).toBeDisplayed();
    },
  });

  step("salir-sin-guardar", {
    title: "Salir sin guardar",
    caption:
      "Esc sale del modo configurar sin guardar. Si has cambiado algo, Pharos pregunta antes: «Descartar cambios» deja el Inicio como estaba y «Seguir editando» vuelve a la pizarra. Lo mismo ocurre si sales a otra pantalla con cambios sin guardar.",
    covers: ["dialogs:src/app/dashboard/DashboardPage.tsx"],
    focus: '[role="alertdialog"]',
    run: async () => {
      await focusGadget("kpiPending");
      await browser.keys("Escape");
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await $('[role="alertdialog"]').$(`button=${es.dialog.unsaved.keep}`).click();
      await expect($('[role="alertdialog"]')).not.toBeExisting();
      await expect(byTestId("home-board-done")).toBeDisplayed();
    },
  });

  step("restablecer", {
    title: "Restablecer la distribución",
    caption:
      "«Restablecer» vuelve a la distribución de siempre, con todos los gadgets visibles: arriba las cuatro cifras clave; debajo «Ejecución por proyecto» y «Criterios de salida», con «Ejecuciones diarias» bajo ambos; y «Próximas pruebas» a lo alto, a la derecha. Antes pide confirmación, y el cambio se guarda al pulsar «Listo».",
    covers: ["action:home-board-reset", "dialogs:src/app/dashboard/DashboardPage.tsx"],
    focus: '[role="alertdialog"]',
    run: async () => {
      await byTestId("home-board-reset").click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await $('[role="alertdialog"]').$(`button=${es.dashboard.board.reset}`).click();
      await expect($('[role="alertdialog"]')).not.toBeExisting();
      await byTestId("home-board-done").click();
      await expect(byTestId("home-customize")).toHaveAttribute("aria-pressed", "false");
      await expect(byTestId("home-period")).toBeDisplayed();
    },
  });

  step("movil", {
    title: "El Inicio en el móvil",
    caption:
      "En el móvil, el Inicio se reparte en tres pestañas para no hacer un desplazamiento interminable: «Resumen» (las cifras clave y los criterios de salida; su burbuja roja cuenta los problemas: defectos críticos y proyectos en riesgo), «Ejecución» (la ejecución por proyecto y las ejecuciones diarias, con su propio selector de periodo) y «Pruebas» (las próximas pruebas; su burbuja cuenta las pendientes).",
    covers: ["tabs:src/app/dashboard/DashboardPage.tsx"],
    run: async () => {
      await setViewport(MOBILE);
      await byTestId("nav-dashboard").click();
      await byTestId("tab-home-execution").click();
      await expect(byTestId("tab-home-execution")).toHaveAttribute("aria-selected", "true");
    },
    after: async () => {
      await setViewport(DESKTOP);
    },
  });
});
