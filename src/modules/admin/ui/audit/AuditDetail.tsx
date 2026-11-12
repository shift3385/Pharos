import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Copy, History, X } from "lucide-react";
import { Dialog } from "@shared/ui/Dialog";
import { useToast } from "@shared/ui/Toast";
import {
  diffRows,
  isEmptyValue,
  lineDiff,
  summaryEntries,
  valueLines,
  type AuditRow,
} from "../../model/audit";
import type { AuditLabels } from "./useAuditLabels";
import { ActionPill } from "./ActionPill";

/**
 * One audit event (AUD-01): who, when, which element, and its changes field
 * by field: what was there struck through in red, what is there now in green;
 * long texts compare line by line. A create has only «Después», a delete only
 * «Antes». An import, a cascade or an execution shows its counts. A side panel
 * on desktop, a bottom sheet on mobile (CSS).
 */
export function AuditDetail({
  row,
  broken,
  labels,
  onClose,
  onHistory,
}: {
  row: AuditRow;
  broken: boolean;
  labels: AuditLabels;
  onClose: () => void;
  onHistory: (row: AuditRow) => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const titleId = useId();
  const diff = diffRows(row.changes);
  const summary = summaryEntries(row.summary);
  const showBefore = row.action !== "create";
  const showAfter = row.action !== "delete";
  const key = row.entityKey ?? labels.entity(row.entity);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(row, null, 2));
      toast(t("admin.audit.detail.copied"));
    } catch {
      toast(t("admin.audit.detail.copyFailed"), "error");
    }
  };

  const lines = (items: { text: string; changed: boolean }[], side: "old" | "new") =>
    items.length === 0 ? (
      <span className="aud-empty">{t("admin.audit.detail.empty")}</span>
    ) : (
      items.map((l, i) => (
        <span key={i} className={l.changed ? `aud-line aud-line--${side}` : "aud-line"}>
          {side === "old" && l.changed ? <s>{l.text}</s> : l.text}
        </span>
      ))
    );

  return (
    <Dialog labelledBy={titleId} onClose={onClose} className="aud-detail" overlayClassName="aud-detail-overlay">
      <header className="aud-detail__head">
        <h2 id={titleId} className="t-card-title aud-detail__title">
          <ActionPill action={row.action} label={labels.action(row.action)} />
          <span>{key}</span>
        </h2>
        <button type="button" className="ui-iconbtn" onClick={onClose} aria-label={t("common.close")}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <dl className="aud-kv">
        <dt>{t("admin.audit.cols.who")}</dt>
        <dd>
          {labels.actor(row.actor)}
          {row.onBehalfOf && ` · ${t("admin.audit.onBehalfOf", { name: labels.actor(row.onBehalfOf) })}`}
        </dd>
        <dt>{t("admin.audit.cols.when")}</dt>
        <dd>
          <time dateTime={row.at}>{new Date(row.at).toLocaleString(i18n.language, { dateStyle: "long", timeStyle: "medium" })}</time>
        </dd>
        <dt>{t("admin.audit.cols.element")}</dt>
        <dd>
          {labels.entity(row.entity)}
          {row.projectName && ` · ${row.projectName}`}
        </dd>
        <dt>{t("admin.audit.cols.origin")}</dt>
        <dd>{labels.device(row.deviceId)}</dd>
      </dl>

      {row.redactedAt ? (
        <p className="adm-hint">{t("admin.audit.detail.redacted", { date: new Date(row.redactedAt).toLocaleDateString(i18n.language) })}</p>
      ) : diff.length > 0 ? (
        <table className="aud-diff" aria-label={t("admin.audit.detail.diffLabel")}>
          <thead>
            <tr>
              <th scope="col">{t("admin.audit.detail.field")}</th>
              {showBefore && <th scope="col">{t("admin.audit.detail.before")}</th>}
              {showAfter && <th scope="col">{t("admin.audit.detail.after")}</th>}
            </tr>
          </thead>
          <tbody>
            {diff.map((d) => {
              const ld = lineDiff(d.before, d.after);
              return (
                <tr key={d.field}>
                  <th scope="row">{labels.field(d.field)}</th>
                  {showBefore && <td className={isEmptyValue(d.before) ? undefined : "aud-old"}>{lines(ld.before, "old")}</td>}
                  {showAfter && <td className={isEmptyValue(d.after) ? undefined : "aud-new"}>{lines(ld.after, "new")}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : summary.length > 0 ? (
        <dl className="aud-kv aud-kv--summary">
          {summary.map(([k, v]) => (
            <div key={k} className="aud-kv__pair">
              <dt>{t(`admin.audit.summary.${k}`, { defaultValue: k })}</dt>
              <dd>{valueLines(v).join(", ") || "—"}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="adm-hint">{t("admin.audit.detail.noChanges")}</p>
      )}

      <div className={`aud-link${broken ? " aud-link--bad" : ""}`}>
        <strong>{broken ? t("admin.audit.detail.linkBroken") : t("admin.audit.detail.linkOk")}</strong>
        <span>{t("admin.audit.detail.linkWhere", { chain: labels.device(row.deviceId), seq: row.chainSeq })}</span>
        <span className="aud-mono">
          {t("admin.audit.detail.hash", { hash: row.hash.slice(0, 12), prev: row.prevHash ? row.prevHash.slice(0, 12) : "—" })}
        </span>
      </div>

      <div className="aud-detail__actions">
        <button type="button" className="ui-btn ui-btn--small" onClick={() => onHistory(row)}>
          <History size={16} aria-hidden="true" />
          {t("admin.audit.detail.history")}
        </button>
        <button type="button" className="ui-btn ui-btn--small" onClick={() => void copy()}>
          <Copy size={16} aria-hidden="true" />
          {t("admin.audit.detail.copy")}
        </button>
      </div>
    </Dialog>
  );
}
