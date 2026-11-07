import { describe, expect, it, vi } from "vitest";
import { projectTraceFacts } from "./projectTraceFacts";

const requirements = vi.fn();
const cases = vi.fn();
vi.mock("./requirementApi", () => ({ requirementApi: { list: (...a: unknown[]) => requirements(...a) } }));
vi.mock("@modules/test-cases", () => ({ projectTraceableCases: (...a: unknown[]) => cases(...a) }));

const req = (key: string) => ({ requirementKey: key, title: key, priority: "medium" });
const tc = (id: string, keys: string[], status = "approved") => ({
  id,
  scenarioId: id,
  title: id,
  status,
  requirementKeys: keys,
  traceability: "",
});

describe("projectTraceFacts", () => {
  it("has no coverage without requirements, but still counts the cases", async () => {
    requirements.mockResolvedValue([]);
    cases.mockResolvedValue([tc("c1", [])]);
    expect(await projectTraceFacts("p1", "u1")).toEqual({ cases: 1, coverage: null });
    expect(requirements).toHaveBeenCalledWith("p1", "u1");
    expect(cases).toHaveBeenCalledWith("p1", "u1");
  });

  it("counts a requirement as covered only by a case that is not obsolete", async () => {
    requirements.mockResolvedValue([req("REQ-1"), req("REQ-2"), req("REQ-3"), req("REQ-4")]);
    cases.mockResolvedValue([
      tc("c1", ["REQ-1"]),
      tc("c2", ["REQ-2", "REQ-9"]),
      tc("c3", ["REQ-3"], "obsolete"),
    ]);
    // Obsolete cases still count as cases: the list shows them.
    expect(await projectTraceFacts("p1", "u1")).toEqual({ cases: 3, coverage: 0.5 });
  });
});
