// The one format for numbers with a unit (FIX-46), the companion of
// `percent.ts`: the number in the reader's language («0,2 KB» in Spanish,
// «0.2 KB» in English), a space and the unit. Sizes, speeds and durations go
// through here instead of `toFixed`.
import i18next from "i18next";

export interface NumberOptions {
  /** The language; the app's current one when left out. */
  lang?: string;
  /** Most decimals shown (a whole number shows none): 1 by default. */
  digits?: number;
}

const current = () => i18next.resolvedLanguage ?? i18next.language ?? "es";

/** A decimal number in the reader's language: `formatNumber(0.25)` → «0,3». */
export function formatNumber(value: number | null | undefined, { lang, digits = 1 }: NumberOptions = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(lang ?? current(), { maximumFractionDigits: digits }).format(value);
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** A size in bytes with the unit that fits (base 1024, as the 200 MB limit):
 *  `formatBytes(205)` → «205 B», `formatBytes(1536)` → «1,5 KB». */
export function formatBytes(bytes: number | null | undefined, { lang, digits = 1 }: NumberOptions = {}): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  let value = bytes;
  let unit = 0;
  while (Math.abs(value) >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${formatNumber(value, { lang, digits: unit === 0 ? 0 : digits })} ${UNITS[unit]}`;
}
