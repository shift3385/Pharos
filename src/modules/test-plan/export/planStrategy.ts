// The ISO/IEC/IEEE 29119-3 sections a plan gained in 0.4.0 (PLN-06), as the
// exports show them: shared by the wizard's export and the project ZIP, so
// both say the same. The .xlsx keeps its template sheet as it was and adds
// three sheets that import reads back by their headers (es/en):
// «Estrategia 29119-3» (section | content), «Métricas» and «Criterios de
// salida» (with what measures each criterion and whether it blocks).
import type { ExportTable } from "@shared/export/extraTables";
import { INDEPENDENCE_LEVELS } from "../model/catalogs";
import { techniqueLabels } from "../model/catalogLabels";
import { metricName, opSign, targetText, unitOf } from "../model/metrics";
import type { Estimation, TestPlanData } from "../model/types";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** One metric as exported (the raw objective too, for the round trip). */
export interface ExportedMetric {
  /** Catalog kind, or "" for an own metric. */
  key: string;
  name: string;
  /** «≥ 95 %». */
  objective: string;
  sign: string;
  target: number;
  /** Localized unit. */
  unit: string;
  /** Localized «Pharos la mide» / «A mano». */
  measured: string;
  /** An exit criterion measures it. */
  exit: boolean;
  note: string;
}

/** One exit criterion as exported, with its link and kind. */
export interface ExportedCriterion {
  criterion: string;
  metric: string;
  /** Name of the metric that measures it; "" when none. */
  linked: string;
  blocking: boolean;
}

export interface StrategyExport {
  assumptions: string[];
  constraints: string[];
  techniques: string[];
  /** Localized level, or "". */
  independence: string;
  independenceNote: string;
  training: { need: string; when: string }[];
  /** «Técnica: …», «Esfuerzo: …», «Presupuesto: …»… one per line. */
  estimationLines: string[];
  entryCriteria: string[];
  suspensionCriteria: string[];
  resumptionCriteria: string[];
  metrics: ExportedMetric[];
  criteria: ExportedCriterion[];
}

const num = (n: number, lang: string) =>
  new Intl.NumberFormat(lang, { maximumFractionDigits: 2, useGrouping: false }).format(n);

/** E = (O + 4M + P) / 6 and σ = (P − O) / 6, once the three are there. */
export function threePoint(e: Estimation): { e: number; sd: number } | null {
  const { optimistic: o, likely: m, pessimistic: p } = e;
  if (o === undefined || m === undefined || p === undefined) return null;
  return { e: (o + 4 * m + p) / 6, sd: (p - o) / 6 };
}

/** The estimation one entry per line, in the export's language. */
export function estimationLines(e: Estimation, t: Translate, lang: string): string[] {
  const out: string[] = [];
  if (e.technique)
    out.push(`${t("testPlan.estimationTechnique")}: ${t(`testPlan.estimationTechniqueLabel.${e.technique}`)}`);
  if (e.technique === "threePoint") {
    const r = threePoint(e);
    if (r)
      out.push(
        t("testPlan.threePointResult", {
          o: num(e.optimistic!, lang),
          m: num(e.likely!, lang),
          p: num(e.pessimistic!, lang),
          e: num(r.e, lang),
          sd: num(r.sd, lang),
        }),
      );
  } else if (e.effort !== undefined) {
    out.push(`${t("testPlan.effort")}: ${num(e.effort, lang)}`);
  }
  if (e.budget?.trim()) out.push(`${t("testPlan.budget")}: ${e.budget.trim()}`);
  if (e.notes?.trim()) out.push(`${t("testPlan.estimationNotes")}: ${e.notes.trim()}`);
  return out;
}

/** The new sections of a plan's data, ready for the PDF and the .xlsx. */
export function strategyExport(d: TestPlanData, t: Translate, lang: string): { strategy: StrategyExport } {
  const metrics = d.metrics ?? [];
  const criteria = (d.closureCriteria ?? []).filter((c) => c.criterion.trim() || c.metric.trim());
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const exits = new Set(criteria.flatMap((c) => (c.metricId && byId.has(c.metricId) ? [c.metricId] : [])));
  const independence =
    d.independence && (INDEPENDENCE_LEVELS as readonly string[]).includes(d.independence)
      ? t(`testPlan.independenceLevel.${d.independence}`)
      : "";
  return {
    strategy: {
      assumptions: d.assumptions ?? [],
      constraints: d.constraints ?? [],
      techniques: techniqueLabels(d.techniques, t),
      independence,
      independenceNote: d.independenceNote ?? "",
      training: (d.training ?? []).filter((r) => r.need.trim() || r.when.trim()),
      estimationLines: estimationLines(d.estimation ?? {}, t, lang),
      entryCriteria: d.entryCriteria ?? [],
      suspensionCriteria: d.suspensionCriteria ?? [],
      resumptionCriteria: d.resumptionCriteria ?? [],
      metrics: metrics.map((m) => ({
        key: m.kind ?? "",
        name: metricName(m, t),
        objective: targetText(m, t, lang),
        sign: opSign(m.op),
        target: m.target,
        unit: t(`testPlan.metricUnit.${unitOf(m)}`),
        measured: t(m.kind ? "testPlan.measure.auto" : "testPlan.measure.manual"),
        exit: exits.has(m.id),
        note: m.note ?? "",
      })),
      criteria: criteria.map((c) => {
        const m = c.metricId ? byId.get(c.metricId) : undefined;
        return {
          criterion: c.criterion,
          metric: c.metric,
          linked: m ? metricName(m, t) : "",
          blocking: c.blocking !== false,
        };
      }),
    },
  };
}

/** Whether there is anything to show of the new sections. */
export const hasStrategy = (s: StrategyExport | undefined): s is StrategyExport =>
  !!s &&
  (s.assumptions.length > 0 ||
    s.constraints.length > 0 ||
    s.techniques.length > 0 ||
    s.independence !== "" ||
    s.independenceNote.trim() !== "" ||
    s.training.length > 0 ||
    s.estimationLines.length > 0 ||
    s.entryCriteria.length > 0 ||
    s.suspensionCriteria.length > 0 ||
    s.resumptionCriteria.length > 0 ||
    s.metrics.length > 0 ||
    s.criteria.some((c) => c.linked || !c.blocking));

/** Ids of the three sheets (and the strategy rows), shared with import. */
export const STRATEGY_TABLE = "strategy";
export const METRICS_TABLE = "metrics";
export const CRITERIA_TABLE = "criteria";

/** Strategy rows by section, in the order of the wizard. The first column
 *  is the label import maps back to the field. */
export const STRATEGY_ROWS = [
  ["assumptions", "testPlan.assumptions"],
  ["constraints", "testPlan.constraints"],
  ["techniques", "testPlan.step.techniques"],
  ["independence", "testPlan.independence"],
  ["independenceNote", "testPlan.independenceNote"],
  ["training", "testPlan.training"],
  ["estimation", "testPlan.step.estimation"],
  ["entryCriteria", "testPlan.entryCriteria"],
  ["suspensionCriteria", "testPlan.suspensionCriteria"],
  ["resumptionCriteria", "testPlan.resumptionCriteria"],
] as const;

/** The three sheets of the new sections (only those with content). */
export function strategyTables(s: StrategyExport | undefined, t: Translate): ExportTable[] {
  if (!hasStrategy(s)) return [];
  const lines = (a: string[]) => a.join("\n");
  const value: Record<(typeof STRATEGY_ROWS)[number][0], string> = {
    assumptions: lines(s.assumptions),
    constraints: lines(s.constraints),
    techniques: lines(s.techniques),
    independence: s.independence,
    independenceNote: s.independenceNote,
    training: lines(s.training.map((r) => (r.when.trim() ? `${r.need} — ${r.when}` : r.need))),
    estimation: lines(s.estimationLines),
    entryCriteria: lines(s.entryCriteria),
    suspensionCriteria: lines(s.suspensionCriteria),
    resumptionCriteria: lines(s.resumptionCriteria),
  };
  const yes = (b: boolean) => (b ? "✓" : "");
  return [
    {
      id: STRATEGY_TABLE,
      name: t("testPlan.strategySheet"),
      headers: [t("testPlan.sectionCol"), t("testPlan.contentCol")],
      rows: STRATEGY_ROWS.map(([key, label]) => [t(label), value[key]]),
      widths: [32, 90],
    },
    {
      id: METRICS_TABLE,
      name: t("testPlan.metricsSheet"),
      headers: [
        t("testPlan.metricsTable.metric"),
        t("testPlan.metricsTable.op"),
        t("testPlan.metricsTable.target"),
        t("testPlan.metricsTable.unit"),
        t("testPlan.metricsTable.exit"),
        t("testPlan.metricsTable.measured"),
        t("testPlan.metricsTable.note"),
        t("testPlan.keyCol"),
      ],
      rows: s.metrics.map((m) => [m.name, m.sign, m.target, m.unit, yes(m.exit), m.measured, m.note, m.key]),
      widths: [32, 10, 10, 18, 14, 18, 40, 16],
      pdf: {
        headers: [
          t("testPlan.metricsTable.metric"),
          t("testPlan.metricsTable.target"),
          t("testPlan.metricsTable.measured"),
          t("testPlan.metricsTable.exit"),
        ],
        rows: s.metrics.map((m) => [m.note ? `${m.name}\n${m.note}` : m.name, m.objective, m.measured, yes(m.exit)]),
        widths: ["40%", "20%", "24%", "16%"],
      },
    },
    {
      id: CRITERIA_TABLE,
      name: t("testPlan.criteriaSheet"),
      headers: [t("testPlan.criterionCol"), t("testPlan.metricCol"), t("testPlan.linkedCol"), t("testPlan.typeCol")],
      rows: s.criteria.map((c) => [
        c.criterion,
        c.metric,
        c.linked,
        t(c.blocking ? "testPlan.closureLink.blocking" : "testPlan.closureLink.advisory"),
      ]),
      widths: [40, 18, 32, 16],
    },
  ];
}
