import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@shared/ui/Skeleton";
import {
  DAILY_SERIES,
  SPARK_BELOW,
  dayAt,
  toggleSeries,
  xLabels,
  yAxisMax,
  yTicks,
  type DailySeries,
} from "./model/dailyLines";
import type { DailyPoint } from "./model/metrics";

/** Room around the plot for the axis labels, in px. */
const PAD = { top: 10, right: 10, bottom: 20, left: 30 };
/** Size used before the first measurement (and in tests, without layout). */
const FALLBACK = { width: 560, height: 170 };

const LABEL_KEY: Record<DailySeries, string> = {
  passed: "dashboard.daily.pass",
  failed: "dashboard.daily.fail",
  others: "dashboard.daily.other",
};

function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(FALLBACK);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        setSize({ width: Math.floor(r.width), height: Math.floor(r.height) });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(measure);
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return { ref, ...size };
}

/**
 * «Ejecuciones diarias» as one line per state (UX-32, option A approved on
 * 2026-11-10): Pasa, Falla and Otras, 2 px lines in their state colours
 * («Otras» dashed, so it never relies on colour next to «Falla»), a dot with
 * a surface ring on each day above 0. The y axis tops at the highest visible
 * value (at least 5, a clean number); the x axis shows the first day, about
 * one a week and the last, never overlapping. The legend switches series on
 * and off (one always stays). A vertical hairline and a bubble follow the
 * pointer, a tap or the arrow keys. Too narrow, it becomes the total with a
 * bare trend line. Screen readers get a summary and the table.
 */
export function DailyLinesChart({
  points,
  previous = null,
  status,
  label,
  periodText,
}: {
  points: DailyPoint[];
  /** RED-W4: the previous period's days, by position (day 1 with day 1),
   *  drawn as one grey dotted line of their total. */
  previous?: DailyPoint[] | null;
  status: "loading" | "ready" | "error";
  /** The chart's summary for screen readers. */
  label: string;
  periodText: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const { ref, width, height } = useSize();
  const [visible, setVisible] = useState<DailySeries[]>([...DAILY_SERIES]);
  const [active, setActive] = useState<number | null>(null);
  const [said, setSaid] = useState("");
  const ready = status === "ready";
  const num = new Intl.NumberFormat(lang);
  const short = new Intl.DateTimeFormat(lang, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const long = new Intl.DateTimeFormat(lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = Math.max(1, height - PAD.top - PAD.bottom);
  const spark = width < SPARK_BELOW;
  const n = points.length;
  const max = Math.max(
    yAxisMax(points, visible),
    previous ? yAxisMax(previous.map((p) => ({ passed: p.total, failed: 0, others: 0 })), ["passed"]) : 0,
  );
  const xOf = (i: number) =>
    PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const labels = xLabels(
    points.map((p) => p.day),
    plotW,
    lang,
  );
  const total = points.reduce((s, p) => s + p.total, 0);

  const dayText = (i: number) =>
    `${short.format(points[i].day)}: ${visible
      .map((s) => `${t(LABEL_KEY[s])} ${num.format(points[i][s])}`)
      .join(", ")}${
      previous?.[i]
        ? `, ${t("dashboard.compare.tipPrevious", { day: short.format(previous[i].day), count: previous[i].total })}`
        : ""
    }`;

  const show = (i: number | null, fromKeys = false) => {
    setActive(i);
    if (fromKeys && i !== null) setSaid(dayText(i));
  };

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    if (!ready || spark) return;
    const r = e.currentTarget.getBoundingClientRect();
    show(dayAt(e.clientX - r.left - PAD.left, plotW, n));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!ready || n === 0) return;
    const now = active ?? n - 1;
    const next =
      e.key === "ArrowLeft"
        ? Math.max(0, now - 1)
        : e.key === "ArrowRight"
          ? Math.min(n - 1, now + 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : e.key === "Escape"
                ? null
                : undefined;
    if (next === undefined) return;
    e.preventDefault();
    show(next, true);
  };

  if (status === "loading")
    return (
      <div
        className="home-lines home-lines--loading"
        ref={ref}
        data-testid="home-daily"
        role="img"
        aria-label={label}
      >
        <Skeleton shape="block" width="100%" height="100%" />
      </div>
    );

  if (spark && ready) {
    const sparkW = Math.max(1, width - 4);
    const sparkH = Math.max(1, height - 44);
    const top = Math.max(1, ...points.map((p) => p.total));
    const path = points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${(n <= 1 ? sparkW / 2 : (i / (n - 1)) * sparkW) + 2},${sparkH - (p.total / top) * (sparkH - 4) + 2}`,
      )
      .join(" ");
    return (
      <div
        className="home-lines home-lines--spark"
        ref={ref}
        data-testid="home-daily"
        role="img"
        aria-label={label}
      >
        <span className="home-lines__big" aria-hidden="true">
          {num.format(total)}
        </span>
        <svg
          width={sparkW + 4}
          height={sparkH + 4}
          aria-hidden="true"
          className="home-lines__spark"
        >
          <path d={path} />
        </svg>
      </div>
    );
  }

  const tip = active !== null && ready ? points[active] : null;
  const tipLeft = active !== null ? xOf(active) : 0;

  return (
    <>
      <div
        className="home-lines"
        ref={ref}
        tabIndex={ready ? 0 : undefined}
        role="group"
        aria-label={t("dashboard.daily.explore")}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => show(null)}
        onFocus={() => active === null && show(n - 1, true)}
        onBlur={() => show(null)}
        onKeyDown={onKey}
      >
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          data-testid="home-daily"
        >
          {/* Recessive grid: three hairlines with their values. */}
          {yTicks(max).map((v) => (
            <g key={v} className="home-lines__grid">
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={yOf(v)}
                y2={yOf(v)}
              />
              <text x={PAD.left - 6} y={yOf(v)} dy="0.32em" textAnchor="end">
                {num.format(v)}
              </text>
            </g>
          ))}
          {labels.map((l) => (
            <text
              key={l.index}
              className="home-lines__xlabel"
              x={xOf(l.index)}
              y={height - 4}
              textAnchor={
                l.index === 0 && n > 1
                  ? "start"
                  : l.index === n - 1 && n > 1
                    ? "end"
                    : "middle"
              }
              data-testid="home-daily-xlabel"
            >
              {l.text}
            </text>
          ))}
          {tip && (
            <line
              className="home-lines__cross"
              x1={tipLeft}
              x2={tipLeft}
              y1={PAD.top}
              y2={PAD.top + plotH}
            />
          )}
          {ready && previous && previous.length > 1 && (
            <g className="home-lines__series" data-series="previous" data-testid="home-daily-previous">
              <path
                d={previous
                  .map((p, i) => `${i ? "L" : "M"}${xOf(i)},${yOf(p.total)}`)
                  .join(" ")}
              />
            </g>
          )}
          {ready &&
            visible.map((s) => (
              <g key={s} className="home-lines__series" data-series={s}>
                <path
                  d={points
                    .map((p, i) => `${i ? "L" : "M"}${xOf(i)},${yOf(p[s])}`)
                    .join(" ")}
                />
                {points.map((p, i) =>
                  p[s] > 0 ? (
                    <circle
                      key={i}
                      cx={xOf(i)}
                      cy={yOf(p[s])}
                      r={3}
                      data-active={i === active || undefined}
                    />
                  ) : null,
                )}
              </g>
            ))}
        </svg>
        {tip && (
          <div
            className="home-lines__tip"
            style={{
              left: tipLeft,
              transform: `translateX(${tipLeft > width / 2 ? "calc(-100% - 10px)" : "10px"})`,
            }}
            aria-hidden="true"
            data-testid="home-daily-tip"
          >
            <span className="home-lines__tipdate">{short.format(tip.day)}</span>
            {visible.map((s) => (
              <span key={s} className="home-lines__tiprow">
                <span className="home-lines__key" data-series={s} />
                <b>{num.format(tip[s])}</b> {t(LABEL_KEY[s])}
              </span>
            ))}
            {previous?.[active!] && (
              <span className="home-lines__tiprow">
                <span className="home-lines__key" data-series="previous" />
                {t("dashboard.compare.tipPrevious", {
                  day: short.format(previous[active!].day),
                  count: previous[active!].total,
                })}
              </span>
            )}
          </div>
        )}
        <span className="sr-only" aria-live="polite">
          {said}
        </span>
      </div>

      <ul
        className="home-legend home-lines__legend"
        aria-label={t("dashboard.daily.legend")}
      >
        {DAILY_SERIES.map((s) => {
          const on = visible.includes(s);
          return (
            <li key={s} title={t(LABEL_KEY[s])}>
              <button
                type="button"
                className="home-lines__toggle"
                aria-pressed={on}
                aria-disabled={(on && visible.length === 1) || undefined}
                onClick={() => setVisible((v) => toggleSeries(v, s))}
                data-testid={`daily-series-${s}`}
              >
                <span
                  className="home-lines__key"
                  data-series={s}
                  aria-hidden="true"
                />
                <span className="home-legend__label">{t(LABEL_KEY[s])}</span>
              </button>
            </li>
          );
        })}
        {previous && (
          <li title={t("dashboard.compare.legend")}>
            <span className="home-lines__toggle home-lines__toggle--static">
              <span className="home-lines__key" data-series="previous" aria-hidden="true" />
              <span className="home-legend__label">{t("dashboard.compare.legendShort")}</span>
            </span>
          </li>
        )}
      </ul>

      {/* The same numbers as a table, for screen readers (the chart is an image). */}
      {ready && (
        // A table ignores a 1 px height: the wrapper hides it, so it never stretches the page.
        <div className="sr-only home-lines__data">
          <table>
            <caption>
              {t("dashboard.daily.tableCaption", { period: periodText })}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t("dashboard.daily.colDay")}</th>
                {DAILY_SERIES.map((s) => (
                  <th key={s} scope="col">
                    {t(LABEL_KEY[s])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.day.toISOString()}>
                  <th scope="row">{long.format(p.day)}</th>
                  {DAILY_SERIES.map((s) => (
                    <td key={s}>{p[s]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
