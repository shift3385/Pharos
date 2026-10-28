import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { projectDefects } from "@modules/planner";
import { projectTraceableCases, setCaseRequirementKeys, type TraceableCase } from "@modules/test-cases";
import { useToast } from "@shared/ui/Toast";
import { requirementApi } from "../api/requirementApi";
import { buildMatrix, defectLabel, type MatrixDefect, type MatrixRow } from "../model/matrix";
import { proposeMigration, type MigrationProposal } from "../model/migration";
import type { Requirement } from "../model/types";
import { MigrateTraceabilityModal } from "./MigrateTraceabilityModal";
import "./Traceability.css";

interface Data {
  requirements: Requirement[];
  cases: TraceableCase[];
  defects: MatrixDefect[];
}

const isGap = (r: MatrixRow) => r.coverage === "not_covered" || r.notes.length > 0;

/** Requirement ↔ test case ↔ defect matrix (TRZ-02) with its coverage gaps,
 *  the free-text migration (D2) and the .xlsx export. */
export function MatrixView({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function refresh() {
    const [requirements, cases, cards] = await Promise.all([
      requirementApi.list(projectId),
      projectTraceableCases(projectId),
      projectDefects(projectId, ownerId),
    ]);
    setData({
      requirements,
      cases,
      defects: cards.map((c) => ({
        id: c.id,
        cardKey: c.cardKey,
        title: c.title,
        status: c.status,
        testCaseIds: c.data.testCaseIds ?? [],
      })),
    });
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, ownerId]);

  const matrix = useMemo(
    () => (data ? buildMatrix(data.requirements, data.cases, data.defects) : null),
    [data],
  );
  const proposals = useMemo(
    () => (data ? proposeMigration(data.cases, data.requirements.map((r) => r.requirementKey)) : []),
    [data],
  );

  if (!data || !matrix) return <p className="tr__muted">{t("common.loading")}</p>;

  async function applyMigration(selected: MigrationProposal[]) {
    const toCreate = [...new Set(selected.filter((p) => p.createsRequirement).map((p) => p.requirementKey))];
    if (toCreate.length) {
      await requirementApi.importRows(
        projectId,
        ownerId,
        toCreate.map((key) => ({ requirementKey: key, title: key })),
      );
    }
    const byCase = new Map<string, string[]>();
    for (const p of selected) byCase.set(p.caseId, [...(byCase.get(p.caseId) ?? []), p.requirementKey]);
    for (const [caseId, keys] of byCase) {
      const current = data?.cases.find((c) => c.id === caseId)?.requirementKeys ?? [];
      await setCaseRequirementKeys(caseId, [...current, ...keys]);
    }
    toast(t("traceability.migrate.doneToast", { links: selected.length, creates: toCreate.length }));
    setMigrating(false);
    await refresh();
  }

  async function exportXlsx() {
    if (!matrix) return;
    setExporting(true);
    try {
      const { exportMatrixXlsx } = await import("../export/matrixXlsx");
      const name = await exportMatrixXlsx(matrix, projectId, projectName, i18n.resolvedLanguage ?? "es", t);
      toast(t("traceability.matrix.exportedToast", { name }));
    } finally {
      setExporting(false);
    }
  }

  const { summary, gaps } = matrix;
  const rows = onlyGaps ? matrix.rows.filter(isGap) : matrix.rows;
  const pct = Math.round(summary.coverageRatio * 100);

  return (
    <section className="tr">
      <header className="tr__header">
        <div>
          <h2>{t("traceability.matrix.title")}</h2>
          <p className="tr__subtitle">{t("traceability.matrix.subtitle")}</p>
        </div>
        <div className="tr__actions">
          {proposals.length > 0 && (
            <button className="tr__secondary" type="button" onClick={() => setMigrating(true)}>
              {t("traceability.migrate.button", { count: proposals.length })}
            </button>
          )}
          <button
            className="tr__primary"
            type="button"
            disabled={exporting}
            onClick={() => void exportXlsx()}
          >
            {exporting ? t("traceability.matrix.exporting") : t("traceability.matrix.exportXlsx")}
          </button>
        </div>
      </header>

      <dl className="tr-stats">
        <div className="tr-stat">
          <dt>{t("traceability.matrix.total")}</dt>
          <dd>{summary.totalRequirements}</dd>
        </div>
        <div className="tr-stat">
          <dt>{t("traceability.matrix.covered")}</dt>
          <dd>{summary.covered}</dd>
        </div>
        <div className={`tr-stat${summary.uncovered ? " tr-stat--gap" : ""}`}>
          <dt>{t("traceability.matrix.uncovered")}</dt>
          <dd>{summary.uncovered}</dd>
        </div>
        <div className="tr-stat">
          <dt>{t("traceability.matrix.coverage")}</dt>
          <dd>{pct}%</dd>
        </div>
      </dl>

      <label className="tr-toggle">
        <input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} />
        {t("traceability.matrix.onlyGaps")}
      </label>

      {matrix.rows.length === 0 ? (
        <p className="tr__muted">{t("traceability.matrix.empty")}</p>
      ) : (
        <div className="tr-table-wrap tr-table-wrap--matrix">
          <table className="tr-table">
            <thead>
              <tr>
                <th>{t("traceability.matrix.col.requirement")}</th>
                <th>{t("traceability.matrix.col.requirementTitle")}</th>
                <th>{t("traceability.matrix.col.priority")}</th>
                <th>{t("traceability.matrix.col.case")}</th>
                <th>{t("traceability.matrix.col.caseTitle")}</th>
                <th>{t("traceability.matrix.col.execution")}</th>
                <th>{t("traceability.matrix.col.defects")}</th>
                <th>{t("traceability.matrix.col.coverage")}</th>
                <th>{t("traceability.matrix.col.notes")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.requirementKey}-${r.caseId ?? i}`} className={isGap(r) ? "tr-row--gap" : undefined}>
                  <td className="tr-key">{r.requirementKey}</td>
                  <td>{r.requirementTitle}</td>
                  <td>{t(`traceability.priorityLabel.${r.priority}`)}</td>
                  <td className="tr-mono">{r.scenarioId ?? "—"}</td>
                  <td>{r.caseTitle ?? ""}</td>
                  <td>{r.executionStatus ? t(`traceability.execution.${r.executionStatus}`) : ""}</td>
                  <td className="tr-mono">{r.defectKeys.join(", ")}</td>
                  <td>
                    <span className={`tr-coverage tr-coverage--${r.coverage}`}>
                      {t(`traceability.coverage.${r.coverage}`)}
                    </span>
                  </td>
                  <td>{r.notes.map((n) => t(`traceability.note.${n}`)).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(gaps.casesWithoutRequirement.length > 0 ||
        gaps.unknownLinks.length > 0 ||
        gaps.defectsWithoutCase.length > 0) && (
        <section className="tr-gaps" aria-label={t("traceability.gaps.title")}>
          <h3>{t("traceability.gaps.title")}</h3>
          {gaps.casesWithoutRequirement.length > 0 && (
            <div>
              <p className="tr-gaps__label">{t("traceability.gaps.casesWithoutRequirement")}</p>
              <p>
                {gaps.casesWithoutRequirement.map((c) => (
                  <span key={c.id} className="tr-gaps__item">
                    <span className="tr-mono">{c.scenarioId}</span> {c.title}
                  </span>
                ))}
              </p>
            </div>
          )}
          {gaps.unknownLinks.length > 0 && (
            <div>
              <p className="tr-gaps__label">{t("traceability.gaps.unknownLinks")}</p>
              <p>
                {gaps.unknownLinks.map((l) => (
                  <span key={`${l.caseId}-${l.requirementKey}`} className="tr-gaps__item">
                    <span className="tr-mono">{l.scenarioId}</span> → <span className="tr-mono">{l.requirementKey}</span>
                  </span>
                ))}
              </p>
            </div>
          )}
          {gaps.defectsWithoutCase.length > 0 && (
            <div>
              <p className="tr-gaps__label">{t("traceability.gaps.defectsWithoutCase")}</p>
              <p>
                {gaps.defectsWithoutCase.map((d) => (
                  <span key={d.id} className="tr-gaps__item">
                    <span className="tr-mono">{defectLabel(d)}</span> {d.title}
                  </span>
                ))}
              </p>
            </div>
          )}
        </section>
      )}

      {migrating && (
        <MigrateTraceabilityModal
          proposals={proposals}
          onApply={applyMigration}
          onCancel={() => setMigrating(false)}
        />
      )}
    </section>
  );
}
