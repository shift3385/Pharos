import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileText } from "lucide-react";
import { useAuth } from "@modules/auth";
import { cycleApi } from "@modules/cycles";
import { projectPlanRef } from "@modules/test-plan";
import type { ExecutionSummary } from "@shared/contracts/contract";
import { Dialog } from "@shared/ui/Dialog";
import { DatePicker } from "@shared/ui/DatePicker";
import { FormField } from "@shared/ui/FormField";
import { Select } from "@shared/ui/Select";
import { SegmentedControl } from "@shared/ui/SegmentedControl";
import { StatusPill, type PillTone } from "@shared/ui/StatusPill";
import { useToast } from "@shared/ui/Toast";
import { unlessReported } from "@shared/ui/notify";
import { executionApi, periodOf } from "../api/executionApi";
import {
  autoSummary,
  buildStatusReport,
  reportFileName,
  type ReportTable,
} from "./statusReport";
import type { ReportLabels } from "./reportXlsx";
import "@shared/ui/ConfirmDialog.css";
import "@shared/ui/buttons.css";
import "./StatusReport.css";
import { TextArea } from "@shared/ui/TextArea";
import { DecisionPreview } from "./DecisionPreview";

type Scope = "project" | "cycle" | "plan";

interface Draft {
  summary: string;
  recommendations: string;
}

/** The texts the user writes stay on this device (approved: no entity, no
 *  sync): one draft per project and scope. Storage may be unavailable. */
const draftKey = (userId: string, projectId: string, scope: string) =>
  `pharos:status-report:${userId}:${projectId}:${scope}`;
function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, d: Draft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(d));
  } catch {
    // Private mode or full storage: the texts still go into this export.
  }
}

const EXIT_TONE: Record<string, PillTone> = {
  met: "success",
  notMet: "error",
  noData: "neutral",
  manual: "neutral",
};

/**
 * «Informe de estado» (EJE-03, ISO/IEC/IEEE 29119-3): a test status report
 * of the project, a cycle or the plan over a period, from the execution
 * derivation: progress, results by status, defects (as of today), coverage
 * and risks, the plan's exit criteria, blockers, and an editable summary and
 * recommendations. Exports .xlsx and PDF to the download folder. No design
 * in docs/rediseno: built with the shared dialog, fields and pills.
 */
export function StatusReportDialog({
  projectId,
  projectName,
  initialCycleId,
  onClose,
}: {
  projectId: string;
  projectName: string;
  /** Opened from a cycle: scoped to it. */
  initialCycleId?: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const toast = useToast();
  const id = useId();
  const [scope, setScope] = useState<Scope>(initialCycleId ? "cycle" : "project");
  const [cycleId, setCycleId] = useState(initialCycleId ?? "");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [cycles, setCycles] = useState<{ id: string; label: string }[]>([]);
  const [plan, setPlan] = useState<{ id: string; title: string } | null>(null);
  const [summary, setSummary] = useState<ExecutionSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const scopeId =
    scope === "cycle" ? `cycle:${cycleId}` : scope === "plan" ? `plan:${plan?.id ?? ""}` : "project";
  const key = draftKey(userId, projectId, scopeId);
  const [draft, setDraft] = useState<Draft>({ summary: "", recommendations: "" });
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!userId) return;
    void cycleApi
      .list(projectId, userId)
      .then((list) => {
        setCycles(list.map((c) => ({ id: c.id, label: `${c.cycleKey} · ${c.title}` })));
        if (!cycleId && list[0]) setCycleId(list[0].id);
      })
      .catch(() => setCycles([]));
    void projectPlanRef(projectId, userId)
      .then((p) => setPlan(p))
      .catch(() => setPlan(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId]);

  useEffect(() => {
    if (!userId || (scope === "cycle" && !cycleId) || (scope === "plan" && !plan)) {
      setSummary(null);
      return;
    }
    let live = true;
    setFailed(false);
    const { from, to } = periodOf(fromDay || null, toDay || null);
    executionApi
      .summary(
        {
          projectId,
          cycleId: scope === "cycle" ? cycleId : undefined,
          testPlanId: scope === "plan" ? plan?.id : undefined,
          from: from ?? undefined,
          to: to ?? undefined,
        },
        userId,
      )
      .then((s) => live && setSummary(s))
      .catch(() => {
        if (live) {
          setSummary(null);
          setFailed(true);
        }
      });
    return () => {
      live = false;
    };
  }, [projectId, userId, scope, cycleId, plan, fromDay, toDay]);

  // The draft of this scope, or the numbers as a starting summary.
  useEffect(() => {
    const saved = readDraft(key);
    setTouched(Boolean(saved));
    setDraft(saved ?? { summary: "", recommendations: "" });
  }, [key]);
  const shownSummary = touched || !summary ? draft.summary : autoSummary(summary, t);
  const edit = (patch: Partial<Draft>) => {
    const next = { ...draft, summary: shownSummary, ...patch };
    setDraft(next);
    setTouched(true);
    writeDraft(key, next);
  };

  const scopeLabel =
    scope === "cycle"
      ? `${t("statusReport.scopeCycle")} ${cycles.find((c) => c.id === cycleId)?.label ?? ""}`
      : scope === "plan"
        ? `${t("statusReport.scopePlan")} ${plan?.title ?? ""}`
        : t("statusReport.scopeProject");
  const dateOf = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(i18n.resolvedLanguage) : "…");
  const periodLabel = fromDay || toDay ? `${dateOf(fromDay)} – ${dateOf(toDay)}` : t("statusReport.periodAll");

  const report = useMemo(
    () =>
      summary
        ? buildStatusReport(
            summary,
            {
              projectName,
              scopeLabel,
              periodLabel,
              generatedAt: new Date(),
              author: user?.displayName ?? user?.email ?? "",
              planTitle: plan?.title ?? null,
              lang: i18n.resolvedLanguage,
              summary: shownSummary,
              recommendations: draft.recommendations,
            },
            t,
          )
        : null,
    [summary, projectName, scopeLabel, periodLabel, user, plan, i18n.resolvedLanguage, shownSummary, draft.recommendations, t],
  );

  const labels = (): ReportLabels => ({
    sections: {
      decision: t("gate.report.section"),
      metrics: t("gate.report.metricsSection"),
      identification: t("statusReport.section.identification"),
      progress: t("statusReport.section.progress"),
      results: t("statusReport.section.results"),
      defects: t("statusReport.section.defects"),
      coverage: t("statusReport.section.coverage"),
      exit: t("statusReport.section.exit"),
      issues: t("statusReport.section.issues"),
      summary: t("statusReport.section.summary"),
      recommendations: t("statusReport.section.recommendations"),
    },
    sheets: {
      summary: t("statusReport.sheet.summary"),
      results: t("statusReport.sheet.results"),
      defects: t("statusReport.sheet.defects"),
      coverage: t("statusReport.sheet.coverage"),
      decision: t("gate.report.sheet"),
    },
    risky: t("statusReport.risky"),
    noRisky: t("statusReport.noRisky"),
    noIssues: t("statusReport.noIssues"),
    noData: t("common.noData"),
  });

  async function exportAs(ext: "xlsx" | "pdf") {
    if (!report) return;
    setBusy(true);
    try {
      const name = reportFileName(projectName, new Date(), ext, t);
      const saved =
        ext === "xlsx"
          ? await unlessReported(import("./reportXlsx").then((m) => m.exportReportXlsx(report, labels(), name)))
          : await unlessReported(import("./reportPdf").then((m) => m.exportReportPdf(report, labels(), name)));
      if (saved) toast(t("statusReport.exportedToast", { name: saved }));
    } catch {
      toast(t("statusReport.exportFailed"));
    } finally {
      setBusy(false);
    }
  }

  const preview = (tbl: ReportTable, empty: string) =>
    tbl.rows.length === 0 ? (
      <p className="sr-empty">{empty}</p>
    ) : (
      <div className="sr-tablewrap">
        <table className="sr-table">
          <thead>
            <tr>
              {tbl.headers.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  const pairs = (list: [string, string][]) => (
    <dl className="sr-pairs">
      {list.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <Dialog className="cd sr-modal" labelledBy={`${id}-title`} onClose={onClose} dismissable={!busy}>
      <div data-testid="status-report" className="sr">
        <header className="sr-head">
          <h3 id={`${id}-title`} className="cd__title">
            <FileText size={18} aria-hidden="true" /> {t("statusReport.title")}
          </h3>
          <p className="cd__msg">{t("statusReport.subtitle")}</p>
        </header>

        <div className="sr-controls">
          <SegmentedControl<Scope>
            label={t("statusReport.scope")}
            testId="report-scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: "project", label: t("statusReport.scopeProject") },
              {
                value: "cycle",
                label: t("statusReport.scopeCycle"),
                disabled: cycles.length === 0,
                title: cycles.length === 0 ? t("statusReport.noCycles") : undefined,
              },
              {
                value: "plan",
                label: t("statusReport.scopePlan"),
                disabled: !plan,
                title: plan ? undefined : t("statusReport.noPlan"),
              },
            ]}
          />
          {scope === "cycle" && (
            <FormField label={t("statusReport.cycle")}>
              {(p) => (
                <Select
                  {...p}
                  value={cycleId}
                  data-testid="report-cycle"
                  onChange={setCycleId}
                  options={cycles.map((c) => ({ value: c.id, label: c.label }))}
                />
              )}
            </FormField>
          )}
          <div className="sr-period">
            <FormField label={t("statusReport.from")}>
              {(p) => (
                <DatePicker
                  {...p}
                  value={fromDay}
                  max={toDay || undefined}
                  data-testid="report-from"
                  onChange={setFromDay}
                />
              )}
            </FormField>
            <FormField label={t("statusReport.to")}>
              {(p) => (
                <DatePicker
                  {...p}
                  value={toDay}
                  min={fromDay || undefined}
                  data-testid="report-to"
                  onChange={setToDay}
                />
              )}
            </FormField>
          </div>
        </div>

        {failed ? (
          <p className="sr-empty" role="alert">
            {t("statusReport.loadError")}
          </p>
        ) : !report ? (
          <p className="sr-empty" aria-live="polite">
            {t("statusReport.loading")}
          </p>
        ) : (
          <div className="sr-body" aria-live="polite">
            {report.decision && <DecisionPreview d={report.decision} />}
            <section>
              <h4>{t("statusReport.section.identification")}</h4>
              {pairs(report.identification)}
            </section>
            <section>
              <h4>{t("statusReport.section.progress")}</h4>
              {pairs(report.progress)}
            </section>
            <section>
              <h4>{t("statusReport.section.results")}</h4>
              {preview(report.results, t("common.noData"))}
            </section>
            <section>
              <h4>
                {t("statusReport.section.defects")} <span className="sr-note">({report.defectsNote})</span>
              </h4>
              {preview(report.defects, t("common.noData"))}
            </section>
            <section>
              <h4>{t("statusReport.section.coverage")}</h4>
              <p>{report.coverageLine}</p>
              {preview(report.coverageByRisk, t("common.noData"))}
              <h5>{t("statusReport.risky")}</h5>
              {preview(report.risky, t("statusReport.noRisky"))}
            </section>
            <section>
              <h4>{t("statusReport.section.exit")}</h4>
              {!plan && <p className="sr-note">{t("statusReport.noPlan")}</p>}
              <ul className="sr-exit" data-testid="report-exit">
                {report.exit.rows.map((r, i) => (
                  <li key={i}>
                    <span className="sr-exit__label">{r[0]}</span>
                    <span className="sr-exit__nums">
                      {r[1]} · {r[2]}
                    </span>
                    <StatusPill tone={EXIT_TONE[report.exitStates[i]]}>{r[3]}</StatusPill>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h4>{t("statusReport.section.issues")}</h4>
              {preview(report.issues, t("statusReport.noIssues"))}
            </section>
            <section>
              <h4>{t("statusReport.section.summary")}</h4>
              <FormField label={t("statusReport.summaryLabel")} hint={t("statusReport.summaryHint")}>
                {(p) => (
                  <TextArea
                    size="document"
                    {...p}
                    value={shownSummary}
                    data-testid="report-summary"
                    onChange={(e) => edit({ summary: e.target.value })}
                  />
                )}
              </FormField>
            </section>
            <section>
              <h4>{t("statusReport.section.recommendations")}</h4>
              <FormField label={t("statusReport.recommendationsLabel")}>
                {(p) => (
                  <TextArea
                    size="document"
                    {...p}
                    value={draft.recommendations}
                    placeholder={t("statusReport.recommendationsPlaceholder")}
                    data-testid="report-recommendations"
                    onChange={(e) => edit({ recommendations: e.target.value })}
                  />
                )}
              </FormField>
              <p className="sr-note">{t("statusReport.localNote")}</p>
            </section>
          </div>
        )}

        <div className="cd__actions sr-actions">
          <button type="button" className="cd__cancel" onClick={onClose} disabled={busy}>
            {t("common.close")}
          </button>
          <button
            type="button"
            className="ui-btn"
            disabled={!report || busy}
            data-testid="report-export-xlsx"
            onClick={() => void exportAs("xlsx")}
          >
            <Download size={16} aria-hidden="true" />
            {t("statusReport.exportXlsx")}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            disabled={!report || busy}
            data-testid="report-export-pdf"
            onClick={() => void exportAs("pdf")}
          >
            <Download size={16} aria-hidden="true" />
            {t("statusReport.exportPdf")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
