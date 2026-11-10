import { beforeEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import { act, screen, within } from "@testing-library/react";
import { Link, useLocation } from "react-router";
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
    history: vi.fn(async () => ({
      createdAt: "2026-10-01T00:00:00.000Z",
      createdBy: "test-user",
      events: [],
      revisions: [],
    })),
  },
}));
// PLN-02: what the PDF export receives; the cycles are left out here.
const exportPlanPdf = vi.hoisted(() => vi.fn(async (_p: unknown, _t: unknown) => "plan.pdf"));
vi.mock("../export/planPdf", () => ({ exportPlanPdf }));
vi.mock("../export/planExtras", () => ({ planExtraTables: async () => [] }));

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

function renderWizard(planId: string | null = "plan1", exportHistory?: "current" | "revisions") {
  return renderWithProviders(
    <WithHeader>
      <TestPlanWizard planId={planId} projectId="p1" exportHistory={exportHistory} />
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
  it("shows «Paso N de 17» and the save state above the step", async () => {
    setViewportWidth(1440);
    renderWizard();
    expect(await screen.findByText("Paso 1 de 17")).toBeInTheDocument();
    expect(screen.getByText(/^Guardado · hace 5 min/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: /Título/ }), " v2");
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
  });

  it("from 1360 px of container the steps are a vertical list; below, a strip", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 17");
    expect(document.querySelector(".tpw-rail")).toBeInTheDocument();
    expect(document.querySelector(".tpw-strip")).not.toBeInTheDocument();
    resizeViewport(1300);
    expect(document.querySelector(".tpw-rail")).not.toBeInTheDocument();
    const strip = screen.getByRole("navigation", { name: "Pasos del plan" });
    expect(within(strip).getByText("Paso 1 de 17 · 4 completados")).toBeInTheDocument();
    // The current step is a pill with its name; the others only a number.
    expect(within(strip).getByRole("button", { current: "step" })).toHaveTextContent("Identificación del plan");
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
    expect(await screen.findByRole("button", { name: "Siguiente: Resumen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anterior" })).not.toBeInTheDocument();
    await goToStep(17);
    expect(screen.getByRole("button", { name: "Finalizar plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeInTheDocument();
  });

  it("«Entregables»: ISO 29119-3 deliverables by group, old labels as keys, and own ones in «Propios» (UX-31)", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 17");
    await goToStep(6);
    expect(screen.getByRole("heading", { level: 2, name: "Entregables" })).toBeInTheDocument();
    // The explanation moved to the [?] of the title.
    expect(screen.getByText(/Marca lo que se entregará/).closest(".infotip__bubble")).not.toBeNull();
    expect(screen.getByRole("group", { name: "Gestión de pruebas" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Documento de plan de pruebas" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Informes de estado" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Matriz de trazabilidad" })).not.toBeChecked();
    // The sixth cell: the own deliverable, with its ✕ and no «Propio» tag.
    const own = screen.getByRole("group", { name: "Propios" });
    expect(within(own).getByText("Informe para auditoría")).toBeInTheDocument();
    expect(within(own).queryByText("Propio")).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Aceptación y otros" })).queryByText("Informe para auditoría")).not.toBeInTheDocument();
    const other = within(own).getByRole("textbox", { name: "Otro entregable" });
    await userEvent.type(other, "Acta de cierre{Enter}");
    expect(within(own).getByText("Acta de cierre")).toBeInTheDocument();
    // A catalog name ticks that entry instead of adding a copy.
    await userEvent.type(other, "matriz de trazabilidad");
    await userEvent.click(within(own).getByRole("button", { name: "Añadir" }));
    expect(screen.getByRole("checkbox", { name: "Matriz de trazabilidad" })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Matriz de trazabilidad" }));
    await userEvent.click(screen.getByRole("button", { name: "Quitar: Informe para auditoría" }));
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
    expect(await screen.findByText("Paso 6 de 17")).toBeInTheDocument();
  });

  it("«Metodología» says what it still needs, and the ✓ follows the same rule (FIX-14)", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 17");
    await goToStep(5);
    expect(screen.getByRole("heading", { level: 2, name: "Metodología" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Pasos del plan" });
    const step6 = () => within(nav).getAllByRole("button")[4];
    // The saved plan has no ceremonies: the step is incomplete and says why.
    expect(screen.getByTestId("methodology-gaps")).toHaveTextContent(
      "Elige al menos una reunión del equipo para completar este paso.",
    );
    const group = screen.getByRole("group", { name: "Reuniones del equipo" });
    expect(group).toHaveAccessibleDescription(/Elige al menos una reunión del equipo/);
    expect(step6()).not.toHaveTextContent("completado");
    await userEvent.click(within(group).getByRole("button", { name: "Diaria" }));
    expect(screen.getByTestId("methodology-gaps")).toHaveTextContent(/^$/);
    expect(step6()).toHaveTextContent("completado");
    // Traditional asks for a phase instead.
    await userEvent.click(screen.getByRole("combobox", { name: "Metodología" }));
    await userEvent.click(screen.getByRole("option", { name: "Tradicional / V-model" }));
    expect(screen.getByTestId("methodology-gaps")).toHaveTextContent("Añade al menos una fase para completar este paso.");
    expect(step6()).not.toHaveTextContent("completado");
  });

  it("«Herramientas»: ten tools, «Más herramientas (65)» with search, and a free field", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 17");
    await goToStep(8);
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

  it("the last step lists the missing steps and links to them", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 17");
    await goToStep(17);
    const missing = screen.getByRole("list", { name: "Pasos sin completar" });
    expect(within(missing).getByRole("button", { name: "4. Niveles y tipos de prueba" })).toBeInTheDocument();
    await userEvent.click(within(missing).getByRole("button", { name: "3. Alcance" }));
    expect(screen.getByRole("heading", { level: 2, name: "Alcance" })).toBeInTheDocument();
  });

  it("puts Importar / Exportar and Guardar in the header and the revisions in the status panel (UX-24)", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 17");
    const header = screen.getByTestId("header-actions");
    expect(within(header).queryByRole("button", { name: "Revisiones" })).not.toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Importar / Exportar" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    const panel = screen.getByRole("complementary", { name: "Estado del plan" });
    expect(within(panel).getByText("Revisado")).toBeInTheDocument();
    expect(within(panel).getByText("v1.3")).toBeInTheDocument();
  });
});

describe("plan wizard · revision history in the export (PLN-02)", () => {
  it("the PDF has no history by default, and the menu no longer names it (UX-24)", async () => {
    setViewportWidth(1440);
    exportPlanPdf.mockClear();
    vi.mocked(testPlanApi.history).mockClear();
    renderWizard();
    await screen.findByText("Paso 1 de 17");
    await userEvent.click(within(screen.getByTestId("header-actions")).getByRole("button", { name: "Importar / Exportar" }));
    await screen.findByRole("menuitem", { name: /Exportar .pdf/ });
    expect(screen.queryByText(/se cambia en Ajustes del proyecto/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: /Exportar .pdf/ }));
    await vi.waitFor(() => expect(exportPlanPdf).toHaveBeenCalled());
    expect(testPlanApi.history).not.toHaveBeenCalled();
    expect(exportPlanPdf.mock.calls[0][0]).toMatchObject({ history: undefined });
  });

  it("with the project set to it, the PDF carries the history", async () => {
    setViewportWidth(1440);
    exportPlanPdf.mockClear();
    renderWizard("plan1", "revisions");
    await screen.findByText("Paso 1 de 17");
    await userEvent.click(within(screen.getByTestId("header-actions")).getByRole("button", { name: "Importar / Exportar" }));
    await screen.findByRole("menuitem", { name: /Exportar .pdf/ });
    await userEvent.click(screen.getByRole("menuitem", { name: /Exportar .pdf/ }));
    await vi.waitFor(() => expect(exportPlanPdf).toHaveBeenCalled());
    expect(testPlanApi.history).toHaveBeenCalledWith("plan1", "test-user");
    const sent = exportPlanPdf.mock.calls[0][0] as { history?: { name: string; rows: string[][] } };
    expect(sent.history?.name).toBe("Historial de revisiones");
    // The creation, by the signed-in user's official name.
    expect(sent.history?.rows[0][4]).toBe("Creación del plan");
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

describe("plan wizard · leaving with unsaved changes (RED-V3k guard)", () => {
  function Where() {
    return <output data-testid="where">{useLocation().pathname}</output>;
  }

  it("asks before leaving, stays on «Seguir editando», and leaves freely once saved", async () => {
    setViewportWidth(1440);
    renderWithProviders(
      <>
        <WithHeader>
          <TestPlanWizard planId="plan1" projectId="p1" />
        </WithHeader>
        <Link to="/projects">salir</Link>
        <Where />
      </>,
      { route: "/projects/p1/plan" },
    );
    await userEvent.type(await screen.findByRole("textbox", { name: /Título/ }), " v2");

    await userEvent.click(screen.getByRole("link", { name: "salir" }));
    const dialog = await screen.findByRole("alertdialog", { name: "¿Descartar los cambios?" });
    expect(dialog).toHaveTextContent("El plan tiene cambios sin guardar");
    await userEvent.click(within(dialog).getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/projects/p1/plan");
    expect(screen.getByRole("textbox", { name: /Título/ })).toHaveValue(`${PLAN.title} v2`);

    await userEvent.click(within(screen.getByTestId("header-actions")).getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(/^Guardado/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "salir" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/projects$/);
  });
});

describe("plan wizard when the plan fails to load", () => {
  it("shows the error instead of «Cargando…», and «Reintentar» opens the plan", async () => {
    setViewportWidth(1440);
    vi.mocked(testPlanApi.get).mockRejectedValueOnce(new Error("down"));
    renderWizard();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el plan de pruebas.");
    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Paso 1 de 17")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a plan that no longer exists says so too", async () => {
    vi.mocked(testPlanApi.get).mockResolvedValueOnce(null);
    renderWizard();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el plan de pruebas.");
  });
});

describe("plan wizard · 17 steps (UX-31)", () => {
  function renderAt(route: string) {
    return renderWithProviders(
      <WithHeader>
        <TestPlanWizard planId="plan1" projectId="p1" />
      </WithHeader>,
      { route },
    );
  }
  const heading = () => screen.getByRole("heading", { level: 2 });

  it("«Identificación del plan» joins the title, status, version, date and author; Siguiente and Anterior move one step", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 17");
    expect(heading()).toHaveTextContent("Identificación del plan");
    expect(screen.getByRole("textbox", { name: /Título/ })).toHaveValue(PLAN.title);
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveTextContent("Revisado");
    expect(screen.getByRole("textbox", { name: "Versión" })).toHaveValue("1.3");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-10-29");
    expect(screen.getByRole("textbox", { name: "Elaborado por" })).toHaveValue("Laura Méndez");
    // 17 steps in the rail, 4 of them complete: 4 / 17 = 24 %.
    const nav = screen.getByRole("navigation", { name: "Pasos del plan" });
    expect(within(nav).getAllByRole("button")).toHaveLength(17);
    expect(within(nav).getByText("4 de 17 pasos")).toBeInTheDocument();
    expect(within(nav).getByText("24 %")).toBeInTheDocument();
    // The status is a Pharos select: choosing keeps the value in the form.
    await userEvent.click(screen.getByRole("combobox", { name: "Estado" }));
    await userEvent.click(screen.getByRole("option", { name: "Aprobado" }));
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveTextContent("Aprobado");

    await userEvent.click(screen.getByRole("button", { name: "Siguiente: Resumen" }));
    expect(screen.getByText("Paso 2 de 17")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Siguiente: Alcance" }));
    await userEvent.click(screen.getByRole("button", { name: "Siguiente: Niveles y tipos de prueba" }));
    expect(heading()).toHaveTextContent("Niveles y tipos de prueba");
    expect(screen.getByRole("button", { name: "Siguiente: Metodología" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(heading()).toHaveTextContent("Alcance");
  });

  it("«Niveles y tipos de prueba»: groups, the «Confirmación (re-test)» type with its tooltip, and own types in «Propios»", async () => {
    setViewportWidth(1440);
    renderWizard();
    await screen.findByText("Paso 1 de 17");
    await goToStep(4);
    expect(heading()).toHaveTextContent("Niveles y tipos de prueba");
    // No text under the title: the ISTQB explanation is behind the [?].
    expect(screen.getByText(/Qué se prueba, en qué nivel/).closest(".infotip__bubble")).not.toBeNull();
    expect(document.querySelector(".tpw__fields .tpw-hint")).toBeNull();
    for (const name of ["Niveles de prueba", "Funcionales", "No funcionales", "Confirmación y regresión", "Propios"])
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
    const levels = screen.getByRole("group", { name: "Niveles de prueba" });
    expect(within(levels).getByRole("checkbox", { name: "Unitarias , componente" })).not.toBeChecked();
    const change = screen.getByRole("group", { name: "Confirmación y regresión" });
    const retest = within(change).getByRole("checkbox", { name: "Confirmación (re-test)" });
    expect(retest).toHaveAccessibleDescription("Volver a probar lo que falló, una vez arreglado.");
    expect(retest.closest("label")).toHaveAttribute("title", "Volver a probar lo que falló, una vez arreglado.");
    expect(
      within(change)
        .getAllByRole("checkbox")
        .map((c) => [c.closest("label")?.textContent, c.closest("label")?.title]),
    ).toEqual([
      ["Confirmación (re-test)", "Volver a probar lo que falló, una vez arreglado."],
      ["Regresión", "Comprobar que lo que funcionaba sigue funcionando."],
      ["Humo", "Una pasada rápida por lo básico de una versión nueva."],
      ["Sanidad", "Una comprobación corta de lo que se acaba de cambiar."],
    ]);
    // Without own types the cell only shows the field.
    const own = screen.getByRole("group", { name: "Propios" });
    expect(within(own).queryByRole("list")).not.toBeInTheDocument();

    await userEvent.click(within(levels).getByRole("checkbox", { name: /Sistema/ }));
    await userEvent.click(retest);
    await userEvent.click(within(change).getByRole("checkbox", { name: "Regresión" }));
    await userEvent.type(within(own).getByRole("textbox", { name: "Otro tipo de prueba" }), "Pruebas de contrato{Enter}");
    await userEvent.type(within(own).getByRole("textbox", { name: "Otro tipo de prueba" }), "Caos");
    await userEvent.click(within(own).getByRole("button", { name: "Añadir" }));
    expect(within(own).getByRole("list", { name: "Propios" })).toHaveTextContent("Pruebas de contrato");
    await userEvent.click(within(own).getByRole("button", { name: "Quitar: Caos" }));
    expect(within(own).queryByText("Caos")).not.toBeInTheDocument();
    // A catalog name ticks that entry instead of adding a copy.
    await userEvent.type(within(own).getByRole("textbox", { name: "Otro tipo de prueba" }), "smoke{Enter}");
    expect(within(change).getByRole("checkbox", { name: "Humo" })).toBeChecked();

    const nav = screen.getByRole("navigation", { name: "Pasos del plan" });
    expect(within(nav).getAllByRole("button")[3]).toHaveTextContent("completado");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(testPlanApi.update).toHaveBeenCalledWith(
      "plan1",
      expect.objectContaining({
        data: expect.objectContaining({
          testLevels: ["system"],
          testTypes: ["retest", "regression", "Pruebas de contrato", "smoke"],
        }),
      }),
    );
  });

  it("a plan saved by the 19-step wizard opens with its data, and a link to an old step lands on the joined one", async () => {
    setViewportWidth(1440);
    vi.mocked(testPlanApi.get).mockResolvedValue({
      ...structuredClone(PLAN),
      data: { ...PLAN.data, testTypes: ["functional", "Pruebas A/B"], testLevels: ["unit", "acceptance"] },
    });
    renderAt("/?step=levels");
    await screen.findByText("Paso 4 de 17");
    expect(heading()).toHaveTextContent("Niveles y tipos de prueba");
    expect(screen.getByRole("checkbox", { name: "Funcionales" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Unitarias/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Aceptación/ })).toBeChecked();
    expect(within(screen.getByRole("group", { name: "Propios" })).getByText("Pruebas A/B")).toBeInTheDocument();
  });

  it.each([
    ["meta", "Identificación del plan"],
    ["title", "Identificación del plan"],
    ["types", "Niveles y tipos de prueba"],
    ["deliverables", "Entregables"],
    ["nope", "Identificación del plan"],
  ])("?step=%s opens «%s»", async (step, title) => {
    setViewportWidth(1440);
    renderAt(`/?step=${step}`);
    await screen.findByText(/^Paso \d+ de 17$/);
    expect(heading()).toHaveTextContent(title);
  });
});
