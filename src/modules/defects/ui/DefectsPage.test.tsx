import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import type { Defect } from "../model/types";
import { DefectsPage } from "./DefectsPage";
import { DefectEditor } from "./DefectEditor";

const list = vi.fn();
const create = vi.fn();
const update = vi.fn();
const transition = vi.fn();
const link = vi.fn();
const draftFromResult = vi.fn();
const results = vi.fn();
vi.mock("../api/defectsApi", () => ({
  MAX_ATTACHMENT_MB: 200,
  defectsApi: {
    list: (...a: unknown[]) => list(...a),
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
    transition: (...a: unknown[]) => transition(...a),
    link: (...a: unknown[]) => link(...a),
    remove: vi.fn(),
    draftFromResult: (...a: unknown[]) => draftFromResult(...a),
    results: (...a: unknown[]) => results(...a),
    attachmentList: () => Promise.resolve([]),
  },
}));
vi.mock("@modules/custom-fields", async (orig) => ({
  ...(await orig<typeof import("@modules/custom-fields")>()),
  customFieldApi: { list: () => Promise.resolve([]) },
}));
// The desktop: results and evidence are there.
vi.mock("@shared/platform", async (orig) => {
  const real = await orig<typeof import("@shared/platform")>();
  return { ...real, capabilities: { ...real.capabilities, results: () => true, attachments: () => true } };
});

const defect = (id: string, over: Partial<Defect>): Defect => ({
  id,
  projectId: "p1",
  defectKey: id.toUpperCase(),
  title: id,
  description: "",
  stepsToReproduce: "",
  expected: null,
  actual: null,
  severity: "major",
  priority: "medium",
  status: "new",
  resolution: null,
  foundInRunId: null,
  foundInBuild: null,
  foundInEnvironment: null,
  fixedInBuild: null,
  reporter: "u1",
  assignee: null,
  externalSystem: null,
  externalKey: null,
  externalUrl: null,
  externalSyncedAt: null,
  data: {},
  createdAt: "2026-10-30 10:00:00",
  updatedAt: "2026-10-31 10:00:00",
  revision: 1,
  links: [],
  caseIds: [],
  ...over,
});

const cases = [{ id: "c1", key: "ATS_001", title: "Pago" }];

beforeEach(async () => {
  await i18n.changeLanguage("es");
  try {
    localStorage.removeItem("pharos.defects.view");
  } catch {
    // jsdom always has it
  }
  list.mockResolvedValue([
    defect("def-001", { title: "Doble cargo al reintentar", severity: "critical", status: "open", caseIds: ["c1"] }),
    defect("def-002", { title: "Texto cortado en el recibo", severity: "minor", status: "retest" }),
    defect("def-003", { title: "Logo pixelado", severity: "trivial", status: "closed", resolution: "fixed" }),
    defect("def-004", { title: "Exportar a PDF", status: "deferred" }),
  ]);
  for (const f of [create, update, transition, link]) f.mockReset();
  transition.mockImplementation(async (id: string, _u: string, status: string) => defect(id, { status: status as Defect["status"] }));
  results.mockResolvedValue([
    {
      resultId: "r1",
      runId: "run1",
      runKey: "RUN-004",
      runTitle: "Smoke",
      testCaseId: "c1",
      caseKey: "ATS_001",
      testKey: "manual:c1/-/-",
      attempt: 2,
      status: "failed",
      createdAt: "2026-10-31 09:00:00",
    },
  ]);
});

describe("Defectos (DEF-01)", () => {
  it("lists the open defects by default, with severity and status in words", async () => {
    setViewportWidth(1440);
    renderWithProviders(<DefectsPage projectId="p1" userId="u1" cases={cases} />);
    const table = await screen.findByRole("table", { name: "Defectos" });
    const rows = within(table).getAllByRole("row").slice(1);
    // Open = not closed nor rejected: deferred counts.
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("DEF-001");
    expect(rows[0]).toHaveTextContent("Crítica");
    expect(rows[0]).toHaveTextContent("Abierto");
    expect(rows[0]).toHaveTextContent("ATS_001");
    expect(screen.getByRole("button", { name: "Abiertos 3" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerrados 1" }));
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Todos 4" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar defectos" }), "recibo");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    await expectNoAxeViolations();
  }, 20_000);

  it("shows a board by status where a drop follows the lifecycle", async () => {
    setViewportWidth(1440);
    renderWithProviders(<DefectsPage projectId="p1" userId="u1" />);
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("radio", { name: "Tablero" }));
    const board = screen.getByRole("region", { name: "Tablero de defectos por estado" });
    expect(within(board).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Nuevo",
      "Abierto",
      "En curso",
      "Corregido",
      "En retest",
      "Cerrado",
      "Otros",
    ]);
    const other = within(board).getByRole("region", { name: "Otros" });
    expect(within(other).getByRole("article")).toHaveTextContent("Aplazado");
    await expectNoAxeViolations();
  }, 20_000);

  it("creates a defect from a failed result, prefilled", async () => {
    setViewportWidth(1440);
    draftFromResult.mockResolvedValue({
      projectId: "p1",
      userId: "u1",
      title: "ATS_001 · pagar",
      stepsToReproduce: "1. abrir\n2. pagar",
      actual: "Error 500",
      foundInBuild: "1.4.2",
      foundInRunId: "run1",
      data: {},
      fromResult: { resultId: "r1", stepId: "s2" },
    });
    create.mockResolvedValue(defect("def-005", {}));
    renderWithProviders(<DefectsPage projectId="p1" userId="u1" cases={cases} />);
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "Desde un resultado" }));
    const dialog = screen.getByRole("dialog", { name: "Resultados que no pasaron" });
    await userEvent.click(await within(dialog).findByRole("button", { name: /Elegir: RUN-004 ATS_001/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Prerrellenado desde RUN-004 · ATS_001");
    expect(screen.getByLabelText("Título")).toHaveValue("ATS_001 · pagar");
    expect(screen.getByLabelText("Resultado obtenido")).toHaveValue("Error 500");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({
      title: "ATS_001 · pagar",
      foundInBuild: "1.4.2",
      foundInRunId: "run1",
      fromResult: { resultId: "r1", stepId: "s2" },
    });
  }, 20_000);
});

describe("DefectEditor", () => {
  it("offers only the next statuses and asks for the resolution to close", async () => {
    setViewportWidth(1440);
    update.mockResolvedValue(null);
    const onClose = vi.fn();
    renderWithProviders(
      <DefectEditor
        projectId="p1"
        userId="u1"
        defect={defect("def-002", { title: "Recibo", status: "retest" })}
        cases={cases}
        onClose={onClose}
      />,
    );
    const status = screen.getByLabelText("Estado");
    expect(within(status).getAllByRole("option").map((o) => o.textContent)).toEqual(["En retest", "Cerrado", "Abierto"]);
    await userEvent.selectOptions(status, "closed");
    expect(screen.getByLabelText("Resolución")).toHaveValue("fixed");
    await userEvent.click(screen.getByLabelText(/ATS_001/));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(update.mock.calls[0][1]).toMatchObject({ status: "closed", resolution: "fixed" });
    expect(link).toHaveBeenCalledWith("def-002", "u1", { targetKind: "test_case", targetId: "c1" }, true);
    await expectNoAxeViolations();
  }, 20_000);

  it("needs a title", async () => {
    renderWithProviders(<DefectEditor projectId="p1" userId="u1" defect={null} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText("El título es obligatorio.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});
