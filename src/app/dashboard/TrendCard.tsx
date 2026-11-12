import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { InfoTip } from "@shared/ui/InfoTip";
import { Select } from "@shared/ui/Select";
import {
  OP_SYMBOL,
  TREND_KINDS,
  formatMetric,
  metricDelta,
  metricLabelKey,
  type MetricKind,
  type MetricOp,
} from "@shared/metrics/catalog";
import type { HomeProject } from "./model/homeData";
import { byProject } from "./model/metrics";
import type { MetricsState } from "./model/loadHomeMetrics";
import {
  ALERT_STEPS,
  lastTwoClosed,
  offTarget,
  targetOf,
  trendAxis,
  trendProject,
  trendSeries,
  worseningSteps,
} from "./model/trend";
import { MetricsNotice } from "./MetricsNotice";

const VERDICT_TONE: Record<string, string> = { go: "pass", goWithRisks: "warn", noGo: "fail" };

/** The card's own size: what fits decides the side summary and the minis
 *  (UX-28: never a scroll inside a gadget). */
function useBox() {
  const ref = useRef<HTMLElement>(null);
  const [box, setBox] = useState({ width: 900, height: 320 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setBox({ width: Math.floor(r.width), height: Math.floor(r.height) });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(measure);
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return { ref, ...box };
}

/** Width and height of the chart's drawing (it scales to its box). */
const W = 560;
const H = 200;
const PAD = { left: 34, right: 12, top: 14, bottom: 38 };

/** «Tendencia de ciclos» (DOC-06, boceto C, ADR-0041): one of the six
 *  classic metrics across the project's last closed cycles (the figures
 *  frozen at closing) and its active cycle (live, dashed), with the plan's
 *  target as a line and each cycle's verdict as a dot under it. A metric
 *  that gets worse two closed cycles in a row, or is off target, says so.
 *  The row of minis switches the metric; it, and then the side summary,
 *  leave first when the gadget is small. */
export function TrendCard({
  projects,
  state,
  onRetry,
}: {
  projects: HomeProject[];
  state: MetricsState;
  onRetry: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const { ref, width, height } = useBox();
  const [chosen, setChosen] = useState<string | null>(null);
  const [kind, setKind] = useState<MetricKind>("passRate");
  const pm = byProject(state.data);
  const project = trendProject(projects, chosen, (id) => pm.get(id)?.trend ?? []);
  const metrics = project ? pm.get(project.id) : undefined;
  const points = metrics?.trend ?? [];
  const series = trendSeries(points, kind);
  const target = targetOf(metrics, kind);
  const axis = trendAxis(kind, series.map((p) => p.value), target);
  const [last, before] = lastTwoClosed(series);
  const delta = last && before ? metricDelta(kind, last.value, before.value, lang) : null;
  const steps = worseningSteps(series, kind);
  const ready = state.status === "ready";
  const showSide = width >= 560;
  const showMinis = height >= 300 && width >= 520;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const xOf = (i: number) => PAD.left + (series.length <= 1 ? plotW / 2 : (i * plotW) / (series.length - 1));
  const yOf = (v: number) => PAD.top + plotH - (Math.min(v, axis.max) / axis.max) * plotH;
  const drawn = series.map((p, i) => ({ ...p, x: xOf(i), y: p.value === null ? null : yOf(p.value) }));
  const closedPath = drawn
    .filter((p) => !p.active && p.y !== null)
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
  const lastClosed = [...drawn].reverse().find((p) => !p.active && p.y !== null);
  const live = drawn.find((p) => p.active && p.y !== null);
  const name = t(metricLabelKey(kind));
  const targetText = target ? `${OP_SYMBOL[target.op as MetricOp] ?? target.op} ${formatMetric(kind, target.target, lang)}` : "";

  return (
    <section
      ref={ref}
      className="home-card home-trend"
      aria-labelledby="home-trend-title"
      aria-describedby="home-trend-help"
      data-testid="home-trend"
    >
      <div className="home-card__head home-card__head--nowrap">
        <div className="home-card__titles">
          <div className="home-card__titleline">
            <h2 id="home-trend-title" className="home-card__title">
              {t("dashboard.trend.title")}
            </h2>
            <InfoTip id="home-trend-help" label={t("dashboard.trend.title")}>
              {t("dashboard.trend.help")}
            </InfoTip>
          </div>
        </div>
        {projects.length > 1 && project && (
          <Select
            aria-label={t("dashboard.trend.project")}
            value={project.id}
            onChange={setChosen}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            data-testid="home-trend-project"
          />
        )}
        <Select
          aria-label={t("dashboard.trend.metric")}
          value={kind}
          onChange={(v) => setKind(v as MetricKind)}
          options={TREND_KINDS.map((k) => ({ value: k, label: t(metricLabelKey(k)) }))}
          data-testid="home-trend-metric"
        />
      </div>

      {!ready ? (
        state.status === "error" ? (
          <MetricsNotice state={state} onRetry={onRetry} />
        ) : (
          <p className="home-note">{t("common.loading")}</p>
        )
      ) : series.length === 0 ? (
        <p className="home-empty home-empty--left" data-testid="home-trend-empty">
          {t("dashboard.trend.empty")}
        </p>
      ) : (
        <div className={`home-trend__body${showSide ? "" : " home-trend__body--narrow"}`}>
          <figure className="home-trend__chart">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={t("dashboard.trend.chartLabel", { metric: name, count: series.length })}
            >
              {axis.ticks.map((v) => (
                <g key={v}>
                  <line className="home-trend__grid" x1={PAD.left} x2={W - PAD.right} y1={yOf(v)} y2={yOf(v)} />
                  <text className="home-trend__axis" x={PAD.left - 6} y={yOf(v) + 4} textAnchor="end">
                    {v}
                  </text>
                </g>
              ))}
              {target && (
                <g>
                  <line
                    className="home-trend__target"
                    x1={PAD.left}
                    x2={W - PAD.right}
                    y1={yOf(target.target)}
                    y2={yOf(target.target)}
                  />
                  <text className="home-trend__target-label" x={W - PAD.right} y={yOf(target.target) - 5} textAnchor="end">
                    {t("dashboard.trend.target", { target: targetText })}
                  </text>
                </g>
              )}
              {closedPath && <polyline className="home-trend__line" points={closedPath} />}
              {lastClosed && live && (
                <line className="home-trend__line home-trend__line--live" x1={lastClosed.x} y1={lastClosed.y!} x2={live.x} y2={live.y!} />
              )}
              {drawn.map((p) => (
                <g key={p.cycleId}>
                  {p.y !== null && (
                    <circle
                      className={`home-trend__dot${p.active ? " home-trend__dot--live" : ""}${offTarget(p.value, target) ? " is-off" : ""}`}
                      cx={p.x}
                      cy={p.y}
                      r={4.5}
                    >
                      <title>{`${p.cycleKey} · ${formatMetric(kind, p.value, lang)}`}</title>
                    </circle>
                  )}
                  <text className="home-trend__axis" x={p.x} y={H - 20} textAnchor="middle">
                    {p.cycleKey}
                  </text>
                  <circle
                    className="home-trend__verdict"
                    data-tone={p.verdict ? VERDICT_TONE[p.verdict] : "open"}
                    cx={p.x}
                    cy={H - 7}
                    r={4}
                  >
                    <title>{p.verdict ? t(`gate.verdict.${p.verdict}`) : t("dashboard.trend.open")}</title>
                  </circle>
                </g>
              ))}
            </svg>
            {/* The same numbers for a screen reader. */}
            <table className="sr-only">
              <caption>{name}</caption>
              <tbody>
                {series.map((p) => (
                  <tr key={p.cycleId}>
                    <th scope="row">{p.cycleKey}</th>
                    <td>{formatMetric(kind, p.value, lang)}</td>
                    <td>{p.verdict ? t(`gate.verdict.${p.verdict}`) : t("dashboard.trend.open")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>
          {showSide && (
            <div className="home-trend__side">
              {last ? (
                <div>
                  <span className="home-trend__eyebrow">{t("dashboard.trend.lastClosed", { cycle: last.cycleKey })}</span>
                  <b className="home-trend__big" data-testid="home-trend-last">
                    {formatMetric(kind, last.value, lang)}
                  </b>
                  {delta && (
                    <span className={`home-note ${delta.better === null ? "" : delta.better ? "is-better" : "is-worse"}`}>
                      {t("dashboard.trend.delta", { delta: delta.text, cycle: before!.cycleKey })}
                    </span>
                  )}
                </div>
              ) : (
                <p className="home-note">{t("dashboard.trend.noClosed")}</p>
              )}
              {(steps >= ALERT_STEPS || (last && offTarget(last.value, target))) && (
                <p className="home-trend__alert" role="status" data-testid="home-trend-alert">
                  <b>
                    {steps >= ALERT_STEPS
                      ? t("dashboard.trend.worsening", { metric: name, count: steps })
                      : t("dashboard.trend.offTarget", { metric: name })}
                  </b>
                  {target && t("dashboard.trend.targetIs", { target: targetText })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {ready && showMinis && points.length > 0 && (
        <div className="home-trend__minis" role="group" aria-label={t("dashboard.trend.metric")}>
          {TREND_KINDS.map((k) => {
            const s = trendSeries(points, k);
            const [l] = lastTwoClosed(s);
            const tg = targetOf(metrics, k);
            const warn = worseningSteps(s, k) >= ALERT_STEPS || (l !== null && offTarget(l.value, tg));
            const vals = s.filter((p) => p.value !== null).map((p) => p.value!);
            const lo = Math.min(...vals);
            const hi = Math.max(...vals);
            const pts = s
              .map((p, i) =>
                p.value === null
                  ? null
                  : `${(4 + (i * 92) / Math.max(1, s.length - 1)).toFixed(1)},${(19 - ((p.value - lo) / (hi - lo || 1)) * 15).toFixed(1)}`,
              )
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={k}
                type="button"
                className={`home-trend__mini${k === kind ? " is-on" : ""}${warn ? " is-warn" : ""}`}
                aria-pressed={k === kind}
                onClick={() => setKind(k)}
              >
                <span>{t(metricLabelKey(k))}</span>
                <b>{formatMetric(k, l?.value ?? null, lang)}</b>
                <svg viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true">
                  {pts && <polyline points={pts} />}
                </svg>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
