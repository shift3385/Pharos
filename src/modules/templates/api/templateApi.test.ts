import { beforeEach, describe, expect, it } from "vitest";
import { templateApi } from "./templateApi";
import type { TemplateSeedItem } from "../model/types";

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
    const list = await templateApi.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "builtin-plan-es", isBuiltin: true });
  });

  it("creates, reads and updates a custom template", async () => {
    const created = await templateApi.create({
      kind: "case",
      language: "en",
      name: "My case template",
      dataBase64: "QkJCQg==",
    });
    expect(created?.isBuiltin).toBe(false);
    const full = await templateApi.get(created!.id);
    expect(full?.dataBase64).toBe("QkJCQg==");

    await templateApi.update(created!.id, { name: "Renamed", version: "2.0" });
    const list = await templateApi.list();
    expect(list.find((t) => t.id === created!.id)).toMatchObject({
      name: "Renamed",
      version: "2.0",
    });
  });

  it("refuses to delete a built-in but removes custom ones", async () => {
    await templateApi.seed([seedItem]);
    await expect(templateApi.remove("builtin-plan-es")).rejects.toThrow();

    const custom = await templateApi.create({
      kind: "plan",
      language: "es",
      name: "Custom",
      dataBase64: "AAAA",
    });
    await templateApi.remove(custom!.id);
    expect(await templateApi.get(custom!.id)).toBeNull();
  });
});
