// TRZ-03: stable IDs as Gherkin tags. The case ID is a scenario tag, linked
// requirements are feature tags, and the exported .feature is checked with the
// official Cucumber parser + tag expressions (the same ones cucumber-js and
// playwright-bdd use), so `--tags @TC-001` provably selects the right scenarios.

import { describe, expect, it } from "vitest";
import { generateMessages } from "@cucumber/gherkin";
import { IdGenerator, SourceMediaType, type Pickle } from "@cucumber/messages";
import { parse as parseTagExpression } from "@cucumber/tag-expressions";
import type { TestCaseData } from "../model/types";
import {
  flowsToGherkin,
  fromGherkin,
  parseFeatureFlows,
  splitFeatureTags,
  toGherkin,
  userScenarioTags,
  type TagContext,
} from "./gherkin";

const basic: TestCaseData = {
  gherkinLevel: "basic",
  requirementKeys: ["REQ-014"],
  featureTags: ["priority:high"],
  scenarioTags: ["smoke"],
  preconditions: ['el usuario "qa@pharos.dev" está registrado'],
  steps: ["inicia sesión con contraseña válida"],
  expectedResult: "ve el panel principal",
};

const outline: TestCaseData = {
  gherkinLevel: "outline",
  requirementKeys: ["REQ-014"],
  steps: ['inicia sesión con "<email>" y "<clave>"'],
  expectedResult: 've el error "<mensaje>"',
  examples: {
    headers: ["email", "clave", "mensaje"],
    rows: [
      ["x@y", "mala", "Credenciales inválidas"],
      ["", "vacía", "Email obligatorio"],
    ],
  },
};

/** Pickles (the runnable scenarios) the official parser compiles from a file. */
function pickles(featureText: string, uri: string): Pickle[] {
  const envelopes = generateMessages(featureText, uri, SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
    includeGherkinDocument: true,
    includePickles: true,
    newId: IdGenerator.incrementing(),
  });
  const error = envelopes.find((e) => e.parseError);
  if (error) throw new Error(`invalid Gherkin in ${uri}: ${error.parseError?.message}`);
  return envelopes.flatMap((e) => (e.pickle ? [e.pickle] : []));
}

/** Pickle names selected by a tag expression, as `cucumber-js --tags` does. */
function select(all: Pickle[], expression: string): string[] {
  const node = parseTagExpression(expression);
  return all.filter((p) => node.evaluate(p.tags.map((t) => t.name))).map((p) => p.uri + ":" + p.name);
}

const ctx = (over: Partial<TagContext> = {}): TagContext => ({
  scenarioId: "TC-001",
  caseIdPrefix: "TC-",
  knownRequirementKeys: ["REQ-014", "REQ-002"],
  linkedRequirementKeys: ["REQ-014"],
  ...over,
});

describe("Gherkin tags — rendering", () => {
  it("puts requirement tags on the Feature and the case ID on the Scenario", () => {
    expect(toGherkin("Login", basic, "TC-001")).toBe(
      [
        "@REQ-014 @priority:high",
        "Feature: Login",
        "  @TC-001 @smoke",
        "  Scenario: Login",
        '    Given el usuario "qa@pharos.dev" está registrado',
        "    When inicia sesión con contraseña válida",
        "    Then ve el panel principal",
        "",
      ].join("\n"),
    );
  });

  it("tags a Scenario Outline at scenario level, not on Examples", () => {
    const text = toGherkin("Login rechazado", outline, "TC-002");
    expect(text).toContain("@REQ-014\nFeature: Login rechazado\n  @TC-002\n  Scenario Outline: Login rechazado");
    expect(text).not.toMatch(/@\S+\s*\n\s*Examples:/);
  });

  it("tags every scenario of an advanced case with the case ID", () => {
    const text = flowsToGherkin(
      "Checkout",
      ["hay un carrito"],
      [
        { id: "1", name: "Pago con tarjeta", steps: ["paga"], expectedResult: "ok", tags: ["happy"] },
        { id: "2", name: "Pago rechazado", steps: ["paga mal"], expectedResult: "error" },
      ],
      { scenarioId: "TC-003", requirementKeys: ["REQ-002"] },
    );
    expect(text.startsWith("@REQ-002\nFeature: Checkout")).toBe(true);
    expect(text).toContain("  @TC-003 @happy\n  Scenario: Pago con tarjeta");
    expect(text).toContain("  @TC-003\n  Scenario: Pago rechazado");
  });

  it("emits no tag lines when there is nothing to tag (unsaved case)", () => {
    expect(toGherkin("X", { steps: ["a"] })).toBe("Feature: X\n  Scenario: X\n    When a\n");
  });

  it("makes IDs with spaces valid tags", () => {
    expect(toGherkin("X", {}, "CASO 7")).toContain("  @CASO_7\n");
  });
});

describe("Gherkin tags — parsing back (round-trip)", () => {
  it("reads feature and scenario tags", () => {
    const parsed = fromGherkin(toGherkin("Login", basic, "TC-001"));
    expect(parsed.featureTags).toEqual(["REQ-014", "priority:high"]);
    expect(parsed.scenarioTags).toEqual(["TC-001", "smoke"]);
  });

  it("is lossless: render → parse → classify → render gives the same text", () => {
    const text = toGherkin("Login", basic, "TC-001");
    const parsed = fromGherkin(text);
    const data: TestCaseData = {
      ...basic,
      ...splitFeatureTags(parsed.featureTags, ctx()),
      scenarioTags: userScenarioTags(parsed.scenarioTags, ctx()),
      preconditions: parsed.preconditions,
      steps: parsed.steps,
      expectedResult: parsed.expectedResult,
    };
    expect(data.requirementKeys).toEqual(["REQ-014"]);
    expect(data.featureTags).toEqual(["priority:high"]);
    expect(data.scenarioTags).toEqual(["smoke"]);
    expect(toGherkin("Login", data, "TC-001")).toBe(text);
  });

  it("keeps advanced flow tags on round-trip", () => {
    const text = flowsToGherkin(
      "Checkout",
      [],
      [{ id: "1", name: "Pago", steps: ["paga"], expectedResult: "ok", tags: ["happy"] }],
      { scenarioId: "TC-003", requirementKeys: ["REQ-002"], featureTags: ["wip"] },
    );
    const parsed = parseFeatureFlows(text);
    const c = ctx({ scenarioId: "TC-003", linkedRequirementKeys: ["REQ-002"] });
    const split = splitFeatureTags(parsed.featureTags, c);
    const flows = parsed.flows.map((f) => ({ ...f, tags: userScenarioTags(f.tags ?? [], c) }));
    expect(split).toEqual({ requirementKeys: ["REQ-002"], featureTags: ["wip"] });
    expect(flows[0].tags).toEqual(["happy"]);
    expect(flowsToGherkin("Checkout", [], flows, { scenarioId: "TC-003", ...split })).toBe(text);
  });

  it("links a known requirement typed as a feature tag and unlinks a removed one", () => {
    const typed = "@REQ-002 @nightly\nFeature: Login\n  @TC-001\n  Scenario: Login\n    When x\n";
    expect(splitFeatureTags(fromGherkin(typed).featureTags, ctx())).toEqual({
      requirementKeys: ["REQ-002"],
      featureTags: ["nightly"],
    });
  });

  it("never takes the ID from the Gherkin text: an edited ID tag is ignored", () => {
    // The user changed @TC-001 to @TC-009 in the text; the ID field still owns it.
    const parsed = fromGherkin("Feature: X\n  @TC-009 @smoke\n  Scenario: X\n    When y\n");
    expect(userScenarioTags(parsed.scenarioTags, ctx())).toEqual(["smoke"]);
  });
});

describe("official Cucumber parser + tag expressions (cucumber-js --tags)", () => {
  // Two cases share the same scenario title: only the tag tells them apart.
  const files = {
    "TC-001.feature": toGherkin("Login", basic, "TC-001"),
    "TC-002.feature": toGherkin("Login rechazado", outline, "TC-002"),
    "TC-004.feature": toGherkin("Login", { ...basic, requirementKeys: [], scenarioTags: [] }, "TC-004"),
    "TC-003.feature": flowsToGherkin(
      "Checkout",
      [],
      [
        { id: "1", name: "Pago con tarjeta", steps: ["paga"], expectedResult: "ok" },
        { id: "2", name: "Pago rechazado", steps: ["paga mal"], expectedResult: "error" },
      ],
      { scenarioId: "TC-003", requirementKeys: ["REQ-002"] },
    ),
  };
  const all = Object.entries(files).flatMap(([uri, text]) => pickles(text, uri));

  it("parses every exported file as valid Gherkin", () => {
    // 1 + 2 outline rows + 1 + 2 flows
    expect(all).toHaveLength(6);
  });

  it("@TC-001 selects only that case, even with a same-named scenario elsewhere", () => {
    expect(select(all, "@TC-001")).toEqual(["TC-001.feature:Login"]);
    expect(select(all, "@TC-004")).toEqual(["TC-004.feature:Login"]);
  });

  it("an Outline's ID tag reaches every Examples row", () => {
    expect(select(all, "@TC-002")).toEqual(["TC-002.feature:Login rechazado", "TC-002.feature:Login rechazado"]);
  });

  it("requirement tags are inherited by the scenarios of the feature", () => {
    expect(select(all, "@REQ-014")).toHaveLength(3);
    expect(select(all, "@REQ-002")).toEqual(["TC-003.feature:Pago con tarjeta", "TC-003.feature:Pago rechazado"]);
  });

  it("supports the combined expressions runners use", () => {
    expect(select(all, "@TC-001 or @TC-003")).toHaveLength(3);
    expect(select(all, "@REQ-014 and not @smoke")).toHaveLength(2);
  });
});
