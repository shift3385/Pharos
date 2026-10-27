import { describe, expect, it } from "vitest";
import { idTokens, matchKey, proposeMigration } from "./migration";

describe("idTokens", () => {
  it("extracts ID-like tokens and ignores prose", () => {
    expect(idTokens("Ver REQ-1, US-12; historia 7 (JIRA:PRJ-7). REQ-1")).toEqual(["REQ-1", "US-12", "JIRA:PRJ-7"]);
    expect(idTokens("sin referencias")).toEqual([]);
  });
});

describe("matchKey", () => {
  it("matches exactly or by prefix + number", () => {
    const keys = ["REQ-001", "US-12"];
    expect(matchKey("req-001", keys)).toBe("REQ-001");
    expect(matchKey("REQ-1", keys)).toBe("REQ-001");
    expect(matchKey("US-012", keys)).toBe("US-12");
    expect(matchKey("REQ-2", keys)).toBeUndefined();
  });
});

describe("proposeMigration", () => {
  it("proposes links to existing keys and new requirements for unknown ones", () => {
    const proposals = proposeMigration(
      [
        { id: "a", scenarioId: "TC-001", traceability: "REQ-1, US-12", requirementKeys: [] },
        { id: "b", scenarioId: "TC-002", traceability: "REQ-001 TC-002", requirementKeys: ["REQ-001"] },
        { id: "c", scenarioId: "TC-003", traceability: "", requirementKeys: [] },
      ],
      ["REQ-001"],
    );
    expect(proposals).toEqual([
      { caseId: "a", scenarioId: "TC-001", token: "REQ-1", requirementKey: "REQ-001", createsRequirement: false },
      { caseId: "a", scenarioId: "TC-001", token: "US-12", requirementKey: "US-12", createsRequirement: true },
    ]);
  });
});
