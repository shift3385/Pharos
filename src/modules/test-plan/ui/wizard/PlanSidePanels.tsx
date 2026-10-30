import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownUp, ChevronDown, FileSpreadsheet, FileText, FileUp, History, X } from "lucide-react";
import { Dialog } from "@shared/ui/Dialog";
import { MenuItem, MenuLabel, MenuSeparator, ResponsiveMenu } from "@shared/ui/Menu";
import { StatusPill } from "@shared/ui/StatusPill";
import { usePopover } from "@shared/ui/usePopover";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import type { TestPlan } from "../../model/types";
import { RevisionHistory } from "../RevisionHistory";

const STATUS_TONE: Record<string, "neutral" | "info" | "success"> = {
  draft: "neutral",
  reviewed: "info",
  approved: "success",
  obsolete: "neutral",
};

/** «Estado del plan» and the latest revisions, next to the form (or below it
 *  when they do not fit). */
export function PlanStatusPanel({
  plan,
  status,
  version,
  author,
  updated,
  onShowRevisions,
}: {
  plan: TestPlan | null;
  status: string;
  version: string;
  author: string;
  /** Formatted last save, or null before the first one. */
  updated: string | null;
  onShowRevisions: () => void;
}) {
  const { t } = useTranslation();
  return (
    <aside className="tpw-side" aria-label={t("testPlan.panel.title")}>
      <section className="tpw-card" aria-labelledby="tpw-status-title">
        <h3 id="tpw-status-title" className="tpw-card__title">
          {t("testPlan.panel.title")}
        </h3>
        <dl className="tpw-facts">
          <dt>{t("testPlan.panel.status")}</dt>
          <dd>
            <StatusPill tone={STATUS_TONE[status] ?? "neutral"} dot strike={status === "obsolete"}>
              {t(`testPlan.statusLabel.${status}`)}
            </StatusPill>
          </dd>
          <dt>{t("testPlan.panel.version")}</dt>
          <dd className="t-id">v{version}</dd>
          <dt>{t("testPlan.panel.author")}</dt>
          <dd className="u-truncate" title={author}>
            {author || "—"}
          </dd>
          <dt>{t("testPlan.panel.updated")}</dt>
          <dd>{updated ?? "—"}</dd>
        </dl>
      </section>
      {plan && (
        <section className="tpw-card" aria-labelledby="tpw-revs-title">
          <div className="tpw-card__head">
            <h3 id="tpw-revs-title" className="tpw-card__title">
              {t("testPlan.revisions")}
            </h3>
            <button type="button" className="tpw-link" onClick={onShowRevisions}>
              {t("testPlan.panel.seeAll")}
            </button>
          </div>
          {/* Keyed by the revision: a save adds one. */}
          <RevisionHistory key={plan.revision} planId={plan.id} limit={3} />
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

/** The header's «Revisiones» button. */
export function RevisionsButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="pj-action" onClick={onClick}>
      <History size={16} aria-hidden="true" />
      <span className="pj-action__label">{t("testPlan.revisions")}</span>
    </button>
  );
}

/** One «Importar / Exportar» button with a sectioned menu (SPEC §8): import
 *  .xlsx; export .pdf and .xlsx. A sheet on mobile. */
export function PlanIoMenu({
  onImport,
  onExportPdf,
  onExportXlsx,
}: {
  onImport: () => void;
  onExportPdf: () => void;
  onExportXlsx: () => void;
}) {
  const { t } = useTranslation();
  const mobile = useBreakpoint() === "mobile";
  const menu = usePopover(mobile ? "dialog" : "menu");
  const title = t("testPlan.io.button");
  return (
    <>
      <button type="button" className="pj-action" data-natural="" {...menu.triggerProps}>
        <ArrowDownUp size={16} aria-hidden="true" />
        <span className="pj-action__label">{title}</span>
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
      </ResponsiveMenu>
    </>
  );
}
