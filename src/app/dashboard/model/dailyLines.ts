// «Ejecuciones diarias» as lines (UX-32): pure geometry for the chart — the
// y-axis maximum, the x-axis labels that never overlap and the day under a
// pointer. The component only draws what these return.

/** The series of the chart, in their fixed order (colour follows the state). */
export const DAILY_SERIES = ["passed", "failed", "others"] as const;
export type DailySeries = (typeof DAILY_SERIES)[number];

export type DailyValues = Record<DailySeries, number>;

/** Smallest y-axis maximum: a quiet period still has a readable scale. */
export const MIN_Y_MAX = 5;
/** Least room between two x labels, in px («12 oct» is about 36 px). */
export const MIN_LABEL_GAP = 48;
/** Under this plot width the gadget shows the total and a bare trend line. */
export const SPARK_BELOW = 220;

/** Whole-number steps of the y axis: a test runs or not (FIX-25). */
function stepsUpTo(top: number): number[] {
  const out: number[] = [];
  for (let base = 1; base <= Math.max(1, top); base *= 10) out.push(base, 2 * base, 5 * base);
  out.push(10 * 10 ** Math.ceil(Math.log10(Math.max(1, top))));
  return out.filter((s) => s === 1 || s === 2 || s % 5 === 0 || s % 2 === 0);
}

/** Highest value of the visible series, at least 5, rounded up to the first
 *  multiple of a clean whole step (1, 2, 5, 10, 20, 50…) that needs at most 5
 *  steps: 4 → 5, 7 → 8, 12 → 15, 33 → 40, 130 → 150. */
export function yAxisMax(
  points: readonly DailyValues[],
  visible: readonly DailySeries[],
): number {
  const top = Math.max(0, ...points.flatMap((p) => visible.map((s) => p[s])));
  if (top <= MIN_Y_MAX) return MIN_Y_MAX;
  const step = stepsUpTo(top).find((s) => Math.ceil(top / s) <= 5)!;
  return Math.ceil(top / step) * step;
}

/** Gridline values of the y axis: whole numbers only (FIX-25: never «2.5»
 *  executions), the smallest clean step that splits the maximum into at most
 *  5 parts. */
export function yTicks(max: number): number[] {
  const top = Math.max(1, Math.round(max));
  const step = stepsUpTo(top).find((s) => top % s === 0 && top / s <= 5) ?? top;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return ticks;
}

export interface XLabel {
  index: number;
  text: string;
}

/** Day steps tried for the x labels, the smallest that leaves room first.
 *  Periods longer than two weeks label at most once a week. */
const STEPS = [1, 2, 7, 14, 28];

/**
 * The x-axis labels: the first day, every `step` days and the last, with
 * the month when it changes («12 oct», «19», «26», «1 nov», «10»). The step
 * is the smallest that keeps `MIN_LABEL_GAP` px between labels at this
 * `width`; a label too close to the last one is dropped. They never overlap,
 * whatever the period and the gadget's width.
 */
export function xLabels(
  days: readonly Date[],
  width: number,
  lang?: string,
): XLabel[] {
  const n = days.length;
  if (n === 0) return [];
  const dayFmt = new Intl.DateTimeFormat(lang, { day: "numeric" });
  const monthFmt = new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
  });
  if (n === 1) return [{ index: 0, text: monthFmt.format(days[0]) }];
  const px = width / (n - 1);
  const minStep = n > 14 ? 7 : 1;
  const step =
    STEPS.find((s) => s >= minStep && s * px >= MIN_LABEL_GAP) ?? n - 1;
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i += step) idx.push(i);
  // The last day always shows; the one before it goes if they would touch.
  while (idx.length > 1 && (n - 1 - idx[idx.length - 1]) * px < MIN_LABEL_GAP)
    idx.pop();
  if (idx.length === 1 && (n - 1) * px < MIN_LABEL_GAP)
    return [{ index: n - 1, text: monthFmt.format(days[n - 1]) }];
  idx.push(n - 1);
  let month = -1;
  return idx.map((index) => {
    const d = days[index];
    const withMonth = d.getMonth() !== month;
    month = d.getMonth();
    return { index, text: (withMonth ? monthFmt : dayFmt).format(d) };
  });
}

/** The day nearest to `x` px across a plot `width` px wide of `n` days. */
export function dayAt(x: number, width: number, n: number): number {
  if (n <= 1 || width <= 0) return 0;
  return Math.max(0, Math.min(n - 1, Math.round((x / width) * (n - 1))));
}

/** The visible series after toggling `s`: never none left. */
export function toggleSeries(
  visible: readonly DailySeries[],
  s: DailySeries,
): DailySeries[] {
  if (visible.includes(s)) {
    return visible.length > 1 ? visible.filter((v) => v !== s) : [...visible];
  }
  return DAILY_SERIES.filter((v) => v === s || visible.includes(v));
}
