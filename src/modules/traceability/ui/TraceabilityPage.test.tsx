import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import type { Requirement } from "../model/types";
import { TraceabilityPage } from "./TraceabilityPage";

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
vi.mock("@modules/planner", () => ({
  projectDefects: async () => [
    { id: "d1", cardKey: "DEF-018", title: "Doble cargo", status: "in_progress", data: { testCaseIds: ["c1"] } },
  ],
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
    expect(within(table).getByText("Defecto abierto")).toBeInTheDocument();
    expect(within(table).getAllByText("Sin cubrir")).toHaveLength(2);
    expect(within(table).getByRole("button", { name: "Generar casos con IA desde REQ-047" })).toBeInTheDocument();
    const kpis = document.querySelector(".tz-kpis")!;
    expect(kpis).toHaveTextContent("33 %");
    expect(kpis).toHaveTextContent("2 de prioridad alta");
    expect(screen.getByText(/Mostrando/)).toHaveTextContent("Mostrando 1–3 de 3 requisitos");
    await expectNoAxeViolations();
  }, 15_000);

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
  }, 15_000);

  it("lists the requirements and deletes one only through «Cancelar»-guarded confirmation", async () => {
    setViewportWidth(1440);
    renderWithProviders(<TraceabilityPage projectId="p1" projectName="Portal" />);
    await userEvent.click(await screen.findByRole("button", { name: "Requisitos 3" }));
    const table = screen.getByRole("table", { name: "Requisitos" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    await expectNoAxeViolations();
    await userEvent.click(within(table).getByRole("button", { name: "Eliminar REQ-047" }));
    const dialog = screen.getByRole("alertdialog");
    await userEvent.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("REQ-047", expect.any(String)));
  }, 15_000);
});
