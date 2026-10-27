import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { aiDestination, assistDraft } from "../api/aiApi";
import type { AiDestination, AiProvenance } from "../model/types";
import { ProvenanceBadge } from "./ProvenanceBadge";
import "./Assist.css";

/** "Assist with AI" control: drafts text from the current notes + context and
 *  shows a preview the user can Use or Discard (nothing is applied until Use).
 *  Disabled with a tooltip when no AI provider is available. It says which
 *  provider the notes go to before sending, and once a draft is used the field
 *  shows "AI · pending review" until a person marks it reviewed (IA-01). */
export function AssistButton({
  available,
  instruction,
  notes,
  context,
  provenance,
  onUse,
  onReview,
}: {
  available: boolean;
  instruction: string;
  notes: string;
  context?: string;
  /** Provenance of the field's current content, if it came from the AI. */
  provenance?: AiProvenance;
  onUse: (text: string, provenance: AiProvenance) => void;
  onReview?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<"idle" | "loading">("idle");
  const [draft, setDraft] = useState<{ text: string; provenance: AiProvenance } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [destination, setDestination] = useState<AiDestination | null>(null);

  useEffect(() => {
    if (available) void aiDestination().then(setDestination).catch(() => setDestination(null));
  }, [available]);

  const label = (d: AiDestination) => `${t(`ai.provenance.provider.${d.provider}`)} · ${d.model}`;

  async function run() {
    setState("loading");
    setDraft(null);
    setMessage(null);
    try {
      const result = await assistDraft({
        instruction,
        notes,
        context,
        lang: i18n.resolvedLanguage ?? "es",
      });
      if (result.value) setDraft({ text: result.value, provenance: result.provenance });
      else setMessage(t("ai.assist.empty"));
    } catch {
      setMessage(`⚠ ${t("ai.assist.error")}`);
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="assist">
      <ProvenanceBadge provenance={provenance} onReview={onReview} />
      <div className="assist__row">
        <button
          type="button"
          className="assist__btn"
          disabled={!available || state === "loading"}
          title={available ? undefined : t("ai.assist.unavailable")}
          onClick={() => void run()}
        >
          {state === "loading" ? t("ai.assist.drafting") : t("ai.assist.button")}
        </button>
        {available && destination && (
          <span className="assist__dest">{t("ai.provenance.destination", { source: label(destination) })}</span>
        )}
      </div>

      {message && <p className="assist__message">{message}</p>}

      {draft && (
        <div className="assist__preview">
          <span className="assist__preview-label">
            {t("ai.assist.previewTitle")} · {label(draft.provenance)}
          </span>
          <p className="assist__draft">{draft.text}</p>
          <div className="assist__actions">
            <button
              type="button"
              className="assist__use"
              onClick={() => {
                onUse(draft.text, draft.provenance);
                setDraft(null);
              }}
            >
              {t("ai.assist.use")}
            </button>
            <button type="button" className="assist__discard" onClick={() => setDraft(null)}>
              {t("ai.assist.discard")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
