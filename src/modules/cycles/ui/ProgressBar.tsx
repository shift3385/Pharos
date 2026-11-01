import { useTranslation } from "react-i18next";
import { percents, type ProgressSummary } from "../model/types";

/** A cycle's progress: a stacked bar (passed, failed, blocked, the rest
 *  executed) over every item × configuration, and the same in words, so it
 *  never depends on colour alone (SPEC §10). */
export function ProgressBar({ summary }: { summary: ProgressSummary }) {
  const { t } = useTranslation();
  const { executed, passed } = percents(summary);
  const share = (n: number) => (summary.total ? (n * 100) / summary.total : 0);
  const rest = summary.executed - summary.passed - summary.failed - summary.blocked;
  const words = t("cycles.progress.words", {
    executed: summary.executed,
    total: summary.total,
    passed: summary.passed,
  });
  return (
    <span className="cy-progress" title={words}>
      <span
        className="cy-progress__track"
        role="img"
        aria-label={t("cycles.progress.label", {
          executed,
          passed,
          failed: summary.failed,
          blocked: summary.blocked,
        })}
      >
        <span className="cy-progress__seg" data-tone="success" style={{ width: `${share(summary.passed)}%` }} />
        <span className="cy-progress__seg" data-tone="error" style={{ width: `${share(summary.failed)}%` }} />
        <span className="cy-progress__seg" data-tone="warning" style={{ width: `${share(summary.blocked)}%` }} />
        <span className="cy-progress__seg" data-tone="info" style={{ width: `${share(rest)}%` }} />
      </span>
      <span className="cy-progress__text">
        {summary.total === 0 ? t("cycles.progress.none") : `${summary.executed}/${summary.total} · ${passed} %`}
      </span>
    </span>
  );
}
