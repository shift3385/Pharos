import { describe, it, expect, beforeEach } from "vitest";
import { testCaseApi } from "./testCaseApi";
import type { TestCaseInput } from "../model/types";

function make(projectId: string, prefix: string, title: string): TestCaseInput {
  return {
    projectId,
    caseIdPrefix: prefix,
    caseIdDigits: 3,
    title,
    author: "Ada",
    data: {},
  };
}

describe("testCaseApi browser numbering (mirrors the Rust store)", () => {
  beforeEach(() => localStorage.clear());

  it("numbers sequentially per project with the project's prefix", async () => {
    const a1 = await testCaseApi.create(make("p1", "FT", "A"));
    const a2 = await testCaseApi.create(make("p1", "FT", "B"));
    const b1 = await testCaseApi.create(make("p2", "TC-", "C"));
    expect(a1?.scenarioId).toBe("FT001");
    expect(a2?.scenarioId).toBe("FT002");
    // Second project numbers independently, from 1, with its own prefix.
    expect(b1?.scenarioId).toBe("TC-001");
  });

  it("restarts at 1 for an empty project after deletion", async () => {
    const c = await testCaseApi.create(make("p1", "ATS_", "only"));
    expect(c?.scenarioId).toBe("ATS_001");
    await testCaseApi.remove(c!.id);
    const again = await testCaseApi.create(make("p1", "ATS_", "new"));
    expect(again?.scenarioId).toBe("ATS_001");
  });

  it("lists only the cases of the requested project", async () => {
    await testCaseApi.create(make("p1", "ATS_", "A"));
    await testCaseApi.create(make("p2", "ATS_", "B"));
    const p1 = await testCaseApi.list("p1");
    expect(p1).toHaveLength(1);
    expect(p1[0].title).toBe("A");
  });
});
