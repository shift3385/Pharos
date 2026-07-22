import { describe, it, expect } from "vitest";
import { toGherkin, fromGherkin } from "./gherkin";
import type { TestCaseData } from "../model/types";

const baseData: TestCaseData = {
  mappedUseCase: "",
  caseDate: "",
  description: "",
  preconditions: ["User is logged in", "Cart has one item"],
  steps: ["Open the cart", "Click checkout"],
  expectedResult: "Order is confirmed\nEmail is sent",
  postconditions: [],
  acceptanceCriteria: [],
  testData: "",
  notes: "",
  traceability: "",
  dataRequirements: "",
  environmentRequirements: "",
};

describe("gherkin mapper", () => {
  it("renders Feature/Scenario/Given/When/Then with And continuations", () => {
    const out = toGherkin("Checkout flow", baseData);
    expect(out).toContain("Feature: Checkout flow");
    expect(out).toContain("  Scenario: Checkout flow");
    expect(out).toContain("    Given User is logged in");
    expect(out).toContain("    And Cart has one item");
    expect(out).toContain("    When Open the cart");
    expect(out).toContain("    And Click checkout");
    expect(out).toContain("    Then Order is confirmed");
    expect(out).toContain("    And Email is sent");
  });

  it("round-trips structured fields through Gherkin", () => {
    const text = toGherkin("Checkout flow", baseData);
    const parsed = fromGherkin(text);
    expect(parsed.title).toBe("Checkout flow");
    expect(parsed.preconditions).toEqual(baseData.preconditions);
    expect(parsed.steps).toEqual(baseData.steps);
    expect(parsed.expectedResult).toBe(baseData.expectedResult);
  });

  it("ignores blank lines and skips empty entries", () => {
    const out = toGherkin("Empty", {
      ...baseData,
      preconditions: ["  ", "Real precondition"],
      steps: [],
      expectedResult: "",
    });
    expect(out).toContain("    Given Real precondition");
    expect(out).not.toContain("When");
    expect(out).not.toContain("Then");
  });

  it("falls back to Untitled when title is empty", () => {
    expect(toGherkin("", baseData)).toContain("Feature: Untitled");
  });
});
