import { useTranslation } from "react-i18next";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { RunLegend } from "./ExecutionByProject";
import { periodDays, visibleDayLabels, type Period } from "./model/homeData";

/** «Ejecuciones diarias» (SPEC §8, ACTUALIZACION §2). The layout is final:
 *  header that wraps, one column per day (`flex: 1 1 0; min-width: 0`) with
 *  the bar centred (≤ 28 px) and its label underneath on the same gap, one
 *  label out of two on tablet and mobile counting back from today (bold), and
 *  the legend with the month. Runs arrive with RED-W6, so every day is the
 *  2 px grey «no data» mark and the total is 0. */
export function DailyExecutionsChart({
  period,
  today,
}: {
  period: Period;
  today: Date;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const alternate = useBreakpoint() !== "desktop";
  const days = periodDays(period, today);
  const shown = visibleDayLabels(days.length, alternate);
  const periodText = t(`dashboard.period.lower.${period}`);
  const longDate = new Intl.DateTimeFormat(lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const monthName = (d: Date) =>
    new Intl.DateTimeFormat(lang, { month: "long" })
      .format(d)
      .replace(/^./, (c) => c.toUpperCase());
  const first = days[0];
  const months =
    first.getMonth() === today.getMonth()
      ? monthName(today)
      : `${monthName(first)} – ${monthName(today)}`;

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
            title={t("dashboard.daily.totalLabel")}
          >
            0
          </span>
        </div>
      </div>

      <div
        className="home-chart"
        role="img"
        aria-label={t("dashboard.daily.chartLabel", { period: periodText })}
        data-testid="home-daily"
      >
        <div className="home-chart__axis" aria-hidden="true">
          <span>0</span>
        </div>
        <div className="home-chart__plot">
          <div className="home-chart__bars">
            {days.map((d) => (
              <span
                key={d.toISOString()}
                className="home-chart__col"
                title={t("dashboard.daily.dayTitle", {
                  date: longDate.format(d),
                })}
              >
                <span className="home-chart__bar">
                  <span className="home-chart__nodata" />
                </span>
              </span>
            ))}
          </div>
          <div className="home-chart__labels" aria-hidden="true">
            {days.map((d, i) => (
              <span
                key={d.toISOString()}
                className="home-chart__label"
                data-today={i === days.length - 1 || undefined}
              >
                {shown[i] ? d.getDate() : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="home-daily__foot">
        <RunLegend
          items={[
            { tone: "pass-navy", label: t("dashboard.daily.pass") },
            { tone: "fail", label: t("dashboard.daily.fail") },
            { tone: "none", label: t("dashboard.daily.none"), line: true },
          ]}
        />
        <span className="home-daily__month">{months}</span>
      </div>
    </section>
  );
}
