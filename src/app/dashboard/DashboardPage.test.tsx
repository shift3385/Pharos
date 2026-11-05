import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import type { HomeProject } from "./model/homeData";
import type { HomeMetrics } from "./model/metrics";
import {
  counts,
  day,
  homeMetrics,
  projectMetrics,
  ref,
  rollup,
} from "./model/metricsFixture";
import { clearHomeMetricsCache } from "./model/loadHomeMetrics";
import { DashboardPage } from "./DashboardPage";

// Fixed "today" (29 Oct 2026) so the period, the chart and the closing dates
// are stable.
vi.useFakeTimers({ now: new Date(2026, 9, 29, 10, 0), toFake: ["Date"] });

const portal: HomeProject = {
  id: "p-pcl",
  name: "Portal Clientes v3",
  key: "PCL",
  closeDate: "2026-11-07",
  hasPlan: true,
  criteria: [
    { criterion: "% de casos ejecutados", metric: "≥ 95 %" },
    { criterion: "Defectos críticos abiertos", metric: "0" },
    { criterion: "Revisión del cliente", metric: "" },
  ],
};
const banca: HomeProject = {
  id: "p-amb",
  name: "App Móvil Banca",
  key: "AMB",
  closeDate: "2026-10-31",
  hasPlan: true,
  criteria: [],
};
const erp: HomeProject = {
  id: "p-erp",
  name: "Migración ERP",
  key: "ERP",
  closeDate: null,
  hasPlan: false,
  criteria: [],
};

const load = vi.fn(async (): Promise<HomeProject[]> => [portal, banca, erp]);
vi.mock("./model/loadHome", () => ({ loadHome: () => load() }));

// The metrics payload (RED-W6) as the shared derivation would return it:
// portal has 1 of 2 cases run (passed), 1 critical defect and one criterion
// failing; banca has its case blocked. 30 days end today (29 Oct).
function metricsPayload(): HomeMetrics {
  const m = homeMetrics({
    windows: {
      "14d": rollup({ passed: 3, failed: 1, executed: 4, passRate: 0.75 }),
      "7d": rollup({ passed: 1, executed: 1, passRate: 1 }),
      today: rollup(),
    },
    projects: [
      projectMetrics("p-pcl", {
        counts: counts({ passed: 1, notRun: 1, total: 2, executed: 1 }),
        defects: {
          open: 3,
          openBySeverity: { critical: 1, major: 2, minor: 0, trivial: 0 },
        },
        exitCriteria: [
          { index: 0, criterion: "% de casos ejecutados", metric: "≥ 95 %", kind: "executed", op: ">=", target: 95, value: 50, met: false },
          { index: 1, criterion: "Defectos críticos abiertos", metric: "0", kind: "criticalDefects", op: "=", target: 0, value: 1, met: false },
          { index: 2, criterion: "Revisión del cliente", metric: "", kind: null, op: null, target: null, value: null, met: null },
        ],
        queue: {
          notRun: [ref("c2", "PCL-0001", "Login con 2FA", "critical")],
          blocked: [],
          retest: [ref("c1", "PCL-0002", "Pago con tarjeta", "medium")],
          counts: { notRun: 1, blocked: 0, retest: 1 },
        },
      }),
      projectMetrics("p-amb", {
        counts: counts({ blocked: 1, total: 1, executed: 1 }),
        queue: {
          notRun: [],
          blocked: [ref("c3", "AMB-0001", "Consulta de saldo", "high")],
          retest: [],
          counts: { notRun: 0, blocked: 1, retest: 0 },
        },
      }),
    ],
  });
  m.daily[29] = day({ passed: 2, failed: 1, skipped: 1, manual: 1, imported: 3 });
  m.daily[25] = day({ passed: 1, manual: 1 });
  return m;
}

const fetchMetrics = vi.fn(async (_path: string): Promise<unknown> => metricsPayload());
vi.mock("@modules/sync-offline", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  serverApi: { get: (path: string) => fetchMetrics(path) },
}));

function RouteProbe() {
  const { pathname, search } = useLocation();
  return <p data-testid="route">{pathname + search}</p>;
}

function renderHome() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="*" element={<RouteProbe />} />
    </Routes>,
  );
}

describe("Inicio (RED-V1, SPEC §8)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    load.mockClear();
    fetchMetrics.mockClear();
    clearHomeMetricsCache();
    localStorage.removeItem("pharos.home.period");
    setViewportWidth(1440);
  });

  it("greets, sums the pending tests and shows the note only with several projects", async () => {
    renderHome();
    expect(
      screen.getByRole("heading", { level: 1, name: "Hola, Quality" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Jueves, 29 de octubre")).toBeInTheDocument();
    expect(
      await screen.findByText(
        (_, el) =>
          el?.textContent ===
          "Tienes 2 pruebas pendientes en 3 proyectos abiertos.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/· periodo: últimos 14 días/)).toBeInTheDocument();

    load.mockResolvedValueOnce([portal]);
    renderHome();
    await waitFor(() =>
      expect(screen.getAllByTestId("kpi-projects")).toHaveLength(2),
    );
    expect(screen.getAllByText(/· periodo:/)).toHaveLength(1);
  });

  it("makes the KPI cards links, with the period's pass rate", async () => {
    const user = userEvent.setup();
    renderHome();
    const projects = await screen.findByTestId("kpi-projects");
    await waitFor(() => expect(projects).toHaveTextContent("3"));
    expect(projects).toHaveTextContent("1 cierra este mes");
    const pending = screen.getByTestId("kpi-pending");
    await waitFor(() => expect(pending).toHaveTextContent("2de 3"));
    expect(pending).toHaveTextContent("1 bloqueada");
    expect(screen.getByTestId("kpi-defects")).toHaveTextContent("1 crítico");

    const rate = screen.getByTestId("kpi-rate");
    expect(rate).toHaveAttribute("href", "/projects");
    expect(rate).toHaveTextContent("75,0%");
    expect(rate).toHaveTextContent("de 4 ejecutados · últimos 14 días");
    expect(rate.getAttribute("title")).toMatch(/últimos 14 días/);
    expect(fetchMetrics).toHaveBeenCalledTimes(1);
    expect(fetchMetrics.mock.calls[0][0]).toMatch(
      /^\/api\/home\/metrics\?dayStarts=\d+(%2C\d+){29}&now=\d+&windows=today%3A29%2C7d%3A23/,
    );

    await user.click(projects);
    expect(screen.getByTestId("route")).toHaveTextContent("/projects");
  });

  it("with one project, pending and defects go straight into it", async () => {
    load.mockResolvedValueOnce([portal]);
    renderHome();
    await waitFor(() =>
      expect(screen.getByTestId("kpi-pending")).toHaveAttribute(
        "href",
        "/projects/p-pcl/cases",
      ),
    );
    expect(screen.getByTestId("kpi-defects")).toHaveAttribute(
      "href",
      "/projects/p-pcl/defects",
    );
  });

  it("chooses the period from a menu, remembers it and keeps the unavailable ones disabled", async () => {
    const user = userEvent.setup();
    renderHome();
    const trigger = screen.getByTestId("home-period");
    expect(trigger).toHaveAccessibleName(
      "Periodo de los datos: Últimos 14 días",
    );
    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "Periodo" });
    expect(
      within(menu).getByRole("menuitemradio", { name: "Últimos 14 días" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(menu).getByRole("menuitem", { name: "Ciclo actual" }),
    ).toBeDisabled();
    const compare = screen.getByTestId("period-compare");
    expect(compare).toBeDisabled();
    expect(compare).toHaveAttribute(
      "title",
      "Próximamente: comparará con el periodo anterior",
    );

    await user.click(
      within(menu).getByRole("menuitemradio", { name: "Últimos 7 días" }),
    );
    expect(trigger).toHaveTextContent("Últimos 7 días");
    expect(localStorage.getItem("pharos.home.period")).toBe("7d");
    expect(
      screen.getByTestId("home-daily").querySelectorAll(".home-chart__col"),
    ).toHaveLength(7);
    // The rate follows the period from the same payload: no refetch.
    expect(screen.getByTestId("kpi-rate")).toHaveTextContent("100,0%");
    expect(screen.getByTestId("home-daily-total")).toHaveTextContent("5");

    await user.click(trigger);
    await user.click(screen.getByRole("menuitemradio", { name: "Hoy" }));
    expect(screen.getByTestId("kpi-rate")).toHaveTextContent("—");
    expect(screen.getByTestId("kpi-rate")).toHaveTextContent(
      "Sin ejecuciones: hoy",
    );
    expect(fetchMetrics).toHaveBeenCalledTimes(1);
  });

  it("on mobile the period opens as a bottom sheet", async () => {
    const user = userEvent.setup();
    setViewportWidth(390);
    renderHome();
    await user.click(screen.getByTestId("home-period"));
    expect(
      screen.getByRole("dialog", { name: "Periodo de los datos" }),
    ).toBeInTheDocument();
  });

  it("draws each day's executions stacked, with every day label on desktop", async () => {
    renderHome();
    const chart = screen.getByTestId("home-daily");
    await waitFor(() =>
      expect(chart.querySelectorAll(".home-chart__stack")).toHaveLength(2),
    );
    expect(chart.querySelectorAll(".home-chart__nodata")).toHaveLength(12);
    expect(screen.getByTestId("home-daily-total")).toHaveTextContent("5");
    expect(chart).toHaveAccessibleName(
      "Ejecuciones por día, últimos 14 días: 5 en total",
    );
    const cols = chart.querySelectorAll(".home-chart__col");
    expect(cols[13]).toHaveAttribute(
      "title",
      "jueves, 29 de octubre: 4 ejecuciones · 2 pasan, 1 fallan, 1 otras · 1 manuales, 3 importadas",
    );
    const today = cols[13].querySelector(".home-chart__stack")!;
    expect(today).toHaveStyle({ height: "80%" }); // 4 of an axis of 5
    expect(
      Array.from(today.children).map((c) => c.getAttribute("data-tone")),
    ).toEqual(["other", "fail", "pass"]);
    // Screen readers get the numbers as a table.
    expect(
      screen.getByRole("table", { name: "Ejecuciones por día, últimos 14 días" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Otras", { selector: "li" })).toBeInTheDocument();

    const labels = Array.from(chart.querySelectorAll(".home-chart__label"));
    expect(labels.filter((l) => l.textContent)).toHaveLength(14);
    expect(labels.at(-1)).toHaveTextContent("29");
    expect(labels.at(-1)).toHaveAttribute("data-today");
    expect(screen.getByText("Octubre")).toBeInTheDocument();
  });

  it("alternates the day labels on tablet, keeping today", () => {
    setViewportWidth(820);
    renderHome();
    const labels = Array.from(
      screen.getByTestId("home-daily").querySelectorAll(".home-chart__label"),
    );
    expect(labels.filter((l) => l.textContent)).toHaveLength(7);
    expect(labels.at(-1)).toHaveTextContent("29");
    expect(labels.at(-2)).toHaveTextContent("");
  });

  it("picks the exit-criteria project that closes first, evaluates its criteria and filters by status", async () => {
    const user = userEvent.setup();
    renderHome();
    const picker = await screen.findByTestId("exit-picker");
    await waitFor(() => expect(picker).toHaveTextContent("App Móvil Banca"));
    expect(screen.getByText("Cierre: 31 oct")).toBeInTheDocument();
    expect(
      screen.getByText(
        "El plan de este proyecto no define criterios de salida.",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("exit-ring")).toHaveAccessibleName(
        /^Porcentaje ejecutado: 100\s%$/,
      ),
    );

    await user.click(picker);
    const search = screen.getByTestId("exit-search");
    expect(search).toHaveFocus();
    await user.type(search, "zzz");
    expect(screen.getByTestId("exit-picker-status")).toHaveTextContent(
      "Ningún proyecto coincide con «zzz».",
    );
    await user.clear(search);
    const risk = screen.getByTestId("exit-filter-risk");
    expect(risk).toHaveTextContent("En riesgo1");
    await user.click(risk);
    expect(risk).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("exit-choice-p-amb")).toBeNull();
    await user.click(screen.getByTestId("exit-filter-met"));
    expect(screen.getByTestId("exit-picker-status")).toHaveTextContent(
      "Ningún proyecto cumple todavía sus criterios.",
    );
    await user.click(screen.getByTestId("exit-filter-risk"));
    await user.click(screen.getByTestId("exit-choice-p-pcl"));

    expect(picker).toHaveTextContent("Portal Clientes v3");
    expect(screen.getByTestId("exit-ring")).toHaveAccessibleName(
      /^Porcentaje ejecutado: 50\s%$/,
    );
    expect(screen.getByText("Hay criterios que no se cumplen")).toBeInTheDocument();
    expect(
      screen.getByText("0 de 2 criterios evaluables se cumplen."),
    ).toBeInTheDocument();
    const rows = within(screen.getByTestId("home-criteria")).getAllByRole(
      "listitem",
    );
    expect(rows[0]).toHaveTextContent("% de casos ejecutados≥ 95 %50 %No cumple");
    expect(rows[1]).toHaveTextContent("Defectos críticos abiertos01No cumple");
    expect(rows[2]).toHaveTextContent("Revisión del clienteSin datos");
  });

  it("lists the upcoming tests of each tab by priority and opens the case", async () => {
    const user = userEvent.setup();
    renderHome();
    const tabs = screen.getByRole("tablist", { name: "Estado de las pruebas" });
    const list = await screen.findByTestId("home-upcoming");
    expect(within(list).getAllByRole("link").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Login con 2FA"),
    ]);
    expect(within(tabs).getByRole("tab", { name: /^Bloqueadas/ })).toHaveTextContent("1");

    await user.click(within(tabs).getByRole("tab", { name: /^Bloqueadas/ }));
    expect(screen.getByTestId("home-upcoming")).toHaveTextContent(
      "Consulta de saldo",
    );
    await user.click(within(tabs).getByRole("tab", { name: /^Re-test/ }));
    const retest = within(screen.getByTestId("home-upcoming")).getAllByRole(
      "link",
    );
    expect(retest).toHaveLength(1);
    expect(retest[0]).toHaveAccessibleName(/^Prioridad media/);
    await user.click(retest[0]);
    expect(screen.getByTestId("route")).toHaveTextContent(
      "/projects/p-pcl/cases?case=c1",
    );
  });

  it("draws each project's latest results as one stacked bar", async () => {
    renderHome();
    const rows = within(await screen.findByTestId("home-exec")).getAllByRole(
      "listitem",
    );
    const pcl = rows.find((r) => r.textContent?.includes("Portal"))!;
    await waitFor(() => expect(pcl).toHaveTextContent("1 / 2"));
    expect(pcl).toHaveTextContent("50 %");
    expect(
      within(pcl).getByRole("img", {
        name: "Portal Clientes v3: 1 de 2 casos ejecutados; 1 pasan, 0 fallan, 0 bloqueados",
      }),
    ).toBeInTheDocument();
    expect(pcl.querySelector('[data-tone="pass"]')).toHaveStyle({ width: "50%" });
  });

  it("says when the runs fail to load and retries, keeping the rest", async () => {
    const user = userEvent.setup();
    fetchMetrics.mockRejectedValueOnce(new Error("offline"));
    renderHome();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts[0]).toHaveTextContent("No se pudieron cargar las ejecuciones.");
    expect(screen.getByTestId("kpi-rate")).toHaveTextContent("No disponible");
    // Projects and plans still render.
    expect(await screen.findByTestId("home-exec")).toHaveTextContent(
      "Portal Clientes v3",
    );
    // Unknown is not zero: no «0 %», no pending count.
    const pcl = within(screen.getByTestId("home-exec"))
      .getAllByRole("listitem")
      .find((r) => r.textContent?.includes("Portal"))!;
    expect(pcl).toHaveTextContent("Portal Clientes v3—");
    expect(pcl).not.toHaveTextContent("0 %");
    expect(screen.getByTestId("kpi-pending")).toHaveTextContent("—");
    expect(screen.getByTestId("kpi-pending")).not.toHaveTextContent("de");
    expect(screen.getByTestId("kpi-defects")).toHaveTextContent("—No disponible");
    // Accessible names say «unknown», never zero.
    expect(within(pcl).getByRole("img")).toHaveAccessibleName(
      "Portal Clientes v3: ejecución sin datos todavía",
    );
    expect(screen.getByTestId("home-daily")).toHaveAccessibleName(
      "Ejecuciones por día, últimos 14 días: no disponibles",
    );
    // No verdicts at all (not even «Sin datos») until the metrics load.
    expect(screen.queryByText("Sin datos")).toBeNull();
    expect(screen.queryByText("No cumple")).toBeNull();
    expect(
      screen.getByText((_, el) => el?.textContent === "Tienes 3 proyectos abiertos."),
    ).toBeInTheDocument();
    await user.click(within(alerts[0]).getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.queryAllByRole("alert")).toHaveLength(0));
    expect(screen.getByTestId("kpi-rate")).toHaveTextContent("75,0%");
    expect(fetchMetrics).toHaveBeenCalledTimes(2);
  });

  it("while loading, labels say so and the mobile tabs show no bubbles", async () => {
    fetchMetrics.mockReturnValueOnce(new Promise(() => {}));
    renderHome();
    const pcl = within(await screen.findByTestId("home-exec"))
      .getAllByRole("listitem")
      .find((r) => r.textContent?.includes("Portal"))!;
    expect(within(pcl).getByRole("img")).toHaveAccessibleName(
      "Portal Clientes v3: ejecución sin datos todavía",
    );
    expect(screen.getByTestId("home-daily")).toHaveAccessibleName(
      "Ejecuciones por día, últimos 14 días: cargando",
    );
    expect(screen.getByTestId("exit-ring")).toHaveAccessibleName(
      "Porcentaje ejecutado: cargando",
    );
    expect(screen.getByTestId("kpi-rate")).toHaveTextContent("…");
    expect(screen.getByTestId("kpi-defects")).toHaveTextContent("…");
    expect(screen.queryByText("Sin datos")).toBeNull();
  });

  it("on mobile, no invented bubbles while loading or after an error", async () => {
    setViewportWidth(390);
    // Factories: a rejected promise is only made when the page asks for it.
    const answers = [
      () => new Promise<HomeMetrics>(() => {}),
      () => Promise.reject(new Error("offline")),
    ];
    for (const answer of answers) {
      fetchMetrics.mockImplementationOnce(answer);
      const { unmount } = renderHome();
      const tabs = await screen.findByRole("tablist", { name: "Secciones del Inicio" });
      await screen.findByTestId("kpi-projects");
      expect(within(tabs).getByRole("tab", { name: "Resumen" })).toBeInTheDocument();
      expect(within(tabs).getByRole("tab", { name: "Pruebas" })).toBeInTheDocument();
      unmount();
      clearHomeMetricsCache();
    }
  });

  it("says when the numbers are being refreshed, and their time after a failed refresh", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByTestId("kpi-rate")).toHaveTextContent("75,0%"));
    expect(screen.getByTestId("home-fresh")).toHaveTextContent("");

    let fail!: (e: unknown) => void;
    fetchMetrics.mockReturnValueOnce(new Promise((_, rej) => (fail = rej)));
    act(() => {
      window.dispatchEvent(new Event("pharos:synced"));
    });
    await waitFor(() => expect(screen.getByTestId("home-fresh")).toHaveTextContent("Actualizando…"));
    await act(async () => {
      fail(new Error("offline"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("home-fresh")).toHaveTextContent(/^Datos de las 10:00: no se pudieron actualizar$/),
    );
    // The last numbers stay, with no error banner.
    expect(screen.getByTestId("kpi-rate")).toHaveTextContent("75,0%");
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });

  it("opens the per-day numbers as a table (a native disclosure)", async () => {
    const user = userEvent.setup();
    renderHome();
    const data = await screen.findByTestId("home-daily-data");
    const summary = within(data).getByText("Ver los datos");
    // A native <summary>: focusable and opened with Enter/Space in every
    // browser (jsdom does not run that activation, so the test clicks).
    expect(summary.tagName).toBe("SUMMARY");
    await user.click(summary);
    expect(data).toHaveAttribute("open");
    const table = within(data).getByRole("table", { name: "Ejecuciones por día, últimos 14 días" });
    expect(within(table).getAllByRole("row")).toHaveLength(3); // header + 2 days
  });

  it("says so when there are projects but no runs yet", async () => {
    fetchMetrics.mockResolvedValueOnce(
      homeMetrics({
        projects: [
          // banca (the default exit project) with the A3 defaults evaluated.
          projectMetrics("p-amb", {
            counts: counts({ notRun: 1, total: 1 }),
            exitCriteria: [
              { index: null, criterion: "% de casos ejecutados", metric: "≥ 95 %", kind: "executed", op: ">=", target: 95, value: 0, met: false },
              { index: null, criterion: "Defectos críticos abiertos", metric: "0", kind: "criticalDefects", op: "=", target: 0, value: 0, met: true },
            ],
          }),
        ],
      }),
    );
    renderHome();
    // Nothing run, but the criteria are evaluated: the card says how many hold.
    expect(await screen.findByText("Aún no hay ejecuciones")).toBeInTheDocument();
    expect(
      screen.getByText("1 de 2 criterios evaluables se cumplen."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Se usan los criterios por defecto/)).toBeInTheDocument();
    expect(
      await screen.findByText("Aún no hay ejecuciones registradas en tus proyectos."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-rate")).toHaveTextContent(
      "Sin ejecuciones: últimos 14 días",
    );
    expect(screen.getByTestId("home-daily-total")).toHaveTextContent("0");
    expect(screen.getByText("No hay casos sin ejecutar.")).toBeInTheDocument();
  });

  it("shows «—» for a project without cases instead of 0 / 0", async () => {
    renderHome();
    const rows = within(await screen.findByTestId("home-exec")).getAllByRole(
      "listitem",
    );
    const erpRow = rows.find((r) => r.textContent?.includes("Migración ERP"))!;
    expect(erpRow).toHaveTextContent("—");
    expect(erpRow).not.toHaveTextContent("0 / 0");
  });

  it("starts a new project through the projects page", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole("button", { name: "Nuevo proyecto" }));
    expect(screen.getByTestId("route")).toHaveTextContent("/projects?new=1");
  });

  it("says so without projects", async () => {
    load.mockResolvedValueOnce([]);
    renderHome();
    expect(
      await screen.findByText(
        "Aún no tienes proyectos. Crea el primero para empezar.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Sin proyectos abiertos.")).toBeInTheDocument();
  });

  it("on mobile splits the sections into three tabs with the pending bubble", async () => {
    const user = userEvent.setup();
    setViewportWidth(390);
    renderHome();
    const tabs = screen.getByRole("tablist", { name: "Secciones del Inicio" });
    const testsTab = await within(tabs).findByRole("tab", {
      name: "Pruebas · 2 pruebas pendientes",
    });
    // Red bubble: 1 critical defect + 1 project at risk.
    expect(
      within(tabs).getByRole("tab", { name: "Resumen · 2 problemas" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("kpi-projects")).toBeInTheDocument();
    expect(screen.queryByTestId("home-upcoming")).toBeNull();

    await user.click(testsTab);
    expect(screen.getByTestId("home-upcoming")).toBeInTheDocument();
    expect(screen.queryByTestId("kpi-projects")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Inicio" }),
    ).toBeInTheDocument();

    await user.click(within(tabs).getByRole("tab", { name: "Ejecución" }));
    expect(screen.getByTestId("home-exec")).toBeInTheDocument();
    expect(screen.getByTestId("home-daily")).toBeInTheDocument();
  });

  it("on mobile the period is also chosen in «Ejecución», sharing the state with «Resumen»", async () => {
    const user = userEvent.setup();
    setViewportWidth(390);
    renderHome();
    await user.click(await screen.findByRole("tab", { name: "Ejecución" }));
    const trigger = screen.getByTestId("home-period");
    expect(trigger).toHaveAccessibleName(
      "Periodo de los datos: Últimos 14 días",
    );
    // It sits above the chart it changes.
    expect(
      trigger.compareDocumentPosition(screen.getByTestId("home-daily")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(trigger);
    const sheet = screen.getByRole("dialog", { name: "Periodo de los datos" });
    await user.click(
      within(sheet).getByRole("button", { name: "Últimos 7 días" }),
    );
    expect(
      screen.getByTestId("home-daily").querySelectorAll(".home-chart__col"),
    ).toHaveLength(7);

    await user.click(screen.getByRole("tab", { name: /^Resumen/ }));
    expect(screen.getByTestId("home-period")).toHaveTextContent(
      "Últimos 7 días",
    );
  });

  it("passes axe on desktop and in each mobile tab", async () => {
    const user = userEvent.setup();
    const { unmount } = renderHome();
    await screen.findByTestId("home-upcoming");
    await expectNoAxeViolations();
    unmount();

    setViewportWidth(390);
    renderHome();
    await screen.findByTestId("kpi-projects");
    await expectNoAxeViolations();
    for (const name of [/^Ejecución/, /^Pruebas/]) {
      await user.click(screen.getByRole("tab", { name }));
      await expectNoAxeViolations();
    }
  });
});
