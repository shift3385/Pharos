import type { ListProposalOps, ProvenanceMap } from "@modules/ai";
import { newStepId, texts } from "../model/steps";
import type { Flow, GherkinLevel, RequirementOption, Step } from "../model/types";

/** What the AI must write in the expected result (IA-16), in our own words after
 *  the ISTQB glossary (ADR-0005). The tone is set in `buildAssistMessages`. */
export const EXPECTED_RESULT_INSTRUCTION =
  "the Expected Result of a software test case: the observable behaviour of the test object once the steps have run, stated so a tester can objectively decide pass or fail. Derive it from the case as evidence: say only what the case supports, with no values, messages or figures it does not give, and keep any <placeholder> exactly as written";

/** The fields of a case the AI reads and can assist. */
export interface CaseContent {
  title: string;
  description: string;
  mappedUseCase: string;
  requirementKeys: string[];
  preconditions: Step[];
  steps: Step[];
  expectedResult: string;
  postconditions: string[];
  acceptanceCriteria: string[];
  testData: string;
  notes: string;
}

type AssistedField = "preconditions" | "steps" | "expectedResult" | "postconditions" | "acceptanceCriteria";

/** The rest of the case, for the AI to work from (IA-16): everything but the
 *  field being assisted, which goes to the model on its own. Test data and notes
 *  are read here, though they have no AI of their own. (Pure — testable.) */
export function caseBrief(
  c: CaseContent,
  omit: AssistedField,
  requirements: readonly RequirementOption[] = [],
): string {
  const text = (label: string, value: string, field?: AssistedField) =>
    field !== omit && value.trim() ? `${label}: ${value.trim()}` : "";
  const list = (label: string, items: string[], field: AssistedField) => {
    const filled = items.map((i) => i.trim()).filter(Boolean);
    return field !== omit && filled.length
      ? `${label}:\n${filled.map((i, n) => `${n + 1}. ${i}`).join("\n")}`
      : "";
  };
  const linked = c.requirementKeys.map((key) => {
    const req = requirements.find((r) => r.requirementKey === key);
    return req ? `${key}: ${req.title}` : key;
  });
  return [
    text("Test case title", c.title),
    text("Description", c.description),
    text("Use case", c.mappedUseCase),
    text("Linked requirements", linked.join("; ")),
    list("Preconditions", texts(c.preconditions), "preconditions"),
    list("Steps", texts(c.steps), "steps"),
    text("Expected result", c.expectedResult, "expectedResult"),
    list("Postconditions", c.postconditions, "postconditions"),
    list("Acceptance criteria", c.acceptanceCriteria, "acceptanceCriteria"),
    text("Test data", c.testData),
    text("Notes", c.notes),
  ]
    .filter(Boolean)
    .join("\n");
}

/** A checklist shows only its items and notes, though the rest stays stored
 *  (FLD-01): the AI reads what the user sees, so no reason rests on a hidden field. */
export function checklistBrief(c: CaseContent, requirements: readonly RequirementOption[] = []): string {
  return caseBrief(
    { ...c, preconditions: [], expectedResult: "", postconditions: [], acceptanceCriteria: [], testData: "" },
    "steps",
    requirements,
  );
}

type FlowField = "preconditions" | "steps" | "expectedResult";

/** What an AI button of an advanced case works on: the shared preconditions, or
 *  one field of one flow. */
export type FlowBriefScope = { omit: "background" } | { flowId: string; omit: FlowField };

/** An advanced case for the AI (IA-16): the flat fields it does not show are left
 *  out, and the flow at hand comes first so the length cap never cuts it. With
 *  the shared preconditions and the other flows, a repeat can be told. (Pure.) */
export function flowsBrief(
  c: CaseContent,
  background: readonly Step[],
  flows: readonly Flow[],
  scope: FlowBriefScope,
  requirements: readonly RequirementOption[] = [],
): string {
  const head = checklistBrief({ ...c, steps: [] }, requirements);
  const numbered = (label: string, items: readonly Step[]) => {
    const filled = texts(items).map((i) => i.trim()).filter(Boolean);
    return filled.length ? `${label}:\n${filled.map((i, n) => `${n + 1}. ${i}`).join("\n")}` : "";
  };
  const flowText = (flow: Flow, title: string, omit?: FlowField) =>
    [
      title,
      omit !== "preconditions" && numbered("Preconditions of the flow", flow.preconditions ?? []),
      omit !== "steps" && numbered("Steps", flow.steps),
      omit !== "expectedResult" && flow.expectedResult.trim() && `Expected result: ${flow.expectedResult.trim()}`,
    ]
      .filter(Boolean)
      .join("\n");
  const flowId = "flowId" in scope ? scope.flowId : null;
  const current = flows.find((f) => f.id === flowId);
  return [
    head,
    scope.omit !== "background" && numbered("Shared preconditions (they apply to every flow)", background),
    current && flowText(current, `This flow: ${current.name}`, scope.omit as FlowField),
    ...flows.filter((f) => f !== current).map((f) => flowText(f, `Another flow: ${f.name}`)),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Where the AI mark of an advanced case's content is kept (`aiProvenance`). */
export const BACKGROUND_KEY = "background";
const FLOW_KEY_PREFIX = "flow.";
export const flowProvenanceKey = (flowId: string, field: FlowField) => `${FLOW_KEY_PREFIX}${flowId}.${field}`;

/** The marks whose content is still stored. One pending mark keeps a case in
 *  «IA pendiente de revisión», and nobody could review the mark of a flow that
 *  is gone, or of flows a lower level does not save. (Pure — testable.) */
export function liveProvenance(map: ProvenanceMap, level: GherkinLevel, flows: readonly Flow[]): ProvenanceMap {
  const advanced = level === "advanced";
  const live = new Set(advanced ? flows.map((f) => f.id) : []);
  return Object.fromEntries(
    Object.entries(map).filter(([key]) => {
      if (key === BACKGROUND_KEY) return advanced;
      if (!key.startsWith(FLOW_KEY_PREFIX)) return true;
      return live.has(key.slice(FLOW_KEY_PREFIX.length, key.lastIndexOf(".")));
    }),
  );
}

/** Steps keep their id (and anything else they carry) when reworded (DAT-02). */
export const stepOps: ListProposalOps<Step> = {
  textOf: (s) => s.text,
  withText: (s, text) => ({ ...s, text }),
  create: (text) => ({ id: newStepId(), text }),
};

export const textOps: ListProposalOps<string> = {
  textOf: (s) => s,
  withText: (_, text) => text,
  create: (text) => text,
};
