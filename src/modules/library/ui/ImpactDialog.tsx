import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import { StatusPill } from "@shared/ui/StatusPill";
import { impactSummary } from "../model/caseRefs";
import type { LibraryImpact } from "../model/types";

const SHOWN = 8;

/** «Guardar … como vN+1» (boceto 3, ADR-0055 §4): how many following cases
 *  the change rewrites, by status, with the approved ones flagged (they go
 *  back to «En revisión», ADR-0049), the list, and the pinned ones that stay. */
export function ImpactDialog({
  name,
  nextVersion,
  impact,
  saving,
  onCancel,
  onConfirm,
}: {
  name: string;
  nextVersion: number;
  impact: LibraryImpact;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [all, setAll] = useState(false);
  const s = impactSummary(impact);
  const shown = all ? s.following : s.following.slice(0, SHOWN);
  const statusLabel = (status: string) =>
    t(`testCase.statusLabel.${status}`, { defaultValue: status });
  return (
    <Dialog
      labelledBy={`${id}-title`}
      describedBy={`${id}-msg`}
      onClose={onCancel}
      dismissable={!saving}
      className="cd lb-impact"
    >
      <h3 id={`${id}-title`} className="cd__title">
        {t("library.impact.title", { name, version: nextVersion })}
      </h3>
      <p id={`${id}-msg`} className="cd__msg">
        {t("library.impact.message", {
          count: s.total,
          name,
          version: nextVersion,
        })}
      </p>
      <div className="lb-counts">
        <div className="lb-count">
          <b>{s.draft}</b>
          <span>{t("library.impact.draft")}</span>
        </div>
        <div className="lb-count">
          <b>{s.reviewed}</b>
          <span>{t("library.impact.reviewed")}</span>
        </div>
        <div className="lb-count" data-warn={s.approved > 0 || undefined}>
          <b>{s.approved}</b>
          <span>{t("library.impact.approved")}</span>
        </div>
      </div>
      {s.approved > 0 && (
        <div className="lb-callout" role="note">
          <b>{t("library.impact.approvedTitle", { count: s.approved })}</b>
          <span>{t("library.impact.approvedHelp")}</span>
        </div>
      )}
      <ul
        className="lb-impact__list"
        aria-label={t("library.impact.listLabel")}
      >
        {shown.map((c) => (
          <li key={c.id} className="lb-impact__case">
            <span>
              <span className="lb-key">{c.scenarioId}</span> · {c.title}
            </span>
            <StatusPill
              tone={
                c.status === "approved"
                  ? "warning"
                  : c.status === "reviewed"
                    ? "info"
                    : "neutral"
              }
            >
              {c.status === "approved"
                ? t("library.impact.toReview")
                : statusLabel(c.status)}
            </StatusPill>
          </li>
        ))}
      </ul>
      {!all && s.following.length > SHOWN && (
        <button
          type="button"
          className="ui-btn ui-btn--small ui-btn--ghost"
          onClick={() => setAll(true)}
        >
          {t("library.impact.showAll", { count: s.following.length - SHOWN })}
        </button>
      )}
      {s.pinned.length > 0 && (
        <p className="lb-muted">
          {t("library.impact.pinned", {
            count: s.pinned.length,
            cases: s.pinned
              .map((c) => `${c.scenarioId} (v${c.version})`)
              .join(", "),
          })}
        </p>
      )}
      <div className="cd__actions">
        <button
          type="button"
          className="cd__cancel"
          onClick={onCancel}
          disabled={saving}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          onClick={onConfirm}
          disabled={saving}
        >
          {t("library.impact.confirm", { count: s.total })}
        </button>
      </div>
    </Dialog>
  );
}
