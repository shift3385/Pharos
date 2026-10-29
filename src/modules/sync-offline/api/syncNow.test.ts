import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingDelta } from "./syncApi";

// Desktop sync cycle against a fake Rust core and a fake backend.
const session = { accessToken: "tok-A", userId: "user-A" };
vi.mock("@modules/auth", () => ({ getSession: vi.fn(async () => session) }));

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

const { syncNow } = await import("./syncApi");

const delta = (i: number): PendingDelta => ({
  entity: "test_case",
  entityId: `c${i}`,
  op: "upsert",
  payload: { title: `Case ${i}` },
  revision: 2,
  author: "A",
  hlc: `h${i}`,
  baseRevision: 1,
  baseHlc: "",
  opIds: [`op${i}`],
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invoke.mockReset();
});

function fakeCore(pending: PendingDelta[]) {
  const calls: { cmd: string; args: Record<string, unknown> }[] = [];
  invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    calls.push({ cmd, args });
    if (cmd === "oplog_pending") return { deltas: pending };
    if (cmd === "sync_cursor_get") return "0";
    return undefined;
  });
  return calls;
}

describe("syncNow", () => {
  it("pushes 2,000 changes in batches and marks each batch synced (FIX-03)", async () => {
    const calls = fakeCore(Array.from({ length: 2000 }, (_, i) => delta(i)));
    const pushes: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        if (url.includes("/sync/push")) {
          const body = JSON.parse(init.body as string) as { deltas: unknown[] };
          pushes.push(body.deltas.length);
          return json({ accepted: body.deltas.length, conflicts: [] });
        }
        return json({ docs: [], cursor: 0, hasMore: false });
      }),
    );

    const res = await syncNow();
    expect(res.pushed).toBe(2000);
    expect(pushes).toHaveLength(10);
    expect(Math.max(...pushes)).toBeLessThanOrEqual(200);
    const marked = calls.filter((c) => c.cmd === "oplog_mark_synced");
    expect(marked).toHaveLength(10);
    expect(marked.flatMap((c) => c.args.deltas as unknown[])).toHaveLength(2000);
  });

  it("retries a failed batch and keeps going (FIX-03)", async () => {
    fakeCore([delta(1)]);
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/sync/push")) {
          attempts++;
          return attempts === 1 ? json({ code: "internal_error" }, 500) : json({ accepted: 1, conflicts: [] });
        }
        return json({ docs: [], cursor: 0, hasMore: false });
      }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 });
    try {
      await expect(syncNow()).resolves.toMatchObject({ pushed: 1 });
    } finally {
      vi.useRealTimers();
    }
    expect(attempts).toBe(2);
  });

  it("pulls every page until the server has no more (FIX-02)", async () => {
    const calls = fakeCore([]);
    const page = (n: number, from: number) =>
      Array.from({ length: n }, (_, i) => ({
        entity: "test_case",
        entityId: `c${from + i}`,
        payload: {},
        revision: 1,
        deleted: false,
        hlc: "",
      }));
    const pages = [
      { docs: page(500, 0), cursor: 500, hasMore: true },
      { docs: page(500, 500), cursor: 1000, hasMore: true },
      { docs: page(200, 1000), cursor: 1200, hasMore: false },
    ];
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        asked.push(new URL(url).searchParams.get("since") ?? "");
        return json(pages.shift());
      }),
    );

    const res = await syncNow();
    expect(res.pulled).toBe(1200);
    expect(asked).toEqual(["0", "500", "1000"]);
    const applied = calls.filter((c) => c.cmd === "apply_remote");
    expect(applied.flatMap((c) => c.args.docs as unknown[])).toHaveLength(1200);
    // The cursor is saved after every page, so an interruption loses nothing.
    expect(calls.filter((c) => c.cmd === "sync_cursor_set").map((c) => c.args.value)).toEqual(["500", "1000", "1200"]);
  });

  it("acts for the signed-in account only (FIX-07)", async () => {
    const calls = fakeCore([delta(1)]);
    const tokens: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        tokens.push((init.headers as Record<string, string>).authorization);
        return url.includes("/sync/push")
          ? json({ accepted: 1, conflicts: [] })
          : json({ docs: [], cursor: 0, hasMore: false });
      }),
    );
    session.userId = "user-B";
    session.accessToken = "tok-B";
    try {
      await syncNow();
    } finally {
      session.userId = "user-A";
      session.accessToken = "tok-A";
    }
    expect(calls.every((c) => c.args?.userId === "user-B")).toBe(true);
    expect(new Set(tokens)).toEqual(new Set(["Bearer tok-B"]));
  });
});
