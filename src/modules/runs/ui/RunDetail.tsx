import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Info, ListPlus, Lock, Pencil, Play, RotateCcw, Trash2 } from "lucide-react";
import { useAuth } from "@modules/auth";
import type { RunItemRow, RunOverview } from "@shared/contracts/contract";
import { isTauri } from "@shared/platform";
import { DataTable, type DataColumn } from "@shared/ui/DataTable";
import { Dialog } from "@shared/ui/Dialog";
import { FilterChips } from "@shared/ui/FilterChips";
import { FormField } from "@shared/ui/FormField";
import { HeaderActionsContext, useHeaderActions } from "@shared/ui/headerActions";
import { StatusPill } from "@shared/ui/StatusPill";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { useToast } from "@shared/ui/Toast";
import { runsApi } from "../api/runsApi";
import { instantOf, statusTone, type LinkableCase } from "../model/types";
import { CasePickerDialog } from "./CasePickerDialog";
import { DeleteRunDialog } from "./DeleteRunDialog";
import { ExecutionPanel } from "./ExecutionPanel";
import "@shared/ui/buttons.css";
import "@shared/ui/ConfirmDialog.css";
import "./Execution.css";
import "./Runs.css";

type Filter = "all" | "not_run" | "failed" | "blocked" | "passed";

/** The run screen (EJE-02, `/projects/:id/runs/:runId`): its header,
 *  progress, items, and the executor of the item in `?item=`. Desktop only:
 *  on the web it says so (EJE-06 brings a runs API). No design in
 *  docs/rediseno: built with the table, chips, pill and dialog primitives. */
export function RunDetail({
  projectId,
  runId,
  cases,
}: {
  projectId: string;
  runId: string;
  cases: LinkableCase[];
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const toast = useToast();
  const view = useBreakpoint();
  const [params, setParams] = useSearchParams();
  const itemId = params.get("item");
  const [data, setData] = useState<RunOverview | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [dialog, setDialog] = useState<"close" | "edit" | "add" | "delete" | null>(null);
  const navigate = useNavigate();
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latest.current;
    try {
      const o = await runsApi.overview(runId, userId);
      if (request !== latest.current) return;
      setData(o);
      setFailed(false);
    } catch {
      if (request === latest.current) setFailed(true);
    }
  }, [runId, userId]);
  useEffect(() => {
    // The web has no runs API until EJE-06: nothing to load.
    if (isTauri()) void refresh();
  }, [refresh]);
  const inHeader = useContext(HeaderActionsContext) !== null;

  const run = data?.run;
  const open = run?.status === "in_progress";
  const items = useMemo(() => data?.items ?? [], [data]);
  const shown = items.filter((i) => filter === "all" || i.status === filter);

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
    } catch {
      toast(t("execution.error.generic"), "error");
    }
  }

  const actions = run && isTauri() && (
    <div className="ex-run-actions">
      {open ? (
        <>
          <button
            type="button"
            className="ui-btn"
            onClick={() => setDialog("add")}
            data-testid="run-add-cases"
          >
            <ListPlus size={16} aria-hidden="true" />
            <span className="ui-btn__text">{t("execution.run.addCases")}</span>
          </button>
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
      <button
        type="button"
        className="ui-btn ui-btn--danger"
        onClick={() => setDialog("delete")}
        data-testid="run-delete"
      >
        <Trash2 size={16} aria-hidden="true" />
        <span className="ui-btn__text">{t("execution.run.delete")}</span>
      </button>
    </div>
  );
  useHeaderActions(actions);

  const back = (
    <Link to={`/projects/${projectId}/runs`} className="ex-back">
      <ArrowLeft size={16} aria-hidden="true" />
      {t("execution.run.back")}
    </Link>
  );

  if (!isTauri())
    return (
      <div className="rn">
        {back}
        <p className="ex-banner ex-banner--info" role="note">
          <Info size={16} aria-hidden="true" />
          {t("execution.webReadOnly")}
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
        <p className="tp-field__hint">{t("common.loading")}</p>
      </div>
    );
  if (data === null || !run)
    return (
      <div className="rn">
        {back}
        <p className="tp-field__hint">{t("execution.run.notFound")}</p>
      </div>
    );

  const c = data.counts;
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
          <StatusPill tone={r.status === "not_run" ? "neutral" : statusTone(r.status)} dot>
            {r.status === "not_run" ? t("execution.notRun") : t(`runs.status.${r.status}`, r.status)}
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
          </div>
          <dl className="ex-meta">
            {meta.map((m) => (
              <div key={m.k} className="ex-meta__item">
                <dt>{m.k}</dt>
                <dd>{m.v}</dd>
              </div>
            ))}
          </dl>
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
          <p className="tp-field__hint ex-evidence-note">
            <Info size={14} aria-hidden="true" /> {t("execution.evidenceLocal")}
          </p>
        </header>
      )}

      <div className="ex-run__body">
        {(!itemId || split) && (
          <section className="ex-items" aria-label={t("execution.run.items")}>
            <FilterChips
              label={t("execution.run.filter")}
              value={filter}
              onChange={(v) => setFilter(v as Filter)}
              options={(["all", "not_run", "failed", "blocked", "passed"] as Filter[]).map((f) => ({
                value: f,
                label: f === "all" ? t("runs.list.all") : f === "not_run" ? t("execution.notRun") : t(`runs.status.${f}`),
                count: f === "all" ? items.length : items.filter((i) => i.status === f).length,
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
            <DataTable
              label={t("execution.run.items")}
              rows={shown}
              columns={split && itemId ? columns.slice(0, 2) : columns}
              getRowId={(r) => r.item.id}
              empty={
                <p className="tp-field__hint">
                  {items.length === 0 ? t("execution.run.empty") : t("execution.run.emptyFilter")}
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
          </section>
        )}
        {panel}
      </div>

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
      <fieldset className="rn-form">
        <legend className="tp-field__label">{t("execution.run.closeAs")}</legend>
        {(["completed", "aborted"] as const).map((s) => (
          <label key={s} className="rn-check">
            <input
              type="radio"
              name={`${id}-status`}
              checked={status === s}
              onChange={() => setStatus(s)}
            />
            {t(`runs.runStatus.${s}`)}
          </label>
        ))}
      </fieldset>
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
