import { describe, expect, it } from "vitest";
import i18n from "@shared/i18n";
import legacy from "../../model/__fixtures__/legacy-schedule.json";
import type { TestPlan } from "../../model/types";
import { applyRevision, defaults, fromPlan, planWarnings, sprintIssues, toInput } from "./formState";

const t = i18n.getFixedT("es");
const plan = (data: TestPlan["data"]): TestPlan => ({
  id: "plan1",
  workspaceId: "w",
  title: "Plan",
  version: "1.0",
  planDate: null,
  author: "A",
  status: "draft",
  projectId: "p1",
  createdAt: "",
  updatedAt: "",
  revision: 1,
  data,
});

describe("schedule in the plan form (RED-W5)", () => {
  it("a legacy plan and a legacy revision of it read with the same derived ids", () => {
    const current = fromPlan(plan(structuredClone(legacy.wizard020)), t);
    expect(current.sprints.map((s) => s.id)).toEqual(legacy.wizard020Ids.sprints);
    const restored = applyRevision(defaults(t), "Plan", structuredClone(legacy.wizard020), "plan1");
    expect(restored.sprints).toEqual(current.sprints);
    expect(restored.milestones).toEqual(current.milestones);
  });

  it("the first save persists the ids; a saved plan reads them back unchanged", () => {
    const form = fromPlan(plan(structuredClone(legacy.wizard020)), t);
    const input = toInput(form, { plan: null, projectId: "p1", author: "A", userId: "u" });
    expect(input.data.sprints?.map((s) => s.id)).toEqual(legacy.wizard020Ids.sprints);
    const again = fromPlan(plan(input.data), t);
    expect(again.sprints).toEqual(form.sprints);
  });

  it("sprint warnings: missing or invalid dates, order, overlap, length (agile)", () => {
    const issues = sprintIssues(
      [
        { id: "a", name: "A", start: "", end: "" },
        { id: "b", name: "B", start: "Nov 2", end: "2026-11-15" },
        { id: "c", name: "C", start: "2026-11-15", end: "2026-11-02" },
        { id: "d", name: "D", start: "2026-12-01", end: "2026-12-14" },
        { id: "e", name: "E", start: "2026-12-10", end: "2026-12-23" },
        { id: "f", name: "F", start: "2027-01-01", end: "2027-01-10" },
      ],
      14,
    );
    expect(issues.map((i) => i?.code ?? null)).toEqual([
      "testPlan.schedule.missingDate",
      "testPlan.schedule.invalidDate",
      "testPlan.sprintDateError",
      "testPlan.schedule.overlap",
      "testPlan.schedule.overlap",
      "testPlan.schedule.duration",
    ]);
    expect(issues[3]?.params).toEqual({ name: "E" });
    expect(issues.every((i) => i?.severity === "warning")).toBe(true);
  });

  it("a traditional plan has no sprint length to warn about", () => {
    const form = {
      ...defaults(t),
      methodologyType: "traditional" as const,
      sprints: [{ id: "a", name: "A", start: "2026-11-01", end: "2026-11-30" }],
    };
    expect(planWarnings(form)).toBe(0);
    expect(planWarnings({ ...form, methodologyType: "agile" })).toBe(1);
  });
});
