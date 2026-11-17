import { describe, it, expect } from "vitest";
import { DELIVERABLE_GROUPS, DELIVERABLE_KEYS, MORE_TOOLS, TEST_TYPES, TOOL_NAMES, TOP_TOOLS, TYPE_GROUPS, toolName } from "./catalogs";
import {
  deliverableLabels,
  levelLabels,
  normalizeDeliverables,
  normalizeTools,
  toolLabels,
  typeGroupLines,
  typeLabels,
} from "./catalogLabels";
import { defaults } from "../ui/wizard/formState";
import { STEP_IDS, stepCompletion } from "../ui/wizard/steps";
import i18n from "@shared/i18n";

const t = i18n.getFixedT("es");

describe("plan catalogs (ADR-0030)", () => {
  it("has 10 most used tools and 65 more, all with a name, none twice", () => {
    expect(TOP_TOOLS).toHaveLength(10);
    expect(MORE_TOOLS).toHaveLength(65);
    const all = [...TOP_TOOLS, ...MORE_TOOLS];
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((k) => TOOL_NAMES[k])).toBe(true);
    expect(toolName("Allure Report")).toBe("Allure Report");
  });

  it("keeps the eight deliverable keys of older plans inside the ISO groups", () => {
    for (const k of ["testPlan", "testCasesScripts", "statusReports", "summaryReports", "defectReports", "uatSignoff", "testData", "incidentReports"])
      expect(DELIVERABLE_KEYS).toContain(k);
    expect(DELIVERABLE_GROUPS.map((g) => g.id)).toEqual([
      "management",
      "specification",
      "dataEnvironment",
      "execution",
      "acceptance",
    ]);
  });

  it("reads old translated deliverables as keys and keeps the team's own", () => {
    expect(
      normalizeDeliverables(["Documento de plan de pruebas", "UAT sign-off", "Informe propio", "testPlan"]),
    ).toEqual(["testPlan", "uatSignoff", "Informe propio"]);
  });

  it("exports catalog entries in the export's language and own entries as typed", () => {
    expect(deliverableLabels(["traceabilityMatrix", "Informe propio"], t)).toEqual([
      "Matriz de trazabilidad",
      "Informe propio",
    ]);
    expect(toolLabels(["github-actions", "Allure Report"])).toEqual(["GitHub Actions", "Allure Report"]);
  });
});

describe("tools typed before the catalog", () => {
  it("become catalog keys, case aside, and are not exported twice", () => {
    expect(normalizeTools(["Jest", "GitHub Actions", "jest", "Allure Report"])).toEqual([
      "jest",
      "github-actions",
      "Allure Report",
    ]);
    expect(toolLabels(["github-actions", "GitHub Actions"])).toEqual(["GitHub Actions"]);
  });
});

describe("step completion", () => {
  it("a new plan has its title, control data, methodology, deliverables, roles, metrics and criteria", () => {
    const done = stepCompletion(defaults(t));
    const completed = STEP_IDS.filter((_, i) => done[i]);
    // Title, version and date are «Identificación del plan» (UX-31).
    // It starts with the metrics of the A3 criteria, linked to them (PLN-06).
    expect(completed).toEqual(["identification", "methodology", "deliverables", "roles", "metrics", "closure"]);
  });

  it("a blank title is not completed", () => {
    const form = { ...defaults(t), title: "  " };
    expect(stepCompletion(form)[0]).toBe(false);
  });
});

describe("test types by group (UX-31)", () => {
  it("groups the catalog as the step does, with `retest` first in «Confirmación y regresión»", () => {
    expect(TYPE_GROUPS.map((g) => [g.id, g.keys])).toEqual([
      ["functional", ["functional", "exploratory", "uat"]],
      ["nonFunctional", ["performance", "load", "stress", "security", "usability", "compatibility", "accessibility"]],
      ["changeRelated", ["retest", "regression", "smoke", "sanity"]],
    ]);
    expect(TEST_TYPES).toHaveLength(14);
    expect(t("testPlan.typeLabel.retest")).toBe("Confirmación");
  });

  it("the PDF lists the types one line per group, own ones last", () => {
    expect(typeGroupLines(["Caos", "regression", "retest", "uat"], t)).toEqual([
      "Funcionales: UAT (aceptación de usuario)",
      "Confirmación y regresión: Confirmación, Regresión",
      "Propios: Caos",
    ]);
    expect(typeGroupLines([], t)).toEqual([]);
    expect(levelLabels(["system", "unit"], t)).toEqual(["Unitarias", "Sistema"]);
    expect(typeLabels(["retest", "functional", "retest"], t)).toEqual(["Funcionales", "Confirmación"]);
  });
});
