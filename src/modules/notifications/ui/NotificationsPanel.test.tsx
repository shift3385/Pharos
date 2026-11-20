// RED-W2: the panel groups by day, filters unread, marks read and runs each
// row's direct action.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import type { AppNotification } from "../model/types";
import type { NotificationsValue } from "../state/notificationsContext";
import { NotificationsPanel } from "./NotificationsPanel";

const ctx: NotificationsValue = {
  items: [],
  unread: 0,
  refresh: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  openConflicts: vi.fn(),
};

vi.mock("../state/notificationsContext", () => ({ useNotifications: () => ctx }));

const today = new Date();
const yesterday = new Date(today.getTime() - 86_400_000);
const item = (id: string, at: Date, patch: Partial<AppNotification> = {}): AppNotification => ({
  id,
  origin: "server",
  kind: "defect.assigned",
  actorId: "ana",
  actorName: "Ana Torres",
  workspaceId: null,
  projectId: "p1",
  subject: { entity: "defect", id: "d1", key: "BM-DEF-031", title: "El saldo no se refresca" },
  data: {},
  createdAt: at.toISOString(),
  readAt: null,
  ...patch,
});

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{`${pathname}${search}`}</output>;
}

function show(items: AppNotification[], onDone = vi.fn()) {
  ctx.items = items;
  ctx.unread = items.filter((n) => !n.readAt).length;
  renderWithProviders(
    <Routes>
      <Route
        path="*"
        element={
          <>
            <NotificationsPanel onDone={onDone} />
            <Where />
          </>
        }
      />
    </Routes>,
  );
  return onDone;
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
  vi.clearAllMocks();
});

describe("NotificationsPanel", () => {
  it("groups by day and shows the unread count in the filter", () => {
    show([
      item("a", today),
      item("b", yesterday, {
        kind: "case.approved",
        readAt: yesterday.toISOString(),
        subject: { entity: "test_case", id: "c1", key: "BM-CP-0139", title: "Login" },
      }),
    ]);
    expect(screen.getByRole("heading", { name: "Hoy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ayer" })).toBeInTheDocument();
    const texts = [...document.querySelectorAll(".np-row__text")].map((e) => e.textContent);
    expect(texts).toEqual(["Ana Torres te asignó BM-DEF-031 El saldo no se refresca", "Ana Torres aprobó BM-CP-0139 Login"]);
    // A key is one unbreakable piece (FIX-41): never «BM-/DEF-031».
    expect([...document.querySelectorAll(".np-row__key")].map((e) => e.textContent)).toEqual(["BM-DEF-031", "BM-CP-0139"]);
    expect(screen.getByRole("radio", { name: "Sin leer · 1" })).toBeInTheDocument();
  });

  it("«Sin leer» hides what was read", async () => {
    const user = userEvent.setup();
    show([item("a", today), item("b", today, { readAt: today.toISOString(), subject: { entity: "defect", id: "d2", title: "Otro" } })]);
    await user.click(screen.getByRole("radio", { name: "Sin leer · 1" }));
    expect(screen.getAllByTestId("notification-row")).toHaveLength(1);
  });

  it("the direct action marks it read, closes the panel and goes there", async () => {
    const user = userEvent.setup();
    const onDone = show([item("a", today)]);
    const row = screen.getByTestId("notification-row");
    await user.click(within(row).getByRole("button", { name: "Ver defecto" }));
    expect(ctx.markRead).toHaveBeenCalledWith(["a"]);
    expect(onDone).toHaveBeenCalled();
    expect(screen.getByTestId("where")).toHaveTextContent("/projects/p1/defects?defect=d1");
  });

  it("a conflict opens the conflicts", async () => {
    const user = userEvent.setup();
    show([item("s", today, { origin: "local", kind: "sync.conflict", projectId: null, data: { count: 2 }, subject: { entity: "sync", id: "x", title: "" } })]);
    expect(screen.getByText("2 conflictos de sincronización por revisar")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resolver" }));
    expect(ctx.openConflicts).toHaveBeenCalled();
  });

  it("«Marcar todo como leído» is off with nothing unread", async () => {
    const user = userEvent.setup();
    show([item("a", today)]);
    await user.click(screen.getByRole("button", { name: "Marcar todo como leído" }));
    expect(ctx.markAllRead).toHaveBeenCalled();
  });

  it("an empty panel says you are up to date, and passes axe", async () => {
    const { container } = (() => {
      show([]);
      return { container: document.body };
    })();
    expect(screen.getByText("Estás al día")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar todo como leído" })).toBeDisabled();
    await expectNoAxeViolations(container);
  });

  it("is wider than the shell's 320 px panels and keeps keys whole (FIX-41)", () => {
    // Two classes: one would lose to the shell's `.topbar__panel`, which loads later.
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "NotificationsPanel.css"), "utf8");
    expect(css).toMatch(/\.topbar__panel\.topbar__panel--notifications \{\s*width: 400px;/);
    expect(css).toMatch(/\.np-row__key \{\s*white-space: nowrap;/);
  });
});
