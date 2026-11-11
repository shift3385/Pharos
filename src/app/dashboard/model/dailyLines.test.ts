import { describe, expect, it } from "vitest";
import {
  MIN_LABEL_GAP,
  dayAt,
  toggleSeries,
  xLabels,
  yAxisMax,
  type DailyValues,
} from "./dailyLines";

const v = (passed: number, failed = 0, others = 0): DailyValues => ({ passed, failed, others });

/** `n` consecutive days ending on 10 Nov 2026. */
const days = (n: number) =>
  Array.from({ length: n }, (_, i) => new Date(2026, 10, 10 - (n - 1 - i)));

describe("«Ejecuciones diarias» as lines (UX-32)", () => {
  it("tops the y axis at the highest visible value, never under 5, on a clean number", () => {
    expect(yAxisMax([v(0)], ["passed"])).toBe(5);
    expect(yAxisMax([v(3, 1)], ["passed", "failed"])).toBe(5);
    expect(yAxisMax([v(6)], ["passed"])).toBe(10);
    expect(yAxisMax([v(11)], ["passed"])).toBe(15);
    expect(yAxisMax([v(31)], ["passed"])).toBe(35);
    expect(yAxisMax([v(73)], ["passed"])).toBe(80);
    expect(yAxisMax([v(240)], ["passed"])).toBe(250);
    // Only the visible series count: hiding the big one rescales.
    expect(yAxisMax([v(40, 3)], ["passed", "failed"])).toBe(40);
    expect(yAxisMax([v(40, 3)], ["failed"])).toBe(5);
  });

  it.each([7, 14, 30])("labels %i days without ever overlapping, at any width", (n) => {
    for (const width of [160, 220, 300, 420, 640, 900]) {
      const labels = xLabels(days(n), width, "es");
      const px = width / (n - 1);
      expect(labels.length, `${n} days at ${width}px`).toBeGreaterThan(0);
      // The last day always shows.
      expect(labels.at(-1)!.index).toBe(n - 1);
      for (let i = 1; i < labels.length; i++)
        expect((labels[i].index - labels[i - 1].index) * px, `${n} days at ${width}px`).toBeGreaterThanOrEqual(
          MIN_LABEL_GAP,
        );
    }
  });

  it("shows the first day, one a week and the last, with the month where it changes", () => {
    const labels = xLabels(days(30), 640, "es");
    expect(labels.map((l) => l.text)).toEqual(["12 oct", "19", "26", "2 nov", "10"]);
    // A week never shows more than a few labels.
    expect(xLabels(days(30), 2000, "es").length).toBeLessThanOrEqual(6);
    // A single day («Hoy»): its date.
    expect(xLabels(days(1), 300, "es")).toEqual([{ index: 0, text: "10 nov" }]);
  });

  it("never lets the legend hide the last series", () => {
    expect(toggleSeries(["passed", "failed", "others"], "failed")).toEqual(["passed", "others"]);
    expect(toggleSeries(["passed"], "passed")).toEqual(["passed"]);
    // Shown again in its fixed place (colour follows the state, not the order).
    expect(toggleSeries(["others"], "passed")).toEqual(["passed", "others"]);
  });

  it("finds the day under the pointer: a band per day, wider than the dot", () => {
    expect(dayAt(0, 300, 7)).toBe(0);
    expect(dayAt(300, 300, 7)).toBe(6);
    expect(dayAt(140, 300, 7)).toBe(3);
    expect(dayAt(-20, 300, 7)).toBe(0);
    expect(dayAt(999, 300, 7)).toBe(6);
  });
});
