import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { fieldOf } from "../domain/merge";
import { keyLabel } from "./keyLabel";
import type { MergeConflictKey } from "../domain/conflict";

// The field-level part of a conflict (SYNC-02, ADR-0051): what was combined
// without asking, and one choice per key that collides. «Aplicar» sends the
// choices; the whole-entity buttons stay next to it in the panel.

type Choice = "local" | "remote";

function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

export function FieldMerge({
  origins,
  conflicts,
  busy,
  onApply,
}: {
  origins: Record<string, string>;
  conflicts: MergeConflictKey[];
  busy: boolean;
  onApply: (choices: Record<string, Choice>) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const colliding = new Set(conflicts.map((c) => fieldOf(c.key)));
  const combined = Object.entries(origins).filter(([k]) => !colliding.has(k));
  const missing = conflicts.filter((c) => !choices[c.key]).length;

  return (
    <div className="cp__merge">
      {combined.length > 0 && (
        <details className="cp__merged">
          <summary>
            {t("sync.conflict.mergedCount", { count: combined.length })}
          </summary>
          <ul>
            {combined.map(([k, o]) => (
              <li key={k}>
                {keyLabel(k, t)}{" "}
                <span className="cp__muted">
                  ({t(`sync.conflict.origin.${o}`)})
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <table className="cp__table">
        <thead>
          <tr>
            <th scope="col">{t("sync.conflict.field")}</th>
            <th scope="col">{t("sync.conflict.local")}</th>
            <th scope="col">{t("sync.conflict.remote")}</th>
          </tr>
        </thead>
        <tbody>
          {conflicts.map((c, i) => {
            const name = `${id}-${i}`;
            const label = keyLabel(c.key, t);
            return (
              <tr
                key={c.key}
                className="cp__row--changed"
                data-testid={`merge-key-${c.key}`}
              >
                <th scope="row">{label}</th>
                {(["local", "remote"] as const).map((side) => (
                  <td key={side}>
                    <label className="cp__pick">
                      <input
                        type="radio"
                        name={name}
                        checked={choices[c.key] === side}
                        onChange={() =>
                          setChoices((s) => ({ ...s, [c.key]: side }))
                        }
                        aria-label={`${label}: ${t(side === "local" ? "sync.conflict.local" : "sync.conflict.remote")}`}
                      />
                      <pre className="cp__value">
                        {show(side === "local" ? c.local : c.remote)}
                      </pre>
                    </label>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="cp__actions">
        <span className="cp__muted" role="status">
          {missing > 0
            ? t("sync.conflict.missing", { count: missing })
            : t("sync.conflict.allChosen")}
        </span>
        <button
          type="button"
          className="cp__btn cp__btn--primary"
          disabled={busy || missing > 0}
          onClick={() => onApply(choices)}
        >
          {t("sync.conflict.apply")}
        </button>
      </div>
    </div>
  );
}
