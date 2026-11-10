import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { AssistButton, applyProposals, type AiProvenance, type ProvenanceMap } from "@modules/ai";
import { texts } from "../model/steps";
import type { ExampleTable, Flow, Step } from "../model/types";
import {
  BACKGROUND_KEY,
  EXPECTED_RESULT_INSTRUCTION,
  flowProvenanceKey,
  stepOps,
  type FlowBriefScope,
} from "./caseAi";
import { CaseListReview } from "./CaseListReview";
import { CaseSection } from "./CaseSection";
import { StepListField } from "./StepListField";
import { SortableSteps } from "./SortableSteps";
import { ExamplesTable } from "./ExamplesTable";
import { newFlow } from "./gherkin";
import { TextArea } from "@shared/ui/TextArea";

const EMPTY: ExampleTable = { headers: [], rows: [] };

/** What the flows need for their AI buttons (IA-16). `apply` takes the content
 *  and its provenance together, so they land in one form update. */
export interface FlowsAi {
  available: boolean;
  provenance: ProvenanceMap;
  brief: (scope: FlowBriefScope) => string;
  apply: (patch: { background?: Step[]; flows?: Flow[] }, key: string, provenance: AiProvenance) => void;
  review: (key: string) => void;
}

/** Structured editor for an advanced case: shared preconditions (Background) plus
 *  the main flow and its alternative flows, each a full scenario (spec §5.3). */
export function FlowsEditor({
  background,
  flows,
  onBackgroundChange,
  onFlowsChange,
  ai,
}: {
  background: Step[];
  flows: Flow[];
  onBackgroundChange: (next: Step[]) => void;
  onFlowsChange: (next: Flow[]) => void;
  ai: FlowsAi;
}) {
  const { t } = useTranslation();

  const setFlow = (i: number, patch: Partial<Flow>) =>
    onFlowsChange(flows.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const addFlow = () =>
    onFlowsChange([...flows, newFlow(t("testCase.flow.altName"))]);
  const removeFlow = (i: number) =>
    onFlowsChange(flows.filter((_, idx) => idx !== i));
  const withFlow = (i: number, patch: Partial<Flow>) =>
    flows.map((f, idx) => (idx === i ? { ...f, ...patch } : f));

  return (
    <div className="tc-flows">
      <CaseSection
        title={t("testCase.flow.background")}
        assist={
          <CaseListReview
            field="background"
            available={ai.available}
            existing={texts(background)}
            context={() => ai.brief({ omit: "background" })}
            provenance={ai.provenance[BACKGROUND_KEY]}
            onApply={(accepted, p) =>
              ai.apply({ background: applyProposals(background, accepted, stepOps) }, BACKGROUND_KEY, p)
            }
            onReview={() => ai.review(BACKGROUND_KEY)}
          />
        }
      >
        <p className="tp-field__hint">{t("testCase.flow.backgroundHint")}</p>
        <StepListField
          label={t("testCase.flow.background")}
          items={background}
          onChange={onBackgroundChange}
        />
      </CaseSection>

      {flows.map((flow, i) => (
        <div className="tc-flow" key={flow.id}>
          <div className="tc-flow__head">
            <span className="tc-flow__badge">
              {i === 0 ? t("testCase.flow.main") : t("testCase.flow.alt")}
            </span>
            <input
              className="tc-flow__name"
              aria-label={t("testCase.flow.namePlaceholder")}
              value={flow.name}
              placeholder={t("testCase.flow.namePlaceholder")}
              onChange={(e) => setFlow(i, { name: e.target.value })}
            />
            {flows.length > 1 && (
              <button
                type="button"
                className="tc-flow__del"
                title={`${t("common.remove")}: ${flow.name}`}
                aria-label={`${t("common.remove")}: ${flow.name}`}
                onClick={() => removeFlow(i)}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          <CaseSection
            title={t("testCase.flow.preconditions")}
            assist={
              <CaseListReview
                field="flowPreconditions"
                scope={flow.name}
                available={ai.available}
                existing={texts(flow.preconditions ?? [])}
                context={() => ai.brief({ flowId: flow.id, omit: "preconditions" })}
                provenance={ai.provenance[flowProvenanceKey(flow.id, "preconditions")]}
                onApply={(accepted, p) =>
                  ai.apply(
                    { flows: withFlow(i, { preconditions: applyProposals(flow.preconditions ?? [], accepted, stepOps) }) },
                    flowProvenanceKey(flow.id, "preconditions"),
                    p,
                  )
                }
                onReview={() => ai.review(flowProvenanceKey(flow.id, "preconditions"))}
              />
            }
          >
            <StepListField
              label={`${t("testCase.flow.preconditions")} · ${flow.name}`}
              items={flow.preconditions ?? []}
              onChange={(v) => setFlow(i, { preconditions: v })}
            />
          </CaseSection>

          <CaseSection
            title={t("testCase.flow.steps")}
            assist={
              <CaseListReview
                field="steps"
                scope={flow.name}
                available={ai.available}
                existing={texts(flow.steps)}
                context={() => ai.brief({ flowId: flow.id, omit: "steps" })}
                provenance={ai.provenance[flowProvenanceKey(flow.id, "steps")]}
                onApply={(accepted, p) =>
                  ai.apply(
                    { flows: withFlow(i, { steps: applyProposals(flow.steps, accepted, stepOps) }) },
                    flowProvenanceKey(flow.id, "steps"),
                    p,
                  )
                }
                onReview={() => ai.review(flowProvenanceKey(flow.id, "steps"))}
              />
            }
          >
            <SortableSteps
              label={`${t("testCase.flow.steps")} · ${flow.name}`}
              steps={flow.steps}
              onChange={(v) => setFlow(i, { steps: v })}
            />
          </CaseSection>

          <CaseSection
            title={t("testCase.flow.expected")}
            labelFor={`tc-flow-${flow.id}-expected`}
            assist={
              <AssistButton
                available={ai.available}
                label={`${t("testCase.aiReview.expectedResult")} · ${flow.name}`}
                instruction={EXPECTED_RESULT_INSTRUCTION}
                notes={flow.expectedResult}
                context={ai.brief({ flowId: flow.id, omit: "expectedResult" })}
                showReplaced
                provenance={ai.provenance[flowProvenanceKey(flow.id, "expectedResult")]}
                onUse={(v, p) =>
                  ai.apply({ flows: withFlow(i, { expectedResult: v }) }, flowProvenanceKey(flow.id, "expectedResult"), p)
                }
                onReview={() => ai.review(flowProvenanceKey(flow.id, "expectedResult"))}
              />
            }
          >
            <TextArea
              size="step"
              id={`tc-flow-${flow.id}-expected`}
              value={flow.expectedResult}
              onChange={(e) => setFlow(i, { expectedResult: e.target.value })}
            />
          </CaseSection>

          <CaseSection title={t("testCase.examples.title")}>
            <p className="tp-field__hint">{t("testCase.flow.examplesHint")}</p>
            <ExamplesTable
              value={flow.examples ?? EMPTY}
              onChange={(v) => setFlow(i, { examples: v })}
            />
          </CaseSection>
        </div>
      ))}

      <button type="button" className="tc-flow__add" onClick={addFlow}>
        + {t("testCase.flow.add")}
      </button>
    </div>
  );
}
