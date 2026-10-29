import { beforeEach, describe, expect, it, vi } from "vitest";

// Web sync (browser): outbox, retries, kept edits on a lost conflict, paged pull.
const session = { accessToken: "tok", userId: "user-A" };
vi.mock("@modules/auth", () => ({ getSession: vi.fn(async () => session) }));

const web = await import("./webSync");

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const cases = () => JSON.parse(localStorage.getItem("pharos.testCases") ?? "[]") as { id: string; title: string }[];

/** Fake backend: `onPush` decides each push; pulls serve `pages` in order. */
function backend(onPush: (deltas: { entityId: string; hlc: string; payload: unknown }[]) => Promise<Response>, pages: unknown[] = []) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/sync/push")) return onPush(JSON.parse(init?.body as string).deltas);
    return json(pages.shift() ?? { docs: [], cursor: 0, hasMore: false });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const SERVER_HLC = "009999999999999-00000-desk"; // a device whose clock runs ahead

beforeEach(() => {
  session.userId = "user-A";
});

describe("web outbox (FIX-04)", () => {
  it("keeps a failed push queued and sends it on the next try", async () => {
    backend(() => Promise.reject(new TypeError("Failed to fetch")));
    web.enqueue("user-A", { entity: "test_case", entityId: "c1", op: "upsert", payload: { id: "c1", title: "Login" }, revision: 1, author: "A", hlc: web.nextWebHlc() });
    await expect(web.flushOutbox()).rejects.toThrow();
    expect(web.webLocalState("user-A").pending).toBe(1);

    const pushed: string[] = [];
    backend(async (deltas) => {
      pushed.push(...deltas.map((d) => d.entityId));
      return json({ accepted: deltas.length, conflicts: [] });
    });
    await expect(web.flushOutbox()).resolves.toEqual({ pushed: 1, conflicts: 0, skipped: 0 });
    expect(pushed).toEqual(["c1"]);
    expect(web.webLocalState("user-A").pending).toBe(0);
  });

  it("a newer edit of the same entity replaces the queued one", () => {
    const d = { entity: "test_case", entityId: "c1", op: "upsert" as const, revision: 1, author: "A" };
    web.enqueue("user-A", { ...d, payload: { title: "v1" }, hlc: "h1" });
    web.enqueue("user-A", { ...d, payload: { title: "v2" }, hlc: "h2" });
    expect(web.loadOutbox("user-A").map((x) => x.payload)).toEqual([{ title: "v2" }]);
  });

  it("outbox and conflicts are per account (FIX-07)", () => {
    web.enqueue("user-A", { entity: "test_case", entityId: "c1", op: "upsert", payload: {}, revision: 1, author: "A", hlc: "h" });
    expect(web.webLocalState("user-B")).toEqual({ pending: 0, conflicts: 0 });
  });
});

describe("lost web push (FIX-04)", () => {
  async function loseAConflict() {
    localStorage.setItem("pharos.testCases", JSON.stringify([{ id: "c1", title: "Login (web edit)", revision: 2 }]));
    const remote = { entity: "test_case", entityId: "c1", payload: { id: "c1", title: "Login (desktop)" }, revision: 5, deleted: false, hlc: SERVER_HLC };
    backend(async () => json({ accepted: 0, conflicts: [remote] }), [{ docs: [remote], cursor: 7, hasMore: false }]);
    const seen = vi.fn();
    window.addEventListener("pharos:sync-conflict", seen);
    web.enqueue("user-A", { entity: "test_case", entityId: "c1", op: "upsert", payload: { id: "c1", title: "Login (web edit)", revision: 2 }, revision: 2, author: "A", hlc: web.nextWebHlc() });
    const res = await web.hydrateFromBackend();
    window.removeEventListener("pharos:sync-conflict", seen);
    return { res, seen };
  }

  it("warns, keeps both versions and leaves the web edit visible", async () => {
    const { res, seen } = await loseAConflict();
    expect(res.conflicts).toBe(1);
    expect(seen).toHaveBeenCalledTimes(1);
    const [c] = web.webConflicts("user-A");
    expect(c.local.payload).toMatchObject({ title: "Login (web edit)" });
    expect(c.remote.payload).toMatchObject({ title: "Login (desktop)" });
    // The pull brought the server copy, but the held web edit is not replaced.
    expect(cases()[0].title).toBe("Login (web edit)");
    expect(web.webLocalState("user-A")).toEqual({ pending: 0, conflicts: 1 });
  });

  it("keep mine: pushes the web version again with a newer HLC", async () => {
    await loseAConflict();
    const sent: { hlc: string; payload: unknown }[] = [];
    backend(async (deltas) => {
      sent.push(...deltas);
      return json({ accepted: deltas.length, conflicts: [] });
    });
    await web.resolveWebConflict("user-A", web.webConflicts("user-A")[0].id, "local");
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({ title: "Login (web edit)" });
    expect(sent[0].hlc > SERVER_HLC).toBe(true);
    expect(web.webLocalState("user-A")).toEqual({ pending: 0, conflicts: 0 });
  });

  it("use the server's: replaces the cached copy", async () => {
    await loseAConflict();
    await web.resolveWebConflict("user-A", web.webConflicts("user-A")[0].id, "remote");
    expect(cases()[0].title).toBe("Login (desktop)");
    expect(web.webLocalState("user-A")).toEqual({ pending: 0, conflicts: 0 });
  });
});

describe("web pull (FIX-02)", () => {
  it("pages from the account's cursor until the server has no more", async () => {
    const page = (n: number, from: number) =>
      Array.from({ length: n }, (_, i) => ({ entity: "test_case", entityId: `c${from + i}`, payload: { id: `c${from + i}`, title: "t" }, revision: 1, deleted: false, hlc: "" }));
    const fetch = backend(async () => json({ accepted: 0, conflicts: [] }), [
      { docs: page(500, 0), cursor: 500, hasMore: true },
      { docs: page(500, 500), cursor: 1000, hasMore: true },
      { docs: [...page(199, 1000), { entity: "requirement", entityId: "r1", payload: { id: "r1", requirementKey: "REQ-001" }, revision: 1, deleted: false, hlc: "" }], cursor: 1200, hasMore: false },
    ]);
    const res = await web.hydrateFromBackend();
    expect(res.pulled).toBe(1200);
    expect(cases()).toHaveLength(1199);
    expect(JSON.parse(localStorage.getItem("pharos.requirements") ?? "[]")).toHaveLength(1);
    const since = fetch.mock.calls.map((c) => new URL(c[0] as string).searchParams.get("since"));
    expect(since).toEqual(["0", "500", "1000"]);

    // The next sync starts from the stored cursor, not from 0.
    await web.hydrateFromBackend();
    expect(new URL(fetch.mock.calls.at(-1)?.[0] as string).searchParams.get("since")).toBe("1200");
  });

  it("a deleted requirement keeps its tombstone so its key is never reused", async () => {
    localStorage.setItem("pharos.requirements", JSON.stringify([{ id: "r1", requirementKey: "REQ-001" }]));
    backend(async () => json({}), [{ docs: [{ entity: "requirement", entityId: "r1", payload: {}, revision: 2, deleted: true, hlc: "" }], cursor: 3, hasMore: false }]);
    await web.hydrateFromBackend();
    const [r] = JSON.parse(localStorage.getItem("pharos.requirements") ?? "[]") as { deletedAt?: string }[];
    expect(r.deletedAt).toBeTruthy();
  });
});

describe("review fixes (web)", () => {
  const remoteDoc = (title: string, hlc: string) => ({ entity: "test_case", entityId: "c1", payload: { id: "c1", title }, revision: 5, deleted: false, hlc });

  it("a pull refreshes the server side of an open conflict", async () => {
    localStorage.setItem("pharos.testCases", JSON.stringify([{ id: "c1", title: "web edit" }]));
    const first = remoteDoc("desktop v1", "009999999999999-00000-desk");
    backend(async () => json({ accepted: 0, conflicts: [first] }), [{ docs: [first], cursor: 7, hasMore: false }]);
    web.enqueue("user-A", { entity: "test_case", entityId: "c1", op: "upsert", payload: { id: "c1", title: "web edit" }, revision: 2, author: "A", hlc: web.nextWebHlc() });
    await web.hydrateFromBackend();
    // A third device writes again; the next pull carries it.
    const newer = remoteDoc("third device", "019999999999999-00000-third");
    backend(async () => json({}), [{ docs: [newer], cursor: 8, hasMore: false }]);
    await web.hydrateFromBackend();
    const [c] = web.webConflicts("user-A");
    expect(c.remote.payload).toMatchObject({ title: "third device" });
    expect(cases()[0].title).toBe("web edit"); // still held
    // Taking the server version now takes the newest one, not the stale one.
    await web.resolveWebConflict("user-A", c.id, "remote");
    expect(cases()[0].title).toBe("third device");
  });

  it("applies the cascade tombstones to the caches after a project delete", async () => {
    localStorage.setItem("pharos.projects", JSON.stringify([{ id: "p1", ownerId: "user-A" }]));
    localStorage.setItem("pharos.testCases", JSON.stringify([{ id: "c1", projectId: "p1" }]));
    localStorage.setItem("pharos.sync.cacheOwner", "user-A");
    localStorage.setItem("pharos.sync.cursor:user-A", JSON.stringify("3"));
    const tomb = (entity: string, id: string) => ({ entity, entityId: id, payload: { id, projectId: "p1" }, revision: 2, deleted: true, hlc: "" });
    backend(async (d) => json({ accepted: d.length, conflicts: [] }), [{ docs: [tomb("project", "p1"), tomb("test_case", "c1")], cursor: 5, hasMore: false }]);
    web.enqueue("user-A", { entity: "project", entityId: "p1", op: "delete", payload: { id: "p1" }, revision: 2, author: "A", hlc: web.nextWebHlc() });
    await web.flushOutbox();
    await vi.waitFor(() => expect(cases()).toHaveLength(0));
    expect(JSON.parse(localStorage.getItem("pharos.projects") ?? "[]")).toHaveLength(0);
  });

  it("a delta refused as too large is flagged and does not block the others", async () => {
    const sent: string[] = [];
    backend(async (deltas) => {
      if (deltas.some((d) => d.entityId === "big")) return json({ code: "too_large" }, 413);
      sent.push(...deltas.map((d) => d.entityId));
      return json({ accepted: deltas.length, conflicts: [] });
    });
    for (const id of ["a", "big", "b"])
      web.enqueue("user-A", { entity: "test_case", entityId: id, op: "upsert", payload: { id }, revision: 1, author: "A", hlc: web.nextWebHlc() });
    const res = await web.flushOutbox();
    expect(res).toEqual({ pushed: 2, conflicts: 0, skipped: 1 });
    expect(sent.sort()).toEqual(["a", "b"]);
    const left = web.loadOutbox("user-A");
    expect(left.map((d) => [d.entityId, d.refused])).toEqual([["big", true]]);
    // Not resent on the next flush until it is edited again.
    await web.flushOutbox();
    expect(sent).toHaveLength(2);
  });

  it("a key another document already uses is flagged and kept, not dropped (DAT-01)", async () => {
    backend(async (deltas) =>
      json({
        accepted: deltas.length - 1,
        conflicts: [],
        keyConflicts: [{ entity: "test_case", entityId: "dup", key: "ATS_001", takenBy: "x" }],
      }),
    );
    for (const id of ["ok", "dup"])
      web.enqueue("user-A", { entity: "test_case", entityId: id, op: "upsert", payload: { id }, revision: 1, author: "A", hlc: web.nextWebHlc() });
    const res = await web.flushOutbox();
    expect(res).toEqual({ pushed: 1, conflicts: 0, skipped: 1 });
    expect(web.loadOutbox("user-A").map((d) => [d.entityId, d.refused])).toEqual([["dup", true]]);
  });

  it("an unsupported version stops the flush without scheduling retries", async () => {
    vi.useFakeTimers();
    try {
      const fetch = backend(async () => json({ code: "unsupported_client_version" }, 426));
      web.enqueue("user-A", { entity: "test_case", entityId: "c1", op: "upsert", payload: {}, revision: 1, author: "A", hlc: "h" });
      await expect(web.flushOutbox()).rejects.toMatchObject({ status: 426 });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(web.webLocalState("user-A").pending).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("writes queued during a flush are sent in the same flush", async () => {
    const sent: string[] = [];
    backend(async (deltas) => {
      sent.push(...deltas.map((d) => d.entityId));
      if (sent.length === 1)
        web.enqueue("user-A", { entity: "test_case", entityId: "late", op: "upsert", payload: {}, revision: 1, author: "A", hlc: web.nextWebHlc() });
      return json({ accepted: deltas.length, conflicts: [] });
    });
    web.enqueue("user-A", { entity: "test_case", entityId: "first", op: "upsert", payload: {}, revision: 1, author: "A", hlc: web.nextWebHlc() });
    await web.flushOutbox();
    expect(sent).toEqual(["first", "late"]);
    expect(web.webLocalState("user-A").pending).toBe(0);
  });

  it("caches belong to one account: emptied when another account syncs and on sign-out (FIX-07)", async () => {
    localStorage.setItem("pharos.projects", JSON.stringify([{ id: "pa", ownerId: "user-A" }]));
    localStorage.setItem("pharos.sync.cacheOwner", "user-A");
    session.userId = "user-B";
    backend(async () => json({}), [{ docs: [{ entity: "project", entityId: "pb", payload: { id: "pb", ownerId: "user-B" }, revision: 1, deleted: false, hlc: "" }], cursor: 2, hasMore: false }]);
    await web.hydrateFromBackend();
    expect(JSON.parse(localStorage.getItem("pharos.projects") ?? "[]")).toEqual([{ id: "pb", ownerId: "user-B" }]);

    window.dispatchEvent(new CustomEvent("pharos:signed-out"));
    expect(localStorage.getItem("pharos.projects")).toBeNull();
  });

  it("rows written before this version that never reached the server are queued, not lost", async () => {
    localStorage.setItem("pharos.projects", JSON.stringify([{ id: "p1", ownerId: "user-A" }, { id: "px", ownerId: "someone-else" }]));
    localStorage.setItem("pharos.testCases", JSON.stringify([{ id: "c-unsent", projectId: "p1", revision: 3 }, { id: "c-synced", projectId: "p1" }]));
    const sent: string[] = [];
    backend(
      async (deltas) => {
        sent.push(...deltas.map((d) => d.entityId));
        return json({ accepted: deltas.length, conflicts: [] });
      },
      [{ docs: [{ entity: "project", entityId: "p1", payload: { id: "p1", ownerId: "user-A" }, revision: 1, deleted: false, hlc: "" }, { entity: "test_case", entityId: "c-synced", payload: { id: "c-synced", projectId: "p1" }, revision: 1, deleted: false, hlc: "" }], cursor: 2, hasMore: false }],
    );
    await web.hydrateFromBackend();
    await vi.waitFor(() => expect(sent).toEqual(["c-unsent"]));
  });
});
