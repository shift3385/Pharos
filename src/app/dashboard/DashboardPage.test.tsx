import "@test/slow";
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
// failing; banca has its case blocked. 60 days end today (29 Oct): the 30 of
// the longest period and the 30 before them (RED-W4).
function metricsPayload(): HomeMetrics {
  const m = homeMetrics({
    windows: {
      "14d": rollup({ passed: 3, failed: 1, executed: 4, passRate: 0.75, unlinked: 2 }),
      "prev-14d": rollup({ passed: 1, failed: 1, executed: 2, passRate: 0.5 }),
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
          { index: 0, criterion: "% de casos ejecutados", metric: "≥ 95 %", kind: "executed", op: ">=", target: 95, value: 50, met: false, blocking: true },
          { index: 1, criterion: "Defectos críticos abiertos", metric: "0", kind: "criticalDefects", op: "=", target: 0, value: 1, met: false, blocking: true },
          { index: 2, criterion: "Revisión del cliente", metric: "", kind: null, op: null, target: null, value: null, met: null, blocking: true },
        ],
        queue: {
          notRun: [ref("c2", "PCL-0001", "Login con 2FA", "critical")],
          blocked: [],
          retest: [{ ...ref("c1", "PCL-0002", "Pago con tarjeta", "medium"), lastAt: "2026-10-27T10:00:00.000Z" }],
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
  m.daily[59] = day({ passed: 2, failed: 1, skipped: 1, manual: 1, imported: 3 });
  m.daily[55] = day({ passed: 1, manual: 1 });
  // The 14 days before the period (RED-W4): one execution.
  m.daily[40] = day({ passed: 1, manual: 1 });
  return m;
}

const fetchMetrics = vi.fn(async (_path: string): Promise<unknown> => metricsPayload());
vi.mock("@modules/sync-offline", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  serverApi: { get: (path: string) => fetchMetrics(path) },
}));

/** The days of «Ejecuciones diarias»: its screen-reader table, a row a day. */
const dayRows = () =>
  screen.getByTestId("home-daily").closest(".home-daily")!.querySelectorAll(".home-lines__data tbody tr");

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
    localStorage.removeItem("pharos.home.compare");
    setViewportWidth(1440);
  });

  it("greets in one line and puts what the numbers add up on the period button (UX-28)", async () => {
    renderHome();
    expect(
      screen.getByRole("heading", { level: 1, name: "Hola, Quality" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Jueves, 29 de octubre")).toHaveClass("home-header__date");
    await waitFor(() => expect(screen.getByTestId("kpi-pending")).toHaveTextContent("2de 3"));
    // No summary sentences any more.
    const greeting = document.querySelector(".home-header__text")!;
    expect(greeting).not.toHaveTextContent(/Tienes .* pendientes/);
    expect(greeting).not.toHaveTextContent(/Suma de tus/);
    const periodBtn = screen.getByTestId("home-period");
    expect(periodBtn).toHaveAttribute("title", "Suma de tus 3 proyectos abiertos · periodo: últimos 14 días");
    expect(periodBtn).toHaveAccessibleDescription("Suma de tus 3 proyectos abiertos · periodo: últimos 14 días");

    load.mockResolvedValueOnce([portal]);
    renderHome();
    await waitFor(() =>
      expect(screen.getAllByTestId("kpi-projects")).toHaveLength(2),
    );
    // With one project there is nothing to add up.
    expect(screen.getAllByTestId("home-period")[1]).not.toHaveAttribute("title");
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
    // By case (NC-029): unlinked tests stay out, in a note under the card.
    expect(rate).toHaveTextContent("de 4 casos ejecutados · últimos 14 días");
    expect(rate.getAttribute("title")).toMatch(/últimos 14 días/);
    expect(rate.getAttribute("title")).toMatch(/Los tests sin vincular no cuentan/);
    const unlinked = screen.getByTestId("kpi-rate-unlinked");
    // On the desktop board the card has 4 rows: a short badge (UX-27) that
    // still reads in full.
    expect(unlinked).toHaveTextContent("+2 sin vincular");
    expect(unlinked).toHaveAccessibleName("Además, 2 tests sin vincular");
    expect(unlinked).toHaveAttribute("href", "/projects");
    expect(rate).not.toContainElement(unlinked);
    expect(fetchMetrics).toHaveBeenCalledTimes(1);
    expect(fetchMetrics.mock.calls[0][0]).toMatch(
      /^\/api\/home\/metrics\?dayStarts=\d+(%2C\d+){59}&now=\d+&windows=today%3A59%2Cprev-today%3A58%3A59%2C7d%3A53/,
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
    // RED-W4: the comparison is an on/off item, off until turned on.
    const compare = within(menu).getByRole("menuitemcheckbox", {
      name: "Comparar con el periodo anterior",
    });
    expect(compare).toHaveAttribute("aria-checked", "false");
    expect(compare).toHaveAccessibleDescription("Con los 14 días anteriores (2 oct – 15 oct)");

    await user.click(
      within(menu).getByRole("menuitemradio", { name: "Últimos 7 días" }),
    );
    expect(trigger).toHaveTextContent("Últimos 7 días");
    expect(localStorage.getItem("pharos.home.period")).toBe("7d");
    expect(dayRows()).toHaveLength(7);
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

  it("draws one line per state, a dot on each day above 0, and the total (UX-32)", async () => {
    renderHome();
    await waitFor(() =>
      expect(screen.getByTestId("home-daily").querySelectorAll(".home-lines__series")).toHaveLength(3),
    );
    const chart = screen.getByTestId("home-daily");
    expect(screen.getByTestId("home-daily-total")).toHaveTextContent("5");
    expect(chart).toHaveAccessibleName("Ejecuciones por día, últimos 14 días: 5 en total");
    // 29 Oct: 2 pass, 1 fail, 1 other; 25 Oct: 1 pass. No dot on empty days.
    const dots = (s: string) => chart.querySelectorAll(`[data-series="${s}"] circle`).length;
    expect([dots("passed"), dots("failed"), dots("others")]).toEqual([2, 1, 1]);
    // The legend filters; «Sin ejecuciones» is gone.
    expect(screen.getByRole("button", { name: "Pasa" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Sin ejecuciones")).toBeNull();
    // Screen readers get a table with every day.
    expect(dayRows()).toHaveLength(14);
    expect(screen.getByRole("button", { name: "Ver los datos" })).toHaveAttribute("aria-haspopup", "dialog");
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

  it("lists the upcoming tests of each list by priority and opens the case", async () => {
    const user = userEvent.setup();
    renderHome();
    const list = await screen.findByTestId("home-upcoming");
    expect(within(list).getAllByRole("link").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Login con 2FA"),
    ]);
    const pick = async (name: RegExp) => {
      await user.click(screen.getByRole("combobox", { name: "Estado de las pruebas" }));
      await user.click(screen.getByRole("option", { name }));
    };
    await pick(/^Bloqueadas · 1/);
    expect(screen.getByTestId("home-upcoming")).toHaveTextContent(
      "Consulta de saldo",
    );
    await pick(/^Por confirmar · 1/);
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

  it("chooses the list with Pharos' selector, «Ver todas» is an arrow, a re-test says when it failed (UX-32)", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByTestId("home-upcoming");
    // The title whole, and «Ver todas» only an arrow with its name.
    expect(screen.getByRole("heading", { name: "Próximas pruebas" })).toBeInTheDocument();
    const all = screen.getByRole("link", { name: "Ver todas" });
    expect(all).toHaveAttribute("title", "Ver todas");
    expect(all).not.toHaveTextContent("Ver todas");
    // No tabs: one selector with the count in a pill.
    expect(screen.queryByRole("tablist")).toBeNull();
    const select = screen.getByRole("combobox", { name: "Estado de las pruebas" });
    expect(select).toHaveTextContent("No ejecutadas1");
    expect(screen.getByTestId("home-upcoming-count")).toHaveTextContent("1");
    await user.click(select);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "No ejecutadas · 1",
      "Bloqueadas · 1",
      "Por confirmar · 1",
    ]);
    expect(select).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("option", { name: /^Por confirmar/ }));
    expect(screen.getByTestId("home-upcoming")).toHaveTextContent("PCL-0002·Portal Clientes v3· falló el 27 oct");
    // Only «Por confirmar» says it.
    await user.click(select);
    await user.click(screen.getByRole("option", { name: /^Bloqueadas/ }));
    expect(screen.getByTestId("home-upcoming")).not.toHaveTextContent("falló");
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

  it("compares with the previous period: a delta on the rate and the daily total, a dotted line, no refetch (RED-W4)", async () => {
    const user = userEvent.setup();
    renderHome();
    await waitFor(() => expect(screen.getByTestId("kpi-rate")).toHaveTextContent("75,0%"));
    expect(screen.queryByTestId("kpi-rate-delta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("home-daily-previous")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("home-period"));
    const menu = screen.getByRole("menu", { name: "Periodo" });
    await user.click(within(menu).getByRole("menuitemcheckbox", { name: "Comparar con el periodo anterior" }));
    // An on/off item keeps the menu open.
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Comparar con el periodo anterior" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(localStorage.getItem("pharos.home.compare")).toBe("1");
    expect(screen.getByTestId("home-period-compare")).toHaveTextContent("vs anterior");

    const rate = screen.getByTestId("kpi-rate-delta");
    expect(rate).toHaveTextContent("▲ 25,0 pp");
    expect(rate).toHaveAttribute("data-direction", "up");
    expect(rate).toHaveAttribute("title", "25,0 puntos más que en el periodo anterior (50,0 % del 2 oct – 15 oct)");
    // 5 executions against 1 before: +400 %, in a neutral tone.
    const daily = screen.getByTestId("home-daily-delta");
    expect(daily).toHaveTextContent("▲ 400 % vs anterior");
    expect(daily).toHaveAttribute("data-kind", "count");
    expect(screen.getByTestId("home-daily-previous")).toBeInTheDocument();
    expect(fetchMetrics).toHaveBeenCalledTimes(1);
  });

  it("opens the per-day numbers as a table (a native disclosure off the board)", async () => {
    const user = userEvent.setup();
    setViewportWidth(1000);
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
              { index: null, criterion: "% de casos ejecutados", metric: "≥ 95 %", kind: "executed", op: ">=", target: 95, value: 0, met: false, blocking: true },
              { index: null, criterion: "Defectos críticos abiertos", metric: "0", kind: "criticalDefects", op: "=", target: 0, value: 0, met: true, blocking: true },
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
    // The bars at 0 % show it; only screen readers hear it (UX-28).
    expect(
      await screen.findByText("Aún no hay ejecuciones registradas en tus proyectos."),
    ).toHaveClass("sr-only");
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
      await screen.findByText(/· Aún no tienes proyectos. Crea el primero para empezar.$/),
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
    expect(dayRows()).toHaveLength(7);

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

describe("Inicio when the projects fail to load", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    load.mockClear();
    fetchMetrics.mockClear();
    clearHomeMetricsCache();
    setViewportWidth(1440);
  });

  it("shows the error, not an account without projects, and «Reintentar» loads them", async () => {
    load.mockRejectedValueOnce(new Error("down"));
    renderHome();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar tus proyectos.");
    expect(screen.queryByTestId("kpi-projects")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Hola, Quality" })).toBeInTheDocument();
    await expectNoAxeViolations();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByTestId("kpi-projects")).toHaveTextContent("3"));
    expect(screen.queryByText("No se pudieron cargar tus proyectos.")).not.toBeInTheDocument();
  });

  it("a failed reload keeps the widgets and adds the error", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByTestId("kpi-projects")).toHaveTextContent("3"));
    load.mockRejectedValueOnce(new Error("down"));
    act(() => {
      window.dispatchEvent(new CustomEvent("pharos:synced"));
    });
    expect(await screen.findByText("No se pudieron cargar tus proyectos.")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-projects")).toHaveTextContent("3");
  });

  it("on mobile the error is in «Resumen»", async () => {
    setViewportWidth(390);
    load.mockRejectedValueOnce(new Error("down"));
    renderHome();
    expect(await screen.findByText("No se pudieron cargar tus proyectos.")).toBeInTheDocument();
  });
});
