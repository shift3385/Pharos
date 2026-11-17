import { useTranslation } from "react-i18next";
import { StatusPill, type PillTone } from "@shared/ui/StatusPill";
import { verdictTone } from "../model/gate";
import type { DecisionSection } from "./decisionSection";

const STATE_TONE: Record<string, PillTone> = {
  met: "success",
  notMet: "error",
  noData: "neutral",
  manual: "info",
};

/** «Decisión de salida» (DOC-02, boceto B): the first section of a closed
 *  cycle's status report, as the .xlsx and the PDF write it. */
export function DecisionPreview({ d }: { d: DecisionSection }) {
  const { t } = useTranslation();
  return (
    <section className="sr-decision" data-testid="report-decision">
      <h4>{t("gate.report.section")}</h4>
      <div className={`sr-decision__box sr-decision__box--${d.verdict}`}>
        <StatusPill tone={verdictTone(d.verdict)} dot>
          <span data-testid="report-verdict">{d.verdictLabel}</span>
        </StatusPill>
        <p>
          <strong>{d.summaryLine}</strong> {d.closedLine}
          {d.previousLine && <> · {d.previousLine}</>}
        </p>
      </div>
      <ul className="sr-exit">
        {d.criteria.rows.map((r, i) => (
          <li key={i} className="sr-decision__crit">
            <span className="sr-exit__label">{r[0]}</span>
            <span className="sr-exit__nums">
              {r[1]} · {r[2]}
            </span>
            <StatusPill tone={STATE_TONE[d.criteriaStates[i]] ?? "neutral"}>{r[3]}</StatusPill>
            {r[4] !== "—" && <span className="sr-decision__why">{r[4]}</span>}
          </li>
        ))}
      </ul>
      <h5>{t("gate.report.metricsSection")}</h5>
      <dl className="sr-decision__metrics">
        {d.metrics.rows.map((r, i) => (
          <div key={i}>
            <dt>{r[0]}</dt>
            <dd>
              <b>{r[1]}</b>
              {r[3] !== "—" && (
                <em
                  className={
                    d.metricTrend[i] === null ? "" : d.metricTrend[i] ? "is-better" : "is-worse"
                  }
                >
                  {" "}
                  {r[3]}
                </em>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
