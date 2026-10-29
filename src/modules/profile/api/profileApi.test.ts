// BASE-10: on the web the profile is a client of the server's domain API and keeps
// nothing in localStorage; on the desktop the same calls go to the Rust core.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServer } from "@test/server";
import { profileApi } from "./profileApi";

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

const user = {
  id: "u1",
  displayName: "Ana",
  firstName: "Ana",
  lastName: "Perez",
  role: "test_manager",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-29T00:00:00.000Z",
};

describe("profileApi", () => {
  it("web: the account on the server; the role is never sent", async () => {
    const server = fakeServer(user);
    expect(await profileApi.get()).toMatchObject({ id: "u1", displayName: "Ana", updatedAt: user.updatedAt });
    await profileApi.upsert({ displayName: "A", firstName: "A", lastName: "B", role: "admin" });
    expect(server.calls()).toEqual(["GET /auth/me", "PATCH /auth/me"]);
    expect(server.body(1)).toEqual({ displayName: "A", firstName: "A", lastName: "B" });
  });

  it("desktop: the local store", async () => {
    onDesktop();
    invoke.mockResolvedValue(null);
    expect(await profileApi.get()).toBeNull();
    expect(invoke).toHaveBeenCalledWith("profile_get", undefined);
  });
});
