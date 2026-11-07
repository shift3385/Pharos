import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import type { AiResult } from "../api/aiApi";
import { describeAiFailure, type AiFailure } from "../api/structured";
import type { AiProvenance } from "../model/types";
import { AiFailureNotice } from "./AiFailureNotice";
import { ProvenanceBadge } from "./ProvenanceBadge";
import "./Assist.css";

/** "Suggest with AI" for list fields (IA-10: risks; IA-16: the lists of a case).
 *  Asks the AI for a validated list, shows it as a checklist and adds only the
 *  items the user keeps. An invalid answer is reported and nothing is added.
 *  Disabled with a tooltip when no AI provider is available. */
export function AiSuggestList<T>({
  available,
  buttonLabel,
  run,
  renderItem,
  provenance,
  onAdd,
  onReview,
  blockedReason,
  startsSelected = () => true,
  applyLabel,
  iconOnly = false,
}: {
  available: boolean;
  buttonLabel: string;
  /** Why there is nothing to ask right now, although the AI is available. */
  blockedReason?: string;
  /** Builds the request from the current form and calls the generator. */
  run: () => Promise<AiResult<T[]>>;
  renderItem: (item: T) => ReactNode;
  /** Provenance of the field's AI content so far, if any. */
  provenance?: AiProvenance;
  onAdd: (items: T[], provenance: AiProvenance) => void;
  onReview?: () => void;
  /** Whether a proposal starts ticked: one that changes what the user wrote can
   *  wait for an explicit tick (IA-16). All of them, by default. */
  startsSelected?: (item: T) => boolean;
  /** The apply button, when it does more than add. */
  applyLabel?: (count: number) => string;
  /** Only the icon, with `buttonLabel` for assistive technology and the tooltip,
   *  as in `AssistButton`. While it works, it also says so. */
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiResult<T[]> | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [failure, setFailure] = useState<AiFailure | null>(null);

  // Each request has a number; Cancel moves it on, so a late answer is ignored
  // (the call itself keeps running until it ends or times out).
  const request = useRef(0);

  async function suggest() {
    const id = ++request.current;
    setLoading(true);
    setResult(null);
    setFailure(null);
    try {
      const r = await run();
      if (id !== request.current) return;
      setResult(r);
      setSelected(new Set(r.value.flatMap((item, i) => (startsSelected(item) ? [i] : []))));
    } catch (e) {
      if (id !== request.current) return;
      setFailure(describeAiFailure(e));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  function cancel() {
    request.current++;
    setLoading(false);
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
      <div className="assist__row">
        <button
          type="button"
          className={iconOnly ? "assist__btn assist__btn--icon" : "assist__btn"}
          disabled={!available || loading || Boolean(blockedReason)}
          aria-busy={loading}
          title={available ? (blockedReason ?? (iconOnly ? buttonLabel : undefined)) : t("ai.assist.unavailable")}
          onClick={() => void suggest()}
        >
          <Sparkles size={16} className={loading ? "assist__spark" : undefined} aria-hidden="true" />
          {loading ? (
            t("ai.structured.thinking")
          ) : iconOnly ? (
            <span className="sr-only">{buttonLabel}</span>
          ) : (
            buttonLabel
          )}
        </button>
        {loading && (
          <button type="button" className="assist__discard" onClick={cancel}>
            {t("common.cancel")}
          </button>
        )}
        <ProvenanceBadge provenance={provenance} onReview={onReview} />
      </div>

      {failure && <AiFailureNotice failure={failure} />}

      {result && (
        <div className="assist__preview">
          <span className="assist__preview-label">{t("ai.structured.proposals")}</span>
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
              {applyLabel?.(selected.size) ?? t("ai.structured.addSelected", { count: selected.size })}
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
