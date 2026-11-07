// The run screen and the manual executor (EJE-02) with the desktop commands
// mocked: header and items, keyboard marking with an autosaved draft,
// recording an attempt, «Crear defecto», closing and reopening, the frozen
// revision after the case changed, the new-run dialog, deleting a run
// (EJE-07), and the web (EJE-06): the same executor without files, its draft
// in this browser.
// axe checks the markup of each (UX-05, ADR-0027).
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
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
  close: vi.fn(),
  addItems: vi.fn(),
  createManual: vi.fn(),
  configurations: vi.fn(),
  attachToDraft: vi.fn(),
  deleteDraftAttachment: vi.fn(),
  saveAttachment: vi.fn(),
  previewAttachment: vi.fn(),
  deletePreview: vi.fn(),
  delete: vi.fn(),
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
  api.close.mockResolvedValue(run({ status: "completed" }));
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
      errorMessage: "tarjeta rechazada",
      userId: "test-user",
    });
    // No editable configuration name; the attempt id is the saved draft's.
    expect(input.configurationLabel).toBeUndefined();
    const saved = api.draftSave.mock.calls.at(-1)![2] as { attemptId: string };
    expect(input.attemptId).toBe(saved.attemptId);
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
    // Cancelling always discards the drafts.
    await waitFor(() =>
      expect(api.close).toHaveBeenCalledWith("r1", "aborted", true, "test-user"),
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

  it("deletes a run after naming what it hides", async () => {
    const user = userEvent.setup();
    api.deletePreview.mockResolvedValue({
      runKey: "RUN-007",
      title: "Regresión manual",
      items: 2,
      results: 3,
      imports: 1,
      attachments: 4,
      drafts: 1,
      cycle: { cycleKey: "CYC-002", title: "Sprint 12", closed: false },
      linkedDefects: 1,
    });
    api.delete.mockResolvedValue(undefined);
    renderRun("/projects/p/runs/r1");
    await user.click(await screen.findByTestId("run-delete"));
    const dialog = await screen.findByRole("dialog", { name: "Eliminar el run" });
    const hidden = await within(dialog).findByTestId("run-delete-hidden");
    expect(hidden).toHaveTextContent("2 elementos del run");
    expect(hidden).toHaveTextContent("3 resultados registrados (no se borran a mano) de 1 importación");
    expect(hidden).toHaveTextContent("4 evidencias de esos resultados");
    expect(hidden).toHaveTextContent("1 borrador sin guardar se descarta");
    expect(hidden).toHaveTextContent("ciclo CYC-002 «Sprint 12» dejará de contar este run");
    expect(hidden).toHaveTextContent("el defecto conserva el vínculo hasta la purga");
    expect(dialog).toHaveTextContent("la purga se los lleva con el run pasados");
    await expectNoAxeViolations(dialog);
    await user.click(within(dialog).getByTestId("run-delete-confirm"));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("r1", "test-user"));
    expect(await screen.findByText("Run RUN-007 eliminado.", { exact: false })).toBeInTheDocument();
  });

  it("says when the run was deleted, here or on another device", async () => {
    api.overview.mockRejectedValue(new Error("run-deleted"));
    renderRun("/projects/p/runs/r1");
    expect(await screen.findByTestId("run-deleted-notice")).toHaveTextContent("Este run se eliminó");
    expect(screen.queryByTestId("run-delete")).not.toBeInTheDocument();
  });

  it("does not delete a run of a closed cycle", async () => {
    const user = userEvent.setup();
    api.deletePreview.mockResolvedValue({
      runKey: "RUN-007",
      title: "Regresión manual",
      items: 1,
      results: 0,
      imports: 0,
      attachments: 0,
      drafts: 0,
      cycle: { cycleKey: "CYC-002", title: "Sprint 12", closed: true },
      linkedDefects: 0,
    });
    renderRun("/projects/p/runs/r1");
    await user.click(await screen.findByTestId("run-delete"));
    const dialog = await screen.findByRole("dialog", { name: "Eliminar el run" });
    expect(await within(dialog).findByTestId("run-delete-cycle-closed")).toHaveTextContent(
      "El ciclo CYC-002 está cerrado",
    );
    expect(within(dialog).getByTestId("run-delete-confirm")).toBeDisabled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("records once when Ctrl+Enter is pressed again while it saves", async () => {
    const user = userEvent.setup();
    let finish: (id: string) => void = () => undefined;
    api.record.mockImplementation(
      () => new Promise<string>((resolve) => (finish = resolve)),
    );
    renderRun();
    const panel = await screen.findByTestId("exec-panel");
    within(panel).getAllByRole("listitem", { name: /^Paso \d/ })[0].focus();
    await user.keyboard("p");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(api.record).toHaveBeenCalledTimes(1));
    await user.keyboard("{Control>}{Enter}{/Control}");
    await user.click(screen.getByTestId("exec-save"));
    finish("res-new");
    await waitFor(() => expect(api.overview.mock.calls.length).toBeGreaterThan(1));
    expect(api.record).toHaveBeenCalledTimes(1);
  });

  it("ignores the executor's keys while a dialog is open", async () => {
    const user = userEvent.setup();
    renderRun();
    const panel = await screen.findByTestId("exec-panel");
    await user.click(within(panel).getByRole("button", { name: "Atajos" }));
    const dialog = await screen.findByRole("dialog", { name: "Atajos" });
    await user.keyboard("p");
    await user.keyboard("t");
    expect(screen.getByTestId("exec-step-1-pass")).toHaveAttribute("aria-pressed", "false");
    expect(api.draftSave).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
  });

  it("reloads when another window already recorded the attempt", async () => {
    const user = userEvent.setup();
    api.draftSave.mockRejectedValue("draft-stale: that attempt is already recorded");
    renderRun();
    const panel = await screen.findByTestId("exec-panel");
    within(panel).getAllByRole("listitem", { name: /^Paso \d/ })[0].focus();
    await user.keyboard("p");
    await user.click(screen.getByTestId("exec-save"));
    // What was marked here is named as discarded, not dropped silently.
    expect(await screen.findByText(/sin guardar se ha descartado/)).toBeInTheDocument();
    expect(api.record).not.toHaveBeenCalled();
    expect(api.itemDetail.mock.calls.length).toBeGreaterThan(1);
  });

  it("retries its own attempt after a failed save without calling it stale", async () => {
    const user = userEvent.setup();
    // The record committed but saving the file failed: the retry finds the
    // draft gone (stale) yet it is this window's attempt, so it records again.
    api.record.mockRejectedValueOnce("persist failed").mockResolvedValueOnce("res-new");
    renderRun();
    const panel = await screen.findByTestId("exec-panel");
    within(panel).getAllByRole("listitem", { name: /^Paso \d/ })[0].focus();
    await user.keyboard("p");
    await user.click(screen.getByTestId("exec-save"));
    await waitFor(() => expect(api.record).toHaveBeenCalledTimes(1));
    api.draftSave.mockRejectedValue("draft-stale: that attempt is already recorded");
    await user.click(screen.getByTestId("exec-save"));
    await waitFor(() => expect(api.record).toHaveBeenCalledTimes(2));
    expect(api.record.mock.calls[1][0].attemptId).toBe(api.record.mock.calls[0][0].attemptId);
    expect(await screen.findByText(/Intento guardado/)).toBeInTheDocument();
    expect(screen.queryByText(/otra ventana/)).not.toBeInTheDocument();
  });

  // FIX-19: a reload that reads before the autosave has written must not drop
  // the draft from memory, or «Guardar» starts another attempt that the backend
  // refuses as stale. `stored` plays the backend, with the rule of `check_fresh`.
  describe("when a reload overtakes the autosave", () => {
    let stored: Record<string, { attemptId: string }>;
    const file = new File(["x"], "captura.png", { type: "image/png" });
    const draftNow = () =>
      detail({
        draft: {
          targets: { ...stored },
          attachments: [],
          updatedAt: "2026-11-04T09:00:00.000Z",
        } as unknown as RunItemDetail["draft"],
      });
    const write = (key: string, state: { attemptId: string }) => {
      if (stored[key] && stored[key].attemptId !== state.attemptId) {
        throw new Error("draft-stale: another attempt is in progress");
      }
      stored[key] = state;
    };
    const fileInput = (panel: HTMLElement) =>
      panel.querySelector('input[type="file"]') as HTMLInputElement;
    const autosaved = () => new Promise((r) => setTimeout(r, 800));

    async function expectAttemptRecorded(user: ReturnType<typeof userEvent.setup>) {
      expect(screen.getByTestId("exec-step-1-pass")).toHaveAttribute("aria-pressed", "true");
      await user.click(screen.getByTestId("exec-save"));
      await waitFor(() => expect(api.record).toHaveBeenCalledTimes(1));
      expect(api.record.mock.calls[0][0].attemptId).toBe(stored["-/-"].attemptId);
      expect(screen.queryByText(/otra ventana/)).not.toBeInTheDocument();
    }

    beforeEach(() => {
      stored = {};
      api.itemDetail.mockImplementation(async () => draftNow());
      api.draftSave.mockImplementation(async (_i: string, key: string, state: { attemptId: string }) =>
        write(key, state),
      );
      api.attachToDraft.mockResolvedValue({ id: "a1" });
    });

    it("keeps a draft whose save is still scheduled", async () => {
      const user = userEvent.setup();
      renderRun();
      const panel = await screen.findByTestId("exec-panel");
      await user.click(screen.getByTestId("exec-step-1-pass"));
      await user.upload(fileInput(panel), file);
      await screen.findByText(/Adjunto guardado/);
      await autosaved();
      await expectAttemptRecorded(user);
    });

    it("keeps a draft whose save is on its way", async () => {
      const user = userEvent.setup();
      let writeNow = () => {};
      api.draftSave.mockImplementationOnce(
        (_i: string, key: string, state: { attemptId: string }) =>
          new Promise<void>((resolve) => {
            writeNow = () => {
              write(key, state);
              resolve();
            };
          }),
      );
      renderRun();
      const panel = await screen.findByTestId("exec-panel");
      await user.click(screen.getByTestId("exec-step-1-pass"));
      await waitFor(() => expect(api.draftSave).toHaveBeenCalledTimes(1), { timeout: 2000 });
      await user.upload(fileInput(panel), file);
      await screen.findByText(/Adjunto guardado/);
      writeNow();
      await expectAttemptRecorded(user);
    });

    it("keeps a draft saved while the reload was reading", async () => {
      const user = userEvent.setup();
      renderRun();
      const panel = await screen.findByTestId("exec-panel");
      let answer = () => {};
      api.itemDetail.mockImplementationOnce(() => {
        const snapshot = draftNow();
        return new Promise((resolve) => {
          answer = () => resolve(snapshot);
        });
      });
      await user.click(screen.getByTestId("exec-step-1-pass"));
      await user.upload(fileInput(panel), file);
      await waitFor(() => expect(api.attachToDraft).toHaveBeenCalled());
      await waitFor(() => expect(api.draftSave).toHaveBeenCalledTimes(1), { timeout: 2000 });
      await waitFor(() => expect(stored["-/-"]).toBeDefined());
      answer();
      await screen.findByText(/Adjunto guardado/);
      await autosaved();
      await expectAttemptRecorded(user);
    });

    it("still drops a draft that another window discarded", async () => {
      const user = userEvent.setup();
      renderRun();
      const panel = await screen.findByTestId("exec-panel");
      await user.click(screen.getByTestId("exec-step-1-pass"));
      await waitFor(() => expect(stored["-/-"]).toBeDefined(), { timeout: 2000 });
      await autosaved();
      stored = {};
      await user.upload(fileInput(panel), file);
      await screen.findByText(/Adjunto guardado/);
      await waitFor(() =>
        expect(screen.getByTestId("exec-step-1-pass")).toHaveAttribute("aria-pressed", "false"),
      );
    });
  });
});

describe("run screen on the web (EJE-06)", () => {
  beforeEach(() => {
    platform.desktop = false;
  });

  it("loads the run and executes it, without file controls, and says so", async () => {
    const user = userEvent.setup();
    // The run's header says where files and drafts are.
    const first = renderRun("/projects/p/runs/r1");
    expect(
      await screen.findByText(/Los adjuntos solo están disponibles en el escritorio\. Los borradores de ejecución se guardan en este navegador/),
    ).toBeInTheDocument();
    expect(api.overview).toHaveBeenCalledWith("r1", "test-user");
    first.unmount();
    const { container } = renderRun();
    const panel = await screen.findByTestId("exec-panel");
    expect(within(panel).getByTestId("exec-attach-desktop-only")).toHaveTextContent("Los adjuntos solo están disponibles en el escritorio.");
    for (const id of ["exec-step-1-attach", "exec-result-attach", "exec-paste"])
      expect(within(panel).queryByTestId(id)).not.toBeInTheDocument();
    // Run actions are offered too, except deleting it (desktop only, EJE-07).
    expect((await screen.findAllByTestId("run-close")).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("run-delete")).not.toBeInTheDocument();
    await expectNoAxeViolations(container);

    within(panel).getAllByRole("listitem", { name: /^Paso \d/ })[0].focus();
    await user.keyboard("p");
    expect(await within(panel).findByText(/Borrador guardado en este navegador/)).toBeInTheDocument();
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(api.record).toHaveBeenCalledTimes(1));
    expect(api.record.mock.calls[0][0]).toMatchObject({ runItemId: "i1", status: "passed" });
  });

  it("refuses a pasted capture and leaves Ctrl+V out of the shortcuts", async () => {
    const user = userEvent.setup();
    renderRun();
    const panel = await screen.findByTestId("exec-panel");
    const step = within(panel).getAllByRole("listitem", { name: /^Paso \d/ })[0];
    step.focus();
    await user.paste({
      files: [new File(["x"], "shot.png", { type: "image/png" })],
      getData: () => "",
      types: ["Files"],
    } as unknown as DataTransfer);
    expect(api.attachToDraft).not.toHaveBeenCalled();
    // The hint in the result block, and the toast that answers the paste.
    await waitFor(() => expect(screen.getAllByText(/Los adjuntos solo están disponibles en el escritorio\.$/)).toHaveLength(2));
    await user.click(within(panel).getByRole("button", { name: "Atajos" }));
    const dialog = await screen.findByRole("dialog", { name: "Atajos" });
    expect(within(dialog).queryByText("Ctrl+V")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Ctrl+Enter")).toBeInTheDocument();
  });

  it("reloads the item when another tab changes its draft or records an attempt", async () => {
    renderRun();
    await screen.findByTestId("exec-panel");
    const loads = api.itemDetail.mock.calls.length;
    // Another account's draft or an unrelated key: nothing to do.
    window.dispatchEvent(new StorageEvent("storage", { key: "pharos:exec-draft:someone:i1" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    expect(api.itemDetail.mock.calls.length).toBe(loads);
    window.dispatchEvent(new StorageEvent("storage", { key: "pharos:exec-draft:test-user:i1" }));
    await waitFor(() => expect(api.itemDetail.mock.calls.length).toBe(loads + 1));
    window.dispatchEvent(new StorageEvent("storage", { key: "pharos:exec-recorded:test-user" }));
    await waitFor(() => expect(api.itemDetail.mock.calls.length).toBe(loads + 2));
  });

  it("offers «Nuevo run manual» and notes the desktop-only import", async () => {
    const user = userEvent.setup();
    api.list.mockResolvedValue([run()]);
    api.counts.mockResolvedValue([]);
    api.unlinked.mockResolvedValue([]);
    renderWithProviders(
      <ToastProvider>
        <RunsPage projectId="p" cases={[]} />
      </ToastProvider>,
      { route: "/projects/p/runs" },
    );
    expect(await screen.findByTestId("run-new")).toBeEnabled();
    expect(screen.getByRole("button", { name: /Importar informe/ })).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: /Sin vincular/ }));
    expect(await screen.findByTestId("runs-unlinked-desktop-only")).toBeInTheDocument();
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
