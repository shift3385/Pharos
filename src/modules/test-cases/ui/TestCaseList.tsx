import { useContext, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Link } from "react-router";
import {
  ArrowLeftRight,
  Download,
  Flag,
  Layers,
  ListFilter,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { DataTable, type DataColumn } from "@shared/ui/DataTable";
import { Pagination } from "@shared/ui/Pagination";
import { FilterChips } from "@shared/ui/FilterChips";
import { FilterMenuButton } from "@shared/ui/FilterMenuButton";
import { StatusPill } from "@shared/ui/StatusPill";
import { PriorityFlag } from "@shared/ui/PriorityFlag";
import { BottomSheet, MenuCheckItem, MenuItem, MenuLabel, MenuSeparator, ResponsiveMenu } from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { HeaderActionsContext, useHeaderActions } from "@shared/ui/headerActions";
import { caseLink } from "../model/caseLink";
import {
  CASE_LEVELS,
  CASE_PAGE_SIZES,
  CASE_PRIORITIES,
  CASE_STATUSES,
  statusCounts,
  type CaseFilters,
  type CaseSort,
  type ListedCase,
  type StatusFilter,
} from "../model/caseList";
import type { GherkinLevel } from "../model/types";
import { editedLabel, priorityTone, statusTone } from "./caseTones";
import "@shared/ui/buttons.css";
import "./TestCase.css";
import "./CaseList.css";

/**
 * Casos · lista (SPEC §8, RED-V3): the full table with search, state chips,
 * Prioridad / Ejecución / Nivel filters, multi-selection with bulk actions and
 * pagination; cards on mobile. The page owns the filters, the order and the
 * page, so the editor walks the same list.
 */
export function TestCaseList({
  projectId,
  cases,
  loading,
  visible,
  total,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  canSuggest,
  onSuggest,
  onNew,
  onImport,
  onExportFeatures,
  onDelete,
}: {
  projectId: string;
  /** Every case of the project (for the chip counts). */
  cases: ListedCase[];
  loading: boolean;
  /** The rows of the current page. */
  visible: ListedCase[];
  /** Cases that match the filters. */
  total: number;
  filters: CaseFilters;
  onFiltersChange: (f: CaseFilters) => void;
  sort: CaseSort;
  onSortChange: (s: CaseSort) => void;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  canSuggest: boolean;
  onSuggest: () => void;
  onNew: () => void;
  onImport: () => void;
  /** Exports the given cases (all when omitted) as tagged .feature files. */
  onExportFeatures: (ids?: ReadonlySet<string>) => void;
  onDelete: (ids: ReadonlySet<string>) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const view = useBreakpoint();
  const mobile = view === "mobile";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const counts = statusCounts(cases, filters);
  const lang = i18n.resolvedLanguage ?? "es";
  const filtered = filters.query !== "" || filters.status !== "all" || filters.priorities.size > 0 || filters.levels.size > 0;

  const set = (patch: Partial<CaseFilters>) => onFiltersChange({ ...filters, ...patch });
  const statusOptions = [
    { value: "all", label: t("testCase.list.all"), count: counts.all },
    ...CASE_STATUSES.filter((s) => s !== "obsolete" || counts.obsolete > 0).map((s) => ({
      value: s,
      label: t(`testCase.statusLabel.${s}`),
      count: counts[s],
    })),
  ];
  const priorityOptions = CASE_PRIORITIES.map((p) => ({
    value: p,
    label: t(`testCase.priorityLabel.${p}`),
    description: t(`testCase.priorityHelp.${p}`),
  }));
  const levelOptions = CASE_LEVELS.map((l) => ({ value: l, label: t(`testCase.level.${l}.name`) }));

  const reqCell = (c: ListedCase) =>
    c.requirementKeys.length === 0 ? (
      <span className="cl-muted">{t("testCase.list.noRequirement")}</span>
    ) : (
      <span className="cl-reqs" title={c.requirementKeys.join(", ")}>
        <span className="cl-req">{c.requirementKeys[0]}</span>
        {c.requirementKeys.length > 1 && (
          <span className="cl-more">{t("testCase.list.more", { count: c.requirementKeys.length - 1 })}</span>
        )}
      </span>
    );
  const statusPill = (c: ListedCase) => (
    <StatusPill tone={statusTone(c.status)} strike={c.status === "obsolete"}>
      {t(`testCase.statusLabel.${c.status}`)}
    </StatusPill>
  );
  const execution = (
    <StatusPill tone="neutral" dot title={t("testCase.list.executionSoon")}>
      {t("testCase.list.notRun")}
    </StatusPill>
  );
  const titleLink = (c: ListedCase) => (
    <Link className="cl-title" to={caseLink(projectId, c.id)} title={c.title}>
      {c.title}
    </Link>
  );

  const columns: DataColumn<ListedCase>[] = [
    {
      id: "id",
      header: t("testCase.list.col.id"),
      width: "96px",
      sortable: true,
      cell: (c) => (
        <span className="cl-id" title={c.scenarioId}>
          {c.scenarioId}
        </span>
      ),
    },
    {
      id: "title",
      header: t("testCase.list.col.title"),
      width: "minmax(0,2.6fr)",
      sortable: true,
      cell: (c) => (
        <>
          {titleLink(c)}
          {c.aiPending && <span className="ai-prov ai-prov--compact">{t("ai.provenance.short")}</span>}
        </>
      ),
    },
    { id: "requirement", header: t("testCase.list.col.requirement"), width: "96px", cell: reqCell },
    {
      id: "priority",
      header: t("testCase.list.col.priority"),
      width: "92px",
      sortable: true,
      cell: (c) => (
        <PriorityFlag tone={priorityTone(c.priority)} label={t(`testCase.priorityLabel.${c.priority}`)} showLabel />
      ),
    },
    {
      id: "level",
      header: t("testCase.list.col.level"),
      width: "minmax(0,1fr)",
      minView: "desktop",
      cell: (c) => <span className="cl-ellipsis">{t(`testCase.level.${c.gherkinLevel}.name`)}</span>,
    },
    { id: "status", header: t("testCase.list.col.status"), width: "104px", sortable: true, cell: statusPill },
    {
      id: "execution",
      header: t("testCase.list.col.execution"),
      width: "128px",
      minView: "desktop",
      cell: () => execution,
    },
    {
      id: "updated",
      header: t("testCase.list.col.edited"),
      width: "72px",
      sortable: true,
      cell: (c) => (
        <span className="cl-muted" title={new Date(c.updatedAt).toLocaleString(lang)}>
          {editedLabel(c.updatedAt, lang, t("testCase.list.today"), t("testCase.list.yesterday"))}
        </span>
      ),
    },
  ];

  const card = (c: ListedCase) => (
    <div className="cl-card">
      <div className="cl-card__top">
        <span className="cl-id">{c.scenarioId}</span>
        {execution}
      </div>
      {titleLink(c)}
      <span className="cl-card__meta">
        <PriorityFlag tone={priorityTone(c.priority)} label={t(`testCase.priorityLabel.${c.priority}`)} />
        {t(`testCase.level.${c.gherkinLevel}.name`)} · {t(`testCase.statusLabel.${c.status}`)}
      </span>
      {c.requirementKeys.length > 0 && reqCell(c)}
    </div>
  );

  // The section's buttons go to the project header (V2's slot); outside a
  // project page (the list on its own) they keep their own row.
  const inHeader = useContext(HeaderActionsContext) !== null;
  const actions = (
    <>
          <ImportExportMenu onImport={onImport} onExportFeatures={() => onExportFeatures()} hasCases={cases.length > 0} />
          <button
            type="button"
            className="ui-btn"
            onClick={() => {
              if (canSuggest) onSuggest();
            }}
            aria-disabled={!canSuggest || undefined}
            title={canSuggest ? undefined : t("testCase.suggest.disabled")}
          >
            <Sparkles size={16} aria-hidden="true" />
            <span className="ui-btn__text">{t("testCase.list.suggest")}</span>
          </button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={onNew}>
            <Plus size={16} aria-hidden="true" />
            <span className="ui-btn__text">{t("testCase.new")}</span>
          </button>
    </>
  );
  useHeaderActions(actions);

  return (
    <section className="cl" aria-labelledby="cl-title">
      <h2 id="cl-title" className="sr-only">
        {t("testCase.title")}
      </h2>
      {!inHeader && <div className="cl-actions">{actions}</div>}

      <div className="cl-card-box">
        <div className="cl-toolbar">
          <label className="ui-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">{t("testCase.list.searchLabel")}</span>
            <input
              type="search"
              value={filters.query}
              placeholder={t("testCase.list.search")}
              onChange={(e) => set({ query: e.target.value })}
            />
          </label>
          {mobile && (
            <MobileFilters
              filters={filters}
              onChange={onFiltersChange}
              priorityOptions={priorityOptions}
              levelOptions={levelOptions}
            />
          )}
          <FilterChips
            label={t("testCase.list.statusFilter")}
            options={statusOptions}
            value={filters.status}
            onChange={(v) => set({ status: v as StatusFilter })}
          />
          {!mobile && (
            <div className="cl-filters">
              <FilterMenuButton
                label={t("testCase.list.col.priority")}
                icon={Flag}
                options={priorityOptions}
                selected={filters.priorities}
                onChange={(v) => set({ priorities: v })}
              />
              <FilterMenuButton
                label={t("testCase.list.col.execution")}
                icon={Play}
                options={[]}
                selected={new Set()}
                onChange={() => {}}
                disabled
                disabledReason={t("testCase.list.executionSoon")}
              />
              <FilterMenuButton
                label={t("testCase.list.col.level")}
                icon={Layers}
                options={levelOptions}
                selected={filters.levels}
                onChange={(v) => set({ levels: v as Set<GherkinLevel> })}
              />
            </div>
          )}
        </div>

        {selected.size > 0 && (
          <div className="cl-bulk" role="region" aria-label={t("testCase.list.bulk")}>
            <span className="cl-bulk__count" aria-live="polite">
              {t("testCase.list.selected", { count: selected.size })}
            </span>
            <button type="button" className="ui-btn ui-btn--small" onClick={() => onExportFeatures(selected)}>
              <Download size={15} aria-hidden="true" />
              {t("testCase.list.exportSelected")}
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--small ui-btn--danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} aria-hidden="true" />
              {t("testCase.list.deleteSelected")}
            </button>
            <button type="button" className="ui-btn ui-btn--small ui-btn--ghost" onClick={() => setSelected(new Set())}>
              <X size={15} aria-hidden="true" />
              {t("testCase.list.clearSelection")}
            </button>
          </div>
        )}

        {loading ? (
          <p className="cl-empty">{t("common.loading")}</p>
        ) : cases.length === 0 ? (
          <p className="cl-empty">{t("testCase.empty")}</p>
        ) : (
          <>
            <DataTable
              rows={visible}
              columns={columns}
              getRowId={(c) => c.id}
              label={t("testCase.title")}
              selection={{ selected, onChange: setSelected, rowLabel: (c) => `${c.scenarioId} ${c.title}` }}
              sort={sort}
              onSortChange={(s) => onSortChange(s as CaseSort)}
              mobileCard={card}
              minWidth={view === "desktop" ? 900 : 640}
              empty={
                <div className="cl-nomatch">
                  <p>{t("testCase.list.noMatch")}</p>
                  {filtered && (
                    <button
                      type="button"
                      className="ui-btn ui-btn--small"
                      onClick={() => onFiltersChange({ ...filters, query: "", status: "all", priorities: new Set(), levels: new Set() })}
                    >
                      {t("testCase.list.clearFilters")}
                    </button>
                  )}
                </div>
              }
            />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={onPageChange}
              pageSizes={CASE_PAGE_SIZES}
              onPageSizeChange={onPageSizeChange}
              summary={({ from, to, total: n }) => (
                <Trans
                  i18nKey="testCase.list.summary"
                  values={{ from, to, total: n }}
                  components={{ b: <b /> }}
                />
              )}
            />
          </>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          variant="destructive"
          title={t("testCase.list.deleteTitle", { count: selected.size })}
          message={t("testCase.list.deleteMessage", { count: selected.size })}
          confirmLabel={t("testCase.list.deleteConfirm")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            const ids = selected;
            setConfirmDelete(false);
            setSelected(new Set());
            void onDelete(ids);
          }}
        />
      )}
    </section>
  );
}

/** «Importar / Exportar» (SPEC §8): a menu with an explanation per option; a
 *  sheet on mobile. */
function ImportExportMenu({
  onImport,
  onExportFeatures,
  hasCases,
}: {
  onImport: () => void;
  onExportFeatures: () => void;
  hasCases: boolean;
}) {
  const { t } = useTranslation();
  const mobile = useBreakpoint() === "mobile";
  const menu = usePopover(mobile ? "dialog" : "menu");
  const label = t("testCase.list.io");
  return (
    <>
      <button type="button" className="ui-btn ui-btn--io" data-natural {...menu.triggerProps}>
        <ArrowLeftRight size={16} aria-hidden="true" />
        {label}
      </button>
      <ResponsiveMenu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={label}
        title={label}
        className="cl-io"
      >
        <MenuLabel>{t("testCase.list.ioImport")}</MenuLabel>
        <MenuItem icon={Upload} onSelect={onImport} description={t("testCase.list.importXlsxHint")}>
          {t("testCase.import.button")}
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>{t("testCase.list.ioExport")}</MenuLabel>
        <MenuItem
          icon={Download}
          onSelect={onExportFeatures}
          disabled={!hasCases}
          title={hasCases ? undefined : t("testCase.empty")}
          description={t("testCase.list.exportFeaturesHint")}
        >
          {t("testCase.exportFeature")}
        </MenuItem>
      </ResponsiveMenu>
    </>
  );
}

/** On mobile the Prioridad / Ejecución / Nivel filters share one sheet. */
function MobileFilters({
  filters,
  onChange,
  priorityOptions,
  levelOptions,
}: {
  filters: CaseFilters;
  onChange: (f: CaseFilters) => void;
  priorityOptions: { value: string; label: string; description: string }[];
  levelOptions: { value: GherkinLevel; label: string }[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = filters.priorities.size + filters.levels.size;
  const toggle = <T,>(set: ReadonlySet<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };
  return (
    <>
      <button
        type="button"
        className="ui-iconbtn"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-active={active > 0 || undefined}
        title={t("testCase.list.filters")}
        onClick={() => setOpen(true)}
      >
        <ListFilter size={18} aria-hidden="true" />
        <span className="sr-only">{t("testCase.list.filters")}</span>
        {active > 0 && <span className="ui-iconbtn__count">{active}</span>}
      </button>
      {open && (
        <BottomSheet title={t("testCase.list.filters")} onClose={() => setOpen(false)}>
          <MenuLabel>{t("testCase.list.col.priority")}</MenuLabel>
          {priorityOptions.map((o) => (
            <MenuCheckItem
              key={o.value}
              checked={filters.priorities.has(o.value)}
              onToggle={() => onChange({ ...filters, priorities: toggle(filters.priorities, o.value) })}
              description={o.description}
            >
              {o.label}
            </MenuCheckItem>
          ))}
          <MenuLabel>{t("testCase.list.col.level")}</MenuLabel>
          {levelOptions.map((o) => (
            <MenuCheckItem
              key={o.value}
              checked={filters.levels.has(o.value)}
              onToggle={() => onChange({ ...filters, levels: toggle(filters.levels, o.value) })}
            >
              {o.label}
            </MenuCheckItem>
          ))}
          <MenuLabel>{t("testCase.list.col.execution")}</MenuLabel>
          <MenuCheckItem checked={false} onToggle={() => {}} disabled title={t("testCase.list.executionSoon")}>
            {t("testCase.list.executionSoonShort")}
          </MenuCheckItem>
        </BottomSheet>
      )}
    </>
  );
}
