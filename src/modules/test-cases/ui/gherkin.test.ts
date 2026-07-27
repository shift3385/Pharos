import { describe, it, expect } from "vitest";
import {
  toGherkin,
  fromGherkin,
  summarizeFeature,
  detectLevel,
  placeholdersIn,
  extractComments,
  extractExamples,
  flowsToGherkin,
  parseFeatureFlows,
} from "./gherkin";
import type { Flow, TestCaseData } from "../model/types";

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

describe("gherkin mapper — Scenario Outline", () => {
  const outlineData: TestCaseData = {
    ...baseData,
    gherkinLevel: "outline",
    preconditions: ["el usuario tiene un producto en el carrito"],
    steps: ['ingresa el cupón "<cupon>" y presiona "Aplicar"'],
    expectedResult: 'el sistema muestra "<resultado>"',
    examples: {
      headers: ["cupon", "resultado"],
      rows: [
        ["DESC10", "Descuento aplicado"],
        ["VERANO23", "Cupón ha expirado"],
      ],
    },
  };

  it("renders Scenario Outline with an Examples table", () => {
    const out = toGherkin("Aplicación de cupón", outlineData);
    expect(out).toContain("  Scenario Outline: Aplicación de cupón");
    expect(out).toContain('    When ingresa el cupón "<cupon>" y presiona "Aplicar"');
    expect(out).toContain("    Examples:");
    expect(out).toContain("      | cupon | resultado |");
    expect(out).toContain("      | DESC10 | Descuento aplicado |");
    expect(out).toContain("      | VERANO23 | Cupón ha expirado |");
  });

  it("round-trips the Examples table", () => {
    const parsed = fromGherkin(toGherkin("Aplicación de cupón", outlineData));
    expect(parsed.isOutline).toBe(true);
    expect(parsed.steps).toEqual(outlineData.steps);
    expect(parsed.examples?.headers).toEqual(["cupon", "resultado"]);
    expect(parsed.examples?.rows).toEqual([
      ["DESC10", "Descuento aplicado"],
      ["VERANO23", "Cupón ha expirado"],
    ]);
  });

  it("skips fully empty example rows", () => {
    const out = toGherkin("X", {
      ...outlineData,
      examples: { headers: ["a"], rows: [["1"], ["  "]] },
    });
    const rows = out.split("\n").filter((l) => l.trim().startsWith("|"));
    expect(rows).toHaveLength(2); // header + one data row
  });
});

describe("gherkin mapper — advanced", () => {
  const feature = `Feature: Checkout
  Background:
    Given el usuario inició sesión

  Rule: cupones válidos

  Scenario: aplica descuento
    When aplica DESC10
    Then ve el descuento

  Scenario Outline: variantes
    When aplica "<cupon>"
    Then ve "<resultado>"
`;

  it("passes the feature source through unchanged", () => {
    const out = toGherkin("ignored", {
      ...baseData,
      gherkinLevel: "advanced",
      featureSource: feature,
    });
    expect(out).toBe(feature);
  });

  it("scaffolds a feature when advanced source is empty", () => {
    const out = toGherkin("Nuevo", {
      ...baseData,
      gherkinLevel: "advanced",
      featureSource: "",
    });
    expect(out).toContain("Feature: Nuevo");
    expect(out).toContain("Scenario: Nuevo");
  });

  it("summarizes background, rules and scenarios", () => {
    const s = summarizeFeature(feature);
    expect(s.feature).toBe("Checkout");
    expect(s.background).toBe(true);
    expect(s.rules).toEqual(["cupones válidos"]);
    expect(s.scenarios).toEqual([
      { type: "scenario", name: "aplica descuento" },
      { type: "outline", name: "variantes" },
    ]);
  });
});

describe("level auto-detection (proposal 2)", () => {
  it("is basic for a plain single scenario", () => {
    expect(
      detectLevel("Feature: X\n  Scenario: X\n    Given a\n    When b\n    Then c\n"),
    ).toBe("basic");
  });

  it("is outline when there are placeholders or an Examples table", () => {
    expect(
      detectLevel('Feature: X\n  Scenario Outline: X\n    When aplica "<cupon>"\n'),
    ).toBe("outline");
  });

  it("is advanced with Background, Rule or multiple scenarios", () => {
    expect(detectLevel("Feature: X\n  Background:\n    Given a\n")).toBe("advanced");
    expect(
      detectLevel("Feature: X\n  Scenario: a\n  Scenario: b\n"),
    ).toBe("advanced");
  });
});

describe("advanced flows <-> Gherkin (main + alternative flows)", () => {
  const flows: Flow[] = [
    {
      id: "1",
      name: "Flujo principal",
      preconditions: [],
      steps: ['aplica el cupón "DESC10"'],
      expectedResult: 'el total es "$90.00"',
    },
    {
      id: "2",
      name: "Alterno: cupón rechazado",
      preconditions: ["el cupón está expirado"],
      steps: ['aplica el cupón "<cupon>"'],
      expectedResult: 've "<mensaje>"',
      examples: {
        headers: ["cupon", "mensaje"],
        rows: [["VERANO23", "Cupón expirado"]],
      },
    },
  ];
  const background = ["el usuario ha iniciado sesión"];

  it("generates Background + one scenario per flow (outline when it has data)", () => {
    const g = flowsToGherkin("Cupón", background, flows);
    expect(g).toContain("  Background:\n    Given el usuario ha iniciado sesión");
    expect(g).toContain("  Scenario: Flujo principal");
    expect(g).toContain("  Scenario Outline: Alterno: cupón rechazado");
    expect(g).toContain("    Given el cupón está expirado");
    expect(g).toContain("      | cupon | mensaje |");
  });

  it("round-trips flows through Gherkin", () => {
    const parsed = parseFeatureFlows(flowsToGherkin("Cupón", background, flows));
    expect(parsed.title).toBe("Cupón");
    expect(parsed.background).toEqual(background);
    expect(parsed.flows).toHaveLength(2);
    expect(parsed.flows[0].name).toBe("Flujo principal");
    expect(parsed.flows[0].steps).toEqual(['aplica el cupón "DESC10"']);
    expect(parsed.flows[1].name).toBe("Alterno: cupón rechazado");
    expect(parsed.flows[1].preconditions).toEqual(["el cupón está expirado"]);
    expect(parsed.flows[1].expectedResult).toBe('ve "<mensaje>"');
    expect(parsed.flows[1].examples?.rows).toEqual([["VERANO23", "Cupón expirado"]]);
  });
});

describe("placeholder + derived helpers (proposals 3a/3b)", () => {
  it("extracts unique placeholders in order", () => {
    expect(
      placeholdersIn(['aplica "<cupon>" y <cupon>', 've "<resultado>"']),
    ).toEqual(["cupon", "resultado"]);
  });

  it("extracts comments without the marker", () => {
    expect(extractComments("Feature: X\n# nota uno\n#nota dos")).toEqual([
      "nota uno",
      "nota dos",
    ]);
  });

  it("extracts every Examples table with its scenario name", () => {
    const feature = `Feature: F
  Scenario Outline: variantes
    When aplica "<cupon>"
    Examples:
      | cupon  | resultado |
      | DESC10 | ok        |`;
    const ex = extractExamples(feature);
    expect(ex).toHaveLength(1);
    expect(ex[0].name).toBe("variantes");
    expect(ex[0].table.headers).toEqual(["cupon", "resultado"]);
    expect(ex[0].table.rows).toEqual([["DESC10", "ok"]]);
  });
});
