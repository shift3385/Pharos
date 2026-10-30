import { describe, expect, it } from "vitest";
import {
  defaultExitProject,
  exitCriteriaChoices,
  homeKpis,
  periodDays,
  projectKey,
  upcomingTests,
  visibleDayLabels,
  type HomeProject,
} from "./homeData";

const today = new Date(2026, 9, 29); // 29 Oct 2026

const project = (over: Partial<HomeProject>): HomeProject => ({
  id: "p",
  name: "P",
  key: "P",
  recency: "2026-10-28T00:00:00Z",
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
  name: "Portal Clientes",
  key: "PCL",
  closeDate: "2026-11-07",
  hasPlan: true,
  cases: [
    { id: "1", scenarioId: "PCL-0002", title: "Pago", priority: "medium" },
    { id: "2", scenarioId: "PCL-0001", title: "Login", priority: "critical" },
  ],
  openDefects: 3,
  criticalDefects: 1,
});
const banca = project({
  id: "amb",
  name: "App Móvil Banca",
  key: "AMB",
  closeDate: "2026-10-31",
  hasPlan: true,
  cases: [
    { id: "3", scenarioId: "AMB-0001", title: "Saldo", priority: "critical" },
  ],
  openDefects: 1,
});
const erp = project({ id: "erp", name: "Migración ERP", key: "ERP" });

describe("home data (RED-V1)", () => {
  it("derives the key from the case-id prefix", () => {
    expect(projectKey("PCL-")).toBe("PCL");
    expect(projectKey("ATS_")).toBe("ATS");
    expect(projectKey("")).toBe("");
  });

  it("sums the KPIs over the open projects", () => {
    expect(homeKpis([portal, banca, erp], today)).toEqual({
      projects: 3,
      closingThisMonth: 1, // banca closes on 31 Oct; portal in November
      pending: 3,
      total: 3,
      openDefects: 4,
      criticalDefects: 1,
    });
  });

  it("orders the upcoming tests by priority, then project recency, then id", () => {
    expect(
      upcomingTests([portal, banca, erp]).map((r) => r.scenarioId),
    ).toEqual(["PCL-0001", "AMB-0001", "PCL-0002"]);
    expect(upcomingTests([portal, banca], 1)).toHaveLength(1);
  });

  it("lists the exit-criteria projects by closing date and filters by name or key", () => {
    expect(exitCriteriaChoices([erp, portal, banca]).map((p) => p.key)).toEqual(
      ["AMB", "PCL", "ERP"],
    );
    expect(
      exitCriteriaChoices([erp, portal, banca], "movil").map((p) => p.key),
    ).toEqual(["AMB"]);
    expect(
      exitCriteriaChoices([erp, portal, banca], "pcl").map((p) => p.key),
    ).toEqual(["PCL"]);
  });

  it("defaults to the project that closes first from today", () => {
    expect(defaultExitProject([erp, portal, banca], today)?.key).toBe("AMB");
    expect(
      defaultExitProject([erp, portal, banca], new Date(2026, 10, 1))?.key,
    ).toBe("PCL");
    expect(defaultExitProject([erp], today)?.key).toBe("ERP");
    expect(defaultExitProject([], today)).toBeNull();
  });

  it("builds the period days ending today", () => {
    const days = periodDays("14d", today);
    expect(days).toHaveLength(14);
    expect(days[13].getDate()).toBe(29);
    expect(days[0].getDate()).toBe(16);
    expect(periodDays("today", today)).toHaveLength(1);
    expect(periodDays("month", today)).toHaveLength(29);
    expect(periodDays("30d", today)[0].getMonth()).toBe(8); // 30 Sep
  });

  it("shows every other day label counting back from today", () => {
    expect(visibleDayLabels(5, false)).toEqual([true, true, true, true, true]);
    expect(visibleDayLabels(5, true)).toEqual([true, false, true, false, true]);
    expect(visibleDayLabels(4, true)).toEqual([false, true, false, true]);
  });
});
