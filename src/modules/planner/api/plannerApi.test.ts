// BASE-10: on the web the planner store is a client of the server's domain API and keeps
// nothing in localStorage; on the desktop the same calls go to the Rust core.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServer } from "@test/server";
import { DesktopOnlyError } from "@shared/platform";
import { plannerApi } from "./plannerApi";

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

const input = { projectId: "p1", ownerId: "u1", kind: "defect" as const, title: "Bug", data: {} };

describe("plannerApi", () => {
  it("web: /api/planner-cards and reorder", async () => {
    const server = fakeServer();
    await plannerApi.list("p1", "u1");
    await plannerApi.create(input);
    await plannerApi.update("k1", input);
    await plannerApi.reorder("u1", "done", ["k1", "k2"]);
    await plannerApi.remove("k1", "u1");
    expect(server.calls()).toEqual([
      "GET /api/planner-cards?projectId=p1",
      "POST /api/planner-cards",
      "PUT /api/planner-cards/k1",
      "POST /api/planner-cards/reorder",
      "DELETE /api/planner-cards/k1",
    ]);
    expect(server.body(3)).toEqual({ status: "done", ids: ["k1", "k2"] });
  });

  it("web: attachments stay on the desktop (SYNC-04b)", async () => {
    const server = fakeServer();
    expect(await plannerApi.attachmentList("k1", "u1")).toEqual([]);
    expect(await plannerApi.attachmentGet("a1", "u1")).toBeNull();
    await expect(plannerApi.attachmentAdd("k1", "u1", "a.txt", null, "AA==")).rejects.toBeInstanceOf(DesktopOnlyError);
    await expect(plannerApi.attachmentDelete("a1", "u1")).rejects.toBeInstanceOf(DesktopOnlyError);
    expect(server.calls()).toEqual([]);
    expect(Object.keys(localStorage)).toEqual(["pharos.session"]);
  });

  it("desktop: attachments in the Rust core", async () => {
    onDesktop();
    await plannerApi.attachmentList("k1", "u1");
    expect(invoke).toHaveBeenCalledWith("planner_attachment_list", { cardId: "k1", ownerId: "u1" });
  });
});
