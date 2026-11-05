import { describe, expect, it } from "vitest";
import {
  defaultExitProject,
  exitCriteriaChoices,
  homeKpis,
  periodDays,
  projectKey,
  visibleDayLabels,
  type HomeProject,
} from "./homeData";

const today = new Date(2026, 9, 29); // 29 Oct 2026

const project = (over: Partial<HomeProject>): HomeProject => ({
  id: "p",
  name: "P",
  key: "P",
  closeDate: null,
  hasPlan: false,
  criteria: [],
  ...over,
});

const portal = project({
  id: "pcl",
  name: "Portal Clientes",
  key: "PCL",
  closeDate: "2026-11-07",
  hasPlan: true,
});
const banca = project({
  id: "amb",
  name: "App Móvil Banca",
  key: "AMB",
  closeDate: "2026-10-31",
  hasPlan: true,
});
const erp = project({ id: "erp", name: "Migración ERP", key: "ERP" });

describe("home data (RED-V1)", () => {
  it("derives the key from the case-id prefix", () => {
    expect(projectKey("PCL-")).toBe("PCL");
    expect(projectKey("ATS_")).toBe("ATS");
    expect(projectKey("")).toBe("");
  });

  it("counts the open projects and those closing this month", () => {
    expect(homeKpis([portal, banca, erp], today)).toEqual({
      projects: 3,
      closingThisMonth: 1, // banca closes on 31 Oct; portal in November
    });
  });

  it("lists the exit-criteria projects by closing date and filters by name or key", () => {
    expect(
      exitCriteriaChoices([erp, portal, banca], "", today).map((p) => p.key),
    ).toEqual(["AMB", "PCL", "ERP"]);
    expect(
      exitCriteriaChoices([erp, portal, banca], "movil", today).map(
        (p) => p.key,
      ),
    ).toEqual(["AMB"]);
    expect(
      exitCriteriaChoices([erp, portal, banca], "pcl", today).map((p) => p.key),
    ).toEqual(["PCL"]);
  });

  it("puts projects that already closed last, most recently closed first", () => {
    const closedLong = {
      ...erp,
      id: "x1",
      key: "OLD",
      closeDate: "2026-09-01",
    };
    const closedRecent = {
      ...erp,
      id: "x2",
      key: "REC",
      closeDate: "2026-10-20",
    };
    expect(
      exitCriteriaChoices(
        [closedLong, erp, closedRecent, portal, banca],
        "",
        today,
      ).map((p) => p.key),
    ).toEqual(["AMB", "PCL", "ERP", "REC", "OLD"]);
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
