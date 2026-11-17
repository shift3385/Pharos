import { useTranslation } from "react-i18next";
import type { Delta } from "./model/compare";

/** The difference with the previous period (RED-W4) as a small chip on the
 *  number's row, so it adds no row to the board (UX-27/28). A rate shows
 *  percentage points coloured by direction (more passing is better); a
 *  count shows a percent in a neutral tone (more executions is not «better»).
 *  Without a previous value it says so, never «▲ ∞». `said` is the full
 *  sentence for screen readers and the tooltip. */
export function DeltaChip({
  delta,
  kind,
  said,
  compact = false,
  testId,
}: {
  delta: Delta | null;
  kind: "rate" | "count";
  said: string;
  /** Only the arrow and the figure (narrow gadgets). */
  compact?: boolean;
  testId?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  if (!delta)
    return (
      <span className="home-delta" data-direction="none" title={said} data-testid={testId}>
        <span aria-hidden="true">{t("dashboard.compare.noPrevious")}</span>
        <span className="sr-only">{said}</span>
      </span>
    );
  const arrow = delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "=";
  const figure =
    kind === "rate"
      ? new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(delta.value))
      : new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(Math.abs(delta.value));
  const unit = kind === "rate" ? ` ${t("dashboard.compare.pp")}` : "";
  return (
    <span
      className="home-delta"
      data-direction={delta.direction}
      data-kind={kind}
      title={said}
      data-testid={testId}
    >
      <span aria-hidden="true">
        {arrow} {figure}
        {unit}
        {!compact && kind === "count" ? ` ${t("dashboard.compare.vsPrevious")}` : ""}
      </span>
      <span className="sr-only">{said}</span>
    </span>
  );
}
