import { describe, expect, it, vi } from "vitest";
import { projectLiveCases } from "./batch";

// The Home queue (RED-V1) lists the cases that are not obsolete.
vi.mock("../api/testCaseApi", () => ({
  testCaseApi: {
    list: async () => [
      { id: "a", scenarioId: "PCL-0001", title: "A", status: "approved", priority: "high" },
      { id: "b", scenarioId: "PCL-0002", title: "B", status: "obsolete", priority: "low" },
      { id: "c", scenarioId: "PCL-0003", title: "C", status: "draft", priority: "critical" },
    ],
  },
}));

describe("live cases for the Home (RED-V1)", () => {
  it("leaves the obsolete cases out", async () => {
    expect((await projectLiveCases("p1", "u1")).map((c) => c.id)).toEqual(["a", "c"]);
  });
});
