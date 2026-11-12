import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Download, FileCheck2, Save } from "lucide-react";
import { useAuth } from "@modules/auth";
import { configurationApi, cycleApi } from "@modules/cycles";
import { defectsApi } from "@modules/defects";
import { projectPlanForCompletion } from "@modules/test-plan";
import type { CycleClosure, ExecutionSummary, TestCycle } from "@shared/contracts/contract";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import { StatusPill, type PillTone } from "@shared/ui/StatusPill";
import { TextArea } from "@shared/ui/TextArea";
import { useToast } from "@shared/ui/Toast";
import { unlessReported } from "@shared/ui/notify";
import { executionApi } from "../../api/executionApi";
import { DecisionPreview } from "../DecisionPreview";
import { buildStatusReport, type ReportTable } from "../statusReport";
import {
  buildCompletionReport,
  completionFileName,
  completionLabels,
  draftFor,
  readStored,
  textsDiffer,
  withCompletion,
  type CompletionApproval,
  type CompletionDefect,
  type CompletionPlan,
  type CompletionTexts,
  type Tone,
} from "./completionReport";
import "@shared/ui/ConfirmDialog.css";
import "@shared/ui/buttons.css";
import "../StatusReport.css";
import "./CompletionReport.css";

interface Loaded {
  cycle: TestCycle;
  summary: ExecutionSummary & { closure: CycleClosure };
  plan: CompletionPlan | null;
  defects: CompletionDefect[];
  configurations: string[];
}

const TONE: Record<Tone, PillTone> = {
  success: "success",
  warning: "warning",
  error: "error",
  neutral: "neutral",
};

type TextKey = Exclude<keyof CompletionTexts, "delivered" | "summary">;

/**
 * «Informe de cierre» (DOC-01, ISO/IEC/IEEE 29119-3 «Test Completion
 * Report», ADR-0044) of a closed cycle: eleven sections from the cycle's
 * latest closing, its plan and its defects, with the texts the team writes
 * and an approval with author and date. The texts and the approval live in
 * the cycle (`data.completionReport`), so they sync and are audited; editing
 * a text of an approved report takes the approval away (as the plan's,
 * PLN-07). Exports PDF and .xlsx.
 */
export function CompletionReportDialog({
  projectId,
  projectName,
  projectPrefix,
  cycleId,
  onClose,
}: {
  projectId: string;
  projectName: string;
  projectPrefix: string | null;
  cycleId: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const toast = useToast();
  const id = useId();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [texts, setTexts] = useState<CompletionTexts | null>(null);
  const [summaryEdited, setSummaryEdited] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    Promise.all([
      cycleApi.get(cycleId, userId),
      executionApi.summary({ projectId, cycleId }, userId),
      projectPlanForCompletion(projectId, userId, t, projectPrefix).catch(() => null),
      defectsApi.list(projectId, userId).catch(() => []),
      configurationApi.list(projectId, userId, true).catch(() => []),
    ])
      .then(([cycle, summary, plan, defects, configurations]) => {
        if (!live) return;
        if (!cycle || !summary?.closure) {
          setFailed(true);
          return;
        }
        const names = new Map(configurations.map((c) => [c.id, c.name]));
        setLoaded({
          cycle,
          summary: summary as Loaded["summary"],
          plan,
          defects,
          configurations: cycle.configurationIds.map((c) => names.get(c) ?? "").filter(Boolean),
        });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
    // `t` changes with the language: the plan's labels follow it.
  }, [projectId, cycleId, userId, projectPrefix, t]);

  const stored = useMemo(() => (loaded ? readStored(loaded.cycle.data) : null), [loaded]);
  const start = useMemo(
    () => (loaded ? draftFor(stored, loaded.summary.closure) : null),
    [loaded, stored],
  );
  // The draft starts from what is saved, each time the cycle is read.
  useEffect(() => {
    if (!start) return;
    setTexts(start.texts);
    setSummaryEdited(start.summaryEdited);
  }, [start]);

  const dirty =
    start !== null && texts !== null && (textsDiffer(start.texts, texts) || start.summaryEdited !== summaryEdited);
  // The approval shown: the saved one while nothing changed (D4).
  const approval: CompletionApproval | null = !dirty ? (start?.approval ?? null) : null;

  const report = useMemo(
    () =>
      loaded && texts
        ? buildCompletionReport(
            loaded.summary,
            {
              projectName,
              prefix: projectPrefix,
              cycle: loaded.cycle,
              plan: loaded.plan,
              defects: loaded.defects,
              configurations: loaded.configurations,
              texts,
              summaryEdited,
              approval,
              generatedAt: new Date(),
              lang: i18n.resolvedLanguage,
            },
            t,
          )
        : null,
    [loaded, texts, summaryEdited, approval, projectName, projectPrefix, i18n.resolvedLanguage, t],
  );

  const edit = (patch: Partial<CompletionTexts>) => setTexts((prev) => (prev ? { ...prev, ...patch } : prev));

  async function save(nextApproval: CompletionApproval | null) {
    if (!loaded || !texts || !report) return;
    setBusy(true);
    try {
      const data = withCompletion(loaded.cycle.data, {
        ...texts,
        // The summary is kept as shown, so the export and the next reader
        // see the same text; it follows the numbers again only if untouched.
        summary: summaryEdited ? texts.summary : "",
        summaryEdited,
        closedAt: loaded.summary.closure.closedAt,
        approval: nextApproval,
      });
      const cycle = await unlessReported(cycleApi.update(cycleId, { data, userId }));
      if (cycle) {
        setLoaded({ ...loaded, cycle });
        toast(t(nextApproval ? "completionReport.approvedToast" : "completionReport.savedToast"));
      }
    } catch {
      toast(t("completionReport.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function exportAs(ext: "xlsx" | "pdf") {
    if (!report || !loaded) return;
    setBusy(true);
    try {
      const name = completionFileName(projectName, loaded.cycle.cycleKey, new Date(), ext, t);
      const labels = completionLabels(t);
      const saved =
        ext === "xlsx"
          ? await unlessReported(
              import("./completionXlsx").then((m) => m.exportCompletionXlsx(report, labels, casesTable(), name)),
            )
          : await unlessReported(import("./completionPdf").then((m) => m.exportCompletionPdf(report, labels, name)));
      if (saved) toast(t("statusReport.exportedToast", { name: saved }));
    } catch {
      toast(t("statusReport.exportFailed"));
    } finally {
      setBusy(false);
    }
  }

  /** The «Casos» sheet: the status report's latest result per case. */
  function casesTable(): ReportTable {
    if (!loaded) return { headers: [], rows: [] };
    return buildStatusReport(
      loaded.summary,
      {
        projectName,
        scopeLabel: "",
        periodLabel: "",
        generatedAt: new Date(),
        author: "",
        planTitle: null,
        lang: i18n.resolvedLanguage,
        summary: "",
        recommendations: "",
      },
      t,
    ).cases;
  }

  const table = (tbl: ReportTable, empty: string, tones?: Tone[], toneCol?: number) =>
    tbl.rows.length === 0 ? (
      <p className="sr-empty">{empty}</p>
    ) : (
      <div className="sr-tablewrap">
        <table className="sr-table">
          <thead>
            <tr>
              {tbl.headers.map((h, i) => (
                <th key={i} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>
                    {tones && j === toneCol ? <StatusPill tone={TONE[tones[i] ?? "neutral"]}>{c}</StatusPill> : c}
                  </td>
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
  const textField = (key: TextKey, label: string, placeholder: string) => (
    <FormField label={label}>
      {(p) => (
        <TextArea
          size="document"
          {...p}
          value={texts?.[key] ?? ""}
          placeholder={placeholder}
          data-testid={`completion-${key}`}
          onChange={(e) => edit({ [key]: e.target.value })}
        />
      )}
    </FormField>
  );
  const h = (n: number, key: string) => (
    <h4>
      <span className="cr-n">{n}</span> {t(`completionReport.section.${key}`)}
    </h4>
  );

  return (
    <Dialog className="cd sr-modal" labelledBy={`${id}-title`} onClose={onClose} dismissable={!busy}>
      <div data-testid="completion-report" className="sr">
        <header className="sr-head">
          <h3 id={`${id}-title`} className="cd__title">
            <FileCheck2 size={18} aria-hidden="true" /> {t("completionReport.title")}
          </h3>
          <p className="cd__msg">
            {t("completionReport.subtitle")}
            {report && <> · {report.documentId}</>}
          </p>
        </header>

        {failed ? (
          <p className="sr-empty" role="alert">
            {t("completionReport.loadError")}
          </p>
        ) : !report || !texts || !loaded ? (
          <p className="sr-empty" aria-live="polite">
            {t("statusReport.loading")}
          </p>
        ) : (
          <div className="sr-body">
            {start?.stale && (
              <p className="cr-stale" role="status" data-testid="completion-stale">
                {t("completionReport.stale")}
              </p>
            )}
            <section>
              {h(1, "identification")}
              {pairs(report.identification)}
            </section>
            <section>
              {h(2, "summary")}
              <FormField label={t("statusReport.summaryLabel")} hint={t("statusReport.summaryHint")}>
                {(p) => (
                  <TextArea
                    size="document"
                    {...p}
                    value={report.summary}
                    data-testid="completion-summary"
                    onChange={(e) => {
                      setSummaryEdited(true);
                      edit({ summary: e.target.value });
                    }}
                  />
                )}
              </FormField>
            </section>
            <section>
              {h(3, "deviations")}
              {table(report.deviations, t("common.noData"), report.deviationTones, 3)}
              {textField("deviations", t("completionReport.notes"), t("completionReport.placeholder.deviations"))}
            </section>
            <section className="cr-evaluation">
              {h(4, "evaluation")}
              <DecisionPreview d={report.decision} />
            </section>
            <section>
              {h(5, "blockers")}
              {table(report.blockers, t("statusReport.noIssues"))}
              {textField("blockers", t("completionReport.notes"), t("completionReport.placeholder.blockers"))}
            </section>
            <section>
              {h(6, "measures")}
              {table(report.measures, t("common.noData"), report.measureTones, 5)}
              <p className="sr-note">{t("completionReport.measuresNote")}</p>
            </section>
            <section>
              {h(7, "risks")}
              <h5>{t("completionReport.openDefects")}</h5>
              {table(report.openDefects, t("completionReport.noDefects"))}
              <h5>{t("completionReport.riskyRequirements")}</h5>
              {table(report.riskyRequirements, t("completionReport.noRisky"))}
              {textField("risks", t("completionReport.notes"), t("completionReport.placeholder.risks"))}
            </section>
            <section>
              {h(8, "deliverables")}
              <ul className="cr-deliverables" data-testid="completion-deliverables">
                {report.deliverableItems.map((d, i) => (
                  <li key={i}>
                    {d.fromPlan && d.key !== null ? (
                      <label>
                        <input
                          type="checkbox"
                          checked={d.delivered}
                          onChange={(e) =>
                            edit({ delivered: { ...texts.delivered, [d.key as string]: e.target.checked } })
                          }
                        />{" "}
                        {d.label}
                      </label>
                    ) : (
                      <span>{d.label}</span>
                    )}
                    <StatusPill tone={d.fromPlan ? "neutral" : "info"}>
                      {t(d.fromPlan ? "completionReport.origin.plan" : "completionReport.origin.pharos")}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              {h(9, "assets")}
              {pairs(report.assets)}
              {textField("assets", t("completionReport.notes"), t("completionReport.placeholder.assets"))}
            </section>
            <section>
              {h(10, "lessons")}
              {textField("lessons", t("completionReport.lessonsLabel"), t("completionReport.placeholder.lessons"))}
            </section>
            <section>
              {h(11, "approval")}
              <div className="cr-approval" data-testid="completion-approval">
                {report.approved ? (
                  <StatusPill tone="success" dot>
                    {report.approvalLine}
                  </StatusPill>
                ) : (
                  <span>
                    {dirty
                      ? t(start?.approval ? "completionReport.loseApproval" : "completionReport.saveFirst")
                      : !stored || start?.stale
                        ? t("completionReport.saveFirst")
                        : report.approvalLine}
                  </span>
                )}
                {!report.approved && (
                  <button
                    type="button"
                    className="ui-btn ui-btn--primary"
                    data-testid="completion-approve"
                    disabled={busy || dirty || !stored || Boolean(start?.stale)}
                    onClick={() => setConfirming(true)}
                  >
                    <BadgeCheck size={16} aria-hidden="true" />
                    {t("completionReport.approve")}
                  </button>
                )}
              </div>
              <p className="sr-note">{t("completionReport.syncNote")}</p>
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
            disabled={!report || busy || (!dirty && !start?.stale && Boolean(stored))}
            data-testid="completion-save"
            onClick={() => void save(null)}
          >
            <Save size={16} aria-hidden="true" />
            {t("completionReport.save")}
          </button>
          <button
            type="button"
            className="ui-btn"
            disabled={!report || busy}
            data-testid="completion-export-xlsx"
            onClick={() => void exportAs("xlsx")}
          >
            <Download size={16} aria-hidden="true" />
            {t("statusReport.exportXlsx")}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            disabled={!report || busy}
            data-testid="completion-export-pdf"
            onClick={() => void exportAs("pdf")}
          >
            <Download size={16} aria-hidden="true" />
            {t("statusReport.exportPdf")}
          </button>
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title={t("completionReport.approveTitle")}
          message={t("completionReport.approveMessage", { name: user?.displayName ?? user?.email ?? "" })}
          confirmLabel={t("completionReport.approve")}
          confirmTestId="completion-approve-confirm"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void save({
              by: userId,
              byName: user?.displayName ?? user?.email ?? "",
              at: new Date().toISOString(),
            });
          }}
        />
      )}
    </Dialog>
  );
}
