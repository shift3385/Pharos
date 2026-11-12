import type { CycleClosure, ExecutionSummary } from "@shared/contracts/contract";
import {
  METRIC_KINDS,
  OP_SYMBOL,
  TREND_KINDS,
  formatMetric,
  meets,
  metricDelta,
  metricLabelKey,
  type MetricKind,
  type MetricOp,
} from "@shared/metrics/catalog";
import { decisionSection, type DecisionSection } from "../decisionSection";
import { autoSummary, type ReportTable } from "../statusReport";

// The test completion report of a closed cycle (DOC-01, ISO/IEC/IEEE
// 29119-3 «Test Completion Report», ADR-0044): eleven sections built from
// the cycle's latest closing (frozen by the gate, DOC-02), the cycle's
// summary, its plan and the project's defects, plus the texts the team
// writes, which live in `test_cycles.data.completionReport`. Pure: every
// text comes through `t`, no I/O.

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** The texts a person writes (sections 2, 3, 5, 7, 9 and 10) and the
 *  deliverables of the plan they ticked (section 8). */
export interface CompletionTexts {
  summary: string;
  deviations: string;
  blockers: string;
  risks: string;
  assets: string;
  lessons: string;
  /** Plan deliverable (its stored value) → delivered. */
  delivered: Record<string, boolean>;
}

/** Who approved the report and when (D4, as the plan's PLN-07). */
export interface CompletionApproval {
  by: string;
  byName: string;
  at: string;
}

/** `test_cycles.data.completionReport` (D2): the texts of the report of the
 *  closing at `closedAt` (D3) and its approval. */
export interface StoredCompletion extends CompletionTexts {
  closedAt: string;
  approval: CompletionApproval | null;
  /** Null while the summary keeps following the numbers. */
  summaryEdited?: boolean;
}

export const EMPTY_TEXTS: CompletionTexts = {
  summary: "",
  deviations: "",
  blockers: "",
  risks: "",
  assets: "",
  lessons: "",
  delivered: {},
};

const TEXT_KEYS = ["summary", "deviations", "blockers", "risks", "assets", "lessons"] as const;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The stored report of a cycle's `data`, or null (anything malformed
 *  reads as nothing written yet). */
export function readStored(data: Record<string, unknown> | null | undefined): StoredCompletion | null {
  const raw = data?.completionReport;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const delivered: Record<string, boolean> = {};
  if (r.delivered && typeof r.delivered === "object" && !Array.isArray(r.delivered)) {
    for (const [k, v] of Object.entries(r.delivered as Record<string, unknown>))
      if (typeof v === "boolean") delivered[k] = v;
  }
  const a = r.approval as Record<string, unknown> | null | undefined;
  const approval =
    a && typeof a === "object" && typeof a.by === "string" && typeof a.at === "string"
      ? { by: a.by, byName: str(a.byName), at: a.at }
      : null;
  const out: StoredCompletion = {
    ...EMPTY_TEXTS,
    closedAt: str(r.closedAt),
    approval,
    summaryEdited: r.summaryEdited === true,
    delivered,
  };
  for (const k of TEXT_KEYS) out[k] = str(r[k]);
  return out;
}

/** What the dialog starts from (D3): the stored texts; when they belong to
 *  an earlier closing, the same texts as a starting point, without the
 *  approval, and `stale` so the dialog says so. */
export function draftFor(
  stored: StoredCompletion | null,
  closure: Pick<CycleClosure, "closedAt">,
): { texts: CompletionTexts; summaryEdited: boolean; approval: CompletionApproval | null; stale: boolean } {
  if (!stored) return { texts: { ...EMPTY_TEXTS, delivered: {} }, summaryEdited: false, approval: null, stale: false };
  const { closedAt, approval, summaryEdited, ...texts } = stored;
  const stale = closedAt !== closure.closedAt;
  return { texts, summaryEdited: summaryEdited === true, approval: stale ? null : approval, stale };
}

/** The cycle's `data` with the report saved in it: every other key (the
 *  gate's `closures` among them) as it was. */
export function withCompletion(
  data: Record<string, unknown> | null | undefined,
  stored: StoredCompletion,
): Record<string, unknown> {
  return { ...(data ?? {}), completionReport: stored };
}

/** True when two drafts differ in what a person wrote. */
export function textsDiffer(a: CompletionTexts, b: CompletionTexts): boolean {
  if (TEXT_KEYS.some((k) => a[k] !== b[k])) return true;
  const keys = new Set([...Object.keys(a.delivered), ...Object.keys(b.delivered)]);
  return [...keys].some((k) => Boolean(a.delivered[k]) !== Boolean(b.delivered[k]));
}

/** The plan of the cycle as the report needs it. */
export interface CompletionPlan {
  title: string;
  version: string;
  documentId: string;
  approved: boolean;
  /** The plan's measurable objectives (its metrics with a kind). */
  objectives: { kind: string; op: string; target: number }[];
  /** «Entregables» of the plan: the stored value (the key of the ticks)
   *  and its label in the language of the report. */
  deliverables: { key: string; label: string }[];
  /** «Gestión de datos de prueba» of the plan. */
  testData: string;
}

/** A defect as the residual risks list it. */
export interface CompletionDefect {
  id: string;
  defectKey: string;
  title: string;
  severity: string;
  status: string;
  foundInRunId: string | null;
}

export interface CompletionContext {
  projectName: string;
  /** The project's case prefix, for the document ID («PH-» → TCR-PH-…). */
  prefix: string | null;
  cycle: {
    cycleKey: string;
    title: string;
    startsOn: string | null;
    endsOn: string | null;
    build: string | null;
    environment: string | null;
  };
  plan: CompletionPlan | null;
  defects: CompletionDefect[];
  /** Labels of the cycle's configurations. */
  configurations: string[];
  texts: CompletionTexts;
  /** False while the summary still follows the numbers. */
  summaryEdited: boolean;
  approval: CompletionApproval | null;
  generatedAt: Date;
  lang?: string;
}

export type Tone = "success" | "warning" | "error" | "neutral";

export interface CompletionReport {
  title: string;
  subtitle: string;
  documentId: string;
  /** Section 1. */
  identification: [string, string][];
  /** Section 2: the text shown (the numbers until someone edits it). */
  summary: string;
  /** Section 3: aspect, planned, actual, deviation. */
  deviations: ReportTable;
  deviationTones: Tone[];
  deviationsNote: string;
  /** Section 4: the gate's decision, as DOC-02 builds it. */
  decision: DecisionSection;
  /** Section 5. */
  blockers: ReportTable;
  blockersNote: string;
  /** Section 6: metric, value, previous, change, objective, met. */
  measures: ReportTable;
  measureTones: Tone[];
  /** Per row: the change is better (true), worse (false) or neither. */
  measureTrend: (boolean | null)[];
  /** Section 7. */
  openDefects: ReportTable;
  riskyRequirements: ReportTable;
  /** Per row of `riskyRequirements`: the risk band (high | medium | …). */
  riskyBands: string[];
  risksNote: string;
  /** Section 8: deliverable, origin, delivered. `plan` rows can be ticked. */
  deliverables: ReportTable;
  deliverableItems: { key: string | null; label: string; fromPlan: boolean; delivered: boolean }[];
  /** Section 9. */
  assets: [string, string][];
  assetsNote: string;
  /** Section 10. */
  lessons: string;
  /** Section 11: «Aprobado por … el …», or the draft line. */
  approvalLine: string;
  approved: boolean;
}

const SEVERITY_ORDER = ["critical", "major", "minor", "trivial"];

/** `TCR-<prefix>-<cycle>` (the plan's `TP-…` sibling, PLN-04). */
export function completionDocumentId(prefix: string | null, cycleKey: string): string {
  // The plan's rule (`documentIdFor`): letters and digits, in capitals.
  const p = (prefix ?? "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  return p ? `TCR-${p}-${cycleKey}` : `TCR-${cycleKey}`;
}

/** Whole days from `a` to `b` (calendar days of the local time). */
function daysBetween(a: Date, b: Date): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(b) - day(a)) / 86_400_000);
}

const dayOf = (iso: string) => new Date(`${iso}T00:00:00`);

/** The numbers as a first summary, with the verdict. */
export function completionAutoSummary(s: ExecutionSummary, closure: CycleClosure, t: Translate): string {
  return [
    autoSummary(s, t),
    t("completionReport.autoVerdict", { verdict: t(`gate.verdict.${closure.verdict}`) }),
  ].join(" ");
}

/** The kinds the decision shows: the six of the trend, then the others the
 *  criteria used (the same list `decisionSection` draws). */
function measuredKinds(closure: CycleClosure): MetricKind[] {
  return [
    ...TREND_KINDS,
    ...METRIC_KINDS.filter(
      (k) => !(TREND_KINDS as readonly string[]).includes(k) && closure.criteria.some((c) => c.kind === k),
    ),
  ];
}

const failing = (c: CycleClosure["criteria"][number]) =>
  c.state === "manual" ? c.manualMet === false : c.state !== "met";

export function buildCompletionReport(
  s: ExecutionSummary & { closure: CycleClosure },
  ctx: CompletionContext,
  t: Translate,
): CompletionReport {
  const closure = s.closure;
  const lang = ctx.lang;
  const closedAt = new Date(closure.closedAt);
  const closedOk = !Number.isNaN(closedAt.getTime());
  const dateText = (d: Date) => d.toLocaleDateString(lang);
  const documentId = completionDocumentId(ctx.prefix, ctx.cycle.cycleKey);
  const decision = decisionSection(closure, s.previous, t, lang);
  const yes = t("statusReport.yes");
  const no = t("statusReport.no");

  // 1. Identification.
  const period = [ctx.cycle.startsOn, ctx.cycle.endsOn].some(Boolean)
    ? `${ctx.cycle.startsOn ? dateText(dayOf(ctx.cycle.startsOn)) : "…"} – ${ctx.cycle.endsOn ? dateText(dayOf(ctx.cycle.endsOn)) : "…"}`
    : "—";
  const planLine = ctx.plan
    ? `${ctx.plan.title} · ${ctx.plan.documentId} · v${ctx.plan.version}${ctx.plan.approved ? ` (${t("completionReport.planApproved")})` : ""}`
    : t("completionReport.noPlan");
  const identification: [string, string][] = [
    [t("completionReport.field.document"), documentId],
    [t("statusReport.field.project"), ctx.projectName],
    [t("completionReport.field.cycle"), `${ctx.cycle.cycleKey} · ${ctx.cycle.title}`],
    [t("statusReport.field.plan"), planLine],
    [t("completionReport.field.planned"), period],
    [t("completionReport.field.closed"), closedOk ? closedAt.toLocaleString(lang) : closure.closedAt],
    [
      t("completionReport.field.buildEnv"),
      [ctx.cycle.build, ctx.cycle.environment].filter(Boolean).join(" · ") || "—",
    ],
    [t("statusReport.field.runs"), s.runs.length ? s.runs.map((r) => r.runKey).join(", ") : "—"],
    [t("statusReport.field.generated"), ctx.generatedAt.toLocaleString(lang)],
  ];

  // 3. Deviations from the plan: the end date, the cases left and the
  // blocking criteria not met.
  const deviationRows: string[][] = [];
  const deviationTones: Tone[] = [];
  if (ctx.cycle.endsOn && closedOk) {
    const late = daysBetween(dayOf(ctx.cycle.endsOn), closedAt);
    deviationRows.push([
      t("completionReport.deviation.end"),
      dateText(dayOf(ctx.cycle.endsOn)),
      dateText(closedAt),
      late === 0
        ? t("completionReport.deviation.none")
        : t(late > 0 ? "completionReport.deviation.late" : "completionReport.deviation.early", {
            count: Math.abs(late),
          }),
    ]);
    deviationTones.push(late > 0 ? "warning" : "success");
  } else {
    deviationRows.push([
      t("completionReport.deviation.end"),
      ctx.cycle.endsOn ? dateText(dayOf(ctx.cycle.endsOn)) : "—",
      closedOk ? dateText(closedAt) : "—",
      t("completionReport.deviation.noDate"),
    ]);
    deviationTones.push("neutral");
  }
  const left = s.progress.total - s.progress.executed;
  deviationRows.push([
    t("completionReport.deviation.executed", { unit: t(`statusReport.unit.${s.progressUnit}`) }),
    String(s.progress.total),
    String(s.progress.executed),
    left > 0 ? t("completionReport.deviation.notRun", { count: left }) : t("completionReport.deviation.none"),
  ]);
  deviationTones.push(left > 0 ? "warning" : "success");
  const blocking = closure.criteria.filter((c) => c.blocking);
  const failed = blocking.filter(failing).length;
  deviationRows.push([
    t("completionReport.deviation.criteria"),
    String(blocking.length),
    String(blocking.length - failed),
    failed > 0 ? t("completionReport.deviation.justified", { count: failed }) : t("completionReport.deviation.none"),
  ]);
  deviationTones.push(failed > 0 ? "error" : "success");

  // 5. Factors that blocked progress (the status report's «issues»).
  const blockers: string[][] = [];
  for (const c of s.cases) {
    const kinds: string[] = [];
    if (c.status === "blocked") kinds.push(t("statusReport.issue.blocked"));
    if (c.status === "retest") kinds.push(t("statusReport.issue.retest"));
    if (c.last?.flaky) kinds.push(t("statusReport.issue.flaky"));
    if (c.last?.stale) kinds.push(t("statusReport.issue.stale"));
    if (kinds.length) blockers.push([c.scenarioId, c.title, kinds.join(", "), c.last?.runKey ?? "—"]);
  }

  // 6. Measures: the frozen values against the previous cycle and the plan.
  const kinds = measuredKinds(closure);
  const measureTones: Tone[] = [];
  const measureTrend: (boolean | null)[] = [];
  const measureRows = kinds.map((k) => {
    const v = closure.metrics.values[k];
    const before = s.previous?.values[k] ?? null;
    const delta = metricDelta(k, v, before, lang);
    measureTrend.push(delta?.better ?? null);
    const goal = ctx.plan?.objectives.find((o) => o.kind === k);
    let reached = t("completionReport.measure.noTarget");
    let tone: Tone = "neutral";
    if (goal && v !== null) {
      const ok = meets(v, goal.op, goal.target);
      reached = ok ? yes : no;
      tone = ok ? "success" : "error";
    } else if (goal) reached = t("statusReport.exit.noData");
    measureTones.push(tone);
    const op = OP_SYMBOL[goal?.op as MetricOp] ?? goal?.op ?? "";
    return [
      t(metricLabelKey(k)),
      formatMetric(k, v, lang),
      s.previous ? formatMetric(k, before, lang) : "—",
      delta?.text ?? "—",
      goal ? `${op} ${formatMetric(k, goal.target, lang)}` : "—",
      reached,
    ];
  });

  // 7. Residual risks: open defects of the cycle as of today, and the
  // requirements in scope not covered or not passed, by risk.
  const runIds = new Set(s.runs.map((r) => r.id));
  const reqDefects = new Set(s.requirements.filter((r) => r.inScope).flatMap((r) => r.defectIds));
  const sevRank = (v: string) => {
    const i = SEVERITY_ORDER.indexOf(v);
    return i < 0 ? SEVERITY_ORDER.length : i;
  };
  const open = ctx.defects
    .filter(
      (d) =>
        d.status !== "closed" &&
        d.status !== "rejected" &&
        ((d.foundInRunId !== null && runIds.has(d.foundInRunId)) || reqDefects.has(d.id)),
    )
    .sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || a.defectKey.localeCompare(b.defectKey));
  const risky = s.requirements
    .filter((r) => (r.inScope || !r.covered) && r.status !== "passed")
    .sort((a, b) => (b.riskLevel ?? -1) - (a.riskLevel ?? -1) || a.requirementKey.localeCompare(b.requirementKey));

  // 8. Deliverables: what Pharos holds, then the plan's to tick.
  const items: CompletionReport["deliverableItems"] = [];
  if (ctx.plan)
    items.push({
      label: t("completionReport.deliverable.plan", { id: ctx.plan.documentId, version: ctx.plan.version }),
      key: null,
      fromPlan: false,
      delivered: true,
    });
  if (s.runs.length)
    items.push({
      label: t("completionReport.deliverable.runs", { count: s.runs.length, keys: s.runs.map((r) => r.runKey).join(", ") }),
      key: null,
      fromPlan: false,
      delivered: true,
    });
  items.push({
    key: null,
    label: t("completionReport.deliverable.defects", { count: closure.metrics.defectsFound }),
    fromPlan: false,
    delivered: true,
  });
  items.push({
    key: null,
    label: t("completionReport.deliverable.report", { id: documentId }),
    fromPlan: false,
    delivered: true,
  });
  for (const d of ctx.plan?.deliverables ?? [])
    items.push({ key: d.key, label: d.label, fromPlan: true, delivered: ctx.texts.delivered[d.key] === true });

  return {
    title: t("completionReport.title"),
    subtitle: t("completionReport.subtitle"),
    documentId,
    identification,
    summary: ctx.summaryEdited ? ctx.texts.summary : completionAutoSummary(s, closure, t),
    deviations: {
      headers: [
        t("completionReport.col.aspect"),
        t("completionReport.col.planned"),
        t("completionReport.col.actual"),
        t("completionReport.col.deviation"),
      ],
      rows: deviationRows,
    },
    deviationTones,
    deviationsNote: ctx.texts.deviations,
    decision,
    blockers: {
      headers: [
        t("statusReport.col.case"),
        t("statusReport.col.title"),
        t("statusReport.col.issue"),
        t("statusReport.col.run"),
      ],
      rows: blockers,
    },
    blockersNote: ctx.texts.blockers,
    measures: {
      headers: [
        t("gate.report.metric"),
        ctx.cycle.cycleKey,
        s.previous ? s.previous.cycleKey : t("gate.report.previousNone"),
        t("gate.report.change"),
        t("completionReport.col.objective"),
        t("completionReport.col.reached"),
      ],
      rows: measureRows,
    },
    measureTones,
    measureTrend,
    openDefects: {
      headers: [
        t("completionReport.col.defect"),
        t("statusReport.col.title"),
        t("statusReport.col.severity"),
        t("statusReport.col.status"),
      ],
      rows: open.map((d) => [
        d.defectKey,
        d.title,
        t(`defects.severity.${d.severity}`),
        t(`defects.status.${d.status}`),
      ]),
    },
    riskyRequirements: {
      headers: [
        t("statusReport.col.requirement"),
        t("statusReport.col.title"),
        t("statusReport.col.risk"),
        t("statusReport.col.band"),
        t("completionReport.col.situation"),
      ],
      rows: risky.map((r) => [
        r.requirementKey,
        r.title,
        r.riskLevel === null ? "—" : String(r.riskLevel),
        t(`traceability.risk.band.${r.riskBand}`),
        r.covered ? t(`traceability.execution.${r.status}`) : t("completionReport.uncovered"),
      ]),
    },
    riskyBands: risky.map((r) => r.riskBand),
    risksNote: ctx.texts.risks,
    deliverables: {
      headers: [
        t("completionReport.col.deliverable"),
        t("completionReport.col.origin"),
        t("completionReport.col.delivered"),
      ],
      rows: items.map((i) => [
        i.label,
        t(i.fromPlan ? "completionReport.origin.plan" : "completionReport.origin.pharos"),
        i.delivered ? yes : no,
      ]),
    },
    deliverableItems: items,
    assets: [
      [t("completionReport.asset.cases"), String(s.cases.length)],
      [t("completionReport.asset.configurations"), ctx.configurations.join(", ") || "—"],
      [t("completionReport.asset.testData"), ctx.plan?.testData.trim() || "—"],
    ],
    assetsNote: ctx.texts.assets,
    lessons: ctx.texts.lessons,
    approvalLine: approvalLine(ctx.approval, t, lang),
    approved: ctx.approval !== null,
  };
}

/** «Aprobado por Ana Ruiz el 15/11/2026, 9:10», or the draft line. */
export function approvalLine(a: CompletionApproval | null, t: Translate, lang?: string): string {
  if (!a) return t("completionReport.draft");
  const at = new Date(a.at);
  return t("completionReport.approvedBy", {
    name: a.byName || "—",
    at: Number.isNaN(at.getTime()) ? a.at : at.toLocaleString(lang),
  });
}

export const COMPLETION_SECTIONS = [
  "identification",
  "summary",
  "deviations",
  "evaluation",
  "blockers",
  "measures",
  "risks",
  "deliverables",
  "assets",
  "lessons",
  "approval",
] as const;
export type CompletionSection = (typeof COMPLETION_SECTIONS)[number];

/** The titles the .xlsx and the PDF write. */
export interface CompletionLabels {
  sections: Record<CompletionSection, string>;
  sheets: Record<"report" | "decision" | "measures" | "risks" | "deliverables" | "cases", string>;
  openDefects: string;
  riskyRequirements: string;
  metrics: string;
  notes: string;
  noData: string;
  noBlockers: string;
  noDefects: string;
  noRisky: string;
}

export function completionLabels(t: Translate): CompletionLabels {
  return {
    sections: Object.fromEntries(
      COMPLETION_SECTIONS.map((k) => [k, t(`completionReport.section.${k}`)]),
    ) as Record<CompletionSection, string>,
    sheets: {
      report: t("completionReport.sheet.report"),
      decision: t("gate.report.sheet"),
      measures: t("completionReport.sheet.measures"),
      risks: t("completionReport.sheet.risks"),
      deliverables: t("completionReport.sheet.deliverables"),
      cases: t("completionReport.sheet.cases"),
    },
    openDefects: t("completionReport.openDefects"),
    riskyRequirements: t("completionReport.riskyRequirements"),
    metrics: t("gate.report.metricsSection"),
    notes: t("completionReport.notes"),
    noData: t("common.noData"),
    noBlockers: t("statusReport.noIssues"),
    noDefects: t("completionReport.noDefects"),
    noRisky: t("completionReport.noRisky"),
  };
}

/** `Informe_cierre_<proyecto>_<ciclo>_<yyyy-mm-dd>.<ext>`. */
export function completionFileName(
  projectName: string,
  cycleKey: string,
  date: Date,
  ext: "xlsx" | "pdf",
  t: Translate,
): string {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const base = t("completionReport.fileBase").replace(/[^\p{L}\p{N}]+/gu, "_");
  const clean = (v: string) => v.replace(/[^\p{L}\p{N}_-]+/gu, "_");
  return `${base}_${clean(projectName)}_${clean(cycleKey)}_${day}.${ext}`;
}
