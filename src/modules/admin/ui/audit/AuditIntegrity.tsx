import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { AuditChain, AuditVerify } from "../../model/audit";
import type { AuditLabels } from "./useAuditLabels";

function relative(at: string | null, lang: string): string {
  if (!at) return "—";
  return new Date(at).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The result of checking the hash chains (ADR-0015): green when every chain
 * verifies, red naming the first broken chain, the event and why. «Ver
 * cadenas» lists each chain (one per device and account; the web is one
 * more); «Ver evento» opens the history of the broken event's element.
 */
export function AuditIntegrity({
  verify,
  checking,
  error,
  labels,
  onCheck,
  onShowEvent,
}: {
  verify: AuditVerify | null;
  checking: boolean;
  error: string | null;
  labels: AuditLabels;
  onCheck: () => void;
  onShowEvent: (chain: AuditChain) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const chains = verify?.chains ?? [];
  const broken = chains.filter((c) => c.broken);
  const events = chains.reduce((n, c) => n + c.count, 0);
  const first = broken[0];
  const tone = error ? "error" : broken.length ? "error" : "success";

  let title: string;
  let detail: string;
  if (error) {
    title = t("admin.audit.integrity.failed");
    detail = error;
  } else if (!verify) {
    title = t("admin.audit.integrity.checking");
    detail = "";
  } else if (first) {
    title = t("admin.audit.integrity.brokenTitle", {
      chain: labels.device(first.deviceId),
      seq: first.broken!.seq,
    });
    const intact = chains.length - broken.length;
    detail = [
      labels.chainBreak(first),
      intact > 0 ? t("admin.audit.integrity.brokenHint", { count: intact }) : t("admin.audit.integrity.noRepair"),
    ].join(" ");
  } else if (chains.length === 0) {
    title = t("admin.audit.integrity.empty");
    detail = t("admin.audit.integrity.emptyHint");
  } else {
    title = t("admin.audit.integrity.okTitle");
    detail = t("admin.audit.integrity.okHint", {
      chains: t("admin.audit.integrity.chainCount", { count: chains.length }),
      count: events,
    });
  }

  const Icon = tone === "success" ? ShieldCheck : ShieldAlert;
  return (
    <section className={`aud-integ aud-integ--${tone}`} data-testid="audit-integrity" aria-live="polite">
      <div className="aud-integ__main">
        <Icon size={20} aria-hidden="true" className="aud-integ__icon" />
        <div className="aud-integ__text">
          <strong>{title}</strong>
          {detail && <span>{detail}</span>}
        </div>
        <div className="aud-integ__actions">
          {first?.broken?.entityId && (
            <button type="button" className="ui-btn ui-btn--small" onClick={() => onShowEvent(first)}>
              {t("admin.audit.integrity.showEvent")}
            </button>
          )}
          {chains.length > 0 && (
            <button
              type="button"
              className="ui-btn ui-btn--small"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? t("admin.audit.integrity.hideChains") : t("admin.audit.integrity.showChains")}
            </button>
          )}
          <button
            type="button"
            className="ui-btn ui-btn--small"
            onClick={onCheck}
            disabled={checking}
            data-testid="audit-verify"
          >
            {checking ? t("admin.audit.integrity.checking") : t("admin.audit.integrity.recheck")}
          </button>
        </div>
      </div>
      {open && (
        <table id={listId} className="aud-chains" aria-label={t("admin.audit.integrity.chainsLabel")}>
          <thead>
            <tr>
              <th scope="col">{t("admin.audit.integrity.cols.chain")}</th>
              <th scope="col">{t("admin.audit.integrity.cols.events")}</th>
              <th scope="col">{t("admin.audit.integrity.cols.state")}</th>
              <th scope="col">{t("admin.audit.integrity.cols.last")}</th>
            </tr>
          </thead>
          <tbody>
            {chains.map((c) => (
              <tr key={`${c.deviceId}|${c.chainWorkspaceId}|${c.chainOwner}`} data-broken={c.broken ? true : undefined}>
                <td>{labels.device(c.deviceId)}</td>
                <td className="u-num">{c.count.toLocaleString(i18n.language)}</td>
                <td className={c.broken ? "aud-bad" : "aud-ok"}>{labels.chainBreak(c)}</td>
                <td>{relative(c.lastAt, i18n.language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
