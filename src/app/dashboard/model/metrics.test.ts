import { describe, expect, it } from "vitest";
import type { HomeProject } from "./homeData";
import {
  axisMax,
  dailySeries,
  execRow,
  executionKpis,
  exitStatus,
  metricsKey,
  metricsRequest,
  queueCounts,
  queueRows,
} from "./metrics";
import { counts, day, homeMetrics, projectMetrics, ref, rollup } from "./metricsFixture";

const now = new Date(2026, 9, 29, 10, 0); // 29 Oct 2026, 10:00 local

const project = (over: Partial<HomeProject>): HomeProject => ({
  id: "p",
  name: "P",
  key: "P",
  cases: [],
  closeDate: null,
  hasPlan: false,
  criteria: [],
  openDefects: 0,
  criticalDefects: 0,
  ...over,
});

const portal = project({
  id: "pcl",
  name: "Portal",
  cases: [
    { id: "1", scenarioId: "PCL-0002", title: "Pago", priority: "medium" },
    { id: "2", scenarioId: "PCL-0001", title: "Login", priority: "critical" },
    { id: "4", scenarioId: "PCL-0003", title: "Logout", priority: "low" },
  ],
  openDefects: 9,
  criticalDefects: 9,
});
const banca = project({
  id: "amb",
  name: "Banca",
  cases: [{ id: "3", scenarioId: "AMB-0001", title: "Saldo", priority: "high" }],
  openDefects: 1,
});

describe("home metrics request (RED-W6)", () => {
  it("covers 30 local days ending today, as local midnights", () => {
    const r = metricsRequest(now);
    expect(r.dayStarts).toHaveLength(30);
    expect(r.dayStarts.at(-1)).toBe(new Date(2026, 9, 29).getTime());
    expect(r.dayStarts[0]).toBe(new Date(2026, 8, 30).getTime());
    expect(r.now).toBe(now.getTime());
  });

  it("gives every period its first day as an index into the days", () => {
    expect(metricsRequest(now).windows).toEqual([
      { id: "today", fromIndex: 29 },
      { id: "7d", fromIndex: 23 },
      { id: "14d", fromIndex: 16 },
      { id: "30d", fromIndex: 0 },
      { id: "month", fromIndex: 1 },
    ]);
  });

  it("covers the whole month on the 31st", () => {
    const r = metricsRequest(new Date(2026, 9, 31, 8));
    expect(r.dayStarts).toHaveLength(31);
    expect(r.windows.find((w) => w.id === "month")?.fromIndex).toBe(0);
  });

  it("keys the cache by user and local day", () => {
    expect(metricsKey("u1", now)).toBe("u1|2026-10-29");
  });
});

describe("home metrics mappers (RED-W6)", () => {
  it("takes the last days of the payload for the period", () => {
    const m = homeMetrics();
    m.daily[29] = day({ passed: 3, failed: 1, blocked: 1, other: 0, manual: 2, imported: 3 });
    m.daily[22] = day({ passed: 9, manual: 9 });
    const week = dailySeries(m, "7d", now);
    expect(week).toHaveLength(7);
    expect(week[6]).toMatchObject({ total: 5, passed: 3, others: 1 });
    expect(week[0].total).toBe(0); // index 23
    expect(dailySeries(m, "14d", now)[6].total).toBe(9);
    expect(dailySeries(null, "today", now)).toEqual([
      expect.objectContaining({ total: 0 }),
    ]);
  });

  it("rounds the axis to 1, 2 or 5 × 10ⁿ", () => {
    expect(axisMax([{ total: 0 }])).toBe(0);
    expect(axisMax([{ total: 3 }])).toBe(5);
    expect(axisMax([{ total: 14 }, { total: 2 }])).toBe(20);
    expect(axisMax([{ total: 50 }])).toBe(50);
    expect(axisMax([{ total: 51 }])).toBe(100);
  });

  it("uses the live cases as not run when a project has no metrics", () => {
    expect(execRow(portal, undefined)).toEqual({
      counts: expect.objectContaining({ notRun: 3, total: 3, executed: 0, retest: 0 }),
      executedShare: 0,
      lastExecutedAt: null,
    });
    expect(execRow(project({}), undefined).executedShare).toBeNull();
  });

  it("sums pending (not run + blocked), defects and the period's rate", () => {
    const m = homeMetrics({
      windows: {
        "7d": rollup({ passed: 4, failed: 1, executed: 5, passRate: 0.8 }),
      },
      projects: [
        projectMetrics("pcl", {
          counts: counts({ passed: 1, blocked: 1, notRun: 1, total: 3, executed: 2 }),
          defects: { open: 2, openBySeverity: { critical: 1, major: 1, minor: 0, trivial: 0 } },
        }),
      ],
    });
    // banca has no metrics: its live case counts as pending, its defects
    // come from loadHome.
    expect(executionKpis([portal, banca], m, "7d")).toEqual({
      pending: 3,
      blocked: 1,
      total: 4,
      openDefects: 3,
      criticalDefects: 1,
      rate: m.windows["7d"],
    });
    expect(executionKpis([portal], m, "today").rate).toBeNull();
    expect(executionKpis([portal], null, "7d")).toMatchObject({
      pending: 3,
      openDefects: 9,
      criticalDefects: 9,
      rate: null,
    });
  });

  it("calls a project at risk when any evaluable criterion fails", () => {
    const c = (met: boolean | null) => ({
      index: 0,
      criterion: "x",
      metric: "",
      kind: null,
      op: null,
      target: null,
      value: null,
      met,
    });
    expect(exitStatus(undefined)).toBe("unknown");
    expect(exitStatus(projectMetrics("p", { exitCriteria: [c(null)] }))).toBe("unknown");
    expect(exitStatus(projectMetrics("p", { exitCriteria: [c(true), c(null)] }))).toBe("met");
    expect(exitStatus(projectMetrics("p", { exitCriteria: [c(true), c(false)] }))).toBe("risk");
  });

  it("merges the projects' queue refs, once per case, by priority", () => {
    const m = homeMetrics({
      projects: [
        projectMetrics("pcl", {
          queue: {
            notRun: [
              ref("2", "PCL-0001", "Login", "critical"),
              { ...ref("2", "PCL-0001", "Login", "critical"), flowId: "b" },
              ref("1", "PCL-0002", "Pago", "medium"),
            ],
            blocked: [ref("4", "PCL-0003", "Logout", "low")],
            retest: [],
            counts: { notRun: 3, blocked: 1, retest: 0 },
          },
        }),
        projectMetrics("amb", {
          queue: {
            notRun: [{ ...ref("3", "AMB-0001", "Saldo", "high"), lastAt: "2026-10-20T10:00:00Z" }],
            blocked: [],
            retest: [],
            counts: { notRun: 1, blocked: 0, retest: 2 },
          },
        }),
      ],
    });
    expect(queueRows([portal, banca], m, "notRun").map((r) => r.scenarioId)).toEqual([
      "PCL-0001",
      "AMB-0001",
      "PCL-0002",
    ]);
    expect(queueRows([portal, banca], m, "notRun", 1)).toHaveLength(1);
    expect(queueRows([portal, banca], m, "blocked")[0]).toMatchObject({
      caseId: "4",
      projectId: "pcl",
      projectName: "Portal",
    });
    expect(queueCounts(m)).toEqual({ notRun: 4, blocked: 1, retest: 2 });
    expect(queueCounts(null)).toBeNull();
  });
});
