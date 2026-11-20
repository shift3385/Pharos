// A size in the reader's language (FIX-44): «0,6 KB», never «0.6 KB». Base
// 1024, as the 200 MB limit. The same rule as the evidence store's sizes
// (admin `formatBytes`); a shared formatter would replace both.

const UNITS = ["B", "KB", "MB", "GB"] as const;

/** `formatSize(1536, "es")` → «1,5 KB». */
export function formatSize(bytes: number, lang: string): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const n = new Intl.NumberFormat(lang, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value);
  return `${n} ${UNITS[unit]}`;
}
