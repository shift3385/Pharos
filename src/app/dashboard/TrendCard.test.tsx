import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import type { CycleTrendPoint, MetricValues } from "@shared/contracts/contract";
import type { HomeProject } from "./model/homeData";
import type { MetricsState } from "./model/loadHomeMetrics";
import { homeMetrics, projectMetrics } from "./model/metricsFixture";
import { lastTwoClosed, targetOf, trendAxis, trendSeries, worseningSteps } from "./model/trend";
import { TrendCard } from "./TrendCard";

const values = (over: Partial<MetricValues>): MetricValues => ({
  executed: 100,
  passRate: 90,
  criticalDefects: 0,
  coverage: 100,
  defectDensity: 3,
  escapedDefects: 0,
  fixTime: 3,
  reopenRate: 5,
  flakyRate: 2,
  ...over,
});

const point = (n: number, over: Partial<MetricValues>, verdict: string | null = "go"): CycleTrendPoint => ({
  cycleId: `c${n}`,
  cycleKey: `CYC-00${n}`,
  title: `Regresión ${n}`,
  status: verdict === null ? "active" : "closed",
  closedAt: verdict === null ? null : `2026-11-0${n}T10:00:00.000Z`,
  verdict,
  values: values(over),
});

const TREND = [
  point(1, { passRate: 78, reopenRate: 8 }, "noGo"),
  point(2, { passRate: 84, reopenRate: 11 }, "goWithRisks"),
  point(3, { passRate: 88, reopenRate: 12 }, "goWithRisks"),
  point(4, { passRate: 92, reopenRate: 14 }, "go"),
  point(5, { passRate: 86, reopenRate: 9 }, null),
];

const portal: HomeProject = { id: "p1", name: "Portal", key: "PCL", closeDate: null, hasPlan: true, criteria: [] };

const ready = (trend: CycleTrendPoint[]): MetricsState => ({
  status: "ready",
  data: homeMetrics({
    projects: [
      projectMetrics("p1", {
        trend,
        objectives: [{ kind: "reopenRate", op: "<=", target: 10 }],
        exitCriteria: [
          { index: 0, criterion: "Tasa de éxito", metric: "≥ 90%", kind: "passRate", op: ">=", target: 90, value: 86, met: false, blocking: true },
        ],
      }),
    ],
  }),
  refreshing: false,
  stale: false,
  at: 0,
});

beforeEach(async () => {
  await i18n.changeLanguage("es");
});

describe("the cycle trend (DOC-06)", () => {
  it("reads one metric across the cycles, the plan's target and a worsening streak", () => {
    const s = trendSeries(TREND, "reopenRate");
    expect(s.map((p) => p.value)).toEqual([8, 11, 12, 14, 9]);
    expect(s.map((p) => p.active)).toEqual([false, false, false, false, true]);
    // The live cycle does not break the streak: it is not over.
    expect(worseningSteps(s, "reopenRate")).toBe(3);
    expect(worseningSteps(trendSeries(TREND, "passRate"), "passRate")).toBe(0);
    const [last, before] = lastTwoClosed(s);
    expect([last?.cycleKey, before?.cycleKey]).toEqual(["CYC-004", "CYC-003"]);
    const m = ready(TREND).data!.projects[0];
    // The exit criterion first, else the plan's objective.
    expect(targetOf(m, "passRate")).toEqual({ op: ">=", target: 90 });
    expect(targetOf(m, "reopenRate")).toEqual({ op: "<=", target: 10 });
    expect(targetOf(m, "fixTime")).toBeNull();
  });

  it("draws whole-number axes: percentages 0–100, the rest up to a clean number over the target", () => {
    expect(trendAxis("passRate", [50], null)).toEqual({ max: 100, ticks: [0, 25, 50, 75, 100] });
    const days = trendAxis("fixTime", [2.4, 6.6], { op: "<=", target: 3 });
    expect(days.ticks.every(Number.isInteger)).toBe(true);
    expect(days.max).toBeGreaterThanOrEqual(7);
    expect(trendAxis("escapedDefects", [0, 1], null)).toEqual({ max: 5, ticks: [0, 1, 2, 3, 4, 5] });
  });

  it("shows the chosen metric with its last closed value and warns when it keeps getting worse", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TrendCard projects={[portal]} state={ready(TREND)} onRetry={() => {}} />);
    const card = screen.getByTestId("home-trend");
    expect(within(card).getByRole("img", { name: "Tasa de éxito en 5 ciclos" })).toBeInTheDocument();
    expect(within(card).getByTestId("home-trend-last")).toHaveTextContent("92 %");
    expect(card).toHaveTextContent("+4 frente a CYC-003");
    // On target and improving: no warning.
    expect(within(card).queryByTestId("home-trend-alert")).toBeNull();
    // The screen-reader table carries every cycle and its verdict.
    expect(within(card).getByRole("row", { name: "CYC-001 78 % No-go" })).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: /^Reapertura/ }));
    expect(within(card).getByTestId("home-trend-alert")).toHaveTextContent(
      "Reapertura: empeora 3 ciclos seguidosObjetivo del plan: ≤ 10 %.",
    );
    await expectNoAxeViolations(card);
  });

  it("says what to do when a project has no cycle yet", () => {
    renderWithProviders(<TrendCard projects={[portal]} state={ready([])} onRetry={() => {}} />);
    expect(screen.getByTestId("home-trend-empty")).toHaveTextContent("La tendencia aparece al cerrar el primero");
  });
});
