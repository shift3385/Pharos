import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/ui/Toast";
import { discardRejection, type Rejection } from "../api/syncApi";
import { logSyncFailure } from "../api/syncFailure";

/** «Rechazado por permisos» (SYNC-07, boceto 7): changes the server did not
 *  store because the role does not allow them (the role changed while
 *  offline) or the item is in a workspace the account left. They wait here;
 *  «Descartar» drops them and the server's version comes back. */
export function RejectedList({ items, onResolved }: { items: Rejection[]; onResolved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (items.length === 0) return null;

  async function discard(r: Rejection) {
    setBusy(r.id);
    try {
      await discardRejection(r.id);
      toast(t("workspaces.rejected.discarded"));
      onResolved();
    } catch (e) {
      logSyncFailure(e, "rejection-discard");
      toast(t("workspaces.errors.generic"), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="cp__keys" aria-labelledby="cp-rejected-title">
      <h3 id="cp-rejected-title" className="cp__subtitle">
        {t("workspaces.rejected.title")}
      </h3>
      <ul className="cp__list">
        {items.map((r) => (
          <li key={r.id} className="cp__item" data-testid={`rejected-${r.entityId}`}>
            <div className="cp__item-head">
              <span className="cp__badge">{t(`sync.conflict.entity.${r.entity}`, { defaultValue: r.entity })}</span>
              <span className="cp__name">{r.entityId}</span>
            </div>
            <p className="cp__keyline">{t(`workspaces.rejected.${r.reason}`)}</p>
            <div className="cp__actions">
              <button type="button" className="cp__btn" disabled={busy !== null} onClick={() => void discard(r)}>
                {t("workspaces.rejected.discard")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
