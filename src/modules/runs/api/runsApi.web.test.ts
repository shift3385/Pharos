// The runs API on the web (EJE-06): every call goes to the server's runs API,
// the execution draft is this browser's with the desktop's rules (one
// attempt id per target; a stale draft is refused; recording needs the draft
// of that attempt and drops it after), and files stay on the desktop.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopOnlyError } from "@shared/platform";
import { cycleApi } from "@modules/cycles";
import { runsApi } from "./runsApi";

let A1 = "";
let A2 = "";

const overview = {
  run: { id: "r1", runKey: "RUN-001", revision: 1 },
  items: [
    { item: { id: "i1", runId: "r1" }, hasDraft: false },
    { item: { id: "i2", runId: "r1" }, hasDraft: false },
  ],
  counts: {},
};
let detailResults: { id: string }[] = [];

/** A fake server by path; records `METHOD /path` and the bodies. */
function server(over: Record<string, (body: unknown) => unknown> = {}) {
  localStorage.setItem("pharos.session", JSON.stringify({ accessToken: "tok", refreshToken: "r", user: { id: "u1" } }));
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const routes: Record<string, (body: unknown) => unknown> = {
    "GET /api/runs/r1/overview": () => overview,
    "GET /api/run-items/i1": () => ({ item: { id: "i1", runId: "r1" }, results: detailResults, draft: null, attachments: [] }),
    "POST /api/results": (b) => ({ id: (b as { input: { attemptId: string } }).input.attemptId }),
    "POST /api/runs/r1/close": () => ({ id: "r1", status: "aborted", revision: 2 }),
    ...over,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const key = `${init.method} ${String(url).replace(/^https?:\/\/[^/]+/, "")}`;
      calls.push(key);
      const body = init.body ? JSON.parse(init.body as string) : undefined;
      bodies.push(body);
      const route = routes[key];
      return new Response(JSON.stringify(route ? route(body) : []), { status: 200 });
    }),
  );
  return { calls, bodies };
}

beforeEach(() => {
  localStorage.clear();
  detailResults = [];
  // Fresh attempt ids: the page remembers recorded ones for its lifetime.
  A1 = crypto.randomUUID();
  A2 = crypto.randomUUID();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const record = (attemptId: string, extra: Record<string, unknown> = {}) =>
  runsApi.record({ runItemId: "i1", status: "passed", userId: "u1", attemptId, ...extra } as never);

describe("runsApi on the web", () => {
  it("reads and writes runs through the server", async () => {
    const s = server();
    await runsApi.list("p 1", "u1");
    await runsApi.counts("p1", "u1");
    await runsApi.results("r1", "u1");
    await runsApi.configurations("p1", "u1");
    await runsApi.createManual({ projectId: "p1", title: "M", userId: "u1" } as never, [{ testCaseId: "c1" } as never]);
    await runsApi.addItems("r1", "u1", [{ testCaseId: "c2" } as never]);
    await runsApi.overview("r1", "u1");
    await runsApi.update("r1", { status: "in_progress", userId: "u1" } as never);
    await cycleApi.execute("cy1", { userId: "u1" } as never);
    expect(s.calls).toEqual([
      "GET /api/runs?projectId=p%201",
      "GET /api/runs/counts?projectId=p1",
      "GET /api/runs/r1/results",
      "GET /api/configurations?projectId=p1",
      "POST /api/runs",
      "POST /api/runs/r1/items",
      "GET /api/runs/r1/overview",
      "PUT /api/runs/r1",
      "POST /api/cycles/cy1/execute",
    ]);
    expect(s.bodies[4]).toMatchObject({ input: { projectId: "p1", title: "M" }, items: [{ testCaseId: "c1" }] });
    expect(s.bodies[7]).toMatchObject({ input: { status: "in_progress" } });
  });

  it("keeps the draft in this browser and shows it in the run and the item", async () => {
    server();
    await runsApi.overview("r1", "u1");
    await runsApi.draftSave("i1", "-/-", { attemptId: A1, notes: "x" }, "u1");
    const o = await runsApi.overview("r1", "u1");
    expect(o?.items.map((i) => i.hasDraft)).toEqual([true, false]);
    const d = await runsApi.itemDetail("i1", "u1");
    expect(d?.draft?.targets).toEqual({ "-/-": { attemptId: A1, notes: "x" } });
    expect(d?.draft?.attachments).toEqual([]);
    // Another account in this browser does not see it.
    expect((await runsApi.overview("r1", "u2"))?.items[0].hasDraft).toBe(false);
  });

  it("refuses another tab's attempt for the same target, and a recorded one", async () => {
    server();
    await runsApi.itemDetail("i1", "u1");
    await runsApi.draftSave("i1", "-/-", { attemptId: A1 }, "u1");
    await expect(runsApi.draftSave("i1", "-/-", { attemptId: A2 }, "u1")).rejects.toThrow(/^draft-stale/);
    // Upper case and braces are the same attempt.
    await runsApi.draftSave("i1", "-/-", { attemptId: `{${A1.toUpperCase()}}`, notes: "y" }, "u1");
    await record(A1);
    // Recorded: the target left the draft, and the attempt cannot come back.
    expect((await runsApi.itemDetail("i1", "u1"))?.draft).toBeNull();
    await expect(runsApi.draftSave("i1", "-/-", { attemptId: A1 }, "u1")).rejects.toThrow(/already recorded/);
  });

  it("records only the attempt of a draft that is still here, once", async () => {
    const s = server();
    await runsApi.itemDetail("i1", "u1");
    await expect(record(A1)).rejects.toThrow(/^draft-stale: the draft of this attempt is gone/);
    await expect(record("nope")).rejects.toThrow(/^attempt-id-invalid/);
    expect(s.calls.filter((c) => c === "POST /api/results")).toHaveLength(0);
    await runsApi.draftSave("i1", "-/r1", { attemptId: A1 }, "u1");
    expect(await record(A1, { exampleRowId: "r1" })).toBe(A1);
    // A retry of a recorded attempt (its answer was lost) goes to the server,
    // which returns the same result.
    expect(await record(A1, { exampleRowId: "r1" })).toBe(A1);
    expect(s.calls.filter((c) => c === "POST /api/results")).toHaveLength(2);
    // What another tab recorded counts once the item is read again.
    detailResults = [{ id: A2 }];
    await runsApi.itemDetail("i1", "u1");
    await expect(runsApi.draftSave("i1", "-/-", { attemptId: A2 }, "u1")).rejects.toThrow(/already recorded/);
  });

  it("another tab's record makes this tab's draft of that attempt stale", async () => {
    server();
    await runsApi.itemDetail("i1", "u1");
    await runsApi.draftSave("i1", "-/-", { attemptId: A1 }, "u1");
    // What the other tab leaves behind once it recorded A1.
    localStorage.removeItem("pharos:exec-draft:u1:i1");
    localStorage.setItem("pharos:exec-recorded:u1", JSON.stringify([A1]));
    await expect(runsApi.draftSave("i1", "-/-", { attemptId: A1, notes: "late" }, "u1")).rejects.toThrow(
      /already recorded/,
    );
    expect((await runsApi.itemDetail("i1", "u1"))?.draft).toBeNull();
  });

  it("cancelling drops the run's drafts in this browser", async () => {
    server();
    await runsApi.overview("r1", "u1");
    await runsApi.draftSave("i1", "-/-", { attemptId: A1 }, "u1");
    await runsApi.draftSave("i2", "-/-", { attemptId: A2 }, "u1");
    await runsApi.close("r1", "completed", false, "u1");
    expect((await runsApi.overview("r1", "u1"))?.items.map((i) => i.hasDraft)).toEqual([true, true]);
    await runsApi.close("r1", "aborted", true, "u1");
    expect((await runsApi.overview("r1", "u1"))?.items.map((i) => i.hasDraft)).toEqual([false, false]);
  });

  it("says when the browser cannot keep the draft", async () => {
    server();
    await runsApi.overview("r1", "u1");
    const big = "x".repeat(1024 * 1024);
    await expect(runsApi.draftSave("i1", "-/-", { attemptId: A1, notes: big }, "u1")).rejects.toThrow(/^draft-too-large/);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    await expect(runsApi.draftSave("i1", "-/-", { attemptId: A1 }, "u1")).rejects.toThrow(/^draft-unavailable/);
    setItem.mockRestore();
    // The attempt is still recorded: only the draft could not be kept.
    expect(await record(A1)).toBe(A1);
  });

  it("files and imports stay on the desktop", async () => {
    server();
    const file = new Blob(["x"]);
    await expect(runsApi.attachToDraft("i1", "-/-", null, file, "a.png", "screenshot", "u1")).rejects.toBeInstanceOf(DesktopOnlyError);
    await expect(runsApi.importReport({} as never, file)).rejects.toBeInstanceOf(DesktopOnlyError);
    expect(await runsApi.unlinked("p1", "u1")).toEqual([]);
    expect(await runsApi.previewAttachment("a1", "u1")).toBeNull();
  });
});
