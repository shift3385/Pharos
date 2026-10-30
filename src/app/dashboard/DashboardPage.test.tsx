import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import type { ProjectOverview } from "@modules/projects";
import { DashboardPage } from "./DashboardPage";

const rows: ProjectOverview[] = [
  {
    id: "p-checkout",
    name: "Checkout",
    lastAccess: "2026-10-28T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    planStatus: "approved",
    approved: 3,
    total: 4,
  },
  {
    id: "p-pagos",
    name: "Pagos móviles",
    lastAccess: null,
    updatedAt: "2026-10-20T10:00:00.000Z",
    planStatus: null,
    approved: 0,
    total: 0,
  },
];

const overview = vi.fn(async () => rows);
vi.mock("@modules/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@modules/projects")>()),
  projectOverview: () => overview(),
}));

function ProjectsProbe() {
  const { pathname, search } = useLocation();
  return <p data-testid="projects-route">{pathname + search}</p>;
}

function renderHome() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/projects" element={<ProjectsProbe />} />
      <Route path="/projects/:projectId/:section" element={<ProjectsProbe />} />
    </Routes>,
  );
}

describe("Home (UX-08, spec §5)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    overview.mockClear();
  });

  it("lists projects with last access, plan status and progress", async () => {
    renderHome();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Checkout");
    expect(items[0]).toHaveTextContent(/Último acceso:/);
    expect(items[0]).toHaveTextContent("Aprobado");
    expect(items[0]).toHaveTextContent("3 de 4 casos aprobados");
    expect(items[1]).toHaveTextContent(/Sin abrir en este equipo/);
    expect(items[1]).toHaveTextContent("Sin plan");
    expect(items[1]).toHaveTextContent("Sin casos todavía");

    const bar = screen.getByRole("progressbar", {
      name: "Progreso de Checkout",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "75");
  });

  it("filters by name ignoring case and accents, and says when nothing matches", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findAllByRole("listitem");
    const search = screen.getByRole("searchbox", { name: "Buscar proyecto" });

    await user.type(search, "MOVILES");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("listitem")).toHaveTextContent("Pagos móviles");

    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ningún proyecto coincide con «zzz».",
    );
  });

  it("opens a project at its own route and starts a new one through the projects page", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(await screen.findByRole("button", { name: /Checkout/ }));
    expect(screen.getByTestId("projects-route")).toHaveTextContent(
      "/projects/p-checkout/plan",
    );
  });

  it("the new-project action links to the create form", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(
      screen.getByRole("button", { name: /Iniciar nuevo proyecto de pruebas/ }),
    );
    expect(screen.getByTestId("projects-route")).toHaveTextContent("?new=1");
  });

  it("'continue' moves focus to the search box", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findAllByRole("listitem");
    await user.click(
      screen.getByRole("button", { name: /Continuar proyecto existente/ }),
    );
    expect(
      screen.getByRole("searchbox", { name: "Buscar proyecto" }),
    ).toHaveFocus();
  });

  it("shows an empty state without projects", async () => {
    overview.mockResolvedValueOnce([]);
    renderHome();
    expect(
      await screen.findByText(/Aún no tienes proyectos/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continuar proyecto existente/ }),
    ).toBeDisabled();
  });
});
