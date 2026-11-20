import { describe, expect, it } from "vitest";
import type { FindingView, MetricView } from "@shared/contracts/contract";
import {
  formatMetric,
  formatThreshold,
  groupByRule,
  keyMetrics,
  openBySeverity,
  severityTone,
  standingOf,
  thresholdsOf,
  whereOf,
} from "./findings";

const finding = (over: Partial<FindingView> = {}): FindingView => ({
  id: "f",
  runId: "r",
  shardId: "s",
  ruleId: "image-alt",
  ruleName: "Images must have alternate text",
  severity: "critical",
  rawSeverity: "critical",
  message: "Fix it",
  location: { url: "http://localhost:3000/pay?x=1", selector: "img" },
  fingerprint: "fp",
  standardRefs: ["WCAG2:1.1.1"],
  helpUri: null,
  attributes: { tool: "axe-core" },
  triage: null,
  isNew: false,
  ...over,
});

const metric = (over: Partial<MetricView> = {}): MetricView => ({
  id: "m",
  runId: "r",
  shardId: "s",
  name: "http_req_duration",
  aggregation: "p95",
  scope: null,
  value: 742,
  unit: "ms",
  threshold: null,
  passed: null,
  attributes: {},
  ...over,
});

const triage = (state: string) => ({
  id: "t",
  fingerprint: "fp",
  state,
  reason: "x",
  defectId: null,
  createdBy: "u",
  createdAt: "",
});

describe("findings model (F4)", () => {
  it("says where a finding stands: open, to review or triaged", () => {
    expect(standingOf(finding())).toBe("open");
    expect(standingOf(finding({ attributes: { needsReview: true } }))).toBe(
      "review",
    );
    expect(standingOf(finding({ triage: triage("false_positive") }))).toBe(
      "triaged",
    );
    // Reopened counts as open again.
    expect(standingOf(finding({ triage: triage("open") }))).toBe("open");
    expect(
      openBySeverity([
        finding(),
        finding({ id: "2", severity: "high" }),
        finding({ id: "3", attributes: { needsReview: true } }),
        finding({ id: "4", triage: triage("fixed") }),
      ]),
    ).toEqual({ critical: 1, high: 1 });
  });

  it("groups by rule and tool, worst group first, with every reference once", () => {
    const groups = groupByRule([
      finding({
        id: "1",
        ruleId: "b-rule",
        severity: "low",
        standardRefs: ["X"],
      }),
      finding({ id: "2", ruleId: "a-rule", severity: "medium" }),
      finding({
        id: "3",
        ruleId: "b-rule",
        severity: "high",
        standardRefs: ["X", "Y"],
      }),
      finding({
        id: "4",
        ruleId: "b-rule",
        attributes: { tool: "ESLint" },
        severity: "info",
      }),
    ]);
    expect(
      groups.map((g) => [g.ruleId, g.tool, g.severity, g.findings.length]),
    ).toEqual([
      ["b-rule", "axe-core", "high", 2],
      ["a-rule", "axe-core", "medium", 1],
      ["b-rule", "ESLint", "info", 1],
    ]);
    expect(groups[0].standardRefs).toEqual(["X", "Y"]);
  });

  it("names a location by file and line, or by page and selector", () => {
    expect(
      whereOf(finding({ location: { uri: "src/a.ts", line: 3, column: 5 } })),
    ).toBe("src/a.ts:3:5");
    expect(
      whereOf(finding({ location: { uri: "server/Dockerfile", line: 1 } })),
    ).toBe("server/Dockerfile:1");
    expect(whereOf(finding())).toBe("http://localhost:3000/pay?x=1 · img");
    expect(whereOf(finding({ location: { component: "Pay.submit" } }))).toBe(
      "Pay.submit",
    );
    expect(severityTone("critical")).toBe("error");
    expect(severityTone("medium")).toBe("warning");
  });

  it("formats a metric in its unit and the reader's language", () => {
    expect(formatMetric(metric(), "es")).toBe("742 ms");
    expect(formatMetric(metric({ value: 1.0069 }), "es")).toBe("1,01 ms");
    expect(formatMetric(metric({ value: 2500 }), "en")).toBe("2.5 s");
    expect(formatMetric(metric({ value: 0.004, unit: "ratio" }), "es")).toBe(
      "0,4 %",
    );
    expect(formatMetric(metric({ value: 343.6, unit: "/s" }), "en")).toBe(
      "343.6 /s",
    );
    expect(formatMetric(metric({ value: 2048, unit: "B" }), "en")).toBe("2 kB");
    expect(formatMetric(metric({ value: 41230, unit: "count" }), "en")).toBe(
      "41,230",
    );
  });

  it("writes a threshold in its value's form, for every k6 operator (FIX-48)", () => {
    const rate = (threshold: string) =>
      formatThreshold(metric({ aggregation: "rate", unit: "ratio", threshold }), "es");
    expect(rate("rate<0.01")).toBe("< 1 %");
    expect(rate("rate <= 0.015")).toBe("≤ 1,5 %");
    expect(rate("rate>0.95")).toBe("> 95 %");
    expect(rate("rate>=0.99")).toBe("≥ 99 %");
    expect(rate("rate==0")).toBe("= 0 %");
    expect(rate("rate===1")).toBe("= 100 %");
    expect(rate("rate!=0")).toBe("≠ 0 %");
    // A duration, with or without spaces and parentheses, in either language.
    expect(formatThreshold(metric({ aggregation: "p95", threshold: "p(95) < 500" }), "es")).toBe("< 500 ms");
    expect(formatThreshold(metric({ aggregation: "p(99)", threshold: "p(99)<1500" }), "en")).toBe("< 1.5 s");
    expect(formatThreshold(metric({ aggregation: "count", unit: "count", threshold: "count>=10000" }), "es")).toBe("≥ 10.000");
    // Another aggregation than the metric's, or something unreadable: as written.
    expect(formatThreshold(metric({ aggregation: "count", unit: "count", threshold: "rate>10" }), "es")).toBe("rate>10");
    expect(formatThreshold(metric({ aggregation: "rate", unit: "ratio", threshold: "rate<0.01 && x" }), "es")).toBe("rate<0.01 && x");
  });

  it("shows thresholds and each metric's summary first, checks apart", () => {
    const ms = [
      metric({ id: "1", aggregation: "avg" }),
      metric({
        id: "2",
        aggregation: "p95",
        threshold: "p(95)<500",
        passed: false,
      }),
      metric({
        id: "3",
        name: "http_req_failed",
        aggregation: "rate",
        unit: "ratio",
        threshold: "rate<0.01",
        passed: true,
      }),
      metric({
        id: "4",
        name: "checks",
        aggregation: "rate",
        scope: "::Pago::ok",
      }),
    ];
    expect(keyMetrics(ms).map((m) => m.id)).toEqual(["2", "3"]);
    const t = thresholdsOf(ms);
    expect([t.total, t.passed, t.failed.map((m) => m.id)]).toEqual([
      2,
      1,
      ["2"],
    ]);
  });
});
