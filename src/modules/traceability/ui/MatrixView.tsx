import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { caseLink } from "@modules/test-cases";
import { Switch } from "@shared/ui/Switch";
import { parseStamp } from "@shared/time/stamp";
import { Trans, useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { DataTable, type DataColumn } from "@shared/ui/DataTable";
import { Pagination } from "@shared/ui/Pagination";
import { StatusPill, type PillTone } from "@shared/ui/StatusPill";
import { PriorityFlag } from "@shared/ui/PriorityFlag";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import {
  defectLabel,
  type ExecutionStatus,
  type MatrixRow,
  type RiskBand,
  type TraceabilityMatrix,
} from "../model/matrix";
import type { Requirement } from "../model/types";
import { priorityTone } from "./traceTones";
import "@shared/ui/buttons.css";
import "./Traceability.css";

const EXECUTION_TONE: Record<ExecutionStatus, PillTone> = {
  passed: "success",
  failed: "error",
  retest: "error",
  blocked: "warning",
  skipped: "neutral",
  other: "info",
  not_run: "neutral",
};
const SEVERITY_TONE: Record<string, PillTone> = {
  critical: "error",
  major: "warning",
  minor: "info",
  trivial: "neutral",
};
const RISK_TONE: Record<RiskBand, PillTone> = {
  high: "error",
  medium: "warning",
  low: "success",
  unassessed: "neutral",
};
const PAGE_SIZES = [10, 25, 50];

/** A matrix row plus whether it opens its requirement's group (the
 *  requirement cells show only there). */
interface Line {
  row: MatrixRow;
  first: boolean;
  key: string;
}

/** A requirement with its rows, for the mobile cards and the pagination. */
interface Group {
  key: string;
  rows: MatrixRow[];
}

function groupRows(rows: MatrixRow[]): Group[] {
  const groups: Group[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last?.key === row.requirementKey) last.rows.push(row);
    else groups.push({ key: row.requirementKey, rows: [row] });
  }
  return groups;
}

/**
 * Requirement ↔ test case ↔ defect matrix (TRZ-02, SPEC §8): four indicators,
 * the 9-column matrix with uncovered requirements in red and «Generar casos con
 * IA» on them, «Mostrar solo huecos» with its count, labelled cards on mobile,
 * pagination by requirement and the chain gaps with the free-text migration.
 */
export function MatrixView({
  projectId,
  matrix,
  requirements,
  aiReady,
  proposals,
  onGenerate,
  onMigrate,
  filters,
}: {
  projectId: string;
  matrix: TraceabilityMatrix;
  /** The result filters and order (EJE-04), above the matrix. */
  filters?: ReactNode;
  requirements: Requirement[];
  aiReady: boolean;
  /** Free-text IDs that can become links (D2). */
  proposals: number;
  onGenerate: (requirementKey: string) => void;
  onMigrate: () => void;
}) {
  const { t, i18n } = useTranslation();
  const mobile = useBreakpoint() === "mobile";
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const { summary, gaps } = matrix;
  const pct = Math.round(summary.coverageRatio * 100);
  const high = requirements.filter((r) => r.priority === "high");
  const uncoveredKeys = new Set(gaps.uncoveredRequirements);
  const highUncovered = high.filter((r) => uncoveredKeys.has(r.requirementKey)).length;

  const groups = useMemo(() => {
    const all = groupRows(matrix.rows);
    return onlyGaps ? all.filter((g) => g.rows[0].coverage === "not_covered") : all;
  }, [matrix.rows, onlyGaps]);
  const pages = Math.max(1, Math.ceil(groups.length / pageSize));
  const current = Math.min(page, pages);
  const shown = groups.slice((current - 1) * pageSize, current * pageSize);
  const lines: Line[] = shown.flatMap((g) =>
    g.rows.map((row, i) => ({ row, first: i === 0, key: `${g.key}-${row.caseId ?? i}` })),
  );

  const coveragePill = (r: MatrixRow) => (
    <StatusPill tone={r.coverage === "covered" ? "success" : "error"}>
      {t(`traceability.coverage.${r.coverage}`)}
    </StatusPill>
  );
  const executionPill = (status: ExecutionStatus) => (
    <StatusPill tone={EXECUTION_TONE[status] ?? "info"} dot>
      {t(`traceability.execution.${status}`)}
    </StatusPill>
  );
  const day = (at: string | null | undefined) =>
    at
      ? parseStamp(at).toLocaleDateString(i18n.resolvedLanguage, {
          day: "2-digit",
          month: "short",
        })
      : null;
  /** «Estado de prueba» (EJE-04): the latest final result, its run and date,
   *  flaky and outdated. */
  const result = (r: MatrixRow) => {
    if (!r.executionStatus) return "—";
    const last = r.last;
    return (
      <div className="tz-result" data-testid={`trace-result-${r.scenarioId ?? ""}`}>
        {executionPill(r.executionStatus)}
        {last && (
          <span className="tz-result__meta">
            <Link
              className="tr-mono"
              to={`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(last.runId)}`}
              title={t("traceability.result.openRun", { run: last.runKey })}
              data-testid="trace-run-link"
            >
              {last.runKey}
            </Link>
            {day(last.at) && <span> · {day(last.at)}</span>}
          </span>
        )}
        {last?.flaky && (
          <StatusPill tone="warning" title={t("traceability.note.flaky")}>
            {t("traceability.result.flaky")}
          </StatusPill>
        )}
        {last?.stale && (
          <StatusPill tone="neutral" title={t("traceability.result.staleTitle")}>
            {t("traceability.result.stale")}
          </StatusPill>
        )}
      </div>
    );
  };
  const riskBadge = (r: MatrixRow) =>
    r.riskLevel !== null ? (
      <StatusPill tone={RISK_TONE[r.riskBand]} className="tz-risk">
        {t("traceability.risk.badge", {
          level: r.riskLevel,
          band: t(`traceability.risk.band.${r.riskBand}`),
        })}
      </StatusPill>
    ) : null;
  const priorityCell = (r: MatrixRow) => (
    <span className="tz-prio">
      <PriorityFlag
        tone={priorityTone(r.priority)}
        label={t(`traceability.priorityLabel.${r.priority}`)}
        showLabel
      />
      {riskBadge(r)}
    </span>
  );
  const generateButton = (key: string, compact: boolean) => (
    <button
      type="button"
      className="ui-btn ui-btn--small tz-ai"
      aria-disabled={!aiReady || undefined}
      title={aiReady ? t("traceability.generate.button", { key }) : t("ai.assist.unavailable")}
      onClick={() => {
        if (aiReady) onGenerate(key);
      }}
    >
      <Sparkles size={15} aria-hidden="true" />
      <span className="ui-btn__text">
        {t("traceability.matrix.generate")}
        {compact && <span className="sr-only"> {t("traceability.matrix.generateFrom", { key })}</span>}
      </span>
    </button>
  );
  /** The case ID opens it in Casos. */
  const caseKey = (r: MatrixRow) =>
    r.caseId && r.scenarioId ? (
      <Link className="tr-mono tz-caselink" to={caseLink(projectId, r.caseId)} title={r.caseTitle}>
        {r.scenarioId}
      </Link>
    ) : (
      <span className="tr-mono">—</span>
    );
  const notes = (r: MatrixRow) =>
    r.notes.length ? r.notes.map((n) => t(`traceability.note.${n}`)).join(" · ") : "—";
  const defectPills = (r: MatrixRow) =>
    r.defects.length ? (
      <span className="tz-defects">
        {r.defects.map((d) => (
          <StatusPill
            key={d.label}
            tone={d.open ? (SEVERITY_TONE[d.severity ?? ""] ?? "neutral") : "neutral"}
            strike={!d.open}
            title={d.severity ? t(`defects.severity.${d.severity}`) : undefined}
            className="tr-mono"
          >
            {d.label}
          </StatusPill>
        ))}
      </span>
    ) : (
      "—"
    );

  const columns: DataColumn<Line>[] = [
    {
      id: "req",
      header: t("traceability.matrix.col.requirement"),
      width: "84px",
      cell: (l) => l.first && <span className="tr-key">{l.row.requirementKey}</span>,
    },
    {
      id: "reqTitle",
      header: t("traceability.matrix.col.requirementTitle"),
      width: "minmax(0,1.2fr)",
      cell: (l) =>
        l.first && (
          <span className="tz-clip" title={l.row.requirementTitle}>
            {l.row.requirementTitle}
          </span>
        ),
    },
    {
      id: "priority",
      header: t("traceability.matrix.col.priority"),
      width: "112px",
      cell: (l) => l.first && priorityCell(l.row),
    },
    {
      id: "case",
      header: t("traceability.matrix.col.case"),
      width: "84px",
      cell: (l) => caseKey(l.row),
    },
    {
      id: "caseTitle",
      header: t("traceability.matrix.col.caseTitle"),
      width: "minmax(0,1.3fr)",
      cell: (l) =>
        l.row.caseId ? (
          <span className="tz-clip" title={l.row.caseTitle}>
            {l.row.caseTitle}
          </span>
        ) : (
          generateButton(l.row.requirementKey, true)
        ),
    },
    {
      id: "execution",
      header: t("traceability.matrix.col.execution"),
      width: "150px",
      cell: (l) => result(l.row),
    },
    {
      id: "defects",
      header: t("traceability.matrix.col.defects"),
      width: "96px",
      cell: (l) => defectPills(l.row),
    },
    {
      id: "coverage",
      header: t("traceability.matrix.col.coverage"),
      width: "100px",
      cell: (l) => l.first && coveragePill(l.row),
    },
    {
      id: "notes",
      header: t("traceability.matrix.col.notes"),
      width: "minmax(0,1.1fr)",
      cell: (l) => (
        <span className="tz-clip tz-muted" title={notes(l.row)}>
          {notes(l.row)}
        </span>
      ),
    },
  ];

  const card = (g: Group) => {
    const head = g.rows[0];
    const linked = g.rows.filter((r) => r.caseId);
    return (
      <li key={g.key} className="tz-card" data-tone={head.coverage === "not_covered" ? "gap" : undefined}>
        <div className="tz-card__top">
          <span className="tr-key">{head.requirementKey}</span>
          {coveragePill(head)}
        </div>
        <h4 className="tz-card__title">{head.requirementTitle}</h4>
        <dl className="tz-card__fields">
          <dt>{t("traceability.matrix.col.priority")}</dt>
          <dd>{priorityCell(head)}</dd>
        </dl>
        {linked.length === 0 ? (
          <div className="tz-card__none">
            <p>{t("traceability.matrix.noCase")}</p>
            {generateButton(head.requirementKey, false)}
          </div>
        ) : (
          <>
            <p className="tz-card__group">{t("traceability.matrix.linkedCases", { count: linked.length })}</p>
            <ul className="tz-card__cases">
              {linked.map((r) => (
                <li key={r.caseId} className="tz-case">
                  <p className="tz-case__name">
                    {caseKey(r)} {r.caseTitle}
                  </p>
                  <dl className="tz-card__fields">
                    <dt>{t("traceability.matrix.col.execution")}</dt>
                    <dd>{result(r)}</dd>
                    <dt>{t("traceability.matrix.col.defects")}</dt>
                    <dd>{defectPills(r)}</dd>
                    {r.notes.length > 0 && (
                      <>
                        <dt>{t("traceability.matrix.col.notes")}</dt>
                        <dd>{notes(r)}</dd>
                      </>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </li>
    );
  };

  const anyGaps =
    gaps.casesWithoutRequirement.length + gaps.unknownLinks.length + gaps.defectsWithoutCase.length > 0 ||
    proposals > 0;

  return (
    <div className="tz-matrix">
      <div className="tz-toolbar">
        <div className="tz-gaps-toggle" data-on={onlyGaps || undefined}>
          <Switch
            checked={onlyGaps}
            onChange={(v) => {
              setOnlyGaps(v);
              setPage(1);
            }}
            label={t("traceability.matrix.onlyGapsCount", { count: summary.uncovered })}
            title={t("traceability.matrix.onlyGapsHint")}
          />
        </div>
      </div>
      {filters}

      <dl className="tz-kpis">
        <div className="tz-kpi">
          <dt>{t("traceability.matrix.total")}</dt>
          <dd>{summary.totalRequirements}</dd>
          <dd className="tz-kpi__hint">{t("traceability.matrix.kpi.highPriority", { count: high.length })}</dd>
        </div>
        <div className="tz-kpi">
          <dt>{t("traceability.matrix.covered")}</dt>
          <dd>{summary.covered}</dd>
          <dd className="tz-kpi__hint">{t("traceability.matrix.kpi.withCase")}</dd>
        </div>
        <div className="tz-kpi" data-tone={summary.uncovered ? "gap" : undefined}>
          <dt>{t("traceability.matrix.uncovered")}</dt>
          <dd>{summary.uncovered}</dd>
          <dd className="tz-kpi__hint">{t("traceability.matrix.kpi.highPriority", { count: highUncovered })}</dd>
        </div>
        <div className="tz-kpi">
          <dt>{t("traceability.matrix.coverage")}</dt>
          <dd>{summary.totalRequirements ? `${pct} %` : "—"}</dd>
        </div>
      </dl>

      <section className="tz-panel" aria-labelledby="tz-matrix-title">
        <div className="tz-panel__head">
          <h3 id="tz-matrix-title">{t("traceability.matrix.title")}</h3>
          <p className="tr__subtitle">{t("traceability.matrix.subtitle")}</p>
        </div>
        {matrix.rows.length === 0 ? (
          <p className="tz-empty">
            {t("traceability.matrix.empty")}{" "}
            {/* Sibling section (UX-21): /projects/:id/traceability → …/requirements. */}
            <Link to="../requirements" relative="path">
              {t("traceability.matrix.goToRequirements")}
            </Link>
          </p>
        ) : groups.length === 0 ? (
          <p className="tz-empty">{t("traceability.matrix.noGaps")}</p>
        ) : mobile ? (
          <ul className="tz-cards" aria-label={t("traceability.matrix.title")}>
            {shown.map(card)}
          </ul>
        ) : (
          <DataTable
            rows={lines}
            columns={columns}
            getRowId={(l) => l.key}
            label={t("traceability.matrix.title")}
            rowTone={(l) => (l.row.coverage === "not_covered" ? "gap" : undefined)}
            minWidth={1120}
          />
        )}
        {groups.length > 0 && (
          <Pagination
            page={current}
            pageSize={pageSize}
            total={groups.length}
            onPageChange={setPage}
            pageSizes={PAGE_SIZES}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            summary={({ from, to, total }) => (
              <Trans
                i18nKey="traceability.matrix.summary"
                values={{ from, to, total }}
                components={{ b: <b /> }}
              />
            )}
          />
        )}
      </section>

      {anyGaps && (
        <section className="tz-panel tz-gaps" aria-labelledby="tz-gaps-title">
          <div className="tz-panel__head">
            <h3 id="tz-gaps-title">{t("traceability.gaps.title")}</h3>
            <p className="tr__subtitle">{t("traceability.gaps.subtitle")}</p>
          </div>
          <div className="tz-gaps__grid">
            <GapTile
              label={t("traceability.gaps.casesWithoutRequirement")}
              items={gaps.casesWithoutRequirement.map((c) => ({ id: c.id, code: c.scenarioId, text: c.title }))}
            />
            <GapTile
              label={t("traceability.gaps.unknownLinks")}
              items={gaps.unknownLinks.map((l) => ({
                id: `${l.caseId}-${l.requirementKey}`,
                code: l.scenarioId,
                text: `→ ${l.requirementKey}`,
              }))}
            />
            <GapTile
              label={t("traceability.gaps.defectsWithoutCase")}
              items={gaps.defectsWithoutCase.map((d) => ({ id: d.id, code: defectLabel(d), text: d.title }))}
            />
          </div>
          {proposals > 0 && (
            <div className="tz-migrate">
              <p>{t("traceability.gaps.migrateHint", { count: proposals })}</p>
              <button type="button" className="ui-btn ui-btn--small" onClick={onMigrate}>
                {t("traceability.migrate.button", { count: proposals })}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** A chain gap: its count and, on demand, the items. */
function GapTile({ label, items }: { label: string; items: { id: string; code: string; text: string }[] }) {
  return (
    <details className="tz-gap" data-empty={items.length === 0 || undefined}>
      <summary>
        <span className="tz-gap__count">{items.length}</span>
        <span className="tz-gap__label">{label}</span>
      </summary>
      {items.length > 0 && (
        <ul className="tz-gap__list">
          {items.map((i) => (
            <li key={i.id}>
              <span className="tr-mono">{i.code}</span> {i.text}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
