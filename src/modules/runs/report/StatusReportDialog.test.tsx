import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { SUMMARY } from "./__fixtures__/summary";
import { StatusReportDialog } from "./StatusReportDialog";

const summary = vi.fn();
vi.mock("../api/executionApi", async (orig) => ({
  ...(await orig<typeof import("../api/executionApi")>()),
  executionApi: { summary: (...a: unknown[]) => summary(...a) },
}));
vi.mock("@modules/cycles", () => ({
  cycleApi: { list: async () => [{ id: "y1", cycleKey: "CYC-001", title: "Regresión" }] },
}));
vi.mock("@modules/test-plan", () => ({
  projectPlanRef: async () => ({ id: "pl1", title: "Plan v1", version: "1.0" }),
}));
const exportXlsx = vi.fn();
const exportPdf = vi.fn();
vi.mock("./reportXlsx", () => ({ exportReportXlsx: (...a: unknown[]) => exportXlsx(...a) }));
vi.mock("./reportPdf", () => ({ exportReportPdf: (...a: unknown[]) => exportPdf(...a) }));

beforeEach(async () => {
  await i18n.changeLanguage("es");
  window.localStorage.clear();
  summary.mockReset();
  summary.mockResolvedValue(SUMMARY);
  exportXlsx.mockResolvedValue("C:/Descargas/informe.xlsx");
  exportPdf.mockResolvedValue("C:/Descargas/informe.pdf");
});

describe("Informe de estado (EJE-03)", () => {
  it("previews the sections from the derivation, with the exit criteria evaluated", async () => {
    setViewportWidth(1440);
    renderWithProviders(<StatusReportDialog projectId="p1" projectName="Portal" onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog", { name: "Informe de estado de pruebas" });
    await within(dialog).findByText("1. Identificación");
    expect(summary).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p1", cycleId: undefined }), expect.any(String));
    expect(dialog).toHaveTextContent("RUN-002, RUN-001");
    expect(dialog).toHaveTextContent("(a fecha de hoy)");
    const exit = within(dialog).getByTestId("report-exit");
    expect(within(exit).getAllByText("No cumple")).toHaveLength(2);
    expect(within(exit).getByText("Cumple")).toBeInTheDocument();
    expect(within(dialog).getByTestId("report-summary")).toHaveValue(
      "Se han ejecutado 3 de 4 casos (75.0 %), con una tasa de éxito de 33.3 %. Hay 1 defectos abiertos, 1 críticos. Criterios de salida: 1 de 3 cumplidos.",
    );
    expect(dialog).toHaveTextContent("se guardan solo en este equipo");
    await expectNoAxeViolations();
  }, 20_000);

  it("scopes to a cycle and a period, keeps the texts on this device and exports them", async () => {
    setViewportWidth(1440);
    renderWithProviders(<StatusReportDialog projectId="p1" projectName="Portal" initialCycleId="y1" onClose={() => {}} />);
    await screen.findByText("1. Identificación");
    expect(summary).toHaveBeenLastCalledWith(expect.objectContaining({ cycleId: "y1" }), expect.any(String));
    await userEvent.type(screen.getByTestId("report-from"), "2026-11-01");
    await waitFor(() =>
      expect(summary).toHaveBeenLastCalledWith(
        expect.objectContaining({ cycleId: "y1", from: new Date(2026, 10, 1).getTime() }),
        expect.any(String),
      ),
    );
    await userEvent.type(screen.getByTestId("report-recommendations"), "Repetir TC-002");
    expect(JSON.parse(window.localStorage.getItem("pharos:status-report:p1:cycle:y1")!)).toMatchObject({
      recommendations: "Repetir TC-002",
    });
    await userEvent.click(screen.getByTestId("report-export-xlsx"));
    await waitFor(() => expect(exportXlsx).toHaveBeenCalled());
    expect(exportXlsx.mock.calls[0][0]).toMatchObject({ recommendations: "Repetir TC-002" });
    expect(exportXlsx.mock.calls[0][2]).toMatch(/^Informe_de_estado_de_pruebas_Portal_\d{4}-\d{2}-\d{2}\.xlsx$/);
    await userEvent.click(screen.getByTestId("report-export-pdf"));
    await waitFor(() => expect(exportPdf).toHaveBeenCalled());
  }, 20_000);

  it("fits a phone", async () => {
    setViewportWidth(390);
    renderWithProviders(<StatusReportDialog projectId="p1" projectName="Portal" onClose={() => {}} />);
    await screen.findByText("1. Identificación");
    await expectNoAxeViolations();
  }, 20_000);
});
