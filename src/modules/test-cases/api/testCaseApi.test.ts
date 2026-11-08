// BASE-10: on the web the test-case store is a client of the server's domain API and keeps
// nothing in localStorage; on the desktop the same calls go to the Rust core.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServer } from "@test/server";
import { CASES_CHANGED_EVENT } from "../model/events";
import { testCaseApi } from "./testCaseApi";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

/** A signed-in desktop with its reserve of key numbers left (`key_lease_for`
 *  asks for nothing, DAT-04). */
const session = JSON.stringify({ accessToken: "t", refreshToken: "r", user: { id: "u1", email: "qa@pharos.dev" } });
const desktopAnswer = async (cmd: string) =>
  cmd === "session_load" ? session : cmd === "key_lease_for" ? null : [];

function onDesktop() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invoke.mockReset();
  invoke.mockImplementation(desktopAnswer);
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

  it("desktop: asks for a key number before an auto-numbered case, not for a typed key (DAT-04)", async () => {
    onDesktop();
    await testCaseApi.create(input);
    const order = invoke.mock.calls.map((c) => c[0]);
    expect(order.indexOf("key_lease_for")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("key_lease_for")).toBeLessThan(order.indexOf("test_case_create"));
    expect(invoke).toHaveBeenCalledWith("key_lease_for", expect.objectContaining({ projectId: "p1", kind: "case", count: 1 }));

    invoke.mockClear();
    await testCaseApi.create({ ...input, scenarioId: "ATS_900" });
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(["test_case_create"]);
  });

  it("announces a created or deleted case, not an edit or a failure (FIX-13)", async () => {
    onDesktop();
    const heard = vi.fn();
    window.addEventListener(CASES_CHANGED_EVENT, heard);
    try {
      invoke.mockImplementation(async (cmd: string) => {
        if (cmd === "test_case_create") throw new Error("offline");
        return desktopAnswer(cmd);
      });
      await expect(testCaseApi.create(input)).rejects.toThrow();
      expect(heard).not.toHaveBeenCalled();
      invoke.mockImplementation(desktopAnswer);
      await testCaseApi.create(input);
      await testCaseApi.update("c1", input);
      await testCaseApi.remove("c1", "u1");
      expect(heard).toHaveBeenCalledTimes(2);
      // A call of a batch stays quiet: the batch announces once at the end.
      await testCaseApi.create(input, { quiet: true });
      await testCaseApi.remove("c1", "u1", { quiet: true });
      expect(heard).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener(CASES_CHANGED_EVENT, heard);
    }
  });
});
