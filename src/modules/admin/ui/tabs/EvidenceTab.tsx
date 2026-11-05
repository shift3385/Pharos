import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { HardDrive, ScanSearch, Trash2, X } from "lucide-react";
import {
  formatBytes,
  type EvidenceOrphan,
  type EvidenceProblem,
  type EvidenceProgress,
  type EvidenceReport,
  type EvidenceUsage,
} from "../../model/evidence";
import { useAuth } from "@modules/auth";
import { capabilities } from "@shared/platform";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { StatusPill } from "@shared/ui/StatusPill";
import { useToast } from "@shared/ui/Toast";
import { EVIDENCE_CHECK_BUSY, EVIDENCE_DB_CHANGED, evidenceApi } from "../../api/evidenceApi";
import { SettingsRow, SettingsSection } from "../SettingsSection";
import { EvidenceRetentionSection } from "./EvidenceRetentionSection";

/** Owner kinds with their own label; any other shows as «Otros (kind)». */
const OWNERS = ["planner_card", "defect", "test_case", "run_shard", "result", "step_result", "execution_draft", "session_note"];
/** The project section where an owner kind lives (ADR-0029). */
const SECTION: Record<string, string> = {
  planner_card: "planner",
  defect: "defects",
  test_case: "cases",
  run_shard: "runs",
  result: "runs",
  step_result: "runs",
  execution_draft: "runs",
};

/** The first characters of a file's HMAC name: enough to tell files apart. */
function shortId(file: string): string {
  return (file.split("/").pop() ?? file).replace(/\.pev$/, "").slice(0, 12);
}

function errorText(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
}

/**
 * Administración → Evidencias (DAT-03b, ADR-0014): what the encrypted evidence
 * store holds, and «Verificar evidencias», a manual check that lists files no
 * row knows, contents whose file is missing and files that do not decrypt.
 * Nothing is repaired by itself: missing and damaged contents are marked (the
 * marks are rows, so their counts show here after a restart too) and the
 * report shows where they are used; files without a record are deleted only
 * after the user picks them and confirms. The last report lives in memory for
 * the session only. A check can be cancelled, and one still running when the
 * tab opens is followed again. Desktop only (the web shows a note).
 * No design exists for this tab: it uses the Administración primitives.
 */
export function EvidenceTab() {
  const { t } = useTranslation();
  if (!capabilities.localStore()) {
    return (
      <div className="adm-stack">
        <SettingsSection title={t("admin.evidence.usage.title")} testId="evidence-desktop-only">
          <p className="adm-hint">{t("admin.evidence.desktopOnly")}</p>
        </SettingsSection>
      </div>
    );
  }
  return <EvidenceStore />;
}

function EvidenceStore() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const lang = i18n.language;
  const size = useCallback((b: number) => formatBytes(b, lang), [lang]);
  const [usage, setUsage] = useState<EvidenceUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [report, setReport] = useState<EvidenceReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<EvidenceProgress | null>(null);
  // What the live region says: only when a check starts and when it ends.
  const [announce, setAnnounce] = useState("");
  // The check started in this mount (its promise ends it); else one resumed.
  const own = useRef(false);

  const loadUsage = useCallback(async (takeLast = false) => {
    try {
      const u = await evidenceApi.usage();
      setUsage(u);
      setUsageError(null);
      setReport((r) => (takeLast ? u.last : (r ?? u.last)));
      return u;
    } catch (e) {
      setUsage(null);
      setUsageError(errorText(e));
      return null;
    }
  }, []);

  // A check still running (started before the tab was opened) is followed.
  useEffect(() => {
    void loadUsage();
    evidenceApi.progress().then(
      (p) => {
        if (p.running) {
          setProgress(p);
          setChecking(true);
          setAnnounce(t("admin.evidence.check.started"));
        }
      },
      () => {},
    );
    // Only when the tab opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadUsage]);

  // While a check runs, its progress is read twice a second (not announced).
  // A resumed check ends when the progress says so.
  useEffect(() => {
    if (!checking) return;
    const timer = window.setInterval(() => {
      evidenceApi.progress().then(
        (p) => {
          setProgress(p);
          if (!p.running && !own.current) {
            setChecking(false);
            setCancelling(false);
            void loadUsage(true).then((u) => setAnnounce(u?.last ? t("admin.evidence.check.finished") : ""));
          }
        },
        () => {},
      );
    }, 500);
    return () => window.clearInterval(timer);
  }, [checking, loadUsage, t]);

  async function verify() {
    own.current = true;
    setChecking(true);
    setProgress(null);
    setAnnounce(t("admin.evidence.check.started"));
    try {
      const r = await evidenceApi.check(user?.id);
      setReport(r);
      setAnnounce(r.cancelled ? t("admin.evidence.check.cancelledShort") : t("admin.evidence.check.finished"));
      void loadUsage();
    } catch (e) {
      const reason = errorText(e);
      setAnnounce("");
      toast(
        reason.startsWith(EVIDENCE_CHECK_BUSY)
          ? t("admin.evidence.check.busy")
          : t("admin.evidence.check.failed", { reason }),
        "error",
      );
    } finally {
      own.current = false;
      setChecking(false);
      setCancelling(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      await evidenceApi.cancel();
    } catch {
      setCancelling(false);
    }
  }

  return (
    <div className="adm-stack">
      <UsageSection usage={usage} error={usageError} size={size} />
      <EvidenceRetentionSection onChanged={() => void loadUsage()} />
      <SettingsSection
        title={t("admin.evidence.check.title")}
        desc={t("admin.evidence.check.desc")}
        testId="evidence-check"
      >
        <SettingsRow
          label={t("admin.evidence.check.action")}
          hint={t("admin.evidence.check.actionHint")}
          hintId="adm-evidence-check-hint"
        >
          <div className="adm-inline">
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              data-testid="evidence-verify"
              aria-describedby="adm-evidence-check-hint"
              disabled={checking}
              onClick={() => void verify()}
            >
              <ScanSearch size={16} aria-hidden="true" />
              {checking ? t("admin.evidence.check.running") : t("admin.evidence.check.run")}
            </button>
            {checking && (
              <button
                type="button"
                className="adm-btn adm-btn--secondary"
                data-testid="evidence-cancel"
                disabled={cancelling}
                onClick={() => void cancel()}
              >
                <X size={16} aria-hidden="true" />
                {cancelling ? t("admin.evidence.check.cancelling") : t("admin.evidence.check.cancel")}
              </button>
            )}
          </div>
          {checking && progress && progress.filesTotal > 0 && (
            <div className="adm-evidence-progress">
              <progress
                aria-label={t("admin.evidence.check.progressLabel")}
                max={Math.max(progress.bytesTotal, 1)}
                value={progress.bytesDone}
              />
              <span className="adm-hint">
                {t("admin.evidence.check.progress", {
                  done: progress.filesDone,
                  total: progress.filesTotal,
                  bytesDone: size(progress.bytesDone),
                  bytesTotal: size(progress.bytesTotal),
                })}
              </span>
            </div>
          )}
          <span role="status" className="sr-only" data-testid="evidence-announce">
            {announce}
          </span>
        </SettingsRow>
        {report && (
          <ReportView
            report={report}
            size={size}
            userId={user?.id}
            onOrphansDeleted={(files) => {
              setReport((r) => r && { ...r, orphans: r.orphans.filter((o) => !files.includes(o.file)) });
              void loadUsage();
            }}
          />
        )}
      </SettingsSection>
    </div>
  );
}

function UsageSection({
  usage,
  error,
  size,
}: {
  usage: EvidenceUsage | null;
  error: string | null;
  size: (b: number) => string;
}) {
  const { t } = useTranslation();
  const tableLabel = useId();
  const days = (d: number | null) =>
    d === null ? t("admin.evidence.usage.rawAlways") : t("admin.evidence.usage.rawDays", { count: d });
  const owner = (kind: string) =>
    OWNERS.includes(kind) ? t(`admin.evidence.owners.${kind}`) : t("admin.evidence.owners.other", { kind });
  const count = (state: string) => usage?.byState.find((s) => s.state === state)?.blobs ?? 0;
  const missing = count("missing");
  const damaged = count("damaged");
  return (
    <SettingsSection
      title={t("admin.evidence.usage.title")}
      desc={t("admin.evidence.usage.desc")}
      testId="evidence-usage"
    >
      {error && (
        <p className="adm-warn" role="alert" data-testid="evidence-usage-error">
          {t("admin.evidence.usage.failed", { reason: error })}
        </p>
      )}
      <SettingsRow label={t("admin.evidence.usage.total")} hint={t("admin.evidence.usage.totalHint")}>
        <span className="adm-inline">
          <HardDrive size={16} aria-hidden="true" />
          <span data-testid="evidence-usage-total">
            {usage ? t("admin.evidence.usage.totalValue", { size: size(usage.bytes), count: usage.blobs }) : "—"}
          </span>
        </span>
      </SettingsRow>
      <SettingsRow label={t("admin.evidence.usage.marked")} hint={t("admin.evidence.usage.markedHint")}>
        <span className="adm-inline" data-testid="evidence-marked">
          {!usage ? (
            "—"
          ) : missing + damaged === 0 ? (
            t("admin.evidence.usage.markedNone")
          ) : (
            <>
              {missing > 0 && (
                <StatusPill tone="warning" dot>
                  {t("admin.evidence.usage.markedMissing", { count: missing })}
                </StatusPill>
              )}
              {damaged > 0 && (
                <StatusPill tone="error" dot>
                  {t("admin.evidence.usage.markedDamaged", { count: damaged })}
                </StatusPill>
              )}
            </>
          )}
        </span>
      </SettingsRow>
      <SettingsRow label={t("admin.evidence.usage.byOwner")} hint={t("admin.evidence.usage.byOwnerHint")} labelId={tableLabel}>
        {usage && usage.byOwner.length > 0 ? (
          <table className="adm-evidence-table" aria-labelledby={tableLabel}>
            <thead>
              <tr>
                <th scope="col">{t("admin.evidence.usage.colKind")}</th>
                <th scope="col">{t("admin.evidence.usage.colCount")}</th>
                <th scope="col">{t("admin.evidence.usage.colSize")}</th>
              </tr>
            </thead>
            <tbody>
              {usage.byOwner.map((o) => (
                <tr key={o.ownerEntity}>
                  <th scope="row">{owner(o.ownerEntity)}</th>
                  <td>{o.attachments}</td>
                  <td>{size(o.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <span className="adm-hint">{t("admin.evidence.usage.none")}</span>
        )}
      </SettingsRow>
      <SettingsRow label={t("admin.evidence.usage.expired")} hint={t("admin.evidence.usage.expiredHint")}>
        <span>{usage?.expired ?? "—"}</span>
      </SettingsRow>
      <SettingsRow label={t("admin.evidence.usage.rawReports")} hint={t("admin.evidence.usage.rawReportsHint")}>
        {usage ? (
          <>
            <span>{t("admin.evidence.usage.rawDefault", { days: days(usage.rawReportDays) })}</span>
            {usage.rawReportOverrides.length > 0 && (
              <ul className="adm-evidence-list">
                {usage.rawReportOverrides.map((o) => (
                  <li key={o.projectId}>
                    {t("admin.evidence.usage.rawOverride", {
                      project: o.projectName ?? o.projectId,
                      days: days(o.days),
                    })}
                  </li>
                ))}
              </ul>
            )}
            <span className="adm-hint">
              {t("admin.evidence.usage.rawCounts", { kept: usage.rawReports, expired: usage.rawReportsExpired })}
            </span>
          </>
        ) : (
          <span>—</span>
        )}
      </SettingsRow>
    </SettingsSection>
  );
}

function ReportView({
  report,
  size,
  userId,
  onOrphansDeleted,
}: {
  report: EvidenceReport;
  size: (b: number) => string;
  userId?: string;
  onOrphansDeleted: (files: string[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const date = useMemo(() => {
    const d = new Date(report.checkedAt);
    return Number.isNaN(d.getTime())
      ? report.checkedAt
      : new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(d);
  }, [report.checkedAt, i18n.language]);
  const clean =
    !report.cancelled &&
    report.orphans.length +
      report.missing.length +
      report.damaged.length +
      report.newer.length +
      report.unreadable.length ===
      0;
  return (
    <div className="adm-evidence-report" data-testid="evidence-report">
      <div className="adm-inline">
        <span className="adm-hint">
          {t("admin.evidence.check.summary", { date, count: report.checked, size: size(report.bytes) })}
        </span>
        {clean && (
          <StatusPill tone="success" dot>
            {t("admin.evidence.check.allGood")}
          </StatusPill>
        )}
      </div>
      {report.cancelled && (
        <span className="adm-warn" data-testid="evidence-cancelled">
          {t("admin.evidence.check.cancelled", { done: report.checked, total: report.total })}
        </span>
      )}
      {report.marked + report.restored > 0 && (
        <span className="adm-hint">
          {t("admin.evidence.check.marked", { marked: report.marked, restored: report.restored })}
        </span>
      )}
      {report.orphans.length > 0 && (
        <Orphans orphans={report.orphans} size={size} userId={userId} onDeleted={onOrphansDeleted} />
      )}
      <Problems kind="missing" tone="warning" problems={report.missing} size={size} />
      <Problems kind="damaged" tone="error" problems={report.damaged} size={size} />
      <Problems kind="newer" tone="info" problems={report.newer} size={size} />
      <Problems kind="unreadable" tone="neutral" problems={report.unreadable} size={size} />
    </div>
  );
}

function Orphans({
  orphans,
  size,
  userId,
  onDeleted,
}: {
  orphans: EvidenceOrphan[];
  size: (b: number) => string;
  userId?: string;
  onDeleted: (files: string[]) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const id = useId();
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletable = orphans.filter((o) => !o.recent).map((o) => o.file);
  const chosen = picked.filter((f) => deletable.includes(f));
  const all = deletable.length > 0 && chosen.length === deletable.length;

  async function remove() {
    setConfirming(false);
    setDeleting(true);
    try {
      const out = await evidenceApi.deleteOrphans(chosen, userId);
      const skipped = new Set(out.skipped.map((s) => s.file));
      const gone = chosen.filter((f) => !skipped.has(f));
      if (out.deleted > 0) toast(t("admin.evidence.orphans.deleted", { count: out.deleted, size: size(out.bytes) }));
      // Deleted, but their audit events wait for the next save: say so, and
      // never «could not be deleted».
      if (out.deleted > 0 && !out.saved) toast(t("admin.evidence.orphans.notSaved"), "warning");
      if (out.skipped.length > 0) {
        const reasons = [...new Set(out.skipped.map((s) => t(`admin.evidence.orphans.reasons.${s.reason}`)))].join(", ");
        toast(t("admin.evidence.orphans.skipped", { count: out.skipped.length, reasons }), "warning");
      }
      setPicked([]);
      onDeleted(gone);
    } catch (e) {
      const reason = errorText(e);
      toast(
        reason.startsWith(EVIDENCE_CHECK_BUSY)
          ? t("admin.evidence.check.busy")
          : reason.startsWith(EVIDENCE_DB_CHANGED)
            ? t("admin.evidence.orphans.dbChanged")
            : t("admin.evidence.orphans.failed", { reason }),
        "error",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="adm-evidence-block" aria-labelledby={`${id}-t`} data-testid="evidence-orphans">
      <h3 id={`${id}-t`} className="adm-evidence-block__title">
        {t("admin.evidence.orphans.title", { count: orphans.length })}
      </h3>
      <p className="adm-hint">{t("admin.evidence.orphans.desc")}</p>
      {deletable.length > 1 && (
        <label className="adm-evidence-check">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setPicked(e.target.checked ? deletable : [])}
          />
          {t("admin.evidence.orphans.selectAll")}
        </label>
      )}
      <ul className="adm-evidence-list">
        {orphans.map((o) => {
          const name = t("admin.evidence.file", { id: shortId(o.file) });
          return (
            <li key={o.file} className="adm-evidence-item">
              <label className="adm-evidence-check">
                <input
                  type="checkbox"
                  disabled={o.recent}
                  checked={chosen.includes(o.file)}
                  aria-label={t("admin.evidence.orphans.select", { file: name })}
                  aria-describedby={o.recent ? `${id}-recent` : undefined}
                  onChange={(e) =>
                    setPicked((p) => (e.target.checked ? [...p, o.file] : p.filter((f) => f !== o.file)))
                  }
                />
                <span className="t-id">{name}</span>
              </label>
              <span className="adm-hint">{size(o.size)}</span>
              {o.recent && (
                <StatusPill tone="neutral" title={t("admin.evidence.orphans.recentHint")}>
                  {t("admin.evidence.orphans.recent")}
                </StatusPill>
              )}
            </li>
          );
        })}
      </ul>
      {orphans.some((o) => o.recent) && (
        <span id={`${id}-recent`} className="adm-hint">
          {t("admin.evidence.orphans.recentHint")}
        </span>
      )}
      <div className="adm-actions">
        <span className="adm-actions__spacer" />
        <button
          type="button"
          className="adm-btn adm-btn--danger-outline"
          data-testid="evidence-repair"
          disabled={chosen.length === 0 || deleting}
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={16} aria-hidden="true" />
          {t("admin.evidence.orphans.repair")}
        </button>
      </div>
      {confirming && (
        <ConfirmDialog
          variant="destructive"
          title={t("admin.evidence.orphans.confirmTitle", { count: chosen.length })}
          message={t("admin.evidence.orphans.confirmMessage")}
          confirmLabel={t("admin.evidence.orphans.confirm")}
          confirmTestId="evidence-confirm"
          onConfirm={() => void remove()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}

function Problems({
  kind,
  tone,
  problems,
  size,
}: {
  kind: "missing" | "damaged" | "newer" | "unreadable";
  tone: "warning" | "error" | "info" | "neutral";
  problems: EvidenceProblem[];
  size: (b: number) => string;
}) {
  const { t } = useTranslation();
  const id = useId();
  if (problems.length === 0) return null;
  const owner = (k: string) =>
    OWNERS.includes(k) ? t(`admin.evidence.owners.${k}`) : t("admin.evidence.owners.other", { kind: k });
  return (
    <section className="adm-evidence-block" aria-labelledby={`${id}-t`} data-testid={`evidence-${kind}`}>
      <h3 id={`${id}-t`} className="adm-evidence-block__title">
        <StatusPill tone={tone} dot>
          {t(`admin.evidence.${kind}.title`, { count: problems.length })}
        </StatusPill>
      </h3>
      <p className="adm-hint">{t(`admin.evidence.${kind}.desc`)}</p>
      <ul className="adm-evidence-list">
        {problems.map((p) => (
          <li key={p.file} className="adm-evidence-problem">
            <span className="adm-inline">
              <span className="t-id">{t("admin.evidence.file", { id: shortId(p.file) })}</span>
              <span className="adm-hint">{size(p.size)}</span>
            </span>
            {p.uses.length === 0 ? (
              <span className="adm-hint">{t("admin.evidence.noUses")}</span>
            ) : (
              <ul className="adm-evidence-uses">
                {p.uses.map((u) => {
                  const section = SECTION[u.ownerEntity];
                  const where = owner(u.ownerEntity);
                  return (
                    <li key={u.attachmentId}>
                      <span className="adm-evidence-use">
                        <strong>{u.name}</strong>
                        <span>
                          {where}
                          {u.ownerLabel ? ` · ${u.ownerLabel}` : ""}
                        </span>
                        <span className="adm-hint">
                          {t("admin.evidence.useIn", { project: u.projectName ?? u.projectId })}
                        </span>
                      </span>
                      {section && (
                        <Link
                          className="adm-btn adm-btn--ghost adm-btn--sm"
                          to={`/projects/${encodeURIComponent(u.projectId)}/${section}`}
                        >
                          {t("admin.evidence.open", { section: where })}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
