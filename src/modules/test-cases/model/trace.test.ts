// The «Trazabilidad» text of a case and its reverse on import (FIX-42): a
// case exported to .xlsx and imported again keeps its requirement links.
import { describe, expect, it } from "vitest";
import { linkTracedRequirements, traceabilityText } from "./trace";
import type { TestCaseData } from "./types";

const data = (over: Partial<TestCaseData>) => over as TestCaseData;

describe("linkTracedRequirements", () => {
  it("round-trips the exported text: keys of the project become links again", () => {
    const exported = traceabilityText(data({ requirementKeys: ["REQ-001", "REQ-004"], traceability: "Historia US-12" }));
    expect(exported).toBe("REQ-001, REQ-004 · Historia US-12");
    const back = linkTracedRequirements(data({ traceability: exported }), ["REQ-001", "REQ-002", "REQ-004"]);
    expect(back.requirementKeys).toEqual(["REQ-001", "REQ-004"]);
    expect(back.traceability).toBe("Historia US-12");
  });

  it("links a key written in another case and keeps what is not a requirement", () => {
    const back = linkTracedRequirements(data({ traceability: "req-001, REQ-999" }), ["REQ-001"]);
    expect(back.requirementKeys).toEqual(["REQ-001"]);
    expect(back.traceability).toBe("REQ-999");
  });

  it("leaves the case alone when nothing matches", () => {
    const d = data({ traceability: "REQ-001 del login", requirementKeys: [] });
    expect(linkTracedRequirements(d, ["REQ-001"])).toBe(d);
    expect(linkTracedRequirements(d, [])).toBe(d);
  });

  it("does not link a key twice", () => {
    const back = linkTracedRequirements(data({ traceability: "REQ-001", requirementKeys: ["REQ-002"] }), ["REQ-001", "REQ-002"]);
    expect(back.requirementKeys).toEqual(["REQ-002", "REQ-001"]);
    expect(back.traceability).toBe("");
  });
});
