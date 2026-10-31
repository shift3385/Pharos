// The «Campos personalizados» card of the project settings and the section of
// the case editor (FLD-01): create with a proposed key, type-checked values,
// required named in the error summary, archive and reorder, values the
// editor does not know kept, and axe on each (UX-05, ADR-0027).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { customFieldApi } from "../api/customFieldApi";
import type { CustomField, CustomValues } from "../model/types";
import { CustomFieldsCard } from "./CustomFieldsCard";
import { CustomFieldsSection } from "./CustomFieldsSection";

vi.mock("../api/customFieldApi", () => ({
  customFieldApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    reorder: vi.fn(async () => undefined),
    copy: vi.fn(),
  },
}));

const field = (over: Partial<CustomField>): CustomField => ({
  id: over.fieldKey ?? "f",
  projectId: "p1",
  entity: "test_case",
  fieldKey: "f",
  label: "F",
  description: "",
  fieldType: "text",
  options: [],
  required: false,
  defaultValue: null,
  appliesToCaseTypes: null,
  position: 0,
  archivedAt: null,
  createdAt: "2026-10-31 10:00:00",
  updatedAt: "2026-10-31 10:00:00",
  revision: 1,
  ...over,
});

const BROWSER = field({
  fieldKey: "browser",
  label: "Navegador",
  fieldType: "select",
  required: true,
  position: 0,
  options: [
    { id: "OPT00001", label: "Chrome", archived: false },
    { id: "OPT00002", label: "IE 11", archived: true },
  ],
});
const POINTS = field({
  fieldKey: "points",
  label: "Puntos",
  fieldType: "integer",
  position: 1,
});
const OLD = field({
  fieldKey: "old",
  label: "Antiguo",
  position: 2,
  archivedAt: "2026-10-01 00:00:00",
});

beforeEach(async () => {
  await i18n.changeLanguage("es");
  vi.mocked(customFieldApi.list)
    .mockReset()
    .mockResolvedValue([BROWSER, POINTS, OLD]);
  vi.mocked(customFieldApi.create).mockReset();
  vi.mocked(customFieldApi.archive).mockReset();
  vi.mocked(customFieldApi.reorder).mockClear();
});

const card = () =>
  renderWithProviders(
    <CustomFieldsCard
      projectId="p1"
      userId="u1"
      loadProjects={async () => [{ id: "p2", name: "Otro" }]}
    />,
  );

describe("Ajustes · Campos personalizados", () => {
  it("lists live fields in order, hides archived ones until asked", async () => {
    card();
    const list = await screen.findByRole("list", {
      name: "Campos personalizados del proyecto",
    });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Navegador"),
      expect.stringContaining("Puntos"),
    ]);
    expect(rows[0]).toHaveTextContent("Obligatorio");
    await userEvent.click(
      screen.getByRole("switch", { name: /Mostrar archivados/ }),
    );
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    await expectNoAxeViolations();
  }, 15_000);

  it("proposes the key from the name, checks it, and creates the field", async () => {
    vi.mocked(customFieldApi.create).mockImplementation(async (input) =>
      field({
        ...input,
        fieldType: input.fieldType,
        options: input.options ?? [],
      }),
    );
    card();
    await userEvent.click(
      await screen.findByRole("button", { name: "Nuevo campo" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Nuevo campo personalizado",
    });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /Nombre/ }),
      "Versión del navegador",
    );
    expect(within(dialog).getByRole("textbox", { name: /Clave/ })).toHaveValue(
      "version_del_navegador",
    );
    await expectNoAxeViolations();

    // A key the project already has blocks the save, named in the summary.
    const key = within(dialog).getByRole("textbox", { name: /Clave/ });
    await userEvent.clear(key);
    await userEvent.type(key, "browser");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Crear campo" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ya hay un campo con esta clave",
    );
    expect(customFieldApi.create).not.toHaveBeenCalled();

    await userEvent.clear(key);
    await userEvent.type(key, "browser_version");
    await userEvent.selectOptions(
      within(dialog).getByRole("combobox", { name: "Tipo" }),
      "select",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /Añadir opción/ }),
    );
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "Opción 1" }),
      "120",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Crear campo" }),
    );
    expect(customFieldApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldKey: "browser_version",
        fieldType: "select",
        options: [{ id: "", label: "120", archived: false }],
        appliesToCaseTypes: null,
        required: false,
      }),
    );
  }, 15_000);

  it("an edited field keeps its key and type read-only", async () => {
    card();
    await userEvent.click(
      await screen.findByRole("button", { name: "Acciones de «Navegador»" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Editar" }));
    const dialog = screen.getByRole("dialog", { name: "Editar campo" });
    expect(
      within(dialog).getByRole("textbox", { name: /Clave/ }),
    ).toHaveAttribute("readonly");
    expect(
      within(dialog).getByRole("combobox", { name: "Tipo" }),
    ).toBeDisabled();
    // A saved option is archived, not removed.
    expect(
      within(dialog).getByRole("button", { name: "Recuperar la opción 2" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expectNoAxeViolations();
  }, 15_000);

  it("archives from the row menu and moves a field down", async () => {
    vi.mocked(customFieldApi.archive).mockResolvedValue({
      ...POINTS,
      archivedAt: "now",
    });
    card();
    await userEvent.click(
      await screen.findByRole("button", { name: "Acciones de «Navegador»" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Bajar" }));
    expect(customFieldApi.reorder).toHaveBeenCalledWith(
      "p1",
      ["points", "browser"],
      "u1",
    );
    expect(
      screen.getByText("«Navegador» movido a la posición 2"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Acciones de «Puntos»" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Archivar" }));
    expect(customFieldApi.archive).toHaveBeenCalledWith("points", true, "u1");
  }, 15_000);
});

function Section({
  start,
  caseType = "standard" as const,
  attempted = false,
}: {
  start: CustomValues;
  caseType?: "standard" | "checklist";
  attempted?: boolean;
}) {
  const [values, setValues] = useState<CustomValues>(start);
  return (
    <>
      <CustomFieldsSection
        fields={[BROWSER, POINTS, OLD]}
        caseType={caseType}
        values={values}
        previous={start}
        attempted={attempted}
        onChange={setValues}
      />
      <output data-testid="values">{JSON.stringify(values)}</output>
    </>
  );
}

describe("Editor · Campos personalizados", () => {
  it("edits values by type and keeps the ones it cannot show", async () => {
    renderWithProviders(<Section start={{ old: "kept", from_elsewhere: 7 }} />);
    const browser = screen.getByRole("combobox", { name: /Navegador/ });
    // The archived option is not offered for a new value.
    expect(within(browser).queryByRole("option", { name: "IE 11" })).toBeNull();
    await userEvent.selectOptions(browser, "OPT00001");
    await userEvent.type(
      screen.getByRole("spinbutton", { name: "Puntos" }),
      "5",
    );
    expect(JSON.parse(screen.getByTestId("values").textContent!)).toEqual({
      old: "kept",
      from_elsewhere: 7,
      browser: "OPT00001",
      points: 5,
    });
    // Archived and unknown keys show read-only, never dropped.
    await userEvent.click(screen.getByText(/Otros valores/));
    expect(screen.getByText("Antiguo")).toBeInTheDocument();
    expect(
      screen.getByText(/from_elsewhere · campo desconocido/),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
  }, 15_000);

  it("an archived option the case already has stays selectable", () => {
    renderWithProviders(<Section start={{ browser: "OPT00002" }} />);
    const browser = screen.getByRole("combobox", { name: /Navegador/ });
    expect(browser).toHaveValue("OPT00002");
    expect(screen.queryByRole("alert")).toBeNull();
  }, 15_000);

  it("a missing required value shows after a save attempt", async () => {
    renderWithProviders(<Section start={{}} attempted />);
    const browser = screen.getByRole("combobox", { name: /Navegador/ });
    expect(browser).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Este campo es obligatorio.")).toBeInTheDocument();
    await expectNoAxeViolations();
  }, 15_000);
});
