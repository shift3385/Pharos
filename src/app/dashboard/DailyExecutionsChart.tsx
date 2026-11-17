import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import { InfoTip } from "@shared/ui/InfoTip";
import { Skeleton } from "@shared/ui/Skeleton";
import { DailyLinesChart } from "./DailyLinesChart";
import type { Period } from "./model/homeData";
import { dailySeries } from "./model/metrics";
import { countDelta, previousRange } from "./model/compare";
import { isoDay, shortDate } from "./model/homeData";
import { DeltaChip } from "./DeltaChip";
import type { MetricsState } from "./model/loadHomeMetrics";
import { MetricsNotice } from "./MetricsNotice";
import { GadgetFitContext } from "./model/fitRows";

/** «Ejecuciones diarias» (SPEC §8, ACTUALIZACION §2, RED-W6): every attempt
 *  recorded on each local day of the period (manual or imported, retries
 *  included) as one line per state: Pasa, Falla, Otras (blocked, skipped)
 *  (UX-32, `DailyLinesChart`). The period total stays by the title; «Ver los
 *  datos» opens the numbers as a table. */
export function DailyExecutionsChart({
  period,
  today,
  state,
  onRetry,
  compare = false,
}: {
  period: Period;
  today: Date;
  state: MetricsState;
  onRetry: () => void;
  /** RED-W4: the previous period as a dashed total line, a delta by the
   *  total and an «Anterior» column. */
  compare?: boolean;
}) {
  const { t, i18n } = useTranslation();
  // On the board (UX-28) the data opens in a dialog instead of a disclosure.
  const fit = useContext(GadgetFitContext);
  const [showData, setShowData] = useState(false);
  const lang = i18n.resolvedLanguage;
  const points = dailySeries(state.data, period, today);
  const total = points.reduce((n, p) => n + p.total, 0);
  const previous = compare ? dailySeries(state.data, period, today, true) : null;
  const previousTotal = previous?.reduce((n, p) => n + p.total, 0) ?? 0;
  const range = previousRange(period, today);
  const dates = t("dashboard.compare.range", {
    from: shortDate(isoDay(range.from), lang),
    to: shortDate(isoDay(range.to), lang),
  });
  const totalDelta = previous ? countDelta(total, previousTotal) : null;
  const totalSaid = !previous
    ? ""
    : totalDelta
      ? t(`dashboard.compare.count_${totalDelta.direction}`, {
          percent: new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(
            Math.abs(totalDelta.value),
          ),
          previous: new Intl.NumberFormat(lang).format(previousTotal),
          dates,
        })
      : t("dashboard.compare.countNone", { dates });
  const undated = state.data?.undated ?? 0;
  const ready = state.status === "ready";
  const periodText = t(`dashboard.period.lower.${period}`);
  const num = new Intl.NumberFormat(lang);
  const longDate = new Intl.DateTimeFormat(lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  // While loading or after an error the days are unknown, not empty.
  const unknown =
    state.status === "loading"
      ? t("dashboard.daily.loading", { period: periodText })
      : t("dashboard.daily.unavailable", { period: periodText });

  const table = (
    <>
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
            {previous && <th scope="col">{t("dashboard.compare.colPrevious")}</th>}
          </tr>
        </thead>
        <tbody>
          {points
            .map((p, i) => ({ p, before: previous?.[i] }))
            .filter(({ p, before }) => p.total || before?.total)
            .map(({ p, before }) => (
              <tr key={p.day.toISOString()}>
                <th scope="row">{longDate.format(p.day)}</th>
                <td>{p.passed}</td>
                <td>{p.failed}</td>
                <td>{p.others}</td>
                <td>{p.manual}</td>
                <td>{p.imported}</td>
                {previous && <td>{before?.total ?? 0}</td>}
              </tr>
            ))}
        </tbody>
      </table>
      {undated > 0 && (
        <p className="home-note">
          {t("dashboard.daily.undatedNote", { count: undated })}
        </p>
      )}
    </>
  );

  return (
    <section
      className="home-card home-daily"
      aria-labelledby="home-daily-title"
      aria-describedby="home-daily-help"
    >
      <div className="home-card__head home-daily__head">
        <div className="home-card__titles">
          <div className="home-card__titleline">
            <h2 id="home-daily-title" className="home-card__title">
              {t("dashboard.daily.title")}
            </h2>
            {/* The subtitle is help behind «?» (UX-28). */}
            <InfoTip id="home-daily-help" label={t("dashboard.daily.title")}>
              {t("dashboard.daily.subtitle", { period: periodText })}
            </InfoTip>
          </div>
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
            {ready ? (
              <>
                {num.format(total)}
                {previous && (
                  <DeltaChip delta={totalDelta} kind="count" said={totalSaid} testId="home-daily-delta" />
                )}
              </>
            ) : state.status === "loading" ? (
              <Skeleton width={44} height={24} />
            ) : (
              "—"
            )}
          </span>
        </div>
      </div>

      <DailyLinesChart
        points={points}
        previous={previous}
        status={
          state.status === "ready"
            ? "ready"
            : state.status === "loading"
              ? "loading"
              : "error"
        }
        label={
          !ready
            ? unknown
            : total
              ? t("dashboard.daily.chartLabel", {
                  period: periodText,
                  count: total,
                })
              : t("dashboard.daily.chartEmpty", { period: periodText })
        }
        periodText={periodText}
      />

      {/* The numbers of each day, for the keyboard and screen readers too
          (a chart is an image): a disclosure with the table. On the board the
          gadget never grows (UX-28), so the table opens in a dialog there. */}
      {ready &&
        (total > 0 || undated > 0 || previousTotal > 0) &&
        (fit ? (
          <>
            <button
              type="button"
              className="home-link home-daily__data"
              aria-haspopup="dialog"
              onClick={() => setShowData(true)}
              data-testid="home-daily-data"
            >
              {t("dashboard.daily.showData")}
            </button>
            {showData && (
              <Dialog
                labelledBy="home-daily-data-title"
                onClose={() => setShowData(false)}
                className="cd home-daily__dialog"
              >
                <h3 id="home-daily-data-title" className="cd__title">
                  {t("dashboard.daily.title")}
                </h3>
                {table}
                <div className="cd__actions">
                  <button
                    type="button"
                    className="ui-btn"
                    onClick={() => setShowData(false)}
                  >
                    {t("common.close")}
                  </button>
                </div>
              </Dialog>
            )}
          </>
        ) : (
          <details className="home-daily__data" data-testid="home-daily-data">
            <summary className="home-link">
              {t("dashboard.daily.showData")}
            </summary>
            {table}
          </details>
        ))}

      <MetricsNotice state={state} onRetry={onRetry} />
    </section>
  );
}
