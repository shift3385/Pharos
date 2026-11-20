// FIX-47: a sync conflict raises one notification; once the person resolves
// every conflict nothing is left to review, so the bell stops counting it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import type { AppNotification } from "../model/types";

const sync = { conflicts: 0, openConflicts: vi.fn() };
vi.mock("@modules/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@modules/sync-offline", () => ({ useSyncStatus: () => sync }));

let stored: AppNotification[] = [];
const addLocalNotification = vi.fn(async () => undefined);
const markNotificationsRead = vi.fn(async () => undefined);
vi.mock("../api/notificationsApi", () => ({
  NOTIFICATIONS_CHANGED: "pharos:notifications-changed",
  addLocalNotification: (...a: unknown[]) => addLocalNotification(...(a as [])),
  listNotifications: vi.fn(async () => stored),
  markNotificationsRead: (...a: unknown[]) => markNotificationsRead(...(a as [])),
  notify: vi.fn(),
  pullNotifications: vi.fn(async () => undefined),
}));

const { NotificationsProvider } = await import("./NotificationsProvider");

const conflictNote = (id: string, readAt: string | null = null): AppNotification => ({
  id,
  origin: "local",
  kind: "sync.conflict",
  actorId: "",
  actorName: "",
  workspaceId: null,
  projectId: null,
  subject: { entity: "sync", id, title: "" },
  data: { count: 1 },
  createdAt: new Date().toISOString(),
  readAt,
});

/** Renders the provider with `conflicts` open, as the sync indicator counts them. */
function mount(conflicts: number) {
  sync.conflicts = conflicts;
  const view = render(
    <NotificationsProvider>
      <span />
    </NotificationsProvider>,
  );
  return (next: number) => {
    sync.conflicts = next;
    view.rerender(
      <NotificationsProvider>
        <span />
      </NotificationsProvider>,
    );
  };
}

beforeEach(() => {
  stored = [];
  vi.clearAllMocks();
});

describe("NotificationsProvider and sync conflicts", () => {
  it("a new conflict raises one notification", async () => {
    const set = mount(0);
    act(() => set(1));
    await waitFor(() => expect(addLocalNotification).toHaveBeenCalledTimes(1));
    expect(addLocalNotification).toHaveBeenCalledWith("u1", expect.objectContaining({ kind: "sync.conflict", data: { count: 1 } }));
  });

  it("a sync whose changes all merged opens no conflict and raises nothing", async () => {
    const set = mount(0);
    act(() => set(0));
    await new Promise((r) => setTimeout(r, 0));
    expect(addLocalNotification).not.toHaveBeenCalled();
    expect(markNotificationsRead).not.toHaveBeenCalled();
  });

  it("resolving the last conflict marks its notifications read, so the bell clears", async () => {
    stored = [conflictNote("n1"), conflictNote("n0", new Date().toISOString())];
    const set = mount(0);
    act(() => set(1));
    await waitFor(() => expect(addLocalNotification).toHaveBeenCalled());
    // The list is loaded by now (the provider reads it at mount).
    act(() => set(0));
    await waitFor(() => expect(markNotificationsRead).toHaveBeenCalledWith("u1", ["n1"]));
  });

  it("with conflicts still open, nothing is marked read", async () => {
    stored = [conflictNote("n1")];
    const set = mount(0);
    act(() => set(2));
    act(() => set(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(markNotificationsRead).not.toHaveBeenCalled();
  });
});
