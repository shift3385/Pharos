// «Tendencia de ciclos» (DOC-06, boceto C): pure functions over the trend the
// Home metrics carry per project (`HomeProject.trend`, last closed cycles
// frozen at closing, then the active one, live).

import type { CycleTrendPoint, HomeProject } from "@shared/contracts/contract";
import {
  HIGHER_IS_BETTER,
  METRIC_UNIT,
  meets,
  type MetricKind,
} from "@shared/metrics/catalog";
import { yAxisMax, yTicks } from "./dailyLines";

export interface TrendPoint {
  cycleId: string;
  cycleKey: string;
  title: string;
  active: boolean;
  verdict: string | null;
  value: number | null;
}

export interface Target {
  op: string;
  target: number;
}

/** One metric across the cycles, oldest first. */
export function trendSeries(points: readonly CycleTrendPoint[], kind: MetricKind): TrendPoint[] {
  return points.map((p) => ({
    cycleId: p.cycleId,
    cycleKey: p.cycleKey,
    title: p.title,
    active: p.status !== "closed",
    verdict: p.verdict,
    value: p.values[kind],
  }));
}

/** The plan's target for a metric: the exit criterion that measures it,
 *  else the plan's objective (PLN-06); null when the plan sets none. */
export function targetOf(project: HomeProject | undefined, kind: MetricKind): Target | null {
  if (!project) return null;
  const c = project.exitCriteria.find((e) => e.kind === kind && e.op !== null && e.target !== null);
  if (c) return { op: c.op!, target: c.target! };
  const o = project.objectives.find((x) => x.kind === kind);
  return o ? { op: o.op, target: o.target } : null;
}

export const offTarget = (value: number | null, t: Target | null): boolean =>
  value !== null && t !== null && !meets(value, t.op, t.target);

/** Consecutive worsening steps at the end of the closed cycles (the live
 *  one does not count: it is not over). «Empeora 3 ciclos seguidos» is three
 *  steps, four cycles. */
export function worseningSteps(series: readonly TrendPoint[], kind: MetricKind): number {
  const closed = series.filter((p) => !p.active && p.value !== null);
  let n = 0;
  for (let i = closed.length - 1; i > 0; i--) {
    const d = closed[i].value! - closed[i - 1].value!;
    const worse = HIGHER_IS_BETTER[kind] ? d < 0 : d > 0;
    if (!worse) break;
    n++;
  }
  return n;
}

/** Steps from which the trend warns (D-6 boceto: «empeora 3 ciclos seguidos»
 *  was the example; two steps already make a trend, not a blip). */
export const ALERT_STEPS = 2;

/** The y axis: percentages always 0–100 in quarters; anything else up to a
 *  clean whole number with whole-number lines (FIX-25), the target in view. */
export function trendAxis(kind: MetricKind, values: readonly (number | null)[], target: Target | null) {
  if (METRIC_UNIT[kind] === "percent") return { max: 100, ticks: [0, 25, 50, 75, 100] };
  const top = Math.max(0, ...values.map((v) => v ?? 0), target?.target ?? 0);
  const max = yAxisMax([{ passed: Math.ceil(top), failed: 0, others: 0 }], ["passed"]);
  return { max, ticks: yTicks(max) };
}

/** The last closed cycle and the one before it, for the side summary. */
export function lastTwoClosed(series: readonly TrendPoint[]): [TrendPoint | null, TrendPoint | null] {
  const closed = series.filter((p) => !p.active);
  return [closed[closed.length - 1] ?? null, closed[closed.length - 2] ?? null];
}

/** The project the gadget opens on: the chosen one if it still exists, else
 *  the first with closed cycles, else the first. */
export function trendProject<T extends { id: string }>(
  projects: readonly T[],
  chosen: string | null,
  trendOf: (id: string) => readonly CycleTrendPoint[],
): T | null {
  return (
    projects.find((p) => p.id === chosen) ??
    projects.find((p) => trendOf(p.id).some((c) => c.status === "closed")) ??
    projects[0] ??
    null
  );
}
