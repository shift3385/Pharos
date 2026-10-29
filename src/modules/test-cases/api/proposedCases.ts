import type { AiProvenance } from "@modules/ai";
import type { TestCaseData } from "../model/types";
import { toGherkin } from "../ui/gherkin";
import { testCaseApi } from "./testCaseApi";

/** A scenario proposed for a requirement (IA-05), already validated by the ai
 *  module. Structural, so test-cases does not depend on the ai schemas. */
export interface ScenarioProposal {
  title: string;
  description: string;
  priority: string;
  given: string[];
  when: string[];
  then: string[];
}

/** The case data of an accepted proposal: a basic-level case whose Given /
 *  When / Then are its preconditions, steps and expected result (the editor's
 *  own mapping), linked to the requirement. Pure — testable. */
export function proposalCaseData(
  p: ScenarioProposal,
  requirementKey: string,
  provenance?: AiProvenance,
): TestCaseData {
  return {
    gherkinLevel: "basic",
    description: p.description,
    preconditions: [...p.given],
    steps: [...p.when],
    expectedResult: p.then.join("\n"),
    requirementKeys: [requirementKey],
    // The whole case came from the AI and waits for a review (IA-01).
    ...(provenance ? { aiProvenance: { case: provenance } } : {}),
  };
}

/** The Gherkin a proposal becomes, for the review before accepting. The case
 *  ID tag is missing until the case exists. */
export function proposalGherkin(p: ScenarioProposal, requirementKey: string): string {
  return toGherkin(p.title, proposalCaseData(p, requirementKey));
}

export interface CreateProposedCasesInput {
  projectId: string;
  userId: string;
  author: string;
  requirementKey: string;
  provenance: AiProvenance;
  proposals: ScenarioProposal[];
  // Browser-fallback numbering hints (the Rust store reads the project's own).
  caseIdPrefix?: string;
  caseIdDigits?: number;
}

export interface CreateProposedCasesResult {
  created: number;
  failed: number;
  /** Positions in `proposals` that were not saved, so the caller can offer
   *  to retry just those (and never duplicate the saved ones). */
  failedIndexes: number[];
}

/** Creates the accepted proposals as draft cases linked to the requirement.
 *  The answer was validated whole before this point; a store error on one case
 *  does not stop the rest, and the caller reports which ones failed. */
export async function createProposedCases(input: CreateProposedCasesInput): Promise<CreateProposedCasesResult> {
  let created = 0;
  const failedIndexes: number[] = [];
  for (const [i, p] of input.proposals.entries()) {
    try {
      // null: the store refused it (e.g. the project is not the user's).
      const saved = await testCaseApi.create({
        projectId: input.projectId,
        title: p.title,
        status: "draft",
        priority: p.priority,
        author: input.author,
        userId: input.userId,
        caseIdPrefix: input.caseIdPrefix,
        caseIdDigits: input.caseIdDigits,
        data: proposalCaseData(p, input.requirementKey, input.provenance),
      });
      if (saved) created++;
      else failedIndexes.push(i);
    } catch {
      failedIndexes.push(i);
    }
  }
  return { created, failed: failedIndexes.length, failedIndexes };
}
