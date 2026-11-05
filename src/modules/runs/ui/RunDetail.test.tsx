// The run screen and the manual executor (EJE-02) with the desktop commands
// mocked: header and items, keyboard marking with an autosaved draft,
// recording an attempt, «Crear defecto», closing and reopening, the frozen
// revision after the case changed, the new-run dialog and the web notice.
// axe checks the markup of each (UX-05, ADR-0027).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import type {
  ResultView,
  Run,
  RunItem,
  RunItemDetail,
  RunOverview,
} from "@shared/contracts/contract";
import { ToastProvider } from "@shared/ui/Toast";
import { RunsPage } from "./RunsPage";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  counts: vi.fn(),
  unlinked: vi.fn(),
  overview: vi.fn(),
  itemDetail: vi.fn(),
  draftSave: vi.fn(),
  draftDiscard: vi.fn(),
  record: vi.fn(),
  update: vi.fn(),
  addItems: vi.fn(),
  createManual: vi.fn(),
  configurations: vi.fn(),
  attachToDraft: vi.fn(),
  deleteDraftAttachment: vi.fn(),
  saveAttachment: vi.fn(),
  previewAttachment: vi.fn(),
}));
vi.mock("../api/runsApi", () => ({ runsApi: api }));
const platform = vi.hoisted(() => ({ desktop: true }));
vi.mock("@shared/platform", async (orig) => ({
  ...(await orig<typeof import("@shared/platform")>()),
  isTauri: () => platform.desktop,
}));
const defects = vi.hoisted(() => ({
  createDefectFromResult: vi.fn(),
}));
vi.mock("@modules/defects", () => ({
  createDefectFromResult: defects.createDefectFromResult,
  DefectEditor: ({ fromLabel }: { fromLabel?: string }) => (
    <div aria-label="defect editor" role="region">
      {fromLabel}
    </div>
  ),
}));

const run = (over: Partial<Run> = {}): Run => ({
  id: "r1",
  projectId: "p",
  runKey: "RUN-007",
  title: "Regresión manual",
  trigger: "manual",
  sourceTool: null,
  sourceToolVersion: null,
  testPlanId: null,
  cycleId: "cy1",
  configurationId: "cf1",
  environment: "staging",
  build: "1.4.2",
  commitSha: null,
  branch: null,
  repositoryUrl: null,
  ciUrl: null,
  dataset: null,
  context: {},
  status: "in_progress",
  startedAt: "2026-11-04T09:00:00.000Z",
  finishedAt: null,
  summary: {},
  data: {},
  createdBy: "test-user",
  createdAt: "2026-11-04 09:00:00",
  updatedAt: "2026-11-04 09:00:00",
  revision: 1,
  ...over,
});

const item: RunItem = {
  id: "i1",
  runId: "r1",
  testCaseId: "c1",
  testCaseRevisionId: "rev1",
  flowId: null,
  exampleRowId: null,
  exampleRow: null,
  configurationId: null,
  assignee: null,
  position: 0,
  revision: 1,
};

const overview = (over: Partial<RunOverview> = {}): RunOverview => ({
  run: run(),
  cycleKey: "CYC-002",
  cycleTitle: "Sprint 12",
  configurationName: "Chrome",
  items: [
    {
      item,
      caseKey: "TC-001",
      caseTitle: "Pagar con tarjeta",
      caseDeleted: false,
      flowName: null,
      rowIndex: null,
      targets: 1,
      done: 0,
      status: "not_run",
      attempts: 0,
      hasDraft: false,
    },
    {
      item: { ...item, id: "i2", testCaseId: "c2", position: 1 },
      caseKey: "TC-002",
      caseTitle: "Devolver un pedido",
      caseDeleted: false,
      flowName: null,
      rowIndex: null,
      targets: 1,
      done: 1,
      status: "failed",
      attempts: 1,
      hasDraft: false,
    },
  ],
  counts: { passed: 0, failed: 1, blocked: 0, skipped: 0, other: 0, notRun: 1, total: 2 },
  ...over,
});

const result = (over: Partial<ResultView> = {}): ResultView => ({
  id: "res1",
  runId: "r1",
  shardId: null,
  runItemId: "i1",
  testKey: "manual:c1/-/-",
  testCaseId: "c1",
  effectiveTestCaseId: "c1",
  testCaseRevisionId: "rev1",
  caseRevision: 1,
  caseKey: "TC-001",
  flowId: null,
  exampleRowId: null,
  exampleRow: null,
  configurationLabel: "Chrome",
  attempt: 0,
  status: "failed",
  rawStatus: null,
  durationMs: 61000,
  startedAt: "2026-11-04T09:10:00.000Z",
  finishedAt: "2026-11-04T09:11:01.000Z",
  errorMessage: "declined",
  executedBy: "user:test-user",
  attributes: { notes: "tarjeta rechazada" },
  createdAt: "2026-11-04 09:11:01",
  isFinal: true,
  flaky: false,
  steps: [
    { id: "sr1", position: 0, stepId: "S1", keyword: null, text: "abrir el carrito", status: "passed", actual: null, durationMs: null, gherkinLine: null },
    { id: "sr2", position: 1, stepId: "S2", keyword: null, text: "pagar", status: "failed", actual: "declined", durationMs: null, gherkinLine: null },
  ],
  effectiveRevisionId: "rev1",
  effectiveCaseRevision: 1,
  effectiveFlowId: null,
  effectiveExampleRowId: null,
  effectiveRunItemId: "i1",
  effectiveStepIds: ["S1", "S2"],
  linkReason: null,
  caseDeleted: false,
  effectiveConfigurationId: "cf1",
  ...over,
});

const detail = (over: Partial<RunItemDetail> = {}): RunItemDetail => ({
  item,
  runStatus: "in_progress",
  caseKey: "TC-001",
  caseTitle: "Pagar con tarjeta",
  caseDeleted: false,
  frozenRevision: 1,
  currentRevision: 1,
  caseChanged: false,
  revision: {
    steps: [
      { id: "S1", text: "abrir el carrito" },
      { id: "S2", text: "pagar", expected: "pagado" },
      { id: "S3", text: "ver el recibo" },
    ],
  },
  targets: [
    {
      key: "-/-",
      flowId: null,
      flowName: null,
      exampleRowId: null,
      exampleRow: null,
      values: null,
      testKey: "manual:c1/-/-",
    },
  ],
  results: [],
  attachments: [],
  draft: null,
  ...over,
});

function renderRun(route = "/projects/p/runs/r1?item=i1") {
  return renderWithProviders(
    <ToastProvider>
      <RunsPage projectId="p" runId="r1" cases={[{ id: "c3", scenarioId: "TC-003", title: "Buscar" }]} />
    </ToastProvider>,
    { route },
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  platform.desktop = true;
  await i18n.changeLanguage("es");
  api.overview.mockResolvedValue(overview());
  api.itemDetail.mockResolvedValue(detail());
  api.draftSave.mockResolvedValue(undefined);
  api.record.mockResolvedValue("res-new");
  api.update.mockResolvedValue(run());
  api.previewAttachment.mockResolvedValue(null);
  api.configurations.mockResolvedValue([]);
});

describe("run screen", () => {
  it("shows the header, the progress and the items, without axe violations", async () => {
    const { container } = renderRun("/projects/p/runs/r1");
    expect(await screen.findByRole("heading", { name: "Regresión manual" })).toBeInTheDocument();
    expect(screen.getByText("RUN-007")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /CYC-002/ })).toHaveAttribute(
      "href",
      "/projects/p/cycles?cycle=cy1",
    );
    expect(screen.getByText("1/2 ejecutados")).toBeInTheDocument();
    expect(screen.getByText(/aún no se sincronizan/)).toBeInTheDocument();
    expect(screen.getAllByTestId("run-item-execute")).toHaveLength(2);
    await expectNoAxeViolations(container);
  });

  it("marks steps from the keyboard, autosaves the draft and records the attempt", async () => {
    const user = userEvent.setup();
    const { container } = renderRun();
    const panel = await screen.findByTestId("exec-panel");
    expect(within(panel).getByText("Esperado: pagado")).toBeInTheDocument();
    await expectNoAxeViolations(container);

    const steps = within(panel).getAllByRole("listitem", { name: /^Paso \d/ });
    steps[0].focus();
    await user.keyboard("p");
    // P moves to the next unmarked step; F marks it failed and opens notes.
    await user.keyboard("f");
    expect(screen.getByTestId("exec-step-1-pass")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("exec-step-2-fail")).toHaveAttribute("aria-pressed", "true");
    const actual = within(panel).getByLabelText("Resultado obtenido / notas del paso");
    await user.type(actual, "tarjeta rechazada");
    await waitFor(() => expect(api.draftSave).toHaveBeenCalled(), { timeout: 2000 });
    const [itemId, key, state] = api.draftSave.mock.calls.at(-1)!;
    expect([itemId, key]).toEqual(["i1", "-/-"]);
    expect(state).toMatchObject({ steps: { S1: { status: "passed" }, S2: { status: "failed" } } });

    expect(screen.getByText("1 paso sin marcar se guardará como Omitido.")).toBeInTheDocument();
    await user.click(screen.getByTestId("exec-save"));
    await waitFor(() => expect(api.record).toHaveBeenCalledTimes(1));
    const input = api.record.mock.calls[0][0];
    expect(input).toMatchObject({
      runItemId: "i1",
      status: "failed",
      configurationLabel: "Chrome",
      errorMessage: "tarjeta rechazada",
      userId: "test-user",
    });
    expect(input.steps.map((s: { status: string }) => s.status)).toEqual([
      "passed",
      "failed",
      "skipped",
    ]);
    // The run reloads so its progress (and the cycle's) is current.
    await waitFor(() => expect(api.overview.mock.calls.length).toBeGreaterThan(1));
  });

  it("creates a defect from a failed attempt with the step that failed", async () => {
    const user = userEvent.setup();
    api.itemDetail.mockResolvedValue(detail({ results: [result()] }));
    defects.createDefectFromResult.mockResolvedValue({ title: "x" });
    const { container } = renderRun();
    await user.click(await screen.findByTestId("exec-create-defect"));
    expect(defects.createDefectFromResult).toHaveBeenCalledWith("res1", "test-user", "S2");
    expect(await screen.findByRole("region", { name: "defect editor" })).toHaveTextContent(
      "RUN-007 · TC-001",
    );
    await expectNoAxeViolations(container);
  });

  it("executes the frozen revision when the case changed after it was added", async () => {
    api.itemDetail.mockResolvedValue(
      detail({ caseChanged: true, frozenRevision: 1, currentRevision: 3 }),
    );
    renderRun();
    expect(await screen.findByText(/se ejecuta la revisión 1 \(la vigente es la 3\)/)).toBeInTheDocument();
    expect(screen.getByText("pagar")).toBeInTheDocument();
  });

  it("closes the run as cancelled and reopens a closed one", async () => {
    const user = userEvent.setup();
    renderRun("/projects/p/runs/r1");
    await user.click(await screen.findByTestId("run-close"));
    const dialog = await screen.findByRole("dialog", { name: "Cerrar el run" });
    expect(within(dialog).getByText("Queda 1 ejecución sin hacer.")).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText("Cancelado"));
    await user.click(within(dialog).getByTestId("run-close-confirm"));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("r1", { status: "aborted", userId: "test-user" }),
    );

    api.overview.mockResolvedValue(overview({ run: run({ status: "completed" }) }));
    vi.clearAllMocks();
    api.overview.mockResolvedValue(overview({ run: run({ status: "completed" }) }));
    api.update.mockResolvedValue(run());
    renderRun("/projects/p/runs/r1");
    const reopen = await screen.findAllByTestId("run-reopen");
    await user.click(reopen.at(-1)!);
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("r1", { status: "in_progress", userId: "test-user" }),
    );
  });

  it("is read only on the web", async () => {
    platform.desktop = false;
    renderRun();
    expect(await screen.findByText(/se ejecutan en la app de escritorio/)).toBeInTheDocument();
    expect(api.overview).not.toHaveBeenCalled();
  });
});

describe("new manual run", () => {
  it("creates a run over the chosen cases and opens it", async () => {
    const user = userEvent.setup();
    api.list.mockResolvedValue([]);
    api.counts.mockResolvedValue([]);
    api.unlinked.mockResolvedValue([]);
    api.createManual.mockResolvedValue(run({ id: "r9", runKey: "RUN-009" }));
    const { container } = renderWithProviders(
      <ToastProvider>
        <RunsPage projectId="p" cases={[{ id: "c3", scenarioId: "TC-003", title: "Buscar" }]} />
      </ToastProvider>,
      { route: "/projects/p/runs" },
    );
    await user.click(await screen.findByTestId("run-new"));
    const dialog = await screen.findByRole("dialog", { name: "Nuevo run manual" });
    await expectNoAxeViolations(container);
    const confirm = within(dialog).getByTestId("run-cases-confirm");
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByTestId("run-case-TC-003"));
    await user.type(within(dialog).getByLabelText("Entorno"), "staging");
    await user.click(confirm);
    await waitFor(() => expect(api.createManual).toHaveBeenCalledTimes(1));
    const [input, items] = api.createManual.mock.calls[0];
    expect(input).toMatchObject({ projectId: "p", environment: "staging", userId: "test-user" });
    expect(items).toEqual([{ testCaseId: "c3" }]);
  });
});
