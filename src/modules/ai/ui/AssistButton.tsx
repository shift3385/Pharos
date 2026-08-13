import { useState } from "react";
import { useTranslation } from "react-i18next";
import { assistDraft } from "../api/aiApi";
import "./Assist.css";

/** "Assist with AI" control: drafts text from the current notes + context and
 *  shows a preview the user can Use or Discard (nothing is applied until Use).
 *  Disabled with a tooltip when no AI provider is available. */
export function AssistButton({
  available,
  instruction,
  notes,
  context,
  onUse,
}: {
  available: boolean;
  instruction: string;
  notes: string;
  context?: string;
  onUse: (text: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<"idle" | "loading">("idle");
  const [draft, setDraft] = useState<string | null>(null);

  async function run() {
    setState("loading");
    setDraft(null);
    try {
      const text = await assistDraft({
        instruction,
        notes,
        context,
        lang: i18n.resolvedLanguage ?? "es",
      });
      setDraft(text || t("ai.assist.empty"));
    } catch {
      setDraft(`⚠ ${t("ai.assist.error")}`);
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="assist">
      <button
        type="button"
        className="assist__btn"
        disabled={!available || state === "loading"}
        title={available ? undefined : t("ai.assist.unavailable")}
        onClick={() => void run()}
      >
        {state === "loading" ? t("ai.assist.drafting") : t("ai.assist.button")}
      </button>

      {draft != null && (
        <div className="assist__preview">
          <span className="assist__preview-label">{t("ai.assist.previewTitle")}</span>
          <p className="assist__draft">{draft}</p>
          <div className="assist__actions">
            <button
              type="button"
              className="assist__use"
              onClick={() => {
                onUse(draft);
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
