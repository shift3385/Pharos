// A merge conflict key in words, for the conflict panel and the web dialog
// (SYNC-02, ADR-0051).
import { fieldOf } from "../domain/merge";

/** «Pasos · elemento», «Pasos · orden», «Título»: a key in words. */
export function keyLabel(
  key: string,
  t: (k: string, o?: Record<string, unknown>) => string,
): string {
  const field = fieldOf(key);
  const name = field.startsWith("group:")
    ? t(`sync.conflict.groups.${field.slice(6)}`, {
        defaultValue: field.slice(6),
      })
    : t(`sync.conflict.fields.${field}`, { defaultValue: field });
  if (key.endsWith("@order")) return `${name} · ${t("sync.conflict.order")}`;
  const hash = key.indexOf("#");
  if (hash < 0) return name;
  const sub = key
    .slice(hash + 1)
    .split(".")
    .slice(1)
    .join(".");
  return sub
    ? `${name} · ${t("sync.conflict.element")} · ${t(`sync.conflict.fields.${sub}`, { defaultValue: sub })}`
    : `${name} · ${t("sync.conflict.element")}`;
}
