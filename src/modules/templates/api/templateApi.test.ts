import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { templateApi } from "./templateApi";
import type { TemplateSeedItem } from "../model/types";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: unknown[]) => invoke(...a),
}));

const U = "user-a";

const seedItem: TemplateSeedItem = {
  id: "builtin-plan-es",
  kind: "plan",
  language: "es",
  name: "PHAROS · Plan (ES)",
  dataBase64: "AAAA",
};

describe("templateApi browser fallback", () => {
  beforeEach(() => localStorage.clear());

  it("seeds built-ins idempotently", async () => {
    await templateApi.seed([seedItem]);
    await templateApi.seed([seedItem]); // second seed is a no-op
    const list = await templateApi.list(U);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "builtin-plan-es", isBuiltin: true });
  });

  it("creates, reads and updates a custom template", async () => {
    const created = await templateApi.create(
      {
        kind: "case",
        language: "en",
        name: "My case template",
        dataBase64: "QkJCQg==",
      },
      U,
    );
    expect(created?.isBuiltin).toBe(false);
    const full = await templateApi.get(created!.id, U);
    expect(full?.dataBase64).toBe("QkJCQg==");

    await templateApi.update(
      created!.id,
      { name: "Renamed", version: "2.0" },
      U,
    );
    const list = await templateApi.list(U);
    expect(list.find((t) => t.id === created!.id)).toMatchObject({
      name: "Renamed",
      version: "2.0",
    });
  });

  it("refuses to delete a built-in but removes custom ones", async () => {
    await templateApi.seed([seedItem]);
    await expect(templateApi.remove("builtin-plan-es", U)).rejects.toThrow();

    const custom = await templateApi.create(
      {
        kind: "plan",
        language: "es",
        name: "Custom",
        dataBase64: "AAAA",
      },
      U,
    );
    await templateApi.remove(custom!.id, U);
    expect(await templateApi.get(custom!.id, U)).toBeNull();
  });
});

describe("templateApi on the desktop", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invoke.mockReset();
    invoke.mockResolvedValue(null);
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("sends the signed-in user with every command (FIX-08b)", async () => {
    await templateApi.list(U);
    await templateApi.get("t1", U);
    await templateApi.create(
      { kind: "case", language: "es", name: "n", dataBase64: "AAAA" },
      U,
    );
    await templateApi.update("t1", { name: "n" }, U);
    await templateApi.remove("t1", U);
    expect(
      invoke.mock.calls.map(([cmd, args]) => [
        cmd,
        (args as { userId: string }).userId,
      ]),
    ).toEqual([
      ["template_list", U],
      ["template_get", U],
      ["template_create", U],
      ["template_update", U],
      ["template_delete", U],
    ]);
  });
});
