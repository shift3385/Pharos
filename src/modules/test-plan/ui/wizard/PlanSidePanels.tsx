import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownUp, ChevronDown, FileSpreadsheet, FileText, FileUp, X } from "lucide-react";
import { Dialog } from "@shared/ui/Dialog";
import { MenuItem, MenuLabel, MenuSeparator, ResponsiveMenu } from "@shared/ui/Menu";
import { StatusPill } from "@shared/ui/StatusPill";
import { usePopover } from "@shared/ui/usePopover";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { PLAN_STATUS_TONE } from "../../model/review";
import type { PlanApproval, TestPlan } from "../../model/types";
import { RevisionHistory } from "../RevisionHistory";
import { PlanReviewControls } from "./PlanReviewControls";
import { PlanTimeline } from "./PlanTimeline";


/** «Estado del plan» and the latest revisions, next to the form (or below it
 *  when they do not fit). Who approved and when (PLN-07), marked when it was
 *  a self-approval; the review actions of a saved plan (PLN-08). */
export function PlanStatusPanel({
  plan,
  status,
  version,
  author,
  updated,
  onShowRevisions,
  approval,
  dirty,
  onReviewed,
}: {
  plan: TestPlan | null;
  status: string;
  version: string;
  author: string;
  /** Formatted last save, or null before the first one. */
  updated: string | null;
  onShowRevisions: () => void;
  /** Who approved and when, while «Aprobado». */
  approval: PlanApproval | null;
  /** Unsaved changes: the review actions wait for the save. */
  dirty: boolean;
  /** The plan after a review transition. */
  onReviewed: (saved: TestPlan) => void;
}) {
  const { t, i18n } = useTranslation();
  const approvedAt = approval
    ? (() => {
        const d = new Date(approval.at);
        return Number.isNaN(d.getTime())
          ? approval.at
          : new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" }).format(d);
      })()
    : null;
  return (
    <aside className="tpw-side" aria-label={t("testPlan.panel.title")}>
      <section className="tpw-card" aria-labelledby="tpw-status-title">
        <h3 id="tpw-status-title" className="tpw-card__title">
          {t("testPlan.panel.title")}
        </h3>
        <dl className="tpw-facts">
          <dt>{t("testPlan.panel.status")}</dt>
          <dd>
            <StatusPill tone={PLAN_STATUS_TONE[status] ?? "neutral"} dot strike={status === "obsolete"}>
              {t(`testPlan.statusLabel.${status}`)}
            </StatusPill>
          </dd>
          <dt>{t("testPlan.panel.version")}</dt>
          <dd className="t-id">v{version}</dd>
          {status === "approved" && approval && (
            <>
              <dt className="tpw-facts__full">{t("testPlan.approval.by")}</dt>
              {/* Never cut (FIX-40) and the name never broken (FIX-44): the
                  name keeps its line, «aprobación propia» goes on the next. */}
              <dd className="tpw-facts__wrap" data-testid="plan-approved-by">
                <span className="tpw-facts__name">{approval.byName.replace(/ /g, "\u00a0")}</span>
                {approval.selfApproved && (
                  <span className="tpw-facts__note">
                    <span className="sr-only"> · </span>
                    {t("testPlan.review.banner.selfApproved")}
                  </span>
                )}
              </dd>
              <dt>{t("testPlan.approval.at")}</dt>
              <dd>{approvedAt}</dd>
            </>
          )}
          <dt>{t("testPlan.panel.author")}</dt>
          <dd className="u-truncate" title={author}>
            {author || "—"}
          </dd>
          <dt>{t("testPlan.panel.updated")}</dt>
          <dd>{updated ?? "—"}</dd>
        </dl>
        {plan && <PlanReviewControls plan={plan} dirty={dirty} onChanged={onReviewed} />}
      </section>
      {plan && (
        <section className="tpw-card" aria-labelledby="tpw-revs-title">
          <div className="tpw-card__head">
            <h3 id="tpw-revs-title" className="tpw-card__title">
              {t("testPlan.timeline.title")}
            </h3>
            {/* The revision copies, to restore one. */}
            <button type="button" className="tpw-link" onClick={onShowRevisions}>
              {t("testPlan.revisions")}
            </button>
          </div>
          {/* Re-read on each save (a new plan object). */}
          <PlanTimeline plan={plan} />
        </section>
      )}
    </aside>
  );
}

/** Every revision, with «Restaurar», in a dialog. */
export function RevisionsDialog({
  planId,
  onRestore,
  onClose,
}: {
  planId: string;
  onRestore: (revisionId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <Dialog labelledBy={titleId} onClose={onClose} className="cd tpw-revs-dialog">
      <div className="tpw-revs-dialog__head">
        <h3 id={titleId} className="cd__title">
          {t("testPlan.revisions")}
        </h3>
        <button
          type="button"
          className="tpw-icon-btn"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <RevisionHistory planId={planId} onRestore={onRestore} />
    </Dialog>
  );
}

/** One «Importar / Exportar» button with a sectioned menu (SPEC §8): import
 *  .xlsx; export .pdf and .xlsx. A sheet on mobile. */
export function PlanIoMenu({
  onImport,
  onExportPdf,
  onExportXlsx,
  exportHistory,
}: {
  onImport: () => void;
  onExportPdf: () => void;
  onExportXlsx: () => void;
  /** The project's «Historial en el plan exportado» (PLN-02), named at the
   *  menu's foot so the person knows what the document carries. */
  exportHistory: "current" | "revisions";
}) {
  const { t } = useTranslation();
  const mobile = useBreakpoint() === "mobile";
  const menu = usePopover(mobile ? "dialog" : "menu");
  const title = t("testPlan.io.button");
  return (
    <>
      <button type="button" className="header-action" data-natural="" {...menu.triggerProps}>
        <ArrowDownUp size={16} aria-hidden="true" />
        <span className="header-action__label">{title}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <ResponsiveMenu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={title}
        title={title}
        placement="bottom-end"
        className="tpw-io-menu"
      >
        <MenuLabel>{t("testPlan.io.import")}</MenuLabel>
        <MenuItem icon={FileUp} onSelect={onImport} description={t("testPlan.io.importXlsxDesc")}>
          {t("testPlan.io.importXlsx")}
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>{t("testPlan.io.export")}</MenuLabel>
        <MenuItem icon={FileText} onSelect={onExportPdf} description={t("testPlan.io.exportPdfDesc")}>
          {t("testPlan.io.exportPdf")}
        </MenuItem>
        <MenuItem icon={FileSpreadsheet} onSelect={onExportXlsx} description={t("testPlan.io.exportXlsxDesc")}>
          {t("testPlan.io.exportXlsx")}
        </MenuItem>
        <MenuSeparator />
        <div className="tpw-io-menu__foot" role="presentation" data-testid="plan-io-history">
          {t("testPlan.io.history", { mode: t(`testPlan.historyMode.${exportHistory}`) })}
        </div>
      </ResponsiveMenu>
    </>
  );
}
