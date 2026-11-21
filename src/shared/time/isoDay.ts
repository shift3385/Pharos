// Calendar days as stored (ISO `YYYY-MM-DD`, local) and as typed or shown
// (`dd/mm/aaaa`). Shared by the plan's «Cronograma» and the `DatePicker`.
// Pure functions.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` of a local date. */
export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today as a local calendar day (`YYYY-MM-DD`). The one way to default a
 *  «Fecha» or date a file name: the first ten characters of `toISOString()`
 *  are the UTC day, which in the evening west of Greenwich is already tomorrow
 *  (FIX-51: a plan made at 20:51 in UTC-4 was dated the next day). */
export const todayIso = (now: Date = new Date()): string => isoOf(now);

/** `HHMMSS` of a local time, for names such as `captura-204512.png`. */
export function localClock(d: Date = new Date()): string {
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join("");
}

/** The local date of an ISO day, or null when `s` is not a real ISO day. */
export function parseIso(s: string): Date | null {
  const m = ISO.exec(s);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
}

export const isIsoDay = (s: string): boolean => parseIso(s) !== null;

/** `dd/mm/aaaa` of an ISO day; anything else is returned as written. */
export function toDisplay(iso: string): string {
  const m = ISO.exec(iso);
  return m && isIsoDay(iso) ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** The ISO day of `d/m/yyyy` or `dd/mm/aaaa` (also with `-` or `.`), or of a
 *  typed ISO day; null when it is not a real day. */
export function fromDisplay(s: string): string | null {
  const t = s.trim();
  if (isIsoDay(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d.getMonth() === +m[2] - 1 && d.getDate() === +m[1] ? isoOf(d) : null;
}

/** `iso` plus `n` days. */
export function addDays(iso: string, n: number): string {
  const d = parseIso(iso) ?? new Date();
  d.setDate(d.getDate() + n);
  return isoOf(d);
}
