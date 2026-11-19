import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MetricView } from "@shared/contracts/contract";
import { DataTable, type DataColumn } from "@shared/ui/DataTable";
import { StatusPill } from "@shared/ui/StatusPill";
import {
  formatMetric,
  isCheck,
  keyMetrics,
  thresholdsOf,
} from "../model/findings";
import "./Findings.css";

/** «Métricas» of a run (ING-06, F4; bocetos §4): failed thresholds first,
 *  the usual summary of each metric (every one with «Ver todas»), and the
 *  checks of k6 apart. */
export function MetricsPanel({ metrics }: { metrics: MetricView[] }) {
  const { t, i18n } = useTranslation();
  const [all, setAll] = useState(false);
  const thresholds = thresholdsOf(metrics);
  const checks = metrics.filter(isCheck);
  const main = metrics.filter((m) => !isCheck(m));
  const shown = all ? main : keyMetrics(metrics);
  const value = (m: MetricView) => formatMetric(m, i18n.language);

  const columns: DataColumn<MetricView>[] = [
    {
      id: "name",
      header: t("findings.metric.name"),
      cell: (m) => <span className="fd-mono">{m.name}</span>,
      width: "minmax(0,1.4fr)",
    },
    {
      id: "aggregation",
      header: t("findings.metric.aggregation"),
      cell: (m) => m.aggregation ?? "—",
      width: "96px",
    },
    {
      id: "scope",
      header: t("findings.metric.scope"),
      cell: (m) => <span className="fd-mono fd-muted">{m.scope ?? "—"}</span>,
      width: "minmax(0,1.2fr)",
      minView: "tablet",
    },
    {
      id: "value",
      header: t("findings.metric.value"),
      cell: value,
      width: "120px",
      align: "end",
    },
    {
      id: "threshold",
      header: t("findings.metric.threshold"),
      cell: (m) =>
        m.threshold ? <span className="fd-mono">{m.threshold}</span> : "—",
      width: "minmax(0,1fr)",
    },
    {
      id: "state",
      header: t("findings.metric.state"),
      cell: (m) =>
        m.passed === null ? (
          <span className="fd-muted">{t("findings.metric.noThreshold")}</span>
        ) : (
          <StatusPill tone={m.passed ? "success" : "error"}>
            {t(m.passed ? "findings.metric.passed" : "findings.metric.failed")}
          </StatusPill>
        ),
      width: "128px",
    },
  ];

  const checkColumns: DataColumn<MetricView>[] = [
    {
      id: "check",
      header: t("findings.check.name"),
      cell: (m) => m.scope ?? "",
      width: "minmax(0,2fr)",
    },
    {
      id: "passes",
      header: t("findings.check.passes"),
      cell: (m) => String(m.attributes?.passes ?? "—"),
      width: "110px",
      align: "end",
    },
    {
      id: "fails",
      header: t("findings.check.fails"),
      cell: (m) => String(m.attributes?.fails ?? "—"),
      width: "110px",
      align: "end",
    },
    {
      id: "rate",
      header: t("findings.check.rate"),
      cell: value,
      width: "110px",
      align: "end",
    },
  ];

  return (
    <div className="fd" data-testid="metrics-panel">
      {thresholds.total > 0 && (
        <p className="fd-kpi" data-testid="metrics-thresholds">
          <strong className={thresholds.failed.length ? "fd-bad" : undefined}>
            {t("findings.metric.thresholdsMet", {
              passed: thresholds.passed,
              total: thresholds.total,
            })}
          </strong>
          {thresholds.failed.length > 0 && (
            <span>
              {" "}
              {t("findings.metric.failedList", {
                list: thresholds.failed
                  .map((m) => `${m.name} ${m.threshold ?? ""}: ${value(m)}`)
                  .join("; "),
              })}
            </span>
          )}
        </p>
      )}
      <DataTable
        className="dt-surface"
        label={t("findings.metric.table")}
        rows={shown}
        columns={columns}
        getRowId={(m) => m.id}
        empty={<p className="tp-field__hint">{t("findings.metric.empty")}</p>}
      />
      {main.length > shown.length || all ? (
        <button
          type="button"
          className="ui-btn ui-btn--small fd-more"
          onClick={() => setAll((a) => !a)}
        >
          {all
            ? t("findings.metric.fewer")
            : t("findings.metric.all", {
                shown: shown.length,
                total: main.length,
              })}
        </button>
      ) : null}
      {checks.length > 0 && (
        <>
          <h3 className="fd-sub">{t("findings.check.title")}</h3>
          <DataTable
            className="dt-surface"
            label={t("findings.check.title")}
            rows={checks}
            columns={checkColumns}
            getRowId={(m) => m.id}
          />
        </>
      )}
    </div>
  );
}
