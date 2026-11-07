import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { assistDraft } from "../api/aiApi";
import type { AiProvenance } from "../model/types";
import { ProvenanceBadge } from "./ProvenanceBadge";
import "./Assist.css";

/** "Assist with AI" control: drafts text from the current notes + context and
 *  shows a preview the user can Use or Discard (nothing is applied until Use).
 *  Disabled with a tooltip when no AI provider is available. Once it is used
 *  the field shows "AI · pending review" until a person marks it reviewed (IA-01). */
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
          className="assist__btn assist__btn--icon"
          disabled={!available || state === "loading"}
          aria-busy={state === "loading"}
          title={available ? t("ai.assist.button") : t("ai.assist.unavailable")}
          onClick={() => void run()}
        >
          <Sparkles size={16} className={state === "loading" ? "assist__spark" : undefined} aria-hidden="true" />
          {state === "loading" ? (
            <span>{t("ai.assist.drafting")}</span>
          ) : (
            <span className="sr-only">{t("ai.assist.button")}</span>
          )}
        </button>
      </div>

      {message && <p className="assist__message">{message}</p>}

      {draft && (
        <div className="assist__preview">
          <span className="assist__preview-label">{t("ai.assist.previewTitle")}</span>
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
