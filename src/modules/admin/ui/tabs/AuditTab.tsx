import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Bot, Download, Search, Settings2, User, X } from "lucide-react";
import { useAuth } from "@modules/auth";
import { DataTable, type DataColumn } from "@shared/ui/DataTable";
import { DatePicker } from "@shared/ui/DatePicker";
import { FilterMenuButton } from "@shared/ui/FilterMenuButton";
import { LoadError } from "@shared/ui/LoadError";
import { ReportedError } from "@shared/ui/notify";
import { MenuItem, ResponsiveMenu } from "@shared/ui/Menu";
import { Pagination } from "@shared/ui/Pagination";
import { Select } from "@shared/ui/Select";
import { useToast } from "@shared/ui/Toast";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { usePopover } from "@shared/ui/usePopover";
import { auditApi } from "../../api/auditApi";
import { exportRows, fetchAll, saveAuditCsv, saveAuditXlsx, type AuditExportLabels } from "../../export/auditExport";
import {
  AUDIT_PAGE_SIZE,
  AUDIT_PERIODS,
  activeFilterCount,
  brokenEventIds,
  changedFields,
  filtersFromParams,
  filtersToParams,
  parseActor,
  summaryEntries,
  toQuery,
  type AuditChain,
  type AuditFacets,
  type AuditFilters,
  type AuditPage,
  type AuditPeriod,
  type AuditRow,
  type AuditVerify,
} from "../../model/audit";
import { ActionPill } from "../audit/ActionPill";
import { AuditDetail } from "../audit/AuditDetail";
import { AuditIntegrity } from "../audit/AuditIntegrity";
import { useAuditLabels, type AuditLabels } from "../audit/useAuditLabels";
import "../audit/Audit.css";

const errorText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));

function ActorCell({ actor, onBehalfOf, labels }: { actor: string; onBehalfOf: string | null; labels: AuditLabels }) {
  const { t } = useTranslation();
  const kind = parseActor(actor).kind;
  const Icon = kind === "agent" ? Bot : kind === "system" || kind === "ci" ? Settings2 : User;
  return (
    <span className="aud-who">
      <span className={`aud-av aud-av--${kind}`} aria-hidden="true">
        <Icon size={14} />
      </span>
      <span className="aud-who__text">
        <span>{labels.actor(actor)}</span>
        {onBehalfOf ? (
          <small>{t("admin.audit.onBehalfOf", { name: labels.actor(onBehalfOf) })}</small>
        ) : labels.isMe(actor) ? (
          <small>{t("admin.audit.actor.you")}</small>
        ) : null}
      </span>
    </span>
  );
}

/** «Estado, Prioridad, Pasos», «9 campos», or the counts of an import. */
function changesText(row: AuditRow, labels: AuditLabels, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (row.redactedAt) return t("admin.audit.redacted");
  const fields = changedFields(row);
  if (fields.length > 3) return t("admin.audit.fieldCount", { count: fields.length });
  if (fields.length > 0) return fields.map(labels.field).join(", ");
  return summaryEntries(row.summary)
    .filter(([, v]) => typeof v === "number" || typeof v === "string")
    .slice(0, 3)
    .map(([k, v]) => `${t(`admin.audit.summary.${k}`, { defaultValue: k })}: ${String(v)}`)
    .join(" · ");
}

/**
 * Administración › Auditoría (AUD-01, ADR-0015): the audit log of the account,
 * newest first, with filters in the URL (period, who, element, action,
 * project, key), the detail of each event (before and after), the check of
 * the hash chains, and the export of what is filtered. Desktop and web: the
 * desktop reads its local log, the web the account's events on the server.
 * Until TEN-01 applies roles, every account sees its own events.
 */
export function AuditTab() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const mobile = useBreakpoint() === "mobile";
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const userId = user?.id ?? "";

  const [facets, setFacets] = useState<AuditFacets | null>(null);
  const [page, setPage] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verify, setVerify] = useState<AuditVerify | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState<AuditRow | null>(null);
  const [search, setSearch] = useState(filters.search);
  const [exporting, setExporting] = useState(false);
  const [reload, setReload] = useState(0);
  const exportMenu = usePopover(mobile ? "dialog" : "menu");

  const labels = useAuditLabels(facets?.thisDevice ?? verify?.thisDevice ?? "");
  const broken = useMemo(() => brokenEventIds(verify), [verify]);

  const apply = useCallback(
    (next: Partial<AuditFilters>, keepPage = false) => {
      const merged: AuditFilters = { ...filters, ...next, page: keepPage ? (next.page ?? filters.page) : 1 };
      setParams(filtersToParams(merged), { replace: true });
    },
    [filters, setParams],
  );

  // The search box applies after a short pause.
  useEffect(() => setSearch(filters.search), [filters.search]);
  useEffect(() => {
    if (search === filters.search) return;
    const id = setTimeout(() => apply({ search }), 300);
    return () => clearTimeout(id);
  }, [search, filters.search, apply]);

  const check = useCallback(async () => {
    if (!userId) return;
    setChecking(true);
    setVerifyError(null);
    try {
      setVerify(await auditApi.verify(userId));
    } catch (e) {
      setVerifyError(errorText(e));
    } finally {
      setChecking(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void check();
    auditApi.facets(userId).then(setFacets, () => setFacets(null));
  }, [userId, check]);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    setLoading(true);
    setLoadError(null);
    auditApi.list(userId, toQuery(filters, new Date())).then(
      (p) => {
        if (!live) return;
        setPage(p);
        setLoading(false);
      },
      (e: unknown) => {
        if (!live) return;
        setLoadError(errorText(e));
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [userId, filters, reload]);

  const showHistory = (entityId: string) => {
    setOpen(null);
    apply({ entityId, period: "all", actors: [], entities: [], actions: [], projects: [], search: "" });
  };
  const showBroken = (c: AuditChain) => c.broken?.entityId && showHistory(c.broken.entityId);

  const exportLabels = (): AuditExportLabels => ({
    sheet: t("admin.audit.export.sheet"),
    headers: [
      t("admin.audit.export.cols.at"),
      t("admin.audit.cols.who"),
      t("admin.audit.export.cols.onBehalfOf"),
      t("admin.audit.cols.action"),
      t("admin.audit.export.cols.type"),
      t("admin.audit.export.cols.key"),
      t("admin.audit.filters.project"),
      t("admin.audit.detail.field"),
      t("admin.audit.detail.before"),
      t("admin.audit.detail.after"),
      t("admin.audit.cols.origin"),
      t("admin.audit.export.cols.seq"),
      t("admin.audit.export.cols.hash"),
    ],
    actor: labels.actor,
    action: labels.action,
    entity: labels.entity,
    device: labels.device,
    field: labels.field,
    redacted: t("admin.audit.redacted"),
    integrity: {
      sheet: t("admin.audit.export.integritySheet"),
      checkedAt: t("admin.audit.export.checkedAt"),
      headers: [
        t("admin.audit.integrity.cols.chain"),
        t("admin.audit.export.cols.owner"),
        t("admin.audit.integrity.cols.events"),
        t("admin.audit.integrity.cols.last"),
        t("admin.audit.integrity.cols.state"),
      ],
      ok: t("admin.audit.integrity.chainOk"),
      broken: labels.chainBreak,
    },
  });

  const runExport = async (format: "xlsx" | "csv") => {
    if (!userId || exporting) return;
    setExporting(true);
    try {
      const { events, capped } = await fetchAll((q) => auditApi.list(userId, q), toQuery(filters, new Date()));
      const l = exportLabels();
      const rows = exportRows(events, l);
      const now = new Date();
      const name = `pharos-auditoria-${now.toISOString().slice(0, 10)}.${format}`;
      const path = format === "csv" ? await saveAuditCsv(name, rows) : await saveAuditXlsx(name, rows, verify, l, now);
      if (path) toast(t("downloads.saved", { path }));
      if (capped) toast(t("admin.audit.export.capped", { count: events.length }), "warning");
    } catch (e) {
      // saveFile already told the user about a failed save.
      if (!(e instanceof ReportedError)) toast(t("admin.audit.export.failed", { reason: errorText(e) }), "error");
    } finally {
      setExporting(false);
    }
  };

  const when = (at: string) => {
    const d = new Date(at);
    return (
      <span className="aud-when">
        <time dateTime={at}>{d.toLocaleString(i18n.language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
      </span>
    );
  };

  const element = (row: AuditRow) => (
    <button type="button" className="aud-open" onClick={() => setOpen(row)} data-testid={`audit-row-${row.id}`}>
      <span className="aud-open__key">
        {broken.has(row.id) && <span className="aud-bad">⚠ </span>}
        {row.entityKey ?? labels.entity(row.entity)}
      </span>
      <small>
        {labels.entity(row.entity)}
        {row.projectName ? ` · ${row.projectName}` : ""}
      </small>
    </button>
  );

  const columns: DataColumn<AuditRow>[] = [
    { id: "when", header: t("admin.audit.cols.when"), cell: (r) => when(r.at), width: "minmax(110px, 0.8fr)" },
    {
      id: "who",
      header: t("admin.audit.cols.who"),
      cell: (r) => <ActorCell actor={r.actor} onBehalfOf={r.onBehalfOf} labels={labels} />,
      width: "minmax(150px, 1.3fr)",
    },
    {
      id: "action",
      header: t("admin.audit.cols.action"),
      cell: (r) => <ActionPill action={r.action} label={labels.action(r.action)} />,
      width: "minmax(100px, 0.7fr)",
    },
    { id: "element", header: t("admin.audit.cols.element"), cell: element, width: "minmax(170px, 1.6fr)" },
    {
      id: "changes",
      header: t("admin.audit.cols.changes"),
      cell: (r) => <span className="aud-changes">{changesText(r, labels, t)}</span>,
      width: "minmax(140px, 1.4fr)",
      minView: "desktop",
    },
    {
      id: "origin",
      header: t("admin.audit.cols.origin"),
      cell: (r) => <span className="aud-muted">{labels.device(r.deviceId)}</span>,
      width: "minmax(90px, 0.6fr)",
      minView: "tablet",
    },
  ];

  const mobileCard = (r: AuditRow) => (
    <div className="aud-card">
      <div className="aud-card__top">
        <ActionPill action={r.action} label={labels.action(r.action)} />
        {when(r.at)}
      </div>
      {element(r)}
      <span className="aud-muted">
        {labels.actor(r.actor)} · {labels.device(r.deviceId)}
      </span>
    </div>
  );

  const periodOptions = AUDIT_PERIODS.map((p) => ({ value: p, label: t(`admin.audit.period.${p}`) }));
  const opt = (values: string[], label: (v: string) => string) => values.map((v) => ({ value: v, label: label(v) }));
  const projectOptions = (facets?.projects ?? []).map((p) => ({ value: p.id, label: p.name ?? t("admin.audit.projectGone") }));
  const count = activeFilterCount(filters);

  return (
    <div className="adm-stack aud" data-testid="audit-tab">
      <AuditIntegrity
        verify={verify}
        checking={checking}
        error={verifyError}
        labels={labels}
        onCheck={() => void check()}
        onShowEvent={showBroken}
      />

      <section className="adm-card aud-list" aria-label={t("admin.audit.listLabel")}>
        <div className="aud-filters">
          <Select<AuditPeriod>
            value={filters.period}
            onChange={(period) => apply({ period })}
            options={periodOptions}
            aria-label={t("admin.audit.filters.period")}
            data-testid="audit-period"
          />
          {filters.period === "custom" && (
            <>
              <DatePicker
                value={filters.from}
                max={filters.to || undefined}
                onChange={(from) => apply({ from })}
                aria-label={t("admin.audit.filters.from")}
              />
              <DatePicker
                value={filters.to}
                min={filters.from || undefined}
                onChange={(to) => apply({ to })}
                aria-label={t("admin.audit.filters.to")}
              />
            </>
          )}
          <FilterMenuButton
            label={t("admin.audit.filters.who")}
            options={opt(facets?.actors ?? [], labels.actor)}
            selected={new Set(filters.actors)}
            onChange={(s) => apply({ actors: [...s] })}
          />
          <FilterMenuButton
            label={t("admin.audit.filters.element")}
            options={opt(facets?.entities ?? [], labels.entity)}
            selected={new Set(filters.entities)}
            onChange={(s) => apply({ entities: [...s] })}
          />
          <FilterMenuButton
            label={t("admin.audit.filters.action")}
            options={opt(facets?.actions ?? [], labels.action)}
            selected={new Set(filters.actions)}
            onChange={(s) => apply({ actions: [...s] })}
          />
          <FilterMenuButton
            label={t("admin.audit.filters.project")}
            options={projectOptions}
            selected={new Set(filters.projects)}
            onChange={(s) => apply({ projects: [...s] })}
          />
          <label className="aud-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              className="adm-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.audit.filters.searchPlaceholder")}
              aria-label={t("admin.audit.filters.search")}
              data-testid="audit-search"
            />
          </label>
          <button
            type="button"
            className="ui-btn ui-btn--small aud-export"
            {...exportMenu.triggerProps}
            onClick={() => exportMenu.setOpen((o) => !o)}
            disabled={exporting || !page || page.total === 0}
            data-testid="audit-export"
          >
            <Download size={16} aria-hidden="true" />
            {exporting ? t("admin.audit.export.working") : t("admin.audit.export.button")}
          </button>
          <ResponsiveMenu
            open={exportMenu.open}
            onClose={exportMenu.close}
            anchorRef={exportMenu.anchorRef}
            id={exportMenu.id}
            label={t("admin.audit.export.button")}
            title={t("admin.audit.export.button")}
            placement="bottom-end"
          >
            <MenuItem onSelect={() => void runExport("xlsx")} testId="audit-export-xlsx">
              {t("admin.audit.export.xlsx")}
            </MenuItem>
            <MenuItem onSelect={() => void runExport("csv")} testId="audit-export-csv">
              {t("admin.audit.export.csv")}
            </MenuItem>
          </ResponsiveMenu>
        </div>

        {(count > 0 || filters.entityId) && (
          <div className="aud-active">
            {filters.entityId && <span className="aud-muted">{t("admin.audit.filters.oneElement")}</span>}
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--small"
              onClick={() =>
                apply({ actors: [], entities: [], actions: [], projects: [], search: "", entityId: "" })
              }
            >
              <X size={14} aria-hidden="true" />
              {t("admin.audit.filters.clear")}
            </button>
          </div>
        )}

        {loadError ? (
          <LoadError message={t("admin.audit.loadError", { reason: loadError })} onRetry={() => setReload((n) => n + 1)} />
        ) : (
          <div aria-busy={loading || undefined}>
            <DataTable
              rows={page?.events ?? []}
              columns={columns}
              getRowId={(r) => r.id}
              label={t("admin.audit.listLabel")}
              rowTone={(r) => (broken.has(r.id) ? "gap" : undefined)}
              mobileCard={mobileCard}
              minWidth={760}
              empty={
                <p className="adm-hint aud-emptylist">
                  {loading ? t("admin.audit.loading") : count > 0 || filters.period !== "all" ? t("admin.audit.emptyFiltered") : t("admin.audit.empty")}
                </p>
              }
            />
            {page && (
              <Pagination
                page={filters.page}
                pageSize={AUDIT_PAGE_SIZE}
                total={page.total}
                onPageChange={(p) => apply({ page: p }, true)}
                summary={({ from, to, total }) => t("admin.audit.range", { from, to, total })}
              />
            )}
          </div>
        )}
      </section>

      {open && (
        <AuditDetail
          row={open}
          broken={broken.has(open.id)}
          labels={labels}
          onClose={() => setOpen(null)}
          onHistory={(r) => showHistory(r.entityId)}
        />
      )}
    </div>
  );
}
