import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import type { ProjectRow } from "../model/projectTable";
import { ProjectsPage } from "./ProjectsPage";

const now = Date.now();
const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();

const ROWS: ProjectRow[] = Array.from({ length: 14 }, (_, i) => ({
  id: `p${i}`,
  name: i === 0 ? "Portal Clientes v3" : `Proyecto ${String(i).padStart(2, "0")}`,
  caseIdPrefix: i === 0 ? "PCL-" : `P${i}_`,
  caseIdDigits: 4,
  updatedAt: ago(500 + i),
  lastAccess: i < 5 ? ago(i + 1) : null,
  planStatus: i === 0 ? "approved" : i % 2 ? "reviewed" : null,
  cases: 10 * i,
  coverage: i === 0 ? 0.92 : null,
  closeDate: null,
}));

vi.mock("../model/projectRows", () => ({ projectRows: vi.fn(async () => ROWS) }));
vi.mock("../api/projectApi", () => ({
  projectApi: { create: vi.fn(async () => ({ id: "new" })), get: vi.fn(), list: vi.fn(async () => []) },
}));

function Where() {
  return <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;
}

function renderPage(route = "/projects") {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId/:section" element={<p>dentro</p>} />
      </Routes>
      <Where />
    </>,
    { route },
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
});

describe("Proyectos (SPEC §8)", () => {
  it("shows the 4 recent projects and the first page of the table", async () => {
    setViewportWidth(1440);
    renderPage();
    const recent = await screen.findByRole("region", { name: "Recientes" });
    expect(within(recent).getAllByRole("link")).toHaveLength(4);
    const table = screen.getByRole("table", { name: "Todos los proyectos" });
    // Header + 12 rows.
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(screen.getByText(/Mostrando/)).toHaveTextContent("Mostrando 1–12 de 14 proyectos");
    expect(within(table).getAllByText("Aprobado").length).toBeGreaterThan(0);
    expect(within(table).getByText("92 %")).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("searches by name or prefix and says when nothing matches", async () => {
    setViewportWidth(1440);
    renderPage();
    const search = await screen.findByRole("searchbox", { name: "Buscar por nombre o prefijo…" });
    await userEvent.type(search, "pcl");
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    expect(screen.getByText("Ningún proyecto coincide con «zzz».")).toBeInTheDocument();
  });

  it("orders by name and changes page", async () => {
    setViewportWidth(1440);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Orden: Último acceso · Descendente" }));
    expect(screen.getByRole("menuitemradio", { name: "Progreso de ejecución" })).toBeDisabled();
    expect(screen.getByRole("menuitemradio", { name: "Cierre del ciclo" })).toBeDisabled();
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Nombre (A–Z)" }));
    await userEvent.click(screen.getByRole("button", { name: "Orden: Nombre (A–Z) · Descendente" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Ascendente" }));
    const first = () => within(screen.getByRole("table")).getAllByRole("link")[0];
    expect(first()).toHaveTextContent("Portal Clientes v3");
    await userEvent.click(screen.getByRole("button", { name: /Página 2/ }));
    expect(screen.getByText(/Mostrando/)).toHaveTextContent("Mostrando 13–14 de 14 proyectos");
  });

  it("the filters without data are offered disabled with a reason", async () => {
    setViewportWidth(1440);
    renderPage();
    const closed = await screen.findByRole("button", { name: "Cerrados" });
    expect(closed).toHaveAttribute("aria-disabled", "true");
    expect(closed).toHaveAttribute("title", expect.stringMatching(/Próximamente/));
  });

  it("a row's ⋯ menu opens its settings", async () => {
    setViewportWidth(1440);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Más acciones de Portal Clientes v3" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Ajustes del proyecto" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/projects/p0/settings");
  });

  it("keeps /projects?new=1 opening the new-project form, then drops the parameter", async () => {
    setViewportWidth(1440);
    renderPage("/projects?new=1");
    expect(await screen.findByRole("textbox", { name: "Nombre del proyecto" })).toHaveFocus();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/projects$/);
  });

  it("on mobile the table becomes a list of two-line rows, with compact pages", async () => {
    setViewportWidth(390);
    renderPage();
    const list = await screen.findByRole("list", { name: "Todos los proyectos" });
    expect(within(list).getAllByRole("link")[0]).toHaveTextContent(/·/);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Orden/ })).not.toBeInTheDocument();
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});
