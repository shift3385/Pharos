import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileCheck2 } from "lucide-react";
import { CompletionReportDialog } from "./CompletionReportDialog";
import "@shared/ui/buttons.css";

/** «Informe de cierre» (DOC-01): the button of a closed cycle and its
 *  dialog. The cycle's detail shows it where «Cerrar ciclo…» was. */
export function CompletionReportButton({
  projectId,
  projectName,
  projectPrefix,
  cycleId,
}: {
  projectId: string;
  projectName: string;
  projectPrefix: string | null;
  cycleId: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ui-btn ui-btn--primary"
        data-testid="cycle-completion-report"
        onClick={() => setOpen(true)}
      >
        <FileCheck2 size={16} aria-hidden="true" />
        <span className="ui-btn__text">{t("completionReport.open")}</span>
      </button>
      {open && (
        <CompletionReportDialog
          projectId={projectId}
          projectName={projectName}
          projectPrefix={projectPrefix}
          cycleId={cycleId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
