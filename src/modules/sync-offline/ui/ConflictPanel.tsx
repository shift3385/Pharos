import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/ui/Toast";
import { listConflicts, resolveConflict } from "../api/syncApi";
import {
  conflictTitle,
  diffConflict,
  type ConflictResolution,
  type SyncConflict,
} from "../domain/conflict";
import "./ConflictPanel.css";

function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

/** Conflict panel (Phase 8C, spec §9): each entity edited here and on another
 *  device since the last sync, both versions side by side with the differing
 *  fields highlighted. The user keeps one version per entity. */
export function ConflictPanel({
  onClose,
  onResolved,
}: {
  onClose: () => void;
  onResolved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [conflicts, setConflicts] = useState<SyncConflict[] | null>(null);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setConflicts(await listConflicts().catch(() => []));
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function resolve(c: SyncConflict, resolution: ConflictResolution) {
    setBusy(c.id);
    try {
      await resolveConflict(c.id, resolution);
      toast(t("sync.conflict.resolved"));
      await load();
      onResolved();
    } catch (e) {
      console.error("[sync] resolve failed:", e);
      toast(t("sync.conflict.failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div
        className="cp"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cp__head">
          <h2 id="cp-title" className="cp__title">
            {t("sync.conflict.title")}
          </h2>
          <button type="button" className="cp__close" onClick={onClose}>
            {t("sync.conflict.close")}
          </button>
        </header>
        <p className="cp__intro">{t("sync.conflict.intro")}</p>
        <label className="cp__toggle">
          <input
            type="checkbox"
            checked={onlyChanged}
            onChange={(e) => setOnlyChanged(e.target.checked)}
          />
          {t("sync.conflict.onlyChanged")}
        </label>

        {conflicts !== null && conflicts.length === 0 && (
          <p className="cp__empty">{t("sync.conflict.empty")}</p>
        )}

        <ul className="cp__list">
          {conflicts?.map((c) => {
            const rows = diffConflict(c).filter(
              (d) => !onlyChanged || d.changed,
            );
            return (
              <li key={c.id} className="cp__item">
                <div className="cp__item-head">
                  <span className="cp__badge">
                    {t(`sync.conflict.entity.${c.entity}`, {
                      defaultValue: c.entity,
                    })}
                  </span>
                  <span className="cp__name">{conflictTitle(c)}</span>
                </div>
                <table className="cp__table">
                  <thead>
                    <tr>
                      <th scope="col">{t("sync.conflict.field")}</th>
                      <th scope="col">
                        {t("sync.conflict.local")} · r{c.local.revision}
                      </th>
                      <th scope="col">
                        {t("sync.conflict.remote")} · r{c.remote.revision}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(c.local.deleted || c.remote.deleted) && (
                      <tr className="cp__row--changed">
                        <th scope="row">{t("sync.conflict.state")}</th>
                        <td>
                          {c.local.deleted
                            ? t("sync.conflict.deleted")
                            : t("sync.conflict.exists")}
                        </td>
                        <td>
                          {c.remote.deleted
                            ? t("sync.conflict.deleted")
                            : t("sync.conflict.exists")}
                        </td>
                      </tr>
                    )}
                    {rows.map((d) => (
                      <tr
                        key={d.key}
                        className={d.changed ? "cp__row--changed" : undefined}
                      >
                        <th scope="row">
                          {t(`sync.conflict.fields.${d.key}`, {
                            defaultValue: d.key,
                          })}
                        </th>
                        <td>
                          <pre className="cp__value">{show(d.local)}</pre>
                        </td>
                        <td>
                          <pre className="cp__value">{show(d.remote)}</pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="cp__actions">
                  <button
                    type="button"
                    className="cp__btn"
                    disabled={busy !== null}
                    onClick={() => void resolve(c, "local")}
                  >
                    {t("sync.conflict.keepLocal")}
                  </button>
                  <button
                    type="button"
                    className="cp__btn"
                    disabled={busy !== null}
                    onClick={() => void resolve(c, "remote")}
                  >
                    {t("sync.conflict.keepRemote")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
