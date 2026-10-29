// BASE-10: on the web the requirement store is a client of the server's domain API and keeps
// nothing in localStorage; on the desktop the same calls go to the Rust core.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServer } from "@test/server";
import { requirementApi } from "./requirementApi";

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

const input = { projectId: "p1", title: "Pay", userId: "u1" };

describe("requirementApi", () => {
  it("web: /api/requirements, import by project", async () => {
    const server = fakeServer({ created: 1, updated: 0, skipped: [] });
    await requirementApi.list("p1", "u1");
    await requirementApi.get("r1", "u1");
    await requirementApi.create(input);
    await requirementApi.update("r1", input);
    await requirementApi.remove("r1", "u1");
    expect(await requirementApi.importRows("p1", "u1", [{ title: "R" }])).toEqual({ created: 1, updated: 0, skipped: [] });
    expect(server.calls()).toEqual([
      "GET /api/requirements?projectId=p1",
      "GET /api/requirements/r1",
      "POST /api/requirements",
      "PUT /api/requirements/r1",
      "DELETE /api/requirements/r1",
      "POST /api/requirements/import?projectId=p1",
    ]);
    expect(server.body(5)).toEqual({ rows: [{ title: "R" }] });
  });

  it("desktop: the Rust core", async () => {
    onDesktop();
    await requirementApi.importRows("p1", "u1", []);
    expect(invoke).toHaveBeenCalledWith("requirement_import", { projectId: "p1", userId: "u1", rows: [] });
  });
});
