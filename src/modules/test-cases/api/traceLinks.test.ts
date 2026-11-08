import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectTraceableCases } from "./traceLinks";
import { testCaseApi } from "./testCaseApi";

vi.mock("./testCaseApi", () => ({ testCaseApi: { list: vi.fn(), get: vi.fn() } }));

const summary = (id: string, requirementKeys: string[], traceability = "") => ({
  id,
  scenarioId: id.toUpperCase(),
  title: `Caso ${id}`,
  status: "approved",
  requirementKeys,
  traceability,
});

describe("projectTraceableCases", () => {
  beforeEach(() => {
    vi.mocked(testCaseApi.list).mockReset();
    vi.mocked(testCaseApi.get).mockReset();
  });

  it("takes the links from one list read, without opening each case (FIX-20)", async () => {
    vi.mocked(testCaseApi.list).mockResolvedValue([
      summary("c1", ["REQ-1", "REQ-2"]),
      summary("c2", [], "US-12"),
    ] as never);

    expect(await projectTraceableCases("p1", "u1")).toEqual([
      { id: "c1", scenarioId: "C1", title: "Caso c1", status: "approved", requirementKeys: ["REQ-1", "REQ-2"], traceability: "" },
      { id: "c2", scenarioId: "C2", title: "Caso c2", status: "approved", requirementKeys: [], traceability: "US-12" },
    ]);
    expect(testCaseApi.list).toHaveBeenCalledTimes(1);
    expect(testCaseApi.list).toHaveBeenCalledWith("p1", "u1");
    expect(testCaseApi.get).not.toHaveBeenCalled();
  });
});
