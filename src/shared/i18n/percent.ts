// The one percentage format of the app (FIX-43): the number in the reader's
// language («33,3 %» in Spanish, «33.3 %» in English), a space and «%».
// Screens, reports and exports go through here instead of `toFixed`.
import i18next from "i18next";

export interface PercentOptions {
  /** The language; the app's current one when left out. */
  lang?: string;
  /** Most decimals shown (a whole number shows none): 1 by default. */
  digits?: number;
}

/** A value already in percent (0–100): `formatPercent(33.333)` → «33,3 %». */
export function formatPercent(value: number | null | undefined, { lang, digits = 1 }: PercentOptions = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const n = new Intl.NumberFormat(lang ?? i18next.resolvedLanguage ?? i18next.language ?? "es", {
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(value);
  return `${n} %`;
}

/** A ratio (0–1) as a percentage: `formatRatio(1 / 3)` → «33,3 %». */
export function formatRatio(ratio: number | null | undefined, options: PercentOptions = {}): string {
  return ratio === null || ratio === undefined ? "—" : formatPercent(ratio * 100, options);
}
