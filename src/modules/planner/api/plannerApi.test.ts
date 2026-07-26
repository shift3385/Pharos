import { describe, it, expect, beforeEach } from "vitest";
import { plannerApi } from "./plannerApi";
import type { PlannerCardInput } from "../model/types";

function card(projectId: string, ownerId: string, title: string): PlannerCardInput {
  return { projectId, ownerId, kind: "task", title, data: {} };
}

describe("plannerApi browser fallback", () => {
  beforeEach(() => localStorage.clear());

  it("creates cards appended per column and scoped to project + owner", async () => {
    const a = await plannerApi.create(card("p1", "u1", "A"));
    const b = await plannerApi.create(card("p1", "u1", "B"));
    await plannerApi.create(card("p2", "u1", "C"));
    expect(a?.position).toBe(0);
    expect(b?.position).toBe(1);
    const p1 = await plannerApi.list("p1", "u1");
    expect(p1.map((c) => c.title)).toEqual(["A", "B"]);
    // Another user sees nothing.
    expect(await plannerApi.list("p1", "u2")).toHaveLength(0);
  });

  it("reorder moves a card to another column", async () => {
    const a = await plannerApi.create(card("p1", "u1", "A"));
    await plannerApi.reorder("u1", "in_progress", [a!.id]);
    const cards = await plannerApi.list("p1", "u1");
    expect(cards[0].status).toBe("in_progress");
    expect(cards[0].position).toBe(0);
  });

  it("stores and reads back an attachment", async () => {
    const a = await plannerApi.create(card("p1", "u1", "Bug"));
    await plannerApi.attachmentAdd(a!.id, "u1", "log.txt", "text/plain", btoa("hello"));
    const list = await plannerApi.attachmentList(a!.id);
    expect(list).toHaveLength(1);
    const data = await plannerApi.attachmentGet(list[0].id);
    expect(data?.name).toBe("log.txt");
    expect(atob(data!.dataBase64)).toBe("hello");
  });
});
