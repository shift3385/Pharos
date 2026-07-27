import { useTranslation } from "react-i18next";
import { ListField } from "@shared/ui/fields";
import type { ExampleTable, Flow } from "../model/types";
import { SortableSteps } from "./SortableSteps";
import { ExamplesTable } from "./ExamplesTable";
import { newFlow } from "./gherkin";

const EMPTY: ExampleTable = { headers: [], rows: [] };

/** Structured editor for an advanced case: shared preconditions (Background) plus
 *  the main flow and its alternative flows, each a full scenario (spec §5.3). */
export function FlowsEditor({
  background,
  flows,
  onBackgroundChange,
  onFlowsChange,
}: {
  background: string[];
  flows: Flow[];
  onBackgroundChange: (next: string[]) => void;
  onFlowsChange: (next: Flow[]) => void;
}) {
  const { t } = useTranslation();

  const setFlow = (i: number, patch: Partial<Flow>) =>
    onFlowsChange(flows.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const addFlow = () =>
    onFlowsChange([...flows, newFlow(t("testCase.flow.altName"))]);
  const removeFlow = (i: number) =>
    onFlowsChange(flows.filter((_, idx) => idx !== i));

  return (
    <div className="tc-flows">
      <p className="tp-field__grouplabel">{t("testCase.flow.background")}</p>
      <p className="tp-field__hint">{t("testCase.flow.backgroundHint")}</p>
      <ListField items={background} onChange={onBackgroundChange} />

      {flows.map((flow, i) => (
        <div className="tc-flow" key={flow.id}>
          <div className="tc-flow__head">
            <span className="tc-flow__badge">
              {i === 0 ? t("testCase.flow.main") : t("testCase.flow.alt")}
            </span>
            <input
              className="tc-flow__name"
              value={flow.name}
              placeholder={t("testCase.flow.namePlaceholder")}
              onChange={(e) => setFlow(i, { name: e.target.value })}
            />
            {flows.length > 1 && (
              <button
                type="button"
                className="tc-flow__del"
                title={t("testCase.flow.remove")}
                onClick={() => removeFlow(i)}
              >
                ✕
              </button>
            )}
          </div>

          <p className="tp-field__grouplabel">{t("testCase.flow.preconditions")}</p>
          <ListField
            items={flow.preconditions ?? []}
            onChange={(v) => setFlow(i, { preconditions: v })}
          />

          <p className="tp-field__grouplabel">{t("testCase.flow.steps")}</p>
          <SortableSteps
            steps={flow.steps}
            onChange={(v) => setFlow(i, { steps: v })}
          />

          <label className="tp-field">
            <span>{t("testCase.flow.expected")}</span>
            <textarea
              rows={2}
              value={flow.expectedResult}
              onChange={(e) => setFlow(i, { expectedResult: e.target.value })}
            />
          </label>

          <p className="tp-field__grouplabel">{t("testCase.examples.title")}</p>
          <p className="tp-field__hint">{t("testCase.flow.examplesHint")}</p>
          <ExamplesTable
            value={flow.examples ?? EMPTY}
            onChange={(v) => setFlow(i, { examples: v })}
          />
        </div>
      ))}

      <button type="button" className="tc-flow__add" onClick={addFlow}>
        + {t("testCase.flow.add")}
      </button>
    </div>
  );
}
