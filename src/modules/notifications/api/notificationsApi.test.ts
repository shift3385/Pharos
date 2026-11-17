// RED-W2: the event API never notifies the sender, keeps events offline on the
// desktop and sends them later, and read marks go to the account.
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
let desktop = true;
vi.mock("@shared/platform", () => ({
  isTauri: () => desktop,
  invoke: (cmd: string, args?: unknown) => invoke(cmd, args),
}));
const post = vi.fn();
const get = vi.fn();
vi.mock("@modules/sync-offline", () => ({
  serverApi: { post: (p: string, b: unknown) => post(p, b), get: (p: string) => get(p) },
}));
vi.mock("@modules/auth", () => ({ getSession: async () => ({ userId: "me", accessToken: "t" }) }));

const { notify, markNotificationsRead, pullNotifications, flushNotifications } = await import("./notificationsApi");

const subject = { entity: "defect", id: "d1", title: "Saldo" };

/** A tiny desktop store behind `invoke`. */
let outbox: { id: string; body: unknown }[] = [];
let pending: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  desktop = true;
  outbox = [];
  pending = [];
  invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    switch (cmd) {
      case "notifications_outbox_add":
        outbox.push({ id: `o${outbox.length}`, body: args.body });
        return;
      case "notifications_outbox_list":
        return [...outbox];
      case "notifications_outbox_done":
        outbox = outbox.filter((o) => !(args.ids as string[]).includes(o.id));
        return;
      case "notifications_read_pending":
        return [...pending];
      case "notifications_read_sent":
        pending = pending.filter((id) => !(args.ids as string[]).includes(id));
        return;
      case "notifications_mark_read":
        pending.push(...((args.ids as string[] | null) ?? ["all-1"]));
        return 1;
      case "notifications_cursor":
        return 3;
      default:
        return undefined;
    }
  });
});

describe("notify", () => {
  it("never notifies the sender", async () => {
    await notify({ kind: "defect.assigned", to: { userIds: ["me"] }, subject });
    expect(invoke).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps the event offline and sends it on the next flush", async () => {
    post.mockRejectedValue(new Error("offline"));
    await notify({ kind: "defect.assigned", to: { userIds: ["me", "luis"] }, subject, dedupeKey: "d1:2" });
    await flushNotifications("me");
    expect(outbox).toHaveLength(1);
    expect(outbox[0].body).toMatchObject({ to: { userIds: ["luis"] }, dedupeKey: "d1:2" });

    post.mockResolvedValue({ delivered: 1 });
    await flushNotifications("me");
    expect(outbox).toHaveLength(0);
    expect(post).toHaveBeenLastCalledWith("/api/notifications", { input: expect.objectContaining({ kind: "defect.assigned" }) });
  });

  it("drops an event the server refuses (400), keeps one it could not reach", async () => {
    await invoke("notifications_outbox_add", { body: { kind: "x" } });
    post.mockRejectedValueOnce(Object.assign(new Error("bad"), { status: 400 }));
    await flushNotifications("me");
    expect(outbox).toHaveLength(0);
  });

  it("never throws, even when the store fails", async () => {
    invoke.mockRejectedValue(new Error("db"));
    await expect(notify({ kind: "cycle.closed", to: { workspace: true }, subject })).resolves.toBeUndefined();
  });

  it("in the browser posts straight to the server", async () => {
    desktop = false;
    post.mockResolvedValue({ delivered: 0 });
    await notify({ kind: "cycle.closed", to: { workspace: true }, workspaceId: "w1", subject });
    expect(post).toHaveBeenCalledWith("/api/notifications", { input: expect.objectContaining({ workspaceId: "w1" }) });
  });
});

describe("read marks and pulls", () => {
  it("a read mark made here is sent to the account", async () => {
    post.mockResolvedValue({ unread: 0 });
    await markNotificationsRead("me", ["n1"]);
    await flushNotifications("me");
    expect(post).toHaveBeenCalledWith("/api/me/notifications/read", { input: { ids: ["n1"] } });
    expect(pending).toEqual([]);
  });

  it("a pull asks from the stored cursor and keeps the ids only at the end", async () => {
    get.mockResolvedValue({ items: [], cursor: 5, more: false, keptIds: ["a"], unread: 0 });
    await pullNotifications("me");
    expect(get).toHaveBeenCalledWith("/api/me/notifications?since=3");
    expect(invoke).toHaveBeenCalledWith("notifications_apply_pull", { userId: "me", items: [], cursor: 5, keptIds: ["a"] });
  });

  it("offline, a pull changes nothing", async () => {
    get.mockRejectedValue(new Error("offline"));
    await expect(pullNotifications("me")).resolves.toBeUndefined();
    expect(invoke).not.toHaveBeenCalledWith("notifications_apply_pull", expect.anything());
  });
});
