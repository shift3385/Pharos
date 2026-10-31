import { describe, expect, it } from "vitest";
import { caseDocDefinition } from "./casePdf";
import type { ExportableCase } from "./caseXlsx";
import { stepsOf } from "../model/steps";

// Steps and Outline rows carry stable ids (DAT-02).
const st = (...list: string[]) => stepsOf(list);

const t = (k: string) => k; // identity translator

const basic: ExportableCase = {
  scenarioId: "ATS_001",
  title: "Successful login",
  version: "1.0",
  priority: "High",
  status: "Ready",
  author: "Grace Hopper",
  level: "basic",
  gherkin: "Feature: Login\n  Scenario: OK\n    Given a user",
  data: {
    mappedUseCase: "UC-1",
    caseDate: "2026-08-01",
    description: "Logs in with valid credentials.",
    preconditions: st("User exists"),
    steps: st("Open login", "Submit form"),
    expectedResult: "Dashboard shown",
    postconditions: ["Session open"],
    acceptanceCriteria: ["No errors"],
    testData: "user@test.dev",
    notes: "Smoke.",
    traceability: "REQ-1",
  },
};

const advanced: ExportableCase = {
  scenarioId: "ATS_009",
  title: "Coupon flows",
  version: "2.0",
  priority: "Medium",
  status: "Draft",
  author: "Alan Turing",
  level: "advanced",
  gherkin: "Feature: Coupon",
  altFlowLabel: "ALTERNATIVE FLOW",
  examplesLabel: "EXAMPLES",
  background: st("Store is open"),
  flows: [
    {
      id: "f1",
      name: "Main",
      preconditions: st("Valid coupon"),
      steps: st("Apply coupon"),
      expectedResult: "Discount applied",
    },
    {
      id: "f2",
      name: "Expired coupon",
      preconditions: st("Coupon expired"),
      steps: st("Apply coupon"),
      expectedResult: "Rejected",
    },
  ],
  data: {},
};

describe("caseDocDefinition", () => {
  it("builds a valid document for a basic case with all body fields", () => {
    const dd = caseDocDefinition(basic, t);
    expect(Array.isArray(dd.content)).toBe(true);
    const json = JSON.stringify(dd);
    for (const s of ["Successful login", "ATS_001", "Grace Hopper", "Logs in with valid credentials.", "Open login", "Dashboard shown", "user@test.dev"]) {
      expect(json).toContain(s);
    }
    // gherkin section rendered
    expect(json).toContain("Scenario: OK");
  });

  it("renders the main flow plus one block per alternative flow for advanced", () => {
    const json = JSON.stringify(caseDocDefinition(advanced, t));
    expect(json).toContain("Store is open"); // background folded into preconditions
    expect(json).toContain("Discount applied"); // main flow expected result
    expect(json).toContain("Expired coupon"); // alt-flow block header
    expect(json).toContain("Rejected"); // alt-flow expected result
  });
});
