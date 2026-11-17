// «Comparar con el periodo anterior» (RED-W4): the previous period has the
// same length and ends where the chosen one starts. Only the numbers of the
// period compare (the pass rate and the daily executions); the rest of
// Inicio is the state of play. Pure helpers; presentation only.

import { previousDays, type Period } from "./homeData";

export type DeltaDirection = "up" | "down" | "flat";

export interface Delta {
  /** The signed difference: percentage points for a rate, a ratio of the
   *  previous value (0.18 = +18 %) for a count. */
  value: number;
  direction: DeltaDirection;
}

const direction = (v: number): DeltaDirection => (v > 0 ? "up" : v < 0 ? "down" : "flat");

/** Difference of two rates (0..1) in percentage points, rounded to one
 *  decimal; null when either is unknown. */
export function rateDelta(current: number | null | undefined, previous: number | null | undefined): Delta | null {
  if (current == null || previous == null) return null;
  const value = Math.round((current - previous) * 1000) / 10;
  return { value, direction: direction(value) };
}

/** Relative difference of two counts, rounded to a whole percent; null
 *  when the previous one is 0 (no «▲ ∞»). */
export function countDelta(current: number, previous: number): Delta | null {
  if (previous <= 0) return null;
  const value = Math.round(((current - previous) / previous) * 100) / 100;
  return { value, direction: direction(value) };
}

/** First and last day of the previous period, for its tooltip and hint. */
export function previousRange(period: Period, today: Date): { from: Date; to: Date } {
  const days = previousDays(period, today);
  return { from: days[0], to: days[days.length - 1] };
}

export const COMPARE_KEY = "pharos.home.compare";

/** The comparison is a per-device convenience, as the period: off unless
 *  this device turned it on. */
export function storedCompare(): boolean {
  try {
    return localStorage.getItem(COMPARE_KEY) === "1";
  } catch {
    return false;
  }
}

export function storeCompare(on: boolean) {
  try {
    localStorage.setItem(COMPARE_KEY, on ? "1" : "0");
  } catch {
    // Per-device convenience only.
  }
}
