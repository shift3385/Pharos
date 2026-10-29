import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { aiDestination, type AiResult } from "../api/aiApi";
import { describeAiFailure, type AiFailure } from "../api/structured";
import type { AiDestination, AiProvenance } from "../model/types";
import { AiFailureNotice } from "./AiFailureNotice";
import { ProvenanceBadge } from "./ProvenanceBadge";
import "./Assist.css";

/** "Suggest with AI" for list fields (IA-10: risks, preconditions). Asks the AI
 *  for a validated list, shows it as a checklist and adds only the items the
 *  user keeps. An invalid answer is reported and nothing is added. Disabled
 *  with a tooltip when no AI provider is available. */
export function AiSuggestList<T>({
  available,
  buttonLabel,
  run,
  renderItem,
  provenance,
  onAdd,
  onReview,
}: {
  available: boolean;
  buttonLabel: string;
  /** Builds the request from the current form and calls the generator. */
  run: () => Promise<AiResult<T[]>>;
  renderItem: (item: T) => ReactNode;
  /** Provenance of the field's AI content so far, if any. */
  provenance?: AiProvenance;
  onAdd: (items: T[], provenance: AiProvenance) => void;
  onReview?: () => void;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiResult<T[]> | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [failure, setFailure] = useState<AiFailure | null>(null);
  const [destination, setDestination] = useState<AiDestination | null>(null);

  useEffect(() => {
    if (available) void aiDestination().then(setDestination).catch(() => setDestination(null));
  }, [available]);

  const label = (d: AiDestination) => `${t(`ai.provenance.provider.${d.provider}`)} · ${d.model}`;

  async function suggest() {
    setLoading(true);
    setResult(null);
    setFailure(null);
    try {
      const r = await run();
      setResult(r);
      setSelected(new Set(r.value.map((_, i) => i)));
    } catch (e) {
      setFailure(describeAiFailure(e));
    } finally {
      setLoading(false);
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="assist">
      <ProvenanceBadge provenance={provenance} onReview={onReview} />
      <div className="assist__row">
        <button
          type="button"
          className="assist__btn"
          disabled={!available || loading}
          title={available ? undefined : t("ai.assist.unavailable")}
          onClick={() => void suggest()}
        >
          {loading ? t("ai.structured.thinking") : buttonLabel}
        </button>
        {available && destination && (
          <span className="assist__dest">{t("ai.provenance.destination", { source: label(destination) })}</span>
        )}
      </div>

      {failure && <AiFailureNotice failure={failure} />}

      {result && (
        <div className="assist__preview">
          <span className="assist__preview-label">
            {t("ai.structured.proposals")} · {label(result.provenance)}
          </span>
          <ul className="assist__picklist">
            {result.value.map((item, i) => (
              <li key={i}>
                <label className="assist__pick">
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                  <span>{renderItem(item)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="assist__actions">
            <button
              type="button"
              className="assist__use"
              disabled={selected.size === 0}
              onClick={() => {
                onAdd(
                  result.value.filter((_, i) => selected.has(i)),
                  result.provenance,
                );
                setResult(null);
              }}
            >
              {t("ai.structured.addSelected", { count: selected.size })}
            </button>
            <button type="button" className="assist__discard" onClick={() => setResult(null)}>
              {t("ai.assist.discard")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
