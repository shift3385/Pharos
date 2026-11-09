import { Fragment } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { projectApi } from "../api/projectApi";
import { ReportedError } from "@shared/ui/notify";
import { ToastProvider } from "@shared/ui/Toast";
import { projectRows } from "../model/projectRows";
import type { ProjectRow } from "../model/projectTable";
import { copyAfterCreate } from "../model/copySettings";
import { ProjectsPage } from "./ProjectsPage";

const now = Date.now();
const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();

const ROWS: ProjectRow[] = Array.from({ length: 14 }, (_, i) => ({
  id: `p${i}`,
  name: i === 0 ? "Portal Clientes v3" : `Proyecto ${String(i).padStart(2, "0")}`,
  caseIdPrefix: i === 0 ? "PCL-" : `P${i}_`,
  caseIdDigits: i === 0 ? 5 : 4,
  planExportHistory: i === 0 ? "revisions" : undefined,
  updatedAt: ago(500 + i),
  lastAccess: i < 5 ? ago(i + 1) : null,
  planStatus: i === 0 ? "approved" : i % 2 ? "reviewed" : null,
  cases: 10 * i,
  coverage: i === 0 ? 0.92 : null,
  closeDate: null,
  execution: i === 0 ? { executed: 3, total: 4 } : null,
}));

vi.mock("../model/projectRows", () => ({ projectRows: vi.fn(async () => ROWS) }));
vi.mock("../api/projectApi", () => ({
  projectApi: { create: vi.fn(async () => ({ id: "new" })), get: vi.fn(), list: vi.fn(async () => []) },
}));

// UX-25: the platform (the web unless a test says desktop) and the copy after
// the create, whose outcome each test chooses.
const desktop = vi.hoisted(() => ({ on: false }));
vi.mock("@shared/platform", async (orig) => {
  const real = await orig<typeof import("@shared/platform")>();
  return { ...real, isTauri: () => desktop.on };
});
vi.mock("../model/copySettings", async (orig) => {
  const real = await orig<typeof import("../model/copySettings")>();
  return { ...real, copyAfterCreate: vi.fn(async () => ({ fieldsFailed: [], retentionFailed: false })) };
});

function Where() {
  return <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;
}

function renderPage(route = "/projects", { toasts = false } = {}) {
  const Wrap = toasts ? ToastProvider : Fragment;
  return renderWithProviders(
    <Wrap>
      <Routes>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId/:section" element={<p>dentro</p>} />
      </Routes>
      <Where />
    </Wrap>,
    { route },
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
  vi.mocked(projectRows).mockClear();
  vi.mocked(projectApi.create).mockClear();
  vi.mocked(projectApi.get).mockReset();
  vi.mocked(copyAfterCreate).mockClear();
  desktop.on = false;
});

describe("Proyectos when the list fails to load", () => {
  it("shows the error instead of «Cargando…», and «Reintentar» loads it", async () => {
    setViewportWidth(1440);
    vi.mocked(projectRows).mockRejectedValueOnce(new Error("Authentication is required."));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar la lista de proyectos.");
    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
    await expectNoAxeViolations();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("table", { name: "Todos los proyectos" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a retry that fails again says so again", async () => {
    vi.mocked(projectRows).mockRejectedValueOnce(new Error("down"));
    vi.mocked(projectRows).mockRejectedValueOnce(new Error("down"));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(projectRows).toHaveBeenCalledTimes(2);
  });

  it("a failed reload keeps the list on screen and adds the error", async () => {
    setViewportWidth(1440);
    renderPage();
    await screen.findByRole("table", { name: "Todos los proyectos" });
    vi.mocked(projectRows).mockRejectedValueOnce(new Error("down"));
    window.dispatchEvent(new CustomEvent("pharos:synced"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Todos los proyectos" })).toBeInTheDocument();
  });
});

describe("Proyectos (SPEC §8)", () => {
  it("shows the 4 recent projects and the first page of the table", async () => {
    setViewportWidth(1440);
    renderPage();
    const recent = await screen.findByRole("region", { name: "Recientes" });
    expect(within(recent).getAllByRole("link")).toHaveLength(4);
    const table = screen.getByRole("table", { name: "Todos los proyectos" });
    // Header + 5 rows.
    expect(within(table).getAllByRole("row")).toHaveLength(6);
    expect(screen.getByText(/Mostrando/)).toHaveTextContent("Mostrando 1–5 de 14 proyectos");
    expect(screen.getByRole("button", { name: "5 por página" })).toBeInTheDocument();
    expect(within(table).getAllByText("Aprobado").length).toBeGreaterThan(0);
    expect(within(table).getByText("92 %")).toBeInTheDocument();
    // «Ejecutado» (NC-021): real progress, with its count in the title; «—» without data.
    expect(within(table).getByText("75 %")).toHaveAttribute("title", "3 de 4 casos con resultado");
    expect(within(recent).getAllByText("75 %").length).toBeGreaterThan(0);
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
    // NC-021: the execution progress has data now.
    expect(screen.getByRole("menuitemradio", { name: "Progreso de ejecución" })).toBeEnabled();
    expect(screen.getByRole("menuitemradio", { name: "Cierre del ciclo" })).toBeDisabled();
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Nombre (A–Z)" }));
    await userEvent.click(screen.getByRole("button", { name: "Orden: Nombre (A–Z) · Descendente" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Ascendente" }));
    const first = () => within(screen.getByRole("table")).getAllByRole("link")[0];
    expect(first()).toHaveTextContent("Portal Clientes v3");
    await userEvent.click(screen.getByRole("button", { name: /Página 2/ }));
    expect(screen.getByText(/Mostrando/)).toHaveTextContent("Mostrando 6–10 de 14 proyectos");
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
    expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});

describe("Proyectos when an action fails", () => {
  it("a refusal already told in a toast keeps the form and adds no second error", async () => {
    setViewportWidth(1440);
    vi.mocked(projectApi.create).mockRejectedValueOnce(new ReportedError("ya existe"));
    renderPage("/projects?new=1");
    const input = await screen.findByRole("textbox", { name: "Nombre del proyecto" });
    await userEvent.type(input, "Nuevo{Enter}");
    await waitFor(() => expect(projectApi.create).toHaveBeenCalled());
    expect(input).toHaveValue("Nuevo");
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("a failed create keeps the form and its name, and «Reintentar» creates it", async () => {
    setViewportWidth(1440);
    vi.mocked(projectApi.create).mockRejectedValueOnce(new Error("down"));
    renderPage("/projects?new=1");
    const input = await screen.findByRole("textbox", { name: "Nombre del proyecto" });
    await userEvent.type(input, "Nuevo{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo crear el proyecto.");
    expect(input).toHaveValue("Nuevo");

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("dentro")).toBeInTheDocument();
    expect(vi.mocked(projectApi.create)).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Nuevo" }));
  });

  it("suggests a free prefix from the name and refuses one that overlaps (NC-030)", async () => {
    setViewportWidth(1440);
    renderPage("/projects?new=1");
    const name = await screen.findByRole("textbox", { name: "Nombre del proyecto" });
    const prefix = screen.getByRole("textbox", { name: "Prefijo de ID de caso" });
    expect(prefix).toHaveValue("");
    await userEvent.type(name, "Pharos");
    expect(prefix).toHaveValue("PHA-");
    // «PC-» starts «PCL-» of Portal Clientes v3: explained, nothing created.
    await userEvent.clear(prefix);
    await userEvent.type(prefix, "PC-{Enter}");
    expect(await screen.findByText(/Se solapa con «PCL-» de Portal Clientes v3/)).toBeInTheDocument();
    expect(projectApi.create).not.toHaveBeenCalled();
    await userEvent.clear(prefix);
    await userEvent.type(prefix, "PH-{Enter}");
    expect(await screen.findByText("dentro")).toBeInTheDocument();
    expect(projectApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Pharos", caseIdPrefix: "PH-" }));
  });

  it("«Reintentar» sends the name the form says now", async () => {
    setViewportWidth(1440);
    vi.mocked(projectApi.create).mockRejectedValueOnce(new Error("down"));
    renderPage("/projects?new=1");
    const input = await screen.findByRole("textbox", { name: "Nombre del proyecto" });
    await userEvent.type(input, "Nuevo{Enter}");
    await screen.findByRole("alert");
    await userEvent.type(input, " 2");

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("dentro")).toBeInTheDocument();
    expect(vi.mocked(projectApi.create)).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Nuevo 2" }));
  });

  it("a failed row export says which project, and «Reintentar» repeats it", async () => {
    setViewportWidth(1440);
    vi.mocked(projectApi.get).mockRejectedValueOnce(new Error("down"));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Más acciones de Portal Clientes v3" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /ZIP/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo exportar «Portal Clientes v3».");

    vi.mocked(projectApi.get).mockResolvedValueOnce(null);
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(projectApi.get).toHaveBeenCalledTimes(2);
  });
});

describe("«Copiar ajustes de…» when a project is created (UX-25)", () => {
  async function openForm() {
    setViewportWidth(1440);
    renderPage("/projects?new=1", { toasts: true });
    const name = await screen.findByRole("textbox", { name: "Nombre del proyecto" });
    const from = await screen.findByRole("combobox", { name: "Copiar ajustes de:" });
    return { name, from };
  }

  it("copies nothing by default, and offers every part checked once a project is chosen", async () => {
    desktop.on = true;
    const { name, from } = await openForm();
    expect(from).toHaveValue("");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await userEvent.selectOptions(from, "p0");
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((b) => b.closest("label")?.textContent)).toEqual([
      "Campos personalizados (casos, requisitos, defectos, ejecuciones y ciclos)",
      "Dígitos de las claves (5)",
      "Historial en el plan exportado: Historial de revisiones",
      "Retención de evidencias",
    ]);
    boxes.forEach((b) => expect(b).toBeChecked());
    expect(screen.getByText(/el nombre, el prefijo y los datos/)).toBeInTheDocument();
    await expectNoAxeViolations();

    // The new project keeps its own name and suggested prefix.
    await userEvent.type(name, "Pharos{Enter}");
    expect(await screen.findByText("dentro")).toBeInTheDocument();
    expect(projectApi.create).toHaveBeenCalledWith({
      name: "Pharos",
      ownerId: expect.any(String),
      caseIdPrefix: "PHA-",
      caseIdDigits: 5,
      planExportHistory: "revisions",
    });
    expect(copyAfterCreate).toHaveBeenCalledWith(
      "p0",
      "new",
      expect.any(String),
      new Set(["fields", "digits", "planHistory", "retention"]),
    );
    expect(await screen.findByText("Ajustes copiados de «Portal Clientes v3».")).toBeInTheDocument();
  });

  it("copies only the parts left checked", async () => {
    desktop.on = true;
    const { name, from } = await openForm();
    await userEvent.selectOptions(from, "p0");
    await userEvent.click(screen.getByRole("checkbox", { name: "Dígitos de las claves (5)" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Retención de evidencias" }));
    await userEvent.type(name, "Pharos{Enter}");
    expect(await screen.findByText("dentro")).toBeInTheDocument();
    const input = vi.mocked(projectApi.create).mock.calls[0][0];
    expect(input).not.toHaveProperty("caseIdDigits");
    expect(input).toHaveProperty("planExportHistory", "revisions");
    expect(vi.mocked(copyAfterCreate).mock.calls[0][3]).toEqual(new Set(["fields", "planHistory"]));
  });

  it("on the web the evidence retention is not offered and the form says why", async () => {
    const { from } = await openForm();
    await userEvent.selectOptions(from, "p0");
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.queryByRole("checkbox", { name: "Retención de evidencias" })).not.toBeInTheDocument();
    expect(screen.getByText(/en la web no se copia/)).toBeInTheDocument();
  });

  it("a copy that fails still creates the project and says what was left out", async () => {
    desktop.on = true;
    vi.mocked(copyAfterCreate).mockResolvedValueOnce({ fieldsFailed: ["requirement", "defect"], retentionFailed: true });
    const { name, from } = await openForm();
    await userEvent.selectOptions(from, "p0");
    await userEvent.type(name, "Pharos{Enter}");
    expect(await screen.findByText("dentro")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "El proyecto se creó, pero no se copió: campos personalizados de requisitos, defectos; la retención de evidencias. Puedes ajustarlo en Ajustes del proyecto o en Administración › Evidencias.",
      ),
    ).toBeInTheDocument();
  });

  it("«(ninguno)» creates a project with its defaults and copies nothing", async () => {
    const { name } = await openForm();
    await userEvent.type(name, "Pharos{Enter}");
    expect(await screen.findByText("dentro")).toBeInTheDocument();
    expect(projectApi.create).toHaveBeenCalledWith({ name: "Pharos", ownerId: expect.any(String), caseIdPrefix: "PHA-" });
    expect(copyAfterCreate).not.toHaveBeenCalled();
  });
});
