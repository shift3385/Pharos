import { useTranslation } from "react-i18next";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { RunLegend } from "./ExecutionByProject";
import { visibleDayLabels, type Period } from "./model/homeData";
import { axisMax, dailySeries } from "./model/metrics";
import type { MetricsState } from "./model/loadHomeMetrics";
import { MetricsNotice } from "./MetricsNotice";

/** «Ejecuciones diarias» (SPEC §8, ACTUALIZACION §2, RED-W6): every attempt
 *  recorded on each local day of the period (manual or imported, retries
 *  included), stacked Pasa / Falla / Otras (blocked, skipped). The layout is
 *  RED-V1's: one column per day (`flex: 1 1 0; min-width: 0`) with the bar
 *  centred (≤ 28 px) and its label underneath, one label out of two on
 *  tablet and mobile counting back from today (bold), a 2 px grey mark on
 *  days without executions. Screen readers get the numbers as a table. */
export function DailyExecutionsChart({
  period,
  today,
  state,
  onRetry,
}: {
  period: Period;
  today: Date;
  state: MetricsState;
  onRetry: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const alternate = useBreakpoint() !== "desktop";
  const points = dailySeries(state.data, period, today);
  const shown = visibleDayLabels(points.length, alternate);
  const max = axisMax(points);
  const total = points.reduce((n, p) => n + p.total, 0);
  const undated = state.data?.undated ?? 0;
  const ready = state.status === "ready";
  const periodText = t(`dashboard.period.lower.${period}`);
  const num = new Intl.NumberFormat(lang);
  const longDate = new Intl.DateTimeFormat(lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const monthName = (d: Date) =>
    new Intl.DateTimeFormat(lang, { month: "long" })
      .format(d)
      .replace(/^./, (c) => c.toUpperCase());
  const first = points[0].day;
  const months =
    first.getMonth() === today.getMonth()
      ? monthName(today)
      : `${monthName(first)} – ${monthName(today)}`;
  const pct = (n: number) => `${max ? (n / max) * 100 : 0}%`;
  // While loading or after an error the days are unknown, not empty.
  const unknown =
    state.status === "loading"
      ? t("dashboard.daily.loading", { period: periodText })
      : t("dashboard.daily.unavailable", { period: periodText });
  const dayText = (p: (typeof points)[number]) =>
    !ready
      ? longDate.format(p.day)
      : p.total
      ? t("dashboard.daily.dayTitle", {
          date: longDate.format(p.day),
          count: p.total,
          passed: p.passed,
          failed: p.failed,
          other: p.others,
          manual: p.manual,
          imported: p.imported,
        })
      : t("dashboard.daily.dayEmpty", { date: longDate.format(p.day) });

  return (
    <section
      className="home-card home-daily"
      aria-labelledby="home-daily-title"
    >
      <div className="home-card__head home-daily__head">
        <div className="home-card__titles">
          <h2 id="home-daily-title" className="home-card__title">
            {t("dashboard.daily.title")}
          </h2>
          <p className="home-card__sub">
            {t("dashboard.daily.subtitle", { period: periodText })}
          </p>
        </div>
        <div className="home-daily__total">
          <span
            className="home-daily__num"
            title={
              undated
                ? t("dashboard.daily.undated", { count: undated })
                : t("dashboard.daily.totalLabel")
            }
            data-testid="home-daily-total"
          >
            {ready ? num.format(total) : "—"}
          </span>
        </div>
      </div>

      <div
        className="home-chart"
        role="img"
        aria-label={
          !ready
            ? unknown
            : total
              ? t("dashboard.daily.chartLabel", {
                  period: periodText,
                  count: total,
                })
              : t("dashboard.daily.chartEmpty", { period: periodText })
        }
        data-testid="home-daily"
      >
        <div className="home-chart__axis" aria-hidden="true">
          {max > 0 && <span>{num.format(max)}</span>}
          {max > 0 && <span>{num.format(max / 2)}</span>}
          <span>0</span>
        </div>
        <div className="home-chart__plot">
          <div className="home-chart__bars">
            {points.map((p) => (
              <span
                key={p.day.toISOString()}
                className="home-chart__col"
                title={dayText(p)}
              >
                <span className="home-chart__bar">
                  {p.total ? (
                    <span
                      className="home-chart__stack"
                      style={{ height: pct(p.total) }}
                    >
                      {p.others > 0 && (
                        <span data-tone="other" style={{ flexGrow: p.others }} />
                      )}
                      {p.failed > 0 && (
                        <span data-tone="fail" style={{ flexGrow: p.failed }} />
                      )}
                      {p.passed > 0 && (
                        <span data-tone="pass" style={{ flexGrow: p.passed }} />
                      )}
                    </span>
                  ) : (
                    <span className="home-chart__nodata" />
                  )}
                </span>
              </span>
            ))}
          </div>
          <div className="home-chart__labels" aria-hidden="true">
            {points.map((p, i) => (
              <span
                key={p.day.toISOString()}
                className="home-chart__label"
                data-today={i === points.length - 1 || undefined}
              >
                {shown[i] ? p.day.getDate() : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* The numbers of each day, for the keyboard and screen readers too
          (a chart is an image): a disclosure with the table. */}
      {ready && (total > 0 || undated > 0) && (
        <details className="home-daily__data" data-testid="home-daily-data">
          <summary className="home-link">
            {t("dashboard.daily.showData")}
          </summary>
        <table className="home-daily__table">
          <caption className="sr-only">
            {t("dashboard.daily.tableCaption", { period: periodText })}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t("dashboard.daily.colDay")}</th>
              <th scope="col">{t("dashboard.daily.pass")}</th>
              <th scope="col">{t("dashboard.daily.fail")}</th>
              <th scope="col">{t("dashboard.daily.other")}</th>
              <th scope="col">{t("dashboard.daily.colManual")}</th>
              <th scope="col">{t("dashboard.daily.colImported")}</th>
            </tr>
          </thead>
          <tbody>
            {points
              .filter((p) => p.total)
              .map((p) => (
                <tr key={p.day.toISOString()}>
                  <th scope="row">{longDate.format(p.day)}</th>
                  <td>{p.passed}</td>
                  <td>{p.failed}</td>
                  <td>{p.others}</td>
                  <td>{p.manual}</td>
                  <td>{p.imported}</td>
                </tr>
              ))}
          </tbody>
        </table>
          {undated > 0 && (
            <p className="home-note">
              {t("dashboard.daily.undatedNote", { count: undated })}
            </p>
          )}
        </details>
      )}

      <MetricsNotice state={state} onRetry={onRetry} />

      <div className="home-daily__foot">
        <RunLegend
          items={[
            { tone: "pass-navy", label: t("dashboard.daily.pass") },
            { tone: "fail", label: t("dashboard.daily.fail") },
            { tone: "other", label: t("dashboard.daily.other") },
            { tone: "none", label: t("dashboard.daily.none"), line: true },
          ]}
        />
        <span className="home-daily__month">{months}</span>
      </div>
    </section>
  );
}
