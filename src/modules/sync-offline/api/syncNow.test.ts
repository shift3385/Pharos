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

describe("syncNow with a refused delta (review fix)", () => {
  it("skips a delta the server refuses as too large, pushes the rest and still pulls", async () => {
    const calls = fakeCore(Array.from({ length: 5 }, (_, i) => delta(i)));
    let pulls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        if (url.includes("/sync/push")) {
          const ids = (JSON.parse(init.body as string) as { deltas: { entityId: string }[] }).deltas.map((d) => d.entityId);
          // c3 is over the body limit: any request carrying it gets 413.
          if (ids.includes("c3")) return json({ code: "FST_ERR_CTP_BODY_TOO_LARGE", message: "Request body is too large" }, 413);
          return json({ accepted: ids.length, conflicts: [] });
        }
        pulls++;
        return json({ docs: [], cursor: 0, hasMore: false });
      }),
    );
    const skippedEvent = vi.fn();
    window.addEventListener("pharos:sync-skipped", skippedEvent);
    const res = await syncNow();
    window.removeEventListener("pharos:sync-skipped", skippedEvent);

    expect(res).toMatchObject({ pushed: 4, skipped: 1 });
    expect(pulls).toBe(1);
    const marked = calls
      .filter((c) => c.cmd === "oplog_mark_synced")
      .flatMap((c) => (c.args.deltas as { entityId: string }[]).map((d) => d.entityId));
    expect(marked.sort()).toEqual(["c0", "c1", "c2", "c4"]);
    expect(skippedEvent).toHaveBeenCalledTimes(1);
  });

  it("stops at once on an unsupported version: nothing marked, no pull", async () => {
    const calls = fakeCore([delta(1)]);
    const fetch = vi.fn(() => json({ code: "unsupported_client_version", message: "old" }, 426));
    vi.stubGlobal("fetch", fetch);
    await expect(syncNow()).rejects.toMatchObject({ status: 426 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.cmd === "oplog_mark_synced" || c.cmd === "sync_cursor_set")).toBe(false);
  });
});

describe("syncNow key blocks (DAT-01)", () => {
  const lease = [{ projectId: "p1", kind: "case", floor: 3 }];
  const block = { projectId: "p1", kind: "case", start: 3, end: 52 };

  function coreWithLease(pending: PendingDelta[]) {
    const calls: { cmd: string; args: Record<string, unknown> }[] = [];
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      calls.push({ cmd, args });
      if (cmd === "key_lease_requests") return lease;
      if (cmd === "oplog_pending") return { deltas: pending };
      if (cmd === "sync_cursor_get") return "0";
      return undefined;
    });
    return calls;
  }

  it("leases blocks and finalizes keys before reading what to push", async () => {
    const calls = coreWithLease([delta(1)]);
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        urls.push(url.replace(/^.*\/sync/, "/sync").replace(/\?.*$/, ""));
        if (url.includes("/sync/key-blocks")) {
          expect(JSON.parse(init.body as string)).toEqual({ requests: lease });
          return json({ blocks: [block], refused: [] });
        }
        if (url.includes("/sync/push")) return json({ accepted: 1, conflicts: [], keyConflicts: [] });
        return json({ docs: [], cursor: 0, hasMore: false });
      }),
    );
    await syncNow();
    expect(urls).toEqual(["/sync/key-blocks", "/sync/push", "/sync/pull"]);
    const order = calls.map((c) => c.cmd);
    expect(order.indexOf("key_blocks_apply")).toBeLessThan(order.indexOf("oplog_pending"));
    expect(calls.find((c) => c.cmd === "key_blocks_apply")?.args).toEqual({ userId: "user-A", blocks: [block] });
  });

  it("records refused keys as key conflicts and does not mark them synced", async () => {
    const calls = coreWithLease([delta(1), delta(2)]);
    const keyConflicts = [{ entity: "test_case", entityId: "c2", key: "LOGIN-1", takenBy: "x" }];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/sync/key-blocks")) return json({ blocks: [], refused: [] });
        if (url.includes("/sync/push")) return json({ accepted: 1, conflicts: [], keyConflicts });
        return json({ docs: [], cursor: 0, hasMore: false });
      }),
    );
    const res = await syncNow();
    expect(res).toMatchObject({ pushed: 1, conflicts: 1 });
    const marked = calls
      .filter((c) => c.cmd === "oplog_mark_synced")
      .flatMap((c) => (c.args.deltas as { entityId: string }[]).map((d) => d.entityId));
    expect(marked).toEqual(["c1"]);
    expect(calls.find((c) => c.cmd === "key_conflicts_record")?.args).toEqual({ userId: "user-A", items: keyConflicts });
  });

  it("still syncs against a server without key blocks (404)", async () => {
    const calls = coreWithLease([delta(1)]);
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/sync/key-blocks")) return json({ code: "not_found", message: "no" }, 404);
        if (url.includes("/sync/push")) return json({ accepted: 1, conflicts: [] });
        return json({ docs: [], cursor: 0, hasMore: false });
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await syncNow()).toMatchObject({ pushed: 1 });
    expect(calls.find((c) => c.cmd === "key_blocks_apply")?.args).toEqual({ userId: "user-A", blocks: [] });
  });

  describe("append-only documents (AUD-01)", () => {
    const event = (i: number): PendingDelta => ({
      entity: "audit_event",
      entityId: `e${i}`,
      op: "append",
      payload: { hash: `h${i}` },
      revision: 1,
      author: "user:user-A",
      hlc: `h${i}`,
      baseRevision: null,
      baseHlc: null,
      opIds: [`ev${i}`],
    });

    function core(lww: PendingDelta[], appendOnly: PendingDelta[]) {
      const calls: { cmd: string; args: Record<string, unknown> }[] = [];
      invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
        calls.push({ cmd, args });
        if (cmd === "oplog_pending") return { deltas: args.class === "append_only" ? appendOnly : lww };
        if (cmd === "sync_cursor_get") return "0";
        return undefined;
      });
      return calls;
    }

    function server(features: string[] | undefined, rejected: string[] = []) {
      const pushes: { entity: string; entityId: string }[][] = [];
      const urls: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string, init: RequestInit) => {
          urls.push(url.replace(/^.*\/sync/, "/sync").replace(/\?.*$/, ""));
          if (url.includes("/sync/push")) {
            const body = JSON.parse(init.body as string) as { deltas: { entity: string; entityId: string }[] };
            pushes.push(body.deltas);
            const appendRejected = body.deltas
              .filter((d) => rejected.includes(d.entityId))
              .map((d) => ({ entity: d.entity, entityId: d.entityId, reason: "content_changed" }));
            return json({
              accepted: body.deltas.length - appendRejected.length,
              conflicts: [],
              keyConflicts: [],
              appendRejected,
            });
          }
          return json({ docs: [], cursor: 0, hasMore: false, ...(features ? { features } : {}) });
        }),
      );
      return { pushes, urls };
    }

    it("pushes them after the pull to a server with the feature, apart from the lww deltas", async () => {
      const calls = core([delta(1)], [event(1), event(2)]);
      const { pushes, urls } = server(["key-conflicts", "append-only"]);
      const res = await syncNow();
      expect(urls).toEqual(["/sync/push", "/sync/pull", "/sync/push"]);
      expect(pushes[0].map((d) => d.entity)).toEqual(["test_case"]);
      expect(pushes[1].map((d) => d.entity)).toEqual(["audit_event", "audit_event"]);
      expect(res.pushed).toBe(1);
      const marked = calls
        .filter((c) => c.cmd === "oplog_mark_synced")
        .map((c) => c.args.deltas as PendingDelta[]);
      expect(marked[1].map((d) => d.entityId)).toEqual(["e1", "e2"]);
    });

    it("keeps them pending against a server without the feature", async () => {
      const calls = core([delta(1)], [event(1)]);
      const { urls } = server(undefined);
      await syncNow();
      expect(urls).toEqual(["/sync/push", "/sync/pull"]);
      expect(calls.some((c) => c.cmd === "oplog_pending" && c.args.class === "append_only")).toBe(false);
    });

    it("does not mark a refused one synced, nor report it as a skipped change", async () => {
      const calls = core([], [event(1), event(2)]);
      server(["append-only"], ["e2"]);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await syncNow();
      expect(res.skipped).toBe(0);
      const marked = calls
        .filter((c) => c.cmd === "oplog_mark_synced")
        .flatMap((c) => c.args.deltas as PendingDelta[]);
      expect(marked.map((d) => d.entityId)).toEqual(["e1"]);
    });
  });
});
