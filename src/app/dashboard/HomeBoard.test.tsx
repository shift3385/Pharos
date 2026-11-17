import "@test/slow";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { serverApi } from "@modules/sync-offline";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import type { HomeProject } from "./model/homeData";
import { homeMetrics } from "./model/metricsFixture";
import { clearHomeMetricsCache } from "./model/loadHomeMetrics";
import { defaultBoard, hideGadget, type Board } from "./model/board";
import { useHomeBoard } from "./model/useHomeBoard";
import { DashboardPage } from "./DashboardPage";

// The Inicio board (UX-27): the gadgets on a 24 × 24 grid the user
// customizes, kept per account.

const project: HomeProject = {
  id: "p1",
  name: "Portal",
  key: "PCL",
  closeDate: null,
  hasPlan: true,
  criteria: [],
};
vi.mock("./model/loadHome", () => ({ loadHome: async () => [project] }));

// The account's preferences on the server, by user (the session's user is
// «test-user»; `useHomeBoard` is also called directly with other ids). Spies
// on the real `serverApi`, which both the metrics and the preferences use.
type Pref = { key: string; value: unknown; updatedAt: string | null };
const prefs = new Map<string, Pref>();
let account = "test-user";
const keyOf = (path: string) => decodeURIComponent(path.split("/").pop()!);
let put: MockInstance<typeof serverApi.put>;

function fakeServer() {
  vi.spyOn(serverApi, "get").mockImplementation(async <T,>(path: string) => {
    if (!path.startsWith("/api/me/preferences/")) return homeMetrics({ projects: [] }) as T;
    const key = keyOf(path);
    return (prefs.get(`${account}:${key}`) ?? { key, value: null, updatedAt: null }) as T;
  });
  put = vi.spyOn(serverApi, "put").mockImplementation(async <T,>(path: string, _id: string, input: unknown) => {
    const { value, updatedAt } = input as { value: unknown; updatedAt: string };
    const key = keyOf(path);
    prefs.set(`${account}:${key}`, { key, value, updatedAt });
    return prefs.get(`${account}:${key}`) as T;
  });
}

const storedBoard = (user = "test-user") =>
  (JSON.parse(localStorage.getItem(`pharos.prefs.${user}.home.board`) ?? "null") as { value: Board } | null)?.value;

const gadget = (name: string) => screen.getByRole("group", { name: new RegExp(`^${name}:`) });
const live = () => screen.getByTestId("home-board-live");

async function customize() {
  const user = userEvent.setup();
  renderWithProviders(<DashboardPage />);
  await screen.findByTestId("kpi-projects");
  await user.click(screen.getByRole("button", { name: "Personalizar Inicio" }));
  return user;
}

describe("Inicio board (UX-27)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    clearHomeMetricsCache();
    localStorage.clear();
    prefs.clear();
    fakeServer();
    account = "test-user";
    setViewportWidth(1440);
  });

  it("shows the approved default on the desktop, in reading order, with nothing to drag", async () => {
    renderWithProviders(<DashboardPage />);
    const board = await screen.findByTestId("home-board");
    const order = [...board.querySelectorAll("[data-gadget]")].map((g) => g.getAttribute("data-gadget"));
    expect(order).toEqual([
      "kpiProjects",
      "kpiPending",
      "kpiRate",
      "kpiDefects",
      "byProject",
      "upcoming",
      "exitCriteria",
      "daily",
      "trend",
    ]);
    expect(board).not.toHaveAttribute("data-editing");
    expect(screen.queryByRole("group", { name: /columna/ })).not.toBeInTheDocument();
    // «Nuevo proyecto» stays the one highlighted button; the gear is quiet.
    expect(screen.getByRole("button", { name: "Nuevo proyecto" })).toHaveClass("home-btn--primary");
    expect(screen.getByRole("button", { name: "Personalizar Inicio" })).toHaveAttribute("aria-pressed", "false");
  });

  it("the gear turns customizing on: its controls, the hint and every gadget's place and minimum", async () => {
    await customize();
    expect(screen.getByRole("button", { name: "Personalizar Inicio" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Nuevo proyecto" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("home-period")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restablecer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Listo" })).toBeInTheDocument();
    expect(screen.getByText("Arrastra para mover, tira de la esquina para cambiar el tamaño")).toBeInTheDocument();
    expect(gadget("Ejecución por proyecto")).toHaveAccessibleName("Ejecución por proyecto: columna 1, fila 5, 9×10");
    expect(within(gadget("Ejecución por proyecto")).getByText("9×10 · mín 8×7")).toBeInTheDocument();
    expect(gadget("Próximas pruebas")).toHaveAccessibleName("Próximas pruebas: columna 10, fila 5, 7×11");
    // Its content cannot be used meanwhile: a drag never opens a card.
    expect(screen.getByTestId("kpi-projects").closest(".home-gadget__body")).toHaveAttribute("inert");
  });

  it("moves with the arrows and resizes with Shift + arrows, announcing each change; «Listo» saves it", async () => {
    const user = await customize();
    act(() => gadget("Proyectos abiertos").focus());
    await user.keyboard("{ArrowRight}");
    expect(live()).toHaveTextContent("Proyectos abiertos: columna 7, fila 1, 6×4");
    expect(gadget("Pruebas pendientes")).toHaveAccessibleName("Pruebas pendientes: columna 1, fila 1, 6×4");
    // The focus stays on the gadget it moved.
    expect(gadget("Proyectos abiertos")).toHaveFocus();
    act(() => gadget("Ejecución por proyecto").focus());
    await user.keyboard("{Shift>}{ArrowUp}{/Shift}");
    expect(live()).toHaveTextContent("Ejecución por proyecto: columna 1, fila 5, 9×9");
    await user.click(screen.getByRole("button", { name: "Listo" }));
    expect(live()).toHaveTextContent("Distribución de Inicio guardada");
    const saved = storedBoard()!;
    expect(saved.version).toBe(2);
    expect(saved.items.find((i) => i.id === "kpiProjects")).toMatchObject({ x: 6, y: 0 });
    expect(saved.items.find((i) => i.id === "byProject")).toMatchObject({ h: 9 });
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(prefs.get("test-user:home.board")?.value).toEqual(saved);
    expect(screen.getByRole("button", { name: "Personalizar Inicio" })).toHaveAttribute("aria-pressed", "false");
  });

  it("never resizes a gadget under its minimum, and says so", async () => {
    const user = await customize();
    act(() => gadget("Ejecución por proyecto").focus());
    await user.keyboard("{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}");
    expect(gadget("Ejecución por proyecto")).toHaveAccessibleName("Ejecución por proyecto: columna 1, fila 5, 8×10");
    expect(live()).toHaveTextContent("Ejecución por proyecto: no se puede mover ni cambiar de tamaño hacia ahí");
    await user.keyboard("{Shift>}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{/Shift}");
    expect(gadget("Ejecución por proyecto")).toHaveAccessibleName(/8×7$/);
  });

  it("hides a gadget and shows it again from «Gadgets ocultos», in the first gap", async () => {
    const user = await customize();
    expect(screen.getByTestId("home-hidden-gadgets")).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("button", { name: "Ocultar «Criterios de salida»" }));
    expect(screen.queryByRole("group", { name: /^Criterios de salida:/ })).not.toBeInTheDocument();
    expect(live()).toHaveTextContent("Criterios de salida: oculto");
    const tray = screen.getByRole("button", { name: "Gadgets ocultos (1)" });
    await user.click(tray);
    await user.click(screen.getByRole("menuitem", { name: "Mostrar «Criterios de salida»" }));
    expect(gadget("Criterios de salida")).toHaveAccessibleName("Criterios de salida: columna 17, fila 5, 8×11");
    expect(screen.getByRole("button", { name: "Gadgets ocultos (0)" })).toHaveAttribute("aria-disabled", "true");
  });

  it("a hidden gadget stays hidden after saving, and «Restablecer» brings it back after confirming", async () => {
    const user = await customize();
    await user.click(screen.getByRole("button", { name: "Ocultar «Próximas pruebas»" }));
    await user.click(screen.getByRole("button", { name: "Listo" }));
    expect(screen.queryByTestId("gadget-upcoming")).not.toBeInTheDocument();
    expect(storedBoard()!.hidden).toEqual([{ id: "upcoming", w: 7, h: 11 }]);

    await user.click(screen.getByRole("button", { name: "Personalizar Inicio" }));
    await user.click(screen.getByRole("button", { name: "Restablecer" }));
    // A Pharos dialog (NC-017), never the browser's confirm.
    const ask = screen.getByRole("alertdialog", { name: "¿Restablecer Inicio?" });
    await user.click(within(ask).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group", { name: /^Próximas pruebas:/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restablecer" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Restablecer" }));
    expect(gadget("Próximas pruebas")).toHaveAccessibleName("Próximas pruebas: columna 10, fila 5, 7×11");
    expect(live()).toHaveTextContent("Distribución por defecto restablecida");
    await user.click(screen.getByRole("button", { name: "Listo" }));
    expect(storedBoard()).toEqual(defaultBoard());
  });

  it("Esc leaves without saving: at once with no changes, after asking with some", async () => {
    const user = await customize();
    act(() => gadget("Defectos abiertos").focus());
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Personalizar Inicio" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Personalizar Inicio" }));
    act(() => gadget("Defectos abiertos").focus());
    await user.keyboard("{ArrowLeft}");
    await user.keyboard("{Escape}");
    const ask = screen.getByRole("alertdialog");
    await user.click(within(ask).getByRole("button", { name: "Seguir editando" }));
    expect(gadget("Defectos abiertos")).toHaveAccessibleName(/columna 13/);
    act(() => gadget("Defectos abiertos").focus());
    await user.keyboard("{Escape}");
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Descartar cambios" }));
    expect(screen.getByRole("button", { name: "Personalizar Inicio" })).toHaveAttribute("aria-pressed", "false");
    expect(storedBoard()).toBeUndefined();
    expect(put).not.toHaveBeenCalled();
  });

  it("a board saved before a gadget existed gets it in the first gap", async () => {
    const old = hideGadget(defaultBoard(), "exitCriteria");
    localStorage.setItem(
      "pharos.prefs.test-user.home.board",
      JSON.stringify({ value: { ...old, hidden: [] }, updatedAt: "2026-11-01T00:00:00Z", pending: false }),
    );
    await customize();
    expect(gadget("Criterios de salida")).toHaveAccessibleName("Criterios de salida: columna 17, fila 5, 8×11");
  });

  it("a customized board with no room says the new gadget waits in «Gadgets ocultos» (DOC-06, D6)", async () => {
    const user = userEvent.setup();
    const full = {
      version: 1,
      items: [
        { id: "kpiProjects", x: 0, y: 0, w: 6, h: 4 },
        { id: "kpiPending", x: 6, y: 0, w: 6, h: 4 },
        { id: "kpiRate", x: 12, y: 0, w: 6, h: 4 },
        { id: "kpiDefects", x: 18, y: 0, w: 6, h: 4 },
        { id: "byProject", x: 0, y: 4, w: 10, h: 10 },
        { id: "upcoming", x: 10, y: 4, w: 7, h: 20 },
        { id: "exitCriteria", x: 17, y: 4, w: 7, h: 20 },
        { id: "daily", x: 0, y: 14, w: 10, h: 10 },
      ],
      hidden: [],
    };
    localStorage.setItem(
      "pharos.prefs.test-user.home.board",
      JSON.stringify({ value: full, updatedAt: "2026-11-01T00:00:00Z", pending: false }),
    );
    renderWithProviders(<DashboardPage />);
    const notice = await screen.findByTestId("home-new-gadget");
    expect(notice).toHaveTextContent("Nuevo gadget: Tendencia de ciclos.");
    expect(screen.queryByTestId("gadget-trend")).not.toBeInTheDocument();
    await user.click(within(notice).getByRole("button", { name: "Entendido" }));
    expect(screen.queryByTestId("home-new-gadget")).not.toBeInTheDocument();
    expect(storedBoard()!.hidden).toEqual([{ id: "trend", w: 15, h: 8 }]);
  });

  it("passes axe while customizing", async () => {
    await customize();
    await expectNoAxeViolations(screen.getByTestId("home-board").closest("section")!);
  });
});

describe("Inicio gadgets on the board (UX-28)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    clearHomeMetricsCache();
    localStorage.clear();
    prefs.clear();
    fakeServer();
    setViewportWidth(1440);
  });

  it("puts each gadget's subtitle behind a «?» help that the keyboard opens and Esc closes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />);
    await screen.findByTestId("home-board");
    const helps: [string, string][] = [
      ["Ejecución por proyecto", "Último resultado de cada caso en cada proyecto abierto"],
      ["Próximas pruebas", "Según su último resultado, por prioridad"],
      ["Criterios de salida", "Definidos en el plan de pruebas"],
      ["Ejecuciones diarias (intentos)", "Todos los proyectos · cada intento cuenta · últimos 14 días"],
    ];
    for (const [title, help] of helps) {
      // The card reads its help as its description, without opening it.
      expect(screen.getByRole("region", { name: title })).toHaveAccessibleDescription(help);
      expect(screen.getByRole("button", { name: `Más información: ${title}` })).toBeInTheDocument();
    }
    // No subtitle line under any title any more.
    expect(document.querySelector(".home-card__sub")).toBeNull();
    const button = screen.getByRole("button", { name: "Más información: Próximas pruebas" });
    act(() => button.focus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Según su último resultado, por prioridad");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens the per-day numbers in a dialog, so the gadget never grows", async () => {
    const user = userEvent.setup();
    vi.spyOn(serverApi, "get").mockImplementation(async <T,>(path: string) => {
      if (path.startsWith("/api/me/preferences/")) return { key: "home.board", value: null, updatedAt: null } as T;
      const m = homeMetrics({ projects: [] });
      m.daily[59] = { ...m.daily[59], total: 2, passed: 2, manual: 2 };
      return m as T;
    });
    renderWithProviders(<DashboardPage />);
    const open = await screen.findByRole("button", { name: "Ver los datos" });
    expect(screen.queryByTestId("home-daily-data")?.tagName).toBe("BUTTON");
    await user.click(open);
    const dialog = screen.getByRole("dialog", { name: "Ejecuciones diarias (intentos)" });
    expect(within(dialog).getByRole("table", { name: "Ejecuciones por día, últimos 14 días" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is compact while its rows are short, with the legend names in tooltips", async () => {
    // jsdom has no layout: the free height is the window's. At 768 px a row
    // is 24 px; at 600 px, 17 px, under the compact threshold.
    const { unmount } = renderWithProviders(<DashboardPage />);
    expect(await screen.findByTestId("home-board")).not.toHaveAttribute("data-compact");
    unmount();
    vi.stubGlobal("innerHeight", 600);
    renderWithProviders(<DashboardPage />);
    const board = await screen.findByTestId("home-board");
    expect(board).toHaveAttribute("data-compact");
    const pass = within(screen.getByTestId("gadget-byProject")).getByText("Pasa");
    expect(pass).toHaveClass("home-legend__label");
    expect(pass.closest("li")).toHaveAttribute("title", "Pasa");
  });
});

describe("Inicio board on narrow views (UX-27)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    clearHomeMetricsCache();
    localStorage.clear();
    prefs.clear();
    fakeServer();
    localStorage.setItem(
      "pharos.prefs.test-user.home.board",
      JSON.stringify({ value: hideGadget(defaultBoard(), "byProject"), updatedAt: "2026-11-01T00:00:00Z", pending: false }),
    );
  });

  it("on tablet stacks the visible gadgets in their order, without customizing", async () => {
    setViewportWidth(1000);
    renderWithProviders(<DashboardPage />);
    const stack = await screen.findByTestId("home-stack");
    const order = [...stack.querySelectorAll("[data-gadget]")].map((g) => g.getAttribute("data-gadget"));
    expect(order).toEqual(["kpiProjects", "kpiPending", "kpiRate", "kpiDefects", "daily", "upcoming", "exitCriteria", "trend"]);
    expect(screen.queryByTestId("home-board")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Personalizar Inicio" })).not.toBeInTheDocument();
  });

  it("on mobile keeps its tabs, without the hidden gadgets and without customizing", async () => {
    setViewportWidth(390);
    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />);
    await screen.findByTestId("kpi-projects");
    expect(screen.queryByRole("button", { name: "Personalizar Inicio" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Ejecución" }));
    expect(screen.queryByTestId("home-exec")).not.toBeInTheDocument();
    expect(screen.getByTestId("home-daily")).toBeInTheDocument();
  });
});

describe("useHomeBoard (UX-27)", () => {
  beforeEach(() => {
    localStorage.clear();
    prefs.clear();
    fakeServer();
  });

  it("keeps each account's own board: two users, two layouts", async () => {
    const ana = hideGadget(defaultBoard(), "daily");
    const luis = hideGadget(defaultBoard(), "upcoming");
    account = "ana";
    const a = renderHook(() => useHomeBoard("ana"));
    act(() => a.result.current.save(ana));
    await waitFor(() => expect(prefs.get("ana:home.board")?.value).toEqual(ana));
    account = "luis";
    const { result, rerender } = renderHook(({ id }) => useHomeBoard(id), { initialProps: { id: "luis" } });
    expect(result.current.board).toEqual(defaultBoard());
    act(() => result.current.save(luis));
    await waitFor(() => expect(prefs.get("luis:home.board")?.value).toEqual(luis));
    // On another device: each account brings its own from the server.
    localStorage.clear();
    account = "ana";
    rerender({ id: "ana" });
    await waitFor(() => expect(result.current.board).toEqual(ana));
    account = "luis";
    rerender({ id: "luis" });
    await waitFor(() => expect(result.current.board).toEqual(luis));
  });
});
