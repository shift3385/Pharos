import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/ui/Toast";
import { resolveKeyConflict, type KeyConflict } from "../api/syncApi";

/** Rows that lost their key to another document of the project (DAT-01,
 *  ADR-0010): each has a provisional key until the user types a new one or
 *  takes the next number. A definitive key is never renamed on its own. */
export function KeyConflictList({
  items,
  onResolved,
}: {
  items: KeyConflict[];
  onResolved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function resolve(k: KeyConflict, key?: string) {
    setBusy(k.id);
    try {
      const assigned = await resolveKeyConflict(k.id, key);
      toast(t("sync.conflict.key.assigned", { key: assigned }));
      onResolved();
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      toast(
        reason === "no-key-block"
          ? t("sync.conflict.key.noBlock")
          : t("sync.conflict.key.failed", { reason }),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="cp__keys" aria-labelledby="cp-keys-title">
      <h3 id="cp-keys-title" className="cp__subtitle">
        {t("sync.conflict.key.title")}
      </h3>
      <p className="cp__intro">{t("sync.conflict.key.intro")}</p>
      <ul className="cp__list">
        {items.map((k) => {
          const value = typed[k.id] ?? "";
          return (
            <li key={k.id} className="cp__item">
              <div className="cp__item-head">
                <span className="cp__badge">
                  {t(`sync.conflict.entity.${k.entity}`, { defaultValue: k.entity })}
                </span>
                <span className="cp__name">{k.title}</span>
              </div>
              <p className="cp__keyline">
                {t("sync.conflict.key.lost", { key: k.lostKey })} ·{" "}
                {t("sync.conflict.key.current", { key: k.currentKey })}
              </p>
              <div className="cp__actions">
                <input
                  className="cp__input"
                  aria-label={t("sync.conflict.key.placeholder")}
                  placeholder={t("sync.conflict.key.placeholder")}
                  value={value}
                  onChange={(e) => setTyped((s) => ({ ...s, [k.id]: e.target.value }))}
                />
                <button
                  type="button"
                  className="cp__btn"
                  disabled={busy !== null || !value.trim()}
                  onClick={() => void resolve(k, value.trim())}
                >
                  {t("sync.conflict.key.use")}
                </button>
                <button
                  type="button"
                  className="cp__btn"
                  disabled={busy !== null}
                  onClick={() => void resolve(k)}
                >
                  {t("sync.conflict.key.next")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
