import { useTranslation } from "react-i18next";
import "@shared/ui/ConfirmDialog.css";
import "./Projects.css";

export type ExportPhase = "building" | "zipping" | "done";

/** Non-dismissable modal that reports export progress: a determinate bar while
 *  the .xlsx files are generated, then the ZIP compression percentage. */
export function ExportProgressModal({
  title,
  phase,
  done,
  total,
  label,
  percent,
}: {
  title: string;
  phase: ExportPhase;
  done: number;
  total: number;
  label: string;
  percent: number;
}) {
  const { t } = useTranslation();

  const ratio =
    phase === "zipping"
      ? percent / 100
      : phase === "done"
        ? 1
        : total > 0
          ? done / total
          : 0;

  const status =
    phase === "zipping"
      ? t("projects.exportZipping")
      : phase === "done"
        ? t("projects.exportFinishing")
        : t("projects.exportBuilding", { done, total });

  return (
    <div className="cd-overlay" role="dialog" aria-modal="true">
      <div className="cd">
        <h3 className="cd__title">{title}</h3>
        <div
          className="pj-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio * 100)}
        >
          <div className="pj-progress__bar" style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
        <p className="cd__msg">{status}</p>
        {phase === "building" && label && <p className="pj-progress__file">{label}</p>}
      </div>
    </div>
  );
}
