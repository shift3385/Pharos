// RED-W3: the trash on the desktop — counter, breakdown, restore, delete
// forever and «Vaciar papelera» with its confirmation.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import type { TrashItem } from "../api/trashApi";
import { ToastProvider } from "@shared/ui/Toast";
import { TrashSection } from "./TrashSection";

const renderTrash = () =>
  renderWithProviders(
    <ToastProvider>
      <TrashSection retentionDays={30} />
    </ToastProvider>,
  );

const list = vi.fn<() => Promise<TrashItem[]>>();
const restore = vi.fn();
const purge = vi.fn();
vi.mock("../api/trashApi", async (importOriginal) => {
  const real = await importOriginal<typeof import("../api/trashApi")>();
  return {
    ...real,
    trashApi: {
      available: () => true,
      list: () => list(),
      restore: (...a: unknown[]) => restore(...a),
      purge: (...a: unknown[]) => purge(...a),
    },
  };
});

const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const row = (patch: Partial<TrashItem>): TrashItem => ({
  entity: "test_case",
  id: "c1",
  projectId: "p1",
  projectName: "Banca Móvil",
  key: "BM-CP-0151",
  title: "Pago QR con saldo insuficiente",
  deletedAt: day(2),
  withProject: false,
  held: false,
  children: 0,
  ...patch,
});

const ITEMS: TrashItem[] = [
  row({}),
  row({ entity: "requirement", id: "r1", key: "BM-REQ-018", title: "Límite diario" }),
  row({ entity: "project", id: "p2", projectId: null, projectName: null, key: null, title: "Portal Proveedores", children: 2, deletedAt: day(1) }),
  row({ id: "c9", projectId: "p2", projectName: "Portal Proveedores", withProject: true, title: "Recuperar PIN", deletedAt: day(1) }),
  row({ entity: "defect", id: "d1", key: "BM-DEF-027", title: "Crash al girar", held: true, deletedAt: day(28) }),
];

beforeEach(async () => {
  await i18n.changeLanguage("es");
  vi.clearAllMocks();
  list.mockResolvedValue(ITEMS);
});

describe("TrashSection", () => {
  it("counts what is listed, breaks it down and hides rows that went with their project", async () => {
    renderTrash();
    expect(await screen.findByTestId("trash-count")).toHaveTextContent("4");
    expect(screen.getAllByTestId("trash-row")).toHaveLength(4);
    expect(screen.queryByText("Recuperar PIN")).toBeNull();
    expect(screen.getByText(/con 2 elementos/)).toBeInTheDocument();
    const chips = screen.getByRole("group", { name: "Desglose de la papelera" });
    expect(within(chips).getByRole("button", { name: "Casos 1" })).toBeInTheDocument();
    expect(screen.getByText("Pendiente de sincronizar")).toBeInTheDocument();
    expect(screen.getByText("en 29 días")).toBeInTheDocument();
  });

  it("filters by kind", async () => {
    const user = userEvent.setup();
    renderTrash();
    await user.click(await screen.findByRole("button", { name: "Requisitos 1" }));
    expect(screen.getAllByTestId("trash-row")).toHaveLength(1);
    expect(screen.getByText(/Límite diario/)).toBeInTheDocument();
  });

  it("restores a selection and says how many came back", async () => {
    const user = userEvent.setup();
    restore.mockResolvedValue({ restored: 2, withThem: 0 });
    renderTrash();
    await user.click(await screen.findByRole("checkbox", { name: "Seleccionar «Pago QR con saldo insuficiente»" }));
    await user.click(screen.getByRole("checkbox", { name: "Seleccionar «Límite diario»" }));
    const bar = screen.getByTestId("trash-selection");
    expect(bar).toHaveTextContent("2 seleccionados");
    await user.click(within(bar).getByRole("button", { name: "Restaurar" }));
    expect(restore).toHaveBeenCalledWith("test-user", [
      { entity: "test_case", id: "c1" },
      { entity: "requirement", id: "r1" },
    ]);
    expect(await screen.findByText("2 elementos restaurados")).toBeInTheDocument();
  });

  it("«Vaciar papelera» asks first, then purges everything", async () => {
    const user = userEvent.setup();
    purge.mockResolvedValue({ projects: 1, testCases: 2, requirements: 1 });
    renderTrash();
    await user.click(await screen.findByTestId("trash-empty"));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("1 proyecto · con 2 elementos");
    expect(dialog).toHaveTextContent("1 elemento con cambios sin sincronizar se conserva");
    expect(purge).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("trash-confirm"));
    expect(purge).toHaveBeenCalledWith("test-user", null);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(await screen.findByText("4 elementos eliminados para siempre")).toBeInTheDocument();
  });

  it("an empty trash says so and cannot be emptied", async () => {
    list.mockResolvedValue([]);
    renderTrash();
    expect(await screen.findByTestId("trash-count")).toHaveTextContent("0");
    expect(screen.getByText(/La papelera está vacía/)).toBeInTheDocument();
    expect(screen.getByTestId("trash-empty")).toBeDisabled();
  });
});
