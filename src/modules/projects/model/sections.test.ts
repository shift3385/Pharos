import { describe, expect, it } from "vitest";
import { PROJECT_NAV } from "@app/navConfig";
import { PROJECT_SECTIONS, isProjectSection, projectPath } from "./sections";

describe("project sections (ADR-0029, UX-21)", () => {
  it("follow the test process: requirements before cases, the matrix last", () => {
    expect(PROJECT_SECTIONS).toEqual([
      "plan",
      "planner",
      "requirements",
      "cases",
      "cycles",
      "runs",
      "defects",
      "traceability",
      "settings",
    ]);
  });

  it("the menu shows every section once, in that same order", () => {
    expect(PROJECT_NAV.map((n) => n.section)).toEqual([...PROJECT_SECTIONS]);
  });

  it("«requirements» is a section with its own route", () => {
    expect(isProjectSection("requirements")).toBe(true);
    expect(projectPath("p 1", "requirements")).toBe("/projects/p%201/requirements");
  });
});
