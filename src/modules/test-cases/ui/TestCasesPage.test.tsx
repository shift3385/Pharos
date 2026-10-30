import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import type { TestCase, TestCaseSummary } from "../model/types";
import { TestCasesPage } from "./TestCasesPage";

const list = vi.fn();
const get = vi.fn();
const remove = vi.fn();
vi.mock("../api/testCaseApi", () => ({
  testCaseApi: {
    list: (...a: unknown[]) => list(...a),
    get: (...a: unknown[]) => get(...a),
    remove: (...a: unknown[]) => remove(...a),
    revisions: () => Promise.resolve([]),
    create: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("../api/traceLinks", () => ({
  projectTraceableCases: () =>
    Promise.resolve([{ id: "c2", scenarioId: "PCL-2", title: "", status: "", requirementKeys: ["REQ-031"], traceability: "" }]),
}));
vi.mock("@modules/ai", async (orig) => ({
  ...(await orig<typeof import("@modules/ai")>()),
  aiAvailable: () => Promise.resolve(false),
}));
vi.mock("@modules/test-plan", () => ({ projectHasPlan: () => Promise.resolve(false) }));

const summary = (n: number, over: Partial<TestCaseSummary> = {}): TestCaseSummary => ({
  id: `c${n}`,
  scenarioId: `PCL-${n}`,
  title: `Caso número ${n}`,
  status: "approved",
  priority: "medium",
  gherkinLevel: "basic",
  updatedAt: new Date().toISOString(),
  revision: 1,
  ...over,
});
const SUMMARIES = [
  summary(1, { status: "draft", title: "Descarga de factura" }),
  summary(2, { priority: "critical", title: "Pago con tarjeta" }),
  summary(3, { status: "reviewed", title: "Reembolso parcial" }),
];
const full = (s: TestCaseSummary): TestCase => ({
  id: s.id,
  workspaceId: "w",
  projectId: "p1",
  scenarioId: s.scenarioId,
  title: s.title,
  version: "1.0",
  status: s.status,
  priority: s.priority,
  author: "QA",
  data: { gherkinLevel: "basic", steps: ["Abrir"], expectedResult: "Ok" },
  createdAt: s.updatedAt,
  updatedAt: s.updatedAt,
  revision: 1,
});

function Where() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}
function renderPage(route = "/projects/p1/cases") {
  return renderWithProviders(
    <Routes>
      <Route
        path="/projects/:projectId/:section"
        element={
          <>
            <TestCasesPage projectId="p1" caseIdPrefix="PCL-" />
            <Where />
          </>
        }
      />
    </Routes>,
    { route },
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
  list.mockResolvedValue(SUMMARIES);
  get.mockImplementation((id: string) => Promise.resolve(full(SUMMARIES.find((s) => s.id === id)!)));
  remove.mockResolvedValue(undefined);
});

describe("Casos · lista (RED-V3)", () => {
  it("is a table with state chips, the requirement column and pagination", async () => {
    setViewportWidth(1440);
    renderPage();
    const table = await screen.findByRole("table", { name: "Casos de prueba" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(await within(table).findByText("REQ-031")).toBeInTheDocument();
    expect(within(table).getAllByText("Sin requisito")).toHaveLength(2);
    expect(within(table).getAllByText("No ejecutado")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Todos 3" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Mostrando/)).toHaveTextContent("Mostrando 1–3 de 3 casos");
    expect(screen.getByRole("button", { name: "Ejecución" })).toHaveAttribute("aria-disabled", "true");
    await expectNoAxeViolations();
  }, 15_000);

  it("filters by state chip and finds a case by its requirement", async () => {
    setViewportWidth(1440);
    renderPage();
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "Borrador 1" }));
    expect(screen.getAllByRole("row")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Todos 3" }));
    await screen.findByText("REQ-031");
    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar casos" }), "req-031");
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole("link", { name: "Pago con tarjeta" })).toHaveAttribute(
      "href",
      "/projects/p1/cases?case=c2",
    );
  });

  it("deletes the selected cases after a destructive confirmation", async () => {
    setViewportWidth(1440);
    renderPage();
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar PCL-1 Descarga de factura" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar PCL-3 Reembolso parcial" }));
    expect(screen.getByText("2 seleccionados")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    const dialog = screen.getByRole("alertdialog", { name: "¿Eliminar 2 casos?" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    expect(remove).toHaveBeenCalledWith("c1", expect.any(String));
    expect(remove).toHaveBeenCalledWith("c3", expect.any(String));
  });

  it("shows cards and one filters sheet on mobile", async () => {
    setViewportWidth(390);
    renderPage();
    const cards = await screen.findByRole("list", { name: "Casos de prueba" });
    expect(within(cards).getAllByRole("listitem")).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Filtros" }));
    const sheet = screen.getByRole("dialog", { name: "Filtros" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Crítica" }));
    expect(within(cards).getAllByRole("listitem")).toHaveLength(1);
    await expectNoAxeViolations();
  }, 15_000);
});

describe("Casos · editor navigation (RED-V3)", () => {
  it("opens from ?case= and walks the list order", async () => {
    setViewportWidth(1440);
    renderPage("/projects/p1/cases?case=c2");
    expect(await screen.findByText("2 de 3")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Pago con tarjeta" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Caso siguiente/ }));
    expect(await screen.findByRole("heading", { name: "Reembolso parcial" })).toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent("?case=c3");
    await userEvent.click(screen.getByRole("button", { name: "Todos los casos" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByTestId("search")).toBeEmptyDOMElement();
  }, 15_000);

  it("asks before leaving with unsaved changes", async () => {
    setViewportWidth(1440);
    renderPage("/projects/p1/cases?case=c2");
    const title = await screen.findByRole("textbox", { name: /Título/ });
    await userEvent.type(title, " editado");
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Caso anterior/ }));
    const dialog = screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Descartar cambios" }));
    expect(await screen.findByRole("heading", { name: "Descarga de factura" })).toBeInTheDocument();
  }, 15_000);

  it("Ctrl P opens «Ir a un caso» and Enter opens the match", async () => {
    setViewportWidth(1440);
    renderPage("/projects/p1/cases?case=c1");
    await screen.findByRole("heading", { name: "Descarga de factura" });
    fireEvent.keyDown(window, { key: "p", ctrlKey: true });
    const box = await screen.findByRole("combobox", { name: "Ir a un caso" });
    await userEvent.type(box, "reembolso{Enter}");
    expect(await screen.findByRole("heading", { name: "Reembolso parcial" })).toBeInTheDocument();
  }, 15_000);

  it("explains each priority in its menu and uses a sheet on mobile", async () => {
    setViewportWidth(1440);
    const { unmount } = renderPage("/projects/p1/cases?case=c2");
    await userEvent.click(await screen.findByRole("button", { name: "Prioridad Crítica" }));
    const menu = screen.getByRole("menu", { name: "Prioridad" });
    expect(within(menu).getByRole("menuitemradio", { name: "Alta" })).toHaveAccessibleDescription(
      "Afecta a un flujo principal",
    );
    await expectNoAxeViolations();
    unmount();

    setViewportWidth(390);
    renderPage("/projects/p1/cases?case=c2");
    await userEvent.click(await screen.findByRole("button", { name: "Estado Aprobado" }));
    const sheet = screen.getByRole("dialog", { name: "Estado del caso" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Revisado" }));
    expect(screen.getByRole("button", { name: "Estado Revisado" })).toBeInTheDocument();
  }, 20_000);

  it("on mobile offers only Editor and Gherkin, and editing Gherkin shows the keyword bar", async () => {
    setViewportWidth(390);
    renderPage("/projects/p1/cases?case=c2");
    const views = await screen.findByRole("group", { name: "Vista del caso" });
    expect(within(views).getAllByRole("button").map((b) => b.textContent)).toEqual(["Editor", "Gherkin"]);
    await userEvent.click(within(views).getByRole("button", { name: "Gherkin" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const bar = screen.getByRole("toolbar", { name: "Palabras clave de Gherkin" });
    expect(within(bar).getByRole("button", { name: "Sangrar" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "@tag" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(screen.queryByRole("toolbar", { name: "Palabras clave de Gherkin" })).not.toBeInTheDocument();
  }, 15_000);
});
