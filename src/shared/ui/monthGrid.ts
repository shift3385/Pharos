// The month calendar's geometry and keys, shared by the plan's «Cronograma»
// (ScheduleCalendar) and the `DatePicker` (UX-36): weeks start on Monday, and
// the WAI-ARIA grid keys move the focused day. Pure functions.
import { addDays, isoOf, parseIso } from "@shared/time/isoDay";

/** One day of each weekday, Monday first (2024-01-01 was a Monday). */
export const WEEKDAYS: readonly Date[] = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i));

/** Weekday names for a column header: short (lower case in Spanish, as
 *  `Intl` writes them, without the dot) and long (its tooltip). */
export function weekdayFormats(lang: string) {
  const short = new Intl.DateTimeFormat(lang, { weekday: "short" });
  const long = new Intl.DateTimeFormat(lang, { weekday: "long" });
  return WEEKDAYS.map((d) => ({ key: d.getDay(), short: short.format(d).replace(".", ""), long: long.format(d) }));
}

/** «Noviembre de 2026»: the month's name and year, with a capital. */
export function monthTitle(lang: string, year: number, month: number): string {
  const s = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(new Date(year, month, 1));
  return s.charAt(0).toLocaleUpperCase(lang) + s.slice(1);
}

/** The weeks of a month (0-based `month`, may be out of 0–11): day numbers,
 *  `null` for the slots before the 1st and after the last day. */
export function monthWeeks(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const slots: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (slots.length % 7) slots.push(null);
  return Array.from({ length: slots.length / 7 }, (_, w) => slots.slice(w * 7, w * 7 + 7));
}

/** The day a grid key moves to from `day` (WAI-ARIA date grid): arrows a day
 *  or a week, Home/End the week's first and last day, PageUp/PageDown a month
 *  (the same day, or the month's last). `null` for any other key. */
export function moveDay(day: string, key: string): string | null {
  const d = parseIso(day);
  if (!d) return null;
  const dow = (d.getDay() + 6) % 7;
  switch (key) {
    case "ArrowLeft":
      return addDays(day, -1);
    case "ArrowRight":
      return addDays(day, 1);
    case "ArrowUp":
      return addDays(day, -7);
    case "ArrowDown":
      return addDays(day, 7);
    case "Home":
      return addDays(day, -dow);
    case "End":
      return addDays(day, 6 - dow);
    case "PageUp":
    case "PageDown": {
      const m = new Date(d.getFullYear(), d.getMonth() + (key === "PageUp" ? -1 : 1), 1);
      const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      return isoOf(new Date(m.getFullYear(), m.getMonth(), Math.min(d.getDate(), last)));
    }
    default:
      return null;
  }
}
