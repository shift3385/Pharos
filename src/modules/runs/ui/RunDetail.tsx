import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, ListPlus, Lock, Pencil, Play, RotateCcw, Trash2 } from "lucide-react";
import { InfoTip } from "@shared/ui/InfoTip";
import { useAuth } from "@modules/auth";
import type { FindingView, MetricView, ResultView, RunItemRow, RunOverview } from "@shared/contracts/contract";
import { isTauri } from "@shared/platform";
import { DataTable, type DataColumn } from "@shared/ui/DataTable";
import { Dialog } from "@shared/ui/Dialog";
import { FilterChips } from "@shared/ui/FilterChips";
import { FormField } from "@shared/ui/FormField";
import { HeaderActionsContext, useHeaderActions } from "@shared/ui/headerActions";
import { SegmentedControl } from "@shared/ui/SegmentedControl";
import { StatusPill } from "@shared/ui/StatusPill";
import { TabPanel, Tabs } from "@shared/ui/Tabs";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { useToast } from "@shared/ui/Toast";
import { useOnSynced } from "@shared/ui/useSynced";
import { FormSkeleton } from "@shared/ui/Skeleton";
import { runsApi } from "../api/runsApi";
import type { LinkableItem } from "@modules/defects";
import { instantOf, statusTone, type LinkableCase } from "../model/types";
import { CasePickerDialog } from "./CasePickerDialog";
import { DeleteRunDialog } from "./DeleteRunDialog";
import { ExecutionPanel } from "./ExecutionPanel";
import { FindingsPanel } from "./FindingsPanel";
import { MetricsPanel } from "./MetricsPanel";
import { standingOf, thresholdsOf } from "../model/findings";
import { importedRows, type ImportedRow } from "../model/importedRows";
import "@shared/ui/buttons.css";
import "@shared/ui/ConfirmDialog.css";
import "./Execution.css";
import "./Runs.css";

type Filter = "all" | "not_run" | "failed" | "blocked" | "passed";

/** The run screen (EJE-02, `/projects/:id/runs/:runId`): its header,
 *  progress, items, and the executor of the item in `?item=`. On the web
 *  too (EJE-06): there the drafts are the browser's and files stay on the
 *  desktop. No design in docs/rediseno: built with the table, chips, pill
 *  and dialog primitives. */
export function RunDetail({
  projectId,
  runId,
  cases,
  requirements = [],
}: {
  projectId: string;
  runId: string;
  cases: LinkableCase[];
  requirements?: LinkableItem[];
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const toast = useToast();
  const view = useBreakpoint();
  const [params, setParams] = useSearchParams();
  const itemId = params.get("item");
  const [data, setData] = useState<RunOverview | null | undefined>(undefined);
  // Findings and metrics of the run (ING-06, F4): their tabs only show when
  // the run has some.
  const [findings, setFindings] = useState<FindingView[]>([]);
  const [metrics, setMetrics] = useState<MetricView[]>([]);
  // The run's results: an imported one that fulfils no item of the run
  // (an imported run has none) is listed apart and counted (FIX-42).
  const [results, setResults] = useState<ResultView[]>([]);
  const [failed, setFailed] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [dialog, setDialog] = useState<"close" | "edit" | "add" | "delete" | null>(null);
  const navigate = useNavigate();
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latest.current;
    try {
      const [o, f, m, r] = await Promise.all([
        runsApi.overview(runId, userId),
        runsApi.findings(runId, userId).catch(() => [] as FindingView[]),
        runsApi.metrics(runId, userId).catch(() => [] as MetricView[]),
        runsApi.results(runId, userId).catch(() => [] as ResultView[]),
      ]);
      if (request !== latest.current) return;
      setData(o);
      setFindings(f);
      setMetrics(m);
      setResults(r);
      setFailed(false);
    } catch (e) {
      if (request !== latest.current) return;
      if (String(e instanceof Error ? e.message : e).startsWith("run-deleted")) setDeleted(true);
      else setFailed(true);
    }
  }, [runId, userId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  // A sync that brought or combined changes (FIX-48).
  useOnSynced(() => void refresh());
  const inHeader = useContext(HeaderActionsContext) !== null;

  const run = data?.run;
  const open = run?.status === "in_progress";
  const items = useMemo(() => data?.items ?? [], [data]);
  const shown = items.filter((i) => filter === "all" || i.status === filter);
  const imported = useMemo(() => importedRows(results, cases), [results, cases]);
  const importedShown = imported.filter((i) => filter === "all" || i.status === filter);
  const importedRun = run?.trigger === "import";
  const extra = findings.length > 0 || metrics.length > 0;
  const tabParam = params.get("tab");
  const tab =
    tabParam === "findings" && findings.length > 0
      ? "findings"
      : tabParam === "metrics" && metrics.length > 0
        ? "metrics"
        : "cases";
  const setTab = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === "cases") p.delete("tab");
    else p.set("tab", next);
    p.delete("item");
    setParams(p);
  };
  const openFindings = findings.filter((f) => standingOf(f) === "open").length;
  const failedThresholds = thresholdsOf(metrics).failed.length;

  const openItem = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("item", id);
    else next.delete("item");
    setParams(next);
  };
  /** The next item with a target still to run, after the open one. */
  const nextItem = useMemo(() => {
    const at = items.findIndex((i) => i.item.id === itemId);
    for (let k = 1; k <= items.length; k++) {
      const i = items[(at + k + items.length) % items.length];
      if (i && i.item.id !== itemId && i.done < i.targets) return i.item.id;
    }
    return null;
  }, [items, itemId]);

  async function update(input: Parameters<typeof runsApi.update>[1], message: string) {
    try {
      await runsApi.update(runId, input);
      toast(message);
      setDialog(null);
      await refresh();
    } catch (e) {
      const raw = String(e instanceof Error ? e.message : e);
      toast(
        raw.startsWith("cycle-closed")
          ? t("execution.error.cycleClosed")
          : raw.startsWith("run-deleted")
            ? t("execution.error.runDeleted")
            : t("execution.error.generic"),
        "error",
      );
    }
  }

  async function close(status: "completed" | "aborted", discardDrafts: boolean) {
    try {
      await runsApi.close(runId, status, discardDrafts, userId);
      toast(t("execution.run.closed", { key: run?.runKey ?? "" }));
      setDialog(null);
      await refresh();
    } catch (e) {
      const raw = String(e instanceof Error ? e.message : e);
      toast(raw.startsWith("run-deleted") ? t("execution.error.runDeleted") : t("execution.error.generic"), "error");
    }
  }

  const actions = run && (
    <div className="ex-run-actions">
      {open ? (
        <>
          {/* An imported run gets its results from reports (importing into
              an open run), not from cases added by hand (FIX-42). */}
          {!importedRun && (
            <button
              type="button"
              className="ui-btn"
              onClick={() => setDialog("add")}
              data-testid="run-add-cases"
            >
              <ListPlus size={16} aria-hidden="true" />
              <span className="ui-btn__text">{t("execution.run.addCases")}</span>
            </button>
          )}
          <button
            type="button"
            className="ui-btn"
            onClick={() => setDialog("edit")}
            data-testid="run-edit"
          >
            <Pencil size={16} aria-hidden="true" />
            <span className="ui-btn__text">{t("execution.run.edit")}</span>
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            onClick={() => setDialog("close")}
            data-testid="run-close"
          >
            <Lock size={16} aria-hidden="true" />
            <span className="ui-btn__text">{t("execution.run.close")}</span>
          </button>
        </>
      ) : (
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          onClick={() =>
            void update(
              { status: "in_progress", userId },
              t("execution.run.reopened", { key: run.runKey }),
            )
          }
          data-testid="run-reopen"
        >
          <RotateCcw size={16} aria-hidden="true" />
          <span className="ui-btn__text">{t("execution.run.reopen")}</span>
        </button>
      )}
      {/* Deleting a run is desktop only (EJE-07). */}
      {isTauri() && (
        <button
          type="button"
          className="ui-btn ui-btn--danger"
          onClick={() => setDialog("delete")}
          data-testid="run-delete"
        >
          <Trash2 size={16} aria-hidden="true" />
          <span className="ui-btn__text">{t("execution.run.delete")}</span>
        </button>
      )}
    </div>
  );
  useHeaderActions(actions);

  const back = (
    <Link to={`/projects/${projectId}/runs`} className="ex-back">
      <ArrowLeft size={16} aria-hidden="true" />
      {t("execution.run.back")}
    </Link>
  );

  if (deleted)
    return (
      <div className="rn">
        {back}
        <p className="tp-field__hint rn-note" role="status" data-testid="run-deleted-notice">
          {t("execution.run.deletedNotice")}
        </p>
      </div>
    );
  if (failed)
    return (
      <div className="rn">
        {back}
        <div className="rn-error-state" role="alert">
          <p>{t("execution.run.loadError")}</p>
          <button type="button" className="ui-btn ui-btn--small" onClick={() => void refresh()}>
            {t("runs.list.retry")}
          </button>
        </div>
      </div>
    );
  if (data === undefined)
    return (
      <div className="rn">
        {back}
        <FormSkeleton fields={3} />
      </div>
    );
  if (data === null || !run)
    return (
      <div className="rn">
        {back}
        <p className="tp-field__hint rn-note">{t("execution.run.notFound")}</p>
      </div>
    );

  // The items' targets plus the imported tests that fulfil no item, each by
  // its final attempt (FIX-42).
  const c = { ...data.counts };
  for (const r of imported) {
    c.total += 1;
    if (r.status === "passed") c.passed += 1;
    else if (r.status === "failed") c.failed += 1;
    else if (r.status === "blocked") c.blocked += 1;
    else if (r.status === "skipped") c.skipped += 1;
    else c.other += 1;
  }
  const executed = c.total - c.notRun;
  const share = (n: number) => (c.total ? (n * 100) / c.total : 0);
  const date = (s: string | null) => {
    const at = s ? instantOf(s) : undefined;
    return at ? at.toLocaleString(i18n.resolvedLanguage) : "—";
  };
  const meta: { k: string; v: React.ReactNode }[] = [
    { k: t("runs.field.environment"), v: run.environment || "—" },
    { k: t("runs.field.build"), v: run.build || "—" },
    { k: t("execution.run.configuration"), v: data.configurationName ?? "—" },
    {
      k: t("execution.run.cycle"),
      v: data.cycleKey ? (
        <Link to={`/projects/${projectId}/cycles?cycle=${run.cycleId}`}>
          {data.cycleKey} · {data.cycleTitle}
        </Link>
      ) : (
        "—"
      ),
    },
    { k: t("runs.list.started"), v: date(run.startedAt) },
    ...(run.finishedAt ? [{ k: t("execution.run.finished"), v: date(run.finishedAt) }] : []),
  ];

  const itemLabel = (r: RunItemRow) =>
    [
      r.flowName,
      r.rowIndex !== null ? t("execution.row", { n: r.rowIndex + 1 }) : null,
      r.dataset
        ? t("execution.run.dataset", {
            name: r.dataset.name,
            version: r.dataset.version,
            count: r.dataset.rows,
          })
        : null,
      r.targets > 1 ? t("execution.run.targets", { count: r.targets }) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const columns: DataColumn<RunItemRow>[] = [
    {
      id: "case",
      header: t("execution.run.case"),
      width: "minmax(0,2.4fr)",
      cell: (r) => (
        <span className="rn-test">
          <button
            type="button"
            className="ex-item-link"
            onClick={() => openItem(r.item.id)}
            aria-current={r.item.id === itemId ? "true" : undefined}
            data-testid="run-item-execute"
            data-case-key={r.caseKey ?? undefined}
          >
            <span className="rn-mono rn-key">{r.caseKey}</span> {r.caseTitle}
          </button>
          {(itemLabel(r) || r.caseDeleted) && (
            <span className="tp-field__hint">
              {[itemLabel(r), r.caseDeleted ? t("execution.run.caseDeleted") : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "status",
      header: t("runs.list.status"),
      width: "minmax(120px,1fr)",
      cell: (r) => (
        <span className="rn-counts">
          {/* A case with rows or flows still to run is not «Pasa» yet: it
              shows how many are done (FIX-49). */}
          <StatusPill
            tone={r.status === "not_run" ? "neutral" : statusTone(r.status)}
            dot
          >
            {r.status !== "not_run"
              ? t(`runs.status.${r.status}`, r.status)
              : r.done > 0
                ? t("execution.partial", { done: r.done, total: r.targets })
                : t("execution.notRun")}
          </StatusPill>
          {r.hasDraft && <StatusPill tone="info">{t("execution.inDraft")}</StatusPill>}
        </span>
      ),
    },
    {
      id: "done",
      header: t("execution.run.done"),
      width: "88px",
      minView: "tablet",
      cell: (r) => `${r.done}/${r.targets}`,
    },
    {
      id: "attempts",
      header: t("execution.run.attempts"),
      width: "88px",
      minView: "desktop",
      // An item not executed yet has no attempts to count (FIX-45).
      cell: (r) => (r.attempts > 0 ? r.attempts : "—"),
    },
  ];

  const importedColumns: DataColumn<ImportedRow>[] = [
    {
      id: "test",
      header: t("execution.run.imported.test"),
      width: "minmax(0,2.4fr)",
      cell: (r) => (
        <span className="rn-test" data-testid="run-imported-result">
          {r.caseKey ? (
            <span>
              <span className="rn-mono rn-key">{r.caseKey}</span> {r.caseTitle ?? ""}
            </span>
          ) : (
            <span>{r.name}</span>
          )}
          {(r.exampleRow !== null || !r.caseKey || r.configurationLabel) && (
            <span className="tp-field__hint">
              {[
                r.exampleRow !== null ? t("execution.row", { n: r.exampleRow + 1 }) : null,
                r.configurationLabel,
                r.caseKey ? null : t("execution.run.imported.unlinked"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "status",
      header: t("runs.list.status"),
      width: "minmax(120px,1fr)",
      cell: (r) => (
        <span className="rn-counts">
          <StatusPill tone={statusTone(r.status)} dot>
            {t(`runs.status.${r.status}`, r.status)}
          </StatusPill>
          {r.flaky && <StatusPill tone="warning">{t("execution.run.imported.flaky")}</StatusPill>}
        </span>
      ),
    },
    {
      id: "attempts",
      header: t("execution.run.attempts"),
      width: "88px",
      minView: "tablet",
      cell: (r) => r.attempts,
    },
  ];

  const panel = itemId && (
    <ExecutionPanel
      key={itemId}
      runItemId={itemId}
      runKey={run.runKey}
      runOpen={open}
      projectId={projectId}
      userId={userId}
      cases={cases.map((c) => ({ id: c.id, key: c.scenarioId, title: c.title }))}
      requirements={requirements}
      onChanged={() => void refresh()}
      onNextItem={nextItem ? () => openItem(nextItem) : null}
      onClose={() => openItem(null)}
    />
  );
  // Below desktop the executor takes the whole section.
  const split = view === "desktop";

  return (
    <div className="rn ex-run" data-split={split && itemId ? "true" : undefined}>
      {back}
      {!inHeader && actions}
      {(!itemId || split) && (
        <header className="ex-run__head">
          <div className="ex-run__title">
            <span className="rn-mono rn-key">{run.runKey}</span>
            <h2 className="ex-run__name">{run.title}</h2>
            <StatusPill tone={open ? "info" : run.status === "aborted" ? "warning" : "success"}>
              {t(`runs.runStatus.${run.status}`, run.status)}
            </StatusPill>
            <StatusPill tone="neutral">{t(`runs.trigger.${run.trigger}`, run.trigger)}</StatusPill>
            {/* Where the evidence is kept: help behind «?», not a standing
                line on every run (FIX-45). */}
            <InfoTip id="ex-evidence-note" label={t("execution.run.evidenceInfo")}>
              {isTauri() ? t("execution.evidenceLocal") : t("execution.web.note")}
            </InfoTip>
          </div>
          <dl className="ex-meta">
            {meta.map((m) => (
              <div key={m.k} className="ex-meta__item">
                <dt>{m.k}</dt>
                <dd>{m.v}</dd>
              </div>
            ))}
          </dl>
          {/* A run of findings or metrics only has nothing to execute: no
              empty «0/0 ejecutados» bar (FIX-45). */}
          {c.total > 0 && (
          <div className="ex-progress">
            <span
              className="ex-progress__track"
              role="img"
              aria-label={t("execution.run.progressSr", {
                executed,
                total: c.total,
                passed: c.passed,
                failed: c.failed,
                blocked: c.blocked,
              })}
            >
              <span className="ex-progress__seg" data-tone="success" style={{ width: `${share(c.passed)}%` }} />
              <span className="ex-progress__seg" data-tone="error" style={{ width: `${share(c.failed)}%` }} />
              <span className="ex-progress__seg" data-tone="warning" style={{ width: `${share(c.blocked)}%` }} />
              <span
                className="ex-progress__seg"
                data-tone="neutral"
                style={{ width: `${share(c.skipped + c.other)}%` }}
              />
            </span>
            <span className="ex-progress__text">
              {t("execution.run.progress", { executed, total: c.total })}
            </span>
          </div>
          )}
        </header>
      )}

      {extra && (!itemId || split) && (
        <Tabs
          className="rn-tabs"
          variant="underline"
          idPrefix="run-"
          label={t("findings.tabs.label")}
          value={tab}
          onChange={setTab}
          items={[
            { id: "cases", label: t("findings.tabs.cases"), badge: { count: items.length + imported.length, tone: "muted" } },
            ...(findings.length > 0
              ? [
                  {
                    id: "findings",
                    label: t("findings.tabs.findings"),
                    badge: {
                      count: openFindings,
                      tone: openFindings > 0 ? ("danger" as const) : ("muted" as const),
                      title: t("findings.tabs.openTitle", { count: openFindings }),
                    },
                  },
                ]
              : []),
            ...(metrics.length > 0
              ? [
                  {
                    id: "metrics",
                    label: t("findings.tabs.metrics"),
                    badge: {
                      count: failedThresholds > 0 ? failedThresholds : metrics.length,
                      tone: failedThresholds > 0 ? ("danger" as const) : ("muted" as const),
                      title:
                        failedThresholds > 0
                          ? t("findings.tabs.failedTitle", { count: failedThresholds })
                          : undefined,
                    },
                  },
                ]
              : []),
          ]}
        />
      )}
      {extra && tab === "findings" && (
        <TabPanel id="findings" idPrefix="run-" className="ex-run__extra">
          <FindingsPanel
            projectId={projectId}
            userId={userId}
            findings={findings}
            onChanged={() => void refresh()}
          />
        </TabPanel>
      )}
      {extra && tab === "metrics" && (
        <TabPanel id="metrics" idPrefix="run-" className="ex-run__extra">
          <MetricsPanel metrics={metrics} />
        </TabPanel>
      )}
      {tab === "cases" && (
      <div className="ex-run__body" {...(extra ? { id: "run-tabpanel-cases", role: "tabpanel", "aria-labelledby": "run-tab-cases" } : {})}>
        {(!itemId || split) && (
          <section className="ex-items" aria-label={t("execution.run.items")}>
            <FilterChips
              label={t("execution.run.filter")}
              value={filter}
              onChange={(v) => setFilter(v as Filter)}
              options={(["all", "not_run", "failed", "blocked", "passed"] as Filter[]).map((f) => ({
                value: f,
                label: f === "all" ? t("runs.list.all") : f === "not_run" ? t("execution.notRun") : t(`runs.status.${f}`),
                count:
                  f === "all"
                    ? items.length + imported.length
                    : items.filter((i) => i.status === f).length +
                      imported.filter((i) => i.status === f).length,
              }))}
            />
            {open && nextItem && !itemId && (
              <button
                type="button"
                className="ui-btn ui-btn--small ex-start"
                onClick={() => openItem(nextItem)}
                data-testid="run-execute-next"
              >
                <Play size={14} aria-hidden="true" />
                <span className="ui-btn__text">{t("execution.run.executeNext")}</span>
              </button>
            )}
            {(items.length > 0 || imported.length === 0) && (
            <DataTable
              className="dt-surface"
              label={t("execution.run.items")}
              rows={shown}
              columns={split && itemId ? columns.slice(0, 2) : columns}
              getRowId={(r) => r.item.id}
              empty={
                <p className="tp-field__hint">
                  {items.length > 0
                    ? t("execution.run.emptyFilter")
                    : open && !importedRun
                      ? t("execution.run.empty")
                      : t("execution.run.emptyClosed")}
                </p>
              }
              mobileCard={(r) => (
                <div className="rn-card">
                  {columns[0].cell(r)}
                  <div className="rn-card__row">
                    {columns[1].cell(r)}
                    <span className="tp-field__hint">
                      {r.done}/{r.targets}
                    </span>
                  </div>
                </div>
              )}
            />
            )}
            {imported.length > 0 && (
              <>
                {items.length > 0 && (
                  <h3 className="ex-imported__title">{t("execution.run.imported.title")}</h3>
                )}
                <DataTable
                  className="dt-surface"
                  label={t("execution.run.imported.title")}
                  rows={importedShown}
                  columns={importedColumns}
                  getRowId={(r) => r.id}
                  empty={<p className="tp-field__hint">{t("execution.run.emptyFilter")}</p>}
                  mobileCard={(r) => (
                    <div className="rn-card">
                      {importedColumns[0].cell(r)}
                      <div className="rn-card__row">{importedColumns[1].cell(r)}</div>
                    </div>
                  )}
                />
              </>
            )}
          </section>
        )}
        {panel}
      </div>
      )}

      {dialog === "close" && (
        <CloseRunDialog
          notRun={c.notRun}
          drafts={items.filter((i) => i.hasDraft).length}
          onCancel={() => setDialog(null)}
          onClose={(status, discardDrafts) => void close(status, discardDrafts)}
        />
      )}
      {dialog === "delete" && (
        <DeleteRunDialog
          runId={runId}
          userId={userId}
          onCancel={() => setDialog(null)}
          onDeleted={(key) => {
            toast(t("execution.run.deleted", { key }));
            setDialog(null);
            void navigate(`/projects/${projectId}/runs`);
          }}
        />
      )}
      {dialog === "edit" && (
        <EditRunDialog
          title={run.title}
          environment={run.environment ?? ""}
          build={run.build ?? ""}
          onCancel={() => setDialog(null)}
          onSave={(v) => void update({ ...v, userId }, t("execution.run.saved"))}
        />
      )}
      {dialog === "add" && (
        <CasePickerDialog
          title={t("execution.run.addCases")}
          confirmLabel={t("execution.run.add")}
          cases={cases}
          exclude={new Set(items.filter((i) => !i.item.flowId && !i.item.exampleRowId).map((i) => i.item.testCaseId))}
          onCancel={() => setDialog(null)}
          onConfirm={async (ids) => {
            await runsApi.addItems(runId, userId, ids.map((id) => ({ testCaseId: id })));
            toast(t("execution.run.added", { count: ids.length }));
            setDialog(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function CloseRunDialog({
  notRun,
  drafts,
  onCancel,
  onClose,
}: {
  notRun: number;
  drafts: number;
  onCancel: () => void;
  onClose: (status: "completed" | "aborted", discardDrafts: boolean) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [status, setStatus] = useState<"completed" | "aborted">("completed");
  const [discard, setDiscard] = useState(false);
  // A cancelled run's drafts go with it; a completed one keeps them unless
  // the user discards them (their files would stay on disk otherwise).
  const discarding = status === "aborted" || discard;
  return (
    <Dialog className="cd rn-modal" labelledBy={`${id}-t`} onClose={onCancel}>
      <h3 id={`${id}-t`} className="cd__title">
        {t("execution.run.closeTitle")}
      </h3>
      <p className="cd__msg">{t("execution.run.closeMessage")}</p>
      {(notRun > 0 || drafts > 0) && (
        <ul className="rn-warnings">
          {notRun > 0 && <li className="rn-warn">{t("execution.run.closeNotRun", { count: notRun })}</li>}
          {drafts > 0 && <li className="rn-warn">{t("execution.run.closeDrafts", { count: drafts })}</li>}
        </ul>
      )}
      {/* The app's segmented control instead of a bare fieldset with native
          radios (FIX-37); still a named radio group. */}
      <div className="tp-field rn-close-as">
        <span className="tp-field__label" aria-hidden="true">
          {t("execution.run.closeAs")}
        </span>
        <SegmentedControl<"completed" | "aborted">
          label={t("execution.run.closeAs")}
          value={status}
          onChange={setStatus}
          options={(["completed", "aborted"] as const).map((s) => ({
            value: s,
            label: t(`runs.runStatus.${s}`),
          }))}
        />
      </div>
      {drafts > 0 && (
        <label className="rn-check">
          <input
            type="checkbox"
            checked={discarding}
            disabled={status === "aborted"}
            onChange={(e) => setDiscard(e.target.checked)}
            data-testid="run-close-discard"
          />
          {status === "aborted"
            ? t("execution.run.closeDiscardAborted")
            : t("execution.run.closeDiscard")}
        </label>
      )}
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          onClick={() => onClose(status, discarding)}
          data-testid="run-close-confirm"
        >
          {t("execution.run.close")}
        </button>
      </div>
    </Dialog>
  );
}

function EditRunDialog({
  title,
  environment,
  build,
  onCancel,
  onSave,
}: {
  title: string;
  environment: string;
  build: string;
  onCancel: () => void;
  onSave: (v: { title: string; environment: string; build: string }) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [v, setV] = useState({ title, environment, build });
  return (
    <Dialog className="cd rn-modal" labelledBy={`${id}-t`} onClose={onCancel}>
      <h3 id={`${id}-t`} className="cd__title">
        {t("execution.run.edit")}
      </h3>
      <div className="rn-form">
        <FormField label={t("runs.field.title")} required>
          {(p) => (
            <input {...p} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          )}
        </FormField>
        <div className="rn-grid">
          <FormField label={t("runs.field.environment")}>
            {(p) => (
              <input
                {...p}
                value={v.environment}
                onChange={(e) => setV({ ...v, environment: e.target.value })}
              />
            )}
          </FormField>
          <FormField label={t("runs.field.build")}>
            {(p) => (
              <input {...p} value={v.build} onChange={(e) => setV({ ...v, build: e.target.value })} />
            )}
          </FormField>
        </div>
      </div>
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          disabled={!v.title.trim()}
          onClick={() => onSave(v)}
        >
          {t("execution.run.save")}
        </button>
      </div>
    </Dialog>
  );
}
