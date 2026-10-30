import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { resizeViewport, setViewportWidth } from "@test/viewport";
import { testPlanApi } from "../api/testPlanApi";
import type { TestPlan } from "../model/types";
import { WithHeader } from "./wizard/testHarness";
import { TestPlanWizard } from "./TestPlanWizard";

vi.mock("../api/testPlanApi", () => ({
  testPlanApi: {
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    revisions: vi.fn(async () => []),
    revisionDetail: vi.fn(),
  },
}));

const PLAN: TestPlan = {
  id: "plan1",
  workspaceId: "w",
  title: "Plan de pruebas · Portal",
  version: "1.3",
  planDate: "2026-10-29",
  author: "Laura Méndez",
  status: "reviewed",
  projectId: "p1",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  revision: 3,
  data: {
    summary: "Resumen",
    // Saved before the catalog had keys: labels, plus an own deliverable.
    deliverables: ["Documento de plan de pruebas", "Status reports", "Informe para auditoría"],
    tools: ["playwright", "jira", "Allure Report"],
  },
};

function renderWizard(planId: string | null = "plan1") {
  return renderWithProviders(
    <WithHeader>
      <TestPlanWizard planId={planId} projectId="p1" />
    </WithHeader>,
  );
}

/** Goes to step `n` (1-based) through the step navigation. */
async function goToStep(n: number) {
  const nav = screen.getByRole("navigation", { name: "Pasos del plan" });
  await userEvent.click(within(nav).getAllByRole("button")[n - 1]);
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
  vi.mocked(testPlanApi.get).mockResolvedValue(structuredClone(PLAN));
  vi.mocked(testPlanApi.update).mockImplementation(async (_id, input) => ({
    ...PLAN,
    ...input,
    data: input.data,
    revision: PLAN.revision + 1,
    updatedAt: new Date().toISOString(),
  }));
  vi.mocked(testPlanApi.update).mockClear();
});

describe("plan wizard (SPEC §8 «Plan»)", () => {
  it("shows «Paso N de 19» and the save state above the step", async () => {
    setViewportWidth(1440);
    renderWizard();
    expect(await screen.findByText("Paso 1 de 19")).toBeInTheDocument();
    expect(screen.getByText(/^Guardado · hace 5 min/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: /Título/ }), " v2");
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
  });

  it("from 1360 px of container the steps are a vertical list; below, a strip", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 19");
    expect(document.querySelector(".tpw-rail")).toBeInTheDocument();
    expect(document.querySelector(".tpw-strip")).not.toBeInTheDocument();
    resizeViewport(1300);
    expect(document.querySelector(".tpw-rail")).not.toBeInTheDocument();
    const strip = screen.getByRole("navigation", { name: "Pasos del plan" });
    expect(within(strip).getByText("Paso 1 de 19 · 5 completados")).toBeInTheDocument();
    // The current step is a pill with its name; the others only a number.
    expect(within(strip).getByRole("button", { current: "step" })).toHaveTextContent("Título");
    resizeViewport(900);
    expect(document.querySelector(".tpw-strip")).toBeInTheDocument();
  });

  it("on mobile a compact bar opens the steps in a sheet", async () => {
    setViewportWidth(390);
    renderWizard();
    await userEvent.click(await screen.findByRole("button", { name: "Ver pasos" }));
    const sheet = screen.getByRole("dialog", { name: "Pasos del plan" });
    await userEvent.click(within(sheet).getByRole("button", { name: /Alcance/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Alcance" })).toBeInTheDocument();
  });

  it("the footer says which step is next, and «Finalizar plan» on the last one", async () => {
    setViewportWidth(1440);
    renderWizard();
    expect(await screen.findByRole("button", { name: "Siguiente: Versión, fecha y autor" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anterior" })).not.toBeInTheDocument();
    await goToStep(19);
    expect(screen.getByRole("button", { name: "Finalizar plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeInTheDocument();
  });

  it("step 8: ISO 29119-3 deliverables by group, old labels as keys, and own ones", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 19");
    await goToStep(8);
    expect(screen.getByRole("group", { name: "Gestión de pruebas" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Documento de plan de pruebas" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Informes de estado" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Matriz de trazabilidad" })).not.toBeChecked();
    const acceptance = screen.getByRole("group", { name: "Aceptación y otros" });
    expect(within(acceptance).getByText("Informe para auditoría")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Otro entregable" }), "Acta de cierre{Enter}");
    expect(within(acceptance).getByText("Acta de cierre")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Quitar Informe para auditoría" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(testPlanApi.update).toHaveBeenCalledWith(
      "plan1",
      expect.objectContaining({
        data: expect.objectContaining({
          deliverables: ["testPlan", "statusReports", "Acta de cierre"],
        }),
      }),
    );
    // Saving keeps the step and the new revision.
    expect(await screen.findByText("Paso 8 de 19")).toBeInTheDocument();
  });

  it("step 10: ten tools, «Más herramientas (65)» with search, and a free field", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 19");
    await goToStep(10);
    const top = screen.getByRole("group", { name: "Más usadas en QA" });
    expect(within(top).getAllByRole("button")).toHaveLength(11); // 10 + «Allure Report»
    expect(within(top).getByRole("button", { name: "Allure Report Propia" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("3 seleccionadas")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Más herramientas (65)" }));
    await userEvent.type(screen.getByRole("searchbox"), "gatl");
    await userEvent.click(screen.getByRole("button", { name: "Gatling" }));
    expect(screen.getByText("4 seleccionadas")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "¿No está en la lista?" }), "k6{Enter}");
    expect(within(top).getByRole("button", { name: "k6" })).toHaveAttribute("aria-pressed", "true");
  });

  it("step 14: generating sprints from a range is shown disabled, «Próximamente»", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 19");
    await goToStep(14);
    const soon = screen.getByRole("region", { name: "Generar sprints a partir de un rango" });
    expect(within(soon).getByText("Próximamente")).toBeInTheDocument();
    expect(within(soon).getByRole("button", { name: "Generar sprints" })).toBeDisabled();
  });

  it("step 19 lists the missing steps and links to them", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 19");
    await goToStep(19);
    const missing = screen.getByRole("list", { name: "Pasos sin completar" });
    await userEvent.click(within(missing).getByRole("button", { name: "4. Alcance" }));
    expect(screen.getByRole("heading", { level: 2, name: "Alcance" })).toBeInTheDocument();
  });

  it("puts Revisiones, Importar / Exportar and Guardar in the header, and the status panel beside the form", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 19");
    const header = screen.getByTestId("header-actions");
    expect(within(header).getByRole("button", { name: "Revisiones" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Importar / Exportar" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    const panel = screen.getByRole("complementary", { name: "Estado del plan" });
    expect(within(panel).getByText("Revisado")).toBeInTheDocument();
    expect(within(panel).getByText("v1.3")).toBeInTheDocument();
  });
});

describe("plan wizard · a new plan (review of V2)", () => {
  it("after the first save a language change keeps the form, and the next save updates", async () => {
    setViewportWidth(1440);
    const created = { ...structuredClone(PLAN), id: "new-plan", title: "Mi plan nuevo" };
    vi.mocked(testPlanApi.create).mockImplementation(async (input) => ({
      ...created,
      ...input,
      data: input.data,
    }));
    vi.mocked(testPlanApi.create).mockClear();
    renderWizard(null);
    const title = await screen.findByRole("textbox", { name: /Título/ });
    await userEvent.clear(title);
    await userEvent.type(title, "Mi plan nuevo");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(testPlanApi.create).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/^Guardado/)).toBeInTheDocument();

    await act(() => i18n.changeLanguage("en"));
    expect(screen.getByRole("textbox", { name: /Title/ })).toHaveValue("Mi plan nuevo");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(testPlanApi.create).toHaveBeenCalledTimes(1);
    expect(testPlanApi.update).toHaveBeenCalledWith(
      "new-plan",
      expect.objectContaining({ title: "Mi plan nuevo" }),
    );
  });
});

describe("plan wizard · status panel (SPEC §8)", () => {
  it.each([900, 390])("shows «Estado del plan» and the revisions at %i px too (below the form when it does not fit)", async (width) => {
    setViewportWidth(width);
    renderWizard();
    const panel = await screen.findByRole("complementary", { name: "Estado del plan" });
    expect(within(panel).getByText("v1.3")).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Revisiones" })).toBeInTheDocument();
  });
});
