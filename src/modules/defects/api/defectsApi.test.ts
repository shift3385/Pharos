// BASE-10: on the web the defects store is a client of the server's domain
// API; on the desktop the same calls go to the Rust core (DEF-01).

import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServer } from "@test/server";
import { DesktopOnlyError } from "@shared/platform";
import { defectsApi } from "./defectsApi";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

function onDesktop() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invoke.mockReset();
  invoke.mockResolvedValue([]);
}
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

const input = { projectId: "p1", userId: "u1", title: "Bug", data: {} };

describe("defectsApi", () => {
  it("web: /api/defects, transitions and links", async () => {
    const server = fakeServer();
    await defectsApi.list("p1", "u1");
    await defectsApi.create(input);
    await defectsApi.update("d1", input);
    await defectsApi.transition("d1", "u1", "closed", "fixed", "1.4.3");
    await defectsApi.link("d1", "u1", { targetKind: "test_case", targetId: "c1" }, true);
    await defectsApi.remove("d1", "u1");
    expect(server.calls()).toEqual([
      "GET /api/defects?projectId=p1",
      "POST /api/defects",
      "PUT /api/defects/d1",
      "POST /api/defects/d1/transition",
      "POST /api/defects/d1/links",
      "DELETE /api/defects/d1",
    ]);
    expect(server.body(3)).toEqual({ status: "closed", resolution: "fixed", fixedInBuild: "1.4.3" });
    expect(server.body(4)).toEqual({ target: { targetKind: "test_case", targetId: "c1" }, linked: true });
  });

  it("web: evidence stays on the desktop; «from a result» has no files (EJE-06)", async () => {
    const server = fakeServer();
    expect(await defectsApi.results("p1", "u1")).toEqual([]);
    expect(await defectsApi.attachmentList("d1", "u1")).toEqual([]);
    await expect(defectsApi.attachmentSave("a1", "u1")).rejects.toBeInstanceOf(DesktopOnlyError);
    await defectsApi.draftFromResult("r1", "u1");
    await defectsApi.draftFromResult("r 2", "u1", "s1");
    expect(server.calls()).toEqual([
      "GET /api/results/r1/defect-draft",
      "GET /api/results/r%202/defect-draft?stepId=s1",
    ]);
  });

  it("web: a defect from a result links that result (EJE-06)", async () => {
    const server = fakeServer();
    await defectsApi.create({ ...input, fromResult: { resultId: "res1", stepId: "s2" } });
    await defectsApi.create({ ...input, links: [{ targetKind: "result", targetId: "res1" }], fromResult: { resultId: "res1" } });
    await defectsApi.create({ ...input, links: [{ targetKind: "test_case", targetId: "c1" }], fromResult: { resultId: "res1" } });
    expect(server.body(0)).toEqual({ ...input, links: [{ targetKind: "result", targetId: "res1" }] });
    expect(server.body(1)).toEqual({ ...input, links: [{ targetKind: "result", targetId: "res1" }] });
    // The result first, as the desktop inserts it.
    expect(server.body(2)).toEqual({
      ...input,
      links: [
        { targetKind: "result", targetId: "res1" },
        { targetKind: "test_case", targetId: "c1" },
      ],
    });
  });

  it("desktop: the Rust commands", async () => {
    onDesktop();
    await defectsApi.list("p1", "u1");
    await defectsApi.transition("d1", "u1", "open");
    await defectsApi.draftFromResult("r1", "u1", "s1");
    await defectsApi.results("p1", "u1");
    expect(invoke.mock.calls.map((c) => c[0])).toEqual([
      "defect_list",
      "defect_transition",
      "defect_draft_from_result",
      "defect_result_list",
    ]);
    expect(invoke.mock.calls[2][1]).toEqual({ resultId: "r1", stepId: "s1", userId: "u1" });
  });
});
