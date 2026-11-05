import type { ExecutionSummary } from "@shared/contracts/contract";
import { parseStamp } from "@shared/time/stamp";
import { criterionValue, evaluateExitCriteria } from "../model/exitCriteria";

// The test status report (EJE-03, ISO/IEC/IEEE 29119-3 «Test Status
// Report»), built from the execution derivation (contract v1) only: the
// dialog previews it and the .xlsx and PDF exports write the same sections.
// Pure: every text comes through `t`, no I/O.

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export interface ReportTable {
  headers: string[];
  rows: string[][];
}

export interface ReportContext {
  projectName: string;
  /** «Proyecto», «Ciclo CYC-001 · Regresión», «Plan …». */
  scopeLabel: string;
  /** «Todo el periodo» or «01/11/2026 – 05/11/2026». */
  periodLabel: string;
  generatedAt: Date;
  author: string;
  planTitle: string | null;
  lang?: string;
  summary: string;
  recommendations: string;
}

export interface StatusReport {
  title: string;
  subtitle: string;
  identification: [string, string][];
  progress: [string, string][];
  results: ReportTable;
  defects: ReportTable;
  defectsNote: string;
  coverageLine: string;
  coverageByRisk: ReportTable;
  risky: ReportTable;
  exit: ReportTable;
  /** Met / not met / no data per exit criterion, in `exit.rows` order. */
  exitStates: ("met" | "notMet" | "noData")[];
  issues: ReportTable;
  /** Per case: the latest final result (the .xlsx «Resultados» sheet). */
  cases: ReportTable;
  /** Per requirement: risk, coverage and status (the «Cobertura» sheet). */
  requirements: ReportTable;
  summary: string;
  recommendations: string;
}

const STATUSES = [
  "passed",
  "failed",
  "retest",
  "blocked",
  "skipped",
  "other",
  "notRun",
] as const;
const STATUS_KEY: Record<(typeof STATUSES)[number], string> = {
  passed: "passed",
  failed: "failed",
  retest: "retest",
  blocked: "blocked",
  skipped: "skipped",
  other: "other",
  notRun: "not_run",
};
const SEVERITIES = ["critical", "major", "minor", "trivial"] as const;
const BANDS = ["high", "medium", "low", "unassessed"] as const;

export const pct = (ratio: number | null) =>
  ratio === null ? "—" : `${(Math.round(ratio * 1000) / 10).toFixed(1)} %`;

function when(at: string | null | undefined, lang?: string) {
  return at ? parseStamp(at).toLocaleString(lang) : "—";
}

/** The prefilled summary: the numbers in one paragraph (the user edits it). */
export function autoSummary(s: ExecutionSummary, t: Translate): string {
  const met = s.exitCriteria.filter((c) => c.met === true).length;
  return t("statusReport.autoSummary", {
    executed: s.progress.executed,
    total: s.progress.total,
    unit: t(`statusReport.unit.${s.progressUnit}`),
    pct: pct(s.progress.total ? s.progress.executed / s.progress.total : null),
    rate: pct(s.passRate),
    open: s.defects.open,
    critical: s.defects.openBySeverity.critical,
    met,
    all: s.exitCriteria.length,
  });
}

export function buildStatusReport(
  s: ExecutionSummary,
  ctx: ReportContext,
  t: Translate,
): StatusReport {
  const status = (k: string) => t(`traceability.execution.${k}`);
  const cases = new Map(s.cases.map((c) => [c.caseId, c]));
  const exit = evaluateExitCriteria(s, t);

  const issues: string[][] = [];
  for (const c of s.cases) {
    const kinds: string[] = [];
    if (c.status === "blocked") kinds.push(t("statusReport.issue.blocked"));
    if (c.status === "retest") kinds.push(t("statusReport.issue.retest"));
    if (c.last?.flaky) kinds.push(t("statusReport.issue.flaky"));
    if (c.last?.stale) kinds.push(t("statusReport.issue.stale"));
    if (kinds.length)
      issues.push([
        c.scenarioId,
        c.title,
        kinds.join(", "),
        c.last?.runKey ?? "—",
      ]);
  }

  const risky = s.requirements
    .filter(
      // In scope, or with no case at all (an uncovered risk is still a risk).
      (r) =>
        r.riskBand === "high" &&
        r.status !== "passed" &&
        (r.inScope || !r.covered),
    )
    .sort((a, b) => (b.riskLevel ?? 0) - (a.riskLevel ?? 0))
    .map((r) => [
      r.requirementKey,
      r.title,
      String(r.riskLevel ?? "—"),
      status(r.status),
    ]);

  return {
    title: t("statusReport.title"),
    subtitle: t("statusReport.subtitle"),
    identification: [
      [t("statusReport.field.project"), ctx.projectName],
      [t("statusReport.field.scope"), ctx.scopeLabel],
      [t("statusReport.field.period"), ctx.periodLabel],
      [t("statusReport.field.plan"), ctx.planTitle ?? t("statusReport.noPlan")],
      [t("statusReport.field.generated"), ctx.generatedAt.toLocaleString(ctx.lang)],
      [t("statusReport.field.author"), ctx.author || "—"],
      [
        t("statusReport.field.runs"),
        s.runs.length ? s.runs.map((r) => r.runKey).join(", ") : "—",
      ],
    ],
    progress: [
      [t("statusReport.field.unit"), t(`statusReport.unit.${s.progressUnit}`)],
      [t("statusReport.progress.executed"), String(s.progress.executed)],
      [t("statusReport.progress.total"), String(s.progress.total)],
      [
        t("statusReport.progress.executedPct"),
        pct(s.progress.total ? s.progress.executed / s.progress.total : null),
      ],
      [t("statusReport.progress.passRate"), pct(s.passRate)],
      [t("statusReport.progress.lastExecution"), when(s.lastExecutedAt, ctx.lang)],
    ],
    results: {
      headers: [t("statusReport.col.status"), t("statusReport.col.count")],
      rows: STATUSES.map((k) => [status(STATUS_KEY[k]), String(s.progress[k])]),
    },
    defects: {
      headers: [
        t("statusReport.col.severity"),
        t("statusReport.col.open"),
        t("statusReport.col.total"),
      ],
      rows: [
        ...SEVERITIES.map((k) => [
          t(`defects.severity.${k}`),
          String(s.defects.bySeverity[k].open),
          String(s.defects.bySeverity[k].total),
        ]),
        ...Object.entries(s.defects.byStatus).map(([k, n]) => [
          t(`defects.status.${k}`),
          "",
          String(n),
        ]),
      ],
    },
    defectsNote: t("statusReport.asOfToday"),
    coverageLine: t("statusReport.coverageLine", {
      covered: s.coverage.covered,
      total: s.coverage.requirements,
      pct: pct(s.coverage.coverageRatio),
    }),
    coverageByRisk: {
      headers: [
        t("statusReport.col.band"),
        t("statusReport.col.requirements"),
        t("statusReport.col.covered"),
        t("statusReport.col.executed"),
        t("statusReport.col.passed"),
        t("statusReport.col.failed"),
      ],
      rows: BANDS.map((b) => {
        const r = s.coverage.byRisk[b];
        return [
          t(`traceability.risk.band.${b}`),
          String(r.requirements),
          String(r.covered),
          String(r.executed),
          String(r.passed),
          String(r.failed),
        ];
      }),
    },
    risky: {
      headers: [
        t("statusReport.col.requirement"),
        t("statusReport.col.title"),
        t("statusReport.col.risk"),
        t("statusReport.col.status"),
      ],
      rows: risky,
    },
    exit: {
      headers: [
        t("statusReport.col.criterion"),
        t("statusReport.col.target"),
        t("statusReport.col.actual"),
        t("statusReport.col.result"),
      ],
      rows: exit.map((c) => [
        c.label,
        c.metric || "—",
        criterionValue(c),
        c.kind === null
          ? t("statusReport.exit.manual")
          : t(`statusReport.exit.${c.state}`),
      ]),
    },
    exitStates: exit.map((c) => c.state),
    issues: {
      headers: [
        t("statusReport.col.case"),
        t("statusReport.col.title"),
        t("statusReport.col.issue"),
        t("statusReport.col.run"),
      ],
      rows: issues,
    },
    cases: {
      headers: [
        t("statusReport.col.case"),
        t("statusReport.col.title"),
        t("statusReport.col.status"),
        t("statusReport.col.run"),
        t("statusReport.col.date"),
        t("traceability.resultsSheet.col.configuration"),
        t("traceability.resultsSheet.col.origin"),
        t("traceability.resultsSheet.col.flaky"),
        t("traceability.resultsSheet.col.stale"),
      ],
      rows: s.cases.map((c) => [
        c.scenarioId,
        c.title,
        status(c.status),
        c.last?.runKey ?? "",
        c.last?.at ?? "",
        c.last?.configurationLabel ?? "",
        c.last ? t(`traceability.result.origin.${c.last.origin}`) : "",
        c.last ? t(c.last.flaky ? "statusReport.yes" : "statusReport.no") : "",
        c.last ? t(c.last.stale ? "statusReport.yes" : "statusReport.no") : "",
      ]),
    },
    requirements: {
      headers: [
        t("statusReport.col.requirement"),
        t("statusReport.col.title"),
        t("statusReport.col.risk"),
        t("statusReport.col.band"),
        t("statusReport.col.covered"),
        t("statusReport.col.executed"),
        t("statusReport.col.status"),
        t("statusReport.col.case"),
      ],
      rows: s.requirements.map((r) => [
        r.requirementKey,
        r.title,
        r.riskLevel === null ? "" : String(r.riskLevel),
        t(`traceability.risk.band.${r.riskBand}`),
        t(r.covered ? "statusReport.yes" : "statusReport.no"),
        `${r.executedCases}/${r.caseIds.length}`,
        status(r.status),
        r.caseIds.map((id) => cases.get(id)?.scenarioId ?? "").filter(Boolean).join(", "),
      ]),
    },
    summary: ctx.summary,
    recommendations: ctx.recommendations,
  };
}

/** File name of an export: `Informe_estado_<proyecto>_<yyyy-mm-dd>.<ext>`. */
export function reportFileName(
  projectName: string,
  date: Date,
  ext: "xlsx" | "pdf",
  t: Translate,
): string {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const base = t("statusReport.title").replace(/[^\p{L}\p{N}]+/gu, "_");
  const project = projectName.replace(/[^\p{L}\p{N}_-]+/gu, "_");
  return `${base}_${project}_${day}.${ext}`;
}
