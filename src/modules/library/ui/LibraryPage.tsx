import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Plus, Search } from "lucide-react";
import { useAuth } from "@modules/auth";
import {
  DataTable,
  TableSkeleton,
  type DataColumn,
} from "@shared/ui/DataTable";
import { LoadError } from "@shared/ui/LoadError";
import { StatusPill } from "@shared/ui/StatusPill";
import { Switch } from "@shared/ui/Switch";
import { TabPanel, Tabs } from "@shared/ui/Tabs";
import { libraryApi } from "../api/libraryApi";
import {
  columnsOfItem,
  kindOfTab,
  paramsOfItem,
  rowsOfItem,
  stepsOfItem,
  type LibraryItem,
  type LibraryKind,
  type LibraryTab,
} from "../model/types";
import { DatasetEditor } from "./DatasetEditor";
import { SharedStepEditor } from "./SharedStepEditor";
import { ParamChip } from "./StepText";
import "@shared/ui/buttons.css";
import "./Library.css";

type Lists = Record<LibraryKind, LibraryItem[] | null>;

/** Whether an item matches the search: its name, its steps' text or its
 *  columns. */
function matches(item: LibraryItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const texts =
    item.kind === "dataset"
      ? columnsOfItem(item.definition).map((c) => c.name)
      : stepsOfItem(item.body).flatMap((s) => [s.text, s.expected ?? ""]);
  return [item.name, item.description, ...texts].some((x) =>
    x.toLowerCase().includes(q),
  );
}

/**
 * The project library (CAS-01, ADR-0055, boceto 1): the tabs «Pasos
 * compartidos» and «Datasets», each a list with search, «Nuevo…» and
 * «Mostrar obsoletos». The tab and the open item live in the address
 * (`?tab=steps|datasets&item=<id|new>`, ADR-0029), so a reload or a link from
 * a case opens the same thing.
 */
export function LibraryPage({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [params, setParams] = useSearchParams();
  const tab: LibraryTab =
    params.get("tab") === "datasets" ? "datasets" : "steps";
  const kind = kindOfTab(tab);
  const open = params.get("item");
  const [lists, setLists] = useState<Lists>({
    shared_step: null,
    dataset: null,
  });
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [obsolete, setObsolete] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [steps, datasets] = await Promise.all([
        libraryApi.list(projectId, "shared_step", userId),
        libraryApi.list(projectId, "dataset", userId),
      ]);
      setLists({ shared_step: steps, dataset: datasets });
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [projectId, userId]);
  useEffect(() => {
    void reload();
    const onSync = () => void reload();
    window.addEventListener("pharos:synced", onSync);
    return () => window.removeEventListener("pharos:synced", onSync);
  }, [reload]);

  const go = (next: LibraryTab, item?: string, replace = false) =>
    setParams(item ? { tab: next, item } : { tab: next }, { replace });

  const when = useCallback(
    (s: string) =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`)),
    [i18n.resolvedLanguage],
  );

  const items = lists[kind];
  const visible = useMemo(
    () =>
      (items ?? []).filter(
        (i) => (obsolete || i.status !== "obsolete") && matches(i, query),
      ),
    [items, obsolete, query],
  );

  if (open) {
    const props = {
      projectId,
      itemId: open === "new" ? null : open,
      when,
      onSaved: (id: string) => go(tab, id, true),
      onClose: () => {
        go(tab);
        void reload();
      },
    };
    return tab === "datasets" ? (
      <DatasetEditor key={open} {...props} />
    ) : (
      <SharedStepEditor key={open} {...props} />
    );
  }

  const count = (k: LibraryKind) =>
    (lists[k] ?? []).filter((i) => i.status !== "obsolete").length;
  const nameCell = (i: LibraryItem) => (
    <span className="lb-name">
      <button type="button" className="lb-open" onClick={() => go(tab, i.id)}>
        {i.name}
      </button>
      {i.status === "obsolete" && (
        <StatusPill tone="neutral" strike>
          {t("library.status.obsolete")}
        </StatusPill>
      )}
    </span>
  );
  const common: DataColumn<LibraryItem>[] = [
    {
      id: "version",
      header: t("library.column.version"),
      width: "80px",
      align: "end",
      cell: (i) => `v${i.version}`,
    },
    {
      id: "usedBy",
      header: t("library.column.usedBy"),
      width: "100px",
      align: "end",
      cell: (i) => t("library.casesCount", { count: i.usedBy }),
    },
    {
      id: "updated",
      header: t("library.column.updated"),
      width: "120px",
      minView: "desktop",
      cell: (i) => <span className="lb-muted">{when(i.updatedAt)}</span>,
    },
  ];
  const columns: DataColumn<LibraryItem>[] =
    kind === "shared_step"
      ? [
          {
            id: "name",
            header: t("library.column.name"),
            width: "minmax(0,2fr)",
            cell: nameCell,
          },
          {
            id: "params",
            header: t("library.column.params"),
            width: "minmax(0,1.6fr)",
            minView: "tablet",
            cell: (i) => {
              const ps = paramsOfItem(i.definition);
              return ps.length === 0 ? (
                <span className="lb-muted">
                  {t("library.params.noneShort")}
                </span>
              ) : (
                <span className="lb-chips">
                  {ps.map((p) => (
                    <ParamChip key={p.name} name={p.name} />
                  ))}
                </span>
              );
            },
          },
          {
            id: "steps",
            header: t("library.column.steps"),
            width: "72px",
            align: "end",
            cell: (i) => stepsOfItem(i.body).length,
          },
          ...common,
        ]
      : [
          {
            id: "name",
            header: t("library.column.name"),
            width: "minmax(0,2fr)",
            cell: nameCell,
          },
          {
            id: "columns",
            header: t("library.column.columns"),
            width: "minmax(0,1.6fr)",
            minView: "tablet",
            cell: (i) => (
              <span className="lb-chips">
                {columnsOfItem(i.definition).map((c) => (
                  <code key={c.id} className="lb-col">
                    {c.name}
                  </code>
                ))}
              </span>
            ),
          },
          {
            id: "rows",
            header: t("library.column.rows"),
            width: "72px",
            align: "end",
            cell: (i) => rowsOfItem(i.body).length,
          },
          ...common,
        ];

  return (
    <div className="lb">
      <Tabs
        label={t("library.title")}
        variant="underline"
        idPrefix="lb-"
        value={tab}
        onChange={(v) => go(v as LibraryTab)}
        items={[
          {
            id: "steps",
            label: t("library.tab.steps"),
            badge: { count: count("shared_step"), tone: "muted" },
          },
          {
            id: "datasets",
            label: t("library.tab.datasets"),
            badge: { count: count("dataset"), tone: "muted" },
          },
        ]}
      />
      <TabPanel id={tab} idPrefix="lb-" className="lb-panel">
        <div className="lb-toolbar">
          <label className="ui-search lb-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">{t("library.search.label")}</span>
            <input
              type="search"
              value={query}
              placeholder={
                kind === "dataset"
                  ? t("library.search.datasets")
                  : t("library.search.steps")
              }
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            onClick={() => go(tab, "new")}
          >
            <Plus size={16} aria-hidden="true" />
            <span className="ui-btn__text">
              {kind === "dataset"
                ? t("library.newDataset")
                : t("library.newStep")}
            </span>
          </button>
          <Switch
            checked={obsolete}
            onChange={setObsolete}
            label={t("library.showObsolete")}
          />
        </div>
        {loadFailed && (
          <LoadError
            message={t("library.loadFailed")}
            onRetry={() => void reload()}
          />
        )}
        {items === null ? (
          !loadFailed && (
            <TableSkeleton columns={columns} minWidth={640} rowHeight={32} />
          )
        ) : items.length === 0 ? (
          <p className="lb-empty">
            {kind === "dataset"
              ? t("library.emptyDatasets")
              : t("library.emptySteps")}
          </p>
        ) : (
          <DataTable
            rows={visible}
            columns={columns}
            getRowId={(i) => i.id}
            label={
              kind === "dataset"
                ? t("library.tab.datasets")
                : t("library.tab.steps")
            }
            className="dt-surface"
            minWidth={640}
            empty={<p className="lb-empty">{t("library.noMatch")}</p>}
          />
        )}
      </TabPanel>
    </div>
  );
}
