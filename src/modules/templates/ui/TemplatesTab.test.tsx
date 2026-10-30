// Administración → Plantillas (SPEC §8): one kind at a time with counters,
// search, and edit/delete only for the account's own templates, behind the
// card's «Más acciones» menu; deleting asks with the destructive dialog.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { setViewportWidth } from "@test/viewport";
import type { TemplateSummary } from "../model/types";

const tpl = (patch: Partial<TemplateSummary>): TemplateSummary => ({
  id: "t",
  kind: "plan",
  language: "es",
  name: "Plan",
  description: "",
  usagePrompt: "",
  version: "1.0",
  isBuiltin: false,
  isOwn: false,
  updatedAt: new Date(0).toISOString(),
  ...patch,
});

const api = vi.hoisted(() => ({
  list: vi.fn(),
  seed: vi.fn(async () => {}),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(async () => {}),
}));
vi.mock("../api/templateApi", () => ({ templateApi: api }));
vi.mock("../model/builtins", () => ({ builtinSeeds: async () => [], toBase64: () => "" }));

const { TemplatesTab } = await import("./TemplatesTab");

const LIST = [
  tpl({ id: "a", name: "Plan maestro ISO 29119", description: "Estructura completa.", isBuiltin: true, version: "2.1" }),
  tpl({ id: "b", name: "Plan UAT banca", description: "Aceptación de usuario." }),
  tpl({ id: "c", name: "Mi plan de regresión", isOwn: true }),
  tpl({ id: "d", kind: "case", name: "Casos de login", isBuiltin: true }),
];

beforeEach(async () => {
  await i18n.changeLanguage("es");
  api.list.mockResolvedValue(LIST);
  api.remove.mockClear();
});

describe("TemplatesTab", () => {
  it("shows one kind at a time with counters and reports the total", async () => {
    const user = userEvent.setup();
    const onCount = vi.fn();
    renderWithProviders(<TemplatesTab onCount={onCount} />);
    expect(await screen.findAllByTestId("template-card")).toHaveLength(3);
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(4));
    const kinds = screen.getByRole("radiogroup", { name: "Tipo de plantilla" });
    expect(within(kinds).getByRole("radio", { name: "Planes de prueba 3" })).toBeChecked();
    await user.click(within(kinds).getByRole("radio", { name: "Casos de prueba 1" }));
    expect(screen.getAllByTestId("template-card")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Casos de login" })).toBeInTheDocument();
  });

  it("filters by name or description and says when nothing matches", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab />);
    await screen.findAllByTestId("template-card");
    await user.type(screen.getByRole("searchbox", { name: "Buscar plantilla" }), "aceptación");
    expect(screen.getAllByTestId("template-card")).toHaveLength(1);
    await user.type(screen.getByRole("searchbox"), " xyz");
    expect(screen.getByRole("status")).toHaveTextContent("Ninguna plantilla coincide");
  });

  it("read-only templates explain why Edit and Delete are off; own ones delete after the destructive dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab />);
    await screen.findAllByTestId("template-card");

    await user.click(screen.getByRole("button", { name: "Más acciones: Plan UAT banca" }));
    const readOnly = screen.getByRole("menu");
    expect(within(readOnly).getByRole("menuitem", { name: /Eliminar/ })).toBeDisabled();
    expect(within(readOnly).getByRole("menuitem", { name: /Editar/ })).toHaveAttribute(
      "title",
      expect.stringContaining("Solo lectura"),
    );
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Más acciones: Mi plan de regresión" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /Eliminar/ }));
    const dialog = screen.getByRole("alertdialog", { name: "Eliminar plantilla" });
    // Destructive: Escape does not dismiss it, only «Cancelar».
    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Sí, eliminar" }));
    expect(api.remove).toHaveBeenCalledWith("c", "test-user");
  });

  it.each([390, 1440])("passes axe with cards at %i px", async (width) => {
    setViewportWidth(width);
    renderWithProviders(<TemplatesTab />);
    await screen.findAllByTestId("template-card");
    await expectNoAxeViolations();
  });
});
