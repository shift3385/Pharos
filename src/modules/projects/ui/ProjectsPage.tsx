import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import {
  AArrowDown,
  Bug,
  CalendarClock,
  ChartNoAxesColumn,
  ChevronRight,
  Clock,
  Download,
  Ellipsis,
  Flag,
  FolderOpen,
  GitFork,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { useAuth } from "@modules/auth";
import { FieldMessage } from "@shared/ui/FormField";
import { controlProps } from "@shared/ui/fieldProps";
import { required } from "@shared/validation";
import { DataTable, type DataColumn } from "@shared/ui/DataTable";
import { Pagination } from "@shared/ui/Pagination";
import { FilterChips } from "@shared/ui/FilterChips";
import { StatusPill } from "@shared/ui/StatusPill";
import { SortMenu, type SortDirection, type SortOption } from "@shared/ui/SortMenu";
import { MenuItem, ResponsiveMenu } from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { projectApi } from "../api/projectApi";
import { projectPath } from "../model/sections";
import { projectRows } from "../model/projectRows";
import {
  PAGE_SIZES,
  UNAVAILABLE_SORTS,
  coverageTone,
  filterProjects,
  formatAccess,
  paginate,
  planTone,
  prefixBadge,
  recentProjects,
  sortProjects,
  type ProjectRow,
  type ProjectSort,
} from "../model/projectTable";
import { useProjectExport } from "./useProjectExport";
import "./ProjectHeader.css";
import "./Projects.css";

const SORT_ICONS = {
  access: Clock,
  name: AArrowDown,
  updated: CalendarClock,
  closure: Flag,
  execution: ChartNoAxesColumn,
  coverage: GitFork,
  defects: Bug,
} as const;

/** Route `/projects`. Old links may still carry `?open=<id>`: a project now
 *  has its own URL (ADR-0029), so they redirect there without loading the list. */
export function ProjectsPage() {
  const [params] = useSearchParams();
  const openParam = params.get("open");
  if (openParam) return <Navigate to={projectPath(openParam)} replace />;
  return <ProjectList />;
}

/** Proyectos (SPEC §8, ScrProyectos): the 4 recent projects, then every
 *  project in a table with search, filters, order and pages. */
function ProjectList() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const navigate = useNavigate();
  const mobile = useBreakpoint() === "mobile";
  // Home links here with ?new=1 to start one.
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [creating, setCreating] = useState(() => params.get("new") === "1");
  const { exportAll, exportProject, busy, progressModal } = useProjectExport();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: ProjectSort; dir: SortDirection }>({
    key: "access",
    dir: "desc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  // The link did its job; drop it so a reload or "back" shows the list.
  useEffect(() => {
    if (params.has("new")) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportRow(row: ProjectRow) {
    const project = await projectApi.get(row.id, ownerId);
    if (project) await exportProject(project);
  }

  async function refresh() {
    setRows(await projectRows(ownerId));
  }
  useEffect(() => {
    void refresh();
    // Reload the list when a sync pulls remote changes.
    const onSynced = () => void refresh();
    window.addEventListener("pharos:synced", onSynced);
    return () => window.removeEventListener("pharos:synced", onSynced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  // A blank name is explained (and announced) instead of a disabled button.
  const [nameTried, setNameTried] = useState(false);
  const nameIssue = nameTried ? required(name) : null;

  async function create() {
    const trimmed = name.trim();
    setNameTried(true);
    if (!trimmed) return;
    setNameTried(false);
    const project = await projectApi.create({ name: trimmed, ownerId });
    setName("");
    setCreating(false);
    if (project) navigate(projectPath(project.id));
    else await refresh();
  }

  const lang = i18n.resolvedLanguage ?? "es";
  const access = (row: ProjectRow) =>
    row.lastAccess
      ? formatAccess(row.lastAccess, lang, {
          today: t("projects.list.today"),
          yesterday: t("projects.list.yesterday"),
        })
      : t("projects.list.never");
  const planLabel = (row: ProjectRow) =>
    row.planStatus ? t(`testPlan.statusLabel.${row.planStatus}`) : t("projects.header.plan.none");
  const pct = (ratio: number) => Math.round(ratio * 100);

  const all = rows ?? [];
  const recent = useMemo(() => recentProjects(rows ?? []), [rows]);
  const sorted = useMemo(
    () => sortProjects(filterProjects(rows ?? [], query), sort.key, sort.dir),
    [rows, query, sort],
  );
  const shown = paginate(sorted, page, pageSize);
  const anyCloseDate = all.some((r) => r.closeDate);

  const sortOptions: SortOption<ProjectSort>[] = (Object.keys(SORT_ICONS) as ProjectSort[]).map(
    (key) => {
      const unavailable = UNAVAILABLE_SORTS.has(key) || (key === "closure" && !anyCloseDate);
      return {
        value: key,
        label: t(`projects.list.sort.${key}`),
        icon: SORT_ICONS[key],
        disabled: unavailable,
        title: unavailable ? t(`projects.list.sortSoon.${key}`) : undefined,
      };
    },
  );

  const executedCell = () => (
    <span className="pj-muted" title={t("projects.list.executedSoon")}>
      —
    </span>
  );

  const columns: DataColumn<ProjectRow>[] = [
    {
      id: "project",
      header: t("projects.list.col.project"),
      width: "minmax(0,2.4fr)",
      cell: (row) => (
        <Link to={projectPath(row.id)} className="pj-row__link">
          <Badge prefix={row.caseIdPrefix} size="sm" />
          <span className="pj-row__name u-truncate" title={row.name}>
            {row.name}
          </span>
        </Link>
      ),
    },
    {
      id: "plan",
      header: t("projects.list.col.plan"),
      width: "minmax(0,1.1fr)",
      cell: (row) => (
        <StatusPill tone={planTone(row.planStatus)} dot strike={row.planStatus === "obsolete"}>
          {planLabel(row)}
        </StatusPill>
      ),
    },
    {
      id: "cases",
      header: t("projects.list.col.cases"),
      width: "72px",
      align: "end",
      cell: (row) => <span className="pj-num">{row.cases}</span>,
    },
    {
      id: "executed",
      header: t("projects.list.col.executed"),
      width: "minmax(0,1fr)",
      minView: "desktop",
      cell: executedCell,
    },
    {
      id: "coverage",
      header: t("projects.list.col.coverage"),
      width: "96px",
      align: "end",
      cell: (row) =>
        row.coverage === null ? (
          <span className="pj-muted" title={t("projects.list.noRequirements")}>
            —
          </span>
        ) : (
          <span className="pj-num pj-coverage" data-tone={coverageTone(row.coverage)}>
            {t("projects.list.percent", { value: pct(row.coverage) })}
          </span>
        ),
    },
    {
      id: "access",
      header: t("projects.list.col.access"),
      width: "112px",
      cell: (row) => <span className="pj-meta">{access(row)}</span>,
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("projects.list.col.actions")}</span>,
      width: "40px",
      align: "end",
      cell: (row) => (
        <RowMenu
          row={row}
          onOpen={() => navigate(projectPath(row.id))}
          onSettings={() => navigate(projectPath(row.id, "settings"))}
          onExport={() => void exportRow(row)}
          disabled={busy}
        />
      ),
    },
  ];

  const mobileCard = (row: ProjectRow) => (
    <Link to={projectPath(row.id)} className="pj-card">
      <Badge prefix={row.caseIdPrefix} />
      <span className="pj-card__body">
        <span className="pj-card__name u-truncate" title={row.name}>
          {row.name}
        </span>
        <span className="pj-card__meta">
          <span className="pj-dot" data-tone={planTone(row.planStatus)} aria-hidden="true" />
          <span className="u-truncate">
            {[planLabel(row), t("projects.list.executedShort"), access(row)].join(" · ")}
          </span>
        </span>
      </span>
      <ChevronRight size={16} className="pj-card__chevron" aria-hidden="true" />
    </Link>
  );

  return (
    <section className="pj-page">
      <header className="pj-page__head">
        <div className="pj-page__titles">
          <h1 className="pj-page__title">{t("projects.title")}</h1>
          <p className="pj-page__subtitle">{t("projects.subtitle")}</p>
        </div>
        <div className="pj-page__actions">
          {all.length > 0 && (
            <button
              type="button"
              className="pj-action"
              onClick={() => void exportAll()}
              disabled={busy}
            >
              <Download size={16} aria-hidden="true" />
              <span className="pj-action__label">
                {busy ? t("projects.exporting") : t("projects.exportAll")}
              </span>
            </button>
          )}
          <button className="pj-primary" type="button" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" />
            <span className="pj-action__label">{t("projects.new")}</span>
          </button>
        </div>
      </header>

      {creating && (
        <div className="pj-create">
          <input
            {...controlProps("pj-new-name", nameIssue)}
            className="pj-input"
            aria-label={t("projects.namePlaceholder")}
            autoFocus
            value={name}
            placeholder={t("projects.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button type="button" className="pj-primary" onClick={create}>
            {t("projects.create")}
          </button>
          <button
            type="button"
            className="pj-action"
            onClick={() => {
              setCreating(false);
              setName("");
              setNameTried(false);
            }}
          >
            {t("common.cancel")}
          </button>
          {nameIssue && (
            <span role="alert" className="pj-create__msg">
              <FieldMessage id="pj-new-name-msg" issue={nameIssue} />
            </span>
          )}
        </div>
      )}

      {rows === null ? (
        <p className="pj-muted">{t("common.loading")}</p>
      ) : all.length === 0 ? (
        !creating && <p className="pj-empty">{t("projects.empty")}</p>
      ) : (
        <>
          {recent.length > 0 && (
            <section className="pj-recent" aria-labelledby="pj-recent-title">
              <div className="pj-section-head">
                <h2 id="pj-recent-title" className="pj-section-title">
                  {t("projects.list.recentTitle")}
                </h2>
                <span className="pj-muted">{t("projects.list.recentHint", { count: recent.length })}</span>
              </div>
              <ul className="pj-recent__grid">
                {recent.map((row) => (
                  <li key={row.id}>
                    <Link to={projectPath(row.id)} className="pj-recent__card">
                      <span className="pj-recent__top">
                        <Badge prefix={row.caseIdPrefix} />
                        <span className="pj-recent__titles">
                          <span className="pj-recent__name u-truncate" title={row.name}>
                            {row.name}
                          </span>
                          <span className="pj-meta">{access(row)}</span>
                        </span>
                      </span>
                      <span className="pj-recent__exec" title={t("projects.list.executedSoon")}>
                        <span className="pj-recent__exec-row">
                          <span>{t("projects.list.col.executed")}</span>
                          <span className="pj-num">—</span>
                        </span>
                        <span className="pj-bar" aria-hidden="true" />
                      </span>
                      <span className="pj-recent__foot">
                        <StatusPill
                          tone={planTone(row.planStatus)}
                          dot
                          strike={row.planStatus === "obsolete"}
                        >
                          {t(`projects.header.plan.${row.planStatus ?? "none"}`)}
                        </StatusPill>
                        {row.coverage !== null && (
                          <span className="pj-coverage" data-tone={coverageTone(row.coverage)}>
                            {t("projects.list.coverageShort", { value: pct(row.coverage) })}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="pj-all" aria-labelledby="pj-all-title">
            <div className="pj-all__toolbar">
              <div className="pj-all__heading">
                <h2 id="pj-all-title" className="pj-section-title">
                  {t("projects.list.allTitle")}
                </h2>
                <span className="pj-count">{all.length}</span>
              </div>
              <label className="pj-search">
                <Search size={15} aria-hidden="true" />
                <span className="sr-only">{t("projects.list.search")}</span>
                <input
                  type="search"
                  value={query}
                  placeholder={t("projects.list.search")}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <FilterChips
                label={t("projects.list.filterLabel")}
                value="all"
                onChange={() => {}}
                options={[
                  { value: "all", label: t("projects.list.filter.all"), count: all.length },
                  {
                    value: "active",
                    label: t("projects.list.filter.active"),
                    disabled: true,
                    title: t("projects.list.filterSoon"),
                  },
                  {
                    value: "closed",
                    label: t("projects.list.filter.closed"),
                    disabled: true,
                    title: t("projects.list.filterSoon"),
                  },
                ]}
              />
              {!mobile && (
                <SortMenu<ProjectSort>
                  options={sortOptions}
                  value={sort.key}
                  direction={sort.dir}
                  onChange={(key, dir) => {
                    setSort({ key, dir });
                    setPage(1);
                  }}
                />
              )}
            </div>
            <DataTable
              rows={shown.rows}
              columns={columns}
              getRowId={(r) => r.id}
              label={t("projects.list.allTitle")}
              mobileCard={mobileCard}
              minWidth={720}
              className="pj-table"
              empty={<p className="pj-muted">{t("projects.list.noMatch", { query: query.trim() })}</p>}
            />
            {sorted.length > 0 && (
              <Pagination
                className="pj-pagination"
                page={shown.page}
                pageSize={pageSize}
                total={sorted.length}
                onPageChange={setPage}
                pageSizes={PAGE_SIZES}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                summary={({ from, to, total }) => (
                  <Trans
                    i18nKey="projects.list.summary"
                    values={{ from, to, total }}
                    components={{ b: <b /> }}
                  />
                )}
              />
            )}
          </section>
        </>
      )}

      {progressModal}
    </section>
  );
}

/** The prefix as a badge (mono, navy-100), hidden from assistive tech: the
 *  name next to it says the same. */
function Badge({ prefix, size }: { prefix: string; size?: "sm" }) {
  const text = prefixBadge(prefix);
  return (
    <span className="pj-badge t-id" data-size={size} aria-hidden="true">
      {text || <FolderOpen size={16} />}
    </span>
  );
}

/** «⋯» on a table row: open, settings, export the ZIP. */
function RowMenu({
  row,
  onOpen,
  onSettings,
  onExport,
  disabled,
}: {
  row: ProjectRow;
  onOpen: () => void;
  onSettings: () => void;
  onExport: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const mobile = useBreakpoint() === "mobile";
  const menu = usePopover(mobile ? "dialog" : "menu");
  const label = t("projects.list.rowMenu", { name: row.name });
  return (
    <>
      <button
        type="button"
        className="pj-icon-btn"
        aria-label={label}
        title={t("projects.list.moreActions")}
        {...menu.triggerProps}
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      <ResponsiveMenu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={label}
        title={row.name}
        placement="bottom-end"
      >
        <MenuItem icon={FolderOpen} onSelect={onOpen}>
          {t("projects.list.open")}
        </MenuItem>
        <MenuItem icon={Settings} onSelect={onSettings}>
          {t("projects.tab.settings")}
        </MenuItem>
        <MenuItem icon={Download} onSelect={onExport} disabled={disabled}>
          {t("projects.exportProject")}
        </MenuItem>
      </ResponsiveMenu>
    </>
  );
}
