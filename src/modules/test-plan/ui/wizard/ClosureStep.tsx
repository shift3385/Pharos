import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { DeleteButton } from "@shared/ui/fields";
import { Select } from "@shared/ui/Select";
import { TextArea } from "@shared/ui/TextArea";
import { duplicateRow, duplicateRows } from "@shared/validation";
import { FieldMessage } from "@shared/ui/FormField";
import { linkedText, metricName, targetText } from "../../model/metrics";
import type { ClosureCriterion } from "../../model/types";
import type { StepProps } from "./stepProps";

const NONE = "";

/**
 * «Criterios de cierre» (PLN-06, DOC-02): each exit criterion can be measured
 * by a metric of the plan («Medido por»), and then closing a cycle evaluates
 * it by itself and its text comes from the metric; without one it is free
 * text checked by hand, as before. Each one is blocking (the default) or
 * advisory: an advisory criterion marked «No cumple» does not hold the
 * closure.
 */
export function ClosureStep({ form, set }: Pick<StepProps, "form" | "set">) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "es";
  const baseId = useId();
  const items = form.closureCriteria;
  const byId = new Map(form.metrics.map((m) => [m.id, m]));
  const dupes = duplicateRows(items, (c) =>
    c.criterion.trim() || c.metric.trim() ? `${c.criterion.trim()} | ${c.metric.trim()}` : "",
  );
  const put = (i: number, c: ClosureCriterion) => set("closureCriteria", items.map((x, j) => (j === i ? c : x)));

  const link = (i: number, metricId: string) => {
    const c = items[i];
    const m = byId.get(metricId);
    if (!m) {
      const { metricId: _drop, ...rest } = c;
      put(i, rest);
    } else put(i, { ...c, ...linkedText(m, t, lang), metricId: m.id });
  };

  const metricOptions = [
    { value: NONE, label: t("testPlan.closureLink.none") },
    ...form.metrics
      .filter((m) => m.kind || m.name.trim())
      .map((m) => ({ value: m.id, label: `${metricName(m, t)} ${targetText(m, t, lang)}` })),
  ];

  return (
    <div className="tp-pair-field tpw-closure" role="group" aria-label={t("testPlan.step.closure")} data-testid="plan-closure">
      <p className="tp__muted tpw-closure__hint">{t("testPlan.closureLink.hint")}</p>
      {items.length > 0 && (
        <>
        <div className="tpw-closure__head" aria-hidden="true">
          <span>{t("testPlan.criterionCol")}</span>
          <span>{t("testPlan.metricCol")}</span>
          <span>{t("testPlan.closureLink.label")}</span>
        </div>
        <ol className="tpw-closure__list">
          {items.map((c, i) => {
            const id = `${baseId}-${i}`;
            const row = t("a11y.row", { n: i + 1 });
            const linked = !!(c.metricId && byId.has(c.metricId));
            const issue = duplicateRow(dupes, i);
            const blocking = c.blocking !== false;
            return (
              <li key={i} className="tpw-closure__row" data-testid="plan-criterion">
                <div className="tpw-closure__texts">
                  <label className="tp-pair-field__cell">
                    <span className="tp-pair-field__label">
                      {t("testPlan.criterionCol")}
                      <span className="sr-only"> · {row}</span>
                    </span>
                    <TextArea
                      size="cell"
                      id={id}
                      aria-invalid={issue ? true : undefined}
                      aria-describedby={issue ? `${id}-msg` : undefined}
                      readOnly={linked}
                      value={c.criterion}
                      onChange={(e) => put(i, { ...c, criterion: e.target.value })}
                    />
                  </label>
                  <label className="tp-pair-field__cell">
                    <span className="tp-pair-field__label">
                      {t("testPlan.metricCol")}
                      <span className="sr-only"> · {row}</span>
                    </span>
                    <TextArea
                      size="cell"
                      readOnly={linked}
                      value={c.metric}
                      onChange={(e) => put(i, { ...c, metric: e.target.value })}
                    />
                  </label>
                </div>
                <div className="tpw-closure__controls">
                  <div className="tp-pair-field__cell tpw-closure__link">
                    <Select
                      value={linked ? c.metricId! : NONE}
                      onChange={(v) => link(i, v)}
                      options={metricOptions}
                      aria-label={`${t("testPlan.closureLink.label")} · ${row}`}
                      data-testid="plan-criterion-link"
                    />
                  </div>
                  <button
                    type="button"
                    className="tpw-closure__kind"
                    data-blocking={blocking || undefined}
                    aria-pressed={blocking}
                    title={t("testPlan.closureLink.blockingTip")}
                    aria-label={`${t("testPlan.closureLink.blocking")} · ${row}`}
                    onClick={() => put(i, { ...c, blocking: !blocking })}
                    data-testid="plan-criterion-blocking"
                  >
                    {t(blocking ? "testPlan.closureLink.blocking" : "testPlan.closureLink.advisory")}
                  </button>
                  <DeleteButton
                    key={`${i}-${items.length}`}
                    itemLabel={`${t("testPlan.step.closure")} · ${row}`}
                    needsConfirm={!!(c.criterion.trim() || c.metric.trim())}
                    onDelete={() => set("closureCriteria", items.filter((_, j) => j !== i))}
                  />
                </div>
                {issue && <FieldMessage id={`${id}-msg`} issue={issue} />}
              </li>
            );
          })}
        </ol>
        </>
      )}
      <button
        type="button"
        className="tp-list-field__add"
        onClick={() => set("closureCriteria", [...items, { criterion: "", metric: "", blocking: true }])}
      >
        <Plus size={14} aria-hidden="true" /> {t("testPlan.addRow")}
      </button>
    </div>
  );
}
