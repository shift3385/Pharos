import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import type { PlannerCard } from "../model/types";
import { PlannerBoard } from "./PlannerBoard";

const list = vi.fn();
const remove = vi.fn();
vi.mock("../api/plannerApi", () => ({
  MAX_ATTACHMENT_MB: 200,
  plannerApi: {
    list: (...a: unknown[]) => list(...a),
    remove: (...a: unknown[]) => remove(...a),
    reorder: vi.fn(),
    attachmentList: () => Promise.resolve([]),
  },
}));

const card = (id: string, over: Partial<PlannerCard>): PlannerCard => ({
  id,
  projectId: "p1",
  kind: "task",
  title: id,
  status: "backlog",
  priority: "medium",
  position: 0,
  data: {},
  createdAt: "",
  updatedAt: "",
  revision: 1,
  ...over,
});

beforeEach(async () => {
  await i18n.changeLanguage("es");
  list.mockResolvedValue([
    card("t1", { title: "Preparar datos de clientes VIP", data: { labels: ["datos"] } }),
    card("d1", {
      title: "Revisar la pasarela de pago",
      status: "in_progress",
      priority: "critical",
    }),
    card("x1", { kind: "test_data", title: "Tarjetas de prueba 3-D Secure", status: "done", priority: "low" }),
  ]);
  remove.mockResolvedValue(undefined);
});

describe("Planificador (RED-V3)", () => {
  it("is a 4-column kanban with typed cards and priority flags, and points to Defectos", async () => {
    setViewportWidth(1440);
    renderWithProviders(<PlannerBoard projectId="p1" ownerId="u1" />);
    const progress = await screen.findByRole("region", { name: "En progreso" });
    const task = await within(progress).findByRole("article");
    expect(task).toHaveTextContent("Tarea");
    expect(task).toHaveTextContent("Crítica");
    // Defects left the board (DEF-01): a note leads to their module.
    expect(screen.getByRole("note")).toHaveTextContent("Los defectos tienen ahora su propio módulo");
    expect(screen.getByRole("link", { name: "Ir a Defectos" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Defectos \d/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Backlog",
      "En progreso",
      "En revisión",
      "Hecho",
    ]);
    await expectNoAxeViolations();
  }, 15_000);

  it("filters by kind, search and priority, with counts", async () => {
    setViewportWidth(1440);
    renderWithProviders(<PlannerBoard projectId="p1" ownerId="u1" />);
    await screen.findAllByRole("article");
    await userEvent.click(screen.getByRole("button", { name: "Datos de prueba 1" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Todas 3" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar tarjetas" }), "datos");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.click(screen.getByRole("button", { name: "Prioridad" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Baja" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
  }, 15_000);

  it("deletes a card only after a destructive confirmation", async () => {
    setViewportWidth(1440);
    renderWithProviders(<PlannerBoard projectId="p1" ownerId="u1" />);
    await userEvent.click(await screen.findByRole("button", { name: /Eliminar: Revisar la pasarela/ }));
    const dialog = screen.getByRole("alertdialog", { name: "¿Eliminar la tarjeta?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("d1", "u1"));
  });

  it("keeps the kanban on mobile, without the priority filter", async () => {
    setViewportWidth(390);
    renderWithProviders(<PlannerBoard projectId="p1" ownerId="u1" />);
    expect(await screen.findAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Prioridad" })).not.toBeInTheDocument();
    await expectNoAxeViolations();
  }, 15_000);
});
