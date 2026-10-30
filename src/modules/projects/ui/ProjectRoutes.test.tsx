import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, Route, Routes, useLocation } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import { ProjectDetailPage } from "./ProjectDetail";
import { ProjectsPage } from "./ProjectsPage";
import { projectApi } from "../api/projectApi";
import { lastAccessMap } from "../model/lastAccess";

// The sections are other modules' screens: only which one is shown matters here.
vi.mock("@modules/test-plan", () => ({
  TestPlanPage: () => <p>sección plan</p>,
  projectPlanStatus: async () => "reviewed",
}));
vi.mock("@modules/test-cases", () => ({
  TestCasesPage: ({ caseIdPrefix }: { caseIdPrefix: string }) => <p>casos {caseIdPrefix}</p>,
  projectTraceableCases: async () => [],
  projectCaseCount: async () => 240,
}));
vi.mock("@modules/planner", () => ({ PlannerBoard: () => <p>sección planificador</p> }));
vi.mock("@modules/traceability", () => ({
  TraceabilityPage: () => <p>sección trazabilidad</p>,
  requirementApi: { list: async () => [] },
}));

const PROJECTS = {
  a: { id: "a", ownerId: "test-user", name: "Proyecto A", caseIdPrefix: "AAA_", caseIdDigits: 3 },
  b: { id: "b", ownerId: "test-user", name: "Proyecto B", caseIdPrefix: "BBB_", caseIdDigits: 4 },
} as const;

vi.mock("../api/projectApi", () => ({
  projectApi: {
    get: vi.fn(),
    list: vi.fn(async () => []),
    update: vi.fn(async () => null),
  },
}));

function Where() {
  const { pathname } = useLocation();
  return <output data-testid="where">{pathname}</output>;
}

function renderAt(route: string) {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId/:section?" element={<ProjectDetailPage />} />
      </Routes>
      <Link to="/projects/b/settings">ir a B</Link>
      <Where />
    </>,
    { route },
  );
}

const where = () => screen.getByTestId("where").textContent;

describe("project routes (ADR-0029)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.mocked(projectApi.get).mockImplementation(async (id: string) =>
      id in PROJECTS ? { ...PROJECTS[id as "a" | "b"] } as never : null,
    );
    vi.mocked(projectApi.list).mockClear();
    vi.mocked(projectApi.update).mockClear();
  });

  it("a project without a section opens its plan", async () => {
    renderAt("/projects/a");
    expect(await screen.findByText("sección plan")).toBeInTheDocument();
    expect(where()).toBe("/projects/a/plan");
  });

  it("heads every section with the project, without the old «← Proyectos» bar", async () => {
    renderAt("/projects/a/settings");
    expect(await screen.findByRole("heading", { level: 1, name: "Proyecto A" })).toBeInTheDocument();
    expect(await screen.findByText("Plan revisado")).toBeInTheDocument();
    expect(screen.getByText("240 casos")).toBeInTheDocument();
    expect(screen.getByText("0 requisitos")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Proyectos/ })).not.toBeInTheDocument();
  });

  it("an unknown section opens the plan", async () => {
    renderAt("/projects/a/zzz");
    expect(await screen.findByText("sección plan")).toBeInTheDocument();
    expect(where()).toBe("/projects/a/plan");
  });

  it("an old /projects?open=<id> link redirects without loading the list", async () => {
    renderAt("/projects?open=a");
    expect(await screen.findByText("sección plan")).toBeInTheDocument();
    expect(where()).toBe("/projects/a/plan");
    expect(projectApi.list).not.toHaveBeenCalled();
  });

  it("an unknown or deleted project goes back to the list, without recording an access", async () => {
    renderAt("/projects/gone/settings");
    await waitFor(() => expect(where()).toBe("/projects"));
    expect(lastAccessMap("test-user")).not.toHaveProperty("gone");
  });

  it("switching project inside Ajustes shows and saves the new project's data", async () => {
    const user = userEvent.setup();
    renderAt("/projects/a/settings");
    expect(await screen.findByDisplayValue("Proyecto A")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "ir a B" }));
    expect(await screen.findByDisplayValue("Proyecto B")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Proyecto A")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("BBB_")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Guardar/ }));
    await waitFor(() => expect(projectApi.update).toHaveBeenCalled());
    expect(projectApi.update).toHaveBeenCalledWith(
      "b",
      expect.objectContaining({ name: "Proyecto B", caseIdPrefix: "BBB_", caseIdDigits: 4 }),
    );
  });

  it("a slow answer for the previous project never replaces the current one", async () => {
    let releaseA: (v: unknown) => void = () => {};
    vi.mocked(projectApi.get).mockImplementation((id: string) =>
      id === "a"
        ? (new Promise((r) => (releaseA = r)) as never)
        : (Promise.resolve({ ...PROJECTS.b }) as never),
    );
    const user = userEvent.setup();
    renderAt("/projects/a/settings");
    await user.click(screen.getByRole("link", { name: "ir a B" }));
    expect(await screen.findByDisplayValue("Proyecto B")).toBeInTheDocument();
    releaseA({ ...PROJECTS.a });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByDisplayValue("Proyecto A")).not.toBeInTheDocument();
  });
});
