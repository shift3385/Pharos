import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { testPlanApi } from "../../api/testPlanApi";
import legacy from "../../model/__fixtures__/legacy-schedule.json";
import type { TestPlan, TestPlanInput } from "../../model/types";
import { WithHeader } from "./testHarness";
import { TestPlanWizard } from "../TestPlanWizard";

vi.mock("../../api/testPlanApi", () => ({
  testPlanApi: {
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    revisions: vi.fn(async () => []),
    revisionDetail: vi.fn(),
  },
}));

// A plan saved by 0.2.0-alpha.1: sprints and milestones without ids.
const PLAN: TestPlan = {
  id: "plan1",
  workspaceId: "w",
  title: "Plan · Portal",
  version: "1.0",
  planDate: "2026-10-29",
  author: "Laura Méndez",
  status: "draft",
  projectId: "p1",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-30T00:00:00.000Z",
  revision: 1,
  data: { methodologyType: "agile", sprintWeeks: 2, ...structuredClone(legacy.wizard020) },
};

function renderStep(plan: TestPlan = PLAN) {
  vi.mocked(testPlanApi.get).mockResolvedValue(structuredClone(plan));
  const view = renderWithProviders(
    <WithHeader>
      <TestPlanWizard planId={plan.id} projectId="p1" />
    </WithHeader>,
  );
  return view;
}

async function openStep14() {
  await screen.findByText("Paso 1 de 19");
  const nav = screen.getByRole("navigation", { name: "Pasos del plan" });
  await userEvent.click(within(nav).getAllByRole("button")[13]);
  return screen.getAllByRole("grid");
}

const day = (iso: string) => document.querySelector<HTMLElement>(`[data-day="${iso}"]`)!;
const sprintRows = () => within(screen.getByRole("region", { name: "Sprints" })).queryAllByRole("group");
const milestoneRows = () => within(screen.getByRole("region", { name: "Hitos" })).queryAllByRole("group");

async function save(): Promise<TestPlanInput> {
  await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
  const calls = vi.mocked(testPlanApi.update).mock.calls;
  return calls[calls.length - 1][1];
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 31, 10));
  await i18n.changeLanguage("es");
  setViewportWidth(1440);
  vi.mocked(testPlanApi.update).mockReset();
  vi.mocked(testPlanApi.update).mockImplementation(async (_id, input) => ({
    ...PLAN,
    ...input,
    data: input.data,
    revision: PLAN.revision + 1,
    updatedAt: new Date().toISOString(),
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("step 14 · Cronograma (RED-W5)", () => {
  it("replaces the old step: no «Próximamente», no «Añadir fila», no native date inputs", async () => {
    renderStep();
    const grids = await openStep14();
    expect(grids).toHaveLength(2);
    expect(screen.queryByText("Próximamente")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Añadir fila" })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(screen.getByRole("radio", { name: "Sprint" })).toHaveAttribute("aria-checked", "true");
  });

  it("a legacy plan shows its rows in dd/mm/aaaa and its bands and diamonds in the day labels", async () => {
    renderStep();
    await openStep14();
    expect(screen.getByRole("grid", { name: "Calendario del cronograma · noviembre de 2026" })).toBeInTheDocument();
    const [first] = sprintRows();
    expect(within(first).getByRole("textbox", { name: "Nombre del sprint" })).toHaveValue("Sprint 1 · Login");
    expect(within(first).getByRole("textbox", { name: /^Inicio/ })).toHaveValue("02/11/2026");
    expect(within(first).getByRole("textbox", { name: /^Fin/ })).toHaveValue("15/11/2026");
    expect(day("2026-11-02")).toHaveAccessibleName(/Sprint 1 · Login, del 02\/11\/2026 al 15\/11\/2026, inicio/);
    expect(day("2026-11-12")).toHaveAccessibleName(/Hito: Congelación de código/);
    // The row with no dates is kept and says what is missing.
    expect(within(sprintRows()[2]).getByText("Falta la fecha. Escríbela como dd/mm/aaaa.")).toBeInTheDocument();
  });

  it("saving a legacy plan persists the ids derived on read", async () => {
    renderStep();
    await openStep14();
    const input = await save();
    expect(input.data.sprints?.map((s) => s.id)).toEqual(legacy.wizard020Ids.sprints);
    expect(input.data.milestones?.map((m) => m.id)).toEqual(legacy.wizard020Ids.milestones);
    expect(input.data.sprints?.map((s) => s.name)).toEqual(legacy.wizard020.sprints.map((s) => s.name));
  });

  it("clicking a start and an end day creates the next sprint; Esc cancels a range", async () => {
    renderStep();
    await openStep14();
    await userEvent.click(day("2026-12-07"));
    expect(screen.getByText(/Inicio: 07\/12\/2026\. Haz clic en el día de fin/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText(/Inicio: 07\/12\/2026/)).not.toBeInTheDocument();

    await userEvent.click(day("2026-12-07"));
    await userEvent.click(day("2026-12-20"));
    expect(sprintRows()).toHaveLength(4);
    const created = sprintRows()[2];
    expect(within(created).getByRole("textbox", { name: "Nombre del sprint" })).toHaveValue("Sprint 3");
    expect(within(created).getByRole("textbox", { name: /^Inicio/ })).toHaveValue("07/12/2026");
    expect(within(created).getByRole("textbox", { name: /^Fin/ })).toHaveValue("20/12/2026");
  });

  it("«Siguiente sprint» adds the step 6 length after the latest sprint", async () => {
    renderStep({ ...PLAN, data: { ...PLAN.data, sprintWeeks: 3 } });
    await openStep14();
    const next = screen.getByRole("button", { name: "Siguiente sprint" });
    expect(next).toHaveAccessibleDescription("Añade Sprint 3: 30/11/2026 – 20/12/2026 (21 días, paso 6)");
    await userEvent.click(next);
    const added = sprintRows()[2];
    expect(within(added).getByRole("textbox", { name: /^Inicio/ })).toHaveValue("30/11/2026");
    expect(within(added).getByRole("textbox", { name: /^Fin/ })).toHaveValue("20/12/2026");
    // The two older sprints last 14 days, not 21: a warning each (agile plan).
    expect(screen.getAllByText("Dura 14 días; la Metodología (paso 6) indica 21 días.")).toHaveLength(2);
  });

  it("the duration warning is only for agile plans", async () => {
    renderStep({ ...PLAN, data: { ...PLAN.data, methodologyType: "traditional", sprintWeeks: 3 } });
    await openStep14();
    expect(screen.queryByText(/Dura \d+ días/)).not.toBeInTheDocument();
  });

  it("in «Hito» mode a click on a free day adds a milestone", async () => {
    renderStep();
    await openStep14();
    await userEvent.click(screen.getByRole("radio", { name: "Hito" }));
    expect(screen.getByText(/Haz clic en un día para añadir un hito/)).toBeInTheDocument();
    await userEvent.click(day("2026-11-25"));
    expect(milestoneRows()).toHaveLength(3);
    expect(within(milestoneRows()[1]).getByRole("textbox", { name: "Hito" })).toHaveValue("Hito 3");
    expect(day("2026-11-25")).toHaveAccessibleName(/Hito: Hito 3/);
  });

  it("the calendar works from the keyboard: arrows, PageDown, Enter twice", async () => {
    renderStep();
    await openStep14();
    const start = day("2026-11-01");
    expect(start).toHaveAttribute("tabindex", "0");
    start.focus();
    await userEvent.keyboard("{PageDown}");
    expect(day("2026-12-01")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowDown}");
    expect(day("2026-12-10")).toHaveFocus();
    await userEvent.keyboard("{Enter}{ArrowRight}{ArrowRight}{ArrowRight}{Enter}");
    const created = sprintRows()[2];
    expect(within(created).getByRole("textbox", { name: /^Inicio/ })).toHaveValue("10/12/2026");
    expect(within(created).getByRole("textbox", { name: /^Fin/ })).toHaveValue("13/12/2026");
    // Moving past the visible months shows the next ones.
    day("2026-12-13").focus();
    await userEvent.keyboard("{PageDown}");
    expect(day("2027-01-13")).toHaveFocus();
  });

  it("row dates and the calendar edit the same sprint; what is typed is applied, with its warning", async () => {
    renderStep();
    await openStep14();
    const end = () => within(sprintRows()[0]).getByRole("textbox", { name: /^Fin/ });

    // Not a real day: kept as typed, warned, not drawn, and saved as typed
    // (nothing is held back unsaved, S3).
    await userEvent.clear(end());
    await userEvent.type(end(), "31/02/2026{Enter}");
    expect(within(sprintRows()[0]).getByText("Fecha no válida. Usa dd/mm/aaaa.")).toBeInTheDocument();
    expect(end()).toHaveValue("31/02/2026");
    expect(day("2026-11-05")).not.toHaveAccessibleName(/Sprint 1/);
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    expect((await save()).data.sprints?.[0].end).toBe("31/02/2026");

    // End before start: applied, and the row says so.
    await userEvent.clear(end());
    await userEvent.type(end(), "01/11/2026{Enter}");
    expect(within(sprintRows()[0]).getByText("La fecha de fin es anterior a la de inicio.")).toBeInTheDocument();

    // A typed ISO day works too; the band follows.
    await userEvent.clear(end());
    await userEvent.type(end(), "2026-11-13{Enter}");
    expect(end()).toHaveValue("13/11/2026");
    expect(within(sprintRows()[0]).queryByText(/Fecha no válida|anterior/)).not.toBeInTheDocument();
    expect(day("2026-11-13")).toHaveAccessibleName(/Sprint 1 · Login.*fin/);
    expect(day("2026-11-14")).not.toHaveAccessibleName(/Sprint 1/);

    // An empty field clears the date.
    await userEvent.clear(end());
    await userEvent.keyboard("{Enter}");
    expect(within(sprintRows()[0]).getByText("Falta la fecha. Escríbela como dd/mm/aaaa.")).toBeInTheDocument();
    expect((await save()).data.sprints?.[0].end).toBe("");
  });

  it("a row that moves when its date is re-sorted keeps the focus", async () => {
    renderStep();
    await openStep14();
    const start = within(sprintRows()[0]).getByRole("textbox", { name: /^Inicio/ });
    await userEvent.clear(start);
    await userEvent.type(start, "20/11/2026{Enter}");
    // Sprint 1 now starts after Sprint 2: second row, same field, still focused.
    const moved = within(sprintRows()[1]).getByRole("textbox", { name: /^Inicio/ });
    expect(moved).toHaveValue("20/11/2026");
    expect(moved).toHaveFocus();
  });

  it("a legacy dd/mm/aaaa date (old import) reads as a real date and the plan stays unchanged", async () => {
    renderStep({
      ...PLAN,
      data: {
        ...PLAN.data,
        sprints: [{ name: "Importado", start: "02/11/2026", end: "15/11/2026" }],
        milestones: [{ name: "Go-live", date: "1/12/2026" }],
      },
    });
    await openStep14();
    expect(day("2026-11-02")).toHaveAccessibleName(/Importado, del 02\/11\/2026 al 15\/11\/2026, inicio/);
    expect(day("2026-12-01")).toHaveAccessibleName(/Hito: Go-live/);
    expect(screen.queryByText(/Fecha no válida/)).not.toBeInTheDocument();
    expect(screen.queryByText("Cambios sin guardar")).not.toBeInTheDocument();
  });

  it("Esc cancels a range only while the focus is in the step", async () => {
    renderStep();
    await openStep14();
    await userEvent.click(day("2026-12-07"));
    screen.getByRole("button", { name: "Guardar" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByText(/Inicio: 07\/12\/2026/)).toBeInTheDocument();
    day("2026-12-07").focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText(/Inicio: 07\/12\/2026/)).not.toBeInTheDocument();
  });

  it("an overlap is a warning in words, with an icon, and the plan still saves", async () => {
    renderStep();
    await openStep14();
    const second = sprintRows()[1];
    const start = within(second).getByRole("textbox", { name: /^Inicio/ });
    await userEvent.clear(start);
    await userEvent.type(start, "10/11/2026{Enter}");
    const msg = within(sprintRows()[1]).getByText(/Se solapa con «Sprint 1 · Login»/);
    expect(msg).toHaveTextContent("es un aviso: el plan se guarda igualmente");
    expect(msg.parentElement).toHaveTextContent(/^Aviso:/);
    expect(day("2026-11-12")).toHaveAccessibleName(/se solapa con otro sprint/);
    const input = await save();
    expect(input.data.sprints?.[1].start).toBe("2026-11-10");
  });

  it("a band's end can be dragged on desktop once the sprint is selected", async () => {
    renderStep();
    await openStep14();
    await userEvent.click(day("2026-11-05"));
    expect(day("2026-11-15")).toHaveAttribute("data-drag");
    fireEvent.pointerDown(day("2026-11-15"), { button: 0 });
    fireEvent.pointerOver(day("2026-11-18"));
    fireEvent.pointerUp(document);
    expect(within(sprintRows()[0]).getByRole("textbox", { name: /^Fin/ })).toHaveValue("18/11/2026");
    // Released outside a day: no click follows, so the next click counts.
    await userEvent.click(day("2026-12-07"));
    expect(screen.getByText(/Inicio: 07\/12\/2026/)).toBeInTheDocument();
  });

  it("a release on a day ends the drag without counting as a click there", async () => {
    renderStep();
    await openStep14();
    await userEvent.click(day("2026-11-05"));
    fireEvent.pointerDown(day("2026-11-15"), { button: 0 });
    fireEvent.pointerOver(day("2026-12-03"));
    fireEvent.pointerUp(day("2026-12-03"));
    fireEvent.click(day("2026-12-03"));
    expect(within(sprintRows()[0]).getByRole("textbox", { name: /^Fin/ })).toHaveValue("03/12/2026");
    expect(screen.queryByText(/Inicio: 03\/12\/2026/)).not.toBeInTheDocument();
  });

  it("touch never drags: a coarse pointer gets no drag handles, and a finger on a handle does nothing", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q !== "(pointer: fine)", media: q, addEventListener() {}, removeEventListener() {} }));
    renderStep();
    await openStep14();
    expect(screen.getByText("Haz clic en el día de inicio y después en el de fin para crear un sprint.")).toBeInTheDocument();
    await userEvent.click(day("2026-11-05"));
    expect(day("2026-11-15")).not.toHaveAttribute("data-drag");
  });

  it("a finger on a drag handle of a hybrid screen does nothing", async () => {
    renderStep();
    await openStep14();
    await userEvent.click(day("2026-11-05"));
    // jsdom has no PointerEvent: a mouse event that says it is a finger.
    const touch = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(touch, "pointerType", { value: "touch" });
    fireEvent(day("2026-11-15"), touch);
    fireEvent.pointerOver(day("2026-11-18"));
    fireEvent.pointerUp(document);
    expect(within(sprintRows()[0]).getByRole("textbox", { name: /^Fin/ })).toHaveValue("15/11/2026");
  });

  it("a removed row disappears from the calendar", async () => {
    renderStep();
    await openStep14();
    await userEvent.click(within(milestoneRows()[0]).getByRole("button", { name: /^Quitar hito/ }));
    expect(milestoneRows()).toHaveLength(1);
    expect(day("2026-11-12")).not.toHaveAccessibleName(/Hito:/);
  });

  it("on a phone: one month, no dragging", async () => {
    setViewportWidth(390);
    renderStep();
    await screen.findByText("Paso 1 de 19");
    await userEvent.click(screen.getByRole("button", { name: "Ver pasos" }));
    const sheet = screen.getByRole("dialog", { name: "Pasos del plan" });
    await userEvent.click(within(sheet).getByRole("button", { name: /Cronograma/ }));
    expect(screen.getAllByRole("grid")).toHaveLength(1);
    await userEvent.click(day("2026-11-05"));
    expect(day("2026-11-15")).not.toHaveAttribute("data-drag");
  });

  it("has no axe violations (sprints, an overlap and milestones)", async () => {
    vi.useRealTimers();
    const { container } = renderStep({
      ...PLAN,
      data: {
        ...PLAN.data,
        sprints: [...legacy.wizard020.sprints, { name: "Solapado", start: "2026-11-10", end: "2026-11-20" }],
      },
    });
    await openStep14();
    await expectNoAxeViolations(container);
  });
});
