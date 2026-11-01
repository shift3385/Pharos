import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import { needsResolution } from "../model/lifecycle";
import { DEFECT_RESOLUTIONS, type Defect, type DefectResolution, type DefectStatus } from "../model/types";

/**
 * Confirms a status change the board cannot make alone: closing or rejecting
 * asks for the resolution (and, closing, the build with the fix); a drop on
 * «Otros» asks whether it is rejected or deferred.
 */
export function TransitionDialog({
  defect,
  statuses,
  onApply,
  onCancel,
}: {
  defect: Defect;
  /** The statuses the drop may mean (one or two). */
  statuses: DefectStatus[];
  onApply: (status: DefectStatus, resolution: DefectResolution | null, fixedInBuild: string | null) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [status, setStatus] = useState<DefectStatus>(statuses[0]);
  const [resolution, setResolution] = useState<DefectResolution | "">(
    status === "closed" ? "fixed" : "",
  );
  const [build, setBuild] = useState(defect.fixedInBuild ?? "");
  const needs = needsResolution(status);
  const ready = !needs || resolution !== "";
  const title =
    status === "rejected"
      ? t("defects.resolutionDialog.rejectTitle", { key: defect.defectKey })
      : status === "closed"
        ? t("defects.resolutionDialog.title", { key: defect.defectKey })
        : t("defects.board.chooseStatus", { title: defect.title });

  return (
    <Dialog labelledBy={`${id}-title`} describedBy={`${id}-msg`} onClose={onCancel} className="cd df-transition">
      <h3 id={`${id}-title`} className="cd__title">
        {title}
      </h3>
      <p id={`${id}-msg`} className="cd__msg">
        {t("defects.resolutionDialog.message", {
          title: defect.title,
          status: t(`defects.status.${status}`),
        })}
      </p>
      {statuses.length > 1 && (
        <fieldset className="df-transition__choice">
          <legend className="sr-only">{t("defects.field.status")}</legend>
          {statuses.map((s) => (
            <label key={s} className="df-transition__option">
              <input
                type="radio"
                name={`${id}-status`}
                checked={status === s}
                onChange={() => {
                  setStatus(s);
                  if (!needsResolution(s)) setResolution("");
                }}
              />
              {t(`defects.status.${s}`)}
            </label>
          ))}
        </fieldset>
      )}
      {needs && (
        <label className="tp-field">
          <span>{t("defects.resolution.label")}</span>
          <select
            value={resolution}
            required
            onChange={(e) => setResolution(e.target.value as DefectResolution | "")}
          >
            <option value="">{t("defects.resolution.none")}</option>
            {DEFECT_RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {t(`defects.resolution.${r}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      {status === "closed" && (
        <label className="tp-field">
          <span>{t("defects.resolutionDialog.fixedInBuild")}</span>
          <input value={build} maxLength={200} onChange={(e) => setBuild(e.target.value)} />
        </label>
      )}
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel}>
          {t("defects.resolutionDialog.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          disabled={!ready}
          onClick={() => onApply(status, resolution || null, status === "closed" ? build.trim() || null : null)}
        >
          {t("defects.resolutionDialog.confirm")}
        </button>
      </div>
    </Dialog>
  );
}
