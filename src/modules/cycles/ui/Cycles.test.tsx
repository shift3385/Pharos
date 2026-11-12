// The cycles screens (CYC-01): the configurations card of the project
// settings, the cycle list, a cycle's detail with progress per configuration,
// adding cases (not approved: warned, not blocked), «Ejecutar» on the desktop
// only, and axe on each (UX-05, ADR-0027).
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { ToastProvider } from "@shared/ui/Toast";
import { configurationApi, cycleApi } from "../api/cycleApi";
import type { Configuration, CycleItem, CycleProgress, CycleSummary, TestCycle } from "../model/types";
import { percents } from "../model/types";
import { configurationError, cycleError, dateRange } from "../model/messages";
import { ConfigurationsCard } from "./ConfigurationsCard";
import { CyclesPage } from "./CyclesPage";

vi.mock("../api/cycleApi", () => ({
  configurationApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    reorder: vi.fn(async () => []),
  },
  cycleApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    clone: vi.fn(),
    remove: vi.fn(),
    items: vi.fn(),
    addItems: vi.fn(),
    addByFilter: vi.fn(),
    filterPreview: vi.fn(async () => 2),
    setAssignee: vi.fn(),
    removeItems: vi.fn(),
    reorderItems: vi.fn(),
    execute: vi.fn(),
    runs: vi.fn(),
    progress: vi.fn(),
  },
}));

const config = (over: Partial<Configuration>): Configuration => ({
  id: "cfg",
  projectId: "p1",
  name: "Chrome",
  attributes: {},
  matchLabels: [],
  position: 0,
  archived: false,
  revision: 1,
  labelClashes: [],
  ...over,
});
const CHROME = config({ id: "chrome", name: "Chrome", attributes: { browser: "Chrome", os: "Windows 11" }, matchLabels: ["chromium"] });
const FIREFOX = config({
  id: "firefox",
  name: "Firefox",
  position: 1,
  matchLabels: ["firefox"],
  labelClashes: [{ label: "firefox", otherId: "zz", otherName: "Firefox (B)", wins: true }],
});
const OLD = config({ id: "old", name: "IE 11", archived: true, position: 2 });

const CYCLE: TestCycle = {
  id: "cy1",
  projectId: "p1",
  cycleKey: "CYC-001",
  title: "Regresión 1.4",
  description: "",
  testPlanId: null,
  milestone: "Hito 2",
  sprint: null,
  build: "1.4.2",
  environment: "staging",
  configurationIds: ["chrome", "firefox"],
  startsOn: "2026-11-02",
  endsOn: "2026-11-13",
  status: "active",
  data: {},
  createdAt: "2026-10-31 10:00:00",
  updatedAt: "2026-10-31 10:00:00",
  revision: 2,
};
const SUMMARY = { total: 4, executed: 2, passed: 1, failed: 1, blocked: 0, skipped: 0, other: 0, notRun: 2 };
const LISTED: CycleSummary = { ...CYCLE, items: 2, runs: 2, progress: SUMMARY };
const ITEMS: CycleItem[] = [
  { id: "i1", cycleId: "cy1", testCaseId: "c1", caseKey: "ATS_001", caseTitle: "Pagar", caseStatus: "approved", casePriority: "high", flowId: null, exampleRowId: null, assignee: "Ada", position: 0, revision: 1 },
  { id: "i2", cycleId: "cy1", testCaseId: "c2", caseKey: "ATS_002", caseTitle: "Reembolsar", caseStatus: "draft", casePriority: "low", flowId: null, exampleRowId: null, assignee: null, position: 1, revision: 1 },
];
const PROGRESS: CycleProgress = {
  configurationIds: ["chrome", "firefox"],
  cells: [
    { itemId: "i1", configurationId: "chrome", status: "passed", resultId: "r1", runId: "run1" },
    { itemId: "i1", configurationId: "firefox", status: "failed", resultId: "r2", runId: "run2" },
    { itemId: "i2", configurationId: "chrome", status: "not_run", resultId: null, runId: null },
    { itemId: "i2", configurationId: "firefox", status: "not_run", resultId: null, runId: null },
  ],
  byConfiguration: [],
  summary: SUMMARY,
};

beforeEach(async () => {
  await i18n.changeLanguage("es");
  vi.mocked(configurationApi.list).mockReset().mockResolvedValue([CHROME, FIREFOX, OLD]);
  vi.mocked(configurationApi.create).mockReset();
  vi.mocked(cycleApi.list).mockReset().mockResolvedValue([LISTED]);
  vi.mocked(cycleApi.get).mockReset().mockResolvedValue(CYCLE);
  vi.mocked(cycleApi.items).mockReset().mockResolvedValue(ITEMS);
  vi.mocked(cycleApi.progress).mockReset().mockResolvedValue(PROGRESS);
  vi.mocked(cycleApi.runs).mockReset().mockResolvedValue([]);
  vi.mocked(cycleApi.create).mockReset();
  vi.mocked(cycleApi.addItems).mockReset();
  vi.mocked(cycleApi.execute).mockReset();
});

const page = (route = "/projects/p1/cycles") =>
  renderWithProviders(
    <ToastProvider>
      <CyclesPage
        projectId="p1"
        requirementKeys={["REQ-001"]}
        loadCases={async () => [
          { id: "c1", scenarioId: "ATS_001", title: "Pagar", status: "approved", priority: "high" },
          { id: "c3", scenarioId: "ATS_003", title: "Cancelar", status: "draft", priority: "medium" },
        ]}
      />
    </ToastProvider>,
    { route },
  );

describe("model", () => {
  it("rounds percents down and words the repository's refusals", () => {
    expect(percents({ ...SUMMARY, total: 3, executed: 2, passed: 2 })).toEqual({ executed: 66, passed: 66 });
    expect(percents({ ...SUMMARY, total: 0 })).toEqual({ executed: 0, passed: 0 });
    const t = (k: string, o?: Record<string, unknown>) => (o ? `${k} ${JSON.stringify(o)}` : k);
    expect(configurationError(t, new Error("match-label-taken: chromium (Chrome)"))).toContain("labelTaken");
    expect(cycleError(t, "cycle-closed")).toBe("cycles.error.closed");
    expect(cycleError(t, new Error("case-key-conflict: ATS_004"))).toBe('cycles.error.keyConflict {"key":"ATS_004"}');
    expect(cycleError(t, new Error("cycle-item-case-gone: ATS_004"))).toBe('cycles.error.caseGone {"key":"ATS_004"}');
    expect(cycleError(t, "cycle-item-row-gone: ATS_009")).toBe('cycles.error.rowGone {"key":"ATS_009"}');
    expect(cycleError(t, "no-configuration-chosen")).toBe("cycles.error.noConfigurationChosen");
    expect(dateRange("2026-11-02", "2026-11-13", "es")).toMatch(/2 nov – 13 nov/);
  });
});

describe("Ajustes · Configuraciones", () => {
  it("lists live configurations with attributes and labels, flags a repeated label, hides archived ones", async () => {
    renderWithProviders(<ConfigurationsCard projectId="p1" userId="u1" />);
    const list = await screen.findByRole("list", { name: "Configuraciones del proyecto" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Chrome · Windows 11");
    expect(rows[0]).toHaveTextContent("chromium");
    expect(rows[1]).toHaveTextContent(/Etiqueta repetida en «Firefox \(B\)»/);
    await userEvent.click(screen.getByRole("switch", { name: /Mostrar archivadas/ }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    await expectNoAxeViolations();
  });

  it("creates one with label chips and shows a refused label in the dialog", async () => {
    vi.mocked(configurationApi.create).mockRejectedValueOnce(new Error("match-label-taken: chromium (Chrome)"));
    renderWithProviders(<ConfigurationsCard projectId="p1" userId="u1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Nueva configuración" }));
    const dialog = screen.getByRole("dialog", { name: "Nueva configuración" });
    await userEvent.type(within(dialog).getByLabelText(/^Nombre/), "Edge");
    await userEvent.type(within(dialog).getByLabelText("Navegador"), "Edge");
    await userEvent.type(within(dialog).getByLabelText("Etiquetas de importación"), "msedge{Enter}chromium,");
    expect(within(dialog).getByText("msedge")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(configurationApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Edge", matchLabels: ["msedge", "chromium"], attributes: expect.objectContaining({ browser: "Edge", os: null }) }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("La etiqueta ya la usa otra configuración: chromium (Chrome).");
    await expectNoAxeViolations();
  });
});

describe("Ciclos", () => {
  it("lists cycles with status, dates and progress, and creates one", async () => {
    vi.mocked(cycleApi.create).mockResolvedValue({ ...CYCLE, id: "cy2", cycleKey: "CYC-002" });
    page();
    const table = await screen.findByRole("table", { name: "Ciclos del proyecto" });
    expect(within(table).getByRole("button", { name: "CYC-001" })).toBeInTheDocument();
    expect(table).toHaveTextContent("Activo");
    expect(table).toHaveTextContent("2/4 · 25 %");
    await expectNoAxeViolations();
    await userEvent.click(screen.getByRole("button", { name: "Nuevo ciclo" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo ciclo" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear ciclo" }));
    expect(within(dialog).getByText(/obligatorio/i)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/^Título/), "Humo");
    // Archived configurations are not offered to a new cycle.
    expect(within(dialog).queryByLabelText(/IE 11/)).toBeNull();
    await userEvent.click(within(dialog).getByLabelText(/Chrome/));
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear ciclo" }));
    expect(cycleApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p1", title: "Humo", configurationIds: ["chrome"], userId: expect.any(String) }),
    );
  });

  it("the cycle's dates are Pharos' DatePicker; the end opens on the start's month with the days before it off (UX-36)", async () => {
    vi.mocked(cycleApi.create).mockResolvedValue({ ...CYCLE, id: "cy2", cycleKey: "CYC-002" });
    page();
    await screen.findByRole("table", { name: "Ciclos del proyecto" });
    await userEvent.click(screen.getByRole("button", { name: "Nuevo ciclo" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo ciclo" });
    expect(dialog.querySelector('input[type="date"]')).toBeNull();
    await userEvent.type(within(dialog).getByLabelText(/^Título/), "Humo");
    const start = within(dialog).getByRole("textbox", { name: "Empieza" });
    await userEvent.type(start, "16/03/2027");
    await userEvent.click(within(dialog).getByTestId("cycle-ends-on-calendar"));
    const cal = screen.getByRole("dialog", { name: "Termina" });
    expect(within(cal).getByRole("heading", { name: "Marzo de 2027" })).toBeInTheDocument();
    expect(cal.querySelector('[data-day="2027-03-15"]')).toHaveAttribute("aria-disabled", "true");
    expect(cal.querySelector('[data-day="2027-03-16"]')).not.toHaveAttribute("aria-disabled");
    // Esc closes only the calendar, not the cycle's dialog.
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Termina" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Nuevo ciclo" })).toBeInTheDocument();
    expect(within(dialog).getByTestId("cycle-ends-on-calendar")).toHaveFocus();
    await userEvent.click(within(dialog).getByTestId("cycle-ends-on-calendar"));
    await userEvent.click(
      screen.getByRole("dialog", { name: "Termina" }).querySelector<HTMLElement>('[data-day="2027-03-26"]')!,
    );
    expect(within(dialog).getByRole("textbox", { name: "Termina" })).toHaveValue("26/03/2027");
    // A typed end before the start is still refused, as before.
    await userEvent.clear(start);
    await userEvent.type(start, "30/03/2027");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear ciclo" }));
    expect(within(dialog).getByRole("textbox", { name: "Termina" })).toHaveAttribute("aria-invalid", "true");
    expect(cycleApi.create).not.toHaveBeenCalled();
    await userEvent.clear(start);
    await userEvent.type(start, "2027-03-16");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear ciclo" }));
    expect(cycleApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Humo", startsOn: "2027-03-16", endsOn: "2027-03-26" }),
    );
  });

  it("says when the cycles cannot be read, and retries (NC-008, MAN-03)", async () => {
    vi.mocked(cycleApi.list).mockRejectedValueOnce(new Error("offline"));
    page();
    expect(await screen.findByText("No se pudieron cargar los ciclos.")).toBeInTheDocument();
    expect(screen.queryByText(/Aún no hay ciclos/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("table", { name: "Ciclos del proyecto" })).toBeInTheDocument();
  });

  it("shows a cycle's items with one result column per configuration and warns about cases not approved", async () => {
    page("/projects/p1/cycles?cycle=cy1");
    const table = await screen.findByRole("table", { name: "Elementos del ciclo" });
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(expect.arrayContaining(["Chrome", "Firefox"]));
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Pasa");
    expect(rows[0]).toHaveTextContent("Falla");
    expect(rows[1]).toHaveTextContent("Sin ejecutar");
    expect(rows[1]).toHaveTextContent("No aprobado");
    expect(screen.getByText(/Build 1\.4\.2 · Entorno staging/)).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("the assignee is edited on a tablet and on a phone too (NC-009)", async () => {
    vi.mocked(cycleApi.setAssignee).mockReset().mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    const width = window.innerWidth;
    try {
      for (const w of [1024, 375]) {
        window.innerWidth = w;
        const { unmount } = page("/projects/p1/cycles?cycle=cy1");
        const field = await screen.findByRole("textbox", { name: "Asignado de ATS_001" });
        expect(field).toHaveValue("Ada");
        await user.clear(field);
        await user.type(field, "Grace{Enter}");
        await waitFor(() => expect(cycleApi.setAssignee).toHaveBeenCalledWith("i1", "Grace", expect.any(String)));
        expect(screen.getByRole("textbox", { name: "Asignado de ATS_002" })).toHaveAttribute("placeholder", "Sin asignar");
        vi.mocked(cycleApi.setAssignee).mockClear();
        unmount();
      }
    } finally {
      window.innerWidth = width;
    }
  });

  it("«Quitar del ciclo» asks first; Escape or Cancelar keep the case (NC-012)", async () => {
    vi.mocked(cycleApi.removeItems).mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    page("/projects/p1/cycles?cycle=cy1");
    const table = await screen.findByRole("table", { name: "Elementos del ciclo" });
    const openMenu = async () => {
      await user.click(within(table).getByRole("button", { name: "Acciones de ATS_001" }));
      await user.click(await screen.findByRole("menuitem", { name: "Quitar del ciclo" }));
    };
    await openMenu();
    const ask = await screen.findByRole("alertdialog", { name: "¿Quitar ATS_001 del ciclo?" });
    expect(ask).toHaveTextContent("Sus resultados ya registrados se conservan");
    await user.keyboard("{Escape}");
    expect(cycleApi.removeItems).not.toHaveBeenCalled();
    await openMenu();
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Quitar del ciclo" }));
    await waitFor(() => expect(cycleApi.removeItems).toHaveBeenCalledWith("cy1", ["i1"], expect.any(String)));
    expect(await screen.findByText("ATS_001 quitado del ciclo")).toBeInTheDocument();
  });

  it("adds cases: those already in the cycle cannot be picked, a draft is warned", async () => {
    vi.mocked(cycleApi.addItems).mockResolvedValue({ added: ["i3"], skipped: 0, overlapping: [], notApproved: ["ATS_003"] });
    page("/projects/p1/cycles?cycle=cy1");
    await userEvent.click(await screen.findByRole("button", { name: "Añadir casos" }));
    const dialog = await screen.findByRole("dialog", { name: "Añadir casos al ciclo" });
    const present = await within(dialog).findByRole("checkbox", { name: /ATS_001/ });
    expect(present).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /ATS_003/ }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("1 caso elegido no está aprobado");
    await expectNoAxeViolations();
    await userEvent.click(within(dialog).getByRole("button", { name: "Añadir 1 caso" }));
    expect(cycleApi.addItems).toHaveBeenCalledWith("cy1", [{ testCaseId: "c3", assignee: undefined }], expect.any(String));
    expect(await screen.findByText(/1 caso añadido\. Sin aprobar: ATS_003\./)).toBeInTheDocument();
  });

  it("executes one run per chosen configuration on the desktop", async () => {
    vi.mocked(cycleApi.execute).mockResolvedValue({
      runs: [
        { id: "r1", runKey: "RUN-001", title: "x", status: "in_progress", configurationId: "chrome", startedAt: null, finishedAt: null, build: null, environment: null },
      ],
      missingConfigurations: ["gone-cfg"],
    });
    page("/projects/p1/cycles?cycle=cy1");
    await userEvent.click(await screen.findByRole("button", { name: "Ejecutar" }));
    const dialog = screen.getByRole("dialog", { name: "Ejecutar CYC-001" });
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Firefox/ }));
    await expectNoAxeViolations();
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear 1 run" }));
    expect(cycleApi.execute).toHaveBeenCalledWith(
      "cy1",
      expect.objectContaining({ configurationIds: ["chrome"], build: "1.4.2", environment: "staging" }),
    );
    expect(
      (await screen.findAllByText(/Run creado: RUN-001 1 configuración aún no ha llegado a este equipo y se saltó\./)).length,
    ).toBeGreaterThan(0);
  });

  it("a double click on the confirm executes once", async () => {
    let finish: () => void = () => undefined;
    vi.mocked(cycleApi.execute).mockReset().mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve({ runs: [], missingConfigurations: [] }))),
    );
    page("/projects/p1/cycles?cycle=cy1");
    await userEvent.click(await screen.findByRole("button", { name: "Ejecutar" }));
    const dialog = screen.getByRole("dialog", { name: "Ejecutar CYC-001" });
    const confirm = within(dialog).getByRole("button", { name: "Crear 2 runs" });
    // Both clicks land before React re-renders the disabled button.
    confirm.click();
    confirm.click();
    expect(cycleApi.execute).toHaveBeenCalledTimes(1);
    finish();
  });

  it("«Ejecutar» waits, and names them, while an item's case was deleted", async () => {
    vi.mocked(cycleApi.items).mockResolvedValue([
      ITEMS[0],
      { ...ITEMS[1], caseKey: "", caseTitle: "", caseStatus: "", testCaseId: "c-gone" },
    ]);
    page("/projects/p1/cycles?cycle=cy1");
    const run = await screen.findByRole("button", { name: "Ejecutar" });
    expect(run).toBeDisabled();
    expect(screen.getAllByText(/quita del ciclo los casos eliminados \(c-gone\)/).length).toBeGreaterThan(0);
  });

  it("an «Ejecutar» refused for a case shows its key in the dialog", async () => {
    vi.mocked(cycleApi.execute).mockRejectedValue(new Error("cycle-item-row-gone: ATS_002"));
    page("/projects/p1/cycles?cycle=cy1");
    await userEvent.click(await screen.findByRole("button", { name: "Ejecutar" }));
    const dialog = screen.getByRole("dialog", { name: "Ejecutar CYC-001" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear 2 runs" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "La fila elegida de ATS_002 ya no existe en el caso.",
    );
  });

  it("«Ejecutar» is offered on the web too (EJE-06), with no desktop-only note", async () => {
    page("/projects/p1/cycles?cycle=cy1");
    const run = await screen.findByRole("button", { name: "Ejecutar" });
    expect(run).toBeEnabled();
    expect(screen.queryByText(/app de escritorio/)).not.toBeInTheDocument();
  });
});
