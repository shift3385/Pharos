import { describe, expect, it } from "vitest";
import legacy from "./__fixtures__/legacy-schedule.json";
import {
  addDays,
  daysBetween,
  deriveScheduleId,
  fmix64,
  fnv1a64,
  fromDisplay,
  newScheduleId,
  nextSprintName,
  nextSprintRange,
  normalizeSchedule,
  overlaps,
  sprintDays,
  toDisplay,
} from "./schedule";
import type { ScheduleSprint } from "./types";

const ID = /^[0-9A-HJKMNP-TV-Z]{8}$/;
const sp = (id: string, start: string, end: string, name = id): ScheduleSprint => ({ id, name, start, end });

describe("schedule ids (RED-W5)", () => {
  it("FNV-1a 64 and the finalizer match their reference vectors", () => {
    expect(fnv1a64("")).toBe(0xcbf29ce484222325n);
    expect(fnv1a64("a")).toBe(0xaf63dc4c8601ec8cn);
    expect(fnv1a64("foobar")).toBe(0x85944171f73967e8n);
    expect(fmix64(0n)).toBe(0n);
  });

  it("derives the same 8-character id for the same plan and slot", () => {
    const a = deriveScheduleId("plan1", "sprints", 0, new Set());
    expect(a).toMatch(ID);
    expect(deriveScheduleId("plan1", "sprints", 0, new Set())).toBe(a);
    expect(deriveScheduleId("plan1", "sprints", 1, new Set())).not.toBe(a);
    expect(deriveScheduleId("plan2", "sprints", 0, new Set())).not.toBe(a);
    expect(deriveScheduleId("plan1", "milestones", 0, new Set())).not.toBe(a);
    // Taken: retries with ":1" appended, still deterministic.
    const again = deriveScheduleId("plan1", "sprints", 0, new Set([a]));
    expect(again).not.toBe(a);
    expect(deriveScheduleId("plan1", "sprints", 0, new Set([a]))).toBe(again);
  });

  it("gives a legacy plan the same ids on every read (both clients run this code)", () => {
    const desktop = normalizeSchedule("plan1", structuredClone(legacy.wizard020));
    const web = normalizeSchedule("plan1", JSON.parse(JSON.stringify(legacy.wizard020)));
    expect(web).toEqual(desktop);
    expect(desktop.sprints.map((s) => s.id)).toEqual(legacy.wizard020Ids.sprints);
    expect(desktop.milestones.map((m) => m.id)).toEqual(legacy.wizard020Ids.milestones);
    // Nothing of the content changes.
    expect(desktop.sprints.map(({ id: _, ...rest }) => rest)).toEqual(legacy.wizard020.sprints);
    expect(desktop.milestones.map(({ id: _, ...rest }) => rest)).toEqual(legacy.wizard020.milestones);
  });

  it("keeps unique ids, re-derives missing and repeated ones, across both lists", () => {
    const out = normalizeSchedule("plan1", {
      sprints: [
        { id: "KEEP0001", name: "A", start: "2026-11-02", end: "2026-11-15" },
        { id: "KEEP0001", name: "B", start: "2026-11-16", end: "2026-11-29" },
        { name: "C", start: "", end: "" },
      ],
      milestones: [{ id: "KEEP0001", name: "M", date: "2026-11-20" }, { id: "", name: "N", date: "" }],
    });
    const ids = [...out.sprints, ...out.milestones].map((x) => x.id);
    expect(ids[0]).toBe("KEEP0001");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(1).every((id) => ID.test(id))).toBe(true);
  });

  it("loses nothing from odd legacy data", () => {
    const out = normalizeSchedule("plan1", legacy.odd);
    expect(out.sprints).toHaveLength(4);
    expect(out.sprints[0]).toMatchObject({ name: "Sprint 1", start: "Nov 2", end: "Nov 15", note: "kept" });
    expect(out.sprints[1]).toMatchObject({ name: "Sprint suelto", start: "", end: "" });
    expect(out.sprints[2]).toMatchObject({ name: "42", start: "", end: "" });
    expect(out.sprints[3]).toMatchObject({ name: "", start: "2026-11-02", end: "" });
    expect(out.milestones[0]).toMatchObject({ name: "Go-live", date: "Nov 28" });
    expect(normalizeSchedule("plan1", { sprints: "nope" as unknown })).toEqual({ sprints: [], milestones: [] });
  });

  it("an import or a new plan (no plan id) gets random ids", () => {
    const a = normalizeSchedule(null, legacy.wizard020);
    const b = normalizeSchedule(null, legacy.wizard020);
    expect(a.sprints[0].id).toMatch(ID);
    expect(a.sprints[0].id).not.toBe(b.sprints[0].id);
    const used = new Set<string>();
    for (let i = 0; i < 200; i++) newScheduleId(used);
    expect(used.size).toBe(200);
  });
});

describe("schedule dates", () => {
  it("converts dd/mm/aaaa and ISO both ways, rejecting impossible days", () => {
    expect(toDisplay("2026-11-02")).toBe("02/11/2026");
    expect(toDisplay("Nov 28")).toBe("Nov 28");
    expect(fromDisplay("2/11/2026")).toBe("2026-11-02");
    expect(fromDisplay(" 02-11-2026 ")).toBe("2026-11-02");
    expect(fromDisplay("31/02/2026")).toBeNull();
    expect(fromDisplay("2026-11-02")).toBe("2026-11-02");
    expect(fromDisplay("2026-02-31")).toBeNull();
    expect(fromDisplay("")).toBeNull();
  });

  it("adds days and counts them across months and DST", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(daysBetween("2026-10-20", "2026-11-02")).toBe(13);
    expect(sprintDays(sp("a", "2026-11-02", "2026-11-15"))).toBe(14);
    expect(sprintDays(sp("a", "2026-11-15", "2026-11-02"))).toBe(0);
  });
});

describe("schedule rules", () => {
  it("finds overlaps by name, ignoring sprints it can't draw", () => {
    const o = overlaps([
      sp("a", "2026-11-02", "2026-11-15", "S21"),
      sp("b", "2026-11-15", "2026-11-29", "S22"),
      sp("c", "2026-12-01", "2026-12-14", "S23"),
      sp("d", "Nov 2", "2026-12-31", "Legacy"),
    ]);
    expect(o.get("a")).toBe("S22");
    expect(o.get("b")).toBe("S21");
    expect(o.has("c")).toBe(false);
    expect(o.has("d")).toBe(false);
  });

  it("the next sprint starts after the latest end and lasts the step 6 length", () => {
    const list = [sp("a", "2026-11-02", "2026-11-15", "Sprint 21 · Pagos"), sp("b", "2026-11-16", "2026-11-29", "Sprint 22")];
    expect(nextSprintRange(list, 14, "2026-10-31")).toEqual({ start: "2026-11-30", end: "2026-12-13" });
    expect(nextSprintRange([], 21, "2026-10-31")).toEqual({ start: "2026-10-31", end: "2026-11-20" });
    expect(nextSprintName(list, "Sprint")).toBe("Sprint 23");
    expect(nextSprintName([sp("x", "", "", "Kick-off")], "Sprint")).toBe("Sprint 2");
  });
});

describe("legacy dates (review S1)", () => {
  it("a real day written dd/mm/aaaa (old import) reads as ISO; other text stays", () => {
    const out = normalizeSchedule("plan1", {
      sprints: [
        { name: "A", start: "02/11/2026", end: "15/11/2026" },
        { name: "B", start: "31/02/2026", end: "Nov 30" },
      ],
      milestones: [{ name: "M", date: "1/12/2026" }],
    });
    expect(out.sprints[0]).toMatchObject({ start: "2026-11-02", end: "2026-11-15" });
    expect(out.sprints[1]).toMatchObject({ start: "31/02/2026", end: "Nov 30" });
    expect(out.milestones[0].date).toBe("2026-12-01");
  });

  it("nextSprintName matches the word literally", () => {
    const list = [{ id: "a", name: "S.1 x", start: "", end: "" }, { id: "b", name: "S.4", start: "", end: "" }];
    expect(nextSprintName(list, "S.")).toBe("S. 3");
    expect(nextSprintName([{ id: "a", name: "S. 4", start: "", end: "" }], "S.")).toBe("S. 5");
    expect(nextSprintName([{ id: "a", name: "Sx 4", start: "", end: "" }], "S.")).toBe("S. 2");
  });
});
