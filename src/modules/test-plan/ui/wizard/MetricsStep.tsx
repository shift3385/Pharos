import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Select } from "@shared/ui/Select";
import { StatusPill } from "@shared/ui/StatusPill";
import {
  METRIC_KINDS,
  METRIC_OPS,
  METRIC_UNIT,
  METRIC_UNITS,
  linkedText,
  newMetricId,
  opSign,
  syncLinkedCriteria,
  unitOf,
  type MetricKind,
  type MetricOp,
  type MetricUnit,
} from "../../model/metrics";
import type { PlanMetric } from "../../model/types";
import type { StepProps } from "./stepProps";

const OWN = "own";

/**
 * «Métricas y objetivos medibles» (PLN-06, ADR-0040): one row per metric with
 * its operator and objective. A catalog metric has its unit fixed and Pharos
 * measures it; an own metric has a name and a unit of its own and is judged
 * by hand. «Criterio de salida» adds the metric to the exit criteria (linked,
 * blocking) or takes it out; editing a metric rewrites the text of the
 * criteria it measures.
 */
export function MetricsStep({ form, setForm }: Pick<StepProps, "form" | "setForm">) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "es";
  const exits = new Set(form.closureCriteria.flatMap((c) => (c.metricId ? [c.metricId] : [])));

  /** New metrics; the criteria they measure follow (text, or the link of a
   *  removed metric). */
  const update = (metrics: PlanMetric[]) =>
    setForm((f) => (f ? { ...f, metrics, closureCriteria: syncLinkedCriteria(f.closureCriteria, metrics, t, lang) } : f));
  const patch = (id: string, change: Partial<PlanMetric>) =>
    update(form.metrics.map((m) => (m.id === id ? { ...m, ...change } : m)));

  const setKind = (m: PlanMetric, value: string) =>
    patch(
      m.id,
      value === OWN
        ? { kind: null, unit: m.kind ? "score" : m.unit }
        : { kind: value as MetricKind, name: "", unit: METRIC_UNIT[value as MetricKind] },
    );

  const toggleExit = (m: PlanMetric) =>
    setForm((f) => {
      if (!f) return f;
      const linked = f.closureCriteria.some((c) => c.metricId === m.id);
      return {
        ...f,
        closureCriteria: linked
          ? f.closureCriteria.filter((c) => c.metricId !== m.id)
          : [
              // An empty starter row is replaced, not kept.
              ...f.closureCriteria.filter((c) => c.criterion.trim() || c.metric.trim()),
              { ...linkedText(m, t, lang), metricId: m.id, blocking: true },
            ],
      };
    });

  const addCatalog = () => {
    const used = new Set(form.metrics.map((m) => m.kind));
    const kind = METRIC_KINDS.find((k) => !used.has(k)) ?? METRIC_KINDS[0];
    update([
      ...form.metrics,
      { id: newMetricId(form.metrics), kind, name: "", op: kind === "criticalDefects" || kind === "escapedDefects" ? "=" : ">=", target: 0, unit: METRIC_UNIT[kind] },
    ]);
  };
  const addOwn = () =>
    update([...form.metrics, { id: newMetricId(form.metrics), kind: null, name: "", op: ">=", target: 0, unit: "score" }]);

  const kindOptions = [
    ...METRIC_KINDS.map((k) => ({ value: k, label: t(`testPlan.metricKind.${k}`), description: t(`testPlan.metricKindTip.${k}`) })),
    { value: OWN, label: t("testPlan.metricsAddOwn") },
  ];

  return (
    <div className="tpw-metrics" data-testid="plan-metrics">
      {form.metrics.length === 0 ? (
        <p className="tp__muted">{t("testPlan.metricsNone")}</p>
      ) : (
        <ol className="tpw-metrics__list">
          {form.metrics.map((m, i) => {
            const row = t("a11y.row", { n: i + 1 });
            const name = m.kind ? t(`testPlan.metricKind.${m.kind}`) : m.name || row;
            return (
              <li key={m.id} className="tpw-metrics__row" data-testid="plan-metric">
                <div className="tpw-metrics__cell tpw-metrics__cell--metric">
                  <span className="tpw-metrics__label">{t("testPlan.metricsTable.metric")}</span>
                  <Select
                    value={m.kind ?? OWN}
                    onChange={(v) => setKind(m, v)}
                    options={kindOptions}
                    aria-label={`${t("testPlan.metricsTable.metric")} · ${row}`}
                    data-testid="plan-metric-kind"
                  />
                  {!m.kind && (
                    <input
                      className="tpw-metrics__input"
                      aria-label={`${t("testPlan.metricsTable.ownName")} · ${row}`}
                      placeholder={t("testPlan.metricsTable.ownName")}
                      value={m.name}
                      onChange={(e) => patch(m.id, { name: e.target.value })}
                    />
                  )}
                </div>
                <div className="tpw-metrics__cell tpw-metrics__cell--target">
                  <span className="tpw-metrics__label">{t("testPlan.metricsTable.target")}</span>
                  <div className="tpw-metrics__objective">
                    <Select<MetricOp>
                      value={m.op}
                      onChange={(v) => patch(m.id, { op: v })}
                      options={METRIC_OPS.map((op) => ({ value: op, label: opSign(op) }))}
                      aria-label={`${t("testPlan.metricsTable.op")} · ${name}`}
                      className="tpw-metrics__op"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      className="tpw-metrics__input tpw-metrics__number"
                      aria-label={`${t("testPlan.metricsTable.target")} · ${name}`}
                      value={Number.isFinite(m.target) ? m.target : ""}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(",", "."));
                        patch(m.id, { target: Number.isFinite(n) ? n : 0 });
                      }}
                    />
                    {m.kind ? (
                      <span className="tpw-metrics__unit" title={t(`testPlan.metricUnit.${unitOf(m)}`)}>
                        {t(`testPlan.metricUnit.${unitOf(m)}`)}
                      </span>
                    ) : (
                      <Select<MetricUnit>
                        value={m.unit}
                        onChange={(v) => patch(m.id, { unit: v })}
                        options={METRIC_UNITS.map((u) => ({ value: u, label: t(`testPlan.metricUnit.${u}`) }))}
                        aria-label={`${t("testPlan.metricsTable.unit")} · ${name}`}
                        className="tpw-metrics__unitsel"
                      />
                    )}
                  </div>
                </div>
                <div className="tpw-metrics__cell">
                  <span className="tpw-metrics__label">{t("testPlan.metricsTable.measured")}</span>
                  <StatusPill tone={m.kind ? "success" : "warning"}>
                    {t(m.kind ? "testPlan.measure.auto" : "testPlan.measure.manual")}
                  </StatusPill>
                </div>
                <label className="tpw-metrics__cell tpw-metrics__exit">
                  <input
                    type="checkbox"
                    checked={exits.has(m.id)}
                    onChange={() => toggleExit(m)}
                    data-testid="plan-metric-exit"
                  />
                  <span>{t("testPlan.metricsTable.exit")}</span>
                </label>
                <button
                  type="button"
                  className="tpw-metrics__remove"
                  aria-label={`${t("testPlan.metricsTable.remove")} · ${name}`}
                  title={t("testPlan.metricsTable.remove")}
                  onClick={() => update(form.metrics.filter((x) => x.id !== m.id))}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="tpw-metrics__add">
        <button type="button" className="tp-list-field__add" onClick={addCatalog}>
          <Plus size={14} aria-hidden="true" /> {t("testPlan.metricsAddCatalog")}
        </button>
        <button type="button" className="tp-list-field__add" onClick={addOwn}>
          <Plus size={14} aria-hidden="true" /> {t("testPlan.metricsAddOwn")}
        </button>
      </div>
    </div>
  );
}
