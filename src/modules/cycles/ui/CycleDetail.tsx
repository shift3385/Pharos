import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, Filter, ListPlus, MoreHorizontal, Pencil, Play } from "lucide-react";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { DataTable, type DataColumn } from "@shared/ui/DataTable";
import { Menu, MenuItem, MenuSeparator } from "@shared/ui/Menu";
import { StatusPill } from "@shared/ui/StatusPill";
import { TabPanel, Tabs } from "@shared/ui/Tabs";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { usePopover } from "@shared/ui/usePopover";
import { useToast } from "@shared/ui/Toast";
import { cycleApi } from "../api/cycleApi";
import {
  cellStatus,
  cellTone,
  cycleTone,
  type CaseOption,
  type Configuration,
  type CycleItem,
  type CycleProgress,
  type CycleRun,
  type TestCycle,
  type TestCycleInput,
} from "../model/types";
import { addedMessage, cycleError, dateRange } from "../model/messages";
import { CycleDialog } from "./CycleDialog";
import { ExecuteDialog } from "./ExecuteDialog";
import { AddByFilterDialog, AddCasesDialog } from "./ItemDialogs";
import { ProgressBar } from "./ProgressBar";
import "@shared/ui/buttons.css";
import "@shared/ui/headerActions.css";
import "./Cycles.css";

type Tab = "items" | "runs";

/** The row menu of an item: move up or down, remove. */
function ItemMenu({
  item,
  index,
  count,
  disabled,
  onMove,
  onRemove,
}: {
  item: CycleItem;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const menu = usePopover("menu");
  const name = item.caseKey || item.testCaseId;
  return (
    <>
      <button
        type="button"
        className="cy-icon-btn"
        aria-label={t("cycles.items.actions", { key: name })}
        disabled={disabled}
        {...menu.triggerProps}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      <Menu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={t("cycles.items.actions", { key: name })}
        placement="bottom-end"
      >
        <MenuItem disabled={index === 0} onSelect={() => onMove(index - 1)}>
          {t("configurations.moveUp")}
        </MenuItem>
        <MenuItem disabled={index >= count - 1} onSelect={() => onMove(index + 1)}>
          {t("configurations.moveDown")}
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={onRemove}>{t("cycles.items.remove")}</MenuItem>
      </Menu>
    </>
  );
}

/** The assignee of an item, edited in place: saved when the field loses
 *  focus or on Enter, if it changed. */
function AssigneeInput({
  item,
  disabled,
  onSave,
}: {
  item: CycleItem;
  disabled: boolean;
  onSave: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(item.assignee ?? "");
  useEffect(() => setValue(item.assignee ?? ""), [item.assignee]);
  const commit = () => {
    if (value.trim() !== (item.assignee ?? "")) onSave(value.trim());
  };
  return (
    <input
      className="cy-inline-input"
      value={value}
      maxLength={200}
      disabled={disabled}
      placeholder={t("cycles.items.unassigned")}
      aria-label={t("cycles.items.assigneeOf", { key: item.caseKey || item.testCaseId })}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** One cycle (ADR-0017): its header, what it runs (items) by configuration
 *  with each cell's latest final result, and its runs. «Ejecutar» creates one
 *  run per configuration (desktop only until runs reach the web). */
export function CycleDetail({
  cycleId,
  projectId,
  userId,
  configurations,
  loadCases,
  requirementKeys,
  onBack,
  onOpen,
  onChanged,
}: {
  cycleId: string;
  projectId: string;
  userId: string;
  configurations: Configuration[];
  loadCases: () => Promise<CaseOption[]>;
  requirementKeys: string[];
  onBack: () => void;
  /** Opens another cycle (the clone). */
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [cycle, setCycle] = useState<TestCycle | null | undefined>(undefined);
  const [items, setItems] = useState<CycleItem[]>([]);
  const [progress, setProgress] = useState<CycleProgress | null>(null);
  const [runs, setRuns] = useState<CycleRun[]>([]);
  const [tab, setTab] = useState<Tab>("items");
  const [dialog, setDialog] = useState<"edit" | "add" | "filter" | "execute" | "delete" | null>(null);
  const [cases, setCases] = useState<CaseOption[] | null>(null);
  const [error, setError] = useState("");
  const more = usePopover("menu");
  // The assignee column shows on desktop only; on a tablet it goes under the title.
  const view = useBreakpoint();

  const notify = useRef({ toast, t });
  notify.current = { toast, t };
  const reload = useCallback(async () => {
    try {
      const [c, list, p, r] = await Promise.all([
        cycleApi.get(cycleId, userId),
        cycleApi.items(cycleId, userId),
        cycleApi.progress(cycleId, userId),
        cycleApi.runs(cycleId, userId),
      ]);
      setCycle(c);
      setItems(list);
      setProgress(p);
      setRuns(r);
    } catch {
      setCycle(null);
      notify.current.toast(notify.current.t("cycles.loadFailed"), "error");
    }
  }, [cycleId, userId]);
  useEffect(() => {
    void reload();
    window.addEventListener("pharos:synced", reload);
    return () => window.removeEventListener("pharos:synced", reload);
  }, [reload]);

  useEffect(() => {
    if ((dialog === "add" || dialog === "filter") && cases === null) {
      void loadCases()
        .then(setCases)
        .catch(() => setCases([]));
    }
  }, [dialog, cases, loadCases]);

  const columnsOf = useMemo(() => {
    const ids = progress?.configurationIds ?? [];
    return ids.map((id) => ({
      id,
      name: id === null ? t("cycles.items.result") : (configurations.find((c) => c.id === id)?.name ?? t("cycles.items.unknownConfiguration")),
    }));
  }, [progress, configurations, t]);

  if (cycle === undefined) return <p className="tp__muted">{t("common.loading")}</p>;
  if (cycle === null) {
    return (
      <section className="cy-page">
        <button type="button" className="cy-back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t("cycles.back")}
        </button>
        <p className="cy-empty">{t("cycles.notFound")}</p>
      </section>
    );
  }

  const closed = cycle.status === "closed";
  const canExecute = cycleApi.canExecute();
  const cycleConfigs = configurations.filter((c) => cycle.configurationIds.includes(c.id));
  const present = new Set(items.filter((i) => !i.flowId && !i.exampleRowId).map((i) => i.testCaseId));
  const cell = (itemId: string, configurationId: string | null) =>
    progress?.cells.find((c) => c.itemId === itemId && c.configurationId === configurationId);

  /** Runs a change, then reloads; a refusal goes to the open form, or to a
   *  toast. Returns whether it worked, with its value. */
  async function act<T>(fn: () => Promise<T>, done?: (v: T) => string): Promise<{ ok: true; value: T } | { ok: false }> {
    try {
      const value = await fn();
      if (done) toast(done(value));
      setError("");
      setDialog(null);
      await reload();
      onChanged();
      return { ok: true, value };
    } catch (e) {
      const msg = cycleError(t, e);
      if (dialog === "edit" || dialog === "execute") setError(msg);
      else toast(msg, "error");
      return { ok: false };
    }
  }

  const save = (input: TestCycleInput) =>
    act(() => cycleApi.update(cycle.id, input), () => t("cycles.savedToast")).then(() => undefined);

  const move = (from: number, to: number) => {
    const order = [...items];
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    setItems(order);
    void act(() =>
      cycleApi.reorderItems(
        cycle.id,
        order.map((i) => i.id),
        userId,
      ),
    );
  };

  const itemColumns: DataColumn<CycleItem>[] = [
    {
      id: "key",
      header: t("cycles.items.case"),
      width: "104px",
      cell: (i) => <code className="cy-key">{i.caseKey || "—"}</code>,
    },
    {
      id: "title",
      header: t("cycles.items.title"),
      width: "minmax(0,2fr)",
      cell: (i) => (
        <span className="cy-cell-title">
          <span className="cy-cell-title__main">{i.caseTitle || t("cycles.items.caseGone")}</span>
          {(i.flowId || i.exampleRowId) && (
            <span className="cy-cell-title__meta">
              {[i.flowId && t("cycles.items.flow", { id: i.flowId }), i.exampleRowId && t("cycles.items.row", { id: i.exampleRowId })]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {view === "tablet" && i.assignee && <span className="cy-cell-title__meta">{i.assignee}</span>}
          {i.caseStatus && i.caseStatus !== "approved" && (
            <span className="cy-row__warn">
              <AlertTriangle size={13} aria-hidden="true" />
              {t("cycles.notApproved")}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "assignee",
      header: t("cycles.items.assignee"),
      width: "minmax(120px,1fr)",
      minView: "desktop",
      cell: (i) => (
        <AssigneeInput
          item={i}
          disabled={closed}
          onSave={(v) => void act(() => cycleApi.setAssignee(i.id, v, userId))}
        />
      ),
    },
    ...columnsOf.map(
      (col): DataColumn<CycleItem> => ({
        id: `cfg-${col.id ?? "none"}`,
        header: col.name,
        width: "minmax(104px,0.8fr)",
        cell: (i) => {
          const c = cell(i.id, col.id);
          const status = cellStatus(c?.status ?? "not_run");
          return (
            <StatusPill tone={cellTone(status)} dot>
              {t(`cycles.cell.${status}`)}
            </StatusPill>
          );
        },
      }),
    ),
    {
      id: "menu",
      header: <span className="sr-only">{t("cycles.items.actionsHeader")}</span>,
      width: "48px",
      align: "end",
      cell: (i) => (
        <ItemMenu
          item={i}
          index={items.indexOf(i)}
          count={items.length}
          disabled={closed}
          onMove={(to) => move(items.indexOf(i), to)}
          onRemove={() =>
            void act(
              () => cycleApi.removeItems(cycle.id, [i.id], userId),
              () => t("cycles.items.removedToast", { key: i.caseKey }),
            )
          }
        />
      ),
    },
  ];

  const runColumns: DataColumn<CycleRun>[] = [
    { id: "key", header: t("cycles.runs.key"), width: "96px", cell: (r) => <code className="cy-key">{r.runKey}</code> },
    { id: "title", header: t("cycles.runs.title"), width: "minmax(0,2fr)", cell: (r) => r.title },
    {
      id: "configuration",
      header: t("cycles.runs.configuration"),
      width: "minmax(0,1fr)",
      minView: "tablet",
      cell: (r) => configurations.find((c) => c.id === r.configurationId)?.name ?? "—",
    },
    {
      id: "status",
      header: t("cycles.runs.status"),
      width: "120px",
      cell: (r) => (
        <StatusPill tone={r.status === "in_progress" ? "info" : r.status === "aborted" ? "warning" : "success"}>
          {t(`cycles.runStatus.${r.status}`, r.status)}
        </StatusPill>
      ),
    },
    {
      id: "started",
      header: t("cycles.runs.started"),
      width: "160px",
      minView: "desktop",
      cell: (r) => (r.startedAt ? new Date(r.startedAt).toLocaleString(i18n.resolvedLanguage) : "—"),
    },
  ];

  const meta = [
    cycle.build && t("cycles.meta.build", { build: cycle.build }),
    cycle.environment && t("cycles.meta.environment", { environment: cycle.environment }),
    dateRange(cycle.startsOn, cycle.endsOn, i18n.resolvedLanguage),
    cycle.milestone && t("cycles.meta.milestone", { milestone: cycle.milestone }),
    cycle.sprint && t("cycles.meta.sprint", { sprint: cycle.sprint }),
  ].filter((m): m is string => Boolean(m));

  return (
    <section className="cy-page" aria-labelledby="cy-detail-title">
      <button type="button" className="cy-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t("cycles.back")}
      </button>
      <div className="cy-page__head">
        <div className="cy-detail__heading">
          <div className="cy-detail__titlerow">
            <code className="cy-key">{cycle.cycleKey}</code>
            <h2 id="cy-detail-title" className="pj-section-title">
              {cycle.title}
            </h2>
            <StatusPill tone={cycleTone(cycle.status)}>{t(`cycles.status.${cycle.status}`, cycle.status)}</StatusPill>
          </div>
          {meta.length > 0 && <p className="cy-detail__meta">{meta.join(" · ")}</p>}
          {cycle.description && <p className="cy-detail__desc">{cycle.description}</p>}
        </div>
        <div className="cy-actions">
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            disabled={!canExecute || closed || items.length === 0}
            title={!canExecute ? t("cycles.execute.desktopOnly") : closed ? t("cycles.error.closed") : undefined}
            onClick={() => {
              setError("");
              setDialog("execute");
            }}
          >
            <Play size={16} aria-hidden="true" />
            {t("cycles.execute.action")}
          </button>
          <button
            type="button"
            className="header-action"
            onClick={() => {
              setError("");
              setDialog("edit");
            }}
          >
            <Pencil size={16} aria-hidden="true" />
            <span className="header-action__label">{t("cycles.edit")}</span>
          </button>
          <button
            type="button"
            className="header-action"
            aria-label={t("cycles.moreActions")}
            {...more.triggerProps}
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
          <Menu
            open={more.open}
            onClose={more.close}
            anchorRef={more.anchorRef}
            id={more.id}
            label={t("cycles.moreActions")}
            placement="bottom-end"
          >
            <MenuItem
              onSelect={() =>
                void act(
                  () => cycleApi.clone(cycle.id, userId),
                  (c) => t("cycles.clonedToast", { key: c?.cycleKey ?? "" }),
                ).then((r) => {
                  if (r.ok && r.value) onOpen(r.value.id);
                })
              }
            >
              {t("cycles.clone")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => setDialog("delete")}>{t("cycles.delete")}</MenuItem>
          </Menu>
        </div>
      </div>
      {!canExecute && <p className="cy-note">{t("cycles.execute.desktopOnly")}</p>}
      {progress && (
        <div className="cy-summary">
          <ProgressBar summary={progress.summary} />
          <ul className="cy-summary__counts" aria-label={t("cycles.progress.countsLabel")}>
            {(["passed", "failed", "blocked", "skipped", "notRun"] as const).map((k) => (
              <li key={k}>
                <span className="cy-summary__n">{progress.summary[k]}</span>
                <span className="cy-summary__k">{t(`cycles.cell.${k === "notRun" ? "not_run" : k}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Tabs
        label={t("cycles.tabsLabel")}
        variant="underline"
        idPrefix="cy-"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        items={[
          { id: "items", label: t("cycles.tab.items"), badge: { count: items.length, tone: "muted" } },
          { id: "runs", label: t("cycles.tab.runs"), badge: { count: runs.length, tone: "muted" } },
        ]}
      />
      {tab === "items" ? (
        <TabPanel id="items" idPrefix="cy-" className="cy-panel">
          <div className="cy-toolbar">
            <button type="button" className="header-action" disabled={closed} onClick={() => setDialog("add")}>
              <ListPlus size={16} aria-hidden="true" />
              <span className="header-action__label">{t("cycles.add.action")}</span>
            </button>
            <button type="button" className="header-action" disabled={closed} onClick={() => setDialog("filter")}>
              <Filter size={16} aria-hidden="true" />
              <span className="header-action__label">{t("cycles.filter.action")}</span>
            </button>
          </div>
          <DataTable
            rows={items}
            columns={itemColumns}
            getRowId={(i) => i.id}
            label={t("cycles.items.label")}
            minWidth={400 + columnsOf.length * 110}
            empty={<p className="cy-empty">{t("cycles.items.empty")}</p>}
            mobileCard={(i) => (
              <div className="cy-mcard">
                <div className="cy-mcard__top">
                  <code className="cy-key">{i.caseKey}</code>
                  <ItemMenu
                    item={i}
                    index={items.indexOf(i)}
                    count={items.length}
                    disabled={closed}
                    onMove={(to) => move(items.indexOf(i), to)}
                    onRemove={() => void act(() => cycleApi.removeItems(cycle.id, [i.id], userId))}
                  />
                </div>
                <span className="cy-mcard__title">{i.caseTitle}</span>
                {i.assignee && <span className="cy-cell-title__meta">{i.assignee}</span>}
                {i.caseStatus && i.caseStatus !== "approved" && (
                  <span className="cy-row__warn">
                    <AlertTriangle size={13} aria-hidden="true" />
                    {t("cycles.notApproved")}
                  </span>
                )}
                <span className="cy-mcard__cells">
                  {columnsOf.map((col) => {
                    const status = cellStatus(cell(i.id, col.id)?.status ?? "not_run");
                    return (
                      <span key={col.id ?? "none"} className="cy-mcard__cell">
                        <span className="cy-cell-title__meta">{col.name}</span>
                        <StatusPill tone={cellTone(status)} dot>
                          {t(`cycles.cell.${status}`)}
                        </StatusPill>
                      </span>
                    );
                  })}
                </span>
              </div>
            )}
          />
        </TabPanel>
      ) : (
        <TabPanel id="runs" idPrefix="cy-" className="cy-panel">
          <p className="cy-note">{t("cycles.runs.hint")}</p>
          <DataTable
            rows={runs}
            columns={runColumns}
            getRowId={(r) => r.id}
            label={t("cycles.runs.label")}
            empty={<p className="cy-empty">{t("cycles.runs.empty")}</p>}
          />
        </TabPanel>
      )}

      {dialog === "edit" && (
        <CycleDialog
          cycle={cycle}
          projectId={projectId}
          userId={userId}
          configurations={configurations}
          error={error}
          onSave={save}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === "add" && (
        <AddCasesDialog
          cases={cases}
          present={present}
          onAdd={(list) =>
            act(() => cycleApi.addItems(cycle.id, list, userId), (out) => addedMessage(t, out)).then(() => undefined)
          }
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === "filter" && (
        <AddByFilterDialog
          projectId={projectId}
          userId={userId}
          requirementKeys={requirementKeys}
          onAdd={(filter, assignee) =>
            act(() => cycleApi.addByFilter(cycle.id, filter, userId, assignee), (out) => addedMessage(t, out)).then(
              () => undefined,
            )
          }
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === "execute" && (
        <ExecuteDialog
          cycle={cycle}
          configurations={cycleConfigs}
          items={items.length}
          error={error}
          onExecute={(input) =>
            act(
              () => cycleApi.execute(cycle.id, { ...input, userId }),
              (created) => t("cycles.execute.doneToast", { count: created.length, keys: created.map((r) => r.runKey).join(", ") }),
            ).then((r) => {
              if (r.ok) setTab("runs");
            })
          }
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === "delete" && (
        <ConfirmDialog
          variant="destructive"
          title={t("cycles.deleteTitle", { key: cycle.cycleKey })}
          message={t("cycles.deleteMessage", { count: runs.length })}
          confirmLabel={t("cycles.deleteConfirm")}
          onConfirm={() =>
            void act(
              () => cycleApi.remove(cycle.id, userId),
              () => t("cycles.deletedToast", { key: cycle.cycleKey }),
            ).then((r) => {
              if (r.ok) onBack();
            })
          }
          onCancel={() => setDialog(null)}
        />
      )}
    </section>
  );
}
