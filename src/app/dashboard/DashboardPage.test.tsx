import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import type { HomeProject } from "./model/homeData";
import { DashboardPage } from "./DashboardPage";

// Fixed "today" (29 Oct 2026) so the period, the chart and the closing dates
// are stable.
vi.useFakeTimers({ now: new Date(2026, 9, 29, 10, 0), toFake: ["Date"] });

const portal: HomeProject = {
  id: "p-pcl",
  name: "Portal Clientes v3",
  key: "PCL",
  cases: [
    {
      id: "c1",
      scenarioId: "PCL-0002",
      title: "Pago con tarjeta",
      priority: "medium",
    },
    {
      id: "c2",
      scenarioId: "PCL-0001",
      title: "Login con 2FA",
      priority: "critical",
    },
  ],
  closeDate: "2026-11-07",
  hasPlan: true,
  criteria: [{ criterion: "% de casos ejecutados", metric: "≥ 95 %" }],
  openDefects: 3,
  criticalDefects: 1,
};
const banca: HomeProject = {
  id: "p-amb",
  name: "App Móvil Banca",
  key: "AMB",
  cases: [
    {
      id: "c3",
      scenarioId: "AMB-0001",
      title: "Consulta de saldo",
      priority: "high",
    },
  ],
  closeDate: "2026-10-31",
  hasPlan: true,
  criteria: [],
  openDefects: 0,
  criticalDefects: 0,
};
const erp: HomeProject = {
  id: "p-erp",
  name: "Migración ERP",
  key: "ERP",
  cases: [],
  closeDate: null,
  hasPlan: false,
  criteria: [],
  openDefects: 0,
  criticalDefects: 0,
};

const load = vi.fn(async (): Promise<HomeProject[]> => [portal, banca, erp]);
vi.mock("./model/loadHome", () => ({ loadHome: () => load() }));

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
          "Tienes 3 pruebas pendientes en 3 proyectos abiertos.",
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

  it("makes the KPI cards links, and «Tasa de éxito» a disabled card with the reason", async () => {
    const user = userEvent.setup();
    renderHome();
    const projects = await screen.findByTestId("kpi-projects");
    await waitFor(() => expect(projects).toHaveTextContent("3"));
    expect(projects).toHaveTextContent("1 cierra este mes");
    expect(screen.getByTestId("kpi-pending")).toHaveTextContent("3de 3");
    expect(screen.getByTestId("kpi-defects")).toHaveTextContent("1 crítico");

    const rate = screen.getByTestId("kpi-rate");
    expect(rate.tagName).toBe("DIV");
    expect(rate).not.toHaveAttribute("aria-disabled");
    expect(rate).toHaveTextContent("Sin ejecuciones todavía");
    expect(rate).toHaveAttribute(
      "title",
      "Se calculará cuando registres ejecuciones (versión 0.2.0)",
    );
    expect(rate).toHaveTextContent("—");

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
      "/projects/p-pcl/planner",
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
      "Disponible cuando haya ejecuciones que comparar (versión 0.2.0)",
    );

    await user.click(
      within(menu).getByRole("menuitemradio", { name: "Últimos 7 días" }),
    );
    expect(trigger).toHaveTextContent("Últimos 7 días");
    expect(localStorage.getItem("pharos.home.period")).toBe("7d");
    expect(
      screen.getByTestId("home-daily").querySelectorAll(".home-chart__col"),
    ).toHaveLength(7);
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

  it("shows every day label on desktop and every other one from today elsewhere", async () => {
    renderHome();
    const labels = () =>
      Array.from(
        screen.getByTestId("home-daily").querySelectorAll(".home-chart__label"),
      );
    expect(labels().filter((l) => l.textContent)).toHaveLength(14);
    const today = labels().at(-1)!;
    expect(today).toHaveTextContent("29");
    expect(today).toHaveAttribute("data-today");
    expect(
      screen.getByTestId("home-daily").querySelectorAll(".home-chart__nodata"),
    ).toHaveLength(14);
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

  it("picks the exit-criteria project that closes first and lets the user search and switch", async () => {
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

    await user.click(picker);
    const search = screen.getByTestId("exit-search");
    expect(search).toHaveFocus();
    expect(screen.getByRole("button", { name: "En riesgo" })).toBeDisabled();
    await user.type(search, "zzz");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ningún proyecto coincide con «zzz».",
    );
    await user.clear(search);
    await user.type(search, "portal");
    await user.click(screen.getByTestId("exit-choice-p-pcl"));

    expect(picker).toHaveTextContent("Portal Clientes v3");
    const criteria = screen.getByTestId("home-criteria");
    expect(criteria).toHaveTextContent("% de casos ejecutados");
    expect(criteria).toHaveTextContent("Sin datos");
  });

  it("lists the upcoming tests by priority and opens the case", async () => {
    const user = userEvent.setup();
    renderHome();
    const list = await screen.findByTestId("home-upcoming");
    const rows = within(list).getAllByRole("link");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Login con 2FA"),
      expect.stringContaining("Consulta de saldo"),
      expect.stringContaining("Pago con tarjeta"),
    ]);
    expect(rows[0]).toHaveAccessibleName(/^Prioridad crítica/);
    await user.click(rows[0]);
    expect(screen.getByTestId("route")).toHaveTextContent(
      "/projects/p-pcl/cases?case=c2",
    );
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
      name: "Pruebas · 3 pruebas pendientes",
    });
    expect(within(tabs).getByRole("tab", { name: "Resumen" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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
