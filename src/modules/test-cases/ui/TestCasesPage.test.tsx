import { beforeEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { selectValue } from "@test/select";
import { Link, Route, Routes, useLocation } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import type { TestCase, TestCaseSummary } from "../model/types";
import type { ReactNode } from "react";
import { HeaderActionsContext, useHeaderActionsSlot } from "@shared/ui/headerActions";
import { TestCasesPage } from "./TestCasesPage";
import { stepsOf } from "../model/steps";

// Steps and Outline rows carry stable ids (DAT-02).
const st = (...list: string[]) => stepsOf(list);

function FakeHeader({ children }: { children: ReactNode }) {
  const { actions, slot } = useHeaderActionsSlot();
  return (
    <HeaderActionsContext.Provider value={slot}>
      <header data-testid="project-header">{actions}</header>
      {children}
    </HeaderActionsContext.Provider>
  );
}

const list = vi.fn();
const get = vi.fn();
const remove = vi.fn();
const update = vi.fn();
const fieldList = vi.fn();
const revisions = vi.fn();
const revisionDetail = vi.fn();
const review = vi.fn();
vi.mock("@modules/custom-fields", async (orig) => ({
  ...(await orig<typeof import("@modules/custom-fields")>()),
  customFieldApi: { list: (...a: unknown[]) => fieldList(...a) },
}));
vi.mock("../api/testCaseApi", () => ({
  testCaseApi: {
    list: (...a: unknown[]) => list(...a),
    get: (...a: unknown[]) => get(...a),
    remove: (...a: unknown[]) => remove(...a),
    revisions: (...a: unknown[]) => revisions(...a),
    revisionDetail: (...a: unknown[]) => revisionDetail(...a),
    review: (...a: unknown[]) => review(...a),
    reviewBase: () => Promise.resolve(null),
    create: vi.fn(),
    update: (...a: unknown[]) => update(...a),
  },
}));
vi.mock("@modules/ai", async (orig) => ({
  ...(await orig<typeof import("@modules/ai")>()),
  aiAvailable: () => Promise.resolve(false),
}));
vi.mock("@modules/test-plan", () => ({ projectHasPlan: () => Promise.resolve(false) }));
const toast = vi.fn();
vi.mock("@shared/ui/Toast", async (orig) => ({
  ...(await orig<typeof import("@shared/ui/Toast")>()),
  useToast: () => toast,
}));

const summary = (n: number, over: Partial<TestCaseSummary> = {}): TestCaseSummary => ({
  id: `c${n}`,
  scenarioId: `PCL-${n}`,
  title: `Caso número ${n}`,
  status: "approved",
  priority: "medium",
  gherkinLevel: "basic",
  caseType: null,
  automationStatus: null,
  custom: {},
  requirementKeys: [],
  traceability: "",
  review: null,
  approval: null,
  createdBy: "u1",
  updatedAt: new Date().toISOString(),
  revision: 1,
  ...over,
});
const SUMMARIES = [
  summary(1, { status: "draft", title: "Descarga de factura" }),
  summary(2, { priority: "critical", title: "Pago con tarjeta", requirementKeys: ["REQ-031"] }),
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
  caseType: s.caseType,
  automationStatus: s.automationStatus,
  author: "QA",
  data: { gherkinLevel: "basic", steps: st("Abrir"), expectedResult: "Ok" },
  createdBy: "u1",
  createdAt: s.updatedAt,
  updatedAt: s.updatedAt,
  revision: 1,
});

function Where() {
  const { pathname, search } = useLocation();
  return (
    <>
      <output data-testid="search">{search}</output>
      <output data-testid="path">{pathname}</output>
      <Link to="/projects/p1/plan">Plan de pruebas</Link>
    </>
  );
}
function renderPage(
  route = "/projects/p1/cases",
  loadResults?: () => Promise<Map<string, { status: string; at: string | null }>>,
) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/projects/:projectId/cases"
        element={
          <>
            <TestCasesPage projectId="p1" caseIdPrefix="PCL-" loadResults={loadResults} />
            <Where />
          </>
        }
      />
      <Route path="/projects/:projectId/plan" element={<Where />} />
    </Routes>,
    { route },
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
  list.mockResolvedValue(SUMMARIES);
  get.mockImplementation((id: string) => Promise.resolve(full(SUMMARIES.find((s) => s.id === id)!)));
  remove.mockResolvedValue(undefined);
  update.mockReset().mockResolvedValue(null);
  fieldList.mockResolvedValue([]);
  revisions.mockResolvedValue([]);
  revisionDetail.mockResolvedValue(null);
});

describe("Casos · lista (RED-V3)", () => {
  it("is a table with state chips, the requirement column and pagination", async () => {
    setViewportWidth(1440);
    renderPage();
    const table = await screen.findByRole("table", { name: "Casos de prueba" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(await within(table).findByText("REQ-031")).toBeInTheDocument();
    expect(within(table).getAllByText("Sin requisito")).toHaveLength(2);
    // No results read: «Ejecución» says «—», never a made-up «No ejecutado» (NC-019).
    expect(within(table).getAllByText("Sin resultados todavía")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Todos 3" })).toHaveAttribute("aria-pressed", "true");
    // Three cases fit in the smallest page: no pagination footer.
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
    // «Ejecución» filters now (NC-019): no «Próximamente».
    expect(screen.getByRole("button", { name: "Ejecución" })).not.toHaveAttribute("aria-disabled", "true");
    await expectNoAxeViolations();
  });

  it("«Ejecución» shows each case's latest result or «—», and filters by it (NC-019)", async () => {
    setViewportWidth(1440);
    const user = userEvent.setup();
    renderPage(
      "/projects/p1/cases",
      () =>
        Promise.resolve(
          new Map([
            ["c1", { status: "passed", at: "2026-11-03T10:00:00Z" }],
            ["c2", { status: "failed", at: "2026-11-04T10:00:00Z" }],
          ]),
        ),
    );
    const table = await screen.findByRole("table", { name: "Casos de prueba" });
    const rows = () => within(table).getAllByRole("row").slice(1);
    await waitFor(() => expect(within(rows()[0]).getByText("Pasa")).toBeInTheDocument());
    expect(within(rows()[1]).getByText("Falla").closest("[title]")).toHaveAttribute("title", expect.stringContaining("Último resultado"));
    expect(within(rows()[2]).getByText("Sin resultados todavía")).toBeInTheDocument();

    // The filter is live, no «Próximamente»: «Sin resultados» keeps PCL-3 only.
    await user.click(screen.getByRole("button", { name: /^Ejecución/ }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /Sin resultados/ }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent("PCL-3");
  });

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
    expect(remove).toHaveBeenCalledWith("c1", expect.any(String), { quiet: true });
    expect(remove).toHaveBeenCalledWith("c3", expect.any(String), { quiet: true });
  });

  it("a bulk delete announces the change once, for the project header (FIX-13)", async () => {
    setViewportWidth(1440);
    remove.mockClear();
    const heard = vi.fn();
    window.addEventListener("pharos:cases-changed", heard);
    try {
      renderPage();
      await screen.findByRole("table");
      await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar PCL-1 Descarga de factura" }));
      await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar PCL-3 Reembolso parcial" }));
      await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
      await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Sí, eliminar" }));
      await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    } finally {
      window.removeEventListener("pharos:cases-changed", heard);
    }
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
  });
});

it("puts its buttons in the project header (V2's slot) and clears them in the editor", async () => {
  setViewportWidth(1440);
  renderWithProviders(
    <FakeHeader>
      <TestCasesPage projectId="p1" />
    </FakeHeader>,
  );
  const header = screen.getByTestId("project-header");
  expect(await within(header).findByRole("button", { name: "Nuevo caso" })).toBeInTheDocument();
  expect(within(header).getByRole("button", { name: "Importar / Exportar" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Nuevo caso" })).toHaveLength(1);
  await userEvent.click(within(header).getByRole("button", { name: "Nuevo caso" }));
  await waitFor(() => expect(within(header).queryByRole("button", { name: "Nuevo caso" })).not.toBeInTheDocument());
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
  });

  it("restores an earlier revision into the editor, unsaved, after asking (NC-018)", async () => {
    setViewportWidth(1440);
    const user = userEvent.setup();
    get.mockImplementation((id: string) =>
      Promise.resolve({ ...full(SUMMARIES.find((x) => x.id === id)!), revision: 2 }),
    );
    revisions.mockResolvedValue([
      { id: "r2", revision: 2, title: "Pago con tarjeta", createdAt: "2026-11-02T10:00:00Z" },
      { id: "r1", revision: 1, title: "Pago con tarjeta (borrador)", createdAt: "2026-11-01T10:00:00Z" },
    ]);
    revisionDetail.mockResolvedValue({
      id: "r1",
      revision: 1,
      title: "Pago con tarjeta (borrador)",
      version: "0.9",
      status: "draft",
      priority: "low",
      caseType: null,
      automationStatus: null,
      data: { gherkinLevel: "basic", steps: st("Abrir el pago"), expectedResult: "Ok" },
      createdAt: "2026-11-01T10:00:00Z",
    });
    renderPage("/projects/p1/cases?case=c2");
    await screen.findByRole("textbox", { name: /Título/ });
    await user.click(screen.getByRole("button", { name: "Más acciones del caso" }));
    await user.click(await screen.findByRole("menuitem", { name: "Revisiones" }));
    expect(await screen.findByText("Actual")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restaurar rev. 1" }));
    const ask = await screen.findByRole("alertdialog", { name: "¿Restaurar la revisión 1?" });
    expect(ask).toHaveTextContent("la clave del caso no cambia");
    await user.click(within(ask).getByRole("button", { name: "Restaurar" }));
    expect(screen.getByRole("textbox", { name: /Título/ })).toHaveValue("Pago con tarjeta (borrador)");
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith("Revisión 1 cargada en el editor. Guarda para conservarla.");
    expect(update).not.toHaveBeenCalled();
    expect(revisionDetail).toHaveBeenCalledWith("r1", expect.any(String));
  });

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
  });

  it("Ctrl P opens «Ir a un caso» and Enter opens the match", async () => {
    setViewportWidth(1440);
    renderPage("/projects/p1/cases?case=c1");
    await screen.findByRole("heading", { name: "Descarga de factura" });
    fireEvent.keyDown(window, { key: "p", ctrlKey: true });
    const box = await screen.findByRole("combobox", { name: "Ir a un caso" });
    await userEvent.type(box, "reembolso{Enter}");
    expect(await screen.findByRole("heading", { name: "Reembolso parcial" })).toBeInTheDocument();
  });

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
    await userEvent.click(await screen.findByRole("button", { name: "Prioridad Crítica" }));
    const sheet = screen.getByRole("dialog", { name: "Prioridad" });
    await userEvent.click(within(sheet).getByRole("button", { name: /^Alta/ }));
    expect(screen.getByRole("button", { name: "Prioridad Alta" })).toBeInTheDocument();
    // The status is no longer a menu: the review flow moves it (CAS-02).
    expect(screen.queryByRole("button", { name: /^Estado / })).not.toBeInTheDocument();
  });

  it("on mobile offers only Editor and Gherkin, and editing Gherkin shows the keyword bar", async () => {
    setViewportWidth(390);
    renderPage("/projects/p1/cases?case=c2");
    const views = await screen.findByRole("radiogroup", { name: "Vista del caso" });
    expect(within(views).getAllByRole("radio").map((b) => b.textContent)).toEqual(["Editor", "Gherkin"]);
    await userEvent.click(within(views).getByRole("radio", { name: "Gherkin" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const bar = screen.getByRole("toolbar", { name: "Palabras clave de Gherkin" });
    expect(within(bar).getByRole("button", { name: "Sangrar" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "@tag" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(screen.queryByRole("toolbar", { name: "Palabras clave de Gherkin" })).not.toBeInTheDocument();
  });
});

describe("Casos · ID de escenario (FIX-12)", () => {
  it("a new case shows the project's own prefix, not ATS_", async () => {
    setViewportWidth(1440);
    renderPage("/projects/p1/cases?case=new");
    await userEvent.click(await screen.findByRole("button", { name: /^Básico Feature/ }));
    const id = await screen.findByRole("textbox", { name: "ID de escenario" });
    expect(id).toHaveAttribute("placeholder", "Auto (PCL-…)");
    expect(id).not.toHaveAttribute("placeholder", expect.stringContaining("ATS_"));
  });

  it("a saved case names its own tag in the «ID fijo» hint", async () => {
    setViewportWidth(1440);
    renderPage("/projects/p1/cases?case=c1");
    const id = await screen.findByRole("textbox", { name: "ID de escenario" });
    expect(id).toHaveAttribute("readonly");
    expect(id.getAttribute("title")).toContain("@PCL-1 ");
  });

  it("a provisional key (DAT-01) is not called fixed: it says the sync replaces it", async () => {
    setViewportWidth(1440);
    get.mockImplementation((caseId: string) =>
      Promise.resolve({ ...full(SUMMARIES.find((s) => s.id === caseId)!), scenarioId: "PCL-?3F2A" }),
    );
    renderPage("/projects/p1/cases?case=c1");
    const id = await screen.findByRole("textbox", { name: "ID de escenario" });
    expect(id).toHaveAttribute("title", "Clave provisional: recibirá la definitiva al sincronizar.");
  });
});

describe("Casos · review fixes (RED-V3)", () => {
  it("an unknown or deleted ?case= shows «Caso no encontrado», not an empty editor that would create a case", async () => {
    setViewportWidth(1440);
    get.mockResolvedValue(null);
    renderPage("/projects/p1/cases?case=borrado");
    expect(await screen.findByRole("heading", { name: "Caso no encontrado" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Guardar/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Todos los casos" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("asks before a link elsewhere drops unsaved edits", async () => {
    setViewportWidth(1440);
    renderPage("/projects/p1/cases?case=c2");
    await userEvent.type(await screen.findByRole("textbox", { name: /Título/ }), " editado");
    await userEvent.click(screen.getByRole("link", { name: "Plan de pruebas" }));
    const dialog = screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/projects/p1/cases");
    await userEvent.click(screen.getByRole("link", { name: "Plan de pruebas" }));
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Descartar cambios" }),
    );
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/projects/p1/plan"));
  });

  // The system «Atrás» (a history pop) is held by the same router blocker:
  // see useUnsavedChangesGuard.test.tsx.

  it("a filter drops from the selection the cases it hides", async () => {
    setViewportWidth(1440);
    renderPage();
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar PCL-1 Descarga de factura" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar PCL-2 Pago con tarjeta" }));
    expect(screen.getByText("2 seleccionados")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Borrador 1" }));
    expect(await screen.findByText("1 seleccionado")).toBeInTheDocument();
  });

  it("a failed deletion is reported and the list reloads", async () => {
    setViewportWidth(1440);
    remove.mockImplementation((id: string) => (id === "c1" ? Promise.reject(new Error("409")) : Promise.resolve()));
    renderPage();
    await screen.findByRole("table");
    const calls = list.mock.calls.length;
    await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar PCL-1 Descarga de factura" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar PCL-3 Reembolso parcial" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("PCL-1, PCL-3");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        "1 caso eliminado. No se pudo eliminar 1 caso; sigue en la lista.",
        "error",
      ),
    );
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(calls));
  });
});

// FLD-01: case type, automation status and custom fields.
const SPRINT = {
  id: "f-sprint",
  projectId: "p1",
  entity: "test_case" as const,
  fieldKey: "sprint",
  label: "Sprint",
  description: "",
  fieldType: "select" as const,
  options: [
    { id: "OPT00001", label: "S1", archived: false },
    { id: "OPT00002", label: "S2", archived: false },
  ],
  required: true,
  defaultValue: null,
  appliesToCaseTypes: null,
  position: 0,
  archivedAt: null,
  createdAt: "",
  updatedAt: "",
  revision: 1,
};

describe("Casos · tipo, automatización y campos (FLD-01)", () => {
  it("shows the automation status and the checklist mark next to the ID, and filters by both", async () => {
    setViewportWidth(1440);
    list.mockResolvedValue([
      summary(1, { title: "Manual", automationStatus: null }),
      summary(2, {
        title: "Auto",
        automationStatus: "automated",
        caseType: "checklist",
      }),
      summary(3, { title: "Sprint 2", custom: { sprint: "OPT00002" } }),
    ]);
    fieldList.mockResolvedValue([SPRINT]);
    renderPage();
    const table = await screen.findByRole("table", { name: "Casos de prueba" });
    // No column of its own: an icon next to the ID, named and with a tooltip.
    expect(within(table).queryByRole("columnheader", { name: "Automatización" })).toBeNull();
    expect(within(table).getAllByTitle("Automatización: Manual")).toHaveLength(2);
    expect(within(table).getByTitle("Automatización: Automatizado")).toHaveTextContent("Automatización: Automatizado");
    expect(within(table).getAllByTitle("Checklist")).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: "Automatización" }),
    );
    await userEvent.click(
      screen.getByRole("menuitemcheckbox", { name: /Automatizado/ }),
    );
    await userEvent.keyboard("{Escape}");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });

  it("filters by a choice custom field", async () => {
    setViewportWidth(1440);
    list.mockResolvedValue([
      summary(1, { title: "Sprint 1", custom: { sprint: "OPT00001" } }),
      summary(2, { title: "Sprint 2", custom: { sprint: "OPT00002" } }),
    ]);
    fieldList.mockResolvedValue([SPRINT]);
    renderPage();
    const table = await screen.findByRole("table", { name: "Casos de prueba" });
    await userEvent.click(
      await screen.findByRole("button", { name: "Campos" }),
    );
    await userEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Sprint: S2" }),
    );
    await userEvent.keyboard("{Escape}");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent("Sprint 2");
  });

  it("a required field blocks the save and is named; a checklist hides the Gherkin", async () => {
    setViewportWidth(1440);
    fieldList.mockResolvedValue([SPRINT]);
    renderPage("/projects/p1/cases?case=c1");
    await screen.findByRole("textbox", { name: /Título/ });
    expect(
      screen.getByRole("radiogroup", { name: "Vista del caso" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole("button", { name: /Guardar/ })[0],
    );
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("button", { name: "Sprint" }),
    ).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();

    await selectValue(
      screen.getByRole("combobox", { name: /Sprint/ }),
      "OPT00001",
    );
    await userEvent.click(screen.getByRole("radio", { name: "Checklist" }));
    expect(
      screen.getByRole("heading", { name: "Comprobaciones" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radiogroup", { name: "Vista del caso" }),
    ).toBeNull();
    await expectNoAxeViolations();

    await userEvent.click(
      screen.getAllByRole("button", { name: /Guardar/ })[0],
    );
    await waitFor(() => expect(update).toHaveBeenCalled());
    const [, input] = update.mock.calls[0];
    expect(input).toMatchObject({
      caseType: "checklist",
      data: expect.objectContaining({ custom: { sprint: "OPT00001" } }),
    });
    // Never set and not touched: not sent, so the stored null stays.
    expect(input.automationStatus).toBeUndefined();
  });
});

describe("Casos when the list fails to load", () => {
  beforeEach(() => {
    list.mockResolvedValue(SUMMARIES);
    fieldList.mockResolvedValue([]);
  });

  it("shows the error, not an empty project, and «Reintentar» loads the cases", async () => {
    setViewportWidth(1440);
    list.mockRejectedValueOnce(new Error("down"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los casos de prueba.");
    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await expectNoAxeViolations();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Pago con tarjeta")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Casos · IA sin revisar en el estado y sin filtro Nivel (UX-20)", () => {
  beforeEach(() => {
    list.mockResolvedValue([
      summary(1, { status: "draft", title: "Descarga de factura", aiPending: true }),
      summary(2, { status: "reviewed", title: "Pago con tarjeta", aiPending: true }),
      summary(3, { status: "draft", title: "Reembolso parcial" }),
    ]);
  });

  it("marks the state, not the title, and keeps the state counts", async () => {
    setViewportWidth(1440);
    renderPage();
    const table = await screen.findByRole("table", { name: "Casos de prueba" });
    const [, first, second, third] = within(table).getAllByRole("row");
    // The title is only the title.
    expect(within(first).getByRole("link", { name: "Descarga de factura" })).toBeInTheDocument();
    expect(within(first).queryByText(/IA · sin revisar/)).not.toBeInTheDocument();
    // The state keeps its name and adds the mark, with its explanation.
    const pill = within(first).getByText("Borrador").closest(".pill")!;
    expect(pill).toHaveTextContent("Borrador (con IA sin revisar)");
    expect(pill).toHaveAttribute("title", expect.stringMatching(/sugerido por IA/));
    // Moved on without reviewing: its own state, same mark.
    expect(within(second).getByText("En revisión").closest(".pill")).toHaveTextContent("En revisión (con IA sin revisar)");
    expect(within(third).getByText("Borrador").closest(".pill")).not.toHaveTextContent("IA");
    // The chips count states: an AI case counts in its own.
    expect(screen.getByRole("button", { name: "Borrador 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "En revisión 1" })).toBeInTheDocument();
    // No «Nivel» filter; the column stays.
    expect(screen.queryByRole("button", { name: /^Nivel/ })).not.toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Nivel" })).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("on mobile the card names it and the filters sheet has no Nivel", async () => {
    setViewportWidth(390);
    renderPage();
    const cards = await screen.findByRole("list", { name: "Casos de prueba" });
    expect(within(cards).getAllByRole("listitem")[0]).toHaveTextContent("Borrador (con IA sin revisar)");
    await userEvent.click(screen.getByRole("button", { name: "Filtros" }));
    const sheet = screen.getByRole("dialog", { name: "Filtros" });
    expect(within(sheet).queryByText("Nivel")).not.toBeInTheDocument();
    expect(within(sheet).getByText("Prioridad")).toBeInTheDocument();
  });
});

describe("Casos · revisión (CAS-02)", () => {
  it("sends a saved draft to review with a note, and the status is no longer a menu", async () => {
    setViewportWidth(1440);
    review.mockImplementation(async (c: TestCase) => ({ ...c, status: "reviewed", revision: 2 }));
    renderPage("/projects/p1/cases?case=c1");
    await userEvent.click(await screen.findByTestId("case-send-review"));
    const dialog = screen.getByRole("alertdialog", { name: "Enviar PCL-1 a revisión" });
    await userEvent.type(within(dialog).getByLabelText(/Nota para quien revise/), "listo");
    await userEvent.click(within(dialog).getByTestId("case-send-review-confirm"));
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1" }),
      expect.objectContaining({ action: "send", comment: "listo", userId: "test-user" }),
    );
    expect(await screen.findByTestId("case-approve")).toBeInTheDocument();
  });

  it("returning a case needs a comment", async () => {
    setViewportWidth(1440);
    review.mockReset();
    renderPage("/projects/p1/cases?case=c3");
    await userEvent.click(await screen.findByTestId("case-return"));
    const dialog = screen.getByRole("alertdialog", { name: "Devolver PCL-3 a Borrador" });
    await userEvent.click(within(dialog).getByTestId("case-return-confirm"));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Escribe qué hay que cambiar.");
    expect(review).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText(/Qué hay que cambiar/), "Falta el paso 3");
    review.mockImplementation(async (c: TestCase) => ({ ...c, status: "draft", revision: 2 }));
    await userEvent.click(within(dialog).getByTestId("case-return-confirm"));
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c3" }),
      expect.objectContaining({ action: "return", comment: "Falta el paso 3" }),
    );
  });

  it("alone in the workspace the author approves, warned that it is a self-approval", async () => {
    setViewportWidth(1440);
    get.mockImplementation(async (id: string) => {
      const s = SUMMARIES.find((x) => x.id === id)!;
      return { ...full(s), createdBy: "test-user" };
    });
    review.mockImplementation(async (c: TestCase) => ({ ...c, status: "approved", revision: 2 }));
    renderPage("/projects/p1/cases?case=c3");
    const approve = await screen.findByTestId("case-approve");
    await waitFor(() => expect(approve).toBeEnabled());
    await userEvent.click(approve);
    const dialog = screen.getByRole("alertdialog", { name: "Aprobar la versión 1.0" });
    expect(dialog).toHaveTextContent("autoaprobación");
    await userEvent.click(within(dialog).getByTestId("case-approve-confirm"));
    expect(review).toHaveBeenCalledWith(expect.objectContaining({ id: "c3" }), expect.objectContaining({ action: "approve" }));
  });

  it("shows «Por revisar» for the cases in review this account may approve", async () => {
    setViewportWidth(1440);
    renderPage();
    expect(await screen.findByRole("button", { name: "Por revisar 1" })).toBeInTheDocument();
  });
});
