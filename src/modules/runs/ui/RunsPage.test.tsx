// «Ejecuciones»: the runs list, the unlinked tray (ING-05) and the import
// dialog (ING-02..05), with the desktop commands mocked. axe checks the markup
// of each (UX-05, ADR-0027).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { parseReportText } from "@shared/contracts/pharos-run/importers";
import type {
  ReportImportPreview,
  Run,
  UnlinkedTest,
} from "@shared/contracts/contract";
import { RunsPage } from "./RunsPage";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  results: vi.fn(),
  unlinked: vi.fn(),
  link: vi.fn(),
  preview: vi.fn(),
  importReport: vi.fn(),
  attach: vi.fn(),
}));
vi.mock("../api/runsApi", () => ({ runsApi: api }));
vi.mock("@shared/platform", async (orig) => ({
  ...(await orig<typeof import("@shared/platform")>()),
  isTauri: () => true,
}));
// jsdom's File has no text()/stream(): read the fixture directly.
vi.mock("../model/importFlow", async (orig) => {
  const real = await orig<typeof import("../model/importFlow")>();
  return {
    ...real,
    readReport: async (file: File) => ({
      file,
      parsed: parseReportText(
        readFileSync(
          resolve(
            process.cwd(),
            "src/shared/contracts/pharos-run/fixtures/ing01/shard2/ctrf.json",
          ),
          "utf8",
        ),
      ),
      sha256: "ab".repeat(32),
    }),
  };
});

const run = (over: Partial<Run>): Run => ({
  id: "r1",
  projectId: "p",
  runKey: "RUN-001",
  title: "CI #12",
  trigger: "import",
  sourceTool: "playwright",
  sourceToolVersion: null,
  testPlanId: null,
  cycleId: null,
  configurationId: null,
  environment: null,
  build: "1.4.2",
  commitSha: null,
  branch: null,
  repositoryUrl: null,
  ciUrl: null,
  dataset: null,
  context: {},
  status: "completed",
  startedAt: "2026-10-27T03:52:07.031Z",
  finishedAt: null,
  summary: {},
  data: {},
  createdBy: "u",
  createdAt: "2026-10-27 03:52:07",
  updatedAt: "2026-10-27 03:52:07",
  revision: 1,
  ...over,
});
const tray: UnlinkedTest[] = [
  {
    testKey: "tests/a.spec.ts::Checkout › pays",
    name: "pays",
    results: 2,
    lastStatus: "failed",
    lastRunId: "r1",
    lastRunKey: "RUN-001",
    lastSeen: "2026-10-27 03:52:07",
    reason: "no-tag",
    caseKey: null,
    mappedCaseId: null,
  },
  {
    testKey: "tests/b.spec.ts::other",
    name: "other",
    results: 1,
    lastStatus: "passed",
    lastRunId: "r1",
    lastRunKey: "RUN-001",
    lastSeen: "2026-10-27 03:52:07",
    reason: "unknown-case",
    caseKey: "TC-999",
    mappedCaseId: "c2",
  },
];
const cases = [
  { id: "c1", scenarioId: "TC-001", title: "Login" },
  { id: "c2", scenarioId: "TC-002", title: "Pay" },
];
const preview: ReportImportPreview = {
  format: "ctrf",
  tests: 2,
  results: 3,
  linked: 3,
  unlinked: 0,
  attachments: 2,
  statuses: { passed: 1, failed: 1 },
  duplicateOf: null,
  warnings: [{ code: "unknown-case", testKey: "k", detail: "TC-009" }],
};

beforeEach(async () => {
  await i18n.changeLanguage("es");
  Object.values(api).forEach((f) => f.mockReset());
  api.list.mockResolvedValue([
    run({}),
    run({
      id: "r2",
      runKey: "RUN-002",
      trigger: "manual",
      title: "Manual",
      status: "in_progress",
    }),
  ]);
  api.results.mockResolvedValue([
    { isFinal: true, status: "passed", effectiveTestCaseId: "c1" },
    { isFinal: true, status: "failed", effectiveTestCaseId: null },
  ]);
  api.unlinked.mockResolvedValue(tray);
  api.link.mockResolvedValue("m");
  api.preview.mockResolvedValue(preview);
  api.importReport.mockResolvedValue({
    runId: "r3",
    runKey: "RUN-003",
    shardId: "s",
    alreadyImported: false,
    results: 3,
    linked: 3,
    unlinked: 0,
    attachments: [],
    warnings: [],
  });
});

describe("RunsPage", () => {
  it("lists the runs with their counts and filters the imported ones", async () => {
    renderWithProviders(<RunsPage projectId="p" cases={cases} />);
    const table = await screen.findByRole("table", { name: "Runs" });
    expect(within(table).getByText("RUN-001")).toBeInTheDocument();
    expect(within(table).getByText("RUN-002")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(table).getAllByText("1 sin vincular")).toHaveLength(2),
    );
    await userEvent.click(screen.getByRole("button", { name: /Importados/ }));
    expect(within(table).queryByText("RUN-002")).not.toBeInTheDocument();
    // The tray tab says how many tests wait for a link.
    expect(screen.getByRole("tab", { name: /Sin vincular/ })).toHaveTextContent(
      "1",
    );
    await expectNoAxeViolations();
  });

  it("links a test of the tray to a case and unlinks a manual link", async () => {
    renderWithProviders(<RunsPage projectId="p" cases={cases} />);
    await userEvent.click(
      await screen.findByRole("tab", { name: /Sin vincular/ }),
    );
    expect(screen.getByText("Sin etiqueta de caso")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Vincular… pays" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Vincular a un caso" });
    await userEvent.type(within(dialog).getByRole("searchbox"), "login");
    expect(within(dialog).queryByText("Pay")).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("radio", { name: /TC-001/ }),
    );
    await expectNoAxeViolations();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Vincular" }),
    );
    expect(api.link).toHaveBeenCalledWith(
      "p",
      "tests/a.spec.ts::Checkout › pays",
      "c1",
      "test-user",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Vinculados a mano/ }),
    );
    expect(screen.getByText("Vinculado a TC-002")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Desvincular other" }),
    );
    expect(api.link).toHaveBeenLastCalledWith(
      "p",
      "tests/b.spec.ts::other",
      null,
      "test-user",
    );
  });

  it("imports a report: preview, then the run it went into", async () => {
    renderWithProviders(<RunsPage projectId="p" cases={cases} />);
    await screen.findByRole("table", { name: "Runs" });
    await userEvent.click(
      screen.getByRole("button", { name: "Importar informe" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Importar un informe de resultados",
    });
    const confirm = within(dialog).getByRole("button", { name: "Importar" });
    expect(confirm).toBeDisabled();
    await userEvent.upload(
      within(dialog).getByLabelText(/^Informe/),
      new File(["{}"], "ctrf.json"),
    );
    // Shard from the report (CTRF environment.shardId "2-of-2").
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/^Shard/)).toHaveValue("2"),
    );
    await within(dialog).findByText(/2 tests, 3 intentos: 3 se vinculan/);
    expect(
      within(dialog).getByText(/TC-009 no es un caso de este proyecto/),
    ).toBeInTheDocument();
    // CTRF names its attachments by path: the folder picker appears.
    expect(
      within(dialog).getByLabelText(/Carpeta de adjuntos/),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
    await userEvent.click(confirm);
    expect(
      await within(dialog).findByText(/RUN-003: 3 resultados importados/),
    ).toBeInTheDocument();
    const request = api.importReport.mock.calls[0][0];
    expect(request).toMatchObject({
      projectId: "p",
      userId: "test-user",
      shardIndex: 2,
      shardTotal: 2,
    });
    expect(request.newRun.title).toContain("ctrf.json");
  });

  it("blocks a duplicate new run until the user asks for it, and shows errors", async () => {
    api.preview.mockResolvedValue({ ...preview, duplicateOf: "RUN-001" });
    renderWithProviders(<RunsPage projectId="p" cases={cases} />);
    await screen.findByRole("table", { name: "Runs" });
    await userEvent.click(
      screen.getByRole("button", { name: "Importar informe" }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.upload(
      within(dialog).getByLabelText(/^Informe/),
      new File(["{}"], "ctrf.json"),
    );
    const box = await within(dialog).findByRole("checkbox", {
      name: /ya se importó en RUN-001/,
    });
    const confirm = within(dialog).getByRole("button", { name: "Importar" });
    expect(confirm).toBeDisabled();
    await userEvent.click(box);
    expect(confirm).toBeEnabled();
    api.importReport.mockRejectedValue("run-closed");
    await userEvent.click(confirm);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "El run está cerrado",
    );
  });
});
