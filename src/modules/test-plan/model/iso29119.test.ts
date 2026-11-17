// PLN-06 (29119-3 sections and metrics), PLN-07 (approval), PLN-03 (a save
// without changes) and PLN-04 (document ID): the plan's model and form rules.
import { describe, expect, it } from "vitest";
import i18n from "@shared/i18n";
import {
  METRIC_KINDS,
  METRIC_UNIT,
  linkedText,
  normalizeMetrics,
  syncLinkedCriteria,
  targetText,
} from "./metrics";
import type { PlanMetric, TestPlan } from "./types";
import {
  changesContent,
  defaults,
  documentIdFor,
  fromInput,
  fromPlan,
  hexOf,
  toInput,
} from "../ui/wizard/formState";
import { estimationComplete } from "../ui/wizard/steps";
import { estimationLines, strategyExport, threePoint } from "../export/planStrategy";

const t = i18n.getFixedT("es");
const en = i18n.getFixedT("en");
const metric = (over: Partial<PlanMetric> = {}): PlanMetric => ({
  id: "m1",
  kind: "executed",
  name: "",
  op: ">=",
  target: 95,
  unit: "percent",
  ...over,
});
const saved = (over: Partial<TestPlan> = {}, data: TestPlan["data"] = {}): TestPlan => ({
  id: "3f9a1c77-0000-4000-8000-000000000000",
  workspaceId: "w",
  title: "Plan",
  version: "1.3",
  planDate: "2026-11-10",
  author: "Liomar Rodríguez",
  status: "reviewed",
  projectId: "p1",
  createdAt: "",
  updatedAt: "",
  revision: 4,
  data: { summary: "Resumen", ...data },
  ...over,
});
const opts = (plan: TestPlan | null) => ({ plan, projectId: "p1", author: "Liomar Rodríguez", userId: "u1" });

describe("metric contract (DOC-02/DOC-06, ADR-0040)", () => {
  it("has the agreed kinds and their fixed units", () => {
    expect(METRIC_KINDS).toEqual([
      "executed",
      "passRate",
      "criticalDefects",
      "coverage",
      "defectDensity",
      "escapedDefects",
      "fixTime",
      "reopenRate",
      "flakyRate",
    ]);
    expect(METRIC_UNIT).toEqual({
      executed: "percent",
      passRate: "percent",
      coverage: "percent",
      reopenRate: "percent",
      flakyRate: "percent",
      criticalDefects: "count",
      escapedDefects: "count",
      defectDensity: "per100cases",
      fixTime: "days",
    });
  });

  it("writes the objective as people read it, in each language", () => {
    expect(targetText(metric(), t, "es")).toBe("≥ 95 %");
    expect(targetText(metric({ kind: "criticalDefects", op: "=", target: 0, unit: "count" }), t, "es")).toBe("= 0");
    expect(targetText(metric({ kind: "defectDensity", op: "<=", target: 0.5, unit: "per100cases" }), t, "es")).toBe(
      "≤ 0,5 / 100 casos",
    );
    expect(targetText(metric({ kind: "fixTime", op: "<=", target: 3, unit: "days" }), en, "en")).toBe("≤ 3 days");
    expect(targetText(metric({ kind: "fixTime", op: "<=", target: 1, unit: "days" }), t, "es")).toBe("≤ 1 día");
    // An own metric keeps its own unit.
    expect(targetText(metric({ kind: null, name: "Satisfacción", op: ">=", target: 4, unit: "score" }), t, "es")).toBe(
      "≥ 4",
    );
  });

  it("a linked criterion's text still reads as before for 0.3 (criterion_kind / parse_metric)", () => {
    expect(linkedText(metric(), t, "es")).toEqual({ criterion: "% de casos ejecutados", metric: "≥ 95 %" });
    expect(linkedText(metric({ kind: "coverage", target: 90 }), t, "es").criterion).toBe("Cobertura de requisitos");
    expect(linkedText(metric({ kind: "criticalDefects", op: "=", target: 0, unit: "count" }), t, "es").criterion).toBe(
      "Defectos críticos abiertos",
    );
  });

  it("rewrites linked criteria when their metric changes, and unlinks a removed one", () => {
    const criteria = [
      { criterion: "% de casos ejecutados", metric: "≥ 95 %", metricId: "m1", blocking: true },
      { criterion: "Demo aceptada", metric: "Sí", blocking: false },
      { criterion: "Cobertura", metric: "≥ 90 %", metricId: "gone" },
    ];
    const out = syncLinkedCriteria(criteria, [metric({ target: 98 })], t, "es");
    expect(out[0]).toEqual({ criterion: "% de casos ejecutados", metric: "≥ 98 %", metricId: "m1", blocking: true });
    expect(out[1]).toBe(criteria[1]);
    expect(out[2]).toEqual({ criterion: "Cobertura", metric: "≥ 90 %" });
  });

  it("reads stored metrics defensively: unknown kind → own, repeated id → new one", () => {
    const list = normalizeMetrics([
      { id: "a", kind: "executed", op: ">=", target: 95, unit: "count" },
      { id: "a", kind: "velocity", name: "Velocidad", op: "~", target: "x" },
      { kind: "executed" },
      "junk",
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ id: "a", kind: "executed", name: "", op: ">=", target: 95, unit: "percent" });
    expect(list[1]).toMatchObject({ kind: null, name: "Velocidad", op: ">=", target: 0, unit: "score" });
    expect(list[1].id).not.toBe("a");
  });
});

describe("a new plan's metrics (PLN-06)", () => {
  it("starts with four metrics; three are linked, blocking exit criteria", () => {
    const f = defaults(t);
    expect(f.metrics.map((m) => [m.kind, m.op, m.target])).toEqual([
      ["executed", ">=", 95],
      ["passRate", ">=", 90],
      ["criticalDefects", "=", 0],
      ["coverage", ">=", 90],
    ]);
    expect(new Set(f.metrics.map((m) => m.id)).size).toBe(4);
    expect(f.closureCriteria.map((c) => [c.criterion, c.metric, c.blocking])).toEqual([
      ["% de casos ejecutados", "≥ 95 %", true],
      ["Defectos críticos abiertos", "= 0", true],
      ["Cobertura de requisitos", "≥ 90 %", true],
    ]);
    const ids = f.metrics.map((m) => m.id);
    expect(f.closureCriteria.map((c) => c.metricId)).toEqual([ids[0], ids[2], ids[3]]);
  });

  it("saves metrics and links, and drops a link to a metric no longer there", () => {
    const f = defaults(t);
    const gone = { ...f, metrics: f.metrics.filter((m) => m.kind !== "coverage") };
    const data = toInput(gone, opts(null)).data;
    expect(data.metrics).toHaveLength(3);
    expect(data.closureCriteria?.[2]).toEqual({ criterion: "Cobertura de requisitos", metric: "≥ 90 %", blocking: true });
  });
});

describe("saving without changes (PLN-03)", () => {
  it("the version goes up only when the title or content changes", () => {
    const plan = saved();
    const same = fromPlan(plan, t);
    expect(changesContent(same, plan)).toBe(false);
    expect(toInput(same, opts(plan)).version).toBe("1.3");
    // The status, the date and the document ID are not content.
    expect(toInput({ ...same, status: "draft", planDate: "2026-12-01", documentId: "X" }, opts(plan)).version).toBe(
      "1.3",
    );
    expect(toInput({ ...same, summary: "Otro" }, opts(plan)).version).toBe("1.4");
    // A version set by hand wins.
    expect(toInput({ ...same, summary: "Otro", version: "2.0" }, opts(plan)).version).toBe("2.0");
  });

  it("an old plan (no 0.4.0 fields) opens unchanged", () => {
    const plan = saved({}, { scopeIn: ["Login"], closureCriteria: [{ criterion: "% ejecutados", metric: "≥ 95%" }] });
    expect(changesContent(fromPlan(plan, t), plan)).toBe(false);
  });
});

describe("approval (PLN-07)", () => {
  const approval = { by: "u1", byName: "Liomar Rodríguez", at: "2026-11-11T10:05:00Z", version: "1.3" };

  it("is kept while «Aprobado», without a new version", () => {
    const plan = saved();
    const form = { ...fromPlan(plan, t), status: "approved", approval };
    const input = toInput(form, opts(plan));
    expect(input.status).toBe("approved");
    expect(input.version).toBe("1.3");
    expect(input.data.approval).toEqual(approval);
  });

  it("editing an approved plan sends it back to «Revisado» and drops the approval", () => {
    const plan = saved({ status: "approved" }, { approval });
    const form = fromPlan(plan, t);
    expect(form.approval).toEqual(approval);
    const input = toInput({ ...form, summary: "Cambio" }, opts(plan));
    expect(input.status).toBe("reviewed");
    expect(input.version).toBe("1.4");
    expect(input.data.approval).toBeNull();
  });

  it("another status drops it; a status alone is not an edit", () => {
    const plan = saved({ status: "approved" }, { approval });
    const form = fromPlan(plan, t);
    expect(toInput({ ...form, status: "obsolete" }, opts(plan)).data.approval).toBeNull();
    expect(toInput(form, opts(plan)).status).toBe("approved");
  });

  it("an approval is read only with «Aprobado», and a file never brings one", () => {
    expect(fromPlan(saved({ status: "reviewed" }, { approval }), t).approval).toBeNull();
    const imported = fromInput({ title: "P", author: "A", status: "approved", data: { approval } }, t);
    expect(imported.status).toBe("reviewed");
    expect(imported.approval).toBeNull();
  });
});

describe("document ID (PLN-04)", () => {
  it("is TP-<prefix>-<6 hex> by default, editable and kept", () => {
    expect(documentIdFor("PH-", "3F9A1C")).toBe("TP-PH-3F9A1C");
    expect(documentIdFor("", "3F9A1C")).toBe("TP-3F9A1C");
    expect(hexOf("3f9a1c77-0000")).toBe("3F9A1C");
    expect(hexOf(null)).toMatch(/^[0-9A-F]{6}$/);
    expect(fromPlan(saved(), t, "ATS_").documentId).toBe("TP-ATS-3F9A1C");
    expect(fromPlan(saved({}, { documentId: "QA-PLAN-7" }), t, "ATS_").documentId).toBe("QA-PLAN-7");
    expect(defaults(t, "P", { prefix: "PH-" }).documentId).toMatch(/^TP-PH-[0-9A-F]{6}$/);
    expect(toInput({ ...fromPlan(saved(), t, "PH"), documentId: " X-1 " }, opts(saved())).data.documentId).toBe("X-1");
    // An import keeps the plan's ID unless the file has its own.
    expect(fromInput({ title: "P", author: "A", data: {} }, t, { documentId: "TP-PH-000001" }).documentId).toBe(
      "TP-PH-000001",
    );
  });
});

describe("estimation (PLN-06)", () => {
  it("three-point: E = (O + 4M + P) / 6 and σ = (P − O) / 6", () => {
    expect(threePoint({ technique: "threePoint", optimistic: 12, likely: 18, pessimistic: 30 })).toEqual({ e: 19, sd: 3 });
    expect(threePoint({ technique: "threePoint", optimistic: 12 })).toBeNull();
    expect(estimationComplete({ technique: "threePoint", optimistic: 12, likely: 18 })).toBe(false);
    expect(estimationComplete({ technique: "ratio", effort: 20 })).toBe(true);
    expect(estimationComplete({ effort: 20 })).toBe(false);
  });

  it("saves only the figures of its technique, and exports one line each", () => {
    const f = { ...defaults(t), estimation: { technique: "ratio" as const, effort: 20, optimistic: 1, budget: " 9 500 € " } };
    expect(toInput(f, opts(null)).data.estimation).toEqual({ technique: "ratio", effort: 20, budget: "9 500 €" });
    expect(
      estimationLines({ technique: "threePoint", optimistic: 12, likely: 18, pessimistic: 30, budget: "9 500 €" }, t, "es"),
    ).toEqual([
      "Técnica de estimación: Estimación de tres puntos",
      "E = (12 + 4·18 + 30) / 6 = 19 persona-días · σ = 3",
      "Presupuesto: 9 500 €",
    ]);
  });
});

describe("export of the 29119-3 sections", () => {
  it("names each metric, marks the exit ones, and says what measures each criterion", () => {
    const f = defaults(t);
    const { strategy } = strategyExport(toInput(f, opts(null)).data, t, "es");
    expect(strategy.metrics.map((m) => [m.name, m.objective, m.measured, m.exit])).toEqual([
      ["% de casos ejecutados", "≥ 95 %", "Pharos la mide", true],
      ["Tasa de éxito", "≥ 90 %", "Pharos la mide", false],
      ["Defectos críticos abiertos", "= 0", "Pharos la mide", true],
      ["Cobertura de requisitos", "≥ 90 %", "Pharos la mide", true],
    ]);
    expect(strategy.criteria[0]).toEqual({
      criterion: "% de casos ejecutados",
      metric: "≥ 95 %",
      linked: "% de casos ejecutados",
      blocking: true,
    });
  });
});
