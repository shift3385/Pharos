import { Fragment, useContext, useEffect, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Link } from "react-router";
import {
  ArrowLeftRight,
  Bot,
  Download,
  Flag,
  Layers,
  ListChecks,
  ListFilter,
  SlidersHorizontal,
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
  EMPTY_FILTERS,
  customFilterValue,
  filterableFields,
  hasMenuFilters,
  statusCounts,
  type CaseFilters,
  type CaseSort,
  type ListedCase,
  type StatusFilter,
} from "../model/caseList";
import type { GherkinLevel } from "../model/types";
import {
  AUTOMATION_STATUSES,
  CASE_TYPES,
  effectiveAutomation,
  effectiveCaseType,
  type AutomationStatus,
  type CaseType,
  type CustomField,
} from "@modules/custom-fields";
import {
  automationTone,
  editedLabel,
  priorityTone,
  stampLabel,
  statusTone,
} from "./caseTones";
import "@shared/ui/buttons.css";
import "./TestCase.css";
import "./CaseList.css";

/**
 * Casos · lista (SPEC §8, RED-V3): the full table with search, state chips,
 * Prioridad / Ejecución / Nivel / Tipo / Automatización filters and, for
 * choice and yes/no custom fields, «Campos» (FLD-01), multi-selection with
 * bulk actions and
 * pagination; cards on mobile. The page owns the filters, the order and the
 * page, so the editor walks the same list.
 */
export function TestCaseList({
  projectId,
  cases,
  fields = [],
  loading,
  visible,
  total,
  matching,
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
  /** The project's custom fields, for the «Campos» filter. */
  fields?: CustomField[];
  loading: boolean;
  /** The rows of the current page. */
  visible: ListedCase[];
  /** Cases that match the filters. */
  total: number;
  /** Every case that matches the filters, in order (all pages). */
  matching: ListedCase[];
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
  // A filter never leaves cases selected that it hides: the selection keeps
  // only the cases that still match (other pages included).
  useEffect(() => {
    const keep = new Set(matching.map((c) => c.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => keep.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [matching]);
  const shownIds = new Set(visible.map((c) => c.id));
  const offPage = [...selected].filter((id) => !shownIds.has(id)).length;
  const selectedKeys = matching.filter((c) => selected.has(c.id)).map((c) => c.scenarioId);
  const counts = statusCounts(cases, filters);
  const lang = i18n.resolvedLanguage ?? "es";
  const filtered =
    filters.query !== "" || filters.status !== "all" || hasMenuFilters(filters);

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
  const typeOptions = CASE_TYPES.map((c) => ({
    value: c,
    label: t(`testCase.caseTypeLabel.${c}`),
  }));
  const automationOptions = AUTOMATION_STATUSES.map((s) => ({
    value: s,
    label: t(`testCase.automationLabel.${s}`),
    description: t(`testCase.automationHelp.${s}`),
  }));
  // «Campos» (FLD-01): one entry per option of the choice and yes/no fields.
  const customOptions = filterableFields(fields).flatMap((f) =>
    f.fieldType === "boolean"
      ? [
          {
            value: customFilterValue(f.fieldKey, "true"),
            label: t("customFields.filterYes", { label: f.label }),
          },
          {
            value: customFilterValue(f.fieldKey, "false"),
            label: t("customFields.filterNo", { label: f.label }),
          },
        ]
      : f.options
          .filter((o) => !o.archived)
          .map((o) => ({
            value: customFilterValue(f.fieldKey, o.id),
            label: `${f.label}: ${o.label}`,
          })),
  );
  const automationPill = (c: ListedCase) => {
    const a = effectiveAutomation(c.automationStatus);
    return (
      <StatusPill tone={automationTone(a)}>
        {t(`testCase.automationLabel.${a}`)}
      </StatusPill>
    );
  };
  const checklistMark = (c: ListedCase) =>
    effectiveCaseType(c.caseType) === "checklist" && (
      <span className="cl-checklist" title={t("testCase.list.checklistMark")}>
        <ListChecks size={14} aria-hidden="true" />
        <span className="sr-only">{t("testCase.list.checklistMark")}</span>
      </span>
    );

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
        <span className="cl-id-cell">
          <span className="cl-id" title={c.scenarioId}>
            {c.scenarioId}
          </span>
          {checklistMark(c)}
        </span>
      ),
    },
    {
      id: "title",
      header: t("testCase.list.col.title"),
      // A title never gets narrower than this: the table scrolls sideways
      // instead (FLD-01 added the Automatización column).
      width: "minmax(160px,2.6fr)",
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
      width: "minmax(112px,1fr)",
      minView: "desktop",
      cell: (c) => <span className="cl-ellipsis">{t(`testCase.level.${c.gherkinLevel}.name`)}</span>,
    },
    { id: "status", header: t("testCase.list.col.status"), width: "104px", sortable: true, cell: statusPill },
    {
      id: "automation",
      header: t("testCase.list.col.automation"),
      width: "124px",
      minView: "tablet",
      cell: automationPill,
    },
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
        <span className="cl-muted" title={stampLabel(c.updatedAt, lang)}>
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
        <PriorityFlag
          tone={priorityTone(c.priority)}
          label={t(`testCase.priorityLabel.${c.priority}`)}
        />
        {effectiveCaseType(c.caseType) === "checklist"
          ? t("testCase.caseTypeLabel.checklist")
          : t(`testCase.level.${c.gherkinLevel}.name`)}{" "}
        · {t(`testCase.statusLabel.${c.status}`)} ·{" "}
        {t(
          `testCase.automationLabel.${effectiveAutomation(c.automationStatus)}`,
        )}
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
              groups={[
                {
                  label: t("testCase.list.col.type"),
                  key: "caseTypes",
                  options: typeOptions,
                },
                {
                  label: t("testCase.list.col.automation"),
                  key: "automation",
                  options: automationOptions,
                },
                ...(customOptions.length
                  ? [
                      {
                        label: t("customFields.filter"),
                        key: "custom" as const,
                        options: customOptions,
                      },
                    ]
                  : []),
              ]}
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
              <FilterMenuButton
                label={t("testCase.list.col.type")}
                icon={ListChecks}
                options={typeOptions}
                selected={filters.caseTypes}
                onChange={(v) => set({ caseTypes: v as Set<CaseType> })}
              />
              <FilterMenuButton
                label={t("testCase.list.col.automation")}
                icon={Bot}
                options={automationOptions}
                selected={filters.automation}
                onChange={(v) =>
                  set({ automation: v as Set<AutomationStatus> })
                }
              />
              {customOptions.length > 0 && (
                <FilterMenuButton
                  label={t("customFields.filter")}
                  icon={SlidersHorizontal}
                  options={customOptions}
                  selected={filters.custom}
                  onChange={(v) => set({ custom: v })}
                />
              )}
            </div>
          )}
        </div>

        {selected.size > 0 && (
          <div className="cl-bulk" role="region" aria-label={t("testCase.list.bulk")}>
            <span className="cl-bulk__count" aria-live="polite">
              {t("testCase.list.selected", { count: selected.size })}
              {offPage > 0 && <span className="cl-bulk__off"> · {t("testCase.list.offPage", { count: offPage })}</span>}
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
              minWidth={view === "desktop" ? 1020 : 720}
              empty={
                <div className="cl-nomatch">
                  <p>{t("testCase.list.noMatch")}</p>
                  {filtered && (
                    <button
                      type="button"
                      className="ui-btn ui-btn--small"
                      onClick={() => onFiltersChange(EMPTY_FILTERS)}
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
        >
          {/* What goes, listed: cases on other pages included. */}
          <p className="cl-delete-list">
            {selectedKeys.slice(0, 12).join(", ")}
            {selectedKeys.length > 12 && ` ${t("testCase.list.andMore", { count: selectedKeys.length - 12 })}`}
          </p>
        </ConfirmDialog>
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
  groups,
}: {
  filters: CaseFilters;
  onChange: (f: CaseFilters) => void;
  priorityOptions: { value: string; label: string; description: string }[];
  levelOptions: { value: GherkinLevel; label: string }[];
  /** Type, automation and custom field filters (FLD-01). */
  groups: {
    label: string;
    key: "caseTypes" | "automation" | "custom";
    options: { value: string; label: string; description?: string }[];
  }[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active =
    filters.priorities.size +
    filters.levels.size +
    filters.caseTypes.size +
    filters.automation.size +
    filters.custom.size;
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
          {groups.map((g) => (
            <Fragment key={g.key}>
              <MenuLabel>{g.label}</MenuLabel>
              {g.options.map((o) => (
                <MenuCheckItem
                  key={o.value}
                  checked={(filters[g.key] as ReadonlySet<string>).has(o.value)}
                  onToggle={() =>
                    onChange({
                      ...filters,
                      [g.key]: toggle(
                        filters[g.key] as ReadonlySet<string>,
                        o.value,
                      ),
                    })
                  }
                  description={o.description}
                >
                  {o.label}
                </MenuCheckItem>
              ))}
            </Fragment>
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
