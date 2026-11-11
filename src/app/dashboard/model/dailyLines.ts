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

/** Highest value of the visible series, at least 5, rounded up to a clean
 *  number: a multiple of 5 up to 50, then 1, 2 or 5 × 10ⁿ steps. */
export function yAxisMax(
  points: readonly DailyValues[],
  visible: readonly DailySeries[],
): number {
  const top = Math.max(0, ...points.flatMap((p) => visible.map((s) => p[s])));
  if (top <= MIN_Y_MAX) return MIN_Y_MAX;
  if (top <= 50) return Math.ceil(top / 5) * 5;
  const base = 10 ** Math.floor(Math.log10(top));
  const step = [0.1, 0.2, 0.5, 1]
    .map((k) => k * base)
    .find((s) => top / s <= 10)!;
  return Math.ceil(top / step) * step;
}

/** Gridline values of the y axis: 0, the middle and the maximum. */
export function yTicks(max: number): number[] {
  return [0, max / 2, max];
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
