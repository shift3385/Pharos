import "@test/slow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { selectValue } from "@test/select";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import type { Requirement } from "../model/types";
import { RequirementsPage, TraceabilityPage } from "./TraceabilityPage";

const list = vi.fn();
const remove = vi.fn();
vi.mock("../api/requirementApi", () => ({
  requirementApi: {
    list: (...a: unknown[]) => list(...a),
    remove: (...a: unknown[]) => remove(...a),
  },
}));
vi.mock("@modules/test-cases", () => ({
  projectTraceableCases: async () => [
    { id: "c1", scenarioId: "PCL-0142", title: "Pago con 3-D Secure", status: "approved", requirementKeys: ["REQ-031"], traceability: "" },
    { id: "c2", scenarioId: "PCL-0143", title: "Pago rechazado", status: "approved", requirementKeys: ["REQ-031"], traceability: "" },
    { id: "c3", scenarioId: "PCL-0170", title: "Alta de dirección", status: "draft", requirementKeys: [], traceability: "" },
  ],
  setCaseRequirementKeys: vi.fn(),
  caseLink: (p: string, c: string) => `/projects/${p}/cases?case=${c}`,
}));
vi.mock("@modules/defects", () => ({
  isOpenDefect: (s: string) => s !== "closed" && s !== "rejected",
  projectDefects: async () => [
    { id: "d1", defectKey: "DEF-018", title: "Doble cargo", status: "in_progress", caseIds: ["c1"] },
  ],
}));
// The execution derivation (EJE-04): one case passed in an imported
// Playwright run, the other failed in a manual run.
const summary = vi.fn();
const lastOf = (over: Record<string, unknown>) => ({
  resultId: "r",
  runTitle: "",
  trigger: "manual",
  sourceTool: null,
  origin: "manual",
  status: "passed",
  configurationLabel: null,
  flaky: false,
  revisionId: "rev",
  stale: false,
  ...over,
});
const baseSummary = (risk: number | null = null) => ({
  cases: [
    { caseId: "c1", status: "passed", last: lastOf({ runId: "run2", runKey: "RUN-002", origin: "imported", trigger: "import", sourceTool: "playwright", at: "2026-11-02T09:00:01Z", flaky: true }) },
    { caseId: "c2", status: "failed", last: lastOf({ runId: "run1", runKey: "RUN-001", status: "failed", at: "2026-11-01T10:00:00Z" }) },
  ],
  requirements: [
    { requirementKey: "REQ-051", riskLevel: risk, riskBand: risk ? "high" : "unassessed" },
  ],
  options: { builds: ["1.4.2"], environments: ["staging"] },
});
vi.mock("@modules/runs", () => ({
  executionApi: { summary: (...a: unknown[]) => summary(...a) },
}));
vi.mock("@modules/cycles", () => ({
  cycleApi: { list: async () => [{ id: "y1", cycleKey: "CYC-001", title: "Regresión" }] },
  configurationApi: { list: async () => [{ id: "k1", name: "Chrome" }] },
}));
vi.mock("@modules/ai", async (orig) => ({
  ...(await orig<typeof import("@modules/ai")>()),
  aiAvailable: () => Promise.resolve(true),
}));

const req = (key: string, title: string, priority: Requirement["priority"]): Requirement => ({
  id: key,
  projectId: "p1",
  requirementKey: key,
  title,
  description: "",
  priority,
  createdAt: "",
  updatedAt: "",
  revision: 1,
});

beforeEach(async () => {
  await i18n.changeLanguage("es");
  list.mockResolvedValue([
    req("REQ-031", "Pago con tarjeta guardada", "high"),
    req("REQ-047", "Exportar historial a CSV", "low"),
    req("REQ-051", "Notificación de pago", "high"),
  ]);
  remove.mockResolvedValue(undefined);
  summary.mockReset();
  summary.mockResolvedValue(baseSummary());
});

describe("Trazabilidad (RED-V3)", () => {
  it("shows the indicators and the 9-column matrix with uncovered rows and their AI action", async () => {
    setViewportWidth(1440);
    renderWithProviders(<TraceabilityPage projectId="p1" projectName="Portal" />);
    const table = await screen.findByRole("table", { name: "Matriz de trazabilidad" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(9);
    // 2 rows for REQ-031 (two cases) + one for each uncovered requirement.
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(table).getByText("DEF-018")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "PCL-0142" })).toHaveAttribute("href", "/projects/p1/cases?case=c1");
    expect(within(table).getByText(/Defecto abierto/)).toBeInTheDocument();
    expect(within(table).getAllByText("Sin cubrir")).toHaveLength(2);
    expect(within(table).getByRole("button", { name: "Generar casos con IA desde REQ-047" })).toBeInTheDocument();
    const kpis = document.querySelector(".tz-kpis")!;
    expect(kpis).toHaveTextContent("33 %");
    expect(kpis).toHaveTextContent("2 de prioridad alta");
    // Three requirements fit in the smallest page: no pagination footer.
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("gives the titles the room and up to two lines, and the notes less (NC-053)", async () => {
    setViewportWidth(1440);
    renderWithProviders(<TraceabilityPage projectId="p1" projectName="Portal" />);
    const table = await screen.findByRole("table", { name: "Matriz de trazabilidad" });
    const tracks = table.style.getPropertyValue("--dt-cols");
    expect(tracks).toContain("minmax(140px,1.6fr)");
    expect(tracks).toContain("minmax(140px,1.7fr)");
    expect(tracks).toContain("minmax(0,0.8fr)");
    const titles = table.querySelectorAll(".tz-clamp");
    expect(titles.length).toBeGreaterThan(0);
    titles.forEach((title) => expect(title).toHaveAttribute("title", title.textContent ?? ""));
  });

  it("«Mostrar solo huecos» counts and keeps only the uncovered requirements", async () => {
    setViewportWidth(1440);
    renderWithProviders(<TraceabilityPage projectId="p1" projectName="Portal" />);
    const toggle = await screen.findByRole("switch", { name: "Mostrar solo huecos (2)" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).queryByText("REQ-031")).not.toBeInTheDocument();
  });

  it("opens the existing AI generator from an uncovered requirement", async () => {
    setViewportWidth(1440);
    renderWithProviders(<TraceabilityPage projectId="p1" projectName="Portal" />);
    await userEvent.click(await screen.findByRole("button", { name: "Generar casos con IA desde REQ-051" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Generar casos desde REQ-051");
  });

  it("is labelled cards on mobile", async () => {
    setViewportWidth(390);
    renderWithProviders(<TraceabilityPage projectId="p1" projectName="Portal" />);
    const cards = await screen.findByRole("list", { name: "Matriz de trazabilidad" });
    const items = within(cards).getAllByRole("listitem").filter((li) => li.parentElement === cards);
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("Casos vinculados · 2")).toBeInTheDocument();
    expect(within(items[1]).getByText("Ningún caso cubre este requisito.")).toBeInTheDocument();
    expect(within(items[1]).getByRole("button", { name: "Generar casos con IA" })).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("lists the requirements and deletes one only through «Cancelar»-guarded confirmation", async () => {
    setViewportWidth(1440);
    renderWithProviders(<RequirementsPage projectId="p1" projectName="Portal" />);
    const table = await screen.findByRole("table", { name: "Requisitos" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    await expectNoAxeViolations();
    await userEvent.click(within(table).getByRole("button", { name: "Eliminar REQ-047" }));
    const dialog = screen.getByRole("alertdialog");
    await userEvent.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("REQ-047", expect.any(String)));
  });

  it("shows each case's latest result from a manual and an imported run, filters them and orders by risk (EJE-04)", async () => {
    setViewportWidth(1440);
    summary.mockResolvedValue(baseSummary(20));
    renderWithProviders(<TraceabilityPage projectId="p1" projectName="Portal" />);
    const table = await screen.findByRole("table", { name: "Matriz de trazabilidad" });
    await waitFor(() => expect(within(table).getByRole("link", { name: "RUN-002" })).toBeInTheDocument());
    expect(within(table).getByRole("link", { name: "RUN-002" })).toHaveAttribute("href", "/projects/p1/runs/run2");
    expect(within(table).getByRole("link", { name: "RUN-001" })).toBeInTheDocument();
    expect(within(table).getAllByText("Pasa").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Falla").length).toBeGreaterThan(0);
    expect(within(table).getByText("Flaky")).toBeInTheDocument();
    // Risk first: REQ-051 (20, high) heads the matrix.
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("REQ-051");
    expect(rows[1]).toHaveTextContent("Riesgo 20 · Alto");
    await expectNoAxeViolations();
    // A filter asks the derivation again, scoped.
    await selectValue(screen.getByTestId("trace-filter-cycle"), "y1");
    await waitFor(() =>
      expect(summary).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: "p1", cycleId: "y1" }), expect.any(String)),
    );
    await selectValue(screen.getByTestId("trace-filter-build"), "1.4.2");
    await waitFor(() =>
      expect(summary).toHaveBeenLastCalledWith(expect.objectContaining({ cycleId: "y1", build: "1.4.2" }), expect.any(String)),
    );
    await userEvent.click(screen.getByTestId("trace-filters-clear"));
    await waitFor(() =>
      expect(summary).toHaveBeenLastCalledWith(expect.objectContaining({ cycleId: undefined, build: undefined }), expect.any(String)),
    );
    // By ID: REQ-031 first again.
    await selectValue(screen.getByTestId("trace-sort"), "key");
    expect(within(screen.getByRole("table", { name: "Matriz de trazabilidad" })).getAllByRole("row")[1]).toHaveTextContent("REQ-031");
  });
});

describe("Requisitos and Trazabilidad as two sections (UX-21)", () => {
  it("«Requisitos» has the list, «Importar» and «Nuevo requisito», and no matrix nor execution read", async () => {
    setViewportWidth(1440);
    renderWithProviders(<RequirementsPage projectId="p1" projectName="Portal" />);
    expect(await screen.findByRole("table", { name: "Requisitos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo requisito" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Importar" }));
    expect(await screen.findByRole("menuitem", { name: /Importar requisitos \(\.csv\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Exportar matriz/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Matriz de trazabilidad" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Requisitos 3" })).not.toBeInTheDocument();
    expect(summary).not.toHaveBeenCalled();
  });

  it("«Trazabilidad» has the matrix and its export, and no requirement form", async () => {
    setViewportWidth(1440);
    renderWithProviders(<TraceabilityPage projectId="p1" projectName="Portal" />);
    expect(await screen.findByRole("table", { name: "Matriz de trazabilidad" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar matriz (.xlsx)" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Nuevo requisito" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Importar" })).not.toBeInTheDocument();
  });

  it("an empty matrix links to «Requisitos», its sibling section", async () => {
    setViewportWidth(1440);
    list.mockResolvedValue([]);
    renderWithProviders(<TraceabilityPage projectId="p1" projectName="Portal" />, { route: "/projects/p1/traceability" });
    const link = await screen.findByRole("link", { name: "Ir a Requisitos" });
    expect(link).toHaveAttribute("href", "/projects/p1/requirements");
    expect(screen.getByRole("button", { name: "Exportar matriz (.xlsx)" })).toBeDisabled();
  });
});

describe("Trazabilidad when it fails to load", () => {
  it("shows the error instead of «Cargando…», and «Reintentar» loads the matrix", async () => {
    setViewportWidth(1440);
    list.mockRejectedValueOnce(new Error("down"));
    renderWithProviders(<TraceabilityPage projectId="p1" projectName="Portal" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar la trazabilidad.");
    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("table", { name: "Matriz de trazabilidad" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
