// BASE-10: on the web the project store is a client of the server's domain API and keeps
// nothing in localStorage; on the desktop the same calls go to the Rust core.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServer } from "@test/server";
import { projectApi } from "./projectApi";

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

describe("projectApi", () => {
  it("web: reads and writes through /api/projects, from the revision last seen", async () => {
    const server = fakeServer({ id: "p 1", revision: 3 });
    await projectApi.list("u1");
    await projectApi.get("p 1", "u1");
    await projectApi.create({ name: "P", ownerId: "u1" });
    await projectApi.update("p 1", { name: "P2" });
    await projectApi.remove("p 1", "u1");
    expect(server.calls()).toEqual([
      "GET /api/projects",
      "GET /api/projects/p%201",
      "POST /api/projects",
      "PUT /api/projects/p%201",
      "DELETE /api/projects/p%201?revision=3",
    ]);
    expect(server.body(3)).toEqual({ input: { name: "P2" }, revision: 3 });
    expect(Object.keys(localStorage)).toEqual(["pharos.session"]);
  });

  it("desktop: the Rust core, never the server", async () => {
    const server = fakeServer();
    onDesktop();
    await projectApi.list("u1");
    expect(invoke).toHaveBeenCalledWith("project_list", { ownerId: "u1" });
    expect(server.calls()).toEqual([]);
  });
});
