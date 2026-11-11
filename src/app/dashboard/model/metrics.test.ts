import { afterEach, describe, expect, it } from "vitest";
import type { HomeProject } from "./homeData";
import {
  dailySeries,
  execRow,
  executionKpis,
  exitStatus,
  instantOf,
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
  closeDate: null,
  hasPlan: false,
  criteria: [],
  ...over,
});
const portal = project({ id: "pcl", name: "Portal" });
const banca = project({ id: "amb", name: "Banca" });

const HOUR = 3_600_000;

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

  describe("across DST changes (the client's own time zone)", () => {
    const original = process.env.TZ;
    afterEach(() => {
      process.env.TZ = original;
    });

    /** Hours between consecutive day starts, keyed by the day that starts. */
    function lengths(tz: string, today: [number, number, number]) {
      process.env.TZ = tz;
      const r = metricsRequest(new Date(today[0], today[1], today[2], 12));
      const out: Record<string, number> = {};
      r.dayStarts.forEach((d, i) => {
        // Every day start is the first instant of its local day.
        const local = new Date(d);
        expect(local.getHours() * 60 + local.getMinutes(), tz).toBeLessThanOrEqual(60);
        if (i) {
          expect(d, tz).toBeGreaterThan(r.dayStarts[i - 1]);
          const prev = new Date(r.dayStarts[i - 1]);
          out[`${prev.getMonth() + 1}-${prev.getDate()}`] = (d - r.dayStarts[i - 1]) / HOUR;
        }
      });
      return out;
    }

    it("Europe/Madrid: a 23 h day in March and a 25 h day in October", () => {
      const spring = lengths("Europe/Madrid", [2026, 2, 30]);
      expect(spring["3-29"]).toBe(23);
      expect(Object.values(spring).filter((h) => h !== 24)).toEqual([23]);
      const autumn = lengths("Europe/Madrid", [2026, 9, 26]);
      expect(autumn["10-25"]).toBe(25);
      expect(Object.values(autumn).filter((h) => h !== 24)).toEqual([25]);
    });

    it("America/Santiago: midnight repeats in April and does not exist in September", () => {
      const autumn = lengths("America/Santiago", [2026, 3, 6]);
      expect(autumn["4-4"]).toBe(25);
      const spring = lengths("America/Santiago", [2026, 8, 7]);
      expect(spring["9-6"]).toBe(23);
      // 6 Sep starts at 01:00, the first instant that exists that day.
      process.env.TZ = "America/Santiago";
      const start = new Date(metricsRequest(new Date(2026, 8, 7, 12)).dayStarts.at(-2)!);
      expect([start.getDate(), start.getHours()]).toEqual([6, 1]);
    });
  });
});

describe("home metrics mappers (RED-W6)", () => {
  it("takes the last days of the payload for the period", () => {
    const m = homeMetrics();
    m.daily[29] = day({ passed: 3, failed: 1, blocked: 1, manual: 2, imported: 3 });
    m.daily[22] = day({ passed: 9, manual: 9 });
    const week = dailySeries(m, "7d", now);
    expect(week).toHaveLength(7);
    expect(week[6]).toMatchObject({ total: 5, passed: 3, others: 1 });
    expect(week[0].total).toBe(0); // index 23
    expect(dailySeries(m, "14d", now)[6].total).toBe(9);
    expect(dailySeries(null, "today", now)).toEqual([expect.objectContaining({ total: 0 })]);
  });

  it("knows nothing about a project without metrics (unknown, not zero)", () => {
    expect(execRow(undefined)).toEqual({ counts: null, executedShare: null, lastExecutedAt: null });
    expect(execRow(projectMetrics("p")).executedShare).toBeNull(); // no cases
    expect(
      execRow(projectMetrics("p", { counts: counts({ passed: 1, notRun: 3, total: 4, executed: 1 }) }))
        .executedShare,
    ).toBe(0.25);
  });

  it("sums pending (not run + blocked), defects and the period's rate from the metrics only", () => {
    const m = homeMetrics({
      windows: { "7d": rollup({ passed: 4, failed: 1, executed: 5, passRate: 0.8 }) },
      projects: [
        projectMetrics("pcl", {
          counts: counts({ passed: 1, blocked: 1, notRun: 1, total: 3, executed: 2 }),
          defects: { open: 2, openBySeverity: { critical: 1, major: 1, minor: 0, trivial: 0 } },
        }),
      ],
    });
    // banca has no metrics: it adds nothing.
    expect(executionKpis([portal, banca], m, "7d")).toEqual({
      pending: 2,
      blocked: 1,
      total: 3,
      openDefects: 2,
      criticalDefects: 1,
      rate: m.windows["7d"],
    });
    expect(executionKpis([portal], m, "today").rate).toBeNull();
    expect(executionKpis([portal], null, "7d")).toMatchObject({ pending: 0, openDefects: 0, rate: null });
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

  it("reads stored times as instants (RFC 3339 or SQLite's UTC form)", () => {
    expect(instantOf("2026-10-29T10:00:00Z")).toBe(Date.UTC(2026, 9, 29, 10));
    expect(instantOf("2026-10-29 10:00:00")).toBe(Date.UTC(2026, 9, 29, 10));
    expect(instantOf("2026-10-29T12:00:00+02:00")).toBe(Date.UTC(2026, 9, 29, 10));
    expect(instantOf("ayer")).toBeNull();
    expect(instantOf(null)).toBeNull();
  });

  it("merges the projects' queues by priority, newest instant, then natural id; one row per case", () => {
    const at = (s: string | null) => (r: ReturnType<typeof ref>) => ({ ...r, lastAt: s });
    const m = homeMetrics({
      projects: [
        projectMetrics("pcl", {
          queue: {
            notRun: [
              ref("2", "PCL-10", "Login", "critical"),
              { ...ref("2", "PCL-10", "Login", "critical"), flowId: "b" },
              ref("1", "PCL-2", "Pago", "critical"),
              ref("5", "PCL-5", "Logout", "medium"),
            ],
            blocked: [
              // Same instant, two notations: the SQLite one is not "older".
              at("2026-10-29 10:00:00")(ref("4", "PCL-3", "Logout", "high")),
            ],
            retest: [],
            counts: { notRun: 3, blocked: 1, retest: 0 },
          },
        }),
        projectMetrics("amb", {
          queue: {
            notRun: [at("2026-10-20T10:00:00Z")(ref("3", "AMB-1", "Saldo", "high"))],
            blocked: [at("2026-10-29T11:00:00+02:00")(ref("6", "AMB-2", "Alta", "high"))],
            retest: [],
            counts: { notRun: 1, blocked: 1, retest: 2 },
          },
        }),
      ],
    });
    expect(queueRows([portal, banca], m, "notRun").map((r) => r.scenarioId)).toEqual([
      "PCL-2", // natural order: 2 before 10
      "PCL-10",
      "AMB-1",
      "PCL-5",
    ]);
    // 10:00 UTC (SQLite form) is newer than 11:00+02:00 = 09:00 UTC.
    expect(queueRows([portal, banca], m, "blocked").map((r) => r.caseId)).toEqual(["4", "6"]);
    expect(queueRows([portal, banca], m, "notRun", 1)).toHaveLength(1);
    expect(queueRows([portal, banca], m, "blocked")[0]).toMatchObject({ projectId: "pcl", projectName: "Portal" });
    expect(queueCounts(m)).toEqual({ notRun: 4, blocked: 2, retest: 2 });
    expect(queueCounts(null)).toBeNull();
  });
});
