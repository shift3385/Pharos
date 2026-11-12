import { describe, expect, it } from "vitest";
import { editableStatuses, latestVerdict, verdictTone } from "./types";

describe("a cycle's closing (DOC-02)", () => {
  it("only offers «Cerrado» in the edit dialog to a closed cycle, to reopen it (D5)", () => {
    expect(editableStatuses("planned")).toEqual(["planned", "active"]);
    expect(editableStatuses("active")).toEqual(["planned", "active"]);
    expect(editableStatuses("closed")).toEqual(["planned", "active", "closed"]);
  });

  it("reads the verdict of the latest closing", () => {
    expect(latestVerdict({ data: {} })).toBeNull();
    expect(latestVerdict({ data: { closures: [{ verdict: "noGo" }, { verdict: "goWithRisks" }] } })).toBe("goWithRisks");
    expect(latestVerdict({ data: { closures: [{ verdict: "maybe" }] } })).toBeNull();
    expect([verdictTone("go"), verdictTone("goWithRisks"), verdictTone("noGo"), verdictTone(null)]).toEqual([
      "success",
      "warning",
      "error",
      "neutral",
    ]);
  });
});
