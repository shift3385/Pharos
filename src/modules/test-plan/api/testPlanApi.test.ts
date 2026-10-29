// BASE-10: on the web the test-plan store is a client of the server's domain API and keeps
// nothing in localStorage; on the desktop the same calls go to the Rust core.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServer } from "@test/server";
import type { TestPlanInput } from "../model/types";
import { testPlanApi } from "./testPlanApi";

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

const input = { projectId: "p1", title: "Plan", author: "QA", data: {}, userId: "u1" } as unknown as TestPlanInput;

describe("testPlanApi", () => {
  it("web: /api/test-plans; no revision history (desktop-only)", async () => {
    const server = fakeServer();
    await testPlanApi.list("u1");
    await testPlanApi.byProject("p1", "u1");
    await testPlanApi.create(input);
    await testPlanApi.update("t1", input);
    await testPlanApi.remove("t1", "u1");
    expect(await testPlanApi.revisions("t1", "u1")).toEqual([]);
    expect(await testPlanApi.revisionDetail("r1", "u1")).toBeNull();
    expect(server.calls()).toEqual([
      "GET /api/test-plans",
      "GET /api/test-plans?projectId=p1",
      "POST /api/test-plans",
      "PUT /api/test-plans/t1",
      "DELETE /api/test-plans/t1",
    ]);
  });

  it("desktop: revision history from the Rust core", async () => {
    onDesktop();
    await testPlanApi.revisions("t1", "u1");
    expect(invoke).toHaveBeenCalledWith("test_plan_revisions", { id: "t1", userId: "u1" });
  });
});
