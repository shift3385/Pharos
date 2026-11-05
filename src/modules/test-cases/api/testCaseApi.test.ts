// BASE-10: on the web the test-case store is a client of the server's domain API and keeps
// nothing in localStorage; on the desktop the same calls go to the Rust core.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServer } from "@test/server";
import { CASES_CHANGED_EVENT } from "../model/events";
import { testCaseApi } from "./testCaseApi";

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

const input = { projectId: "p1", title: "Login", author: "QA", data: {}, userId: "u1" };

describe("testCaseApi", () => {
  it("web: /api/test-cases; the server numbers the case; no revision history", async () => {
    const server = fakeServer({ id: "c1", revision: 2, scenarioId: "ATS_001" });
    await testCaseApi.list("p 1", "u1");
    expect((await testCaseApi.create(input))?.scenarioId).toBe("ATS_001");
    await testCaseApi.update("c1", input);
    await testCaseApi.get("c1", "u1");
    await testCaseApi.remove("c1", "u1");
    expect(await testCaseApi.revisions("c1", "u1")).toEqual([]);
    expect(server.calls()).toEqual([
      "GET /api/test-cases?projectId=p%201",
      "POST /api/test-cases",
      "PUT /api/test-cases/c1",
      "GET /api/test-cases/c1",
      "DELETE /api/test-cases/c1?revision=2",
    ]);
    expect(server.body(2)).toEqual({ input, revision: 2 });
  });

  it("desktop: the Rust core with the signed-in user (FIX-08)", async () => {
    onDesktop();
    await testCaseApi.list("p1", "u1");
    expect(invoke).toHaveBeenCalledWith("test_case_list", { projectId: "p1", userId: "u1" });
  });

  it("announces a created or deleted case, not an edit or a failure (FIX-13)", async () => {
    onDesktop();
    const heard = vi.fn();
    window.addEventListener(CASES_CHANGED_EVENT, heard);
    try {
      invoke.mockRejectedValueOnce(new Error("offline"));
      await expect(testCaseApi.create(input)).rejects.toThrow();
      expect(heard).not.toHaveBeenCalled();
      await testCaseApi.create(input);
      await testCaseApi.update("c1", input);
      await testCaseApi.remove("c1", "u1");
      expect(heard).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener(CASES_CHANGED_EVENT, heard);
    }
  });
});
