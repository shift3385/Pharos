import { describe, expect, it, vi } from "vitest";
import { projectCoverage } from "./projectCoverage";

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

describe("projectCoverage", () => {
  it("is null without requirements", async () => {
    requirements.mockResolvedValue([]);
    cases.mockResolvedValue([tc("c1", [])]);
    expect(await projectCoverage("p1", "u1")).toBeNull();
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
    expect(await projectCoverage("p1", "u1")).toBe(0.5);
  });
});
