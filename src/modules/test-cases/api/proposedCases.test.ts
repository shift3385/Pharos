// IA-05: accepted proposals become draft cases linked to the requirement, and
// their Gherkin is valid for the official Cucumber parser.

import { describe, expect, it, vi } from "vitest";
import { generateMessages } from "@cucumber/gherkin";
import { IdGenerator, SourceMediaType } from "@cucumber/messages";
import { createProposedCases, proposalCaseData, proposalGherkin, type ScenarioProposal } from "./proposedCases";
import { testCaseApi } from "./testCaseApi";

const provenance = { provider: "anthropic" as const, model: "claude-opus-5-5", generatedAt: "2026-10-29T10:00:00.000Z" };

const proposal: ScenarioProposal = {
  title: "Account locked after five failures",
  description: "Five failed sign-ins lock the account.",
  priority: "critical",
  given: ["a registered user"],
  when: ["the user fails to sign in five times"],
  then: ["the account is locked", "a lock message is shown"],
};

describe("proposed cases (IA-05)", () => {
  it("maps Given / When / Then to preconditions, steps and expected result, linked to the requirement", () => {
    expect(proposalCaseData(proposal, "REQ-007", provenance)).toEqual({
      gherkinLevel: "basic",
      description: "Five failed sign-ins lock the account.",
      preconditions: ["a registered user"],
      steps: ["the user fails to sign in five times"],
      expectedResult: "the account is locked\na lock message is shown",
      requirementKeys: ["REQ-007"],
      aiProvenance: { case: provenance },
    });
  });

  it("previews valid Gherkin tagged with the requirement", () => {
    const text = proposalGherkin(proposal, "REQ-007");
    expect(text).toContain("@REQ-007\nFeature: Account locked after five failures");
    expect(text).toContain("    Then the account is locked\n    And a lock message is shown");
    const envelopes = generateMessages(text, "p.feature", SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
      includeGherkinDocument: true,
      includePickles: true,
      newId: IdGenerator.incrementing(),
    });
    expect(envelopes.find((e) => e.parseError)).toBeUndefined();
    const pickle = envelopes.find((e) => e.pickle)?.pickle;
    expect(pickle?.tags.map((t) => t.name)).toEqual(["@REQ-007"]);
    expect(pickle?.steps).toHaveLength(4);
  });

  it("creates the accepted proposals as draft cases with the AI mark", async () => {
    const summary = await createProposedCases({
      projectId: "p1",
      userId: "u1",
      author: "Quality Analyst",
      requirementKey: "REQ-007",
      provenance,
      proposals: [proposal, { ...proposal, title: "Successful login", priority: "high" }],
      caseIdPrefix: "TC-",
      caseIdDigits: 3,
    });
    expect(summary).toEqual({ created: 2, failed: 0 });
    const list = await testCaseApi.list("p1", "u1");
    expect(list.map((c) => [c.scenarioId, c.title, c.status, c.priority, c.aiPending])).toEqual([
      ["TC-001", "Account locked after five failures", "draft", "critical", true],
      ["TC-002", "Successful login", "draft", "high", true],
    ]);
    const saved = await testCaseApi.get(list[0].id, "u1");
    expect(saved?.data.requirementKeys).toEqual(["REQ-007"]);
    expect(saved?.data.aiProvenance?.case).toEqual(provenance);
  });

  it("a store error on one case does not stop the rest and is counted", async () => {
    const real = testCaseApi.create;
    const spy = vi
      .spyOn(testCaseApi, "create")
      .mockImplementationOnce(() => Promise.reject(new Error("disk full")))
      .mockImplementationOnce(() => Promise.resolve(null))
      .mockImplementation((input) => real(input));
    const summary = await createProposedCases({
      projectId: "p2",
      userId: "u1",
      author: "QA",
      requirementKey: "REQ-001",
      provenance,
      proposals: [proposal, proposal, proposal],
    });
    expect(summary).toEqual({ created: 1, failed: 2 });
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
