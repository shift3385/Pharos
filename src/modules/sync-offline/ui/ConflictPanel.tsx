import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import { useToast } from "@shared/ui/Toast";
import {
  listConflicts,
  listKeyConflicts,
  listRejections,
  resolveConflict,
  type KeyConflict,
  type Rejection,
} from "../api/syncApi";
import { logSyncFailure } from "../api/syncFailure";
import {
  conflictTitle,
  diffConflict,
  mergeInfo,
  type ConflictResolution,
  type SyncConflict,
} from "../domain/conflict";
import { FieldMerge } from "./FieldMerge";
import { KeyConflictList } from "./KeyConflictList";
import { RejectedList } from "./RejectedList";
import "./ConflictPanel.css";

function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

/** Conflict panel (Phase 8C, spec §9): each entity edited here and on another
 *  device since the last sync. Since SYNC-02 (ADR-0051) what does not collide
 *  is already combined, and the person chooses only the keys that do; an
 *  approval against new content, or a conflict without a merge, still shows
 *  both versions side by side to keep one. The whole-entity buttons stay. */
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
  const [keyConflicts, setKeyConflicts] = useState<KeyConflict[]>([]);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setConflicts(
      await listConflicts().catch((e: unknown) => {
        logSyncFailure(e, "conflicts-list");
        return [];
      }),
    );
    setKeyConflicts(
      await listKeyConflicts().catch((e: unknown) => {
        logSyncFailure(e, "key-conflicts-list");
        return [];
      }),
    );
    setRejections(
      await listRejections().catch((e: unknown) => {
        logSyncFailure(e, "rejections-list");
        return [];
      }),
    );
  }

  useEffect(() => {
    void load();
  }, []);

  async function resolve(
    c: SyncConflict,
    resolution: ConflictResolution,
    choices?: Record<string, "local" | "remote">,
  ) {
    setBusy(c.id);
    try {
      await resolveConflict(c.id, resolution, choices);
      toast(t("sync.conflict.resolved"));
      await load();
      onResolved();
    } catch (e) {
      logSyncFailure(e, "conflict-resolve");
      toast(t("sync.conflict.failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      overlayClassName="cp-overlay"
      className="cp"
      labelledBy="cp-title"
      describedBy="cp-intro"
      onClose={onClose}
      dismissable={busy === null}
    >
      <header className="cp__head">
        <h2 id="cp-title" className="cp__title">
          {t("sync.conflict.title")}
        </h2>
        <button type="button" className="cp__close" onClick={onClose}>
          {t("sync.conflict.close")}
        </button>
      </header>
      <p id="cp-intro" className="cp__intro">{t("sync.conflict.intro")}</p>
      <label className="cp__toggle">
        <input
          type="checkbox"
          checked={onlyChanged}
          onChange={(e) => setOnlyChanged(e.target.checked)}
        />
        {t("sync.conflict.onlyChanged")}
      </label>

      <KeyConflictList
        items={keyConflicts}
        onResolved={() => {
          void load();
          onResolved();
        }}
      />

      <RejectedList
        items={rejections}
        onResolved={() => {
          void load();
          onResolved();
        }}
      />

      {conflicts !== null && conflicts.length === 0 && keyConflicts.length === 0 && rejections.length === 0 && (
        <p className="cp__empty" role="status">{t("sync.conflict.empty")}</p>
      )}

      <ul className="cp__list">
        {conflicts?.map((c) => {
          const rows = diffConflict(c).filter(
            (d) => !onlyChanged || d.changed,
          );
          const merge = mergeInfo(c);
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
              {merge && "guard" in merge && (
                <p className="cp__note">
                  {t(`sync.conflict.guard.${merge.guard}`, {
                    defaultValue: t("sync.conflict.guard.other"),
                  })}
                </p>
              )}
              {merge && "conflicts" in merge ? (
                <FieldMerge
                  origins={merge.origins}
                  conflicts={merge.conflicts}
                  busy={busy !== null}
                  onApply={(choices) => void resolve(c, "merged", choices)}
                />
              ) : (
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
              )}
              <div className="cp__actions">
                <button
                  type="button"
                  className="cp__btn"
                  disabled={busy !== null}
                  onClick={() => void resolve(c, "local")}
                >
                  {merge && "conflicts" in merge
                    ? t("sync.conflict.allLocal")
                    : t("sync.conflict.keepLocal")}
                </button>
                <button
                  type="button"
                  className="cp__btn"
                  disabled={busy !== null}
                  onClick={() => void resolve(c, "remote")}
                >
                  {merge && "conflicts" in merge
                    ? t("sync.conflict.allRemote")
                    : t("sync.conflict.keepRemote")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
