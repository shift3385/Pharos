import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { templateApi } from "./templateApi";
import type { TemplateSeedItem } from "../model/types";
import { DesktopOnlyError } from "@shared/platform";
import { TOAST_EVENT } from "@shared/ui/notify";

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

describe("templateApi on the web (BASE-10)", () => {
  it("holds the bundled built-ins in memory, not in localStorage", async () => {
    await templateApi.seed([seedItem]);
    await templateApi.seed([seedItem]); // seeding again replaces, never duplicates
    const list = await templateApi.list(U);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "builtin-plan-es", isBuiltin: true, isOwn: false });
    expect((await templateApi.get("builtin-plan-es", U))?.dataBase64).toBe("AAAA");
    expect(localStorage.length).toBe(0);
  });

  it("imports, edits and deletes only in the desktop app, with a notice", async () => {
    const toasts: string[] = [];
    const listen = (e: Event) => toasts.push((e as CustomEvent<{ message: string }>).detail.message);
    window.addEventListener(TOAST_EVENT, listen);
    const input = { kind: "case" as const, language: "en" as const, name: "Mine", dataBase64: "QkJCQg==" };
    await expect(templateApi.create(input, U)).rejects.toBeInstanceOf(DesktopOnlyError);
    await expect(templateApi.update("t1", { name: "n" }, U)).rejects.toBeInstanceOf(DesktopOnlyError);
    await expect(templateApi.remove("t1", U)).rejects.toBeInstanceOf(DesktopOnlyError);
    window.removeEventListener(TOAST_EVENT, listen);
    expect(toasts).toHaveLength(3);
    expect(invoke).not.toHaveBeenCalled();
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
