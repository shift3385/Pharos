import { beforeEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import type { LibraryImpact, LibraryItem } from "../model/types";
import { LibraryPage } from "./LibraryPage";

const list = vi.fn();
const get = vi.fn();
const create = vi.fn();
const update = vi.fn();
const impact = vi.fn();
const setStatus = vi.fn();
const remove = vi.fn();
const versions = vi.fn();
vi.mock("../api/libraryApi", () => ({
  libraryApi: {
    list: (...a: unknown[]) => list(...a),
    get: (...a: unknown[]) => get(...a),
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
    impact: (...a: unknown[]) => impact(...a),
    setStatus: (...a: unknown[]) => setStatus(...a),
    remove: (...a: unknown[]) => remove(...a),
    versions: (...a: unknown[]) => versions(...a),
  },
}));

const item = (over: Partial<LibraryItem>): LibraryItem => ({
  id: "s1",
  projectId: "p1",
  kind: "shared_step",
  name: "Iniciar sesión",
  description: "",
  definition: [
    { id: "P1", name: "usuario" },
    { id: "P2", name: "clave" },
  ],
  body: [
    { id: "A", text: "Dado que estoy en la página de acceso" },
    { id: "B", text: "Cuando escribo <usuario> y <clave>" },
  ],
  status: "active",
  version: 4,
  contentSha256: "x",
  usedBy: 12,
  createdBy: "u",
  createdAt: "2026-11-10T10:00:00Z",
  updatedAt: "2026-11-19T10:00:00Z",
  revision: 3,
  ...over,
});

const dataset = item({
  id: "d1",
  kind: "dataset",
  name: "Usuarios válidos",
  definition: [
    { id: "C1", name: "usuario" },
    { id: "C2", name: "clave" },
  ],
  body: [
    { id: "R1", values: { C1: "ana", C2: "1" } },
    { id: "R2", values: { C1: "luis", C2: "2" } },
  ],
  version: 2,
  usedBy: 0,
});

beforeEach(async () => {
  await i18n.changeLanguage("es");
  for (const f of [
    list,
    get,
    create,
    update,
    impact,
    setStatus,
    remove,
    versions,
  ])
    f.mockReset();
  list.mockImplementation((_p: string, kind: string) =>
    Promise.resolve(
      kind === "dataset"
        ? [dataset]
        : [
            item({}),
            item({
              id: "s2",
              name: "Cerrar sesión",
              status: "obsolete",
              definition: [],
              usedBy: 0,
            }),
          ],
    ),
  );
  get.mockImplementation((id: string) =>
    Promise.resolve(id === "d1" ? dataset : item({ id })),
  );
  versions.mockResolvedValue([]);
});

describe("Biblioteca (boceto 1)", () => {
  it("lists the shared steps with their parameters, version and use; obsolete ones on demand", async () => {
    renderWithProviders(<LibraryPage projectId="p1" />, {
      route: "/projects/p1/library?tab=steps",
    });
    const table = await screen.findByRole("table", {
      name: "Pasos compartidos",
    });
    const row = within(table).getByRole("row", { name: /Iniciar sesión/ });
    expect(row).toHaveTextContent("<usuario>");
    expect(row).toHaveTextContent("<clave>");
    expect(row).toHaveTextContent("v4");
    expect(row).toHaveTextContent("12 casos");
    expect(within(table).queryByText("Cerrar sesión")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("switch", { name: "Mostrar obsoletos" }),
    );
    expect(within(table).getByText("Cerrar sesión")).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("the Datasets tab lists columns and rows", async () => {
    renderWithProviders(<LibraryPage projectId="p1" />, {
      route: "/projects/p1/library",
    });
    await screen.findByRole("table", { name: "Pasos compartidos" });
    await userEvent.click(screen.getByRole("tab", { name: /Datasets/ }));
    const table = await screen.findByRole("table", { name: "Datasets" });
    const row = within(table).getByRole("row", { name: /Usuarios válidos/ });
    expect(row).toHaveTextContent("usuario");
    expect(row).toHaveTextContent("v2");
    await expectNoAxeViolations();
  });
});

describe("shared step editor (boceto 2)", () => {
  it("creates one: parameters come from the steps", async () => {
    create.mockImplementation((input: { name: string }) =>
      Promise.resolve(
        item({ id: "new1", name: input.name, usedBy: 0, version: 1 }),
      ),
    );
    renderWithProviders(<LibraryPage projectId="p1" />, {
      route: "/projects/p1/library?tab=steps&item=new",
    });
    await userEvent.type(
      await screen.findByRole("textbox", { name: "Nombre" }),
      "Pagar",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Paso 1" }),
      "Pago con <tarjeta>",
    );
    expect(
      screen.getByRole("textbox", { name: "Valor al insertar de <tarjeta>" }),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Valor al insertar de <tarjeta>" }),
      "4111",
    );
    await expectNoAxeViolations();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toMatchObject({
      projectId: "p1",
      kind: "shared_step",
      name: "Pagar",
      definition: [{ name: "tarjeta", default: "4111" }],
      body: [{ text: "Pago con <tarjeta>" }],
    });
  });

  it("a change of a step in use shows the impact first; approved cases are flagged", async () => {
    const found: LibraryImpact = {
      cases: [
        {
          id: "c1",
          scenarioId: "ATS_002",
          title: "Compra",
          status: "approved",
          follow: true,
          version: 4,
        },
        {
          id: "c2",
          scenarioId: "ATS_011",
          title: "Historial",
          status: "reviewed",
          follow: true,
          version: 4,
        },
        {
          id: "c3",
          scenarioId: "ATS_020",
          title: "Alta",
          status: "draft",
          follow: true,
          version: 4,
        },
        {
          id: "c4",
          scenarioId: "ATS_014",
          title: "Fijado",
          status: "approved",
          follow: false,
          version: 3,
        },
      ],
      byStatus: { approved: 1, reviewed: 1, draft: 1 },
    };
    impact.mockResolvedValue(found);
    update.mockResolvedValue({
      item: item({ version: 5 }),
      updatedCases: ["c1", "c2", "c3"],
    });
    renderWithProviders(<LibraryPage projectId="p1" />, {
      route: "/projects/p1/library?tab=steps&item=s1",
    });
    const step = await screen.findByRole("textbox", { name: "Paso 1" });
    await userEvent.type(step, " ya");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Guardar «Iniciar sesión» como v5",
    });
    expect(
      within(dialog)
        .getByText("Aprobados · vuelven a En revisión")
        .closest(".lb-count"),
    ).toHaveAttribute("data-warn");
    expect(
      within(dialog).getByText("1 caso aprobado volverá a «En revisión»"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/ATS_014 \(v3\) está fijado/),
    ).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    await expectNoAxeViolations();
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Guardar y actualizar 3 casos",
      }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toBe("s1");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("a step in use cannot be deleted; a description change saves without the notice", async () => {
    update.mockResolvedValue({ item: item({}), updatedCases: [] });
    renderWithProviders(<LibraryPage projectId="p1" />, {
      route: "/projects/p1/library?tab=steps&item=s1",
    });
    await screen.findByRole("textbox", { name: "Paso 1" });
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeDisabled();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Descripción" }),
      "Para todos",
    );
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(impact).not.toHaveBeenCalled();
  });
});

describe("dataset editor (boceto 5)", () => {
  it("pasting a table from a spreadsheet into a new dataset makes its header and rows", async () => {
    create.mockImplementation((input: { name: string }) =>
      Promise.resolve({ ...dataset, id: "d2", name: input.name }),
    );
    renderWithProviders(<LibraryPage projectId="p1" />, {
      route: "/projects/p1/library?tab=datasets&item=new",
    });
    await userEvent.type(
      await screen.findByRole("textbox", { name: "Nombre" }),
      "Tarjetas",
    );
    const area = screen.getByRole("textbox", { name: /Pega aquí/ });
    fireEvent.paste(area, {
      clipboardData: {
        getData: () => "tarjeta\tcvv\r\n4111\t123\r\n5500\t999\r\n",
      },
    });
    const grid = await screen.findByRole("table", {
      name: "Datos del dataset",
    });
    expect(
      within(grid).getByRole("textbox", { name: "Nombre de la columna 1" }),
    ).toHaveValue("tarjeta");
    expect(
      within(grid).getByRole("textbox", { name: "cvv · Fila 2" }),
    ).toHaveValue("999");
    expect(
      screen.getByText(/Un dataset no es un almacén de secretos/),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const input = create.mock.calls[0][0] as {
      kind: string;
      definition: { id: string; name: string }[];
      body: { values: Record<string, string> }[];
    };
    expect(input.kind).toBe("dataset");
    expect(input.definition.map((c) => c.name)).toEqual(["tarjeta", "cvv"]);
    expect(input.body.map((r) => r.values[input.definition[0].id])).toEqual([
      "4111",
      "5500",
    ]);
  });

  it("the grid moves with the arrows and Enter", async () => {
    renderWithProviders(<LibraryPage projectId="p1" />, {
      route: "/projects/p1/library?tab=datasets&item=d1",
    });
    const first = await screen.findByRole("textbox", {
      name: "usuario · Fila 1",
    });
    first.focus();
    await userEvent.keyboard("{Enter}");
    expect(
      screen.getByRole("textbox", { name: "usuario · Fila 2" }),
    ).toHaveFocus();
    await userEvent.keyboard("{End}{ArrowRight}");
    expect(
      screen.getByRole("textbox", { name: "clave · Fila 2" }),
    ).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(
      screen.getByRole("textbox", { name: "clave · Fila 1" }),
    ).toHaveFocus();
  });

  it("over the limits it says why it cannot be saved", async () => {
    renderWithProviders(<LibraryPage projectId="p1" />, {
      route: "/projects/p1/library?tab=datasets&item=d1",
    });
    const cell = await screen.findByRole("textbox", {
      name: "usuario · Fila 1",
    });
    fireEvent.change(cell, { target: { value: "x".repeat(4097) } });
    expect(
      screen.getByText("La celda «usuario» de la fila 1 pasa de 4 KB."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });
});
