import { describe, expect, it } from "vitest";
import { isStepComplete, methodologyGaps } from "./steps";
import type { FormState } from "./formState";

const agile = { methodologyType: "agile" as const, sprintWeeks: 2, ceremonies: ["daily"], phases: [] };

describe("step 6 · methodology (FIX-14)", () => {
  it("agile needs the sprint length and one ceremony; frequencies always have a default", () => {
    expect(methodologyGaps(agile)).toEqual([]);
    expect(methodologyGaps({ ...agile, ceremonies: [] })).toEqual(["ceremonies"]);
    expect(methodologyGaps({ ...agile, sprintWeeks: 0, ceremonies: [] })).toEqual(["sprintWeeks", "ceremonies"]);
  });

  it("traditional needs one phase with text", () => {
    const traditional = { ...agile, methodologyType: "traditional" as const };
    expect(methodologyGaps({ ...traditional, phases: ["  "] })).toEqual(["phases"]);
    expect(methodologyGaps({ ...traditional, phases: ["Diseño"] })).toEqual([]);
  });

  it("the ✓ is the absence of gaps", () => {
    expect(isStepComplete("methodology", agile as unknown as FormState)).toBe(true);
    expect(isStepComplete("methodology", { ...agile, ceremonies: [] } as unknown as FormState)).toBe(false);
  });
});
