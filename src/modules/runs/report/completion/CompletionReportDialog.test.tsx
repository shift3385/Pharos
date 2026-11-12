import "@test/slow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { CLOSED } from "../__fixtures__/summary";
import { CompletionReportDialog } from "./CompletionReportDialog";

const summary = vi.fn();
const getCycle = vi.fn();
const updateCycle = vi.fn();
vi.mock("../../api/executionApi", async (orig) => ({
  ...(await orig<typeof import("../../api/executionApi")>()),
  executionApi: { summary: (...a: unknown[]) => summary(...a) },
}));
vi.mock("@modules/cycles", () => ({
  cycleApi: {
    get: (...a: unknown[]) => getCycle(...a),
    update: (...a: unknown[]) => updateCycle(...a),
  },
  configurationApi: { list: async () => [{ id: "cf1", name: "Chrome · Windows" }] },
}));
vi.mock("@modules/defects", () => ({
  defectsApi: {
    list: async () => [
      { id: "d1", defectKey: "DEF-001", title: "Doble cargo", severity: "critical", status: "open", foundInRunId: "run1" },
    ],
  },
}));
vi.mock("@modules/test-plan", () => ({
  projectPlanForCompletion: async () => ({
    title: "Plan Portal",
    version: "4",
    documentId: "TP-PH-3FA21C",
    approved: true,
    objectives: [{ kind: "passRate", op: ">=", target: 90 }],
    deliverables: [{ key: "perf", label: "Informe de rendimiento" }],
    testData: "",
  }),
}));
const exportXlsx = vi.fn();
const exportPdf = vi.fn();
vi.mock("./completionXlsx", () => ({ exportCompletionXlsx: (...a: unknown[]) => exportXlsx(...a) }));
vi.mock("./completionPdf", () => ({ exportCompletionPdf: (...a: unknown[]) => exportPdf(...a) }));

const cycle = (data: Record<string, unknown> = {}) => ({
  id: "y1",
  projectId: "p1",
  cycleKey: "CYC-007",
  title: "Regresión 12",
  description: "",
  testPlanId: null,
  milestone: null,
  sprint: null,
  build: null,
  environment: null,
  configurationIds: ["cf1"],
  startsOn: "2026-11-01",
  endsOn: "2026-11-03",
  status: "closed",
  data: { closures: [CLOSED.closure], ...data },
  createdAt: "",
  updatedAt: "",
  revision: 3,
});

const open = () =>
  renderWithProviders(
    <CompletionReportDialog projectId="p1" projectName="Portal" projectPrefix="PH-" cycleId="y1" onClose={() => {}} />,
  );

beforeEach(async () => {
  await i18n.changeLanguage("es");
  summary.mockReset();
  summary.mockResolvedValue(CLOSED);
  getCycle.mockReset();
  getCycle.mockResolvedValue(cycle());
  updateCycle.mockReset();
  updateCycle.mockImplementation(async (_id: string, input: { data: Record<string, unknown> }) => cycle(input.data));
  exportXlsx.mockResolvedValue("C:/Descargas/cierre.xlsx");
  exportPdf.mockResolvedValue("C:/Descargas/cierre.pdf");
});

describe("Informe de cierre (DOC-01)", () => {
  it("previews the eleven sections of a closed cycle", async () => {
    setViewportWidth(1440);
    open();
    const dialog = await screen.findByRole("dialog", { name: "Informe de cierre de pruebas" });
    await within(dialog).findByText("Desviaciones respecto al plan");
    expect(summary).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p1", cycleId: "y1" }), expect.any(String));
    expect(dialog).toHaveTextContent("TCR-PH-CYC-007");
    expect(dialog).toHaveTextContent("Go con riesgos");
    expect(dialog).toHaveTextContent("+2 días");
    expect(dialog).toHaveTextContent("Objetivo del plan");
    expect(dialog).toHaveTextContent("DEF-001");
    expect(dialog).toHaveTextContent("Chrome · Windows");
    expect(within(dialog).getByTestId("completion-approve")).toBeDisabled();
    await expectNoAxeViolations();
  });

  it("saves the texts in the cycle, then approves with author and date; editing takes it away", async () => {
    setViewportWidth(1440);
    open();
    await screen.findByText("Desviaciones respecto al plan");
    await userEvent.type(screen.getByTestId("completion-lessons"), "Reservar el sandbox");
    await userEvent.click(screen.getByRole("checkbox", { name: /Informe de rendimiento/ }));
    await userEvent.click(screen.getByTestId("completion-save"));
    await waitFor(() => expect(updateCycle).toHaveBeenCalledTimes(1));
    const saved = updateCycle.mock.calls[0][1].data;
    expect(saved.closures).toEqual([CLOSED.closure]);
    expect(saved.completionReport).toMatchObject({
      lessons: "Reservar el sandbox",
      delivered: { perf: true },
      closedAt: CLOSED.closure!.closedAt,
      approval: null,
    });

    await userEvent.click(await screen.findByTestId("completion-approve"));
    await userEvent.click(screen.getByTestId("completion-approve-confirm"));
    await waitFor(() => expect(updateCycle).toHaveBeenCalledTimes(2));
    expect(updateCycle.mock.calls[1][1].data.completionReport.approval).toMatchObject({
      by: expect.any(String),
      at: expect.any(String),
    });
    expect(await screen.findByTestId("completion-approval")).toHaveTextContent(/Aprobado por/);

    await userEvent.type(screen.getByTestId("completion-lessons"), ".");
    expect(screen.getByTestId("completion-approval")).toHaveTextContent("pierde la aprobación");
  });

  it("after a new closing keeps the texts, drops the approval and says so (D3)", async () => {
    getCycle.mockResolvedValue(
      cycle({
        completionReport: {
          closedAt: "2026-10-01T10:00:00.000Z",
          lessons: "De antes",
          approval: { by: "u1", byName: "Ana", at: "2026-10-02T10:00:00.000Z" },
        },
      }),
    );
    setViewportWidth(1440);
    open();
    expect(await screen.findByTestId("completion-stale")).toBeInTheDocument();
    expect(screen.getByTestId("completion-lessons")).toHaveValue("De antes");
    expect(screen.getByTestId("completion-approval")).not.toHaveTextContent("Aprobado por");
    expect(screen.getByTestId("completion-approve")).toBeDisabled();
  });

  it("exports PDF and .xlsx with the project and cycle in the name", async () => {
    setViewportWidth(1440);
    open();
    await screen.findByText("Desviaciones respecto al plan");
    await userEvent.click(screen.getByTestId("completion-export-pdf"));
    await waitFor(() => expect(exportPdf).toHaveBeenCalled());
    expect(exportPdf.mock.calls[0][2]).toMatch(/^Informe_cierre_Portal_CYC-007_\d{4}-\d{2}-\d{2}\.pdf$/);
    await userEvent.click(screen.getByTestId("completion-export-xlsx"));
    await waitFor(() => expect(exportXlsx).toHaveBeenCalled());
    expect(exportXlsx.mock.calls[0][2].rows[0][0]).toBe("TC-001");
  });

  it("fits a phone", async () => {
    setViewportWidth(390);
    open();
    await screen.findByText("Desviaciones respecto al plan");
    await expectNoAxeViolations();
  });
});
