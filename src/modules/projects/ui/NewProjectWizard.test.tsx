import { beforeEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { selectValue } from "@test/select";
import { expectNoAxeViolations } from "@test/axe";
import { ToastProvider } from "@shared/ui/Toast";
import { customFieldApi } from "@modules/custom-fields";
import { projectApi } from "../api/projectApi";
import type { ProjectRow } from "../model/projectTable";
import { NewProjectWizard } from "./NewProjectWizard";

// The platform: the web unless a test says desktop.
const desktop = vi.hoisted(() => ({ on: false }));
vi.mock("@shared/platform", async (orig) => {
  const real = await orig<typeof import("@shared/platform")>();
  return { ...real, isTauri: () => desktop.on };
});
vi.mock("../api/projectApi", () => ({
  projectApi: {
    create: vi.fn(async () => ({ id: "new" })),
    retention: vi.fn(async () => ({
      projectId: "bm",
      kinds: [
        { kind: "trace", defaultDays: 30, days: 10, custom: true },
        { kind: "video", defaultDays: 30, days: null, custom: true },
        { kind: "log", defaultDays: 90, days: 90, custom: false },
      ],
    })),
    copyRetention: vi.fn(async () => 2),
  },
}));
vi.mock("@modules/custom-fields", async (orig) => {
  const real = await orig<typeof import("@modules/custom-fields")>();
  const field = { archivedAt: null };
  return {
    ...real,
    customFieldApi: {
      ...real.customFieldApi,
      // «Banca Móvil» has 3 case fields (one archived) and 1 defect field.
      list: vi.fn(async (projectId: string, _u: string, entity: string) =>
        projectId !== "bm"
          ? []
          : entity === "test_case"
            ? [field, field, field, { archivedAt: "2026-01-01" }]
            : entity === "defect"
              ? [field]
              : [],
      ),
      copy: vi.fn(async () => ({ copied: 1, skipped: [] })),
    },
  };
});

const row = (over: Partial<ProjectRow>): ProjectRow => ({
  id: "x",
  name: "X",
  caseIdPrefix: "X-",
  caseIdDigits: 3,
  updatedAt: "2026-11-01T00:00:00Z",
  lastAccess: null,
  planStatus: null,
  cases: 0,
  coverage: null,
  closeDate: null,
  execution: null,
  ...over,
});
const PROJECTS = [
  row({ id: "pcl", name: "Portal Clientes", caseIdPrefix: "PCL-", cases: 3 }),
  row({
    id: "bm",
    name: "Banca Móvil",
    caseIdPrefix: "BM_",
    caseIdDigits: 4,
    planExportHistory: "revisions",
    riskBandLow: 6,
    riskBandMedium: 14,
    cases: 12,
  }),
];

function renderWizard(projects = PROJECTS) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  renderWithProviders(
    <ToastProvider>
      <NewProjectWizard
        projects={projects}
        ownerId="u1"
        onClose={onClose}
        onCreated={onCreated}
      />
    </ToastProvider>,
  );
  const wizard = screen.getByRole("dialog", { name: "Nuevo proyecto" });
  return { wizard, onClose, onCreated };
}

const next = (wizard: HTMLElement) =>
  userEvent.click(within(wizard).getByRole("button", { name: "Siguiente" }));
const steps = (wizard: HTMLElement) =>
  within(within(wizard).getByRole("list", { name: "Pasos" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

beforeEach(async () => {
  await i18n.changeLanguage("es");
  setViewportWidth(1440);
  desktop.on = false;
  vi.mocked(projectApi.create).mockClear();
  vi.mocked(projectApi.copyRetention).mockClear();
  vi.mocked(customFieldApi.copy).mockClear();
});

describe("«Nuevo proyecto» (UX-29): a blank project", () => {
  it("has two steps and creates with the general data, opening the plan", async () => {
    const { wizard, onCreated } = renderWizard();
    expect(steps(wizard)).toEqual(["1Cómo empezar", "2Datos generales"]);
    expect(
      within(wizard).getByRole("radio", { name: /Proyecto en blanco/ }),
    ).toBeChecked();
    expect(
      within(wizard).queryByRole("button", { name: "Atrás" }),
    ).not.toBeInTheDocument();
    await expectNoAxeViolations();

    await next(wizard);
    const name = within(wizard).getByRole("textbox", {
      name: /Nombre del proyecto/,
    });
    expect(name).toHaveFocus();
    await userEvent.type(name, "Pharos");
    // The free prefix suggested from the name, and how the cases will be numbered.
    expect(
      within(wizard).getByRole("textbox", { name: "Prefijo de ID de caso" }),
    ).toHaveValue("PHA-");
    expect(within(wizard).getByText("Libre")).toBeInTheDocument();
    expect(within(wizard).getByText("PHA-001")).toBeInTheDocument();
    expect(
      within(wizard).queryByTestId("pj-new-summary"),
    ).not.toBeInTheDocument();
    await expectNoAxeViolations();

    await userEvent.click(
      within(wizard).getByRole("button", { name: "Crear proyecto" }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "new" }));
    expect(projectApi.create).toHaveBeenCalledWith({
      name: "Pharos",
      ownerId: "u1",
      caseIdPrefix: "PHA-",
      caseIdDigits: 3,
    });
    expect(customFieldApi.copy).not.toHaveBeenCalled();
  });

  it("refuses a blank name and a prefix another project uses (NC-030)", async () => {
    const { wizard } = renderWizard();
    await next(wizard);
    await userEvent.click(
      within(wizard).getByRole("button", { name: "Crear proyecto" }),
    );
    expect(await within(wizard).findByRole("alert")).toHaveTextContent(
      "Nombre del proyecto",
    );
    expect(
      within(wizard).getByRole("textbox", { name: /Nombre del proyecto/ }),
    ).toHaveAttribute("aria-invalid", "true");

    await userEvent.type(
      within(wizard).getByRole("textbox", { name: /Nombre del proyecto/ }),
      "Banca",
    );
    const prefix = within(wizard).getByRole("textbox", {
      name: "Prefijo de ID de caso",
    });
    // «BM_» is taken by Banca Móvil: «BAN-» is suggested instead.
    expect(prefix).toHaveValue("BAN-");
    await userEvent.clear(prefix);
    await userEvent.type(prefix, "BM-");
    expect(
      within(wizard).getAllByText(/Se solapa con «BM_» de Banca Móvil/).length,
    ).toBeGreaterThan(0);
    expect(within(wizard).queryByText("Libre")).not.toBeInTheDocument();
    await userEvent.click(
      within(wizard).getByRole("button", { name: "Crear proyecto" }),
    );
    expect(projectApi.create).not.toHaveBeenCalled();

    await userEvent.clear(prefix);
    await userEvent.type(prefix, "BAN_{Enter}");
    await waitFor(() =>
      expect(projectApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ caseIdPrefix: "BAN_" }),
      ),
    );
  });

  it("a failed create keeps the wizard open and says so", async () => {
    vi.mocked(projectApi.create).mockRejectedValueOnce(new Error("down"));
    const { wizard, onCreated } = renderWizard();
    await next(wizard);
    await userEvent.type(
      within(wizard).getByRole("textbox", { name: /Nombre del proyecto/ }),
      "Pharos{Enter}",
    );
    expect(
      await within(wizard).findByText(
        "No se pudo crear el proyecto. Inténtalo de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    await userEvent.click(
      within(wizard).getByRole("button", { name: "Crear proyecto" }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("without projects, «A partir de uno existente» is disabled with its reason", () => {
    const { wizard } = renderWizard([]);
    const existing = within(wizard).getByRole("radio", {
      name: /A partir de uno existente/,
    });
    expect(existing).toBeDisabled();
    expect(existing).toHaveAccessibleDescription("Aún no tienes proyectos");
  });
});

describe("«Nuevo proyecto» (UX-29): from an existing project", () => {
  async function toCopyStep() {
    const r = renderWizard();
    await userEvent.click(
      within(r.wizard).getByRole("radio", {
        name: /A partir de uno existente/,
      }),
    );
    expect(steps(r.wizard)).toEqual([
      "1Cómo empezar",
      "2Qué copiar",
      "3Datos generales",
    ]);
    await next(r.wizard);
    return r;
  }

  it("shows each setting's real value in the source, all checked, and never the data", async () => {
    desktop.on = true;
    const { wizard } = await toCopyStep();
    // The first source by name, with its prefix and cases.
    const source = within(wizard).getByRole("button", {
      name: "Proyecto de origen: Banca Móvil",
    });
    expect(source).toHaveTextContent("BM_Banca Móvil12 casos");
    const part = (name: RegExp) =>
      within(wizard).getByRole("checkbox", { name });
    expect(
      await within(wizard).findByText("3 de casos, 1 de defectos"),
    ).toBeInTheDocument();
    expect(part(/Campos personalizados/)).toHaveAccessibleDescription(
      "3 de casos, 1 de defectos",
    );
    expect(part(/Dígitos/)).toHaveAccessibleDescription("4 · BM_0001");
    expect(part(/Historial/)).toHaveAccessibleDescription(
      "Historial de revisiones",
    );
    expect(part(/Bandas de riesgo/)).toHaveAccessibleDescription(
      "Bajo hasta 6 · medio hasta 14",
    );
    expect(part(/Retención/)).toHaveAccessibleDescription(
      "Trazas: 10 días · Vídeos: Siempre",
    );
    for (const box of within(wizard).getAllByRole("checkbox"))
      expect(box).toBeChecked();
    expect(within(wizard).getAllByText("Ajustes")).toHaveLength(5);
    expect(
      within(wizard).getByText(
        /Nunca se copian el nombre, el prefijo ni los datos/,
      ),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("puts the copied digits in the form, marked, and copies the rest after the create", async () => {
    desktop.on = true;
    const { wizard, onCreated } = await toCopyStep();
    await within(wizard).findByText("3 de casos, 1 de defectos");
    await next(wizard);
    const digits = within(wizard).getByRole("combobox", {
      name: "Dígitos del número",
    });
    expect(digits).toHaveAttribute("data-value", "4");
    expect(
      within(wizard).getByText("copiado de Banca Móvil"),
    ).toBeInTheDocument();
    expect(within(wizard).getByTestId("pj-new-summary")).toHaveTextContent(
      "Se copiarán de «Banca Móvil»: los campos personalizados, los dígitos del número (4), el historial en el plan exportado (Historial de revisiones), las bandas de riesgo (bajo hasta 6, medio hasta 14), la retención de evidencias.",
    );
    // The name and prefix are the new project's own.
    expect(
      within(wizard).getByRole("textbox", { name: /Nombre del proyecto/ }),
    ).toHaveValue("");
    await userEvent.type(
      within(wizard).getByRole("textbox", { name: /Nombre del proyecto/ }),
      "Banca Web{Enter}",
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(projectApi.create).toHaveBeenCalledWith({
      name: "Banca Web",
      ownerId: "u1",
      caseIdPrefix: "BAN-",
      caseIdDigits: 4,
      planExportHistory: "revisions",
      riskBandLow: 6,
      riskBandMedium: 14,
    });
    expect(customFieldApi.copy).toHaveBeenCalledTimes(5);
    expect(projectApi.copyRetention).toHaveBeenCalledWith("bm", "new", "u1");
    expect(
      await screen.findByText("Ajustes copiados de «Banca Móvil»."),
    ).toBeInTheDocument();
  });

  it("copies only what stays checked, and a digit changed by hand is no longer «copiado»", async () => {
    desktop.on = true;
    const { wizard } = await toCopyStep();
    await userEvent.click(
      within(wizard).getByRole("checkbox", { name: /Campos personalizados/ }),
    );
    await userEvent.click(
      within(wizard).getByRole("checkbox", { name: /Retención/ }),
    );
    await next(wizard);
    await selectValue(
      within(wizard).getByRole("combobox", { name: "Dígitos del número" }),
      "5",
    );
    expect(
      within(wizard).queryByText("copiado de Banca Móvil"),
    ).not.toBeInTheDocument();
    expect(within(wizard).getByTestId("pj-new-summary")).toHaveTextContent(
      "Se copiarán de «Banca Móvil»: el historial en el plan exportado (Historial de revisiones), las bandas de riesgo (bajo hasta 6, medio hasta 14).",
    );
    await userEvent.type(
      within(wizard).getByRole("textbox", { name: /Nombre del proyecto/ }),
      "Banca Web{Enter}",
    );
    await waitFor(() =>
      expect(projectApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ caseIdDigits: 5 }),
      ),
    );
    expect(customFieldApi.copy).not.toHaveBeenCalled();
    expect(projectApi.copyRetention).not.toHaveBeenCalled();
  });

  it("another source changes the values shown", async () => {
    const { wizard } = await toCopyStep();
    await userEvent.click(
      within(wizard).getByRole("button", {
        name: "Proyecto de origen: Banca Móvil",
      }),
    );
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /Portal Clientes/ }),
    );
    expect(
      within(wizard).getByRole("checkbox", { name: /Dígitos/ }),
    ).toHaveAccessibleDescription("3 · PCL-001");
    expect(
      await within(wizard).findByText("Ninguno todavía"),
    ).toBeInTheDocument();
  });

  it("on the web the evidence retention is shown disabled with its reason", async () => {
    const { wizard } = await toCopyStep();
    const retention = within(wizard).getByRole("checkbox", {
      name: /Retención/,
    });
    expect(retention).toBeDisabled();
    expect(retention).not.toBeChecked();
    expect(retention).toHaveAccessibleDescription(
      "Solo en la app de escritorio: en la web no hay retención de evidencias",
    );
    await next(wizard);
    expect(within(wizard).getByTestId("pj-new-summary")).not.toHaveTextContent(
      "retención",
    );
  });

  it("a copy that fails still creates the project and says what was left out", async () => {
    desktop.on = true;
    vi.mocked(projectApi.copyRetention).mockRejectedValueOnce(
      new Error("down"),
    );
    vi.mocked(customFieldApi.copy).mockImplementation(
      async (_f, _t, _u, entity) => {
        if (entity === "requirement") throw new Error("down");
        return { copied: 0, skipped: [] };
      },
    );
    const { wizard, onCreated } = await toCopyStep();
    await next(wizard);
    await userEvent.type(
      within(wizard).getByRole("textbox", { name: /Nombre del proyecto/ }),
      "Banca Web{Enter}",
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "new" }));
    expect(
      await screen.findByText(
        "El proyecto se creó, pero no se copió: campos personalizados de requisitos; la retención de evidencias. Puedes ajustarlo en Ajustes del proyecto o en Administración › Evidencias.",
      ),
    ).toBeInTheDocument();
    vi.mocked(customFieldApi.copy).mockReset();
  });

  it("«Atrás» goes back keeping what was chosen", async () => {
    const { wizard } = await toCopyStep();
    await userEvent.click(
      within(wizard).getByRole("checkbox", { name: /Campos personalizados/ }),
    );
    await userEvent.click(
      within(wizard).getByRole("button", { name: "Atrás" }),
    );
    expect(
      within(wizard).getByRole("radio", { name: /A partir de uno existente/ }),
    ).toBeChecked();
    await next(wizard);
    expect(
      within(wizard).getByRole("checkbox", { name: /Campos personalizados/ }),
    ).not.toBeChecked();
  });
});

describe("«Nuevo proyecto» (UX-29): keyboard, cancel and mobile", () => {
  it("the start cards are a radio group: arrows choose and Enter goes on", async () => {
    const { wizard } = renderWizard();
    const blank = within(wizard).getByRole("radio", {
      name: /Proyecto en blanco/,
    });
    expect(blank).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    const existing = within(wizard).getByRole("radio", {
      name: /A partir de uno existente/,
    });
    expect(existing).toBeChecked();
    await userEvent.keyboard("{Enter}");
    expect(
      within(wizard).getByRole("heading", { name: /Qué copiar/ }),
    ).toBeInTheDocument();
    expect(
      within(wizard).getByRole("button", {
        name: "Proyecto de origen: Banca Móvil",
      }),
    ).toHaveFocus();
  });

  it("closes at once when nothing was typed or chosen", async () => {
    const { wizard, onClose } = renderWizard();
    await userEvent.click(
      within(wizard).getByRole("button", { name: "Cancelar" }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(projectApi.create).not.toHaveBeenCalled();
  });

  it("asks before discarding what was typed, with Cancel or Escape", async () => {
    const { wizard, onClose } = renderWizard();
    await next(wizard);
    await userEvent.type(
      within(wizard).getByRole("textbox", { name: /Nombre del proyecto/ }),
      "Pharos",
    );
    await userEvent.click(
      within(wizard).getByRole("button", { name: "Cancelar" }),
    );
    const ask = await screen.findByRole("alertdialog", {
      name: "¿Descartar el proyecto nuevo?",
    });
    await userEvent.click(
      within(ask).getByRole("button", { name: "Seguir creando" }),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(
      within(wizard).getByRole("textbox", { name: /Nombre del proyecto/ }),
    ).toHaveValue("Pharos");

    await userEvent.keyboard("{Escape}");
    const again = await screen.findByRole("alertdialog", {
      name: "¿Descartar el proyecto nuevo?",
    });
    await userEvent.click(
      within(again).getByRole("button", { name: "Descartar" }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(projectApi.create).not.toHaveBeenCalled();
  });

  it("choosing «A partir de uno existente» is something to confirm too", async () => {
    const { wizard, onClose } = renderWizard();
    await userEvent.click(
      within(wizard).getByRole("radio", { name: /A partir de uno existente/ }),
    );
    await userEvent.keyboard("{Escape}");
    expect(
      await screen.findByRole("alertdialog", {
        name: "¿Descartar el proyecto nuevo?",
      }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("on mobile it fills the screen and keeps every step and button", async () => {
    setViewportWidth(390);
    const { wizard } = renderWizard();
    expect(wizard.closest('[data-viewport="mobile"]')).not.toBeNull();
    expect(wizard).toHaveClass("pj-wizard");
    // On the shared backdrop (a modal), with the class that fills the screen.
    expect(wizard.closest(".cd-overlay")).toHaveClass("pj-wizard-overlay");
    await userEvent.click(
      within(wizard).getByRole("radio", { name: /A partir de uno existente/ }),
    );
    await next(wizard);
    expect(
      within(wizard).getByRole("button", { name: "Atrás" }),
    ).toBeInTheDocument();
    expect(
      within(wizard).getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});
