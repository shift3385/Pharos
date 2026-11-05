import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileBarChart } from "lucide-react";
import { StatusReportDialog } from "./StatusReportDialog";
import "@shared/ui/buttons.css";

/** «Informe de estado» (EJE-03): the button and its dialog. In «Ejecuciones»
 *  it opens on the whole project; in a cycle, on that cycle. Works on the web
 *  too (the server derives the same summary). */
export function StatusReportButton({
  projectId,
  projectName,
  cycleId,
}: {
  projectId: string;
  projectName: string;
  cycleId?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ui-btn"
        data-testid={cycleId ? "cycle-report" : "runs-report"}
        onClick={() => setOpen(true)}
      >
        <FileBarChart size={16} aria-hidden="true" />
        <span className="ui-btn__text">{t("statusReport.open")}</span>
      </button>
      {open && (
        <StatusReportDialog
          projectId={projectId}
          projectName={projectName}
          initialCycleId={cycleId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
